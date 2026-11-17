-- =============================================================================
-- Kirim Inspeksi JTR lebih cepat (17 Nov 2026). Idempoten.
-- Jalankan manual di Supabase SQL Editor.
--
-- Masalah: "canceling statement due to statement timeout" saat kirim JTR.
-- kirim_tiang_jtr rata-rata 1 dtk, terlama 7 dtk (batas 8 dtk). Untuk SETIAP
-- tiang baru, penjaga "tiang sudah berdiri X m" mengurutkan SEMUA tiang aktif
-- se-ULP menurut jarak (tanpa indeks), lalu mengambil satu.
--
-- Perbaikan: yang diurutkan hanya tiang di dalam kotak seukuran radius tumpang
-- di sekitar titik (indeks tiang_coords_idx). Hasilnya SAMA: tiang di luar
-- radius tidak pernah dipakai penjaga ini (d_m <= radius), baik untuk menolak
-- maupun untuk mencatat beda_dari_tiang_id.
--
-- Ditambal pada definisi HIDUP: satu potongan diganti. Potongan tidak ketemu
-- tepat sekali → berhenti dengan galat, tidak ada yang berubah. Sudah
-- ditambal → dilewati.
-- =============================================================================

CREATE INDEX IF NOT EXISTS tiang_coords_idx ON public.tiang (lat, lng);

DO $do$
DECLARE
  def   TEXT := pg_get_functiondef('public.kirim_tiang_jtr(jsonb)'::regprocedure);
  pola  TEXT := 'AND upper\(COALESCE\(t\.ulp, ''''\)\) = v_ulp(\s+)ORDER BY public\.jarak_meter\(v_lat, v_lng, t\.lat, t\.lng\)';
  ganti TEXT :=
    'AND upper(COALESCE(t.ulp, '''')) = v_ulp'
    || '\1-- Kotak radius tumpang (jtr-kirim-cepat.sql): indeks koordinat, hasil sama.'
    || '\1AND t.lat BETWEEN (v_lat - (radius + 1) / 111000.0)::numeric AND (v_lat + (radius + 1) / 111000.0)::numeric'
    || '\1AND t.lng BETWEEN (v_lng - (radius + 1) / (111000.0 * greatest(cos(radians(v_lat)), 0.2)))::numeric'
    || '\1                  AND (v_lng + (radius + 1) / (111000.0 * greatest(cos(radians(v_lat)), 0.2)))::numeric'
    || '\1ORDER BY public.jarak_meter(v_lat, v_lng, t.lat, t.lng)';
  n     INT;
BEGIN
  IF position('jtr-kirim-cepat.sql' IN def) > 0 THEN
    RAISE NOTICE 'kirim_tiang_jtr sudah ditambal — dilewati.';
    RETURN;
  END IF;
  SELECT count(*) INTO n FROM regexp_matches(def, pola, 'g');
  IF n <> 1 THEN
    RAISE EXCEPTION 'Potongan penjaga tiang berdekatan ditemukan % kali (harus 1) — tidak ada yang diubah.', n;
  END IF;
  EXECUTE regexp_replace(def, pola, ganti);
  RAISE NOTICE 'kirim_tiang_jtr ditambal.';
END $do$;

-- Periksa (harus memakai Index Scan / Bitmap Index Scan pada tiang_coords_idx,
-- dan memberi tiang terdekat yang sama dengan cara lama bila jaraknya ≤ radius):
-- EXPLAIN (ANALYZE, BUFFERS)
-- SELECT t.id, public.jarak_meter(-8.58, 116.09, t.lat, t.lng) AS m
-- FROM public.tiang t
-- WHERE t.status_hidup = 'aktif' AND t.lat IS NOT NULL AND t.lng IS NOT NULL
--   AND upper(COALESCE(t.ulp, '')) = 'AMPENAN'
--   AND t.lat BETWEEN (-8.58 - 6 / 111000.0)::numeric AND (-8.58 + 6 / 111000.0)::numeric
--   AND t.lng BETWEEN (116.09 - 6 / (111000.0 * cos(radians(-8.58))))::numeric
--                 AND (116.09 + 6 / (111000.0 * cos(radians(-8.58))))::numeric
-- ORDER BY 2 LIMIT 1;
