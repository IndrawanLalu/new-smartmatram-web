-- =============================================================================
-- Fase 4.2a — Inspeksi JTM: skema
-- Jalankan SESUDAH `jtr-schema.sql` dan `jtr-penamaan.sql`. Idempoten.
--
-- SATU HAL YANG MEMBEDAKAN SELURUH BERKAS INI DARI JTR:
--
--   Di JTR satu tiang selalu milik satu gardu. Di JTM dua penyulang bisa
--   berjalan di tiang yang sama beberapa gawang lalu berpisah, dan nama
--   segmennya tetap berbeda. Jadi hubungan segmen ↔ tiang TIDAK BISA
--   satu-ke-banyak — dan itulah sebabnya ada tabel ketiga, `segmen_tiang`.
--
-- Tanpa tabel ketiga itu, underbuild cuma bisa dicatat dengan melahirkan baris
-- tiang kedua di koordinat yang sama. Panjang rute langsung terhitung dua kali,
-- dan tidak ada satu pun galat yang muncul — angkanya cuma jadi lebih panjang
-- dari kenyataan.
-- =============================================================================

-- ── 1. Kode singkat penyulang ────────────────────────────────────────────────
-- Prefiks nama tiang: MATARAM → MTR-001. Harus unik se-UP3, karena nama tiang
-- dibaca lintas penyulang saat menelusuri gangguan — dua penyulang berprefiks
-- sama membuat `MTR-014` menunjuk dua batang beton yang berjauhan.

ALTER TABLE public.penyulang_ref
  ADD COLUMN IF NOT EXISTS kode_singkat TEXT;

ALTER TABLE public.penyulang_ref DROP CONSTRAINT IF EXISTS penyulang_kode_singkat_bentuk;
ALTER TABLE public.penyulang_ref ADD CONSTRAINT penyulang_kode_singkat_bentuk
  CHECK (kode_singkat IS NULL OR kode_singkat ~ '^[A-Z][A-Z0-9]{1,5}$');

-- Unik tanpa memandang besar-kecil huruf. Dibuat di atas `upper()` supaya
-- 'Mtr' dan 'MTR' tidak bisa hidup berdampingan.
CREATE UNIQUE INDEX IF NOT EXISTS penyulang_kode_singkat_unik
  ON public.penyulang_ref (upper(kode_singkat)) WHERE kode_singkat IS NOT NULL;

COMMENT ON COLUMN public.penyulang_ref.kode_singkat IS
  'Prefiks nama tiang JTM (MATARAM → MTR). Dibuat sistem kalau kosong, boleh dikoreksi admin, tidak boleh kembar. Mengubahnya menomori ulang seluruh tiang penyulang itu.';

-- Calon kode dari nama penyulang. Konsonan dulu — MATARAM → MTR, LEMBAR → LMB —
-- karena konsonan yang membuat singkatan masih terbaca sebagai nama aslinya.
CREATE OR REPLACE FUNCTION public.usul_kode_singkat(p_nama TEXT)
RETURNS TEXT
LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE
  huruf TEXT;
  kons  TEXT;
BEGIN
  huruf := upper(regexp_replace(COALESCE(p_nama, ''), '[^A-Za-z]', '', 'g'));
  IF huruf = '' THEN RETURN NULL; END IF;

  kons := regexp_replace(huruf, '[AIUEO]', '', 'g');

  -- Nama yang hampir seluruhnya vokal (mis. "AIA") tetap harus dapat kode;
  -- di situ huruf apa adanya lebih baik daripada tidak ada sama sekali.
  IF length(kons) < 3 THEN
    kons := kons || regexp_replace(huruf, '[^AIUEO]', '', 'g');
  END IF;

  RETURN left(kons || huruf, 3);
END $$;

-- Ambil kode singkat penyulang; buatkan kalau belum ada.
--
-- Kalau penyulangnya sendiri belum ada di `penyulang_ref`, barisnya dibuat.
-- Itu bukan data sampah — itu LUBANG MASTER yang baru ketahuan dari lapangan,
-- dan lebih baik tercatat sebagai baris yang bisa dilihat daripada jadi alasan
-- penyapuan berhenti di tengah jalan.
CREATE OR REPLACE FUNCTION public.kode_singkat_penyulang(
  p_penyulang TEXT,
  p_ulp       TEXT DEFAULT NULL
) RETURNS TEXT
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  nama  TEXT := btrim(COALESCE(p_penyulang, ''));
  kode  TEXT;
  calon TEXT;
  n     INT := 1;
BEGIN
  IF nama = '' THEN RETURN NULL; END IF;

  SELECT kode_singkat INTO kode FROM public.penyulang_ref
  WHERE upper(penyulang) = upper(nama);

  IF kode IS NOT NULL THEN RETURN kode; END IF;

  calon := public.usul_kode_singkat(nama);
  IF calon IS NULL THEN RETURN NULL; END IF;

  -- Tabrakan singkatan pasti terjadi (KEDIRI / KEDIRI 2), dan terjadinya justru
  -- saat penyapuan sudah jalan. Angka di belakang membuatnya selesai sendiri
  -- tanpa menghentikan siapa pun; admin boleh merapikan belakangan.
  WHILE EXISTS (
    SELECT 1 FROM public.penyulang_ref WHERE upper(kode_singkat) = upper(calon)
  ) LOOP
    n := n + 1;
    IF n > 99 THEN RAISE EXCEPTION 'Tidak bisa membuat kode singkat untuk %', nama; END IF;
    calon := left(public.usul_kode_singkat(nama), 2) || n::text;
  END LOOP;

  INSERT INTO public.penyulang_ref (penyulang, ulp, kode_singkat)
  VALUES (nama, p_ulp, calon)
  ON CONFLICT (penyulang) DO UPDATE SET kode_singkat = EXCLUDED.kode_singkat;

  RETURN calon;
END $$;

-- ── 2. Tiang JTM — tambahan kolom, bukan tabel baru ──────────────────────────
-- Satu kelas benda, satu tabel. Yang membedakan cuma cara menempelnya:
-- tiang JTR lewat `gardu_kode` + `jurusan`, tiang JTM lewat `penyulang`.

ALTER TABLE public.tiang
  -- PEMILIK tiang = penyulang yang konduktornya paling atas. Dialah yang
  -- menentukan nama tiang. Penyulang lain yang menumpang tidak melahirkan
  -- baris kedua — dia tercatat di `segmen_tiang`.
  ADD COLUMN IF NOT EXISTS penyulang  TEXT,

  -- Nomor tiang yang sudah ada sebelumnya (dari dokumen atau plat lama).
  -- Disimpan untuk mencocokkan dengan berkas lama, TIDAK dipakai merekap:
  -- penomoran lama berulang antar seksi, jadi tidak pernah bisa jadi kunci.
  ADD COLUMN IF NOT EXISTS nomor_lama TEXT,

  -- Konstruksi tiang JTM (A1, A2, A3, …). Di Sheet lama satu sel bisa berisi
  -- 'A1; A3' — dua konstruksi di satu tiang, yang artinya dua sirkit. Di sini
  -- kolomnya tetap satu nilai; sirkit keduanya terbaca dari `segmen_tiang`.
  ADD COLUMN IF NOT EXISTS konstruksi TEXT;

COMMENT ON COLUMN public.tiang.penyulang IS
  'Penyulang PEMILIK (konduktor paling atas). Menentukan prefiks nama tiang. Penyulang yang menumpang dicatat di segmen_tiang, bukan di sini.';
COMMENT ON COLUMN public.tiang.nomor_lama IS
  'Nomor tiang lama dari dokumen/plat. Untuk mencocokkan berkas lama — bukan kunci, karena penomoran lama berulang antar seksi.';

CREATE INDEX IF NOT EXISTS tiang_penyulang_idx
  ON public.tiang (penyulang, ulp) WHERE status_hidup = 'aktif';

-- Nomor tiang unik per penyulang, di antara yang AKTIF saja.
CREATE UNIQUE INDEX IF NOT EXISTS tiang_kode_unik_jtm
  ON public.tiang (penyulang, ulp, kode)
  WHERE status_hidup = 'aktif' AND penyulang IS NOT NULL;

-- ── 3. Segmen ────────────────────────────────────────────────────────────────
-- Milik SATU penyulang. Ruas yang sama secara fisik bisa punya dua segmen —
-- satu milik MATARAM, satu milik KOPEL A — dan itu memang benar: yang dinamai
-- bukan tiangnya, melainkan bentangan kabel penyulang itu.

CREATE TABLE IF NOT EXISTS public.segmen (
  id        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  penyulang TEXT NOT NULL,
  ulp       TEXT NOT NULL,

  -- Titik ujung. `nama` selalu diisi; `tiang_id` diisi kalau ujungnya sebuah
  -- tiang yang sudah ada di master (percabangan, atau tiang yang memikul
  -- peralatan hubungnya).
  titik_awal_jenis   TEXT NOT NULL,
  titik_awal_nama    TEXT NOT NULL,
  titik_awal_tiang_id  UUID REFERENCES public.tiang(id) ON DELETE SET NULL,
  titik_akhir_jenis  TEXT NOT NULL,
  titik_akhir_nama   TEXT NOT NULL,
  titik_akhir_tiang_id UUID REFERENCES public.tiang(id) ON DELETE SET NULL,

  -- Dibentuk trigger dari kedua ujungnya. Tidak pernah diketik orang — itulah
  -- yang membuat dua orang menyebut ruas yang sama dengan nama yang sama.
  nama TEXT NOT NULL DEFAULT '',

  -- DITURUNKAN dari tiang titik awal, tidak diketik. Lihat trigger di bawah.
  induk_segmen_id UUID REFERENCES public.segmen(id) ON DELETE SET NULL,

  -- Spesifikasi yang dikoreksi dari lapangan.
  penghantar_jenis  TEXT,
  penghantar_ukuran NUMERIC,

  status  TEXT NOT NULL DEFAULT 'aktif',
  sumber  TEXT NOT NULL DEFAULT 'lapangan',
  catatan TEXT,

  dikonfirmasi_at   TIMESTAMPTZ,
  dikonfirmasi_oleh TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Jenis titik. PENG (pengambilan) sengaja ikut meski dia BUKAN peralatan
-- hubung: dia percabangan di dalam segmen, dan orang lapangan memang menyebut
-- ruas dengan nama pengambilannya. Yang tidak boleh adalah menyimpulkan ada
-- batas listrik di sana — itu urusan REC/LBS/PMT, lihat `segmen_memotong()`.
ALTER TABLE public.segmen DROP CONSTRAINT IF EXISTS segmen_titik_jenis_valid;
ALTER TABLE public.segmen ADD CONSTRAINT segmen_titik_jenis_valid CHECK (
  titik_awal_jenis  IN ('GI','PMT','PLTD','REC','LBS','PENG','TIANG','GARDU','UJUNG') AND
  titik_akhir_jenis IN ('GI','PMT','PLTD','REC','LBS','PENG','TIANG','GARDU','UJUNG')
);

ALTER TABLE public.segmen DROP CONSTRAINT IF EXISTS segmen_status_valid;
ALTER TABLE public.segmen ADD CONSTRAINT segmen_status_valid
  CHECK (status IN ('aktif', 'nonaktif'));

CREATE INDEX IF NOT EXISTS segmen_penyulang_idx ON public.segmen (penyulang, ulp)
  WHERE status = 'aktif';
CREATE INDEX IF NOT EXISTS segmen_induk_idx ON public.segmen (induk_segmen_id);

CREATE UNIQUE INDEX IF NOT EXISTS segmen_nama_unik
  ON public.segmen (upper(ulp), upper(penyulang), upper(nama))
  WHERE status = 'aktif';

COMMENT ON TABLE public.segmen IS
  'Ruas satu penyulang antara dua titik. Ruas fisik yang sama bisa punya dua segmen milik dua penyulang — itu underbuild, dan tiangnya tetap satu baris.';
COMMENT ON COLUMN public.segmen.induk_segmen_id IS
  'DITURUNKAN dari segmen tempat tiang percabangan terdaftar. Jangan pernah diisi aplikasi — daftar yang diketik orang pasti melenceng dari kenyataannya.';

-- Apakah sebuah jenis titik benar-benar MEMOTONG jaringan.
CREATE OR REPLACE FUNCTION public.segmen_memotong(p_jenis TEXT)
RETURNS BOOLEAN
LANGUAGE sql IMMUTABLE AS $$
  SELECT COALESCE(p_jenis IN ('GI', 'PMT', 'PLTD', 'REC', 'LBS'), false)
$$;

COMMENT ON FUNCTION public.segmen_memotong IS
  'REC/LBS/PMT/GI/PLTD memotong jaringan — merekalah yang menentukan bagian mana padam saat dibuka. PENG (pengambilan) TIDAK: dia percabangan di dalam segmen.';

-- Nama ujung sebagaimana diucapkan orang lapangan: 'REC. MALOMBA', 'GI AMPENAN'.
CREATE OR REPLACE FUNCTION public.segmen_label_titik(p_jenis TEXT, p_nama TEXT)
RETURNS TEXT
LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE
    WHEN p_jenis = 'UJUNG' AND COALESCE(btrim(p_nama), '') = '' THEN 'UJUNG'
    WHEN p_jenis IN ('REC', 'LBS', 'PENG', 'PMT') THEN p_jenis || '. ' || upper(btrim(p_nama))
    ELSE p_jenis || ' ' || upper(btrim(p_nama))
  END
$$;

CREATE OR REPLACE FUNCTION public.segmen_susun_nama()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  induk_id UUID;
BEGIN
  NEW.nama := public.segmen_label_titik(NEW.titik_awal_jenis, NEW.titik_awal_nama)
              || ' - ' ||
              public.segmen_label_titik(NEW.titik_akhir_jenis, NEW.titik_akhir_nama);

  -- Induk diturunkan dari tiang titik awal: segmen tempat tiang itu terdaftar,
  -- DAN milik penyulang yang sama. Percabangan penyulang A tidak pernah
  -- berinduk pada segmen penyulang B meski tiangnya sama — kalau boleh, pohon
  -- satu penyulang akan berakar di penyulang lain dan "kalau LBS ini dibuka,
  -- apa saja yang padam" jadi tidak bisa dijawab.
  IF NEW.titik_awal_tiang_id IS NOT NULL THEN
    SELECT s.id INTO induk_id
    FROM public.segmen_tiang st
    JOIN public.segmen s ON s.id = st.segmen_id
    WHERE st.tiang_id = NEW.titik_awal_tiang_id
      AND s.status = 'aktif'
      AND upper(s.penyulang) = upper(NEW.penyulang)
      AND s.id IS DISTINCT FROM NEW.id
    ORDER BY s.created_at
    LIMIT 1;

    NEW.induk_segmen_id := induk_id;
  ELSE
    NEW.induk_segmen_id := NULL;
  END IF;

  NEW.updated_at := now();
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_segmen_susun_nama ON public.segmen;
CREATE TRIGGER trg_segmen_susun_nama
  BEFORE INSERT OR UPDATE OF titik_awal_jenis, titik_awal_nama, titik_awal_tiang_id,
                             titik_akhir_jenis, titik_akhir_nama, penyulang
  ON public.segmen
  FOR EACH ROW EXECUTE FUNCTION public.segmen_susun_nama();

-- ── 4. Segmen ↔ tiang — penampung underbuild ─────────────────────────────────
-- Tiang MTR-002 punya DUA baris di sini: satu untuk segmen MATARAM, satu untuk
-- segmen KOPEL A. Tidak ada baris kedua di `tiang` — batangnya cuma satu.

CREATE TABLE IF NOT EXISTS public.segmen_tiang (
  segmen_id UUID NOT NULL REFERENCES public.segmen(id) ON DELETE CASCADE,
  tiang_id  UUID NOT NULL REFERENCES public.tiang(id)  ON DELETE CASCADE,

  -- Tingkat konduktor di tiang itu. Pemilik tiang = yang paling ATAS, jadi
  -- kolom ini sekaligus bukti kenapa pemiliknya dialah yang terpilih.
  posisi TEXT,

  sumber     TEXT NOT NULL DEFAULT 'lapangan',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (segmen_id, tiang_id)
);

ALTER TABLE public.segmen_tiang DROP CONSTRAINT IF EXISTS segmen_tiang_posisi_valid;
ALTER TABLE public.segmen_tiang ADD CONSTRAINT segmen_tiang_posisi_valid
  CHECK (posisi IS NULL OR posisi IN ('atas', 'tengah', 'bawah'));

CREATE INDEX IF NOT EXISTS segmen_tiang_tiang_idx ON public.segmen_tiang (tiang_id);

COMMENT ON TABLE public.segmen_tiang IS
  'Tiang mana saja yang dipikul sebuah segmen. INILAH penampung underbuild: satu tiang, banyak segmen, tanpa pernah melahirkan baris tiang kedua di koordinat yang sama.';

-- Segmen dan tiangnya harus satu ULP. Bukan kerewelan: kalau berbeda, angka
-- panjang satu ULP diam-diam memuat bentang milik ULP sebelah.
CREATE OR REPLACE FUNCTION public.jaga_segmen_tiang()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE s RECORD; t RECORD;
BEGIN
  SELECT * INTO s FROM public.segmen WHERE id = NEW.segmen_id;
  SELECT * INTO t FROM public.tiang  WHERE id = NEW.tiang_id;

  IF upper(COALESCE(t.ulp, '')) <> upper(COALESCE(s.ulp, '')) THEN
    RAISE EXCEPTION 'Tiang % (ULP %) tidak bisa dipikul segmen % (ULP %)',
      COALESCE(t.kode, '?'), COALESCE(t.ulp, '-'), s.nama, s.ulp;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_jaga_segmen_tiang ON public.segmen_tiang;
CREATE TRIGGER trg_jaga_segmen_tiang
  BEFORE INSERT OR UPDATE ON public.segmen_tiang
  FOR EACH ROW EXECUTE FUNCTION public.jaga_segmen_tiang();

-- ── 5. Penamaan tiang JTM ────────────────────────────────────────────────────
-- Trigger KEDUA di `tiang`, berdampingan dengan `trg_tiang_buat_kode` milik JTR.
-- Sengaja tidak menyunting fungsi JTR: kalau dua modul menulis satu fungsi yang
-- sama, menjalankan ulang skrip yang lebih tua akan diam-diam menghapus
-- separuhnya. Fungsi JTR sudah melepas tiang JTM ("gardu_kode NULL → dinamai di
-- tempat lain"), dan urutan abjad nama trigger membuat dia jalan lebih dulu.
--
--   a. Induk NULL                → pangkal penyulang          → MTR-001
--   b. Jalur lurus (belok ≤ 60°) → nomor lanjut               → MTR-006
--   c. Jalur berbelok / bercabang→ huruf arah, mulai 1        → MTR-005_B1
--   d. Searah dengan anak yang ada → sisipan                  → MTR-005a

CREATE OR REPLACE FUNCTION public.tiang_buat_kode_jtm()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  induk      RECORD;
  hulu       RECORD;
  anak       RECORD;
  ada_anak   BOOLEAN;
  prefiks    TEXT;
  singkat    TEXT;
  nomor_maks INT;
  arah_baru  DOUBLE PRECISION;
  arah_lama  DOUBLE PRECISION;
  arah_anak  DOUBLE PRECISION;
  belok      DOUBLE PRECISION;
  selisih    DOUBLE PRECISION;
  huruf      TEXT;
  pokok      BOOLEAN;
BEGIN
  IF NEW.kode IS NOT NULL AND btrim(NEW.kode) <> '' THEN
    RETURN NEW;                                   -- nama manual dihormati
  END IF;
  IF NEW.penyulang IS NULL OR NEW.gardu_kode IS NOT NULL THEN
    RETURN NEW;                                   -- bukan tiang JTM
  END IF;

  singkat := public.kode_singkat_penyulang(NEW.penyulang, NEW.ulp);
  IF singkat IS NULL THEN
    RAISE EXCEPTION 'Penyulang "%" tidak bisa dibuatkan kode singkat', NEW.penyulang;
  END IF;

  -- `feeder` kolom lama yang dipakai layer Peta Aset. Diisi sekalian supaya
  -- tidak lahir dua kosakata untuk benda yang sama.
  IF NEW.feeder IS NULL THEN NEW.feeder := NEW.penyulang; END IF;

  -- (a) Pangkal penyulang.
  IF NEW.induk_id IS NULL THEN
    prefiks := singkat || '-';
    SELECT COALESCE(max((regexp_match(kode, '([0-9]+)[a-z]?$'))[1]::int), 0)
      INTO nomor_maks
    FROM public.tiang
    WHERE upper(COALESCE(penyulang, '')) = upper(NEW.penyulang)
      AND status_hidup = 'aktif'
      AND kode ~ ('^' || prefiks || '[0-9]+$');
    NEW.kode := prefiks || lpad((nomor_maks + 1)::text, 3, '0');
    RETURN NEW;
  END IF;

  SELECT * INTO induk FROM public.tiang WHERE id = NEW.induk_id;
  IF NOT FOUND THEN RETURN NEW; END IF;

  arah_baru := public.arah_derajat(induk.lat, induk.lng, NEW.lat, NEW.lng);

  SELECT * INTO anak
  FROM public.tiang
  WHERE induk_id = induk.id AND status_hidup = 'aktif'
  ORDER BY created_at
  LIMIT 1;
  ada_anak := FOUND;

  -- (d) Sisipan: sudah ada anak yang menuju arah yang hampir sama, jadi tiang
  --     ini berdiri DI ANTARA induk dan anak itu — bukan cabang baru.
  IF ada_anak AND arah_baru IS NOT NULL THEN
    arah_anak := public.arah_derajat(induk.lat, induk.lng, anak.lat, anak.lng);
    IF arah_anak IS NOT NULL THEN
      selisih := abs(arah_baru - arah_anak);
      IF selisih > 180 THEN selisih := 360 - selisih; END IF;
      IF selisih <= 45 THEN
        SELECT COALESCE(max(substring(kode from '([a-z])$')), '') INTO huruf
        FROM public.tiang
        WHERE upper(COALESCE(penyulang, '')) = upper(NEW.penyulang)
          AND status_hidup = 'aktif'
          AND kode ~ ('^' || induk.kode || '[a-z]$');
        NEW.kode := induk.kode || CASE
          WHEN huruf = '' THEN 'a'
          ELSE chr(ascii(huruf) + 1)
        END;
        RETURN NEW;
      END IF;
    END IF;
  END IF;

  -- Belok diukur terhadap arah bentang SEBELUMNYA — itulah yang menangkap
  -- "jalurnya berbelok" sebagaimana dilihat orang, bukan arah mutlak.
  SELECT * INTO hulu FROM public.tiang WHERE id = induk.induk_id;
  arah_lama := CASE WHEN FOUND
    THEN public.arah_derajat(hulu.lat, hulu.lng, induk.lat, induk.lng)
    ELSE NULL END;

  belok := NULL;
  IF arah_baru IS NOT NULL AND arah_lama IS NOT NULL THEN
    belok := abs(arah_baru - arah_lama);
    IF belok > 180 THEN belok := 360 - belok; END IF;
  END IF;

  IF (belok IS NULL OR belok <= 60) AND NOT ada_anak THEN
    -- (b) Masih lurus → teruskan deret pada prefiks induknya.
    --     'MTR-005' → prefiks 'MTR-' ; 'MTR-005_B1' → prefiks 'MTR-005_B'.
    prefiks := regexp_replace(induk.kode, '[0-9]+[a-z]?$', '');
  ELSE
    -- (c) Berbelok, atau induknya sudah punya anak → cabang. Hurufnya dari
    --     arah mata angin NYATA, bukan pilihan orang.
    huruf := COALESCE(public.arah_huruf(arah_baru), 'K');
    prefiks := induk.kode || '_' || huruf;
  END IF;

  -- Deret pokok (langsung di belakang kode singkat) dinomori tiga angka supaya
  -- urut terbaca; deret cabang tidak — 'MTR-005_B1' lebih enak dibaca daripada
  -- 'MTR-005_B001'.
  pokok := prefiks = singkat || '-';

  SELECT COALESCE(max((regexp_match(kode, '([0-9]+)[a-z]?$'))[1]::int), 0)
    INTO nomor_maks
  FROM public.tiang
  WHERE upper(COALESCE(penyulang, '')) = upper(NEW.penyulang)
    AND status_hidup = 'aktif'
    AND kode ~ ('^' || prefiks || '[0-9]+[a-z]?$');

  NEW.kode := prefiks || CASE
    WHEN pokok THEN lpad((nomor_maks + 1)::text, 3, '0')
    ELSE (nomor_maks + 1)::text
  END;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_tiang_buat_kode_jtm ON public.tiang;
CREATE TRIGGER trg_tiang_buat_kode_jtm
  BEFORE INSERT ON public.tiang
  FOR EACH ROW EXECUTE FUNCTION public.tiang_buat_kode_jtm();

COMMENT ON FUNCTION public.tiang_buat_kode_jtm IS
  'Nama tiang JTM: prefiks penyulang + deret, cabang memakai arah mata angin nyata. Berdampingan dengan trigger JTR — masing-masing melepas tiang yang bukan miliknya.';

-- ── 6. Mengubah kode singkat ─────────────────────────────────────────────────
-- Mengubah prefiks berarti menomori ulang seluruh tiang penyulang itu. Aman
-- karena kode cuma LABEL — identitas sebenarnya UUID, jadi tidak ada inspeksi
-- atau temuan yang putus.

CREATE OR REPLACE FUNCTION public.ubah_kode_singkat_penyulang(
  p_penyulang TEXT,
  p_kode_baru TEXT,
  p_oleh      TEXT DEFAULT NULL
) RETURNS INT
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  lama  TEXT;
  baru  TEXT := upper(btrim(COALESCE(p_kode_baru, '')));
  jml   INT;
  unit  TEXT;
BEGIN
  IF baru !~ '^[A-Z][A-Z0-9]{1,5}$' THEN
    RAISE EXCEPTION 'Kode singkat "%" tidak sah. Dua sampai enam huruf/angka, diawali huruf.', p_kode_baru;
  END IF;

  SELECT kode_singkat, ulp INTO lama, unit FROM public.penyulang_ref
  WHERE upper(penyulang) = upper(p_penyulang);
  IF NOT FOUND THEN RAISE EXCEPTION 'Penyulang % tidak ada di master', p_penyulang; END IF;

  IF EXISTS (SELECT 1 FROM public.penyulang_ref
             WHERE upper(kode_singkat) = baru AND upper(penyulang) <> upper(p_penyulang)) THEN
    RAISE EXCEPTION 'Kode singkat % sudah dipakai penyulang lain', baru;
  END IF;

  UPDATE public.penyulang_ref SET kode_singkat = baru
  WHERE upper(penyulang) = upper(p_penyulang);

  -- Prefiks = segala sesuatu sebelum tanda hubung PERTAMA. Cabang seperti
  -- 'MTR-005_B1' ikut berpindah tanpa disentuh bagian belakangnya.
  UPDATE public.tiang
  SET kode = regexp_replace(kode, '^[^-]+-', baru || '-'),
      updated_at = now()
  WHERE upper(COALESCE(penyulang, '')) = upper(p_penyulang)
    AND kode ~ '^[^-]+-';
  GET DIAGNOSTICS jml = ROW_COUNT;

  -- SATU baris audit untuk satu tindakan. Menulis satu baris per tiang tidak
  -- menambah apa pun yang bisa ditelusuri: perubahannya mekanis, dan yang
  -- perlu dijawab belakangan cuma "siapa mengganti prefiksnya, kapan".
  INSERT INTO public.master_audit
    (entitas, entitas_kode, ulp, field, nilai_lama, nilai_baru, aksi, oleh_uid, oleh_nama)
  VALUES ('penyulang', upper(p_penyulang), COALESCE(unit, '-'), 'kode_singkat',
          to_jsonb(lama), to_jsonb(baru), 'sunting_admin', auth.uid(), p_oleh);

  RETURN jml;
END $$;

-- ── 7. Ambang lapangan ───────────────────────────────────────────────────────
-- Angka yang menentukan boleh-tidaknya sebuah tiang dinilai. Disimpan per ULP
-- dengan baris 'ALL' sebagai nilai jatuh-tempat — pola yang sudah dipakai
-- `anomali_settings` dan `wo_pengukuran_settings`, jadi tidak ada mekanisme
-- pengaturan baru yang perlu dipelajari siapa pun.

CREATE TABLE IF NOT EXISTS public.jtm_settings (
  ulp TEXT PRIMARY KEY,

  -- Batas menilai tiang. Di atas ini tombol simpan mati.
  jarak_maks_nilai_m   NUMERIC(6,1) NOT NULL DEFAULT 50
    CHECK (jarak_maks_nilai_m BETWEEN 5 AND 500),

  -- Di atas ini pembacaan GPS sendiri dianggap belum layak dipakai. Dipisah
  -- dari ambang di atas KARENA SEBABNYA BERBEDA: yang satu petugasnya memang
  -- jauh, yang satu satelitnya belum cukup. Menyamakan pesannya berarti
  -- menuduh orang yang sebenarnya sudah berdiri di bawah tiang.
  akurasi_minimum_m    NUMERIC(6,1) NOT NULL DEFAULT 25
    CHECK (akurasi_minimum_m BETWEEN 5 AND 200),

  -- Radius "tiang ini sudah ada" saat regu penyulang lain menumpang.
  radius_tumpang_m     NUMERIC(6,1) NOT NULL DEFAULT 10
    CHECK (radius_tumpang_m BETWEEN 2 AND 100),

  -- Bentang yang pantas ditanyakan: "ada tiang belum tercatat?"
  bentang_maks_wajar_m NUMERIC(6,1) NOT NULL DEFAULT 100
    CHECK (bentang_maks_wajar_m BETWEEN 20 AND 1000),

  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO public.jtm_settings (ulp) VALUES ('ALL')
ON CONFLICT (ulp) DO NOTHING;

CREATE OR REPLACE FUNCTION public.jtm_ambang(p_ulp TEXT DEFAULT NULL)
RETURNS public.jtm_settings
LANGUAGE sql STABLE AS $$
  SELECT * FROM public.jtm_settings
  WHERE ulp = upper(COALESCE(p_ulp, 'ALL')) OR ulp = 'ALL'
  ORDER BY (ulp = 'ALL')   -- baris ULP menang, 'ALL' cuma jatuh-tempat
  LIMIT 1
$$;

COMMENT ON TABLE public.jtm_settings IS
  'Ambang lapangan inspeksi JTM per ULP; baris ALL = nilai jatuh-tempat. 50 m cocok untuk jalan kota, belum tentu untuk ruas kebun.';

-- ── 8. Hak akses ─────────────────────────────────────────────────────────────
-- Pengetatan per-unit dikerjakan sekaligus untuk semua tabel di Fase 0.4.

DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['segmen', 'segmen_tiang', 'jtm_settings'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS auth_all_%I ON public.%I', t, t);
    EXECUTE format(
      'CREATE POLICY auth_all_%I ON public.%I FOR ALL TO authenticated USING (true) WITH CHECK (true)',
      t, t);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON public.%I TO authenticated', t);
  END LOOP;
END $$;

GRANT EXECUTE ON FUNCTION public.kode_singkat_penyulang       TO authenticated;
GRANT EXECUTE ON FUNCTION public.ubah_kode_singkat_penyulang  TO authenticated;
GRANT EXECUTE ON FUNCTION public.jtm_ambang                   TO authenticated;

-- =============================================================================
-- Periksa hasilnya
-- =============================================================================
-- a. Kode singkat yang sudah terbentuk:
--      SELECT penyulang, kode_singkat FROM penyulang_ref
--      WHERE kode_singkat IS NOT NULL ORDER BY penyulang;
--
-- b. Tiang yang dipikul lebih dari satu penyulang (underbuild):
--      SELECT t.kode, t.penyulang AS pemilik, count(*) AS jumlah_segmen,
--             string_agg(DISTINCT s.penyulang, ', ') AS penyulang_lewat
--      FROM segmen_tiang st
--      JOIN segmen s ON s.id = st.segmen_id
--      JOIN tiang  t ON t.id = st.tiang_id
--      GROUP BY t.kode, t.penyulang HAVING count(DISTINCT s.penyulang) > 1;
--
-- c. Ambang yang berlaku untuk satu ULP:
--      SELECT * FROM jtm_ambang('AMPENAN');
-- =============================================================================
