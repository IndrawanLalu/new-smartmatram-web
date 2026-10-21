-- =============================================================================
-- Survey Jaringan Baru — S1 (21 Okt 2026), rencana: rencana-jaringan-baru.md
-- Jalankan manual di Supabase SQL Editor. Idempoten (aman diulang).
-- Perlu: wajib_boleh_ulp (wo-perabasan.sql), jarak_meter (jtr-schema.sql), tiang JTM.
--
-- Jaringan baru digambar di peta sebagai TITIK SURVEY — tabel sendiri, BUKAN
-- baris `tiang` berstatus usulan. Alasannya: belasan view/fungsi JTM membaca
-- `tiang` tanpa menyaring status_hidup, sehingga tiang rencana bisa bocor ke
-- peta, penamaan, segmen, atau rekap. Di tabel sendiri, jaringan survey tidak
-- mungkin terhitung sebelum dioperasikan; saat Operasikan (S2) titik-titik ini
-- yang melahirkan tiang aktif — tanpa ketik ulang.
--
--   survey_jaringan          satu paket pekerjaan (Draf → Disetujui →
--                            Dioperasikan / Batal), material disunting user
--   survey_titik             tiang rencana; induk = titik survey lain ATAU
--                            tiang JTM aktif yang ada (titik sambung)
--   survey_jaringan_daftar   + jumlah tiang, panjang (m), gardu baru
--   simpan_survey_jaringan   seluruh gambar disimpan sekaligus (Draf saja)
--   setujui_ / buka_ / batalkan_survey_jaringan, ubah_material_survey
--
-- Semua penulisan lewat fungsi (hak ULP diperiksa di sana); tabel hanya dibaca.
-- =============================================================================


-- ── 1. Tabel ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.survey_jaringan (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  jenis       TEXT NOT NULL DEFAULT 'JTM' CHECK (jenis IN ('JTM', 'JTR')),
  ulp         TEXT NOT NULL,
  penyulang   TEXT,
  judul       TEXT NOT NULL,
  alasan      TEXT NOT NULL DEFAULT 'perluasan'
              CHECK (alasan IN ('perluasan', 'sisip-gardu', 'tambah-jurusan', 'lainnya')),
  status      TEXT NOT NULL DEFAULT 'Draf'
              CHECK (status IN ('Draf', 'Disetujui', 'Dioperasikan', 'Batal')),
  material    JSONB NOT NULL DEFAULT '[]'::jsonb,
  catatan     TEXT,
  dibuat_oleh TEXT,
  dibuat_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  diubah_oleh TEXT,
  diubah_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  disetujui_oleh TEXT,
  disetujui_at   TIMESTAMPTZ,
  batal_alasan   TEXT,
  batal_oleh     TEXT,
  batal_at       TIMESTAMPTZ,
  tgl_operasi       DATE,
  dioperasikan_oleh TEXT,
  dioperasikan_at   TIMESTAMPTZ
);
COMMENT ON TABLE public.survey_jaringan IS
  'Survey Jaringan Baru: satu paket rencana jaringan (JTM/JTR). Titiknya di survey_titik; jadi aset aktif saat Dioperasikan.';

CREATE TABLE IF NOT EXISTS public.survey_titik (
  -- id dibuat web, supaya gambar yang belum tersimpan bisa saling menunjuk.
  id               UUID PRIMARY KEY,
  survey_id        UUID NOT NULL REFERENCES public.survey_jaringan(id) ON DELETE CASCADE,
  urutan           INT NOT NULL,
  lat              DOUBLE PRECISION NOT NULL,
  lng              DOUBLE PRECISION NOT NULL,
  -- Ditunda sampai akhir transaksi: seluruh gambar diganti sekaligus.
  induk_titik_id   UUID REFERENCES public.survey_titik(id) DEFERRABLE INITIALLY DEFERRED,
  induk_tiang_id   UUID REFERENCES public.tiang(id),
  jenis_tiang      TEXT,
  konstruksi       TEXT,
  -- Konduktor gawang dari induk ke titik ini.
  konduktor_jenis  TEXT,
  konduktor_ukuran TEXT,
  -- Kode jtm_ref kategori 'penanda' (gardu, FCO, LBS, …), NULL = tiang biasa.
  penanda          TEXT,
  gardu_kva        NUMERIC,
  gardu_nama       TEXT,
  catatan          TEXT,
  CONSTRAINT survey_titik_satu_induk CHECK (num_nonnulls(induk_titik_id, induk_tiang_id) = 1)
);
CREATE INDEX IF NOT EXISTS survey_titik_survey_idx ON public.survey_titik (survey_id, urutan);
COMMENT ON COLUMN public.survey_titik.induk_tiang_id IS
  'Titik sambung: tiang JTM aktif yang ada tempat jaringan baru menyambung.';

ALTER TABLE public.survey_jaringan ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.survey_titik ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS survey_jaringan_baca ON public.survey_jaringan;
CREATE POLICY survey_jaringan_baca ON public.survey_jaringan FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS survey_titik_baca ON public.survey_titik;
CREATE POLICY survey_titik_baca ON public.survey_titik FOR SELECT TO authenticated USING (true);
GRANT SELECT ON public.survey_jaringan, public.survey_titik TO authenticated;


-- ── 2. Daftar: + jumlah tiang, panjang, gardu baru ───────────────────────────
CREATE OR REPLACE VIEW public.survey_jaringan_daftar
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


-- ── 3. Simpan seluruh gambar (Draf saja) ────────────────────────────────────
-- p = { id?, judul, alasan, catatan, titik: [{id, urutan, lat, lng,
--       induk_titik_id | induk_tiang_id, jenis_tiang, konstruksi,
--       konduktor_jenis, konduktor_ukuran, penanda, gardu_kva, gardu_nama, catatan}] }
-- ULP & penyulang diturunkan dari titik sambung pertama — bukan dikirim web.
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

  -- Titik sambung: harus tiang JTM aktif, semuanya satu ULP.
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
    konduktor_jenis, konduktor_ukuran, penanda, gardu_kva, gardu_nama, catatan
  )
  SELECT (b->>'id')::uuid, v_id, COALESCE((b->>'urutan')::int, n::int),
         (b->>'lat')::double precision, (b->>'lng')::double precision,
         NULLIF(b->>'induk_titik_id', '')::uuid, NULLIF(b->>'induk_tiang_id', '')::uuid,
         NULLIF(btrim(b->>'jenis_tiang'), ''), NULLIF(btrim(b->>'konstruksi'), ''),
         NULLIF(btrim(b->>'konduktor_jenis'), ''), NULLIF(btrim(b->>'konduktor_ukuran'), ''),
         NULLIF(btrim(b->>'penanda'), ''), NULLIF(b->>'gardu_kva', '')::numeric,
         NULLIF(btrim(b->>'gardu_nama'), ''), NULLIF(btrim(b->>'catatan'), '')
    FROM jsonb_array_elements(p->'titik') WITH ORDINALITY AS x(b, n);

  -- Induk titik harus di survey yang sama, dan setiap titik harus tersambung
  -- ke tiang yang ada (tanpa putaran).
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


-- ── 4. Status & material ────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public._survey_kunci(p_id UUID, p_boleh TEXT[])
RETURNS public.survey_jaringan
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE s public.survey_jaringan;
BEGIN
  SELECT * INTO s FROM public.survey_jaringan WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Survey tidak ditemukan.'; END IF;
  PERFORM public.wajib_boleh_ulp(s.ulp);
  IF NOT (s.status = ANY (p_boleh)) THEN RAISE EXCEPTION 'Survey sudah %.', s.status; END IF;
  RETURN s;
END $fn$;

CREATE OR REPLACE FUNCTION public.setujui_survey_jaringan(p_id UUID, p_nama TEXT)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
BEGIN
  PERFORM public._survey_kunci(p_id, ARRAY['Draf']);
  UPDATE public.survey_jaringan SET status = 'Disetujui', disetujui_oleh = p_nama, disetujui_at = now() WHERE id = p_id;
END $fn$;

-- Disetujui → Draf, supaya gambarnya bisa diubah lagi.
CREATE OR REPLACE FUNCTION public.buka_survey_jaringan(p_id UUID, p_nama TEXT)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
BEGIN
  PERFORM public._survey_kunci(p_id, ARRAY['Disetujui']);
  UPDATE public.survey_jaringan
     SET status = 'Draf', disetujui_oleh = NULL, disetujui_at = NULL, diubah_oleh = p_nama, diubah_at = now()
   WHERE id = p_id;
END $fn$;

CREATE OR REPLACE FUNCTION public.batalkan_survey_jaringan(p_id UUID, p_alasan TEXT, p_nama TEXT)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
BEGIN
  PERFORM public._survey_kunci(p_id, ARRAY['Draf', 'Disetujui']);
  IF btrim(COALESCE(p_alasan, '')) = '' THEN RAISE EXCEPTION 'Alasan pembatalan wajib diisi.'; END IF;
  UPDATE public.survey_jaringan
     SET status = 'Batal', batal_alasan = btrim(p_alasan), batal_oleh = p_nama, batal_at = now()
   WHERE id = p_id;
END $fn$;

CREATE OR REPLACE FUNCTION public.ubah_material_survey(p_id UUID, p_material JSONB, p_catatan TEXT, p_nama TEXT)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
BEGIN
  PERFORM public._survey_kunci(p_id, ARRAY['Draf', 'Disetujui']);
  UPDATE public.survey_jaringan
     SET material = COALESCE(p_material, '[]'::jsonb), catatan = NULLIF(btrim(COALESCE(p_catatan, '')), ''),
         diubah_oleh = p_nama, diubah_at = now()
   WHERE id = p_id;
END $fn$;

REVOKE ALL ON FUNCTION public._survey_kunci(UUID, TEXT[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.setujui_survey_jaringan(UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.buka_survey_jaringan(UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.batalkan_survey_jaringan(UUID, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.ubah_material_survey(UUID, JSONB, TEXT, TEXT) TO authenticated;
