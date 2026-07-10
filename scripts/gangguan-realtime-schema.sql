-- Tabel log "INFO REALTIME PENORMALAN GANGGUAN 20 kV" dari Dispatcher UP2D NTB.
-- Diisi otomatis lewat WA (auto-deteksi judul) → app/api/wa-webhook → lib/wa/handleLaporan.ts
-- Jalankan manual di Supabase SQL Editor.

create table if not exists public.gangguan_realtime (
  id                bigint generated always as identity primary key,
  tanggal           date,
  jenis             text,          -- Penormalan Gangguan | Autoreclose | Pekerjaan Padam Emergency | ...
  judul             text,          -- baris judul asli dari dispatcher
  section_padam     text,          -- raw utuh
  keypoint          text,          -- section sebelum " - "
  penyulang         text,          -- section setelah " - " sampai "/"
  up3               text,
  ulp               text,
  trafo_gi          text,
  waktu_padam       time,
  waktu_nyala       time,
  durasi_menit      numeric,
  relay             text,
  beban_kw          numeric,
  arus_r            numeric,
  arus_s            numeric,
  arus_t            numeric,
  arus_n            numeric,
  total_trip_tahun  integer,
  ens_kwh           numeric,
  penyebab          text,
  eksekusi          text,
  cuaca             text,
  sumber            text,
  wa_from           text,
  wa_message_id     text,
  raw_text          text,
  created_at        timestamptz not null default now(),
  -- anti-dobel bila pesan yang sama di-forward berkali-kali
  constraint gangguan_realtime_uniq unique (tanggal, section_padam, waktu_padam, jenis)
);

create index if not exists gangguan_realtime_tanggal_idx on public.gangguan_realtime (tanggal desc);
create index if not exists gangguan_realtime_ulp_idx on public.gangguan_realtime (ulp);

-- Ditulis hanya via service role (bypass RLS). RLS on + tanpa policy = tertutup untuk anon/auth.
alter table public.gangguan_realtime enable row level security;
