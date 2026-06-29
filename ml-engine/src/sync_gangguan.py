"""REQ-1.1 — Konsolidasi gangguan → tabel kanonik `ml_outage_events`.

Hierarki kebenaran (lihat PRD §4.1):
  • Sheets `gangguanPenyulang`  → OTORITATIF untuk penyulang & penyebab (confidence 'high').
  • `padam_apkt`               → enrichment (ens, jml pelanggan, weather, cause).
                                 Penyulang-nya bisa salah sampai direkonsiliasi via
                                 kolom `ref_gangguan`. Yang belum ter-link & tak cocok
                                 disimpan standalone dengan confidence 'low'.

Strategi merge per baris padam_apkt:
  1. dedup_key sama persis (penyulang|tgl|jam) dengan event Sheets → enrich.
  2. soft-match (ulp, tgl, penyulang) & hanya 1 kandidat hari itu        → enrich.
  3. tidak cocok                                                          → standalone.

Idempoten: upsert pakai `dedup_key`, aman dijalankan berulang.
Jalankan:  python -m src.sync_gangguan   (dari folder ml-engine/)
"""
from __future__ import annotations

import time
from datetime import datetime, timezone
from typing import Any

from . import normalize as N
from . import sheets, supabase_client
from .config import ULP_LIST, ULP_SCOPE

# ── Helper akses kolom Sheets (header bisa bervariasi) ─────────────────────────

def _get(row: dict[str, Any], *keys: str) -> str:
    for k in keys:
        v = row.get(k)
        if v not in (None, ""):
            return str(v)
    return ""


# ── Tahap 1: Sheets → event kanonik ───────────────────────────────────────────

def _load_sheets(events: dict[str, dict], soft: dict[tuple, list[str]]) -> dict[str, int]:
    raw_rows = sheets.fetch_gangguan_penyulang()
    valid = skipped = 0
    for r in raw_rows:
        tgl = N.parse_date(_get(r, "TANGGAL"))
        # Anchor pada PENYULANG (feeder induk). PENYULANG_GANGGUAN = titik/recloser
        # yang trip (bisa beda, mis. "REC. BLKI" vs feeder "OL. PRAYA KOTA").
        penyulang = N.norm_penyulang(_get(r, "PENYULANG", "PENYULANG_GANGGUAN"))
        if not tgl or not penyulang:
            continue
        ulp = N.norm_ulp(_get(r, "ULP"))
        if ulp not in ULP_SCOPE:  # Sheet cakup seluruh NTB → batasi ke 4 ULP V1
            skipped += 1
            continue
        jam = N.parse_jam(_get(r, "JAM PADAM", "JAM_PADAM"))
        key = N.dedup_key(penyulang, tgl, jam)

        events[key] = {
            "dedup_key": key,
            "ulp": ulp,
            "penyulang": penyulang,
            "penyulang_confidence": "high",
            "tgl_gangguan": tgl.isoformat(),
            "jam_padam": jam,
            "durasi_jam": N.parse_durasi_jam(_get(r, "DURASI")),
            "penyebab": N.clean_penyebab(_get(r, "PENYEBAB GANGGUAN", "PENYEBAB_GANGGUAN")),
            "kode": N.norm_kode(_get(r, "KODE")),
            "arus_r": N.parse_arus(_get(r, "IR")),
            "arus_s": N.parse_arus(_get(r, "IS")),
            "arus_t": N.parse_arus(_get(r, "IT")),
            "arus_n": N.parse_arus(_get(r, "IN")),
            "ens": None,
            "jml_pelanggan_padam": None,
            "weather_cat": None,
            "source": "sheets",
            "raw": {
                "titik_gangguan": _get(r, "PENYULANG_GANGGUAN"),
                "fasilitas": _get(r, "FASILITAS_PADAM"),
                "arus": {k: _get(r, k) for k in ("IR", "IS", "IT", "IN") if _get(r, k)},
            },
        }
        soft.setdefault((ulp, tgl.isoformat(), penyulang), []).append(key)
        valid += 1
    return {"sheets_total": len(raw_rows), "sheets_valid": valid, "sheets_skipped_scope": skipped}


# ── Tahap 2: padam_apkt → enrichment / standalone ─────────────────────────────

_PADAM_COLS = (
    "no_laporan,ulp,penyulang,tgl_padam,jam_padam,lama_padam_jam,"
    "penyebab_padam,cause,group_cause,weather,ens,jml_pelanggan_padam,ref_gangguan"
)


def _ref_hint(ref: Any) -> tuple[str | None, str | None, str | None]:
    """Ambil (ulp, penyulang, tgl_iso) dari ref_gangguan bila berbentuk dict dikenali.

    Bentuk persis ref_gangguan belum baku (diisi manual & masih sedikit), jadi
    pencarian key dibuat defensif. Bila gagal → (None, None, None).
    """
    if not isinstance(ref, dict):
        return None, None, None
    ulp = N.norm_ulp(_get(ref, "ulp", "ULP"))
    pen = N.norm_penyulang(_get(ref, "penyulang", "PENYULANG GANGGUAN", "titik_gangguan"))
    tgl = N.parse_date(_get(ref, "tgl_gangguan", "tanggal", "TANGGAL"))
    return ulp, pen, (tgl.isoformat() if tgl else None)


def _enrich(ev: dict, p: dict) -> None:
    """Isi field yang masih kosong di event dari satu baris padam_apkt."""
    if ev.get("ens") is None and p.get("ens") is not None:
        ev["ens"] = p["ens"]
    if ev.get("jml_pelanggan_padam") is None and p.get("jml_pelanggan_padam") is not None:
        ev["jml_pelanggan_padam"] = p["jml_pelanggan_padam"]
    if ev.get("weather_cat") is None and p.get("weather"):
        ev["weather_cat"] = p["weather"]
    if not ev.get("penyebab"):  # penyebab Sheets kosong → pakai cause padam
        cause = p.get("cause") or p.get("group_cause") or p.get("penyebab_padam")
        ev["penyebab"] = N.clean_penyebab(cause)
    ev["source"] = "merged"
    ev.setdefault("raw", {})["padam"] = {"no_laporan": p.get("no_laporan")}


def _load_padam(events: dict[str, dict], soft: dict[tuple, list[str]]) -> dict[str, int]:
    rows = supabase_client.fetch_all("padam_apkt", _PADAM_COLS)
    merged = standalone = lowconf = skipped = 0

    for p in rows:
        tgl = N.parse_date(p.get("tgl_padam"))
        if not tgl:
            continue
        jam = N.parse_jam(p.get("jam_padam"))

        # ref_gangguan → penyulang yang sudah divalidasi user
        ref_ulp, ref_pen, ref_tgl = _ref_hint(p.get("ref_gangguan"))
        has_ref = bool(p.get("ref_gangguan"))

        ulp = ref_ulp or N.norm_ulp(p.get("ulp"))
        penyulang = ref_pen or N.norm_penyulang(p.get("penyulang"))
        tgl_iso = ref_tgl or tgl.isoformat()
        if not penyulang:
            continue
        if ulp not in ULP_SCOPE:  # batasi ke 4 ULP V1
            skipped += 1
            continue

        # (1) cocok persis dedup_key
        key = N.dedup_key(penyulang, tgl, jam)
        target = events.get(key)

        # (2) soft-match (ulp, tgl, penyulang) bila kandidat tunggal
        if target is None:
            cands = soft.get((ulp, tgl_iso, penyulang), [])
            if len(cands) == 1:
                target = events[cands[0]]

        if target is not None:
            _enrich(target, p)
            merged += 1
            continue

        # (3) standalone
        conf = "high" if has_ref else "low"
        if conf == "low":
            lowconf += 1
        events[key] = {
            "dedup_key": key,
            "ulp": ulp,
            "penyulang": penyulang,
            "penyulang_confidence": conf,
            "tgl_gangguan": tgl.isoformat(),
            "jam_padam": jam,
            "durasi_jam": p.get("lama_padam_jam"),
            "penyebab": N.clean_penyebab(
                p.get("cause") or p.get("group_cause") or p.get("penyebab_padam")
            ),
            "kode": None,  # padam_apkt tak punya KODE
            "arus_r": None, "arus_s": None, "arus_t": None, "arus_n": None,
            "ens": p.get("ens"),
            "jml_pelanggan_padam": p.get("jml_pelanggan_padam"),
            "weather_cat": p.get("weather"),
            "source": "padam_apkt",
            "raw": {"padam": {"no_laporan": p.get("no_laporan")}},
        }
        soft.setdefault((ulp, tgl_iso, penyulang), []).append(key)
        standalone += 1

    return {
        "padam_total": len(rows),
        "padam_merged": merged,
        "padam_standalone": standalone,
        "padam_lowconf": lowconf,
        "padam_skipped_scope": skipped,
    }


# ── Orkestrasi ────────────────────────────────────────────────────────────────

def run() -> dict[str, Any]:
    events: dict[str, dict] = {}
    soft: dict[tuple, list[str]] = {}

    stats = _load_sheets(events, soft)
    stats.update(_load_padam(events, soft))

    now_iso = datetime.now(timezone.utc).isoformat()
    payload = []
    unknown = 0
    for ev in events.values():
        ev["updated_at"] = now_iso
        kode = ev.get("kode")
        is_unk = (kode == "T") if kode else N.is_unknown_cause(ev.get("penyebab"))
        if is_unk:
            unknown += 1
        payload.append(ev)

    upserted = supabase_client.upsert_chunked("ml_outage_events", payload, on_conflict="dedup_key")

    stats.update(
        {
            "events_total": len(payload),
            "events_unknown_cause": unknown,
            "upserted": upserted,
            "ulp_scope": ",".join(ULP_LIST),
        }
    )
    return stats


def main() -> None:
    t0 = time.time()
    try:
        stats = run()
        dur = int((time.time() - t0) * 1000)
        msg = " | ".join(f"{k}={v}" for k, v in stats.items())
        print(f"[ok] sync_gangguan selesai dalam {dur} ms")
        for k, v in stats.items():
            print(f"   {k:24}: {v}")
        supabase_client.log_run("sync_gangguan", "ok", msg, rows=stats.get("upserted", 0), duration_ms=dur)
    except Exception as e:  # noqa: BLE001
        dur = int((time.time() - t0) * 1000)
        print(f"[error] sync_gangguan gagal: {e}")
        supabase_client.log_run("sync_gangguan", "error", str(e), duration_ms=dur)
        raise


if __name__ == "__main__":
    main()
