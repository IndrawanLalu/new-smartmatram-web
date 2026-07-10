-- Migrasi: dukung banyak jenis laporan Dispatcher (Penormalan Gangguan, Autoreclose,
-- Pekerjaan Padam Emergency, dll) dalam satu tabel gangguan_realtime.
-- Jalankan manual di Supabase SQL Editor (tabel sudah ada di produksi).

alter table public.gangguan_realtime
  add column if not exists jenis text,
  add column if not exists judul text,
  add column if not exists keypoint text,   -- dari "Section Padam" sebelum " - "
  add column if not exists penyulang text;  -- dari "Section Padam" setelah " - " sampai "/"

-- Unique key ikutkan `jenis` agar 2 jenis laporan berbeda di section+waktu sama tidak saling tolak.
alter table public.gangguan_realtime drop constraint if exists gangguan_realtime_uniq;
alter table public.gangguan_realtime
  add constraint gangguan_realtime_uniq unique (tanggal, section_padam, waktu_padam, jenis);

create index if not exists gangguan_realtime_jenis_idx on public.gangguan_realtime (jenis);
