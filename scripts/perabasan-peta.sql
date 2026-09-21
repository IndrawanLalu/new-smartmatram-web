-- =============================================================================
-- Perabasan: peta segmen + foto pohon
-- Jalankan SESUDAH `perabasan-pohon-belum-verifikasi.sql`. Idempoten.
--
-- ── KENAPA ──────────────────────────────────────────────────────────────────
-- Bapak 21 Sep: "perabasan juga punya map segmennya biar terlihat, dan foto
-- pohonnya harusnya kan terlihat di perabasan mobile" — lalu: "lebih baik
-- pohonnya terlihat di peta daripada di daftar."
--
-- Memang begitu bentuk pekerjaannya. Yang dicari regu bukan nama tiang
-- melainkan TEMPATNYA: "PRM-004" tidak memberi tahu ke mana harus berjalan,
-- sebuah titik di peta memberi tahu. Daftar berguna untuk mencentang, peta
-- berguna untuk sampai ke sana — dan yang dikerjakan regu di lapangan adalah
-- yang kedua.
--
-- Fotonya sudah tersimpan sejak awal di `inspeksi_jtm_periksa.foto_url`;
-- saya yang tidak membawanya keluar. Diperiksa 21 Sep: tiga jawaban vegetasi
-- sudah berfoto.
-- =============================================================================


-- ── 1. Foto ikut dibawa ──────────────────────────────────────────────────────
-- Kolom lama dipertahankan urutannya; `foto_url` ditambahkan di belakang.

CREATE OR REPLACE VIEW public.perabasan_pohon AS
WITH per_titik AS (
  SELECT
    tk.tiang_id,
    m.status                                                 AS status_inspeksi,
    COALESCE(m.tgl_selesai, m.tgl_mulai)                     AS tgl,
    max(p.nilai) FILTER (WHERE p.item_kode = 'vegetasi')     AS vegetasi,
    max(p.nilai) FILTER (WHERE p.item_kode = 'jenis_pohon')  AS jenis_pohon,
    -- Foto diambil dari jawaban VEGETASI-nya, bukan dari jawaban mana pun yang
    -- kebetulan berfoto di titik itu: satu tiang bisa punya foto isolator,
    -- foto arde, dan foto pohon sekaligus.
    max(p.foto_url) FILTER (WHERE p.item_kode = 'vegetasi')  AS foto_url,
    max(p.catatan)  FILTER (WHERE p.item_kode = 'vegetasi')  AS catatan,
    row_number() OVER (
      PARTITION BY tk.tiang_id
      ORDER BY COALESCE(m.tgl_selesai, m.tgl_mulai) DESC NULLS LAST, tk.id DESC
    )                                                        AS urut
  FROM public.inspeksi_jtm_titik tk
  JOIN public.inspeksi_jtm m         ON m.id = tk.inspeksi_id
  JOIN public.inspeksi_jtm_periksa p ON p.titik_id = tk.id
  WHERE p.item_kode IN ('vegetasi', 'jenis_pohon')
    AND m.status <> 'Dibatalkan'
  GROUP BY tk.tiang_id, tk.id, m.status, m.tgl_selesai, m.tgl_mulai
)
SELECT
  st.segmen_id,
  x.tiang_id,
  t.kode  AS tiang_kode,
  t.lat,
  t.lng,
  x.vegetasi,
  x.jenis_pohon,
  x.tgl   AS tgl_inspeksi,
  x.status_inspeksi,
  (x.status_inspeksi = 'Diverifikasi') AS terverifikasi,

  -- ── Baru ──
  x.foto_url,
  x.catatan
FROM per_titik x
JOIN public.segmen_tiang st ON st.tiang_id = x.tiang_id
JOIN public.tiang t         ON t.id = x.tiang_id
WHERE x.urut = 1
  AND x.vegetasi IN ('berpotensi', 'menyentuh');

COMMENT ON VIEW public.perabasan_pohon IS
  'Pohon yang menunggu dirabas per segmen, dari jawaban vegetasi inspeksi JTM, lengkap dengan foto dan koordinat tiangnya. Inspeksi yang belum diverifikasi ikut tampil tapi ditandai; yang Dibatalkan tidak ikut.';


-- ── 2. Bentuk segmen di peta ─────────────────────────────────────────────────
-- Tiang dan BENTANGNYA. Bukan satu garis berurutan: jaringan bercabang, dan
-- garis tunggal yang dipaksa melewati semua titik akan menggambar zig-zag yang
-- tidak pernah ada di lapangan.
--
-- Tiap baris satu bentang — sepasang koordinat. Bentang yang salah satu
-- ujungnya di luar segmen ini sengaja tidak ikut, sama persis dengan aturan
-- yang dipakai `segmen_panjang` menghitung panjangnya. Kalau berbeda, garis di
-- peta akan lebih panjang daripada angka km yang tertulis di sebelahnya.

CREATE OR REPLACE VIEW public.perabasan_segmen_bentang AS
SELECT
  sa.segmen_id,
  g.tiang_id,
  g.induk_id,
  t.kode  AS kode,
  t.lat   AS lat,
  t.lng   AS lng,
  i.kode  AS induk_kode,
  i.lat   AS induk_lat,
  i.lng   AS induk_lng,
  g.panjang_m
FROM public.tiang_gawang_jtm g
JOIN public.segmen_tiang sa ON sa.tiang_id = g.tiang_id
JOIN public.segmen_tiang si ON si.segmen_id = sa.segmen_id AND si.tiang_id = g.induk_id
JOIN public.tiang t ON t.id = g.tiang_id
JOIN public.tiang i ON i.id = g.induk_id
WHERE t.lat IS NOT NULL AND t.lng IS NOT NULL
  AND i.lat IS NOT NULL AND i.lng IS NOT NULL;

COMMENT ON VIEW public.perabasan_segmen_bentang IS
  'Bentang (gawang) tiap segmen beserta koordinat kedua ujungnya, untuk menggambar bentuk jaringan di peta. Aturan pemilihannya sama persis dengan segmen_panjang — kalau berbeda, garis di peta tidak sepanjang angka km di sebelahnya.';


-- ── 3. Tiang segmen, untuk titik di peta ─────────────────────────────────────
-- Termasuk yang TIDAK berpohon: regu perlu melihat jalur yang harus disisir,
-- bukan cuma tiga titik pohon yang tersebar tanpa konteks.

CREATE OR REPLACE VIEW public.perabasan_segmen_tiang AS
SELECT
  st.segmen_id,
  t.id AS tiang_id,
  t.kode,
  t.lat,
  t.lng,
  EXISTS (
    SELECT 1 FROM public.perabasan_pohon p
    WHERE p.segmen_id = st.segmen_id AND p.tiang_id = t.id
  ) AS ada_pohon
FROM public.segmen_tiang st
JOIN public.tiang t ON t.id = st.tiang_id
WHERE t.lat IS NOT NULL AND t.lng IS NOT NULL;

COMMENT ON VIEW public.perabasan_segmen_tiang IS
  'Tiang tiap segmen beserta koordinatnya, untuk peta regu rabas. Yang tidak berpohon ikut — regu perlu melihat jalur yang disisir, bukan tiga titik tanpa konteks.';


-- ── 4. Hak akses ─────────────────────────────────────────────────────────────

GRANT SELECT ON public.perabasan_pohon          TO authenticated;
GRANT SELECT ON public.perabasan_segmen_bentang TO authenticated;
GRANT SELECT ON public.perabasan_segmen_tiang   TO authenticated;


-- =============================================================================
-- Periksa hasilnya
-- =============================================================================
-- a. Pohon PERUMNAS, sekarang lengkap dengan foto dan titiknya:
--      SELECT tiang_kode, jenis_pohon, vegetasi, lat, lng,
--             foto_url IS NOT NULL AS ada_foto, terverifikasi
--      FROM perabasan_pohon p
--      JOIN segmen s ON s.id = p.segmen_id
--      WHERE s.penyulang = 'PERUMNAS';
--
-- b. Bentuk segmen — berapa bentang yang bisa digambar:
--      SELECT s.penyulang, s.nama,
--             (SELECT count(*) FROM perabasan_segmen_tiang x WHERE x.segmen_id = s.id) AS titik,
--             (SELECT count(*) FROM perabasan_segmen_bentang b WHERE b.segmen_id = s.id) AS garis
--      FROM segmen s ORDER BY 1, 2;
--
-- c. Segmen yang tiangnya ada tapi TIDAK bisa digambar garisnya — petanya
--    hanya akan berupa titik-titik lepas, dan itu wajar selama gawangnya
--    belum terbentuk:
--      SELECT s.nama FROM segmen s
--      WHERE EXISTS (SELECT 1 FROM perabasan_segmen_tiang x WHERE x.segmen_id = s.id)
--        AND NOT EXISTS (SELECT 1 FROM perabasan_segmen_bentang b WHERE b.segmen_id = s.id);
-- =============================================================================
