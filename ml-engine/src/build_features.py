"""REQ-1.3 — Rakit fitur per penyulang untuk satu tanggal target (default H+1).

Sumber:
  • ml_outage_events  → riwayat trip (30/90/365 hari, recency, rate-saat-hujan)
  • weather_daily     → cuaca tanggal target (forecast) + cuaca historis (utk rate-hujan)
  • inspeksi / inspeksi_pohon → temuan terbuka (status != 'Selesai')

Toleran data inspeksi NULL (feeder belum diinspeksi → temuan = 0).
Join inspeksi by nama feeder ter-normalisasi (lihat catatan join di memory).
"""
from __future__ import annotations

from collections import defaultdict
from datetime import date, timedelta

from . import geo, normalize as N, supabase_client

# Ambang "hari hujan/buruk" untuk menghitung pola rawan-saat-hujan historis.
RAIN_PRECIP_MM = 5.0
RAIN_WIND_KMH = 30.0


def _to_date(s: str | None) -> date | None:
    if not s:
        return None
    try:
        return date.fromisoformat(s[:10])
    except ValueError:
        return None


def _is_bad_weather(w: dict) -> bool:
    return (w.get("precip_mm") or 0) >= RAIN_PRECIP_MM or (w.get("wind_max_kmh") or 0) >= RAIN_WIND_KMH


def _load_open(table: str) -> dict[str, list[dict]]:
    out: dict[str, list[dict]] = defaultdict(list)
    for r in supabase_client.fetch_all(table, "penyulang,status,tgl_inspeksi"):
        if (r.get("status") or "") == "Selesai":
            continue
        pen = N.norm_penyulang(r.get("penyulang"))
        if pen:
            out[pen].append({"status": r.get("status"), "tgl": _to_date(r.get("tgl_inspeksi"))})
    return out


def build(target: date) -> list[dict]:
    # penyulang_ref → loc_key
    feeders: dict[str, dict] = {}
    for r in supabase_client.fetch_all("penyulang_ref", "penyulang,ulp,lat,lng"):
        if r.get("lat") is None or r.get("lng") is None:
            continue
        feeders[r["penyulang"]] = {"ulp": r["ulp"], "loc_key": geo.loc_key(float(r["lat"]), float(r["lng"]))}

    # riwayat gangguan per feeder
    by_feeder: dict[str, list[date]] = defaultdict(list)
    for r in supabase_client.fetch_all("ml_outage_events", "penyulang,tgl_gangguan"):
        d = _to_date(r.get("tgl_gangguan"))
        if d and r.get("penyulang"):
            by_feeder[r["penyulang"]].append(d)
    for v in by_feeder.values():
        v.sort()

    # cuaca: (loc_key, date) → row
    weather: dict[tuple, dict] = {}
    for r in supabase_client.fetch_all(
        "weather_daily", "loc_key,tgl,wind_max_kmh,wind_gust_kmh,precip_mm,thunder"
    ):
        d = _to_date(r.get("tgl"))
        if d:
            weather[(r["loc_key"], d)] = r

    insp = _load_open("inspeksi")
    pohon = _load_open("inspeksi_pohon")

    rows: list[dict] = []
    for pen, meta in feeders.items():
        lk = meta["loc_key"]
        hist = by_feeder.get(pen, [])
        past = [d for d in hist if d < target]

        trip_30d = sum(1 for d in past if (target - d).days <= 30)
        trip_90d = sum(1 for d in past if (target - d).days <= 90)
        trip_365d = sum(1 for d in past if (target - d).days <= 365)
        hari_sejak = (target - past[-1]).days if past else None

        bad = sum(1 for d in past if (w := weather.get((lk, d))) and _is_bad_weather(w))
        rate_hujan = round(bad / len(past), 3) if past else 0.0

        wt = weather.get((lk, target))
        wind = wt.get("wind_max_kmh") if wt else None
        gust = wt.get("wind_gust_kmh") if wt else None
        precip = wt.get("precip_mm") if wt else None
        thunder = bool(wt["thunder"]) if wt and wt.get("thunder") is not None else False

        op, po = insp.get(pen, []), pohon.get(pen, [])
        t_jaringan, t_pohon = len(op), len(po)
        t_kritis = sum(1 for x in op + po if (x["status"] or "") == "Perlu Tindakan")
        ages = [(target - x["tgl"]).days for x in op + po if x["tgl"]]
        umur_tertua = max(ages) if ages else None

        rows.append(
            {
                "penyulang": pen,
                "ulp": meta["ulp"],
                "tgl": target.isoformat(),
                "has_weather": wt is not None,
                "wind_max_kmh": wind,
                "wind_gust_kmh": gust,
                "precip_mm": precip,
                "thunder": thunder,
                "trip_30d": trip_30d,
                "trip_90d": trip_90d,
                "trip_365d": trip_365d,
                "hari_sejak_trip": hari_sejak,
                "rate_hujan": rate_hujan,
                "temuan_jaringan_terbuka": t_jaringan,
                "temuan_pohon_terbuka": t_pohon,
                "temuan_kritis_terbuka": t_kritis,
                "umur_temuan_tertua_hari": umur_tertua,
            }
        )
    return rows


def default_target() -> date:
    return date.today() + timedelta(days=1)
