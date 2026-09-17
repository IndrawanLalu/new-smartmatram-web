-- scripts/peta-jaringan.sql
--
-- LAPISAN DATA UNTUK PETA JARINGAN.
--
-- Satu hal yang menentukan seluruh berkas ini: JANGAN KIRIM YANG TIDAK BISA
-- DILIHAT. Pada zoom se-pulau, dua puluh ribu tiang jatuh di beberapa piksel
-- yang sama — mata tidak bisa membedakannya, jadi mengirimnya hanya membakar
-- memori peramban tanpa menambah satu pun keterangan di layar.
--
-- Karena itu ada `penyulang_rute`: satu baris per penyulang berisi garis
-- rutenya yang sudah disederhanakan. Di zoom rendah peta menarik 82 baris,
-- bukan menghitung ulang dua puluh ribu tiang setiap kali digeser.
--
-- Angka keadaan saat berkas ini ditulis: 82 penyulang terdaftar, 2.092 gardu
-- bertitik, 268 tiang JTM (dari perkiraan 20.000 kalau seluruh penyulang
-- disurvei), dan tiang JTR masih nol — modulnya belum pindah ke basis ini.
--
-- Aman dijalankan berulang.


-- ── 1. Rute penyulang yang sudah disederhanakan ──────────────────────────────

CREATE TABLE IF NOT EXISTS public.penyulang_rute (
  penyulang TEXT NOT NULL,
  ulp       TEXT NOT NULL,

  -- Larik bentang: [[lat1,lng1,lat2,lng2], ...]. Disimpan sebagai bentang, bukan
  -- satu garis panjang, karena jaringan itu POHON — menyambungkan titik
  -- berurutan akan menarik garis khayal dari ujung satu cabang ke pangkal
  -- cabang berikutnya.
  bentang JSONB NOT NULL DEFAULT '[]'::jsonb,

  jumlah_tiang INT NOT NULL DEFAULT 0,
  jumlah_bentang INT NOT NULL DEFAULT 0,

  -- Kotak batas: dipakai tombol "lompat ke sini" tanpa perlu membaca tiangnya.
  lat_min DOUBLE PRECISION, lat_maks DOUBLE PRECISION,
  lng_min DOUBLE PRECISION, lng_maks DOUBLE PRECISION,

  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (penyulang, ulp)
);

COMMENT ON TABLE public.penyulang_rute IS
  'Garis rute tiap penyulang yang sudah disederhanakan, untuk peta pada zoom rendah. Disusun ulang lewat segarkan_rute_penyulang(), bukan dihitung tiap peta digeser.';


-- ── 2. Menyusun rute yang disederhanakan ─────────────────────────────────────
-- Tiang yang DIPERTAHANKAN: pangkal, percabangan, ujung, dan tiap tiang ke-N
-- pada deretnya. Sisanya dibuang, dan bentangnya disambungkan ke leluhur
-- terdekat yang dipertahankan.
--
-- Bentuk jaringannya tetap terbaca — belokan besar selalu jatuh di percabangan
-- atau ujung — sementara jumlah garisnya turun sekitar sepuluh kali lipat.

CREATE OR REPLACE FUNCTION public.segarkan_rute_penyulang(
  p_penyulang TEXT,
  p_ulp       TEXT,
  p_tiap      INT DEFAULT 8
) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_bentang JSONB := '[]'::jsonb;
  v_n       INT := 0;
  v_b       INT := 0;
  r         RECORD;
BEGIN
  WITH anggota AS (
    SELECT t.id, t.induk_id, t.lat, t.lng, t.created_at,
           (SELECT count(*) FROM public.tiang a
             WHERE a.induk_id = t.id AND a.status_hidup = 'aktif') AS anak
    FROM public.tiang t
    JOIN public.tiang_kode_penyulang k
      ON k.tiang_id = t.id AND upper(k.penyulang) = upper(p_penyulang)
    WHERE t.status_hidup = 'aktif'
      AND t.lat IS NOT NULL AND t.lng IS NOT NULL
      AND upper(COALESCE(t.ulp, '')) = upper(p_ulp)
  ), bernomor AS (
    SELECT a.*, row_number() OVER (ORDER BY a.created_at) AS urut
    FROM anggota a
  ), disimpan AS (
    SELECT b.*,
           (b.anak <> 1                       -- pangkal cabang atau ujung jalur
            OR b.induk_id IS NULL
            OR NOT EXISTS (SELECT 1 FROM anggota x WHERE x.id = b.induk_id)
            OR b.urut % GREATEST(p_tiap, 1) = 0) AS simpan
    FROM bernomor b
  )
  SELECT
    COALESCE(jsonb_agg(jsonb_build_array(d.lat, d.lng, p.lat, p.lng)) FILTER (WHERE p.id IS NOT NULL), '[]'::jsonb),
    count(*),
    count(p.id)
  INTO v_bentang, v_n, v_b
  FROM disimpan d
  LEFT JOIN LATERAL (
    -- Leluhur terdekat yang ikut dipertahankan. Ditelusuri naik lewat pohon,
    -- jadi bentangnya tetap menyambung meski tiang di antaranya dibuang.
    WITH RECURSIVE naik AS (
      SELECT d.induk_id AS id, 0 AS dalam
      UNION ALL
      SELECT t.induk_id, n.dalam + 1
      FROM naik n JOIN public.tiang t ON t.id = n.id
      WHERE n.id IS NOT NULL AND n.dalam < 200
        AND NOT EXISTS (SELECT 1 FROM disimpan s WHERE s.id = n.id AND s.simpan)
    )
    SELECT s.id, s.lat, s.lng
    FROM naik n JOIN disimpan s ON s.id = n.id AND s.simpan
    ORDER BY n.dalam
    LIMIT 1
  ) p ON true
  WHERE d.simpan;

  INSERT INTO public.penyulang_rute
    (penyulang, ulp, bentang, jumlah_tiang, jumlah_bentang,
     lat_min, lat_maks, lng_min, lng_maks, updated_at)
  SELECT upper(p_penyulang), upper(p_ulp), v_bentang,
         (SELECT count(*) FROM public.tiang_kode_penyulang k
           WHERE upper(k.penyulang) = upper(p_penyulang) AND upper(k.ulp) = upper(p_ulp)),
         v_b,
         min(t.lat), max(t.lat), min(t.lng), max(t.lng), now()
  FROM public.tiang t
  JOIN public.tiang_kode_penyulang k
    ON k.tiang_id = t.id AND upper(k.penyulang) = upper(p_penyulang)
  WHERE t.status_hidup = 'aktif' AND t.lat IS NOT NULL
  ON CONFLICT (penyulang, ulp) DO UPDATE SET
    bentang = EXCLUDED.bentang,
    jumlah_tiang = EXCLUDED.jumlah_tiang,
    jumlah_bentang = EXCLUDED.jumlah_bentang,
    lat_min = EXCLUDED.lat_min, lat_maks = EXCLUDED.lat_maks,
    lng_min = EXCLUDED.lng_min, lng_maks = EXCLUDED.lng_maks,
    updated_at = now();

  RETURN jsonb_build_object('penyulang', upper(p_penyulang),
                            'tiang_dipertahankan', v_n, 'bentang', v_b);
END $$;


CREATE OR REPLACE FUNCTION public.segarkan_semua_rute_jtm(p_tiap INT DEFAULT 8)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r RECORD; n INT := 0;
BEGIN
  FOR r IN
    SELECT DISTINCT penyulang, ulp FROM public.tiang_kode_penyulang
  LOOP
    PERFORM public.segarkan_rute_penyulang(r.penyulang, r.ulp, p_tiap);
    n := n + 1;
  END LOOP;
  RETURN jsonb_build_object('penyulang_disegarkan', n);
END $$;


-- ── 3. View datar untuk peta ─────────────────────────────────────────────────
-- Hanya kolom yang benar-benar digambar. Tiap kolom tambahan dikalikan jumlah
-- barisnya, dan di peta jumlah barisnya selalu besar.

-- Dibuang berurutan dari yang paling bergantung: `peta_daftar` berdiri di atas
-- `peta_gardu`, jadi membuangnya belakangan akan menggagalkan seluruh skrip
-- pada jalan KEDUA — persis saat orang menjalankannya ulang karena ragu.
DROP VIEW IF EXISTS public.peta_daftar;
DROP VIEW IF EXISTS public.peta_gardu;
DROP VIEW IF EXISTS public.peta_tiang;

CREATE VIEW public.peta_tiang AS
SELECT
  t.id,
  t.kode,
  t.ulp,
  t.lat, t.lng,
  t.penanda,
  t.percabangan,
  CASE WHEN t.gardu_kode IS NOT NULL THEN 'jtr' ELSE 'jtm' END AS jaringan,
  -- Milik siapa: penyulang untuk JTM, gardu untuk JTR. Satu kolom supaya
  -- penyaringan di peta tidak perlu memeriksa dua kolom berbeda.
  COALESCE(t.gardu_kode, t.penyulang) AS induk_kelompok,
  t.induk_id,
  p.lat AS induk_lat,
  p.lng AS induk_lng
FROM public.tiang t
LEFT JOIN public.tiang p ON p.id = t.induk_id AND p.status_hidup = 'aktif'
WHERE t.status_hidup = 'aktif'
  AND t.lat IS NOT NULL AND t.lng IS NOT NULL;

COMMENT ON VIEW public.peta_tiang IS
  'Tiang untuk peta: JTM dan JTR dalam satu bentuk, lengkap dengan titik induknya supaya bentang bisa digambar tanpa kueri kedua.';


CREATE VIEW public.peta_gardu AS
SELECT g.kode, g.nama, g.ulp, g.feeder, g.daya, g.lat, g.lng,
       (SELECT count(*) FROM public.tiang t
         WHERE upper(COALESCE(t.gardu_kode, '')) = upper(g.kode)
           AND t.status_hidup = 'aktif') AS jumlah_tiang
FROM public.gardu g
WHERE g.lat IS NOT NULL AND g.lng IS NOT NULL;


-- ── 4. Daftar untuk panel kiri dan kotak cari ────────────────────────────────
-- Satu view, dua kegunaan: mengisi pohon folder, dan menjawab pencarian.
-- Digabung supaya "AM005" dan "GUNUNG SARI" dicari di tempat yang sama — regu
-- tidak perlu tahu yang satu gardu dan yang lain penyulang.

CREATE VIEW public.peta_daftar AS
SELECT
  'jtm'::text        AS jaringan,
  r.penyulang        AS kode,
  r.penyulang        AS nama,
  r.ulp,
  r.penyulang        AS feeder,   -- penyulang adalah kelompoknya sendiri
  r.jumlah_tiang,
  r.lat_min, r.lat_maks, r.lng_min, r.lng_maks
FROM public.penyulang_rute r

UNION ALL

-- Gardu membawa penyulangnya supaya panel kiri bisa mengelompokkannya. Tanpa
-- kolom ini folder Gardu jadi dua ribu baris rata tanpa urutan yang berarti —
-- dan orang di lapangan berpikir per penyulang, bukan per kode gardu.
SELECT
  'gardu'::text,
  g.kode,
  COALESCE(NULLIF(btrim(g.nama), ''), g.kode),
  g.ulp,
  COALESCE(NULLIF(btrim(g.feeder), ''), '(tanpa penyulang)'),
  g.jumlah_tiang,
  g.lat, g.lat, g.lng, g.lng
FROM public.peta_gardu g;

COMMENT ON VIEW public.peta_daftar IS
  'Isi panel kiri dan sumber pencarian peta. Penyulang dan gardu dalam satu daftar supaya pencarian tidak menuntut orang tahu yang dicarinya itu jenis apa.';


-- ── 5. Indeks untuk saringan kotak pandang ───────────────────────────────────
-- Peta hanya meminta yang masuk layar. Tanpa indeks ini, tiap geseran memaksa
-- pemindaian seluruh tabel — dan yang pertama merasakannya adalah orang di
-- lapangan dengan sinyal seadanya.

CREATE INDEX IF NOT EXISTS tiang_peta_idx
  ON public.tiang (lat, lng) WHERE status_hidup = 'aktif' AND lat IS NOT NULL;

CREATE INDEX IF NOT EXISTS gardu_peta_idx
  ON public.gardu (lat, lng) WHERE lat IS NOT NULL;


ALTER TABLE public.penyulang_rute ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "auth baca rute" ON public.penyulang_rute;
CREATE POLICY "auth baca rute" ON public.penyulang_rute
  FOR SELECT TO authenticated USING (true);

GRANT SELECT  ON public.penyulang_rute TO authenticated;
GRANT SELECT  ON public.peta_tiang     TO authenticated;
GRANT SELECT  ON public.peta_gardu     TO authenticated;
GRANT SELECT  ON public.peta_daftar    TO authenticated;
GRANT EXECUTE ON FUNCTION public.segarkan_rute_penyulang  TO authenticated;
GRANT EXECUTE ON FUNCTION public.segarkan_semua_rute_jtm  TO authenticated;

SELECT public.segarkan_semua_rute_jtm();
