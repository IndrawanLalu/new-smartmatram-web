#!/bin/bash
# Sync gangguan (Sheets + padam_apkt) → ml_outage_events.
# Dipakai manual atau via cron. Lihat ml-engine/README.md.
set -e
cd "$(dirname "$0")"
[ -d .venv ] && source .venv/bin/activate
python -m src.sync_gangguan
