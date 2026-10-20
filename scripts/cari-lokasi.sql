-- ════════════════════════════════════════════════════════════════════════════
-- Cari lokasi/koordinat (20 Okt 2026) — web /peta + HP menu "Cari Lokasi".
--
-- Satu titik masuk → jaringan terdekat dalam radius (bawaan 1 km):
--   jtm   : tiang JTM terdekat PER PENYULANG (maks 3 penyulang) + segmennya
--   gardu : 3 gardu terdekat
--   jtr   : 1 tiang JTR terdekat (gardu asal + jurusan)
--
-- Jarak = ke TITIK tiang/gardu (bukan ke garis kabel di antaranya): gawang
-- JTM/JTR ±40–50 m, jadi selisihnya kecil, dan rumusnya tetap sederhana.
-- Disaring kotak batas dulu (indeks lat/lng) baru haversine `jarak_meter`
-- (jtr-schema.sql) — tanpa PostGIS.
--
-- SECURITY INVOKER: RLS tabel yang dibaca tetap berlaku. Tidak disaring ULP —
-- titik di perbatasan ULP justru perlu melihat jaringan tetangganya (sama
-- dengan /peta yang ULP-nya hanya saringan pilihan).
--
-- Jalankan di Supabase SQL Editor SEBELUM web dibangun / OTA HP terbit.
-- ════════════════════════════════════════════════════════════════════════════

CREATE INDEX IF NOT EXISTS tiang_coords_idx ON public.tiang (lat, lng);
CREATE INDEX IF NOT EXISTS gardu_coords_idx ON public.gardu (lat, lng);

CREATE OR REPLACE FUNCTION public.cari_lokasi(
  p_lat DOUBLE PRECISION,
  p_lng DOUBLE PRECISION,
  p_radius_m INTEGER DEFAULT 1000
) RETURNS jsonb
LANGUAGE sql STABLE AS $$
  WITH k AS (
    SELECT p_lat - d.dlat AS la0, p_lat + d.dlat AS la1,
           p_lng - d.dlng AS ln0, p_lng + d.dlng AS ln1
    FROM (SELECT p_radius_m / 111320.0 AS dlat,
                 p_radius_m / (111320.0 * cos(radians(p_lat))) AS dlng) d
  ),
  -- Tiang JTM: satu baris per penyulang yang melewatinya (tumpang ikut).
  jtm AS (
    SELECT DISTINCT ON (x.penyulang)
           x.tiang_id, x.kode, x.penyulang, x.ulp, x.lat, x.lng, x.jarak
    FROM (
      SELECT t.id AS tiang_id,
             COALESCE(kp.kode, t.kode) AS kode,
             COALESCE(kp.penyulang, t.penyulang, t.feeder) AS penyulang,
             COALESCE(kp.ulp, t.ulp) AS ulp,
             t.lat::float8 AS lat, t.lng::float8 AS lng,
             public.jarak_meter(p_lat, p_lng, t.lat, t.lng) AS jarak
      FROM public.tiang t
      CROSS JOIN k
      LEFT JOIN public.tiang_kode_penyulang kp ON kp.tiang_id = t.id
      WHERE t.gardu_kode IS NULL AND t.status_hidup = 'aktif'
        AND t.lat BETWEEN k.la0 AND k.la1 AND t.lng BETWEEN k.ln0 AND k.ln1
    ) x
    WHERE x.jarak <= p_radius_m AND x.penyulang IS NOT NULL
    ORDER BY x.penyulang, x.jarak
  ),
  jtm3 AS (
    SELECT j.*,
           (SELECT s.nama FROM public.segmen_tiang st
              JOIN public.segmen s ON s.id = st.segmen_id
             WHERE st.tiang_id = j.tiang_id AND s.status = 'aktif'
               AND upper(s.penyulang) = upper(j.penyulang)
             LIMIT 1) AS segmen
    FROM jtm j ORDER BY j.jarak LIMIT 3
  ),
  gardu3 AS (
    SELECT g.kode, g.nama, g.feeder AS penyulang, g.ulp, g.daya,
           g.lat::float8 AS lat, g.lng::float8 AS lng,
           public.jarak_meter(p_lat, p_lng, g.lat, g.lng) AS jarak
    FROM public.gardu g CROSS JOIN k
    WHERE g.lat BETWEEN k.la0 AND k.la1 AND g.lng BETWEEN k.ln0 AND k.ln1
      AND (g.status IS NULL OR g.status ILIKE 'aktif')
      AND public.jarak_meter(p_lat, p_lng, g.lat, g.lng) <= p_radius_m
    ORDER BY jarak LIMIT 3
  ),
  -- Tiang JTR: pemilik saja (`menumpang` = salinan tiang yang sama di gardu lain).
  jtr1 AS (
    SELECT j.id AS tiang_id, j.kode, upper(j.gardu_kode) AS gardu_kode, j.jurusan, j.ulp,
           j.lat::float8 AS lat, j.lng::float8 AS lng,
           public.jarak_meter(p_lat, p_lng, j.lat, j.lng) AS jarak
    FROM public.jtr_tiang j CROSS JOIN k
    WHERE j.status_hidup = 'aktif' AND NOT j.menumpang
      AND j.lat BETWEEN k.la0 AND k.la1 AND j.lng BETWEEN k.ln0 AND k.ln1
      AND public.jarak_meter(p_lat, p_lng, j.lat, j.lng) <= p_radius_m
    ORDER BY jarak LIMIT 1
  )
  SELECT jsonb_build_object(
    'jtm',   COALESCE((SELECT jsonb_agg(to_jsonb(j) ORDER BY j.jarak) FROM jtm3 j), '[]'::jsonb),
    'gardu', COALESCE((SELECT jsonb_agg(to_jsonb(g) ORDER BY g.jarak) FROM gardu3 g), '[]'::jsonb),
    'jtr',   COALESCE((SELECT jsonb_agg(to_jsonb(r)) FROM jtr1 r), '[]'::jsonb)
  )
$$;

COMMENT ON FUNCTION public.cari_lokasi IS
  'Cari lokasi: tiang JTM terdekat per penyulang (maks 3, + segmen), 3 gardu, 1 tiang JTR dalam p_radius_m meter. Jarak = ke titik, haversine jarak_meter.';

GRANT EXECUTE ON FUNCTION public.cari_lokasi(DOUBLE PRECISION, DOUBLE PRECISION, INTEGER) TO authenticated;
