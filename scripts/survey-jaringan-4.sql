-- =============================================================================
-- Survey Jaringan Baru — foto kondisi lapangan (21 Okt 2026, koreksi user).
-- Jalankan SESUDAH survey-jaringan.sql, -2, -3. Idempoten (aman diulang).
--
--   1. survey_jaringan.foto — daftar URL foto (bucket `inspections`,
--      folder survey/<id>/), dilampirkan di bawah tabel material & ikut PDF
--   2. ubah_foto_survey — menyimpan daftarnya (Draf / Disetujui / Dioperasikan)
-- =============================================================================

ALTER TABLE public.survey_jaringan ADD COLUMN IF NOT EXISTS foto JSONB NOT NULL DEFAULT '[]'::jsonb;
COMMENT ON COLUMN public.survey_jaringan.foto IS 'Foto kondisi lapangan: larik URL publik bucket inspections (survey/<id>/…).';

-- s.* berubah kolomnya → view dibuat ulang (definisi sama dengan -3).
DROP VIEW IF EXISTS public.survey_jaringan_daftar;
CREATE VIEW public.survey_jaringan_daftar
WITH (security_invoker = true) AS
SELECT s.*,
       COALESCE(x.tiang, 0)       AS jumlah_tiang,
       COALESCE(x.panjang_m, 0)   AS panjang_m,
       COALESCE(x.gardu, 0)       AS jumlah_gardu,
       COALESCE(x.gardu_kva, 0)   AS gardu_kva
FROM public.survey_jaringan s
LEFT JOIN LATERAL (
  SELECT (count(*) + count(*) FILTER (WHERE t.penanda = 'gardu' AND t.gardu_jenis = 'portal'))::int AS tiang,
         round(sum(public.jarak_meter(t.lat, t.lng, COALESCE(i.lat, a.lat), COALESCE(i.lng, a.lng)))::numeric, 1) AS panjang_m,
         count(*) FILTER (WHERE t.penanda = 'gardu')::int AS gardu,
         sum(t.gardu_kva) FILTER (WHERE t.penanda = 'gardu') AS gardu_kva
  FROM public.survey_titik t
  LEFT JOIN public.survey_titik i ON i.id = t.induk_titik_id
  LEFT JOIN public.tiang a ON a.id = t.induk_tiang_id
  WHERE t.survey_id = s.id
) x ON true;
GRANT SELECT ON public.survey_jaringan_daftar TO authenticated;


CREATE OR REPLACE FUNCTION public.ubah_foto_survey(p_id UUID, p_foto JSONB, p_nama TEXT)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
BEGIN
  PERFORM public._survey_kunci(p_id, ARRAY['Draf', 'Disetujui', 'Dioperasikan']);
  IF jsonb_typeof(COALESCE(p_foto, '[]'::jsonb)) <> 'array' THEN RAISE EXCEPTION 'Daftar foto tidak sah.'; END IF;
  IF jsonb_array_length(COALESCE(p_foto, '[]'::jsonb)) > 8 THEN RAISE EXCEPTION 'Paling banyak 8 foto.'; END IF;
  UPDATE public.survey_jaringan
     SET foto = COALESCE(p_foto, '[]'::jsonb), diubah_oleh = p_nama, diubah_at = now()
   WHERE id = p_id;
END $fn$;
GRANT EXECUTE ON FUNCTION public.ubah_foto_survey(UUID, JSONB, TEXT) TO authenticated;
