-- =============================================================================
-- Pangkal segmen JTM diatur dari Pengaturan JTM (12 Okt 2026). Jalankan manual
-- di Supabase SQL Editor. Idempoten.
--
-- Permintaan user: GI dan PLTD tertulis di kode, padahal ada sumber jaringan
-- lain — GH (Gardu Hubung). Sekarang daftarnya `jtm_ref` kategori 'pangkal'
-- (kode disimpan huruf kecil seperti Penanda tiang; kode titik = dibesarkan).
--
-- Perlakuan pangkal SAMA DENGAN GI (keputusan user: boleh pangkal & ujung):
--   • sah sebagai titik awal maupun akhir segmen (jtm_jenis_titik_sah)
--   • ditulis berspasi: "GH GOMONG", bukan "GH. GOMONG" (segmen_label_titik)
--   • memotong jaringan (segmen_memotong — sudah, karena bukan PENG/TIANG/…)
--   • impor/tempel mengenali awalannya (pisah_label_titik)
--   • tidak bisa dihapus selama dipakai segmen (jaga_jtm_ref_terpakai)
--
-- Segmen lama TIDAK diubah (keputusan user "biarkan dulu"): segmen tempelan
-- bernama "GH …" yang dulu terbaca Pengambilan tetap seperti itu. Pemicu nama
-- hanya berjalan saat jenis titiknya berubah, jadi namanya juga tidak bergeser.
-- =============================================================================


-- ── 1. Kategori baru ────────────────────────────────────────────────────────
-- Batasan kategori dibaca dari database lalu 'pangkal' disisipkan — skrip ini
-- tidak boleh menghapus kategori lain yang mungkin ditambahkan belakangan.
DO $$
DECLARE d TEXT;
BEGIN
  SELECT pg_get_constraintdef(c.oid) INTO d
  FROM pg_constraint c
  WHERE c.conname = 'jtm_ref_kategori_valid' AND c.conrelid = 'public.jtm_ref'::regclass;

  IF d IS NULL THEN
    RAISE EXCEPTION 'Batasan jtm_ref_kategori_valid tidak ditemukan — periksa tabel jtm_ref dulu.';
  END IF;
  IF d NOT LIKE '%''pangkal''%' THEN
    IF d NOT LIKE '%ARRAY[%' THEN
      RAISE EXCEPTION 'Bentuk batasan tidak dikenal: %', d;
    END IF;
    EXECUTE 'ALTER TABLE public.jtm_ref DROP CONSTRAINT jtm_ref_kategori_valid';
    EXECUTE 'ALTER TABLE public.jtm_ref ADD CONSTRAINT jtm_ref_kategori_valid '
         || replace(d, 'ARRAY[', 'ARRAY[''pangkal''::text, ');
  END IF;
END $$;

-- Kode pangkal = satu kata huruf/angka: ia menjadi awalan nama segmen dan
-- dibaca ulang dengan pola '^KODE '. Spasi atau titik di kode merusak itu.
ALTER TABLE public.jtm_ref DROP CONSTRAINT IF EXISTS jtm_ref_pangkal_kode_valid;
ALTER TABLE public.jtm_ref ADD CONSTRAINT jtm_ref_pangkal_kode_valid
  CHECK (kategori <> 'pangkal' OR kode ~ '^[a-z0-9]+$');

-- Isi awal. DO NOTHING: label yang sudah disunting tidak dikembalikan.
INSERT INTO public.jtm_ref (kategori, kode, label, urutan) VALUES
  ('pangkal', 'gi',   'Gardu Induk',  10),
  ('pangkal', 'pltd', 'PLTD',         20),
  ('pangkal', 'gh',   'Gardu Hubung', 30)
ON CONFLICT (kategori, kode) DO NOTHING;


-- ── 2. Kode titik pangkal (aktif atau tidak) ─────────────────────────────────
-- Nonaktif hanya menghilangkannya dari PILIHAN. Penulisan & pembacaan nama
-- tetap mengenalnya, supaya nama segmen lama tidak berubah bentuk.
CREATE OR REPLACE FUNCTION public.jtm_kode_pangkal(p_jenis TEXT)
RETURNS BOOLEAN
LANGUAGE sql STABLE SET search_path = public AS $$
  SELECT upper(btrim(p_jenis)) IN ('GI', 'PLTD')
      OR EXISTS (SELECT 1 FROM public.jtm_ref r
                  WHERE r.kategori = 'pangkal' AND upper(r.kode) = upper(btrim(p_jenis)))
$$;
COMMENT ON FUNCTION public.jtm_kode_pangkal IS
  'Jenis titik ini pangkal segmen (GI, PLTD, GH … dari Pengaturan JTM, aktif atau tidak).';


-- ── 3. Jenis titik yang sah ──────────────────────────────────────────────────
-- Disalin dari versi hidup (scripts/jtm-jenis-titik-penanda.sql); ★ pangkal aktif.
CREATE OR REPLACE FUNCTION public.jtm_jenis_titik_sah(p_jenis TEXT)
RETURNS BOOLEAN
LANGUAGE sql STABLE SET search_path = public AS $$
  SELECT COALESCE(
    upper(btrim(p_jenis)) IN ('GI','PMT','PLTD','REC','LBS','PENG','TIANG','GARDU','AKHIR')
    OR EXISTS (SELECT 1 FROM public.jtm_ref r
                WHERE r.kategori = 'penanda' AND r.aktif
                  AND public.jtm_kode_titik(r.kode) = upper(btrim(p_jenis)))
    -- ★ Pangkal segmen dari Pengaturan JTM (12 Okt 2026)
    OR EXISTS (SELECT 1 FROM public.jtm_ref r
                WHERE r.kategori = 'pangkal' AND r.aktif
                  AND upper(r.kode) = upper(btrim(p_jenis))),
    false)
$$;


-- ── 4. Label titik: pangkal berspasi ─────────────────────────────────────────
-- Dulu IMMUTABLE (daftarnya tertulis); kini membaca jtm_ref → STABLE. Dipakai
-- hanya di pemicu & fungsi, tidak di indeks atau kolom terhitung.
CREATE OR REPLACE FUNCTION public.segmen_label_titik(p_jenis TEXT, p_nama TEXT)
RETURNS TEXT
LANGUAGE sql STABLE SET search_path = public AS $$
  SELECT CASE
    WHEN p_jenis IN ('UJUNG', 'AKHIR') AND COALESCE(btrim(p_nama), '') = '' THEN p_jenis
    WHEN p_jenis IN ('TIANG', 'GARDU', 'UJUNG', 'AKHIR') OR public.jtm_kode_pangkal(p_jenis)
      THEN p_jenis || ' ' || upper(btrim(p_nama))
    ELSE p_jenis || '. ' || upper(btrim(p_nama))
  END
$$;


-- ── 5. Impor/tempel: awalan pangkal dikenali ─────────────────────────────────
-- Disalin dari versi hidup; ★ awalan berspasi dari daftar pangkal, yang
-- panjang dulu (supaya 'GIS' tidak terbaca 'GI').
CREATE OR REPLACE FUNCTION public.pisah_label_titik(p_label TEXT)
RETURNS TABLE (jenis TEXT, nama TEXT)
LANGUAGE plpgsql STABLE SET search_path = public AS $fn$
DECLARE
  t TEXT := upper(btrim(regexp_replace(COALESCE(p_label, ''), '\s+', ' ', 'g')));
  k TEXT;
BEGIN
  IF t = '' OR t = 'UJUNG' THEN
    RETURN QUERY SELECT 'UJUNG'::TEXT, ''::TEXT;
    RETURN;
  END IF;

  -- Bertitik: 'REC. BRIMOB', 'LBSM PASAR', 'PENG. SEKOLAH', 'PMT 3' — yang
  -- panjang dulu supaya 'LBSM' tidak terbaca 'LBS'.
  FOR k IN
    SELECT d.x FROM (
      SELECT unnest(ARRAY['REC', 'LBS', 'PENG', 'PMT']) AS x
      UNION
      SELECT public.jtm_kode_titik(r.kode) FROM public.jtm_ref r
       WHERE r.kategori = 'penanda' AND r.kode <> 'gardu'
    ) d
    ORDER BY length(d.x) DESC, d.x
  LOOP
    IF t ~ ('^' || k || '\.?\s') THEN
      RETURN QUERY SELECT k, btrim(regexp_replace(t, '^' || k || '\.?\s+', ''));
      RETURN;
    END IF;
  END LOOP;

  -- Berspasi: 'GI AMPENAN', 'PLTD TALIWANG', ★ 'GH GOMONG'
  FOR k IN
    SELECT d.x FROM (
      SELECT unnest(ARRAY['GI', 'PLTD']) AS x
      UNION
      SELECT upper(r.kode) FROM public.jtm_ref r WHERE r.kategori = 'pangkal'
    ) d
    ORDER BY length(d.x) DESC, d.x
  LOOP
    IF t ~ ('^' || k || '\s') THEN
      RETURN QUERY SELECT k, btrim(regexp_replace(t, '^' || k || '\s+', ''));
      RETURN;
    END IF;
  END LOOP;

  RETURN QUERY SELECT 'PENG'::TEXT, t;
END $fn$;


-- ── 6. Penjaga hapus: pangkal yang dipakai segmen ────────────────────────────
-- Disalin dari versi hidup; ★ cabang 'pangkal'.
CREATE OR REPLACE FUNCTION public.jaga_jtm_ref_terpakai()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE dipakai INT := 0;
BEGIN
  IF OLD.kategori = 'penanda' THEN
    SELECT count(*) INTO dipakai FROM public.tiang WHERE penanda = OLD.kode;
    IF dipakai > 0 THEN
      RAISE EXCEPTION
        'Penanda "%" masih dipakai % tiang. Nonaktifkan saja — menghapusnya membuat peta menggambar sesuatu yang tidak bernama.',
        OLD.label, dipakai;
    END IF;
  ELSIF OLD.kategori = 'penghantar' THEN
    SELECT count(*) INTO dipakai FROM public.segmen WHERE penghantar_jenis = OLD.kode;
    IF dipakai > 0 THEN
      RAISE EXCEPTION 'Penghantar "%" masih dipakai % segmen. Nonaktifkan saja.', OLD.label, dipakai;
    END IF;
  ELSIF OLD.kategori = 'pangkal' THEN
    SELECT count(*) INTO dipakai FROM public.segmen
     WHERE titik_awal_jenis = upper(OLD.kode) OR titik_akhir_jenis = upper(OLD.kode);
    IF dipakai > 0 THEN
      RAISE EXCEPTION 'Pangkal "%" masih dipakai % segmen. Nonaktifkan saja — namanya tetap terbaca di segmen lama.', OLD.label, dipakai;
    END IF;
  END IF;
  RETURN OLD;
END $$;


-- =============================================================================
-- Periksa hasilnya
--   SELECT kode, label, aktif FROM jtm_ref WHERE kategori = 'pangkal' ORDER BY urutan;
--   SELECT jtm_jenis_titik_sah('GH'), segmen_label_titik('GH', 'gomong'),
--          segmen_label_titik('REC', 'kamboja'), segmen_memotong('GH');
--     → true | GH GOMONG | REC. KAMBOJA | true
--   SELECT * FROM pisah_label_titik('GH GOMONG');   → GH | GOMONG
--   SELECT * FROM pisah_label_titik('GI AMPENAN');  → GI | AMPENAN
-- =============================================================================
