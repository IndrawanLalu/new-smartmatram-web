-- =============================================================================
-- JTR: temuan mengikuti setelan Pengaturan, bukan daftar tetap di dalam SQL
-- Jalankan SESUDAH `jtr-kabel-aksesoris.sql`. Idempoten.
--
-- ── MASALAHNYA ──────────────────────────────────────────────────────────────
-- Halaman Pengaturan JTR punya tombol "Normal / Temuan" di tiap pilihan, dan
-- admin wajar mengira tombol itu yang menentukan apa yang masuk rekap temuan.
-- Sampai sekarang TIDAK: view `inspeksi_jtr_temuan` menyebut nilainya langsung
-- di dalam SQL —
--
--     WHERE stay_kondisi = 'Rusak'
--     WHERE arde_kondisi = 'Putus'
--     WHERE aks_suspension = 'Rusak'
--
-- Akibatnya, pilihan BARU yang ditandai "Temuan" oleh admin tidak akan pernah
-- muncul di rekap. Petugas mencatatnya di lapangan, tombolnya menyala merah di
-- halaman pengaturan, dan tidak terjadi apa-apa. Tidak ada galat, tidak ada
-- tanda — cuma tidak ada. Setelan yang diam-diam tidak bekerja lebih berbahaya
-- daripada setelan yang tidak ada, karena orang telanjur percaya.
--
-- Beberapa kategori kebetulan selamat karena SQL-nya menulis "apa pun selain
-- Baik" (kondisi tiang, andongan, kabel, jamperan). Yang celaka justru yang
-- ditulis rapi menyebut satu nilai: stay, arde, dan aksesoris. Kerapian itulah
-- yang membuatnya patah.
--
-- ── PERBAIKANNYA ────────────────────────────────────────────────────────────
-- Satu sumber kebenaran: `jtr_ref.normal`. Sesudah ini, menambah pilihan baru
-- dan menandainya "Temuan" di halaman Pengaturan langsung berlaku di seluruh
-- rekap — tanpa mengubah SQL, tanpa rilis apa pun.
-- =============================================================================

-- ── 1. Satu pertanyaan, satu tempat menjawabnya ──────────────────────────────

CREATE OR REPLACE FUNCTION public.jtr_normal(p_kategori TEXT, p_kode TEXT)
RETURNS BOOLEAN
LANGUAGE sql STABLE AS $$
  -- Tidak menyaring `aktif`: pilihan yang dinonaktifkan tetap harus bisa
  -- dinilai, karena data lama masih menyimpannya. Nonaktif cuma berarti
  -- "jangan tawarkan lagi ke petugas".
  --
  -- Nilai yang TIDAK DIKENAL sama sekali dianggap TEMUAN, bukan normal. Itu
  -- pilihan yang disengaja: nilai asing di kolom kondisi hampir selalu tanda
  -- ada yang keliru, dan lebih baik ia muncul di rekap untuk ditanyakan
  -- daripada hilang tanpa ada yang tahu.
  SELECT COALESCE(
    (SELECT r.normal FROM public.jtr_ref r
      WHERE r.kategori = p_kategori AND r.kode = p_kode),
    false);
$$;

COMMENT ON FUNCTION public.jtr_normal IS
  'Apakah sebuah jawaban bukan temuan, menurut halaman Pengaturan JTR. Satu-satunya penentu — jangan pernah menulis ulang daftarnya di dalam view.';

GRANT EXECUTE ON FUNCTION public.jtr_normal TO authenticated;


-- ── 2. View temuan, sekarang menuruti setelan ────────────────────────────────

DROP VIEW IF EXISTS public.jtr_penyapuan;
DROP VIEW IF EXISTS public.jtr_rekap_temuan;
DROP VIEW IF EXISTS public.inspeksi_jtr_temuan;

CREATE VIEW public.inspeksi_jtr_temuan AS
WITH dasar AS (
  SELECT
    i.id AS inspeksi_id, i.gardu_kode, i.ulp, i.penyulang, i.tgl_mulai,
    t.id AS tiang_id, t.kode AS tiang_kode, t.jurusan,
    t.kondisi, t.arde_kondisi, t.andongan, t.rawan_row,
    t.stay_kondisi, t.jamperan, t.catatan_perbaikan, t.foto_temuan
  FROM public.inspeksi_jtr i
  JOIN public.inspeksi_jtr_titik x ON x.inspeksi_id = i.id
  JOIN public.tiang t ON t.id = x.tiang_id
), kabel AS (
  SELECT
    d.inspeksi_id, d.gardu_kode, d.ulp, d.penyulang, d.tgl_mulai,
    d.tiang_id, d.jurusan,
    CASE WHEN k.nomor = 1 THEN d.tiang_kode
         ELSE d.tiang_kode || '.' || k.nomor END AS tiang_kode,
    k.kondisi AS kabel_kondisi,
    k.aks_suspension, k.aks_large_angle, k.aks_dead_end,
    k.foto_temuan
  FROM dasar d
  JOIN public.tiang_konduktor k ON k.tiang_id = d.tiang_id
)
SELECT * FROM (
  -- Tiap cabang berpola sama: NULL berarti belum dijawab (bukan temuan), dan
  -- selebihnya ditanyakan ke `jtr_normal`. Tidak ada satu pun nilai yang
  -- disebut langsung di sini — itulah inti perbaikan berkas ini.
  SELECT inspeksi_id, tiang_id, tiang_kode, gardu_kode, ulp, penyulang, jurusan, tgl_mulai,
         'Tiang ' || lower(kondisi) AS temuan,
         -- Urgensi masih ditetapkan di sini: dia menyangkut seberapa cepat
         -- harus ditangani, dan itu bukan sesuatu yang bisa disimpulkan dari
         -- "apakah ini temuan". Kalau nanti perlu diatur admin juga, tempatnya
         -- satu kolom baru di `jtr_ref`, bukan di sini.
         CASE WHEN kondisi = 'Miring' THEN 'Sedang' ELSE 'Tinggi' END::text AS urgensi,
         foto_temuan->>'kondisi' AS foto_url
  FROM dasar
  WHERE kondisi IS NOT NULL AND NOT public.jtr_normal('kondisi_tiang', kondisi)
  UNION ALL
  SELECT inspeksi_id, tiang_id, tiang_kode, gardu_kode, ulp, penyulang, jurusan, tgl_mulai,
         'Arde ' || lower(arde_kondisi), 'Tinggi', foto_temuan->>'ardeKondisi'
  FROM dasar
  WHERE arde_kondisi IS NOT NULL AND NOT public.jtr_normal('kondisi_arde', arde_kondisi)
  UNION ALL
  SELECT inspeksi_id, tiang_id, tiang_kode, gardu_kode, ulp, penyulang, jurusan, tgl_mulai,
         'Andongan ' || lower(andongan), 'Sedang', foto_temuan->>'andongan'
  FROM dasar
  WHERE andongan IS NOT NULL AND NOT public.jtr_normal('kondisi_andongan', andongan)
  UNION ALL
  SELECT inspeksi_id, tiang_id, tiang_kode, gardu_kode, ulp, penyulang, jurusan, tgl_mulai,
         'Stay ' || lower(stay_kondisi), 'Sedang', foto_temuan->>'stayKondisi'
  FROM dasar
  WHERE stay_kondisi IS NOT NULL AND NOT public.jtr_normal('kondisi_stay', stay_kondisi)
  UNION ALL
  SELECT inspeksi_id, tiang_id, tiang_kode, gardu_kode, ulp, penyulang, jurusan, tgl_mulai,
         'Rawan ROW: ' || lower(r), 'Sedang', foto_temuan->>'rawanRow'
  FROM dasar, unnest(rawan_row) AS r
  WHERE r IS NOT NULL AND r <> '' AND NOT public.jtr_normal('rawan_row', r)
  UNION ALL
  SELECT inspeksi_id, tiang_id, tiang_kode, gardu_kode, ulp, penyulang, jurusan, tgl_mulai,
         'Jamperan ' || lower(j->>'kondisi'), 'Sedang', foto_temuan->>'jamperanKondisi'
  FROM dasar, jsonb_array_elements(jamperan) AS j
  WHERE j->>'kondisi' IS NOT NULL
    AND NOT public.jtr_normal('kondisi_jamperan', j->>'kondisi')
  UNION ALL
  -- Catatan bebas tidak wajib berfoto: yang dilaporkannya belum tentu sesuatu
  -- yang bisa difoto ("perlu dirapikan saat pemeliharaan berikutnya").
  SELECT inspeksi_id, tiang_id, tiang_kode, gardu_kode, ulp, penyulang, jurusan, tgl_mulai,
         'Ada catatan perbaikan', 'Sedang', NULL
  FROM dasar WHERE btrim(COALESCE(catatan_perbaikan, '')) <> ''

  -- ── Per kabel ──
  UNION ALL
  SELECT inspeksi_id, tiang_id, tiang_kode, gardu_kode, ulp, penyulang, jurusan, tgl_mulai,
         'Konduktor ' || lower(kabel_kondisi),
         -- Putus memutus pelayanan; sisanya menuju ke situ.
         CASE WHEN kabel_kondisi = 'Putus' THEN 'Tinggi' ELSE 'Sedang' END,
         foto_temuan->>'konduktorKondisi'
  FROM kabel
  WHERE kabel_kondisi IS NOT NULL AND NOT public.jtr_normal('kondisi_kabel', kabel_kondisi)
  UNION ALL
  SELECT inspeksi_id, tiang_id, tiang_kode, gardu_kode, ulp, penyulang, jurusan, tgl_mulai,
         'Suspension ' || lower(aks_suspension), 'Sedang', foto_temuan->>'aksSuspension'
  FROM kabel
  WHERE aks_suspension IS NOT NULL
    AND NOT public.jtr_normal('kondisi_aksesoris', aks_suspension)
  UNION ALL
  SELECT inspeksi_id, tiang_id, tiang_kode, gardu_kode, ulp, penyulang, jurusan, tgl_mulai,
         'Large angle ' || lower(aks_large_angle), 'Sedang', foto_temuan->>'aksLargeAngle'
  FROM kabel
  WHERE aks_large_angle IS NOT NULL
    AND NOT public.jtr_normal('kondisi_aksesoris', aks_large_angle)
  UNION ALL
  SELECT inspeksi_id, tiang_id, tiang_kode, gardu_kode, ulp, penyulang, jurusan, tgl_mulai,
         'Dead end ' || lower(aks_dead_end), 'Sedang', foto_temuan->>'aksDeadEnd'
  FROM kabel
  WHERE aks_dead_end IS NOT NULL
    AND NOT public.jtr_normal('kondisi_aksesoris', aks_dead_end)
) s;

COMMENT ON VIEW public.inspeksi_jtr_temuan IS
  'Temuan diturunkan dari keadaan yang tercatat, dan APA yang dianggap temuan ditentukan halaman Pengaturan JTR lewat jtr_ref.normal. Jangan pernah menyebut nilai kondisi langsung di view ini.';

CREATE VIEW public.jtr_rekap_temuan AS
SELECT ulp, gardu_kode, jurusan, temuan, urgensi,
       count(*) AS jumlah,
       count(*) FILTER (WHERE foto_url IS NULL) AS tanpa_foto
FROM public.inspeksi_jtr_temuan
GROUP BY ulp, gardu_kode, jurusan, temuan, urgensi;

CREATE VIEW public.jtr_penyapuan AS
SELECT
  i.id, i.gardu_kode, i.ulp, i.penyulang, i.tgl_mulai, i.tgl_selesai, i.status,
  i.inspektor_nama, i.petugas_2, i.catatan,
  i.verified_at, i.verified_by, i.verified_note,
  g.nama  AS gardu_nama,
  g.alamat AS gardu_alamat,
  k.tiang_aktif,
  k.sudah_diperiksa,
  k.tiang_baru,
  (SELECT count(*) FROM public.inspeksi_jtr_temuan tm WHERE tm.inspeksi_id = i.id) AS jumlah_temuan,
  COALESCE((
    SELECT round(sum(gg.panjang_rute_km)::numeric, 3)
    FROM public.gardu_jtr_panjang gg
    WHERE upper(gg.gardu_kode) = upper(i.gardu_kode) AND upper(gg.ulp) = upper(i.ulp)
  ), 0) AS panjang_km
FROM public.inspeksi_jtr i
LEFT JOIN public.gardu g
  ON upper(g.kode) = upper(i.gardu_kode) AND upper(g.ulp) = upper(i.ulp)
LEFT JOIN public.inspeksi_jtr_kelengkapan k ON k.inspeksi_id = i.id;

GRANT SELECT ON public.inspeksi_jtr_temuan TO authenticated;
GRANT SELECT ON public.jtr_rekap_temuan    TO authenticated;
GRANT SELECT ON public.jtr_penyapuan       TO authenticated;


-- ── 3. Penjaga: kode pilihan tidak boleh dibiarkan berbeda dari labelnya ─────
-- Bukan larangan — hanya pemberitahuan lewat komentar, karena ada satu kasus
-- sah: `ukuran_tiang` menyimpan '9' tapi menampilkan '9 m'.
--
-- Yang berbahaya kasus lainnya: pilihan yang KODE-nya salah ketik lalu
-- LABEL-nya dibetulkan. Layar menampilkan yang benar, database menyimpan yang
-- salah, dan tidak ada yang menyadarinya sampai ada yang membaca datanya
-- mentah-mentah setahun kemudian.

COMMENT ON COLUMN public.jtr_ref.kode IS
  'NILAI YANG BENAR-BENAR TERSIMPAN di kolom tiang/tiang_konduktor. Tidak bisa diubah sesudah dipakai. Label boleh berbeda (mis. kode "9" label "9 m"), tapi kalau bedanya tidak disengaja, yang masuk data adalah kode-nya — bukan yang terlihat di layar.';


-- =============================================================================
-- Periksa hasilnya
-- =============================================================================
-- a. Setelan "Temuan" di halaman Pengaturan, dan apakah benar-benar dipakai:
--      SELECT kategori, kode, label, normal FROM jtr_ref
--      WHERE NOT normal ORDER BY kategori, urutan;
--
-- b. Pilihan yang kode dan labelnya berbeda — periksa apakah memang disengaja:
--      SELECT kategori, kode, label FROM jtr_ref WHERE kode <> label;
--
-- c. Nilai yang tersimpan di data tapi TIDAK ADA di daftar pilihan mana pun.
--    Sesudah skrip ini, semuanya akan terhitung temuan — jadi daftar ini harus
--    kosong, dan kalau tidak, itu pekerjaan membereskan data:
--      SELECT 'kondisi_stay' AS kategori, stay_kondisi AS nilai, count(*)
--      FROM tiang WHERE stay_kondisi IS NOT NULL
--        AND NOT EXISTS (SELECT 1 FROM jtr_ref r
--                        WHERE r.kategori = 'kondisi_stay' AND r.kode = tiang.stay_kondisi)
--      GROUP BY 2;
--
-- d. Jenis temuan yang sekarang dilaporkan:
--      SELECT temuan, urgensi, count(*) FROM inspeksi_jtr_temuan
--      GROUP BY temuan, urgensi ORDER BY 3 DESC;
-- =============================================================================
