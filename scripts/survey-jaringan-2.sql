-- =============================================================================
-- Survey Jaringan Baru — tambahan 21 Okt 2026 (koreksi user). Jalankan SESUDAH
-- scripts/survey-jaringan.sql. Idempoten (aman diulang).
--
--   1. survey_titik.gardu_jenis  — gardu baru Portal (dua tiang) / Cantol
--   2. survey_jaringan.digambar_nama / diperiksa_nama / disetujui_nama —
--      nama di blok judul gambar survey (akun SMART bernama unit, bukan orang)
--   3. simpan_survey_jaringan ikut menyimpan gardu_jenis
--   4. ubah_pengesah_survey — mengisi ketiga nama itu
-- =============================================================================

ALTER TABLE public.survey_titik ADD COLUMN IF NOT EXISTS gardu_jenis TEXT;
ALTER TABLE public.survey_titik DROP CONSTRAINT IF EXISTS survey_titik_gardu_jenis_valid;
ALTER TABLE public.survey_titik ADD CONSTRAINT survey_titik_gardu_jenis_valid
  CHECK (gardu_jenis IS NULL OR gardu_jenis IN ('portal', 'cantol'));
COMMENT ON COLUMN public.survey_titik.gardu_jenis IS 'Gardu baru: portal (dua tiang) / cantol (satu tiang).';

ALTER TABLE public.survey_jaringan
  ADD COLUMN IF NOT EXISTS digambar_nama  TEXT,
  ADD COLUMN IF NOT EXISTS diperiksa_nama TEXT,
  ADD COLUMN IF NOT EXISTS disetujui_nama TEXT;

-- s.* berubah kolomnya → view dibuat ulang (CREATE OR REPLACE tidak bisa
-- menyisipkan kolom di tengah).
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
  SELECT count(*)::int AS tiang,
         round(sum(public.jarak_meter(t.lat, t.lng, COALESCE(i.lat, a.lat), COALESCE(i.lng, a.lng)))::numeric, 1) AS panjang_m,
         count(*) FILTER (WHERE t.penanda = 'gardu')::int AS gardu,
         sum(t.gardu_kva) FILTER (WHERE t.penanda = 'gardu') AS gardu_kva
  FROM public.survey_titik t
  LEFT JOIN public.survey_titik i ON i.id = t.induk_titik_id
  LEFT JOIN public.tiang a ON a.id = t.induk_tiang_id
  WHERE t.survey_id = s.id
) x ON true;
GRANT SELECT ON public.survey_jaringan_daftar TO authenticated;


-- ── 3. simpan_survey_jaringan — disalin dari survey-jaringan.sql; ★ gardu_jenis
CREATE OR REPLACE FUNCTION public.simpan_survey_jaringan(p JSONB, p_nama TEXT)
RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  v_id    UUID := NULLIF(p->>'id', '')::uuid;
  v_lama  public.survey_jaringan;
  v_ulp   TEXT;
  v_pny   TEXT;
  v_judul TEXT := NULLIF(btrim(COALESCE(p->>'judul', '')), '');
  v_n     INT;
  v_capai INT;
BEGIN
  IF v_judul IS NULL THEN RAISE EXCEPTION 'Judul survey wajib diisi.'; END IF;
  IF jsonb_typeof(p->'titik') IS DISTINCT FROM 'array' OR jsonb_array_length(p->'titik') = 0 THEN
    RAISE EXCEPTION 'Gambar belum ada — sambungkan ke tiang JTM lalu tambahkan tiang baru.';
  END IF;

  SELECT upper(t.ulp), t.penyulang INTO v_ulp, v_pny
    FROM jsonb_array_elements(p->'titik') WITH ORDINALITY AS x(b, n)
    JOIN public.tiang t ON t.id = NULLIF(x.b->>'induk_tiang_id', '')::uuid
   ORDER BY x.n LIMIT 1;
  IF v_ulp IS NULL THEN RAISE EXCEPTION 'Survey harus menyambung ke tiang JTM yang ada.'; END IF;
  IF EXISTS (
    SELECT 1 FROM jsonb_array_elements(p->'titik') b
    JOIN public.tiang t ON t.id = NULLIF(b->>'induk_tiang_id', '')::uuid
    WHERE t.status_hidup <> 'aktif' OR t.penyulang IS NULL OR t.gardu_kode IS NOT NULL
       OR upper(t.ulp) <> v_ulp
  ) THEN
    RAISE EXCEPTION 'Titik sambung harus tiang JTM aktif di ULP %.', v_ulp;
  END IF;
  PERFORM public.wajib_boleh_ulp(v_ulp);

  IF v_id IS NOT NULL THEN
    SELECT * INTO v_lama FROM public.survey_jaringan WHERE id = v_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Survey tidak ditemukan.'; END IF;
    PERFORM public.wajib_boleh_ulp(v_lama.ulp);
    IF v_lama.status <> 'Draf' THEN
      RAISE EXCEPTION 'Survey sudah %, gambar tidak bisa diubah — buka kembali ke Draf dulu.', v_lama.status;
    END IF;
    UPDATE public.survey_jaringan
       SET ulp = v_ulp, penyulang = v_pny, judul = v_judul,
           alasan = COALESCE(NULLIF(p->>'alasan', ''), alasan),
           catatan = NULLIF(btrim(COALESCE(p->>'catatan', '')), ''),
           diubah_oleh = p_nama, diubah_at = now()
     WHERE id = v_id;
    DELETE FROM public.survey_titik WHERE survey_id = v_id;
  ELSE
    INSERT INTO public.survey_jaringan (ulp, penyulang, judul, alasan, catatan, dibuat_oleh, diubah_oleh)
    VALUES (v_ulp, v_pny, v_judul, COALESCE(NULLIF(p->>'alasan', ''), 'perluasan'),
            NULLIF(btrim(COALESCE(p->>'catatan', '')), ''), p_nama, p_nama)
    RETURNING id INTO v_id;
  END IF;

  INSERT INTO public.survey_titik (
    id, survey_id, urutan, lat, lng, induk_titik_id, induk_tiang_id, jenis_tiang, konstruksi,
    konduktor_jenis, konduktor_ukuran, penanda, gardu_kva, gardu_nama, gardu_jenis, catatan
  )
  SELECT (b->>'id')::uuid, v_id, COALESCE((b->>'urutan')::int, n::int),
         (b->>'lat')::double precision, (b->>'lng')::double precision,
         NULLIF(b->>'induk_titik_id', '')::uuid, NULLIF(b->>'induk_tiang_id', '')::uuid,
         NULLIF(btrim(b->>'jenis_tiang'), ''), NULLIF(btrim(b->>'konstruksi'), ''),
         NULLIF(btrim(b->>'konduktor_jenis'), ''), NULLIF(btrim(b->>'konduktor_ukuran'), ''),
         NULLIF(btrim(b->>'penanda'), ''), NULLIF(b->>'gardu_kva', '')::numeric,
         NULLIF(btrim(b->>'gardu_nama'), ''),
         CASE WHEN b->>'penanda' = 'gardu' THEN NULLIF(btrim(b->>'gardu_jenis'), '') END,
         NULLIF(btrim(b->>'catatan'), '')
    FROM jsonb_array_elements(p->'titik') WITH ORDINALITY AS x(b, n);

  IF EXISTS (
    SELECT 1 FROM public.survey_titik t
    JOIN public.survey_titik i ON i.id = t.induk_titik_id
    WHERE t.survey_id = v_id AND i.survey_id <> v_id
  ) THEN
    RAISE EXCEPTION 'Titik survey menunjuk titik survey lain.';
  END IF;
  SELECT count(*) INTO v_n FROM public.survey_titik WHERE survey_id = v_id;
  WITH RECURSIVE capai AS (
    SELECT id FROM public.survey_titik WHERE survey_id = v_id AND induk_tiang_id IS NOT NULL
    UNION
    SELECT t.id FROM public.survey_titik t JOIN capai c ON t.induk_titik_id = c.id
  )
  SELECT count(*) INTO v_capai FROM capai;
  IF v_capai <> v_n THEN
    RAISE EXCEPTION 'Ada % titik survey yang tidak tersambung ke jaringan.', v_n - v_capai;
  END IF;
  RETURN v_id;
END $fn$;
GRANT EXECUTE ON FUNCTION public.simpan_survey_jaringan(JSONB, TEXT) TO authenticated;


-- ── 4. Nama di blok judul gambar (Draf / Disetujui / Dioperasikan) ───────────
CREATE OR REPLACE FUNCTION public.ubah_pengesah_survey(
  p_id UUID, p_digambar TEXT, p_diperiksa TEXT, p_disetujui TEXT, p_nama TEXT
) RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
BEGIN
  PERFORM public._survey_kunci(p_id, ARRAY['Draf', 'Disetujui', 'Dioperasikan']);
  UPDATE public.survey_jaringan
     SET digambar_nama  = NULLIF(btrim(COALESCE(p_digambar, '')), ''),
         diperiksa_nama = NULLIF(btrim(COALESCE(p_diperiksa, '')), ''),
         disetujui_nama = NULLIF(btrim(COALESCE(p_disetujui, '')), ''),
         diubah_oleh = p_nama, diubah_at = now()
   WHERE id = p_id;
END $fn$;
GRANT EXECUTE ON FUNCTION public.ubah_pengesah_survey(UUID, TEXT, TEXT, TEXT, TEXT) TO authenticated;
