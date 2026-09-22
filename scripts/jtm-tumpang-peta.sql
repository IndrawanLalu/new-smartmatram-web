-- =============================================================================
-- Tiang menumpang: dipilih DI PETA, bukan dari daftar
-- =============================================================================
-- Butir 5 `rencana-jtm-perbaikan.md`. Prasyarat: jtm-tumpang.sql
-- Aman dijalankan berulang.
--
-- ── KENAPA DAFTAR TIDAK CUKUP ───────────────────────────────────────────────
-- Daftar memberi nama dan jarak, tapi tidak memberi ARAH. Regu yang berdiri di
-- persimpangan membaca "KRD-014, 9 m" dan tetap tidak tahu tiang yang mana —
-- di sekelilingnya ada tiga batang yang jaraknya mirip. Yang dia butuhkan
-- adalah melihat dirinya sendiri di tengah jaringan.
--
-- ── DUA RADIUS, DAN INI INTI RANCANGANNYA ───────────────────────────────────
-- Diukur dari data nyata 22 Sep 2026 (277 tiang JTM bertitik):
--
--   bentang: median 31 m, p90 51 m, terpanjang 78 m
--   dalam radius  25 m : rata-rata 1,6 tiang   (p90 3, terbanyak 5)
--   dalam radius 120 m : rata-rata 9,1 tiang   (p90 14, terbanyak 17)
--
-- Angka pertama itu yang mematikan gagasan "tinggal gambar radius pencarian di
-- peta": pada 25 m, peta berisi SATU titik. Itu bukan peta, itu daftar dengan
-- langkah tambahan.
--
-- Jadi petanya memakai dua radius sekaligus:
--
--   radius_cari_tumpang_m  (25 m) — tiang di dalamnya BISA DIPILIH
--   radius_peta_tumpang_m (120 m) — tiang di dalamnya digambar sebagai LATAR,
--                                   beserta bentangnya, tapi tidak bisa dipilih
--
-- Yang kedua menjawab "saya sedang di dekat tiang mana" — bentuk jaringannya
-- terbaca. Yang pertama tetap memegang aturannya: menumpang cuma boleh
-- dinyatakan untuk batang yang benar-benar ada di kaki regu.
--
-- ── SOAL LAG ────────────────────────────────────────────────────────────────
-- Bentang disaring dengan aturan KEDUA UJUNGNYA di dalam radius — pola yang
-- sudah terbukti di `perabasan_segmen_bentang`. Akibatnya jumlah garis
-- membatasi dirinya sendiri oleh radiusnya, dan tidak ada satu pun garis yang
-- ditarik ke tiang yang tidak ikut digambar.
--
-- Tetap diberi LIMIT sebagai jaring pengaman, dan kalau kena, dia MENGATAKANNYA
-- lewat `terpotong` — peta yang diam-diam memotong isinya lebih berbahaya
-- daripada peta yang mengaku tidak lengkap.
--
-- ── BATASAN YANG HARUS DIPEGANG ─────────────────────────────────────────────
-- Fungsi ini memulangkan tiang MILIK PENYULANG LAIN. Itu sah HANYA karena dia
-- dipanggil dari alur "Tiang ini menumpang" — regu sudah menyatakan niatnya.
-- Jangan pernah memanggilnya saat layar dibuka atau untuk menggambar peta
-- segmen biasa. Ditegaskan user 22 Sep 2026: tiang underbuild hanya muncul
-- kalau regu memilih menumpang.


-- ── 1. Radius latar peta, per ULP ────────────────────────────────────────────
-- 120 m: pada kepadatan sekarang itu 9 tiang rata-rata dan 17 pada yang
-- terpadat — cukup untuk membaca arah jalur, masih ringan digambar WebView.

ALTER TABLE public.jtm_settings
  ADD COLUMN IF NOT EXISTS radius_peta_tumpang_m DOUBLE PRECISION NOT NULL DEFAULT 120;

COMMENT ON COLUMN public.jtm_settings.radius_peta_tumpang_m IS
  'Radius LATAR peta saat regu menyatakan menumpang: sejauh mana tiang dan bentang digambar sebagai konteks. Selalu lebih besar dari radius_cari_tumpang_m, yang menentukan mana yang boleh dipilih. Belum ada layar pengaturnya di web — disetel lewat SQL, sepola ambang JTM lainnya.';

ALTER TABLE public.jtm_settings
  DROP CONSTRAINT IF EXISTS jtm_settings_radius_peta_wajar;
ALTER TABLE public.jtm_settings
  ADD CONSTRAINT jtm_settings_radius_peta_wajar
  CHECK (radius_peta_tumpang_m BETWEEN 30 AND 1000);


-- ── 2. Tiang + bentang di sekitar, dalam SATU panggilan ──────────────────────
-- Satu panggilan, bukan dua, karena HP di lapangan membayar tiap perjalanan
-- bolak-balik dengan detik yang terasa. Bentuk JSONB dipilih justru karena
-- isinya dua daftar yang berbeda bentuk — RETURNS TABLE akan memaksa keduanya
-- masuk satu baris datar dan diurai lagi di HP.

CREATE OR REPLACE FUNCTION public.tiang_sekitar_peta_jtm(
  p_segmen_id UUID,
  p_lat       DOUBLE PRECISION,
  p_lng       DOUBLE PRECISION,
  p_radius    DOUBLE PRECISION DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  s        RECORD;
  amb      public.jtm_settings%ROWTYPE;
  r_pilih  DOUBLE PRECISION;
  r_peta   DOUBLE PRECISION;
  batas    INT := 120;
  hasil    JSONB;
BEGIN
  IF p_lat IS NULL OR p_lng IS NULL THEN
    RAISE EXCEPTION 'Posisi belum terbaca';
  END IF;

  SELECT sg.* INTO s FROM public.segmen sg WHERE sg.id = p_segmen_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Segmen tidak ditemukan'; END IF;

  SELECT * INTO amb FROM public.jtm_ambang(s.ulp);

  r_pilih := COALESCE(p_radius, amb.radius_cari_tumpang_m, 25);
  -- Latar tidak boleh lebih sempit dari lingkaran pilihnya: kalau itu terjadi,
  -- akan ada tiang yang boleh dipilih tapi tidak digambar sama sekali.
  r_peta  := GREATEST(COALESCE(amb.radius_peta_tumpang_m, 120), r_pilih);

  WITH dekat AS (
    SELECT
      t.id, t.kode, t.penyulang, t.lat, t.lng, t.induk_id,
      public.jarak_meter(p_lat, p_lng, t.lat, t.lng) AS m
    FROM public.tiang t
    WHERE t.status_hidup = 'aktif'
      AND t.gardu_kode IS NULL
      AND t.lat IS NOT NULL AND t.lng IS NOT NULL
      AND upper(COALESCE(t.ulp, '')) = upper(s.ulp)
      AND public.jarak_meter(p_lat, p_lng, t.lat, t.lng) <= r_peta
    ORDER BY public.jarak_meter(p_lat, p_lng, t.lat, t.lng)
    LIMIT batas
  ),
  tiang_json AS (
    SELECT jsonb_agg(
             jsonb_build_object(
               'id',            d.id,
               'kode',          d.kode,
               -- Namanya DI PENYULANG YANG SEDANG DISAPU, kalau dia memang
               -- sudah punya. Tiang yang sama bernama lain di tiap penyulang
               -- yang memikulnya, dan yang berarti bagi regu adalah nama di
               -- penyulangnya sendiri.
               'kode_di_sini',  k.kode,
               'penyulang',     d.penyulang,
               'lat',           d.lat,
               'lng',           d.lng,
               'jarak_m',       round(d.m::numeric, 1),
               'bisa_dipilih',  d.m <= r_pilih,
               'sudah_anggota', EXISTS (
                                  SELECT 1 FROM public.segmen_tiang st
                                  WHERE st.segmen_id = p_segmen_id AND st.tiang_id = d.id
                                ),
               'dipikul',       ARRAY(
                                  SELECT DISTINCT sg.penyulang
                                  FROM public.segmen_tiang st2
                                  JOIN public.segmen sg
                                    ON sg.id = st2.segmen_id AND sg.status = 'aktif'
                                  WHERE st2.tiang_id = d.id
                                )
             )
             ORDER BY d.m
           ) AS j
    FROM dekat d
    LEFT JOIN public.tiang_kode_penyulang k
      ON k.tiang_id = d.id AND upper(k.penyulang) = upper(s.penyulang)
  ),
  -- KEDUA ujung harus ikut digambar. Garis yang salah satu ujungnya di luar
  -- radius akan tampak seperti jaringan yang berhenti di tengah jalan.
  bentang_json AS (
    SELECT jsonb_agg(
             jsonb_build_object(
               'dari_lat',  a.lat,
               'dari_lng',  a.lng,
               'ke_lat',    b.lat,
               'ke_lng',    b.lng,
               'penyulang', a.penyulang,
               'panjang_m', round(public.jarak_meter(a.lat, a.lng, b.lat, b.lng)::numeric, 1)
             )
           ) AS j
    FROM dekat a
    JOIN dekat b ON b.id = a.induk_id
  )
  SELECT jsonb_build_object(
           'radius_pilih_m', round(r_pilih::numeric, 0),
           'radius_peta_m',  round(r_peta::numeric, 0),
           'terpotong',      (SELECT count(*) FROM dekat) >= batas,
           'tiang',          COALESCE((SELECT j FROM tiang_json), '[]'::jsonb),
           'bentang',        COALESCE((SELECT j FROM bentang_json), '[]'::jsonb)
         )
    INTO hasil;

  RETURN hasil;
END $$;

COMMENT ON FUNCTION public.tiang_sekitar_peta_jtm IS
  'Tiang DAN bentang di sekitar posisi regu, untuk memilih tiang yang ditumpangi di peta. Dua radius: yang sempit menentukan mana yang boleh dipilih, yang lebar cuma latar supaya bentuk jaringannya terbaca. Hanya boleh dipanggil dari alur menumpang — dia memulangkan tiang milik penyulang lain.';


-- ── 3. Hak akses ─────────────────────────────────────────────────────────────

GRANT EXECUTE ON FUNCTION public.tiang_sekitar_peta_jtm(
  UUID, DOUBLE PRECISION, DOUBLE PRECISION, DOUBLE PRECISION) TO authenticated;


-- =============================================================================
-- Periksa hasilnya
-- =============================================================================
-- a. Ambangnya sudah punya radius peta:
--      SELECT ulp, radius_tumpang_m, radius_cari_tumpang_m, radius_peta_tumpang_m
--      FROM jtm_settings ORDER BY ulp;
--
-- b. Coba dari titik sebuah tiang yang ada — berapa yang tergambar dan berapa
--    yang boleh dipilih:
--      SELECT jsonb_array_length(h->'tiang')   AS titik,
--             jsonb_array_length(h->'bentang') AS garis,
--             h->'radius_pilih_m', h->'radius_peta_m', h->'terpotong'
--      FROM (
--        SELECT tiang_sekitar_peta_jtm(st.segmen_id, t.lat, t.lng) AS h
--        FROM segmen_tiang st JOIN tiang t ON t.id = st.tiang_id
--        WHERE t.lat IS NOT NULL LIMIT 5
--      ) x;
--
-- c. Yang boleh dipilih saja:
--      SELECT e->>'kode', e->>'jarak_m', e->>'bisa_dipilih'
--      FROM jsonb_array_elements(
--             (SELECT tiang_sekitar_peta_jtm(st.segmen_id, t.lat, t.lng)
--              FROM segmen_tiang st JOIN tiang t ON t.id = st.tiang_id
--              WHERE t.lat IS NOT NULL LIMIT 1)->'tiang') e;
