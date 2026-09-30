-- =============================================================================
-- Peta Jaringan — simulasi "kalau alat hubung ini dibuka"
-- Jalankan SESUDAH jtm-view.sql, peta-jaringan-hidup.sql. Aman diulang.
-- HANYA MEMBACA — tidak ada satu baris pun yang ditulis.
--
-- Klik LBS / LBS Motorized / Recloser / PMT / FCO di peta → apa yang padam kalau
-- alat itu dibuka: tiang & gawang di hilirnya, gardu yang ikut padam beserta
-- kVA & beban terakhirnya, dan alat hubung lain yang ikut mati.
--
-- ── ATURAN (keputusan user 1 Okt 2026) ──────────────────────────────────────
--   • Hilir = seluruh keturunan tiang alat di pohon tiang JTM (`tiang.induk_id`)
--     — pohon penyulang PEMILIK batang.
--   • Gardu padam HANYA lewat tiang berpenanda 'gardu' di hilir, dicocokkan ke
--     gardu terdekat di ULP yang sama dalam 100 m. Tiang gardu tanpa pasangan
--     disebut terpisah — itu tanda data gardu atau penandanya perlu dibetulkan.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.simulasi_buka_alat(p_tiang_id UUID)
RETURNS JSONB
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  a      RECORD;
  hasil  JSONB;
BEGIN
  SELECT t.id, t.kode, t.penanda, t.penyulang, t.ulp, t.lat, t.lng INTO a
  FROM public.tiang t WHERE t.id = p_tiang_id AND t.status_hidup = 'aktif';
  IF NOT FOUND THEN RAISE EXCEPTION 'Tiang tidak ditemukan'; END IF;

  WITH RECURSIVE hilir AS (
    SELECT c.id, c.kode, c.penanda, c.lat, c.lng, c.induk_id, c.ulp
    FROM public.tiang c
    WHERE c.induk_id = p_tiang_id AND c.status_hidup = 'aktif' AND c.gardu_kode IS NULL
    UNION ALL
    SELECT c.id, c.kode, c.penanda, c.lat, c.lng, c.induk_id, c.ulp
    FROM public.tiang c
    JOIN hilir h ON c.induk_id = h.id
    WHERE c.status_hidup = 'aktif' AND c.gardu_kode IS NULL
  ) CYCLE id SET siklus USING jalur,
  hilir_unik AS (
    SELECT DISTINCT ON (id) * FROM hilir WHERE NOT siklus
  ),
  bentang AS (
    SELECT h.id, jsonb_build_array(h.lat, h.lng, p.lat, p.lng) AS garis,
           public.jarak_meter(h.lat, h.lng, p.lat, p.lng) AS m
    FROM hilir_unik h
    JOIN public.tiang p ON p.id = h.induk_id
    WHERE h.lat IS NOT NULL AND p.lat IS NOT NULL
  ),
  gardu_tiang AS (
    SELECT h.kode AS tiang_kode, h.lat, h.lng, g.kode, g.nama, g.daya,
           g.lat AS g_lat, g.lng AS g_lng
    FROM hilir_unik h
    LEFT JOIN LATERAL (
      SELECT gg.kode, gg.nama, gg.daya, gg.lat::double precision AS lat, gg.lng::double precision AS lng
      FROM public.gardu gg
      WHERE gg.lat IS NOT NULL AND gg.lng IS NOT NULL
        AND upper(gg.ulp) = upper(COALESCE(h.ulp, a.ulp))
        -- Saringan kotak kasar (~220 m) sebelum jarak sebenarnya.
        AND gg.lat BETWEEN h.lat - 0.002 AND h.lat + 0.002
        AND gg.lng BETWEEN h.lng - 0.002 AND h.lng + 0.002
        AND public.jarak_meter(h.lat, h.lng, gg.lat::double precision, gg.lng::double precision) <= 100
      ORDER BY public.jarak_meter(h.lat, h.lng, gg.lat::double precision, gg.lng::double precision)
      LIMIT 1
    ) g ON true
    WHERE h.penanda = 'gardu' AND h.lat IS NOT NULL
  ),
  gardu_padam AS (
    SELECT DISTINCT ON (gt.kode) gt.*, s.beban_kva, s.persen_beban, s.event_date
    FROM gardu_tiang gt
    LEFT JOIN public.gardu_latest_state s ON upper(s.no_gardu) = upper(gt.kode)
    WHERE gt.kode IS NOT NULL
    ORDER BY gt.kode, s.event_date DESC NULLS LAST
  )
  SELECT jsonb_build_object(
    'alat', jsonb_build_object('id', a.id, 'kode', a.kode, 'penanda', a.penanda,
                               'penyulang', a.penyulang, 'lat', a.lat, 'lng', a.lng),
    'jumlah_tiang', (SELECT count(*) FROM hilir_unik),
    'panjang_km', (SELECT round((COALESCE(sum(m), 0) / 1000)::numeric, 3) FROM bentang),
    'bentang', COALESCE((SELECT jsonb_agg(garis) FROM bentang), '[]'::jsonb),
    'gardu', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'kode', kode, 'nama', nama, 'daya', daya, 'lat', g_lat, 'lng', g_lng,
        'beban_kva', beban_kva, 'persen_beban', persen_beban, 'tgl_ukur', event_date,
        'tiang_kode', tiang_kode) ORDER BY kode)
      FROM gardu_padam), '[]'::jsonb),
    'total_kva', (SELECT COALESCE(sum(daya), 0) FROM gardu_padam),
    'total_beban_kva', (SELECT round(COALESCE(sum(beban_kva), 0)::numeric, 1) FROM gardu_padam),
    'gardu_tanpa_pasangan', COALESCE((
      SELECT jsonb_agg(tiang_kode ORDER BY tiang_kode) FROM gardu_tiang WHERE kode IS NULL), '[]'::jsonb),
    'alat_hilir', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('kode', kode, 'penanda', penanda, 'lat', lat, 'lng', lng) ORDER BY kode)
      FROM hilir_unik WHERE penanda IN ('lbs', 'lbsm', 'recloser', 'pmt', 'fco')), '[]'::jsonb),
    'batas', (
      SELECT jsonb_build_array(min(lat), min(lng), max(lat), max(lng))
      FROM (SELECT lat, lng FROM hilir_unik WHERE lat IS NOT NULL
            UNION ALL SELECT a.lat, a.lng) x)
  ) INTO hasil;

  RETURN hasil;
END $$;

COMMENT ON FUNCTION public.simulasi_buka_alat IS
  'Hanya membaca. Apa yang padam kalau alat hubung di tiang ini dibuka: tiang & gawang hilir, gardu (lewat tiang berpenanda gardu ↔ gardu terdekat ≤100 m), kVA & beban terakhir, dan alat hubung lain yang ikut mati.';

GRANT EXECUTE ON FUNCTION public.simulasi_buka_alat(UUID) TO authenticated;


-- =============================================================================
-- Periksa (dipanggil, bukan sekadar dibuat):
--   SELECT jsonb_pretty(simulasi_buka_alat(id) - 'bentang')
--   FROM tiang WHERE penanda IN ('lbs','recloser') AND status_hidup = 'aktif' LIMIT 1;
-- =============================================================================
