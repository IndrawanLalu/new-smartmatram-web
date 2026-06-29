-- Tabel hasil tarik "ssdetailGangguan" dari APKT (Detail Gangguan APKT)
-- Jalankan di Supabase SQL Editor.

create table if not exists public.apkt_gangguan (
  apkt_id                text primary key,          -- field "id" dari APKT (unik)
  no_laporan             text,
  pembuat_laporan        text,
  waktu_lapor            text,
  waktu_response         text,
  waktu_recovery         text,
  durasi_dispatch_time   numeric,
  durasi_response_time   numeric,
  durasi_recovery_time   numeric,
  durasi_perjalanan_time numeric,
  status_akhir           text,
  is_marking             text,
  referensi_marking      text,
  idpel_nometer          text,
  nama_pelapor           text,
  alamat_pelapor         text,
  no_telp_pelapor        text,
  keterangan_pelapor     text,
  media                  text,
  nama_posko             text,
  jarak_closing          numeric,
  dispatch_oleh          text,
  diselesaikan_oleh      text,
  penyebab               text,
  tindakan               text,
  kode_gangguan          text,
  jenis_gangguan         text,
  ket_batal              text,
  batal_by               text,
  ket_marking            text,
  ulp                    text,                      -- mis. 'AMPENAN'
  tgl_lapor              date,                      -- hasil parse waktu_lapor (untuk filter)
  synced_at              timestamptz not null default now()
);

create index if not exists idx_apkt_gangguan_tgl  on public.apkt_gangguan (tgl_lapor);
create index if not exists idx_apkt_gangguan_ulp  on public.apkt_gangguan (ulp);

alter table public.apkt_gangguan enable row level security;

-- Akses untuk user yang sudah login (authenticated)
drop policy if exists "apkt_gangguan all for authenticated" on public.apkt_gangguan;
create policy "apkt_gangguan all for authenticated"
  on public.apkt_gangguan
  for all
  to authenticated
  using (true)
  with check (true);
