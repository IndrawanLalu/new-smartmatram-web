# SMART-Mataram — ML Engine

Microservice Python untuk Smart Predictive Maintenance. Berjalan **terpisah** dari Next.js (venv & lifecycle sendiri, dijalankan via cron di VPS). **Tidak** ikut `pnpm build`.

Spesifikasi lengkap: [`../mechinelearning.prd`](../mechinelearning.prd).

## Status
- ✅ **Sprint 1** — skema DB (`../scripts/ml-predictive-schema.sql`) + sync gangguan (`src/sync_gangguan.py`)
- ✅ **Sprint 2** — geo penyulang (`src/seed_penyulang_ref.py`) + cuaca Open-Meteo (`src/fetch_weather.py`)
- ⏳ Sprint 3+ — build_features, score_risk, predict_cause

## Menjalankan — Sprint 2
```bash
# 1) (sekali) migrasi weather_daily ke skema loc_key di Supabase SQL Editor:
#    ../scripts/ml-weather-daily-migrate.sql
# 2) seed geo penyulang (centroid ULP)
python -m src.seed_penyulang_ref
# 3) backfill cuaca historis (sekali) — sesuaikan rentang
python -m src.fetch_weather --backfill 2022-01-01 2026-06-21
# 4) forecast H+1 (tiap malam, dipanggil pipeline)
python -m src.fetch_weather --forecast
```

## Setup (sekali)
```bash
cd ml-engine
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

## Environment
Kredensial dibaca berurutan: `os.environ` → `ml-engine/.env` → `../.env.local`.
Di VPS cukup andalkan `../.env.local` yang sudah ada. Untuk lokal, salin `.env.example` → `.env` dan isi:
- `NEXT_PUBLIC_SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY` (wajib — write + bypass RLS)

Sheets API key sudah ada default (sama dengan `lib/sheets.ts`).

## Menjalankan
Prasyarat: jalankan dulu `scripts/ml-predictive-schema.sql` di Supabase SQL Editor.

```bash
# dari folder ml-engine
./run_sync.sh
# atau
python -m src.sync_gangguan
```

Output: ringkasan jumlah event (sheets/padam, merged/standalone/low-confidence, unknown-cause) + 1 baris audit di `ml_run_log`.

## Cron (VPS)
`00:00 WITA`. Bila TZ server UTC → `16:00 UTC`:
```cron
0 16 * * *  /var/www/smart-mataram/ml-engine/run_sync.sh >> /var/log/ml-sync.log 2>&1
```

## Struktur
```
src/
  config.py          # env + konstanta (4 ULP, Sheets)
  normalize.py       # tanggal ID/ISO, ULP, penyulang, durasi, dedup_key
  sheets.py          # baca gangguanPenyulang (Sheets API)
  supabase_client.py # client + fetch/upsert berhalaman + log_run
  sync_gangguan.py   # REQ-1.1 konsolidasi → ml_outage_events
```
