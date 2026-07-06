#!/bin/bash
# Pipeline batch harian ML: sync gangguan → predict_cause → forecast cuaca →
# score_risk (H+1) → trigger Morning Brief. Dipanggil cron VPS 20:00 WITA (12:00 UTC).
# Lihat ml-engine/README.md.
set -e
cd "$(dirname "$0")"
[ -d .venv ] && source .venv/bin/activate
echo "===== [$(date -u '+%Y-%m-%d %H:%M:%S UTC')] pipeline mulai ====="
python -m src.pipeline
echo "===== [$(date -u '+%Y-%m-%d %H:%M:%S UTC')] pipeline selesai ====="
