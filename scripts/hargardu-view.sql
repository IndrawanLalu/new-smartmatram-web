-- =============================================================================
-- Fase 3.1c — HARGARDU: view turunan
-- Jalankan SESUDAH `hargardu-acuan.sql`. Idempoten.
--
-- Tidak ada satu pun angka di sini yang diketik orang. Semuanya diturunkan dari
-- catatan pemeliharaan — termasuk daftar pekerjaan tertunda, yang justru itulah
-- alasannya tidak disimpan sebagai tabel tersendiri: daftar yang dicatat manual
-- pasti melenceng begitu barangnya sudah diperbaiki tapi barisnya lupa ditutup.
-- =============================================================================

-- URUTAN MEMBUANGNYA PENTING: yang bergantung dibuang lebih dulu. Kelima view
-- di bawah ini bersandar pada `gardu_kondisi_terakhir`, dan membuangnya duluan
-- membuat Postgres menolak dengan "other objects depend on it" — galat yang cuma
-- muncul saat skrip dijalankan ULANG, bukan saat pertama kali dipasang.
DROP VIEW IF EXISTS public.pemeliharaan_gardu_ringkas;
DROP VIEW IF EXISTS public.hargardu_rekap_opsi;
DROP VIEW IF EXISTS public.hargardu_rekap_item;
DROP VIEW IF EXISTS public.gardu_perlu_perbaikan;
DROP VIEW IF EXISTS public.gardu_kondisi_terakhir;
DROP VIEW IF EXISTS public.hargardu_cakupan;

-- ── 1. Keadaan gardu sekarang ─────────────────────────────────
-- Dari pemeliharaan TERVERIFIKASI terakhir, bukan yang terakhir dikerjakan.
-- Angka resmi tidak boleh digerakkan catatan yang belum diperiksa siapa pun.
--
-- Aplikasi lapangan membaca catatan terakhir langsung dari tabelnya — di sana
-- yang berguna justru apa yang baru saja dicatat, disetujui atau belum.

CREATE VIEW public.gardu_kondisi_terakhir AS
WITH terakhir AS (
  SELECT DISTINCT ON (upper(gardu_kode), upper(ulp))
         id, gardu_kode, ulp, tgl_selesai
  FROM public.pemeliharaan_gardu
  WHERE status = 'Diverifikasi'
  ORDER BY upper(gardu_kode), upper(ulp), tgl_selesai DESC NULLS LAST, created_at DESC
)
SELECT
  t.gardu_kode,
  t.ulp,
  t.id            AS pemeliharaan_id,
  t.tgl_selesai,
  p.item_kode,
  i.nama          AS item_nama,
  i.kelompok,
  i.tampil_dashboard,
  p.fasa,
  p.nilai,
  o.label         AS nilai_label,
  p.nilai_angka,
  p.catatan,
  -- Item bertipe angka dan teks tidak punya daftar pilihan, jadi tidak punya
  -- penilaian normal/tidak. Dianggap normal supaya tidak ikut jadi temuan palsu.
  COALESCE(o.normal, true) AS normal
FROM terakhir t
JOIN public.pemeliharaan_gardu_periksa p ON p.pemeliharaan_id = t.id
JOIN public.hargardu_item_ref i          ON i.kode = p.item_kode
LEFT JOIN public.hargardu_opsi_ref o     ON o.item_kode = p.item_kode AND o.kode = p.nilai;

COMMENT ON VIEW public.gardu_kondisi_terakhir IS
  'Keadaan tiap item per gardu menurut pemeliharaan terverifikasi terakhir. Dasar semua angka HARGARDU.';

-- ── 2. Daftar pekerjaan tertunda ──────────────────────────────
-- Bukan tabel, TURUNAN. Item yang keadaannya belum normal pada pemeliharaan
-- terverifikasi terakhir — dan hilang sendiri dari daftar begitu pemeliharaan
-- berikutnya mencatatnya normal. Tidak ada yang perlu menutup baris apa pun,
-- jadi tidak ada baris yang tertinggal terbuka setelah barangnya diperbaiki.

CREATE VIEW public.gardu_perlu_perbaikan AS
SELECT
  k.gardu_kode,
  k.ulp,
  g.nama    AS gardu_nama,
  g.alamat  AS gardu_alamat,
  g.feeder  AS penyulang,
  k.item_kode,
  k.item_nama,
  k.kelompok,
  k.fasa,
  k.nilai,
  k.nilai_label,
  k.catatan,
  k.tgl_selesai AS ditemukan_pada,
  k.pemeliharaan_id,
  m.pr_keterangan,
  -- Sudah dijadikan Work Order atau masih menganggur.
  (tl.wo_item_id IS NOT NULL) AS sudah_di_wo,
  tl.wo_item_id,
  tl.ditugaskan_pada
FROM public.gardu_kondisi_terakhir k
JOIN public.pemeliharaan_gardu m ON m.id = k.pemeliharaan_id
LEFT JOIN public.gardu g
  ON upper(g.kode) = upper(k.gardu_kode) AND upper(g.ulp) = upper(k.ulp)
LEFT JOIN public.tindak_lanjut_gardu tl
  ON upper(tl.gardu_kode) = upper(k.gardu_kode)
 AND upper(tl.ulp) = upper(k.ulp)
 AND tl.item_kode = k.item_kode
 AND tl.fasa = k.fasa
WHERE NOT k.normal;

COMMENT ON VIEW public.gardu_perlu_perbaikan IS
  'Pekerjaan tertunda, DITURUNKAN dari kondisi item terakhir — bukan dicatat. Hilang sendiri begitu pemeliharaan berikutnya mencatatnya normal.';

-- ── 3. Rekap tiga kelompok per item ─────────────────────────────
-- TIDAK DIKETAHUI ≠ TIDAK ADA.
--
-- Ampenan punya 894 gardu. Sebelum semuanya pernah dipelihara, sebagian besar
-- status tekepnya belum diketahui — bukan "belum terpasang". Menggabungkan
-- keduanya membuat laporan terlihat bagus PERSIS KARENA datanya belum ada, dan
-- angka yang salah tanpa tanda jauh lebih berbahaya daripada angka yang kosong.
--
-- Kelompok ketiga sekaligus jadi ukuran cakupan HARGARDU: satu angka, dua guna.
--
-- Untuk item per-fasa, satu gardu dihitung TIDAK NORMAL bila salah satu fasanya
-- tidak normal. Cut out fasa S yang pecah tetap berarti gardu itu perlu
-- dikerjakan, meski R dan T-nya baik.

CREATE VIEW public.hargardu_rekap_item AS
WITH gardu_unit AS (
  SELECT upper(ulp) AS ulp, count(*) AS jumlah_gardu
  FROM public.gardu
  WHERE kode IS NOT NULL AND ulp IS NOT NULL
  GROUP BY upper(ulp)
), per_gardu AS (
  SELECT upper(ulp) AS ulp, upper(gardu_kode) AS gardu_kode, item_kode,
         bool_and(normal) AS semua_normal
  FROM public.gardu_kondisi_terakhir
  GROUP BY upper(ulp), upper(gardu_kode), item_kode
), hitung AS (
  SELECT ulp, item_kode,
         count(*) FILTER (WHERE semua_normal)     AS normal,
         count(*) FILTER (WHERE NOT semua_normal) AS tidak_normal
  FROM per_gardu
  GROUP BY ulp, item_kode
)
SELECT
  gu.ulp,
  i.kode  AS item_kode,
  i.nama  AS item_nama,
  i.kelompok,
  i.tampil_dashboard,
  gu.jumlah_gardu,
  COALESCE(h.normal, 0)       AS normal,
  COALESCE(h.tidak_normal, 0) AS tidak_normal,
  gu.jumlah_gardu - COALESCE(h.normal, 0) - COALESCE(h.tidak_normal, 0)
                              AS belum_diperiksa,
  round(
    100.0 * (COALESCE(h.normal, 0) + COALESCE(h.tidak_normal, 0))
    / NULLIF(gu.jumlah_gardu, 0), 1)  AS persen_diperiksa
FROM gardu_unit gu
CROSS JOIN public.hargardu_item_ref i
LEFT JOIN hitung h ON h.ulp = gu.ulp AND h.item_kode = i.kode
WHERE i.aktif;

COMMENT ON VIEW public.hargardu_rekap_item IS
  'Tiga kelompok per item per ULP: normal, tidak normal, BELUM DIPERIKSA. Kelompok ketiga sekaligus ukuran cakupan HARGARDU.';

-- ── 4. Sebaran jawaban per pilihan ──────────────────────────────
-- Untuk pertanyaan yang jawabannya bukan bagus-rusak melainkan SEBARAN —
-- "sambungan outlet gardu pakai joint press atau konektor", "berapa yang masih
-- A3C telanjang". Tiga kelompok tidak menjawab itu; yang dibutuhkan cacahan
-- per pilihan.

CREATE VIEW public.hargardu_rekap_opsi AS
SELECT
  upper(k.ulp)  AS ulp,
  k.item_kode,
  k.item_nama,
  k.nilai       AS opsi_kode,
  k.nilai_label AS opsi_label,
  k.normal,
  count(DISTINCT upper(k.gardu_kode)) AS jumlah_gardu
FROM public.gardu_kondisi_terakhir k
WHERE k.nilai IS NOT NULL
GROUP BY upper(k.ulp), k.item_kode, k.item_nama, k.nilai, k.nilai_label, k.normal;

-- ── 5. Cakupan dan kelengkapan master ───────────────────────────
-- Berapa jauh master gardu sudah benar-benar dikonfirmasi orang yang berdiri di
-- bawahnya. 2.536 baris hasil impor AMG tidak satu pun pernah dilihat orang —
-- angka inilah yang bergerak sejalan pekerjaan HARGARDU.

CREATE VIEW public.hargardu_cakupan AS
WITH gardu_unit AS (
  SELECT upper(ulp) AS ulp, count(*) AS jumlah_gardu,
         count(*) FILTER (WHERE master_terverifikasi_at IS NOT NULL) AS master_terverifikasi
  FROM public.gardu
  WHERE kode IS NOT NULL AND ulp IS NOT NULL
  GROUP BY upper(ulp)
), kerja AS (
  SELECT upper(ulp) AS ulp,
         count(DISTINCT upper(gardu_kode)) AS pernah_dipelihara,
         count(DISTINCT upper(gardu_kode))
           FILTER (WHERE tgl_selesai >= now() - INTERVAL '12 months') AS dipelihara_12_bulan,
         max(tgl_selesai) AS terakhir
  FROM public.pemeliharaan_gardu
  WHERE status = 'Diverifikasi'
  GROUP BY upper(ulp)
)
SELECT
  gu.ulp,
  gu.jumlah_gardu,
  COALESCE(k.pernah_dipelihara, 0)    AS pernah_dipelihara,
  COALESCE(k.dipelihara_12_bulan, 0)  AS dipelihara_12_bulan,
  gu.master_terverifikasi,
  round(100.0 * gu.master_terverifikasi / NULLIF(gu.jumlah_gardu, 0), 1) AS persen_master_lengkap,
  k.terakhir
FROM gardu_unit gu
LEFT JOIN kerja k ON k.ulp = gu.ulp;

-- ── 6. Ringkasan pekerjaan — bahan layar persetujuan ──────────────────
-- Yang perlu diketahui admin sebelum memutuskan, dalam satu baris: seberapa
-- lengkap isiannya, berapa yang tidak normal, dan berapa usulan koreksi master
-- yang lahir dari pekerjaan ini.

CREATE VIEW public.pemeliharaan_gardu_ringkas AS
SELECT
  m.id, m.gardu_kode, m.ulp, m.penyulang, m.status, m.sumber,
  m.tgl_rencana, m.tgl_padam, m.tgl_selesai,
  m.regu_1, m.regu_2, m.petugas_nama,
  m.catatan_perbaikan, m.pr_keterangan,
  m.verified_at, m.verified_by, m.verified_note,
  g.nama   AS gardu_nama,
  g.alamat AS gardu_alamat,
  g.daya   AS daya_master,
  (SELECT count(*) FROM public.pemeliharaan_gardu_periksa p
    WHERE p.pemeliharaan_id = m.id)                       AS item_terisi,
  (SELECT count(*) FROM public.gardu_kondisi_terakhir k
    WHERE k.pemeliharaan_id = m.id AND NOT k.normal)      AS item_tidak_normal,
  (SELECT count(*) FROM public.pemeliharaan_gardu_foto f
    WHERE f.pemeliharaan_id = m.id)                       AS jumlah_foto,
  (SELECT count(*) FROM public.hargardu_foto_ref r
    WHERE r.wajib AND r.aktif)                            AS foto_wajib,
  (SELECT count(*) FROM public.master_usulan u
    WHERE u.sumber_modul = 'pemeliharaan_gardu' AND u.sumber_id = m.id
      AND u.status = 'menunggu')                          AS usulan_menunggu
FROM public.pemeliharaan_gardu m
LEFT JOIN public.gardu g
  ON upper(g.kode) = upper(m.gardu_kode) AND upper(g.ulp) = upper(m.ulp);

-- ── 7. Hak akses ─────────────────────────────────────────

GRANT SELECT ON public.gardu_kondisi_terakhir     TO authenticated;
GRANT SELECT ON public.gardu_perlu_perbaikan      TO authenticated;
GRANT SELECT ON public.hargardu_rekap_item        TO authenticated;
GRANT SELECT ON public.hargardu_rekap_opsi        TO authenticated;
GRANT SELECT ON public.hargardu_cakupan           TO authenticated;
GRANT SELECT ON public.pemeliharaan_gardu_ringkas TO authenticated;

-- =============================================================================
-- Periksa hasilnya
-- =============================================================================
-- a. Tiga kelompok tekep — yang diminta pemilik pekerjaan:
--      SELECT ulp, item_nama, normal, tidak_normal, belum_diperiksa, persen_diperiksa
--      FROM hargardu_rekap_item WHERE tampil_dashboard ORDER BY ulp, item_nama;
--
-- b. Sebaran sambungan outlet — joint press lawan konektor:
--      SELECT * FROM hargardu_rekap_opsi WHERE item_kode = 'sambungan_outlet';
--
-- c. Pekerjaan tertunda yang belum di-WO-kan:
--      SELECT gardu_kode, item_nama, nilai_label, ditemukan_pada
--      FROM gardu_perlu_perbaikan WHERE NOT sudah_di_wo ORDER BY ditemukan_pada;
--
-- d. Cari lewat teks keterangan — untuk hal yang tidak bisa dibakukan:
--      SELECT gardu_kode, pr_keterangan FROM pemeliharaan_gardu
--      WHERE to_tsvector('simple', coalesce(catatan_perbaikan,'') || ' ' ||
--                        coalesce(pr_keterangan,'')) @@ plainto_tsquery('simple','material');
--
-- e. Kelengkapan master:
--      SELECT * FROM hargardu_cakupan;
-- =============================================================================
