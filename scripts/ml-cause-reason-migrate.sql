-- Tambah kolom alasan tebakan Model B. Jalankan di Supabase SQL Editor.
alter table public.ml_outage_events add column if not exists cause_reason text;
