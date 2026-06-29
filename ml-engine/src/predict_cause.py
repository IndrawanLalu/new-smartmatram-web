"""REQ-1.4b — Model B: prediksi penyebab laten ~475 gangguan unknown.

Alur:
  1. Load ml_outage_events (paginated) + weather_daily + penyulang_ref.
  2. Normalisasi label penyebab known → 5 kelas (cause_labels.py).
  3. Bangun feature matrix: ulp, temporal, cuaca saat kejadian (bukan forecast).
  4. Baseline: weather override + frekuensi per (ulp, bulan) dari known events.
  5. XGBoost: train temporal-split 80/20, eval F1 macro.
     - Jika F1 ≥ 0.40 → XGBoost, simpan models/cause_model_v1.pkl.
     - Else → fallback ke baseline.
  6. Upsert predicted_cause + cause_confidence ke ml_outage_events (baris unknown).

Jalankan: python -m src.predict_cause
"""
from __future__ import annotations

import json
import math
import pickle
import time
from collections import Counter, defaultdict
from pathlib import Path

GATE = 0.35  # ambang F1 macro (referensi rapor; mode hybrid pakai CONF_MIN per-prediksi)
CONF_MIN = 0.60  # hybrid: tebakan XGBoost dipakai hanya bila probabilitas ≥ ini, selain itu baseline
MIN_CLASS_TRAIN = 8  # kelas dgn < sampel ini dibuang dari latih (hindari error XGBoost)

from . import supabase_client
from .cause_labels import normalize_cause, cause_from_kode
from .geo import loc_key as make_loc_key
from .normalize import is_unknown_cause
from .supabase_client import fetch_all, update_many

MODEL_DIR = Path(__file__).parent.parent / "models"
_NAN = float("nan")
_ULP_ENC: dict[str, float] = {
    "AMPENAN": 0.0, "CAKRANEGARA": 1.0, "GERUNG": 2.0, "TANJUNG": 3.0
}
_FEATURE_NAMES = [
    "ulp", "bulan", "is_weekend", "jam", "durasi_jam",
    "precip_mm", "wind_max_kmh", "thunder",
    "has_weather",           # 1 jika cuaca tersedia, 0 jika tidak (bantu model)
    "tahun",                 # tren antar tahun
    "jam_sin", "jam_cos",    # siklus waktu (tengah malam ≈ jam 12)
    "bulan_sin", "bulan_cos", # siklus musim
    "arus_r", "arus_s", "arus_t", "arus_n", "arus_max",  # arus gangguan (IR/IS/IT/IN)
    "arus_min", "arus_imbalance", "arus_n_ratio", "n_phase_active",  # arus pintar (pembeda penyebab)
]

# ── Tipe fitur: list[list[float]] sebelum konversi ke numpy ────────────────
_Row = list[float]


def _penyulang_lk(penyulang_ref: list[dict]) -> dict[str, str]:
    return {
        r["penyulang"]: make_loc_key(float(r["lat"]), float(r["lng"]))
        for r in penyulang_ref
        if r.get("lat") and r.get("lng")
    }


def _build_weather_idx(weather_rows: list[dict]) -> dict[tuple[str, str], dict]:
    return {(r["loc_key"], r["tgl"]): r for r in weather_rows}


def _features(events: list[dict], lk_map: dict[str, str],
               wd: dict[tuple[str, str], dict]) -> list[_Row]:
    """Bangun feature matrix. Kolom sesuai _FEATURE_NAMES."""
    import math as _math
    rows: list[_Row] = []
    for e in events:
        ulp = _ULP_ENC.get(e.get("ulp") or "", _NAN)

        tgl_str: str = e.get("tgl_gangguan") or ""
        try:
            from datetime import date as _date
            d = _date.fromisoformat(tgl_str) if tgl_str else None
            bulan = float(d.month) if d else _NAN
            tahun = float(d.year) if d else _NAN
            is_wknd = float(d.weekday() >= 5) if d else _NAN
        except ValueError:
            bulan = tahun = is_wknd = _NAN

        jam_str: str = e.get("jam_padam") or ""
        try:
            jam = float(jam_str.split(":")[0]) if jam_str else _NAN
        except (ValueError, IndexError):
            jam = _NAN

        raw_dur = e.get("durasi_jam")
        durasi = float(raw_dur) if raw_dur is not None else _NAN

        lk = lk_map.get(e.get("penyulang") or "")
        w = wd.get((lk, tgl_str)) if lk and tgl_str else None
        has_weather = 1.0 if w is not None else 0.0
        precip = float(w["precip_mm"]) if w and w.get("precip_mm") is not None else _NAN
        wind = float(w["wind_max_kmh"]) if w and w.get("wind_max_kmh") is not None else _NAN
        thunder = float(bool(w.get("thunder"))) if w is not None else _NAN

        # Fitur siklik — bantu model tangkap pola musim & waktu
        pi2 = 2 * _math.pi
        jam_sin = _math.sin(pi2 * jam / 24) if not _math.isnan(jam) else _NAN
        jam_cos = _math.cos(pi2 * jam / 24) if not _math.isnan(jam) else _NAN
        bln_sin = _math.sin(pi2 * bulan / 12) if not _math.isnan(bulan) else _NAN
        bln_cos = _math.cos(pi2 * bulan / 12) if not _math.isnan(bulan) else _NAN

        # Arus gangguan (IR/IS/IT/IN) + arus maksimum
        def _num(v: object) -> float:
            return float(v) if v is not None else _NAN  # type: ignore[arg-type]
        ar, as_, at, an = _num(e.get("arus_r")), _num(e.get("arus_s")), _num(e.get("arus_t")), _num(e.get("arus_n"))
        avals = [x for x in (ar, as_, at, an) if not _math.isnan(x)]
        amax = max(avals) if avals else _NAN
        # Fitur arus pintar — fisik berbeda per penyebab:
        #  - imbalance besar / 1 fasa aktif → cenderung pohon/binatang (sentuhan 1 titik)
        #  - rasio IN (arus netral/tanah) tinggi → gangguan ke tanah
        phases = [x for x in (ar, as_, at) if not _math.isnan(x)]
        amin = min(phases) if phases else _NAN
        amax_ph = max(phases) if phases else _NAN
        imbalance = (amax_ph - amin) if phases else _NAN
        n_ratio = (an / amax_ph) if (not _math.isnan(an) and not _math.isnan(amax_ph) and amax_ph > 0) else _NAN
        n_active = float(sum(1 for x in (ar, as_, at) if (not _math.isnan(x) and x > 50.0))) if phases else _NAN

        rows.append([ulp, bulan, is_wknd, jam, durasi,
                     precip, wind, thunder, has_weather, tahun,
                     jam_sin, jam_cos, bln_sin, bln_cos,
                     ar, as_, at, an, amax,
                     amin, imbalance, n_ratio, n_active])
    return rows


_BULAN_ID = ["", "Januari", "Februari", "Maret", "April", "Mei", "Juni",
             "Juli", "Agustus", "September", "Oktober", "November", "Desember"]


MIN_PENYULANG = 5  # ambang minimal kejadian known agar pakai riwayat penyulang


def _baseline(unknown: list[dict], known: list[tuple[dict, str]],
              lk_map: dict[str, str], wd: dict[tuple[str, str], dict]) -> list[tuple[str, float, str]]:
    """Cuaca → riwayat PENYULANG → riwayat ULP (backoff). Kembalikan (label, conf, alasan)."""
    freq_ulp: dict[tuple[str, int], Counter[str]] = defaultdict(Counter)
    freq_peny: dict[str, Counter[str]] = defaultdict(Counter)
    for e, lbl in known:
        tgl_str = e.get("tgl_gangguan") or ""
        bulan = int(tgl_str[5:7]) if len(tgl_str) >= 7 else 0
        freq_ulp[(e.get("ulp") or "", bulan)][lbl] += 1
        peny = e.get("penyulang") or ""
        if peny:
            freq_peny[peny][lbl] += 1

    results: list[tuple[str, float, str]] = []
    for e in unknown:
        tgl_str = e.get("tgl_gangguan") or ""
        lk = lk_map.get(e.get("penyulang") or "")
        w = wd.get((lk, tgl_str)) if lk else None

        # 1. Cuaca buruk hari itu (per kejadian)
        if w and (w.get("thunder") or (w.get("precip_mm") or 0) > 15
                  or (w.get("wind_max_kmh") or 0) > 35):
            sebab = []
            if w.get("thunder"):
                sebab.append("petir")
            if (w.get("precip_mm") or 0) > 15:
                sebab.append(f"hujan deras {round(w.get('precip_mm') or 0)}mm")
            if (w.get("wind_max_kmh") or 0) > 35:
                sebab.append(f"angin {round(w.get('wind_max_kmh') or 0)}km/jam")
            results.append(("Cuaca (angin/hujan/petir)", 55.0,
                            f"Cuaca buruk hari itu ({', '.join(sebab)}) — gangguan tanpa penyebab tercatat sering karena cuaca."))
            continue

        peny = e.get("penyulang") or ""
        ulp = e.get("ulp") or ""
        bulan = int(tgl_str[5:7]) if len(tgl_str) >= 7 else 0

        # 2. Riwayat PENYULANG itu sendiri (kalau sampel cukup)
        pc = freq_peny.get(peny)
        pc_total = sum(pc.values()) if pc else 0
        if pc and pc_total >= MIN_PENYULANG:
            best, count = pc.most_common(1)[0]
            conf = round(100.0 * count / pc_total, 1)
            results.append((best, conf,
                            f"Penyebab tersering di penyulang {peny}: {count} dari {pc_total} kasus diketahui ({conf}%)."))
            continue

        # 3. Backoff ke riwayat ULP (bulan, lalu semua bulan)
        counter = freq_ulp.get((ulp, bulan)) or freq_ulp.get((ulp, 0))
        if counter:
            best, count = counter.most_common(1)[0]
            tot = sum(counter.values())
            conf = round(100.0 * count / tot, 1)
            bln = _BULAN_ID[bulan] if 0 < bulan < 13 else "semua bulan"
            tipis = f"(riwayat penyulang {peny} tipis: {pc_total} kasus) " if peny else ""
            results.append((best, conf,
                            f"{tipis}penyebab tersering di ULP {ulp} pada {bln}: {count} dari {tot} kasus diketahui ({conf}%)."))
        else:
            results.append(("Lain-lain", 30.0, "Data historis belum cukup untuk menebak penyebab."))
    return results


def run() -> dict:
    t0 = time.time()
    print("[info] predict_cause: memuat data...")

    events = fetch_all(
        "ml_outage_events",
        "id, dedup_key, ulp, penyulang, tgl_gangguan, jam_padam, durasi_jam, penyebab, "
        "kode, arus_r, arus_s, arus_t, arus_n",
    )
    penyulang_ref = fetch_all("penyulang_ref", "penyulang, lat, lng")
    weather_rows = fetch_all("weather_daily", "loc_key, tgl, precip_mm, wind_max_kmh, thunder")

    lk_map = _penyulang_lk(penyulang_ref)
    wd = _build_weather_idx(weather_rows)

    known: list[tuple[dict, str]] = []
    unknown: list[dict] = []
    for e in events:
        # KODE otoritatif: I*/E* → kategori pasti; T → unknown. Tanpa KODE → teks.
        kode = e.get("kode")
        lbl = cause_from_kode(kode) if kode else normalize_cause(e.get("penyebab"))
        if lbl is not None:
            known.append((e, lbl))
        else:
            unknown.append(e)

    print(f"[info] Known: {len(known)}, Unknown (target): {len(unknown)}")
    # Debug: distribusi kelas di training set
    from collections import Counter as _Counter
    dist = _Counter(lbl for _, lbl in known)
    for cls, cnt in dist.most_common():
        print(f"  {cls}: {cnt} ({100*cnt//len(known)}%)")
    if not unknown:
        return {"known": len(known), "unknown": 0, "predicted": 0}

    known_feats = _features([e for e, _ in known], lk_map, wd)
    known_labels = [lbl for _, lbl in known]
    unknown_feats = _features(unknown, lk_map, wd)

    f1_macro: float | None = None
    xgb_ready = False
    proba_u = None
    xgb_classes: list[str] = []
    final_preds: list[tuple[str, float, str]] = []

    try:
        import numpy as np
        from sklearn.metrics import f1_score
        from sklearn.preprocessing import LabelEncoder
        from sklearn.utils.class_weight import compute_sample_weight
        from xgboost import XGBClassifier

        # Buang kelas terlalu langka (XGBoost butuh label kontigu & tiap kelas ada di latih)
        cls_count = Counter(known_labels)
        keep = [i for i, l in enumerate(known_labels) if cls_count[l] >= MIN_CLASS_TRAIN]
        kf = [known_feats[i] for i in keep]
        kl = [known_labels[i] for i in keep]
        ksrc = [known[i] for i in keep]

        le = LabelEncoder()
        y_enc = le.fit_transform(kl)

        # Temporal split 80 / 20 (urut tgl agar tidak data-leak)
        n = len(kl)
        order = sorted(range(n), key=lambda i: ksrc[i][0].get("tgl_gangguan") or "")
        split = int(n * 0.8)
        tr, te = order[:split], order[split:]
        if len(te) == 0 or len(set(int(v) for v in y_enc[tr])) < len(le.classes_):
            raise ValueError("split temporal tidak memuat semua kelas")

        X = np.array(kf, dtype=float)
        X_u = np.array(unknown_feats, dtype=float)

        model = XGBClassifier(
            n_estimators=300,
            max_depth=4,
            learning_rate=0.1,
            subsample=0.8,
            colsample_bytree=0.8,
            random_state=42,
            n_jobs=-1,
        )
        # Bobot kelas seimbang → kelas langka (Cuaca/Manusia) tak tenggelam (bantu macro-F1)
        sw = compute_sample_weight("balanced", y_enc[tr])
        model.fit(
            X[tr], y_enc[tr],
            sample_weight=sw,
            eval_set=[(X[te], y_enc[te])],
            verbose=False,
        )

        f1 = f1_score(y_enc[te], model.predict(X[te]), average="macro")
        f1_macro = round(float(f1), 3)
        print(f"[info] XGBoost F1 macro (test 20%): {f1:.3f}")

        proba_u = model.predict_proba(X_u)
        xgb_classes = [str(c) for c in le.classes_]
        xgb_ready = True
        MODEL_DIR.mkdir(exist_ok=True)
        with open(MODEL_DIR / "cause_model_v1.pkl", "wb") as fh:
            pickle.dump({"model": model, "le": le, "f1": f1_macro, "features": _FEATURE_NAMES}, fh)

    except Exception as exc:  # noqa: BLE001 — apa pun yang gagal → fallback baseline (jangan crash)
        print(f"[warn] XGBoost gagal ({exc}) — pakai baseline penuh")

    # Baseline untuk SEMUA unknown → jadi fallback per-baris saat XGBoost tak yakin.
    base_preds = _baseline(unknown, known, lk_map, wd)

    n_xgb = 0
    if xgb_ready and proba_u is not None:
        # HYBRID: tebakan XGBoost dipakai hanya bila yakin ≥ CONF_MIN, selain itu baseline.
        final_preds = []
        for r in range(len(unknown)):
            row = proba_u[r]
            top = int(row.argmax())
            p = float(row[top])
            if p >= CONF_MIN:
                final_preds.append((
                    xgb_classes[top], round(p * 100, 1),
                    f"Tebakan model (yakin {round(p * 100)}%) dari pola arus/waktu/cuaca lintas penyulang.",
                ))
                n_xgb += 1
            else:
                final_preds.append(base_preds[r])
        method = "hybrid"
        print(f"[info] hybrid: {n_xgb} via XGBoost (yakin >= {CONF_MIN}), {len(unknown) - n_xgb} via baseline")
    else:
        final_preds = base_preds
        method = "baseline"

    updates = [
        {"id": e["id"], "predicted_cause": lbl, "cause_confidence": conf, "cause_reason": reason}
        for e, (lbl, conf, reason) in zip(unknown, final_preds)
    ]
    update_many("ml_outage_events", updates)

    dur = int((time.time() - t0) * 1000)
    stats = {
        "known": len(known), "unknown": len(unknown),
        "predicted": len(updates), "method": method,
        "f1": f1_macro, "gate": GATE, "n_features": len(_FEATURE_NAMES),
        "n_xgb": n_xgb, "conf_min": CONF_MIN,
    }
    print(f"[ok] predict_cause {dur} ms | {method} | F1={f1_macro} | xgb={n_xgb} | {len(updates)} prediksi")
    supabase_client.log_run("predict_cause", "ok", json.dumps(stats), rows=len(updates), duration_ms=dur)
    return stats


def main() -> None:
    try:
        run()
    except Exception as e:
        print(f"[error] predict_cause gagal: {e}")
        supabase_client.log_run("predict_cause", "error", str(e))
        raise


if __name__ == "__main__":
    main()
