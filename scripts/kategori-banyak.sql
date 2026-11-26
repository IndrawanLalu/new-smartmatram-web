-- =============================================================================
-- Satu pekerjaan, BEBERAPA kategori — PDKB, HP HARJAR, dan koreksi web
-- (25 Nov 2026). Jalankan SESUDAH pdkb-2.sql & pemeliharaan-jaringan-input-
-- banyak.sql. Idempoten.
--
-- Arahan user 25 Nov: di satu titik bisa sekaligus pasang perisai JTM, perisai
-- gardu, ganti arester, dll. Tiap kategori harus terbaca sebagai realisasi LM
-- sendiri. Saat koreksi admin di web, kategori bisa DITAMBAH atau DIKOREKSI
-- (PDKB dan Pemeliharaan Jaringan).
--
-- Bentuknya sama dengan input admin berbanyak kategori (26 Okt): SATU BARIS PER
-- KATEGORI, sebaris-sekelompok lewat `kelompok_id`, foto & isian lain sama.
-- Realisasi, LM, tabel, dashboard tidak perlu diubah — mereka sudah menghitung
-- per baris.
--
--   1. pdkb_pekerjaan.kelompok_id (+ view daftar dibuat ulang supaya ikut).
--   2. _pj_tambah_kategori / _pdkb_tambah_kategori — salin baris utama menjadi
--      baris kategori lain (lewat jsonb, jadi kolom yang ada di lingkungan ini
--      ikut tersalin apa adanya). Kategori yang sudah hidup di kelompok itu
--      dilewati → aman diulang.
--   3. tambah_kategori_pemeliharaan_jaringan / tambah_kategori_pdkb — dari
--      koreksi web, hanya UP3 / admin ULP catatan itu.
--   4. kirim_pemeliharaan_jaringan_banyak(p_isi) — dipakai HP: kirim biasa +
--      p_isi.kategori_tambahan dalam SATU transaksi (gagal = tidak ada yang
--      tersimpan). kirim_pemeliharaan_jaringan TIDAK diubah; HP lama tetap jalan.
--   5. simpan_pekerjaan_pdkb (tambalan definisi hidup) menerima
--      p_isi.kategori_tambahan.
--   6. Batal (tambalan definisi hidup, PJ & PDKB): baris yang memegang tugas
--      dibatalkan sementara kategori lain sekelompok masih hidup → tugasnya
--      PINDAH ke baris itu, TIDAK dibuka lagi (pekerjaannya memang ada).
--
-- Baris kategori tambahan tidak memegang tugas (inspeksi_id NULL): satu tugas =
-- satu baris hidup (indeks unik yang sudah ada).
-- =============================================================================


-- ── 1. PDKB: kelompok ────────────────────────────────────────────────────────
ALTER TABLE public.pdkb_pekerjaan ADD COLUMN IF NOT EXISTS kelompok_id UUID;
CREATE INDEX IF NOT EXISTS pdkb_pekerjaan_kelompok_idx
  ON public.pdkb_pekerjaan (kelompok_id) WHERE kelompok_id IS NOT NULL;
COMMENT ON COLUMN public.pdkb_pekerjaan.kelompok_id IS
  'Baris-baris satu pekerjaan berbanyak kategori (foto sama). kategori-banyak.sql 25 Nov 2026.';

-- p.* dibekukan saat view dibuat → dibuat ulang supaya kelompok_id ikut (isi sama dengan pdkb-2.sql).
DROP VIEW IF EXISTS public.pdkb_pekerjaan_daftar;
CREATE VIEW public.pdkb_pekerjaan_daftar AS
SELECT p.*, r.label AS kategori_label,
       COALESCE(i.temuan, CASE WHEN x.id IS NOT NULL THEN 'Pohon / ROW' END) AS tugas_temuan,
       COALESCE(i.assigned_at, x.assigned_at) AS tugas_ditugaskan,
       COALESCE(i.source, x.source) AS tugas_sumber
FROM public.pdkb_pekerjaan p
LEFT JOIN public.pemeliharaan_jaringan_ref r ON r.kode = p.kategori
LEFT JOIN public.inspeksi i       ON p.tugas_tabel = 'inspeksi'       AND i.id::text = p.inspeksi_id
LEFT JOIN public.inspeksi_pohon x ON p.tugas_tabel = 'inspeksi_pohon' AND x.id::text = p.inspeksi_id;
GRANT SELECT ON public.pdkb_pekerjaan_daftar TO authenticated;


-- ── 2a. Pemeliharaan Jaringan: salin baris → kategori lain ───────────────────
CREATE OR REPLACE FUNCTION public._pj_tambah_kategori(p_id UUID, p_kategori TEXT[], p_oleh TEXT DEFAULT NULL)
RETURNS INT
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  j     public.pemeliharaan_jaringan;
  v_grp UUID;
  k     TEXT;
  v_lbl TEXT;
  n     INT := 0;
BEGIN
  IF COALESCE(cardinality(p_kategori), 0) = 0 THEN RETURN 0; END IF;
  IF cardinality(p_kategori) > 20 THEN RAISE EXCEPTION 'Paling banyak 20 kategori sekali simpan.'; END IF;
  SELECT * INTO j FROM public.pemeliharaan_jaringan WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Catatan tidak ditemukan.'; END IF;
  IF j.status NOT IN ('Selesai', 'Diverifikasi') THEN
    RAISE EXCEPTION 'Kategori hanya bisa ditambah pada catatan yang menunggu verifikasi / sudah disetujui (status sekarang: %).', j.status;
  END IF;

  v_grp := COALESCE(j.kelompok_id, j.id);
  IF j.kelompok_id IS NULL THEN
    UPDATE public.pemeliharaan_jaringan SET kelompok_id = v_grp WHERE id = j.id;
  END IF;

  FOREACH k IN ARRAY COALESCE((SELECT array_agg(DISTINCT btrim(x)) FROM unnest(p_kategori) x WHERE btrim(x) <> ''), '{}'::text[]) LOOP
    SELECT r.label INTO v_lbl FROM public.pemeliharaan_jaringan_ref r WHERE r.kode = k AND r.aktif;
    IF v_lbl IS NULL THEN RAISE EXCEPTION 'Kategori "%" tidak ada di daftar yang aktif', k; END IF;
    -- Sudah ada (hidup) di kelompok ini → lewati.
    CONTINUE WHEN EXISTS (
      SELECT 1 FROM public.pemeliharaan_jaringan x
      WHERE (x.kelompok_id = v_grp OR x.id = v_grp) AND x.kategori = k AND x.status <> 'Dibatalkan'
    );
    INSERT INTO public.pemeliharaan_jaringan
    SELECT (jsonb_populate_record(NULL::public.pemeliharaan_jaringan,
      to_jsonb(j) || jsonb_build_object(
        'id', gen_random_uuid(), 'kategori', k, 'pekerjaan', v_lbl, 'kelompok_id', v_grp,
        'inspeksi_id', NULL, 'jumlah_item', NULL,
        'created_at', now(), 'updated_at', now()
      ))).*;
    n := n + 1;
  END LOOP;
  RETURN n;
END $fn$;
REVOKE ALL ON FUNCTION public._pj_tambah_kategori(UUID, TEXT[], TEXT) FROM PUBLIC, anon, authenticated;


-- ── 2b. PDKB: salin baris → kategori lain ────────────────────────────────────
CREATE OR REPLACE FUNCTION public._pdkb_tambah_kategori(p_id UUID, p_kategori TEXT[], p_oleh TEXT DEFAULT NULL)
RETURNS INT
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  j     public.pdkb_pekerjaan;
  v_grp UUID;
  k     TEXT;
  v_lbl TEXT;
  n     INT := 0;
BEGIN
  IF COALESCE(cardinality(p_kategori), 0) = 0 THEN RETURN 0; END IF;
  IF cardinality(p_kategori) > 20 THEN RAISE EXCEPTION 'Paling banyak 20 kategori sekali simpan.'; END IF;
  SELECT * INTO j FROM public.pdkb_pekerjaan WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Catatan tidak ditemukan.'; END IF;
  IF j.status <> 'Tercatat' THEN RAISE EXCEPTION 'Catatan yang dibatalkan tidak bisa ditambah kategorinya.'; END IF;

  v_grp := COALESCE(j.kelompok_id, j.id);
  IF j.kelompok_id IS NULL THEN
    UPDATE public.pdkb_pekerjaan SET kelompok_id = v_grp WHERE id = j.id;
  END IF;

  FOREACH k IN ARRAY COALESCE((SELECT array_agg(DISTINCT btrim(x)) FROM unnest(p_kategori) x WHERE btrim(x) <> ''), '{}'::text[]) LOOP
    -- Aturan kategori sama dengan simpan (_periksa_isian_pdkb).
    SELECT r.label INTO v_lbl FROM public.pemeliharaan_jaringan_ref r
    WHERE r.kode = k AND r.aktif AND (r.jenis = 'SEMUA' OR r.jenis = j.jenis);
    IF v_lbl IS NULL THEN RAISE EXCEPTION 'Kategori % tidak berlaku untuk %.', k, j.jenis; END IF;
    CONTINUE WHEN EXISTS (
      SELECT 1 FROM public.pdkb_pekerjaan x
      WHERE (x.kelompok_id = v_grp OR x.id = v_grp) AND x.kategori = k AND x.status <> 'Dibatalkan'
    );
    INSERT INTO public.pdkb_pekerjaan
    SELECT (jsonb_populate_record(NULL::public.pdkb_pekerjaan,
      to_jsonb(j) || jsonb_build_object(
        'id', gen_random_uuid(), 'kategori', k, 'pekerjaan', v_lbl, 'kelompok_id', v_grp,
        'inspeksi_id', NULL, 'tugas_tabel', NULL,
        'diinput_oleh', COALESCE(p_oleh, j.diinput_oleh), 'created_by', auth.uid(),
        'dikoreksi_at', NULL, 'dikoreksi_oleh', NULL,
        'created_at', now(), 'updated_at', now()
      ))).*;
    n := n + 1;
  END LOOP;
  RETURN n;
END $fn$;
REVOKE ALL ON FUNCTION public._pdkb_tambah_kategori(UUID, TEXT[], TEXT) FROM PUBLIC, anon, authenticated;


-- ── 3. Dari koreksi web (UP3 / admin ULP catatan itu) ────────────────────────
CREATE OR REPLACE FUNCTION public.tambah_kategori_pemeliharaan_jaringan(p_id UUID, p_kategori TEXT[], p_oleh TEXT DEFAULT NULL)
RETURNS INT
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
BEGIN
  PERFORM public.wajib_boleh_ulp((SELECT j.ulp FROM public.pemeliharaan_jaringan j WHERE j.id = p_id));
  RETURN public._pj_tambah_kategori(p_id, p_kategori, p_oleh);
END $fn$;
REVOKE ALL ON FUNCTION public.tambah_kategori_pemeliharaan_jaringan(UUID, TEXT[], TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.tambah_kategori_pemeliharaan_jaringan(UUID, TEXT[], TEXT) TO authenticated;

CREATE OR REPLACE FUNCTION public.tambah_kategori_pdkb(p_id UUID, p_kategori TEXT[], p_oleh TEXT DEFAULT NULL)
RETURNS INT
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
BEGIN
  PERFORM public.wajib_boleh_ulp((SELECT j.ulp FROM public.pdkb_pekerjaan j WHERE j.id = p_id));
  RETURN public._pdkb_tambah_kategori(p_id, p_kategori, p_oleh);
END $fn$;
REVOKE ALL ON FUNCTION public.tambah_kategori_pdkb(UUID, TEXT[], TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.tambah_kategori_pdkb(UUID, TEXT[], TEXT) TO authenticated;


-- ── 4. Kiriman HP berbanyak kategori ─────────────────────────────────────────
-- Hak regu, tugas, foto, dsb. diperiksa kirim_pemeliharaan_jaringan seperti
-- biasa (auth.uid() tetap akun HP). Kiriman ulang yang sudah ada (jawaban hilang
-- di jalan) tidak menambah apa-apa: kategori lainnya tersimpan di transaksi
-- yang sama dengan kiriman pertama.
CREATE OR REPLACE FUNCTION public.kirim_pemeliharaan_jaringan_banyak(p_isi JSONB)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  r   JSONB;
  kat TEXT[] := ARRAY(SELECT jsonb_array_elements_text(
                  CASE WHEN jsonb_typeof(p_isi->'kategori_tambahan') = 'array' THEN p_isi->'kategori_tambahan' ELSE '[]'::jsonb END));
BEGIN
  r := public.kirim_pemeliharaan_jaringan(p_isi - 'kategori_tambahan');
  IF COALESCE((r->>'sudah_ada')::boolean, false) = false AND cardinality(kat) > 0 THEN
    PERFORM public._pj_tambah_kategori((r->>'id')::uuid, array_remove(kat, p_isi->>'kategori'), p_isi->>'nama');
  END IF;
  RETURN r;
END $fn$;
REVOKE ALL ON FUNCTION public.kirim_pemeliharaan_jaringan_banyak(JSONB) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.kirim_pemeliharaan_jaringan_banyak(JSONB) TO authenticated;


-- ── 5 & 6. Tambalan definisi HIDUP (teknisaplikasi.md 23.7) ──────────────────
-- Tiap tambalan: penanda harus ketemu TEPAT SEKALI, kalau tidak berhenti dan
-- fungsinya tidak diubah.
DO $do$
DECLARE
  f    TEXT;
  def  TEXT;
  lama TEXT;
  baru TEXT;
  hitung INT;
BEGIN
  -- 5. simpan_pekerjaan_pdkb: kategori_tambahan
  f := 'public.simpan_pekerjaan_pdkb(jsonb)';
  SELECT replace(pg_get_functiondef(f::regprocedure), E'\r\n', E'\n') INTO def;
  IF position('kategori-banyak.sql' IN def) = 0 THEN
    lama := E'  RETURN jsonb_build_object(''id'', v_id, ''sudah_ada'', false);';
    baru := E'  -- ★ kategori lain di titik yang sama (kategori-banyak.sql)\n'
         || E'  PERFORM public._pdkb_tambah_kategori(v_id, array_remove(ARRAY(SELECT jsonb_array_elements_text(\n'
         || E'    CASE WHEN jsonb_typeof(p_isi->''kategori_tambahan'') = ''array'' THEN p_isi->''kategori_tambahan'' ELSE ''[]''::jsonb END)), v_kat), v_oleh);\n'
         || lama;
    hitung := (length(def) - length(replace(def, lama, ''))) / length(lama);
    IF hitung <> 1 THEN RAISE EXCEPTION 'Tambalan simpan_pekerjaan_pdkb: penanda ketemu % kali — tidak ada yang berubah.', hitung; END IF;
    EXECUTE replace(def, lama, baru);
  END IF;

  -- 6a. batalkan_pekerjaan_pdkb: tugas pindah ke kategori lain sekelompok
  f := 'public.batalkan_pekerjaan_pdkb(uuid,text,text)';
  SELECT replace(pg_get_functiondef(f::regprocedure), E'\r\n', E'\n') INTO def;
  IF position('kategori-banyak.sql' IN def) = 0 THEN
    lama := E'  -- Tugasnya dibuka lagi di semua halaman';
    baru := E'  -- ★ kategori lain sekelompok masih hidup → tugas pindah ke sana, tidak dibuka lagi (kategori-banyak.sql)\n'
         || E'  IF j.inspeksi_id IS NOT NULL AND j.kelompok_id IS NOT NULL THEN\n'
         || E'    UPDATE public.pdkb_pekerjaan SET inspeksi_id = j.inspeksi_id, tugas_tabel = j.tugas_tabel, updated_at = now()\n'
         || E'    WHERE id = (SELECT x.id FROM public.pdkb_pekerjaan x\n'
         || E'                WHERE x.kelompok_id = j.kelompok_id AND x.id <> j.id AND x.status <> ''Dibatalkan''\n'
         || E'                ORDER BY x.created_at, x.id LIMIT 1);\n'
         || E'    IF FOUND THEN RETURN; END IF;\n'
         || E'  END IF;\n\n'
         || lama;
    hitung := (length(def) - length(replace(def, lama, ''))) / length(lama);
    IF hitung <> 1 THEN RAISE EXCEPTION 'Tambalan batalkan_pekerjaan_pdkb: penanda ketemu % kali — tidak ada yang berubah.', hitung; END IF;
    EXECUTE replace(def, lama, baru);
  END IF;

  -- 6b. batalkan_pemeliharaan_jaringan: sama
  f := 'public.batalkan_pemeliharaan_jaringan(uuid,text,text)';
  SELECT replace(pg_get_functiondef(f::regprocedure), E'\r\n', E'\n') INTO def;
  IF position('kategori-banyak.sql' IN def) = 0 THEN
    lama := E'  IF j.inspeksi_id IS NOT NULL THEN\n    UPDATE public.inspeksi\n    SET status = ''Ditugaskan''';
    baru := E'  -- ★ kategori lain sekelompok masih hidup → tugas pindah ke sana, tidak dibuka lagi (kategori-banyak.sql)\n'
         || E'  IF j.inspeksi_id IS NOT NULL AND j.kelompok_id IS NOT NULL THEN\n'
         || E'    UPDATE public.pemeliharaan_jaringan SET inspeksi_id = j.inspeksi_id, updated_at = now()\n'
         || E'    WHERE id = (SELECT x.id FROM public.pemeliharaan_jaringan x\n'
         || E'                WHERE x.kelompok_id = j.kelompok_id AND x.id <> j.id AND x.status IN (''Selesai'', ''Diverifikasi'')\n'
         || E'                ORDER BY x.created_at, x.id LIMIT 1);\n'
         || E'    IF FOUND THEN RETURN; END IF;\n'
         || E'  END IF;\n\n'
         || lama;
    hitung := (length(def) - length(replace(def, lama, ''))) / length(lama);
    IF hitung <> 1 THEN RAISE EXCEPTION 'Tambalan batalkan_pemeliharaan_jaringan: penanda ketemu % kali — tidak ada yang berubah.', hitung; END IF;
    EXECUTE replace(def, lama, baru);
  END IF;
END $do$;


-- ── 7. Isian bersama ikut sekelompok ─────────────────────────────────────────
-- Koreksi penyulang / tanggal / alamat / tim / foto di SATU baris (web atau HP)
-- ikut ke baris kategori lain sekelompok — itu satu pekerjaan yang sama.
-- Kategori, uraian, catatan, status, dan tautan tugas tetap per baris.
-- Kolom yang tidak ada di lingkungan ini dilewati (dibaca lewat jsonb).
CREATE OR REPLACE FUNCTION public._kelompok_samakan()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  kolom TEXT[] := TG_ARGV[0]::text[];
  baru  JSONB := to_jsonb(NEW);
  lama  JSONB := to_jsonb(OLD);
  ubah  TEXT[];
  sql   TEXT;
BEGIN
  -- Penyamaan ini sendiri memicu pemicu yang sama di baris saudara → berhenti di situ.
  IF pg_trigger_depth() > 1 OR NEW.kelompok_id IS NULL OR NEW.status = 'Dibatalkan' THEN RETURN NULL; END IF;
  SELECT array_agg(k) INTO ubah FROM unnest(kolom) k
  WHERE baru ? k AND (baru->k) IS DISTINCT FROM (lama->k);
  IF ubah IS NULL THEN RETURN NULL; END IF;

  SELECT format('UPDATE %I.%I x SET %s, updated_at = now() FROM jsonb_populate_record(NULL::%I.%I, $1) r
                 WHERE x.kelompok_id = $2 AND x.id <> $3 AND x.status <> ''Dibatalkan''',
                TG_TABLE_SCHEMA, TG_TABLE_NAME,
                string_agg(format('%I = r.%I', k, k), ', '),
                TG_TABLE_SCHEMA, TG_TABLE_NAME)
  INTO sql FROM unnest(ubah) k;
  EXECUTE sql USING baru, NEW.kelompok_id, NEW.id;
  RETURN NULL;
END $fn$;
REVOKE ALL ON FUNCTION public._kelompok_samakan() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_pj_kelompok_samakan ON public.pemeliharaan_jaringan;
CREATE TRIGGER trg_pj_kelompok_samakan
  AFTER UPDATE ON public.pemeliharaan_jaringan
  FOR EACH ROW EXECUTE FUNCTION public._kelompok_samakan(
    '{jenis,penyulang,ulp,gardu,gardu_kode,alamat,lat,lng,akurasi,tgl,petugas_nama,pelaksana,foto_sebelum_url,foto_sesudah_url,foto_proses_url,terdekat_tiang_id,terdekat_gardu_kode,terdekat_label,terdekat_jarak_m}');

DROP TRIGGER IF EXISTS trg_pdkb_kelompok_samakan ON public.pdkb_pekerjaan;
CREATE TRIGGER trg_pdkb_kelompok_samakan
  AFTER UPDATE ON public.pdkb_pekerjaan
  FOR EACH ROW EXECUTE FUNCTION public._kelompok_samakan(
    '{jenis,penyulang,gardu_kode,alamat,lat,lng,tgl,pelaksana,foto_sebelum_url,foto_sesudah_url,foto_proses_url}');

-- PDKB: tanggal yang dikoreksi di baris tanpa tugas ikut ke tgl_eksekusi tugas
-- kelompoknya (koreksi_pekerjaan_pdkb hanya menyamakan baris pemegang tugas).
CREATE OR REPLACE FUNCTION public._pdkb_kelompok_tgl_tugas()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  t public.pdkb_pekerjaan;
BEGIN
  IF pg_trigger_depth() > 1 OR NEW.kelompok_id IS NULL OR NEW.inspeksi_id IS NOT NULL
     OR NEW.tgl IS NOT DISTINCT FROM OLD.tgl THEN RETURN NULL; END IF;
  SELECT * INTO t FROM public.pdkb_pekerjaan
  WHERE kelompok_id = NEW.kelompok_id AND inspeksi_id IS NOT NULL AND status <> 'Dibatalkan' LIMIT 1;
  IF NOT FOUND THEN RETURN NULL; END IF;
  IF t.tugas_tabel = 'inspeksi_pohon' THEN
    UPDATE public.inspeksi_pohon SET tgl_eksekusi = NEW.tgl, updated_at = now() WHERE id::text = t.inspeksi_id AND status = 'Selesai';
  ELSE
    UPDATE public.inspeksi SET tgl_eksekusi = NEW.tgl, updated_at = now() WHERE id::text = t.inspeksi_id AND status = 'Selesai';
  END IF;
  RETURN NULL;
END $fn$;
REVOKE ALL ON FUNCTION public._pdkb_kelompok_tgl_tugas() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_pdkb_kelompok_tgl_tugas ON public.pdkb_pekerjaan;
CREATE TRIGGER trg_pdkb_kelompok_tgl_tugas
  AFTER UPDATE OF tgl ON public.pdkb_pekerjaan
  FOR EACH ROW EXECUTE FUNCTION public._pdkb_kelompok_tgl_tugas();

NOTIFY pgrst, 'reload schema';

-- ── Periksa (hanya baca) — tiga-tiganya harus true ───────────────────────────
--   SELECT position('kategori-banyak.sql' IN pg_get_functiondef('public.simpan_pekerjaan_pdkb(jsonb)'::regprocedure)) > 0;
--   SELECT position('kategori-banyak.sql' IN pg_get_functiondef('public.batalkan_pekerjaan_pdkb(uuid,text,text)'::regprocedure)) > 0;
--   SELECT position('kategori-banyak.sql' IN pg_get_functiondef('public.batalkan_pemeliharaan_jaringan(uuid,text,text)'::regprocedure)) > 0;
