-- =============================================================================
-- Bersihkan data UJI COBA inspeksi JTR (8 September 2026)
--
-- Dijalankan SEKALI, sesudah `jtr-penamaan.sql` yang baru, karena aturan
-- penamaannya berubah dua hal sekaligus:
--
--   1. Nomor 1 sekarang milik TIANG GARDU, jadi tiang JTR pertama bernomor 2.
--   2. Pemisah gardu jadi STRIP: `AM001-A2`, bukan `AM001_A2`. Garis bawah
--      dipakai khusus menandai percabangan, dan kalau dipakai juga sebagai
--      pemisah gardu maka `AM001_A3_D1` tidak bisa lagi dibaca — entah cabang
--      D1 dari tiang A3, entah gardu bernama `AM001_A3`.
--
-- 18 tiang uji yang ada memakai aturan lama. Nama tiang tidak pernah diubah
-- setelah mapan, jadi membiarkannya berarti dua aturan penamaan hidup
-- berdampingan di satu basis data selamanya. Data uji sehari lebih murah
-- dibuang daripada kebingungan yang dibawanya.
--
-- Cadangan seluruh baris ada di `scripts/cadangan-jtr-2026-09-08.json`.
--
-- YANG TIDAK DIHAPUS: `master_usulan` dan `master_audit`. Di situ ada 3 usulan
-- koreksi titik gardu AM001 yang masih berstatus "menunggu". Itu koreksi
-- terhadap MASTER, bukan data inspeksi — dan jalurnya sudah ada: setujui atau
-- tolak lewat tab "Usulan Koreksi" di web. Menghapus jejak audit dari belakang
-- layar persis kebalikan dari maksud sistem ini dibangun.
-- =============================================================================

BEGIN;

-- Lihat dulu apa yang akan hilang.
SELECT 'tiang'              AS tabel, count(*) FROM public.tiang WHERE gardu_kode IS NOT NULL
UNION ALL SELECT 'tiang_konduktor',   count(*) FROM public.tiang_konduktor
UNION ALL SELECT 'inspeksi_jtr',      count(*) FROM public.inspeksi_jtr
UNION ALL SELECT 'inspeksi_jtr_titik', count(*) FROM public.inspeksi_jtr_titik;

-- Anak lebih dulu, supaya tidak ada yang tertahan kunci asing.
DELETE FROM public.inspeksi_jtr_titik;
DELETE FROM public.inspeksi_jtr;
DELETE FROM public.tiang_konduktor;
DELETE FROM public.tiang WHERE gardu_kode IS NOT NULL;

-- Harus nol semua.
SELECT 'sisa tiang JTR' AS periksa, count(*) FROM public.tiang WHERE gardu_kode IS NOT NULL
UNION ALL SELECT 'sisa inspeksi', count(*) FROM public.inspeksi_jtr;

COMMIT;

-- =============================================================================
-- Sesudah ini, tiang pertama yang dititik di lapangan akan bernama AM001-A2.
-- Kalau hasilnya masih AM001_A1, berarti `jtr-penamaan.sql` belum dijalankan.
-- =============================================================================
