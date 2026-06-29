"""Orkestrasi batch malam: sync gangguan → forecast cuaca → skor risiko H+1.

Dipanggil cron 00:00 WITA. Tiap langkah dicatat; kegagalan sync/forecast tidak
membatalkan scoring (skor tetap dihitung dari data terakhir yang ada).

Jalankan: python -m src.pipeline
"""
from __future__ import annotations

import time

from . import build_features, fetch_weather, predict_cause, score_risk, supabase_client, sync_gangguan


def _step(name: str, fn):
    try:
        stats = fn()
        print(f"[ok] {name}: {stats}")
        return stats
    except Exception as e:  # noqa: BLE001
        print(f"[warn] {name} gagal (lanjut): {e}")
        return {"error": str(e)}


def main() -> None:
    t0 = time.time()
    _step("sync_gangguan", sync_gangguan.run)
    _step("predict_cause", predict_cause.run)       # Model B — isi unknown setelah sync
    _step("fetch_weather.forecast", fetch_weather.forecast)

    target = build_features.default_target()
    score_stats = score_risk.run(target)  # langkah inti — biarkan error naik bila gagal
    dur = int((time.time() - t0) * 1000)
    print(f"[ok] pipeline selesai dalam {dur} ms | {score_stats}")
    supabase_client.log_run("pipeline", "ok", str(score_stats), rows=score_stats.get("scored", 0), duration_ms=dur)


if __name__ == "__main__":
    main()
