"""Seed `penyulang_ref` dari daftar penyulang yang muncul di ml_outage_events.

V1: koordinat = centroid ULP (src/geo.py). Idempoten (upsert by penyulang).
Penyulang dengan ULP di luar 4 ULP scope dilewati.
Jalankan: python -m src.seed_penyulang_ref
"""
from __future__ import annotations

import time
from collections import Counter, defaultdict

from . import geo, supabase_client


def run() -> dict:
    rows = supabase_client.fetch_all("ml_outage_events", "penyulang,ulp")

    # ULP paling sering per penyulang (jaga-jaga bila ada baris ULP tidak konsisten).
    ulp_votes: dict[str, Counter] = defaultdict(Counter)
    for r in rows:
        if r.get("penyulang"):
            ulp_votes[r["penyulang"]][r.get("ulp")] += 1

    payload, skipped = [], 0
    for penyulang, votes in ulp_votes.items():
        ulp = votes.most_common(1)[0][0]
        coord = geo.centroid_for(ulp)
        if not coord:
            skipped += 1
            continue
        lat, lng = coord
        payload.append(
            {"penyulang": penyulang, "ulp": ulp, "kecamatan": None, "lat": lat, "lng": lng}
        )

    upserted = supabase_client.upsert_chunked("penyulang_ref", payload, on_conflict="penyulang")
    return {
        "penyulang_distinct": len(ulp_votes),
        "seeded": upserted,
        "skipped_no_centroid": skipped,
        "distinct_loc": len({geo.loc_key(p["lat"], p["lng"]) for p in payload}),
    }


def main() -> None:
    t0 = time.time()
    try:
        stats = run()
        dur = int((time.time() - t0) * 1000)
        print(f"[ok] seed_penyulang_ref selesai dalam {dur} ms")
        for k, v in stats.items():
            print(f"   {k:22}: {v}")
        supabase_client.log_run("seed_penyulang_ref", "ok", str(stats), rows=stats.get("seeded", 0), duration_ms=dur)
    except Exception as e:  # noqa: BLE001
        print(f"[error] seed_penyulang_ref gagal: {e}")
        supabase_client.log_run("seed_penyulang_ref", "error", str(e))
        raise


if __name__ == "__main__":
    main()
