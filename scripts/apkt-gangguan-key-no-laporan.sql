-- Pindahkan kunci tabel apkt_gangguan dari `apkt_id` → `no_laporan`.
-- Jalankan sekali di Supabase SQL Editor.
--
-- LATAR BELAKANG
-- `apkt_id` diisi dari field "id" milik APKT. Field itu ternyata nomor urut
-- baris DI DALAM hasil query, bukan ID global: tiap tarikan selalu mulai dari 0
-- lagi. Karena POST /api/apkt/gangguan meng-upsert dengan onConflict "apkt_id",
-- tarikan kedua menimpa baris tarikan pertama satu per satu — laporan Juni &
-- Juli hilang, tergantikan isi laporan Agustus.
--
-- `no_laporan` (mis. G4426082300005) adalah nomor laporan asli APKT, unik, dan
-- sudah jadi kunci di tabel `apkt_koreksi` — jadi sekalian membuat dua tabel itu
-- memakai kunci yang sama.

begin;

-- 1) Baris tanpa nomor laporan tidak bisa jadi kunci — dan tidak ada gunanya.
delete from public.apkt_gangguan
where no_laporan is null or btrim(no_laporan) = '';

-- 2) Buang duplikat no_laporan hasil tarikan yang rentangnya tumpang tindih.
--    Yang disisakan: baris dengan durasi paling lengkap, lalu yang paling baru.
with peringkat as (
  select ctid,
         row_number() over (
           partition by no_laporan
           order by (durasi_response_time   is not null)::int
                  + (durasi_recovery_time   is not null)::int
                  + (durasi_dispatch_time   is not null)::int
                  + (durasi_perjalanan_time is not null)::int desc,
                    synced_at desc,
                    ctid
         ) as rn
  from public.apkt_gangguan
)
delete from public.apkt_gangguan g
using peringkat p
where g.ctid = p.ctid and p.rn > 1;

-- 3) Tukar primary key.
alter table public.apkt_gangguan drop constraint if exists apkt_gangguan_pkey;
-- apkt_id kini kolom biasa: impor Excel tidak punya field itu sama sekali.
alter table public.apkt_gangguan alter column apkt_id drop not null;
alter table public.apkt_gangguan add constraint apkt_gangguan_pkey primary key (no_laporan);

commit;

-- Pemeriksaan setelah migrasi — dua angka ini harus sama.
-- select count(*) as baris, count(distinct no_laporan) as nomor from public.apkt_gangguan;
