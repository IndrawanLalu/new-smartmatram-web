-- =============================================================================
-- Survey Jaringan Baru — JTM + gardu + JTR dalam satu survey (22 Okt 2026).
-- Jalankan SESUDAH survey-jaringan.sql, -2, -3, -4. Idempoten (aman diulang).
--
-- Keputusan user 22 Okt:
--   • tiang baru = Tiang JTM atau Tiang JTR;
--   • kabel dari induk = JTM, JTR, atau JTM + JTR (underbuild, satu tiang);
--   • JTR HANYA dimulai dari gardu baru di survey yang sama (atau melanjutkan
--     kabel JTR sebelumnya) — tidak dari gardu / tiang JTR yang sudah ada;
--   • jurusan (A, B, C …) diisi saat survey di tiap kabel JTR;
--   • foto berketerangan + simbol yang ditempel di foto (data, foto asli utuh).
--
--   1. survey_titik: jaringan, kabel, jtr_kabel_jenis, jtr_kabel_ukuran, jurusan
--   2. survey_jaringan_daftar: + tiang & panjang JTM / JTR terpisah
--   3. simpan_survey_jaringan: kolom baru + aturan sambung JTM/JTR
--   4. ubah_foto_survey: unsur foto boleh {url, ket, tanda[]} (lama: URL saja)
-- =============================================================================

-- ── 1. Kolom ─────────────────────────────────────────────────────────────────
ALTER TABLE public.survey_titik
  ADD COLUMN IF NOT EXISTS jaringan TEXT NOT NULL DEFAULT 'JTM',
  ADD COLUMN IF NOT EXISTS kabel    TEXT NOT NULL DEFAULT 'JTM',
  ADD COLUMN IF NOT EXISTS jtr_kabel_jenis  TEXT,
  ADD COLUMN IF NOT EXISTS jtr_kabel_ukuran TEXT,
  ADD COLUMN IF NOT EXISTS jurusan  TEXT;

ALTER TABLE public.survey_titik DROP CONSTRAINT IF EXISTS survey_titik_jaringan_valid;
ALTER TABLE public.survey_titik ADD CONSTRAINT survey_titik_jaringan_valid CHECK (jaringan IN ('JTM', 'JTR'));
ALTER TABLE public.survey_titik DROP CONSTRAINT IF EXISTS survey_titik_kabel_valid;
ALTER TABLE public.survey_titik ADD CONSTRAINT survey_titik_kabel_valid CHECK (kabel IN ('JTM', 'JTR', 'JTM+JTR'));

COMMENT ON COLUMN public.survey_titik.jaringan IS 'Jenis tiang baru: JTM atau JTR.';
COMMENT ON COLUMN public.survey_titik.kabel IS 'Kabel dari induk ke titik ini: JTM, JTR, atau JTM+JTR (underbuild). konduktor_* = JTM, jtr_kabel_* = JTR.';
COMMENT ON COLUMN public.survey_titik.jurusan IS 'Jurusan JTR (A, B, C …) kabel JTR yang masuk ke titik ini.';


-- ── 2. Daftar: JTM & JTR terpisah ────────────────────────────────────────────
-- Kolom baru di BELAKANG (CREATE OR REPLACE VIEW hanya boleh menambah di akhir).
CREATE OR REPLACE VIEW public.survey_jaringan_daftar
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


-- ── 3. simpan_survey_jaringan — disalin dari survey-jaringan-3.sql; ★ JTR ────
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
  v_salah TEXT;
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
    konduktor_jenis, konduktor_ukuran, penanda, gardu_kva, gardu_nama, gardu_jenis, gardu_arah, catatan,
    jaringan, kabel, jtr_kabel_jenis, jtr_kabel_ukuran, jurusan
  )
  SELECT (b->>'id')::uuid, v_id, COALESCE((b->>'urutan')::int, n::int),
         (b->>'lat')::double precision, (b->>'lng')::double precision,
         NULLIF(b->>'induk_titik_id', '')::uuid, NULLIF(b->>'induk_tiang_id', '')::uuid,
         NULLIF(btrim(b->>'jenis_tiang'), ''), NULLIF(btrim(b->>'konstruksi'), ''),
         CASE WHEN kb <> 'JTR' THEN NULLIF(btrim(b->>'konduktor_jenis'), '') END,
         CASE WHEN kb <> 'JTR' THEN NULLIF(btrim(b->>'konduktor_ukuran'), '') END,
         NULLIF(btrim(b->>'penanda'), ''), NULLIF(b->>'gardu_kva', '')::numeric,
         NULLIF(btrim(b->>'gardu_nama'), ''),
         CASE WHEN b->>'penanda' = 'gardu' THEN NULLIF(btrim(b->>'gardu_jenis'), '') END,
         CASE WHEN b->>'penanda' = 'gardu' THEN mod(COALESCE(NULLIF(b->>'gardu_arah', '')::numeric, 0) + 360, 360) ELSE 0 END,
         NULLIF(btrim(b->>'catatan'), ''),
         jr, kb,
         CASE WHEN kb <> 'JTM' THEN NULLIF(btrim(b->>'jtr_kabel_jenis'), '') END,
         CASE WHEN kb <> 'JTM' THEN NULLIF(btrim(b->>'jtr_kabel_ukuran'), '') END,
         CASE WHEN kb <> 'JTM' THEN upper(NULLIF(btrim(b->>'jurusan'), '')) END
    FROM jsonb_array_elements(p->'titik') WITH ORDINALITY AS x(b, n)
    CROSS JOIN LATERAL (SELECT COALESCE(NULLIF(b->>'jaringan', ''), 'JTM') AS jr,
                               COALESCE(NULLIF(b->>'kabel', ''), 'JTM') AS kb) k;

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

  -- ★ Aturan JTM / JTR. Pesan menyebut nomor tiang seperti di layar.
  SELECT string_agg(format('Tiang baru %s: %s', t.urutan, sebab), '; ' ORDER BY t.urutan) INTO v_salah
  FROM public.survey_titik t
  LEFT JOIN public.survey_titik i ON i.id = t.induk_titik_id
  CROSS JOIN LATERAL (SELECT CASE
    WHEN t.jaringan = 'JTR' AND t.kabel <> 'JTR'
      THEN 'tiang JTR hanya memikul kabel JTR'
    WHEN t.jaringan = 'JTR' AND t.penanda IS NOT NULL
      THEN 'gardu / peralatan hanya di tiang JTM'
    WHEN t.kabel IN ('JTM', 'JTM+JTR') AND t.induk_tiang_id IS NULL AND i.kabel NOT IN ('JTM', 'JTM+JTR')
      THEN 'kabel JTM harus menyambung dari tiang yang dilewati JTM'
    WHEN t.kabel IN ('JTR', 'JTM+JTR') AND t.induk_tiang_id IS NOT NULL
      THEN 'JTR hanya dimulai dari gardu baru di survey ini'
    WHEN t.kabel IN ('JTR', 'JTM+JTR') AND NOT (COALESCE(i.penanda, '') = 'gardu' OR i.kabel IN ('JTR', 'JTM+JTR'))
      THEN 'JTR hanya dimulai dari gardu baru di survey ini, atau melanjutkan kabel JTR'
    WHEN t.kabel IN ('JTR', 'JTM+JTR') AND t.jurusan IS NULL
      THEN 'jurusan JTR belum diisi'
  END AS sebab) c
  WHERE t.survey_id = v_id AND c.sebab IS NOT NULL;
  IF v_salah IS NOT NULL THEN
    RAISE EXCEPTION '%', v_salah;
  END IF;

  RETURN v_id;
END $fn$;
GRANT EXECUTE ON FUNCTION public.simpan_survey_jaringan(JSONB, TEXT) TO authenticated;


-- ── 4. Foto: {url, ket, tanda[]} — URL polos (data lama) tetap sah ───────────
CREATE OR REPLACE FUNCTION public.ubah_foto_survey(p_id UUID, p_foto JSONB, p_nama TEXT)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
BEGIN
  PERFORM public._survey_kunci(p_id, ARRAY['Draf', 'Disetujui', 'Dioperasikan']);
  IF jsonb_typeof(COALESCE(p_foto, '[]'::jsonb)) <> 'array' THEN RAISE EXCEPTION 'Daftar foto tidak sah.'; END IF;
  IF jsonb_array_length(COALESCE(p_foto, '[]'::jsonb)) > 8 THEN RAISE EXCEPTION 'Paling banyak 8 foto.'; END IF;
  IF EXISTS (
    SELECT 1 FROM jsonb_array_elements(COALESCE(p_foto, '[]'::jsonb)) f
    WHERE NOT COALESCE(jsonb_typeof(f) = 'string'
               OR (jsonb_typeof(f) = 'object' AND jsonb_typeof(f->'url') = 'string'
                   AND jsonb_typeof(COALESCE(f->'tanda', '[]'::jsonb)) = 'array'), false)
  ) THEN
    RAISE EXCEPTION 'Isian foto tidak sah.';
  END IF;
  UPDATE public.survey_jaringan
     SET foto = COALESCE(p_foto, '[]'::jsonb), diubah_oleh = p_nama, diubah_at = now()
   WHERE id = p_id;
END $fn$;
GRANT EXECUTE ON FUNCTION public.ubah_foto_survey(UUID, JSONB, TEXT) TO authenticated;
COMMENT ON COLUMN public.survey_jaringan.foto IS
  'Foto kondisi lapangan: larik {url, ket, tanda:[{jenis, x, y, arah, teks}]} (x/y 0–1 dari kiri-atas). Data lama: URL polos.';
