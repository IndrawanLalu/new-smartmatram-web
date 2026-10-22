-- =============================================================================
-- Survey Jaringan Baru — latar gambar survey: Peta jalan / Citra satelit (22 Okt 2026).
-- Jalankan SESUDAH survey-jaringan.sql … -5. Idempoten (aman diulang).
--
-- Dipilih di peta saat menggambar (peta ikut berganti), dipakai PDF — supaya
-- yang tercetak sama dengan yang dilihat waktu menggambar.
--
--   1. survey_jaringan.latar — 'jalan' (bawaan) / 'citra'
--   2. survey_jaringan_daftar dibuat ulang (s.* bertambah kolom; definisi = -5)
--   3. ubah_latar_survey — boleh di semua status kecuali Batal (tampilan, bukan gambar)
-- =============================================================================

ALTER TABLE public.survey_jaringan ADD COLUMN IF NOT EXISTS latar TEXT NOT NULL DEFAULT 'jalan';
ALTER TABLE public.survey_jaringan DROP CONSTRAINT IF EXISTS survey_jaringan_latar_valid;
ALTER TABLE public.survey_jaringan ADD CONSTRAINT survey_jaringan_latar_valid CHECK (latar IN ('jalan', 'citra'));
COMMENT ON COLUMN public.survey_jaringan.latar IS 'Latar gambar survey PDF: jalan (OpenStreetMap) / citra (citra satelit Esri). Dipilih di peta saat menggambar.';

DROP VIEW IF EXISTS public.survey_jaringan_daftar;
CREATE VIEW public.survey_jaringan_daftar
WITH (security_invoker = true) AS
SELECT s.*,
       COALESCE(x.tiang, 0)       AS jumlah_tiang,
       COALESCE(x.panjang_m, 0)   AS panjang_m,
       COALESCE(x.gardu, 0)       AS jumlah_gardu,
       COALESCE(x.gardu_kva, 0)   AS gardu_kva,
       COALESCE(x.tiang_jtm, 0)   AS jumlah_tiang_jtm,
       COALESCE(x.tiang_jtr, 0)   AS jumlah_tiang_jtr,
       COALESCE(x.panjang_jtm_m, 0) AS panjang_jtm_m,
       COALESCE(x.panjang_jtr_m, 0) AS panjang_jtr_m
FROM public.survey_jaringan s
LEFT JOIN LATERAL (
  SELECT (count(*) + count(*) FILTER (WHERE t.penanda = 'gardu' AND t.gardu_jenis = 'portal'))::int AS tiang,
         round(sum(g.m)::numeric, 1) AS panjang_m,
         count(*) FILTER (WHERE t.penanda = 'gardu')::int AS gardu,
         sum(t.gardu_kva) FILTER (WHERE t.penanda = 'gardu') AS gardu_kva,
         (count(*) FILTER (WHERE t.jaringan = 'JTM')
          + count(*) FILTER (WHERE t.penanda = 'gardu' AND t.gardu_jenis = 'portal'))::int AS tiang_jtm,
         count(*) FILTER (WHERE t.jaringan = 'JTR')::int AS tiang_jtr,
         round(COALESCE(sum(g.m) FILTER (WHERE t.kabel IN ('JTM', 'JTM+JTR')), 0)::numeric, 1) AS panjang_jtm_m,
         round(COALESCE(sum(g.m) FILTER (WHERE t.kabel IN ('JTR', 'JTM+JTR')), 0)::numeric, 1) AS panjang_jtr_m
  FROM public.survey_titik t
  LEFT JOIN public.survey_titik i ON i.id = t.induk_titik_id
  LEFT JOIN public.tiang a ON a.id = t.induk_tiang_id
  CROSS JOIN LATERAL (SELECT public.jarak_meter(t.lat, t.lng, COALESCE(i.lat, a.lat), COALESCE(i.lng, a.lng)) AS m) g
  WHERE t.survey_id = s.id
) x ON true;
GRANT SELECT ON public.survey_jaringan_daftar TO authenticated;

CREATE OR REPLACE FUNCTION public.ubah_latar_survey(p_id UUID, p_latar TEXT, p_nama TEXT)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
BEGIN
  PERFORM public._survey_kunci(p_id, ARRAY['Draf', 'Disetujui', 'Dioperasikan']);
  IF p_latar NOT IN ('jalan', 'citra') THEN RAISE EXCEPTION 'Latar tidak dikenal: %', p_latar; END IF;
  UPDATE public.survey_jaringan
     SET latar = p_latar, diubah_oleh = p_nama, diubah_at = now()
   WHERE id = p_id AND latar IS DISTINCT FROM p_latar;
END $fn$;
GRANT EXECUTE ON FUNCTION public.ubah_latar_survey(UUID, TEXT, TEXT) TO authenticated;
