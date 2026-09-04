-- =============================================================================
-- Fase 1 — Koordinat: titik gardu di WO + titik tempat pengukuran diambil
-- Jalankan manual di Supabase SQL Editor. Idempoten.
--
-- Dua hal berbeda, sengaja disatukan dalam satu skrip karena keduanya prasyarat
-- rilis mobile yang sama:
--
--   1. `wo_pengukuran_item.lat/lng` — TITIK GARDU, disalin dari master saat WO
--      terbit. Selama ini mobile mengambil titik gardu dari Google Sheet
--      `dataGarduProbis`; setelah ini ia datang bersama WO, jadi gardu yang ada
--      di master tapi tidak ada di Sheet tetap punya titik.
--
--   2. `pengukuran_gardu.lokasi_*` — TITIK PETUGAS saat mengukur. Belum pernah
--      ada. Gunanya memeriksa: pengukuran yang tercatat empat kilometer dari
--      gardunya patut ditengok. Tidak memblokir apa pun — hanya dicatat.
--
-- Tipe DOUBLE PRECISION mengikuti `wo_item.selesai_lat/selesai_lng` yang sudah
-- dipakai untuk tagging lokasi di modul Work Order.
-- =============================================================================

-- ── 1. Titik gardu ikut dibawa WO ────────────────────────────────────────────
ALTER TABLE public.wo_pengukuran_item
  ADD COLUMN IF NOT EXISTS lat DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS lng DOUBLE PRECISION;

COMMENT ON COLUMN public.wo_pengukuran_item.lat IS
  'Lintang titik gardu, potret dari master saat WO terbit. NULL = master belum punya koordinat.';
COMMENT ON COLUMN public.wo_pengukuran_item.lng IS
  'Bujur titik gardu, potret dari master saat WO terbit. NULL = master belum punya koordinat.';

-- ── 2. Titik tempat pengukuran diambil ───────────────────────────────────────
ALTER TABLE public.pengukuran_gardu
  ADD COLUMN IF NOT EXISTS lokasi_lat     DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS lokasi_lng     DOUBLE PRECISION,
  -- Akurasi GPS dalam meter, apa adanya dari perangkat. Titik dengan akurasi
  -- 500 m tidak bisa dipakai menilai apa pun, dan tanpa kolom ini tidak ada
  -- cara membedakannya dari titik yang presisi.
  ADD COLUMN IF NOT EXISTS lokasi_akurasi DOUBLE PRECISION;

COMMENT ON COLUMN public.pengukuran_gardu.lokasi_lat IS
  'Lintang petugas saat menyimpan pengukuran. NULL = GPS tidak tersedia — sengaja tidak diwajibkan.';
COMMENT ON COLUMN public.pengukuran_gardu.lokasi_lng IS
  'Bujur petugas saat menyimpan pengukuran.';
COMMENT ON COLUMN public.pengukuran_gardu.lokasi_akurasi IS
  'Akurasi GPS dalam meter saat pengukuran disimpan.';

-- ── 3. View realisasi disusun ulang ──────────────────────────────────────────
-- DROP dulu, bukan CREATE OR REPLACE: mengganti view hanya boleh MENAMBAH kolom
-- di ujung, sementara lat/lng lebih pantas berdiri di sebelah identitas gardu.
-- Tidak ada objek lain yang bergantung pada view ini, jadi menjatuhkannya aman.
DROP VIEW IF EXISTS public.wo_pengukuran_realisasi;

CREATE VIEW public.wo_pengukuran_realisasi AS
SELECT
  i.id,
  i.wo_id,
  i.kode_gardu,
  i.ulp,
  i.nama,
  i.alamat,
  i.penyulang,
  i.kva_master,
  i.lat,
  i.lng,
  i.alasan,
  i.tgl_ukur_terakhir,
  i.umur_bulan,
  i.urutan,

  w.bulan,
  w.tahun,
  w.tgl_wo,

  p.id                  AS pengukuran_id,
  p.tanggal_pengukuran  AS tgl_realisasi,
  p.petugas_nama,
  p.persen_beban,
  p.beban_kva,
  p.kva_trafo           AS kva_pengukuran,
  (p.id IS NOT NULL)    AS terealisasi
FROM public.wo_pengukuran_item i
JOIN public.wo_pengukuran w ON w.id = i.wo_id
LEFT JOIN LATERAL (
  SELECT pg.id, pg.tanggal_pengukuran, pg.petugas_nama,
         pg.persen_beban, pg.beban_kva, pg.kva_trafo
  FROM public.pengukuran_gardu pg
  WHERE upper(pg.no_gardu)     = upper(i.kode_gardu)
    AND upper(pg.petugas_unit) = upper(i.ulp)
    -- `pengukuran_gardu.tanggal_pengukuran` bertipe TEXT, bukan DATE. Yang
    -- diubah adalah BATASNYA jadi teks, bukan kolomnya jadi tanggal — meski
    -- `::date` juga sah di sini (`gardu_latest_state` sudah memakainya).
    -- Sebabnya indeks: `pengukuran_gardu_wo_lookup_idx` dibangun pada kolom apa
    -- adanya, dan begitu kolomnya dibungkus cast, indeks itu tidak terpakai —
    -- padahal subquery ini berjalan sekali PER BARIS WO.
    --
    -- Perbandingan teks tetap benar karena formatnya ISO (YYYY-MM-DD): urutan
    -- leksikografisnya sama dengan urutan tanggal, dan tetap benar meski ada
    -- baris yang membawa jam di belakangnya.
    AND pg.tanggal_pengukuran >= to_char(w.tgl_wo, 'YYYY-MM-DD')
    AND pg.tanggal_pengukuran <  to_char(w.tgl_wo + INTERVAL '1 month', 'YYYY-MM-DD')
    AND pg.hasil_penyeimbangan_id IS NULL
  ORDER BY pg.tanggal_pengukuran
  LIMIT 1
) p ON TRUE;

COMMENT ON VIEW public.wo_pengukuran_realisasi IS
  'Baris WO Pengukuran + realisasinya. Realisasi diturunkan dari pengukuran_gardu dalam jendela bulan WO, tidak disimpan.';

-- ── 4. Isi koordinat WO yang sudah terlanjur terbit ──────────────────────────
-- WO yang diterbitkan SEBELUM skrip ini punya lat/lng kosong — bukan karena
-- masternya tidak punya titik, tapi karena kolomnya memang belum ada saat baris
-- itu dibuat. Tanpa pengisian susulan, seluruh gardunya akan tampil "titik gardu
-- belum ada" di mobile, dan penyebabnya sangat tidak kelihatan.
--
-- Hanya mengisi yang MASIH kosong, jadi aman diulang dan tidak menimpa potret
-- yang sudah benar.
--
-- Casting-nya lewat CASE, bukan langsung di WHERE: tipe `gardu.lat/lng` warisan
-- migrasi Firebase dan tidak dipatok skrip mana pun. Kalau ternyata TEXT dan ada
-- satu saja isi yang bukan angka, cast telanjang akan menggagalkan SELURUH
-- perintah — dan Postgres tidak menjamin syarat WHERE dievaluasi berurutan,
-- jadi menaruh penjaga regex di WHERE saja tidak cukup.
WITH titik AS (
  SELECT
    kode,
    ulp,
    CASE WHEN lat::text ~ '^-?[0-9]+(\.[0-9]+)?$' THEN lat::text::double precision END AS lat,
    CASE WHEN lng::text ~ '^-?[0-9]+(\.[0-9]+)?$' THEN lng::text::double precision END AS lng
  FROM public.gardu
)
UPDATE public.wo_pengukuran_item i
SET lat = t.lat,
    lng = t.lng
FROM titik t
WHERE upper(t.kode) = upper(i.kode_gardu)
  AND upper(t.ulp)  = upper(i.ulp)
  AND i.lat IS NULL
  AND t.lat IS NOT NULL AND t.lng IS NOT NULL
  -- 0 bukan koordinat yang berarti di sini — ia penanda "kosong" pada data lama,
  -- dan menyimpannya apa adanya akan menaruh gardu di tengah Samudra Atlantik.
  AND t.lat <> 0 AND t.lng <> 0;

-- ── 5. Periksa hasilnya ──────────────────────────────────────────────────────
-- a. Kolom baru sudah ada:
--   SELECT table_name, column_name, data_type
--   FROM information_schema.columns
--   WHERE (table_name = 'wo_pengukuran_item' AND column_name IN ('lat','lng'))
--      OR (table_name = 'pengukuran_gardu'   AND column_name LIKE 'lokasi_%')
--   ORDER BY table_name, column_name;
--
-- b. Tipe koordinat di master — tabel `gardu` warisan migrasi Firebase dan
--    tipenya tidak dipatok skrip mana pun. Aplikasi sudah menanganinya secara
--    defensif, tapi bagus untuk diketahui:
--   SELECT column_name, data_type FROM information_schema.columns
--   WHERE table_name = 'gardu' AND column_name IN ('lat','lng');
--
-- c. Berapa gardu master yang BELUM punya koordinat — merekalah yang nanti
--    tampil "titik gardu belum ada" di mobile:
--   SELECT ulp,
--          count(*)                                                   AS total,
--          count(*) FILTER (WHERE lat IS NULL OR lng IS NULL
--                              OR lat::text = '' OR lng::text = '')   AS tanpa_koordinat
--   FROM gardu GROUP BY ulp ORDER BY ulp;
--
-- d. Hasil pengisian susulan — berapa baris WO yang sekarang punya titik:
--   SELECT w.ulp, w.tahun, w.bulan,
--          count(*)                                        AS baris_wo,
--          count(*) FILTER (WHERE i.lat IS NOT NULL)       AS ada_titik,
--          count(*) FILTER (WHERE i.lat IS NULL)           AS tanpa_titik
--   FROM wo_pengukuran_item i
--   JOIN wo_pengukuran w ON w.id = i.wo_id
--   GROUP BY 1,2,3 ORDER BY 2 DESC, 3 DESC, 1;
