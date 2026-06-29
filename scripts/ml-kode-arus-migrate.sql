-- KODE penyebab + arus gangguan ke ml_outage_events. Jalankan di Supabase SQL Editor.
alter table public.ml_outage_events add column if not exists kode   text;     -- T, I1..I4, E1..E4
alter table public.ml_outage_events add column if not exists arus_r numeric;   -- IR
alter table public.ml_outage_events add column if not exists arus_s numeric;   -- IS
alter table public.ml_outage_events add column if not exists arus_t numeric;   -- IT
alter table public.ml_outage_events add column if not exists arus_n numeric;   -- IN

create index if not exists idx_ml_outage_kode on public.ml_outage_events (kode);
