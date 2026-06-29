"""REQ-1.2 — Cuaca harian dari Open-Meteo → weather_daily.

Dua mode:
  • backfill  : Archive API (historis, kuantitatif) untuk rentang tanggal.
  • forecast  : Forecast API (H-? s/d H+1) untuk inference malam.

Open-Meteo gratis tanpa API key. Panggilan didedup per lokasi unik (loc_key)
dari penyulang_ref — V1 hanya ~4 centroid ULP, jadi 4 request per mode.

Jalankan:
  python -m src.fetch_weather --backfill 2022-01-01 2026-06-20
  python -m src.fetch_weather --forecast            (default bila tanpa argumen)
"""
from __future__ import annotations

import argparse
import time
from datetime import date, timedelta

import requests

from . import geo, supabase_client

ARCHIVE_URL = "https://archive-api.open-meteo.com/v1/archive"
FORECAST_URL = "https://api.open-meteo.com/v1/forecast"
DAILY = "weather_code,wind_speed_10m_max,wind_gusts_10m_max,precipitation_sum"
THUNDER_CODES = {95, 96, 99}


def _distinct_locs() -> list[tuple[str, float, float]]:
    """Titik unik (loc_key, lat, lng) dari penyulang_ref."""
    rows = supabase_client.fetch_all("penyulang_ref", "lat,lng")
    seen: dict[str, tuple[str, float, float]] = {}
    for r in rows:
        if r.get("lat") is None or r.get("lng") is None:
            continue
        lat, lng = float(r["lat"]), float(r["lng"])
        k = geo.loc_key(lat, lng)
        seen.setdefault(k, (k, lat, lng))
    return list(seen.values())


def _parse_daily(loc_key: str, daily: dict, kind: str) -> list[dict]:
    out = []
    times = daily.get("time", [])
    for i, t in enumerate(times):
        code = _at(daily.get("weather_code"), i)
        out.append(
            {
                "loc_key": loc_key,
                "tgl": t,
                "wind_max_kmh": _at(daily.get("wind_speed_10m_max"), i),
                "wind_gust_kmh": _at(daily.get("wind_gusts_10m_max"), i),
                "precip_mm": _at(daily.get("precipitation_sum"), i),
                "weather_code": int(code) if code is not None else None,
                "thunder": (int(code) in THUNDER_CODES) if code is not None else None,
                "kind": kind,
            }
        )
    return out


def _at(arr, i):
    return arr[i] if arr and i < len(arr) and arr[i] is not None else None


def _request(url: str, params: dict, loc_key: str, kind: str) -> list[dict]:
    params = {**params, "daily": DAILY, "timezone": "Asia/Makassar", "windspeed_unit": "kmh"}
    resp = requests.get(url, params=params, timeout=60)
    resp.raise_for_status()
    return _parse_daily(loc_key, resp.json().get("daily", {}), kind)


def backfill(start: str, end: str) -> dict:
    locs = _distinct_locs()
    rows: list[dict] = []
    for k, lat, lng in locs:
        rows += _request(
            ARCHIVE_URL,
            {"latitude": lat, "longitude": lng, "start_date": start, "end_date": end},
            k,
            "archive",
        )
    upserted = supabase_client.upsert_chunked("weather_daily", rows, on_conflict="loc_key,tgl")
    return {"locs": len(locs), "rows": len(rows), "upserted": upserted, "range": f"{start}..{end}"}


def forecast() -> dict:
    """Ambil cuaca hari ini + besok (H+1) untuk inference."""
    locs = _distinct_locs()
    rows: list[dict] = []
    for k, lat, lng in locs:
        rows += _request(
            FORECAST_URL,
            {"latitude": lat, "longitude": lng, "forecast_days": 2, "past_days": 0},
            k,
            "forecast",
        )
    upserted = supabase_client.upsert_chunked("weather_daily", rows, on_conflict="loc_key,tgl")
    tomorrow = (date.today() + timedelta(days=1)).isoformat()
    return {"locs": len(locs), "rows": len(rows), "upserted": upserted, "h_plus_1": tomorrow}


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--backfill", nargs=2, metavar=("START", "END"))
    ap.add_argument("--forecast", action="store_true")
    args = ap.parse_args()

    t0 = time.time()
    mode = "backfill" if args.backfill else "forecast"
    try:
        stats = backfill(*args.backfill) if args.backfill else forecast()
        dur = int((time.time() - t0) * 1000)
        print(f"[ok] fetch_weather ({mode}) selesai dalam {dur} ms")
        for k, v in stats.items():
            print(f"   {k:14}: {v}")
        supabase_client.log_run(f"fetch_weather:{mode}", "ok", str(stats), rows=stats.get("upserted", 0), duration_ms=dur)
    except Exception as e:  # noqa: BLE001
        print(f"[error] fetch_weather ({mode}) gagal: {e}")
        supabase_client.log_run(f"fetch_weather:{mode}", "error", str(e))
        raise


if __name__ == "__main__":
    main()
