-- ═══════════════════════════════════════════════════════════════════════════
-- Realisasi Harian LM — R2 + R3 (5 Nov 2026), rencana-realisasi-harian-4dx-susut.md
--
-- R2. "Pekerjaan yang dikerjakan": daftar tindakan per modul (diatur web,
--     halaman Realisasi Harian LM → Pengaturan), dicentang regu di HP + jumlah
--     + foto wajib per tindakan.
--       Pemeliharaan Gardu → langkah sendiri sebelum "Bukti pekerjaan",
--                            terkirim di RPC kirim_pemeliharaan_gardu (satu
--                            transaksi, teknisaplikasi butir 17).
--       Pemerataan Beban   → blok di bawah "Arus setelah diratakan", lewat RPC
--                            simpan_tindakan_penyeimbangan (pola lama modul ini:
--                            baris server sudah ada sejak WO diklaim).
--     Angka di Realisasi Harian LM = JUMLAH-nya (3 jurusan = 3), hanya bila
--     pekerjaan induknya disetujui. Sumber baris: 'tindakan:<kode>'.
--
-- R3. Pemeliharaan Jaringan: kolom jumlah_item (mis. 3 isolator). Realisasi
--     tetap per pekerjaan — jumlah hanya keterangan.
--
-- 7.  lm4dx_baris.kelompok (JTM / GARDU / JTR) — judul di tabel saja.
-- 8.  Pemeliharaan Jaringan jenis GARDU + gardu_kode (regu pilih dari master).
--
-- Aman dijalankan ulang. Tambalan fungsi hidup berhenti bila penandanya tidak
-- ditemukan tepat sekali (tidak ada yang berubah).
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 1. Daftar tindakan ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.tindakan_ref (
  kode        TEXT PRIMARY KEY,
  modul       TEXT NOT NULL CHECK (modul IN ('hargardu', 'penyeimbangan')),
  nama        TEXT NOT NULL,
  satuan      TEXT NOT NULL DEFAULT 'titik',
  urutan      INT  NOT NULL DEFAULT 0,
  aktif       BOOLEAN NOT NULL DEFAULT true,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by  TEXT
);
COMMENT ON TABLE public.tindakan_ref IS
  'Daftar "Pekerjaan yang dikerjakan" per modul (pekerjaan-tindakan.sql). Dicentang regu di HP, jumlah + foto wajib. Nonaktif = tidak tampil di HP, catatan lama tetap.';

ALTER TABLE public.tindakan_ref ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tindakan_ref_baca ON public.tindakan_ref;
CREATE POLICY tindakan_ref_baca ON public.tindakan_ref FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS tindakan_ref_ubah ON public.tindakan_ref;
CREATE POLICY tindakan_ref_ubah ON public.tindakan_ref FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.user_roles r WHERE r.user_id = auth.uid() AND r.role IN ('UP3', 'admin')))
  WITH CHECK (EXISTS (SELECT 1 FROM public.user_roles r WHERE r.user_id = auth.uid() AND r.role IN ('UP3', 'admin')));
GRANT SELECT, INSERT, UPDATE, DELETE ON public.tindakan_ref TO authenticated;

-- Isi awal dari daftar LM 4DX / Penurunan Susut dan contoh user 5 Nov.
-- Hanya bila kodenya belum ada — ubahan dari web tidak tertimpa.
INSERT INTO public.tindakan_ref (kode, modul, nama, satuan, urutan, updated_by) VALUES
  ('gardu_nh_fuse',        'hargardu',      'Penyesuaian NH Fuse/Fuse TR',                                         'jurusan', 10, 'isi awal'),
  ('gardu_fco',            'hargardu',      'Penyesuaian Fuse Cut Out',                                            'titik',   20, 'isi awal'),
  ('gardu_ukur_grounding', 'hargardu',      'Pengukuran Grounding Trafo/Arester/Netral',                           'titik',   30, 'isi awal'),
  ('gardu_grounding',      'hargardu',      'Perbaikan Grounding Gardu',                                           'titik',   40, 'isi awal'),
  ('gardu_titik_sambung',  'hargardu',      'Penyesuaian/Perbaikan Titik Sambung pada LA, FCO, PHB TR, Bushing Trafo', 'titik', 50, 'isi awal'),
  ('gardu_gembok',         'hargardu',      'Pemasangan Gembok Gardu',                                             'buah',    60, 'isi awal'),
  ('gardu_tap_trafo',      'hargardu',      'Penyesuaian Tap Trafo',                                               'trafo',   70, 'isi awal'),
  ('gardu_perisai',        'hargardu',      'Pemasangan perisai Binatang di Gardu',                                'gardu',   80, 'isi awal'),
  ('gardu_jumper_a3cs',    'hargardu',      'Penggantian Jumperan Gardu A3C menjadi A3CS',                         'titik',   90, 'isi awal'),
  ('rata_sr_seri',         'penyeimbangan', 'Perbaikan SR Seri',                                                   'titik',   10, 'isi awal')
ON CONFLICT (kode) DO NOTHING;


-- ── 2. Tindakan yang dikerjakan ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.pekerjaan_tindakan (
  modul          TEXT NOT NULL,
  sumber_id      TEXT NOT NULL,          -- pemeliharaan_gardu.id / penyeimbangan_gardu.id
  tindakan_kode  TEXT NOT NULL REFERENCES public.tindakan_ref(kode) ON UPDATE CASCADE,
  jumlah         INT  NOT NULL CHECK (jumlah > 0),
  foto_url       TEXT NOT NULL,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (modul, sumber_id, tindakan_kode)
);
CREATE INDEX IF NOT EXISTS ix_pekerjaan_tindakan_kode ON public.pekerjaan_tindakan (tindakan_kode);

ALTER TABLE public.pekerjaan_tindakan ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS pekerjaan_tindakan_baca ON public.pekerjaan_tindakan;
CREATE POLICY pekerjaan_tindakan_baca ON public.pekerjaan_tindakan FOR SELECT TO authenticated USING (true);
-- Ditulis hanya lewat fungsi di bawah.
GRANT SELECT ON public.pekerjaan_tindakan TO authenticated;

-- Simpan daftar tindakan satu pekerjaan (gantikan seluruhnya).
-- p_tindakan = [{kode, jumlah, foto}], NULL = HP lama → tidak disentuh.
CREATE OR REPLACE FUNCTION public._simpan_tindakan(p_modul TEXT, p_sumber_id TEXT, p_tindakan JSONB)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r RECORD;
BEGIN
  IF p_tindakan IS NULL OR jsonb_typeof(p_tindakan) <> 'array' THEN RETURN; END IF;

  FOR r IN
    SELECT x->>'kode' AS kode, x->>'jumlah' AS jumlah, NULLIF(btrim(COALESCE(x->>'foto', '')), '') AS foto, t.nama
    FROM jsonb_array_elements(p_tindakan) x
    LEFT JOIN public.tindakan_ref t ON t.kode = x->>'kode' AND t.modul = p_modul
  LOOP
    IF r.nama IS NULL THEN
      RAISE EXCEPTION 'Pekerjaan "%" tidak dikenal server. Tutup lalu buka lagi formulirnya supaya daftar pekerjaan diperbarui, kemudian kirim ulang.', r.kode;
    END IF;
    -- Dua IF terpisah: kondisi IF PL/pgSQL berhenti di THEN pertama, jadi
    -- CASE … THEN di dalam kondisi IF tidak boleh.
    IF NOT (length(COALESCE(r.jumlah, '')) BETWEEN 1 AND 6 AND btrim(r.jumlah, '0123456789') = '') THEN
      RAISE EXCEPTION 'Jumlah "%" harus angka bulat lebih dari 0.', r.nama;
    END IF;
    IF r.jumlah::int <= 0 THEN
      RAISE EXCEPTION 'Jumlah "%" harus angka bulat lebih dari 0.', r.nama;
    END IF;
    IF r.foto IS NULL THEN
      RAISE EXCEPTION 'Pekerjaan "%" wajib berfoto.', r.nama;
    END IF;
    IF r.foto NOT LIKE 'http%' THEN
      RAISE EXCEPTION 'Foto pekerjaan "%" belum terunggah. Kirim ulang saat sinyal lebih baik.', r.nama;
    END IF;
  END LOOP;

  DELETE FROM public.pekerjaan_tindakan WHERE modul = p_modul AND sumber_id = p_sumber_id;
  INSERT INTO public.pekerjaan_tindakan (modul, sumber_id, tindakan_kode, jumlah, foto_url)
  SELECT DISTINCT ON (x->>'kode') p_modul, p_sumber_id, x->>'kode', (x->>'jumlah')::int, btrim(x->>'foto')
  FROM jsonb_array_elements(p_tindakan) x;
END $$;
REVOKE ALL ON FUNCTION public._simpan_tindakan(TEXT, TEXT, JSONB) FROM PUBLIC, anon, authenticated;


-- ── 3. Pemeliharaan Gardu: tindakan ikut transaksi kirim ────────────────────
DO $do$
DECLARE
  def  TEXT;
  lama TEXT := E'  PERFORM public.selesaikan_pemeliharaan(v_id, v_nama);';
  baru TEXT := E'  -- ★ Pekerjaan yang dikerjakan (pekerjaan-tindakan.sql)\n'
            || E'  PERFORM public._simpan_tindakan(''hargardu'', v_id::text, p_isi->''tindakan'');\n\n'
            || E'  PERFORM public.selesaikan_pemeliharaan(v_id, v_nama);';
BEGIN
  SELECT replace(pg_get_functiondef('public.kirim_pemeliharaan_gardu(jsonb)'::regprocedure), E'\r\n', E'\n') INTO def;
  IF position('_simpan_tindakan' IN def) > 0 THEN
    RAISE NOTICE 'kirim_pemeliharaan_gardu sudah bertambalan tindakan — dilewati.'; RETURN;
  END IF;
  IF (length(def) - length(replace(def, lama, ''))) / length(lama) <> 1 THEN
    RAISE EXCEPTION 'Tambalan kirim_pemeliharaan_gardu: penanda tidak ditemukan tepat sekali — tidak ada yang berubah.';
  END IF;
  EXECUTE replace(def, lama, baru);
  RAISE NOTICE 'kirim_pemeliharaan_gardu ditambal (tindakan).';
END $do$;


-- ── 4. Pemerataan Beban: RPC tindakan ───────────────────────────────────────
CREATE OR REPLACE FUNCTION public.simpan_tindakan_penyeimbangan(p_id UUID, p_tindakan JSONB)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_role TEXT; v_unit TEXT; s RECORD;
BEGIN
  SELECT role, unit INTO v_role, v_unit FROM public.user_roles WHERE user_id = auth.uid();
  IF v_role IS NULL THEN
    RAISE EXCEPTION 'Sesi tidak dikenali server. Keluar lalu masuk lagi, kemudian simpan ulang.';
  END IF;
  SELECT id, ulp, petugas_uid, no_gardu INTO s FROM public.penyeimbangan_gardu WHERE id = p_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Pekerjaan pemerataan ini tidak ada di server (mungkin sudah dilepas).';
  END IF;
  IF v_role <> 'UP3' AND upper(COALESCE(v_unit, '')) <> upper(COALESCE(s.ulp, '')) THEN
    RAISE EXCEPTION 'Akun ini untuk ULP %, bukan %.', COALESCE(v_unit, '-'), s.ulp;
  END IF;
  IF v_role NOT IN ('UP3', 'admin') AND s.petugas_uid IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'Pemerataan gardu % dikerjakan akun lain.', s.no_gardu;
  END IF;
  PERFORM public._simpan_tindakan('penyeimbangan', p_id::text, p_tindakan);
END $$;
REVOKE ALL ON FUNCTION public.simpan_tindakan_penyeimbangan(UUID, JSONB) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.simpan_tindakan_penyeimbangan(UUID, JSONB) TO authenticated;


-- ── 5. R3 — Pemeliharaan Jaringan: jumlah item ──────────────────────────────
ALTER TABLE public.pemeliharaan_jaringan ADD COLUMN IF NOT EXISTS jumlah_item INT;
ALTER TABLE public.pemeliharaan_jaringan DROP CONSTRAINT IF EXISTS pemeliharaan_jaringan_jumlah_item_valid;
ALTER TABLE public.pemeliharaan_jaringan ADD CONSTRAINT pemeliharaan_jaringan_jumlah_item_valid
  CHECK (jumlah_item IS NULL OR jumlah_item > 0);
COMMENT ON COLUMN public.pemeliharaan_jaringan.jumlah_item IS
  'Jumlah barang yang dikerjakan (mis. 3 isolator). Keterangan saja — realisasi tetap per pekerjaan (keputusan user 5 Nov 2026).';

-- RPC kirim: simpan jumlah_item. HP lama tidak mengirim kuncinya → tidak disentuh.
DO $do$
DECLARE
  def  TEXT;
  lama TEXT := E'  IF t.id IS NOT NULL THEN\n    UPDATE public.inspeksi';
  baru TEXT := E'  -- ★ jumlah item (pekerjaan-tindakan.sql, R3)\n'
            || E'  IF p_isi ? ''jumlah_item'' THEN\n'
            || E'    UPDATE public.pemeliharaan_jaringan\n'
            || E'    SET jumlah_item = CASE WHEN length(COALESCE(p_isi->>''jumlah_item'', '''')) BETWEEN 1 AND 6\n'
            || E'                            AND btrim(p_isi->>''jumlah_item'', ''0123456789'') = ''''\n'
            || E'                           THEN NULLIF((p_isi->>''jumlah_item'')::int, 0) END\n'
            || E'    WHERE id = v_id;\n'
            || E'  END IF;\n\n'
            || E'  IF t.id IS NOT NULL THEN\n    UPDATE public.inspeksi';
BEGIN
  SELECT replace(pg_get_functiondef('public.kirim_pemeliharaan_jaringan(jsonb)'::regprocedure), E'\r\n', E'\n') INTO def;
  IF position('jumlah_item' IN def) > 0 THEN
    RAISE NOTICE 'kirim_pemeliharaan_jaringan sudah bertambalan jumlah_item — dilewati.'; RETURN;
  END IF;
  IF (length(def) - length(replace(def, lama, ''))) / length(lama) <> 1 THEN
    RAISE EXCEPTION 'Tambalan kirim_pemeliharaan_jaringan: penanda tidak ditemukan tepat sekali — tidak ada yang berubah.';
  END IF;
  EXECUTE replace(def, lama, baru);
  RAISE NOTICE 'kirim_pemeliharaan_jaringan ditambal (jumlah_item).';
END $do$;

-- View daftar: jumlah_item di AKHIR (CREATE OR REPLACE VIEW hanya boleh menambah di akhir).
DO $do$
DECLARE
  def  TEXT := pg_get_viewdef('public.pemeliharaan_jaringan_daftar'::regclass, true);
  lama TEXT := E'p.kelompok_id\n   FROM';
BEGIN
  IF position('jumlah_item' IN def) > 0 THEN
    RAISE NOTICE 'pemeliharaan_jaringan_daftar sudah memuat jumlah_item — dilewati.'; RETURN;
  END IF;
  IF (length(def) - length(replace(def, lama, ''))) / length(lama) <> 1 THEN
    RAISE EXCEPTION 'Tambalan pemeliharaan_jaringan_daftar: penanda tidak ditemukan tepat sekali — tidak ada yang berubah.';
  END IF;
  EXECUTE 'CREATE OR REPLACE VIEW public.pemeliharaan_jaringan_daftar AS ' || replace(def, lama, E'p.kelompok_id,\n    p.jumlah_item\n   FROM');
  RAISE NOTICE 'pemeliharaan_jaringan_daftar + jumlah_item.';
END $do$;


-- ── 6. Sumber baris LM ──────────────────────────────────────────────────────
-- Baris yang kosong (4DX dan Susut) → tindakan yang setara. Penurunan Susut:
-- NH Fuse & Pengukuran Grounding dipindah dari "seluruh Pemeliharaan Gardu" ke
-- tindakannya. LM 4DX untuk dua baris itu TIDAK diubah (Copy to LM 4DX dipakai
-- harian) — pindahkan lewat Atur baris bila sudah siap.
UPDATE public.lm4dx_baris b SET sumber = ARRAY[v.sumber], updated_at = now(), updated_by = 'pekerjaan-tindakan.sql'
FROM (VALUES
  ('Penyesuaian Fuse Cut Out (titik)', 'tindakan:gardu_fco'),
  ('Penyesuaian/Perbaikan Titik Sambung pada LA, FCO, PHB TR, Bushing Trafo (titik)', 'tindakan:gardu_titik_sambung'),
  ('Pemasangan Gembok Gardu', 'tindakan:gardu_gembok'),
  ('Penyesuaian Tap Trafo', 'tindakan:gardu_tap_trafo'),
  ('Penggantian Jumperan Gardu A3C menjadi A3CS (Titik)', 'tindakan:gardu_jumper_a3cs')
) AS v(uraian, sumber)
WHERE lower(btrim(b.uraian)) = lower(v.uraian) AND cardinality(b.sumber) = 0;

UPDATE public.lm4dx_baris b SET sumber = ARRAY[v.sumber], updated_at = now(), updated_by = 'pekerjaan-tindakan.sql'
FROM (VALUES
  ('Penyesuaian NH Fuse/Fuse TR (jurusan)', 'tindakan:gardu_nh_fuse'),
  ('Pengukuran Grounding Trafo/Arester/Netral (titik)', 'tindakan:gardu_ukur_grounding')
) AS v(uraian, sumber)
WHERE b.laporan = 'susut' AND lower(btrim(b.uraian)) = lower(v.uraian) AND b.sumber = ARRAY['hargardu'];


-- ── 7. Kelompok baris LM (JTM / Gardu / JTR) ────────────────────────────────
-- Hanya judul di tabel; urutan & salinan tidak berubah. Diisi lewat Atur baris.
ALTER TABLE public.lm4dx_baris ADD COLUMN IF NOT EXISTS kelompok TEXT;
ALTER TABLE public.lm4dx_baris DROP CONSTRAINT IF EXISTS lm4dx_baris_kelompok_valid;
ALTER TABLE public.lm4dx_baris ADD CONSTRAINT lm4dx_baris_kelompok_valid
  CHECK (kelompok IS NULL OR kelompok IN ('JTM', 'GARDU', 'JTR'));


-- ── 8. Pemeliharaan Jaringan jenis GARDU ────────────────────────────────────
-- Regu Harjar memilih kode gardu dari master; penyulang terisi dari gardunya
-- di HP. Realisasi tetap per pekerjaan (kunci 'harjtm'), tidak berubah.
ALTER TABLE public.pemeliharaan_jaringan ADD COLUMN IF NOT EXISTS gardu_kode TEXT;
COMMENT ON COLUMN public.pemeliharaan_jaringan.gardu_kode IS
  'Kode gardu bila jenis = GARDU (pekerjaan-tindakan.sql); NULL untuk JTM/JTR.';
ALTER TABLE public.pemeliharaan_jaringan DROP CONSTRAINT IF EXISTS pemeliharaan_jaringan_jenis_valid;
ALTER TABLE public.pemeliharaan_jaringan ADD CONSTRAINT pemeliharaan_jaringan_jenis_valid
  CHECK (jenis IN ('JTM', 'GARDU', 'JTR'));
ALTER TABLE public.pemeliharaan_jaringan_ref DROP CONSTRAINT IF EXISTS pemeliharaan_jaringan_ref_jenis_valid;
ALTER TABLE public.pemeliharaan_jaringan_ref ADD CONSTRAINT pemeliharaan_jaringan_ref_jenis_valid
  CHECK (jenis IN ('JTM', 'GARDU', 'JTR', 'SEMUA'));

-- Kirim HP: terima GARDU + kode gardunya. Koreksi web: terima GARDU.
DO $do$
DECLARE
  f    TEXT;
  def  TEXT;
  lama TEXT := $t$v_jenis NOT IN ('JTM', 'JTR')$t$;
  baru TEXT := $t$v_jenis NOT IN ('JTM', 'GARDU', 'JTR')$t$;
BEGIN
  FOREACH f IN ARRAY ARRAY['public.kirim_pemeliharaan_jaringan(jsonb)',
    'public.ubah_pemeliharaan_jaringan(uuid,text,text,text,text,text,double precision,double precision,text,text,text)'] LOOP
    IF to_regprocedure(f) IS NULL THEN RAISE NOTICE '% tidak ada — dilewati.', f; CONTINUE; END IF;
    SELECT replace(pg_get_functiondef(f::regprocedure), E'\r\n', E'\n') INTO def;
    IF position(baru IN def) > 0 THEN RAISE NOTICE '% sudah menerima GARDU — dilewati.', f; CONTINUE; END IF;
    IF (length(def) - length(replace(def, lama, ''))) / length(lama) <> 1 THEN
      RAISE EXCEPTION 'Tambalan %: penanda jenis tidak ditemukan tepat sekali — tidak ada yang berubah.', f;
    END IF;
    def := replace(def, lama, baru);
    def := replace(def, 'Jenis jaringan harus JTM atau JTR', 'Jenis harus JTM, Gardu, atau JTR');
    EXECUTE def;
    RAISE NOTICE '% menerima GARDU.', f;
  END LOOP;
END $do$;

DO $do$
DECLARE
  def  TEXT;
  lama TEXT := E'  IF t.id IS NOT NULL THEN\n    UPDATE public.inspeksi';
  baru TEXT := E'  -- ★ kode gardu bila jenis GARDU (pekerjaan-tindakan.sql)\n'
            || E'  IF v_jenis = ''GARDU'' AND NOT EXISTS (SELECT 1 FROM public.gardu g\n'
            || E'      WHERE upper(g.kode) = upper(btrim(COALESCE(p_isi->>''gardu'', '''')))) THEN\n'
            || E'    RAISE EXCEPTION ''Gardu wajib dipilih dari daftar gardu.'';\n'
            || E'  END IF;\n'
            || E'  UPDATE public.pemeliharaan_jaringan\n'
            || E'  SET gardu_kode = CASE WHEN v_jenis = ''GARDU'' THEN upper(btrim(p_isi->>''gardu'')) END\n'
            || E'  WHERE id = v_id;\n\n'
            || E'  IF t.id IS NOT NULL THEN\n    UPDATE public.inspeksi';
BEGIN
  SELECT replace(pg_get_functiondef('public.kirim_pemeliharaan_jaringan(jsonb)'::regprocedure), E'\r\n', E'\n') INTO def;
  IF position('gardu_kode' IN def) > 0 THEN
    RAISE NOTICE 'kirim_pemeliharaan_jaringan sudah bertambalan gardu_kode — dilewati.'; RETURN;
  END IF;
  IF (length(def) - length(replace(def, lama, ''))) / length(lama) <> 1 THEN
    RAISE EXCEPTION 'Tambalan kirim_pemeliharaan_jaringan (gardu): penanda tidak ditemukan tepat sekali — tidak ada yang berubah.';
  END IF;
  EXECUTE replace(def, lama, baru);
  RAISE NOTICE 'kirim_pemeliharaan_jaringan ditambal (gardu_kode).';
END $do$;

-- View daftar: gardu_kode di AKHIR (sesudah jumlah_item).
DO $do$
DECLARE
  def  TEXT := pg_get_viewdef('public.pemeliharaan_jaringan_daftar'::regclass, true);
  lama TEXT := E'p.jumlah_item\n   FROM';
BEGIN
  IF position('gardu_kode' IN def) > 0 THEN
    RAISE NOTICE 'pemeliharaan_jaringan_daftar sudah memuat gardu_kode — dilewati.'; RETURN;
  END IF;
  IF (length(def) - length(replace(def, lama, ''))) / length(lama) <> 1 THEN
    RAISE EXCEPTION 'Tambalan pemeliharaan_jaringan_daftar (gardu): penanda tidak ditemukan tepat sekali — tidak ada yang berubah.';
  END IF;
  EXECUTE 'CREATE OR REPLACE VIEW public.pemeliharaan_jaringan_daftar AS ' || replace(def, lama, E'p.jumlah_item,\n    p.gardu_kode\n   FROM');
  RAISE NOTICE 'pemeliharaan_jaringan_daftar + gardu_kode.';
END $do$;


-- ── Periksa ─────────────────────────────────────────────────────────────────
SELECT modul, kode, nama, satuan, aktif FROM public.tindakan_ref ORDER BY modul, urutan;
SELECT laporan, urutan, uraian, sumber FROM public.lm4dx_baris
WHERE EXISTS (SELECT 1 FROM unnest(sumber) s WHERE s LIKE 'tindakan:%') ORDER BY laporan, urutan;
