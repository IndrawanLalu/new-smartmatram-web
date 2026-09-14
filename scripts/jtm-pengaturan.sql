-- =============================================================================
-- Fase 4.2g — Inspeksi JTM: daftar pilihan yang bisa diatur sendiri
-- Jalankan SESUDAH `jtm-inspeksi-fungsi.sql`. Idempoten.
--
-- SATU tabel untuk tiga daftar yang bentuknya sama persis: penanda tiang,
-- jenis penghantar, dan ukuran penghantar. Ketiganya cuma "kode + label +
-- urutan + aktif" — membuat tiga tabel untuk itu berarti menulis tiga kali
-- kode CRUD yang sama, dan tiga kali pula halaman pengaturannya.
--
-- Kenapa ini harus jadi DATA, bukan daftar di kode: penghantar baru muncul
-- tiap kali ada pembangunan, dan penanda menyusul tiap kali ada jenis
-- peralatan baru. Kalau ditulis di kode, tiap tambahan berarti rilis — dan
-- yang menambahkannya harus saya, bukan orang yang tahu barangnya.
-- =============================================================================

-- ── 1. Penanda tiang ─────────────────────────────────────────────────────────
-- Tiang yang memikul gardu / LBS / recloser digambar berbeda di peta. Ini
-- keterangan yang dibawa TIANGnya, bukan hasil pemeriksaan: dia sudah harus
-- terlihat sebelum ada regu yang menyapu, karena dialah yang membuat orang
-- mengenali ruas di peta ("dari gardu itu sampai recloser sana").
--
-- Bedakan dari item pemeriksaan `peralatan_hubung`: yang itu KONDISI peralatan
-- saat diperiksa, diisi regu, dan baru berlaku sesudah penyapuan disetujui.

ALTER TABLE public.tiang
  ADD COLUMN IF NOT EXISTS penanda TEXT;

COMMENT ON COLUMN public.tiang.penanda IS
  'Kode penanda dari jtm_ref kategori ''penanda'' (gardu/lbsm/recloser/…). Menentukan bentuk ikonnya di peta. NULL = tiang biasa.';

CREATE INDEX IF NOT EXISTS tiang_penanda_idx
  ON public.tiang (penanda) WHERE penanda IS NOT NULL;

-- ── 2. Daftar pilihan ────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.jtm_ref (
  -- penanda | penghantar | ukuran
  kategori TEXT NOT NULL,
  -- TETAP. Yang boleh berubah labelnya — kode inilah yang tersimpan di
  -- `tiang.penanda` dan `segmen.penghantar_jenis`.
  kode     TEXT NOT NULL,
  label    TEXT NOT NULL,

  -- Hanya dipakai kategori 'penanda': bentuk dan warna ikonnya di peta.
  -- Bentuk disimpan sebagai KATA, bukan berkas gambar — supaya menambah
  -- penanda baru tidak perlu mengunggah apa pun.
  bentuk   TEXT,
  warna    TEXT,

  urutan   INT     NOT NULL DEFAULT 100,
  aktif    BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (kategori, kode)
);

ALTER TABLE public.jtm_ref DROP CONSTRAINT IF EXISTS jtm_ref_kategori_valid;
ALTER TABLE public.jtm_ref ADD CONSTRAINT jtm_ref_kategori_valid
  CHECK (kategori IN ('penanda', 'penghantar', 'ukuran'));

ALTER TABLE public.jtm_ref DROP CONSTRAINT IF EXISTS jtm_ref_bentuk_valid;
ALTER TABLE public.jtm_ref ADD CONSTRAINT jtm_ref_bentuk_valid
  CHECK (bentuk IS NULL OR bentuk IN ('kotak', 'segitiga', 'belah', 'bulat'));

COMMENT ON TABLE public.jtm_ref IS
  'Tiga daftar pilihan JTM: penanda tiang, jenis penghantar, ukuran penghantar. Diubah dari halaman Pengaturan, bukan lewat rilis.';

-- ── 3. Isi awal ──────────────────────────────────────────────────────────────
-- Tebakan yang masuk akal, bukan ketetapan. Yang tahu kosakata sebenarnya orang
-- lapangan, dan mereka bisa menyuntingnya sendiri sejak hari pertama.
--
-- ON CONFLICT DO NOTHING: menjalankan ulang skrip TIDAK boleh memulihkan label
-- yang sudah disunting orang. Pelajaran dari HARGARDU — "mengembalikan ke
-- keadaan baku" itu sama dengan menghapus keputusan orang, diam-diam.

INSERT INTO public.jtm_ref (kategori, kode, label, bentuk, warna, urutan) VALUES
  ('penanda', 'gardu',    'Gardu',            'kotak',    '#1D3573', 10),
  ('penanda', 'lbsm',     'LBS Motorized',    'segitiga', '#B3701A', 20),
  ('penanda', 'lbs',      'LBS',              'segitiga', '#8E6A1A', 30),
  ('penanda', 'recloser', 'Recloser',         'belah',    '#C62828', 40),
  ('penanda', 'pmt',      'PMT',              'belah',    '#7B1FA2', 50),
  ('penanda', 'fco',      'FCO Seksi',        'bulat',    '#00695C', 60),
  ('penanda', 'peng',     'Pengambilan',      'bulat',    '#2E7D32', 70),

  ('penghantar', 'aaac',      'AAAC',       NULL, NULL, 10),
  ('penghantar', 'aaacs',     'AAACS',      NULL, NULL, 20),
  ('penghantar', 'a3c',       'A3C',        NULL, NULL, 30),
  ('penghantar', 'a3cs',      'A3CS',       NULL, NULL, 40),
  ('penghantar', 'na2xseyby', 'NA2XSEYBY',  NULL, NULL, 50),
  ('penghantar', 'acsr',      'ACSR',       NULL, NULL, 60),

  ('ukuran', '35',  '35 mm²',  NULL, NULL, 10),
  ('ukuran', '50',  '50 mm²',  NULL, NULL, 20),
  ('ukuran', '70',  '70 mm²',  NULL, NULL, 30),
  ('ukuran', '95',  '95 mm²',  NULL, NULL, 40),
  ('ukuran', '120', '120 mm²', NULL, NULL, 50),
  ('ukuran', '150', '150 mm²', NULL, NULL, 60),
  ('ukuran', '240', '240 mm²', NULL, NULL, 70)
ON CONFLICT (kategori, kode) DO NOTHING;

-- ── 4. Penjaga: yang sudah dipakai tidak boleh dihapus ───────────────────────
-- Menghapus penanda yang masih menempel di tiang membuat peta menggambar
-- sesuatu yang tidak punya nama lagi. Nonaktifkan saja — itu menghilangkannya
-- dari daftar pilihan tanpa merusak yang sudah tercatat.

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
  END IF;
  RETURN OLD;
END $$;

DROP TRIGGER IF EXISTS trg_jaga_jtm_ref_terpakai ON public.jtm_ref;
CREATE TRIGGER trg_jaga_jtm_ref_terpakai
  BEFORE DELETE ON public.jtm_ref
  FOR EACH ROW EXECUTE FUNCTION public.jaga_jtm_ref_terpakai();

-- ── 5. Hak akses ─────────────────────────────────────────────────────────────

ALTER TABLE public.jtm_ref ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS auth_all_jtm_ref ON public.jtm_ref;
CREATE POLICY auth_all_jtm_ref ON public.jtm_ref
  FOR ALL TO authenticated USING (true) WITH CHECK (true);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.jtm_ref TO authenticated;

-- =============================================================================
-- Periksa hasilnya
-- =============================================================================
-- a. Tiga daftar:
--      SELECT kategori, count(*) FROM jtm_ref WHERE aktif GROUP BY kategori;
--
-- b. Tiang yang sudah bertanda:
--      SELECT penanda, count(*) FROM tiang WHERE penanda IS NOT NULL GROUP BY penanda;
-- =============================================================================
