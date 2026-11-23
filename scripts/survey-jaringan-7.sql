-- =============================================================================
-- Survey Jaringan — jenis kedua: REKONDUKTOR JTR (23 Nov 2026).
-- Rencana: rencana-rekonduktor-jtr.md. Jalankan SESUDAH survey-jaringan.sql … -6
-- dan jtr-usulan-ubah-pecah.sql. Idempoten (aman diulang).
--
-- Keputusan user 23 Nov: nama di layar "Survey Jaringan" (dua jenis: Jaringan
-- Baru & Rekonduktor JTR); rekonduktor = ganti kabel + aksesoris, tiang tetap;
-- suspension / fixed (dead end) / LA (large angle) dari data inspeksi JTR;
-- boleh beberapa ruas per survey.
--
-- Survey rekonduktor TIDAK punya titik survey. Ruasnya disimpan sebagai
-- SALINAN BEKU di survey_jaringan.ruas (jsonb): tiang yang dilalui, panjang
-- gawang, SR, aksesoris per tiang — inspeksi berikutnya tidak mengubah dasar
-- rencana yang sudah digambar.
--
--   1. survey_jaringan: jenis + 'REKONDUKTOR', kolom gardu_kode & ruas
--   2. jtr_material_ref: pekerjaan 'rekonduktor' + dasar per aksesoris
--   3. survey_jaringan_daftar: + rekon_ruas, rekon_tiang, rekon_panjang_m, rekon_sr
--   4. simpan_survey_rekonduktor
-- =============================================================================


-- ── 1. Kolom ─────────────────────────────────────────────────────────────────
ALTER TABLE public.survey_jaringan
  ADD COLUMN IF NOT EXISTS gardu_kode TEXT,
  ADD COLUMN IF NOT EXISTS ruas JSONB NOT NULL DEFAULT '[]'::jsonb;

DO $$
DECLARE c TEXT;
BEGIN
  -- CHECK jenis dari survey-jaringan.sql tanpa nama tetap — cari lewat definisinya.
  FOR c IN
    SELECT conname FROM pg_constraint
     WHERE conrelid = 'public.survey_jaringan'::regclass AND contype = 'c'
       AND pg_get_constraintdef(oid) LIKE '%jenis%'
  LOOP
    EXECUTE format('ALTER TABLE public.survey_jaringan DROP CONSTRAINT %I', c);
  END LOOP;
END $$;
ALTER TABLE public.survey_jaringan ADD CONSTRAINT survey_jaringan_jenis_valid
  CHECK (jenis IN ('JTM', 'JTR', 'REKONDUKTOR'));

COMMENT ON COLUMN public.survey_jaringan.jenis IS
  'JTM/JTR = Jaringan Baru (titik di survey_titik); REKONDUKTOR = Rekonduktor JTR (ruas di kolom ruas).';
COMMENT ON COLUMN public.survey_jaringan.gardu_kode IS 'Rekonduktor JTR: gardu pemilik JTR yang diganti kabelnya.';
COMMENT ON COLUMN public.survey_jaringan.ruas IS
  'Rekonduktor JTR: [{id, jurusan, nomor_kabel, kabel_lama, kabel_jenis, kabel_ukuran, dari_gardu, tiang:[{tiang_id, kode, lat, lng, panjang_m, sr, suspension, fixed, la, treckschoer, drugschoer, kontramast, stay}]}] — tiang urut hulu → hilir, salinan beku saat disimpan.';


-- ── 2. Material bawaan rekonduktor ───────────────────────────────────────────
DO $$
DECLARE c TEXT;
BEGIN
  FOR c IN
    SELECT conname FROM pg_constraint
     WHERE conrelid = 'public.jtr_material_ref'::regclass AND contype = 'c'
       AND (pg_get_constraintdef(oid) LIKE '%pekerjaan%' OR pg_get_constraintdef(oid) LIKE '%dasar%')
  LOOP
    EXECUTE format('ALTER TABLE public.jtr_material_ref DROP CONSTRAINT %I', c);
  END LOOP;
END $$;
ALTER TABLE public.jtr_material_ref ADD CONSTRAINT jtr_material_ref_pekerjaan_check
  CHECK (pekerjaan IN ('tambah-jurusan', 'pindah-sr', 'ganti-kabel', 'pemerataan', 'rekonduktor'));
ALTER TABLE public.jtr_material_ref ADD CONSTRAINT jtr_material_ref_dasar_check
  CHECK (dasar IN ('tetap', 'kabel_m', 'tiang', 'sr',
                   'suspension', 'fixed', 'la', 'treckschoer', 'drugschoer', 'kontramast'));

INSERT INTO public.jtr_material_ref (pekerjaan, nama, satuan, dasar, faktor, urutan)
SELECT * FROM (VALUES
  ('rekonduktor', 'Kabel {kabel}',                       'm',   'kabel_m',     1.05, 1),
  ('rekonduktor', 'Suspension clamp (penggantung)',      'bh',  'suspension',  1,    2),
  ('rekonduktor', 'Strain clamp (fixed / dead end)',     'bh',  'fixed',       1,    3),
  ('rekonduktor', 'Large angle assembly (LA)',           'set', 'la',          1,    4),
  ('rekonduktor', 'Treckschoer',                         'set', 'treckschoer', 1,    5),
  ('rekonduktor', 'Drugschoer',                          'set', 'drugschoer',  1,    6),
  ('rekonduktor', 'Kontramast',                          'set', 'kontramast',  1,    7),
  ('rekonduktor', 'CCO / joint SR ke JTR',               'bh',  'sr',          1,    8)
) v(pekerjaan, nama, satuan, dasar, faktor, urutan)
WHERE NOT EXISTS (SELECT 1 FROM public.jtr_material_ref WHERE pekerjaan = 'rekonduktor');


-- ── 3. Daftar: + angka rekonduktor ───────────────────────────────────────────
-- s.* bertambah kolom → view dibuat ulang (definisi lain = survey-jaringan-6.sql).
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
       COALESCE(x.panjang_jtr_m, 0) AS panjang_jtr_m,
       jsonb_array_length(s.ruas)   AS rekon_ruas,
       COALESCE(r.tiang, 0)         AS rekon_tiang,
       COALESCE(r.panjang_m, 0)     AS rekon_panjang_m,
       COALESCE(r.sr, 0)            AS rekon_sr
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
) x ON true
LEFT JOIN LATERAL (
  SELECT count(DISTINCT tg->>'tiang_id')::int AS tiang,
         round(COALESCE(sum((tg->>'panjang_m')::numeric), 0), 1) AS panjang_m,
         COALESCE(sum((tg->>'sr')::int), 0)::int AS sr
  FROM jsonb_array_elements(s.ruas) ru
  CROSS JOIN LATERAL jsonb_array_elements(ru->'tiang') tg
) r ON true;
GRANT SELECT ON public.survey_jaringan_daftar TO authenticated;


-- ── 4. Simpan survey rekonduktor (Draf saja) ────────────────────────────────
-- p = { id?, judul, catatan, gardu_kode, material?, ruas: [...] (lihat COMMENT kolom ruas) }
-- ULP diturunkan dari tiang ruas, penyulang dari master gardu — bukan dikirim web.
-- material hanya dipakai bila survey belum punya material: suntingan di rincian
-- tidak tertimpa saat gambar disimpan ulang (hitung ulang lewat rincian).
CREATE OR REPLACE FUNCTION public.simpan_survey_rekonduktor(p JSONB, p_nama TEXT)
RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  v_id    UUID := NULLIF(p->>'id', '')::uuid;
  v_lama  public.survey_jaringan;
  v_gardu TEXT := upper(NULLIF(btrim(COALESCE(p->>'gardu_kode', '')), ''));
  v_judul TEXT := NULLIF(btrim(COALESCE(p->>'judul', '')), '');
  v_ruas  JSONB := p->'ruas';
  v_ulp   TEXT;
  v_pny   TEXT;
  v_salah TEXT;
BEGIN
  IF v_judul IS NULL THEN RAISE EXCEPTION 'Judul survey wajib diisi.'; END IF;
  IF v_gardu IS NULL THEN RAISE EXCEPTION 'Pilih gardu dulu.'; END IF;
  IF jsonb_typeof(v_ruas) IS DISTINCT FROM 'array' OR jsonb_array_length(v_ruas) = 0 THEN
    RAISE EXCEPTION 'Belum ada ruas — pilih tiang awal dan tiang akhir JTR yang diganti.';
  END IF;

  -- Bentuk tiap ruas & tiang. Pesan menyebut nomor ruas seperti di layar.
  SELECT string_agg(format('Ruas %s: %s', n, sebab), '; ' ORDER BY n) INTO v_salah
  FROM jsonb_array_elements(v_ruas) WITH ORDINALITY AS x(ru, n)
  CROSS JOIN LATERAL (SELECT CASE
    WHEN jsonb_typeof(ru->'tiang') IS DISTINCT FROM 'array' OR jsonb_array_length(ru->'tiang') = 0
      THEN 'tidak ada tiang'
    WHEN NOT COALESCE((ru->>'dari_gardu')::boolean, false) AND jsonb_array_length(ru->'tiang') < 2
      THEN 'paling sedikit dua tiang (awal dan akhir)'
    WHEN NULLIF(btrim(COALESCE(ru->>'kabel_jenis', '')), '') IS NULL
      THEN 'kabel pengganti belum dipilih'
    WHEN EXISTS (
      SELECT 1 FROM jsonb_array_elements(ru->'tiang') tg, unnest(ARRAY['sr', 'suspension', 'fixed', 'la', 'treckschoer', 'drugschoer', 'kontramast']) k
      WHERE jsonb_typeof(tg->k) IS DISTINCT FROM 'number' OR (tg->>k)::numeric < 0 OR (tg->>k)::numeric <> trunc((tg->>k)::numeric)
    ) THEN 'jumlah per tiang harus bilangan bulat 0 atau lebih'
  END AS sebab) c
  WHERE c.sebab IS NOT NULL;
  IF v_salah IS NOT NULL THEN RAISE EXCEPTION '%', v_salah; END IF;

  -- Tiang harus tiang JTR aktif, semuanya satu ULP.
  SELECT upper(t.ulp) INTO v_ulp
    FROM public.tiang t
   WHERE t.id = (v_ruas->0->'tiang'->0->>'tiang_id')::uuid;
  IF v_ulp IS NULL THEN RAISE EXCEPTION 'Tiang ruas tidak ditemukan.'; END IF;
  SELECT string_agg(DISTINCT COALESCE(t.kode, tg->>'kode', tg->>'tiang_id'), ', ') INTO v_salah
    FROM jsonb_array_elements(v_ruas) ru
    CROSS JOIN LATERAL jsonb_array_elements(ru->'tiang') tg
    LEFT JOIN public.tiang t ON t.id = (tg->>'tiang_id')::uuid
   WHERE t.id IS NULL OR t.status_hidup <> 'aktif' OR t.gardu_kode IS NULL OR upper(t.ulp) <> v_ulp;
  IF v_salah IS NOT NULL THEN
    RAISE EXCEPTION 'Bukan tiang JTR aktif di ULP %: %.', v_ulp, v_salah;
  END IF;
  PERFORM public.wajib_boleh_ulp(v_ulp);

  SELECT g.feeder INTO v_pny FROM public.gardu g WHERE upper(g.kode) = v_gardu AND upper(g.ulp) = v_ulp LIMIT 1;

  IF v_id IS NOT NULL THEN
    SELECT * INTO v_lama FROM public.survey_jaringan WHERE id = v_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Survey tidak ditemukan.'; END IF;
    PERFORM public.wajib_boleh_ulp(v_lama.ulp);
    IF v_lama.jenis <> 'REKONDUKTOR' THEN RAISE EXCEPTION 'Survey ini bukan Rekonduktor JTR.'; END IF;
    IF v_lama.status <> 'Draf' THEN
      RAISE EXCEPTION 'Survey sudah %, ruas tidak bisa diubah — buka kembali ke Draf dulu.', v_lama.status;
    END IF;
    UPDATE public.survey_jaringan
       SET ulp = v_ulp, penyulang = v_pny, judul = v_judul, gardu_kode = v_gardu, ruas = v_ruas,
           catatan = NULLIF(btrim(COALESCE(p->>'catatan', '')), ''),
           material = CASE WHEN material = '[]'::jsonb AND jsonb_typeof(p->'material') = 'array' THEN p->'material' ELSE material END,
           diubah_oleh = p_nama, diubah_at = now()
     WHERE id = v_id;
  ELSE
    INSERT INTO public.survey_jaringan (jenis, ulp, penyulang, judul, alasan, gardu_kode, ruas, material, catatan, dibuat_oleh, diubah_oleh)
    VALUES ('REKONDUKTOR', v_ulp, v_pny, v_judul, 'lainnya', v_gardu, v_ruas,
            CASE WHEN jsonb_typeof(p->'material') = 'array' THEN p->'material' ELSE '[]'::jsonb END,
            NULLIF(btrim(COALESCE(p->>'catatan', '')), ''), p_nama, p_nama)
    RETURNING id INTO v_id;
  END IF;
  RETURN v_id;
END $fn$;
GRANT EXECUTE ON FUNCTION public.simpan_survey_rekonduktor(JSONB, TEXT) TO authenticated;
