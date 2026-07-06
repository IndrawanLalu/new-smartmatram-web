"""Backtest rule-v1 (Model A): prediksi risiko vs gangguan NYATA.

Replay leak-free: fitur riwayat gangguan + cuaca dihitung point-in-time (hanya
data SEBELUM tanggal evaluasi). Fitur inspeksi dinolkan (status tak bisa
direkonstruksi historis) → menguji inti model (riwayat + cuaca).

Dua bagian:
  (1) Agregat rolling mingguan: outage-rate per level + lift + precision/recall.
  (2) Kasus nyata (outage-centric): untuk tiap gangguan, apakah model sudah
      menandai bahaya (kritis/waspada) dalam <=LEAD_MAX hari sebelumnya?

Hasil ditulis ke ml_run_log (job=backtest) → dibaca halaman Cara Kerja ML.

Dipakai: `python -m src.backtest_risk` (manual) atau `run()` dari pipeline nightly.
"""
from __future__ import annotations

import json
from collections import Counter, defaultdict
from datetime import date, timedelta

from . import geo, score_risk, supabase_client

EVAL_START = date(2025, 1, 1)
EVAL_END = date.today()  # otomatis ikut data terbaru yang sudah di-sync pipeline
STEP_DAYS = 7          # agregat: evaluasi tiap minggu
HORIZONS = [1, 3, 7]   # agregat: cek gangguan dalam N hari ke depan
LEAD_MAX = 3           # kasus: model dianggap "menandai" bila flag dalam 0..LEAD_MAX hari sebelum gangguan
CASES_KEEP = 40        # jumlah kasus terbaru yang disimpan utk ditampilkan
RAIN_MM, RAIN_W = 5.0, 30.0


def _to_date(s):
    try:
        return date.fromisoformat(s[:10])
    except (ValueError, TypeError):
        return None


def _bad(w):
    return (w.get("precip_mm") or 0) >= RAIN_MM or (w.get("wind_max_kmh") or 0) >= RAIN_W


def _features(pen, meta, target, by_feeder, weather):
    """Rakit fitur point-in-time utk satu feeder pada satu tanggal (inspeksi = 0)."""
    hist = by_feeder.get(pen, [])
    past = [d for d in hist if d < target]
    lk = meta["loc_key"]
    b = sum(1 for d in past if (w := weather.get((lk, d))) and _bad(w))
    wt = weather.get((lk, target))
    return {
        "penyulang": pen, "ulp": meta["ulp"], "tgl": target.isoformat(),
        "has_weather": wt is not None,
        "wind_max_kmh": wt.get("wind_max_kmh") if wt else None,
        "wind_gust_kmh": wt.get("wind_gust_kmh") if wt else None,
        "precip_mm": wt.get("precip_mm") if wt else None,
        "thunder": bool(wt["thunder"]) if wt and wt.get("thunder") is not None else False,
        "trip_30d": sum(1 for d in past if (target - d).days <= 30),
        "trip_90d": sum(1 for d in past if (target - d).days <= 90),
        "trip_365d": sum(1 for d in past if (target - d).days <= 365),
        "hari_sejak_trip": (target - past[-1]).days if past else None,
        "rate_hujan": round(b / len(past), 3) if past else 0.0,
        "temuan_jaringan_terbuka": 0, "temuan_pohon_terbuka": 0,
        "temuan_kritis_terbuka": 0, "umur_temuan_tertua_hari": None,
    }


def compute() -> dict:
    """Hitung backtest penuh; kembalikan result dict (tanpa efek samping)."""
    feeders = {}
    for r in supabase_client.fetch_all("penyulang_ref", "penyulang,ulp,lat,lng"):
        if r.get("lat") is None or r.get("lng") is None:
            continue
        feeders[r["penyulang"]] = {"ulp": r["ulp"], "loc_key": geo.loc_key(float(r["lat"]), float(r["lng"]))}

    by_feeder = defaultdict(list)
    for r in supabase_client.fetch_all("ml_outage_events", "penyulang,tgl_gangguan"):
        d = _to_date(r.get("tgl_gangguan"))
        if d and r.get("penyulang") in feeders:
            by_feeder[r["penyulang"]].append(d)
    for v in by_feeder.values():
        v.sort()

    weather = {}
    for r in supabase_client.fetch_all("weather_daily", "loc_key,tgl,wind_max_kmh,wind_gust_kmh,precip_mm,thunder"):
        d = _to_date(r.get("tgl"))
        if d:
            weather[(r["loc_key"], d)] = r

    # ── (1) agregat rolling mingguan ─────────────────────────────────────────
    lvl_tot = Counter()
    lvl_pos = {h: Counter() for h in HORIZONS}
    n = 0
    outages_in_window = {h: 0 for h in HORIZONS}
    score_sum_pos = score_sum_neg = 0.0
    npos = nneg = 0

    target = EVAL_START
    while target <= EVAL_END:
        for pen, meta in feeders.items():
            s = score_risk.score(_features(pen, meta, target, by_feeder, weather))
            level = s["risk_level"]
            n += 1
            lvl_tot[level] += 1
            hist = by_feeder.get(pen, [])
            for h in HORIZONS:
                if any(target < d <= target + timedelta(days=h) for d in hist):
                    lvl_pos[h][level] += 1
                    outages_in_window[h] += 1
            if any(target < d <= target + timedelta(days=7) for d in hist):
                score_sum_pos += s["risk_score"]; npos += 1
            else:
                score_sum_neg += s["risk_score"]; nneg += 1
        target += timedelta(days=STEP_DAYS)

    horizons = []
    for h in HORIZONS:
        base = round(100 * outages_in_window[h] / n, 1) if n else 0.0
        levels = {}
        for lv in ("aman", "waspada", "kritis"):
            t = lvl_tot[lv]; p = lvl_pos[h][lv]
            rate = round(100 * p / t, 1) if t else 0.0
            levels[lv] = {"n": t, "rate": rate, "lift": round(rate / base, 1) if base else 0.0}
        tp = lvl_pos[h]["kritis"] + lvl_pos[h]["waspada"]
        flagged = lvl_tot["kritis"] + lvl_tot["waspada"]
        horizons.append({
            "h": h, "base": base, "levels": levels,
            "precision": round(100 * tp / flagged, 1) if flagged else 0.0,
            "recall": round(100 * tp / outages_in_window[h], 1) if outages_in_window[h] else 0.0,
            "flagged": flagged, "outages": outages_in_window[h],
        })

    # ── (2) kasus nyata: tiap gangguan → ditandai <=LEAD_MAX hari sebelum? ────
    cases = []
    detected = missed = 0
    for pen, meta in feeders.items():
        for d in by_feeder.get(pen, []):
            if not (EVAL_START <= d <= EVAL_END):
                continue
            flagged_lead = flag_level = flag_score = None
            for lead in range(0, LEAD_MAX + 1):
                s = score_risk.score(_features(pen, meta, d - timedelta(days=lead), by_feeder, weather))
                if s["risk_level"] in ("kritis", "waspada"):
                    flagged_lead = lead
                    flag_level = s["risk_level"]
                    flag_score = s["risk_score"]
            hit = flagged_lead is not None
            detected += hit
            missed += not hit
            cases.append({
                "tgl_gangguan": d.isoformat(), "penyulang": pen, "ulp": meta["ulp"],
                "terdeteksi": hit, "level": flag_level, "skor": flag_score, "lead": flagged_lead,
            })
    cases.sort(key=lambda c: c["tgl_gangguan"], reverse=True)
    total_cases = detected + missed

    return {
        "eval_start": EVAL_START.isoformat(), "eval_end": EVAL_END.isoformat(),
        "feeders": len(feeders), "samples": n, "step_days": STEP_DAYS,
        "horizons": horizons,
        "avg_score_pos": round(score_sum_pos / npos, 1) if npos else 0.0,
        "avg_score_neg": round(score_sum_neg / nneg, 1) if nneg else 0.0,
        "detection": {
            "lead_max": LEAD_MAX,
            "detected": detected, "missed": missed, "total": total_cases,
            "rate": round(100 * detected / total_cases, 1) if total_cases else 0.0,
        },
        "cases": cases[:CASES_KEEP],
        "model_version": "rule-v1",
        "note": "leak-free: fitur riwayat+cuaca point-in-time, inspeksi dinolkan",
    }


def run() -> dict:
    """Entry pipeline: hitung → tulis ml_run_log → kembalikan ringkasan pendek."""
    result = compute()
    supabase_client.log_run("backtest", "ok", json.dumps(result), rows=result["samples"])
    d = result["detection"]
    h7 = next((h for h in result["horizons"] if h["h"] == 7), result["horizons"][-1])
    return {
        "deteksi": f"{d['rate']}% ({d['detected']}/{d['total']})",
        "kritis_7h": f"{h7['levels']['kritis']['rate']}% (lift {h7['levels']['kritis']['lift']}x)",
        "kasus_disimpan": len(result["cases"]),
    }


def main() -> None:
    result = compute()
    print("=" * 64)
    print(f"BACKTEST rule-v1  |  {result['eval_start']} s/d {result['eval_end']}  |  {result['feeders']} feeder | {result['samples']} sampel")
    print("=" * 64)
    for hz in result["horizons"]:
        print(f"\n-- Horizon {hz['h']} hari (base {hz['base']}%) --")
        for lv in ("aman", "waspada", "kritis"):
            dd = hz["levels"][lv]
            print(f"  {lv:8}: {dd['n']:6} | {dd['rate']:5}% gangguan | lift {dd['lift']}x")
        print(f"  FLAG: precision {hz['precision']}% | recall {hz['recall']}%")
    dt = result["detection"]
    print(f"\n-- Kasus (deteksi <= {dt['lead_max']} hari sebelum gangguan) --")
    print(f"  {dt['detected']}/{dt['total']} gangguan ditandai lebih dulu = {dt['rate']}%")
    print(f"  contoh terbaru: {result['cases'][0] if result['cases'] else '-'}")
    print(f"\nRata-rata skor: ADA gangguan {result['avg_score_pos']} vs TIDAK {result['avg_score_neg']}")

    supabase_client.log_run("backtest", "ok", json.dumps(result), rows=result["samples"])
    print("\n[ok] hasil backtest ditulis ke ml_run_log (job=backtest)")


if __name__ == "__main__":
    main()
