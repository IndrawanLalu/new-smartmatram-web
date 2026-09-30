-- =============================================================================
-- Peta Jaringan — kesehatan gardu dari DATA UKUR
-- Jalankan SESUDAH tegangan-ujung-persetujuan.sql. Aman diulang. Hanya view.
--
-- Keputusan user 1 Okt 2026: berangkat dari hasil ukur, bukan model. Ambang:
--   • beban trafo > 80 %                      → merah
--   • jatuh tegangan jurusan > 10 %           → merah
--     (tegangan pangkal gardu − tegangan ujung terukur, per fasa, dibagi pangkal)
--   • tegangan ujung < 198 V (220 V −10 %)    → merah
--   • arus jurusan > 160 A per fasa           → merah
--   • calon gardu sisip = beban > 80 % DAN jatuh tegangan > 10 %
-- Kuning (mendekati) ditambahkan di sini: beban ≥ 70 %, jatuh ≥ 8 %, atau
-- ketidakseimbangan arus ≥ 20 %.
--
-- Tegangan ujung per jurusan: ukuran LAPANGAN (`pengukuran_tegangan_ujung`,
-- status Terkirim) bila ada, dari FORMULIR beban (`perjurusan.tegangan`) bila
-- belum — aturan yang sama dengan agen AMG. Sumbernya ikut disebut.
-- Unbalance dihitung dari arus total R/S/T (kolom `unbalance` tidak terisi).
-- =============================================================================

CREATE OR REPLACE VIEW public.kesehatan_gardu
WITH (security_invoker = true) AS
WITH terakhir AS (
  SELECT DISTINCT ON (upper(p.no_gardu)) p.*
  FROM public.pengukuran_gardu p
  WHERE p.dikembalikan_at IS NULL
  ORDER BY upper(p.no_gardu), p.tanggal_pengukuran DESC, p.jam_pengukuran DESC NULLS LAST, p.created_at DESC NULLS LAST
),
jur AS (
  SELECT
    t.id AS pengukuran_id,
    j.key AS jurusan,
    COALESCE((j.value->'arus'->>'R')::numeric, 0) AS a_r,
    COALESCE((j.value->'arus'->>'S')::numeric, 0) AS a_s,
    COALESCE((j.value->'arus'->>'T')::numeric, 0) AS a_t,
    COALESCE((j.value->'arus'->>'N')::numeric, 0) AS a_n,
    t.total_teg_rn AS p_r, t.total_teg_sn AS p_s, t.total_teg_tn AS p_t,
    u.v_rn, u.v_sn, u.v_tn, u.jarak_rekomendasi_m, u.lat AS u_lat, u.lng AS u_lng,
    NULLIF((j.value->'tegangan'->>'R')::numeric, 0) AS f_r,
    NULLIF((j.value->'tegangan'->>'S')::numeric, 0) AS f_s,
    NULLIF((j.value->'tegangan'->>'T')::numeric, 0) AS f_t
  FROM terakhir t
  CROSS JOIN LATERAL jsonb_each(
    CASE WHEN jsonb_typeof(t.perjurusan) = 'object' THEN t.perjurusan ELSE '{}'::jsonb END) j
  LEFT JOIN LATERAL (
    SELECT x.v_rn, x.v_sn, x.v_tn, x.jarak_rekomendasi_m, x.lat, x.lng
    FROM public.pengukuran_tegangan_ujung x
    WHERE x.pengukuran_id = t.id AND x.jurusan = j.key AND x.status = 'Terkirim'
    ORDER BY x.created_at DESC LIMIT 1
  ) u ON true
  WHERE jsonb_typeof(j.value) = 'object'
),
jur2 AS (
  SELECT
    jr.*,
    GREATEST(jr.a_r, jr.a_s, jr.a_t) AS arus_maks,
    CASE WHEN jr.v_rn IS NOT NULL THEN 'lapangan'
         WHEN jr.f_r IS NOT NULL OR jr.f_s IS NOT NULL OR jr.f_t IS NOT NULL THEN 'formulir' END AS sumber_ujung,
    COALESCE(jr.v_rn, jr.f_r) AS u_r,
    COALESCE(jr.v_sn, jr.f_s) AS u_s,
    COALESCE(jr.v_tn, jr.f_t) AS u_t
  FROM jur jr
),
jur3 AS (
  SELECT
    j.*,
    LEAST(j.u_r, j.u_s, j.u_t) AS ujung_min,
    -- Jatuh tegangan terburuk dari ketiga fasa, persen dari pangkal fasa itu.
    GREATEST(
      CASE WHEN j.p_r > 0 AND j.u_r IS NOT NULL THEN (j.p_r - j.u_r) / j.p_r * 100 END,
      CASE WHEN j.p_s > 0 AND j.u_s IS NOT NULL THEN (j.p_s - j.u_s) / j.p_s * 100 END,
      CASE WHEN j.p_t > 0 AND j.u_t IS NOT NULL THEN (j.p_t - j.u_t) / j.p_t * 100 END
    ) AS jatuh_pct
  FROM jur2 j
  WHERE j.arus_maks > 0 OR j.u_r IS NOT NULL OR j.u_s IS NOT NULL OR j.u_t IS NOT NULL
),
per_gardu AS (
  SELECT
    t.id AS pengukuran_id,
    max(j.jatuh_pct)  AS jatuh_maks_pct,
    min(j.ujung_min)  AS ujung_min,
    max(j.arus_maks)  AS arus_jurusan_maks,
    jsonb_agg(jsonb_build_object(
      'jurusan', j.jurusan,
      'arus', jsonb_build_object('R', j.a_r, 'S', j.a_s, 'T', j.a_t, 'N', j.a_n),
      'pangkal', jsonb_build_object('R', j.p_r, 'S', j.p_s, 'T', j.p_t),
      'ujung', jsonb_build_object('R', j.u_r, 'S', j.u_s, 'T', j.u_t),
      'sumber_ujung', j.sumber_ujung,
      'jatuh_pct', round(j.jatuh_pct, 1),
      'arus_maks', j.arus_maks,
      'jarak_dari_ujung_m', round(j.jarak_rekomendasi_m::numeric, 0),
      'titik_ujung', CASE WHEN j.u_lat IS NULL THEN NULL ELSE jsonb_build_array(j.u_lat, j.u_lng) END
    ) ORDER BY j.jurusan) AS jurusan
  FROM terakhir t
  JOIN jur3 j ON j.pengukuran_id = t.id
  GROUP BY t.id
),
dasar AS (
  SELECT
    g.kode, g.nama, g.ulp, g.feeder, g.daya,
    g.lat::double precision AS lat, g.lng::double precision AS lng,
    t.id AS pengukuran_id, t.tanggal_pengukuran, t.persen_beban, t.beban_kva,
    LEAST(t.total_teg_rn, t.total_teg_sn, t.total_teg_tn) AS pangkal_min,
    CASE WHEN (t.total_arus_r + t.total_arus_s + t.total_arus_t) > 0 THEN
      round((GREATEST(t.total_arus_r, t.total_arus_s, t.total_arus_t)
             - (t.total_arus_r + t.total_arus_s + t.total_arus_t) / 3.0)
            / ((t.total_arus_r + t.total_arus_s + t.total_arus_t) / 3.0) * 100, 1)
    END AS unbalance_pct,
    round(pg.jatuh_maks_pct, 1) AS jatuh_maks_pct,
    pg.ujung_min,
    pg.arus_jurusan_maks,
    COALESCE(pg.jurusan, '[]'::jsonb) AS jurusan
  FROM public.gardu g
  JOIN terakhir t ON upper(t.no_gardu) = upper(g.kode)
  LEFT JOIN per_gardu pg ON pg.pengukuran_id = t.id
  WHERE g.lat IS NOT NULL AND g.lng IS NOT NULL
)
SELECT
  d.*,
  COALESCE(d.persen_beban > 80, false)       AS beban_lebih,
  COALESCE(d.jatuh_maks_pct > 10, false)     AS jatuh_lebih,
  COALESCE(d.ujung_min < 198, false)         AS ujung_rendah,
  COALESCE(d.arus_jurusan_maks > 160, false) AS jurusan_lebih,
  COALESCE(d.persen_beban > 80 AND d.jatuh_maks_pct > 10, false) AS calon_sisip,
  CASE
    WHEN COALESCE(d.persen_beban > 80, false) OR COALESCE(d.jatuh_maks_pct > 10, false)
      OR COALESCE(d.ujung_min < 198, false) OR COALESCE(d.arus_jurusan_maks > 160, false) THEN 'merah'
    WHEN COALESCE(d.persen_beban >= 70, false) OR COALESCE(d.jatuh_maks_pct >= 8, false)
      OR COALESCE(d.unbalance_pct >= 20, false) THEN 'kuning'
    ELSE 'hijau'
  END AS status
FROM dasar d;

COMMENT ON VIEW public.kesehatan_gardu IS
  'Kesehatan gardu dari pengukuran TERAKHIR: beban, unbalance, tegangan ujung & jatuh tegangan per jurusan (lapangan bila ada, formulir bila belum), arus jurusan. Ambang: beban >80 %, jatuh >10 %, ujung <198 V, jurusan >160 A = merah; calon sisip = beban >80 % DAN jatuh >10 %.';

GRANT SELECT ON public.kesehatan_gardu TO authenticated;


-- =============================================================================
-- Periksa:
--   SELECT status, count(*), count(*) FILTER (WHERE calon_sisip) AS sisip,
--          count(*) FILTER (WHERE jurusan_lebih) AS jurusan_160
--   FROM kesehatan_gardu GROUP BY 1;
--   SELECT kode, persen_beban, jatuh_maks_pct, arus_jurusan_maks FROM kesehatan_gardu
--   WHERE kode = 'MM144';     -- jurusan K fasa R 166 A → jurusan_lebih
-- =============================================================================
