-- Jalankan di Supabase SQL Editor

create table if not exists padam_apkt (
  id                    uuid        default gen_random_uuid() primary key,
  no_laporan            text        not null,
  ulp                   text,
  penyulang             text,
  lokasi_titik_gangguan text,
  tgl_padam             date,
  jam_padam             time,
  tgl_nyala_sementara   date,
  jam_nyala_sementara   time,
  tgl_nyala             date,
  jam_nyala             time,
  fasilitas             text,
  sub_fasilitas         text,
  equipment             text,
  event_damage          text,
  cause                 text,
  group_cause           text,
  weather               text,
  jml_pelanggan_padam   integer,
  lama_padam_jam        numeric(12, 4),
  jam_x_pelanggan_padam numeric(12, 4),
  penyebab_padam        text,
  ens                   numeric(12, 4),
  ampere                text,
  keterangan            text,
  lokasi_gangguan       text,
  section_gangguan      text,
  pembatas_section      text,
  no_tiang_gangguan     text,
  rele_proteksi         text,
  besar_arus_ampere     text,
  created_at            timestamptz default now(),
  constraint padam_apkt_unique unique (no_laporan, ulp, penyulang, tgl_padam)
);

alter table padam_apkt enable row level security;

create policy "padam_apkt select" on padam_apkt for select to authenticated using (true);
create policy "padam_apkt insert" on padam_apkt for insert to authenticated with check (true);
create policy "padam_apkt update" on padam_apkt for update to authenticated using (true);
create policy "padam_apkt delete" on padam_apkt for delete to authenticated using (true);

create index if not exists padam_apkt_tgl_idx       on padam_apkt (tgl_padam);
create index if not exists padam_apkt_ulp_idx       on padam_apkt (ulp);
create index if not exists padam_apkt_penyulang_idx on padam_apkt (penyulang);
