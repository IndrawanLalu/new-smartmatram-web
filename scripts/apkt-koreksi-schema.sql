-- Tabel hasil koreksi waktu gangguan (Fase B). Jalankan di Supabase SQL Editor.

create table if not exists public.apkt_koreksi (
  no_laporan            text primary key,
  ulp                   text,
  waktu_lapor           text,          -- waktu lapor asli (referensi)

  -- Timestamp hasil koreksi (format DD/MM/YYYY HH:mm:ss, untuk di-paste ke APKT)
  tgl_penugasan         text,
  tgl_perjalanan        text,
  tgl_pengerjaan        text,
  tgl_nyala_sementara   text,
  tgl_nyala             text,
  tgl_selesai           text,

  -- Durasi tiap tahap (menit) — disimpan agar bisa diedit ulang
  d_lapor_penugasan       numeric,
  d_penugasan_perjalanan  numeric,
  d_perjalanan_pengerjaan numeric,
  d_pengerjaan_nyalasmt   numeric,
  d_nyalasmt_nyala        numeric,
  d_nyala_selesai         numeric,

  rpt_asli              numeric,       -- RPT sebelum (menit)
  rct_asli              numeric,       -- RCT sebelum (menit)
  rpt_koreksi           numeric,       -- RPT sesudah (menit)
  rct_koreksi           numeric,       -- RCT sesudah (menit)

  korektor              text,
  tgl_koreksi           timestamptz not null default now()
);

alter table public.apkt_koreksi enable row level security;

drop policy if exists "apkt_koreksi all for authenticated" on public.apkt_koreksi;
create policy "apkt_koreksi all for authenticated"
  on public.apkt_koreksi
  for all
  to authenticated
  using (true)
  with check (true);
