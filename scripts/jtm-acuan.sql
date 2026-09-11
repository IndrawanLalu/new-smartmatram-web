-- =============================================================================
-- Fase 4.2b — Inspeksi JTM: daftar isian
-- Jalankan SESUDAH `jtm-schema.sql`. Idempoten.
--
-- Polanya SAMA PERSIS dengan HARGARDU — item + opsi + kolom `normal` — dan itu
-- disengaja: pemilik pekerjaan sudah melihat bentuk itu bekerja dan memintanya
-- dipakai di semua modul berikutnya.
--
-- Tabelnya tetap terpisah dari `hargardu_item_ref`, tidak digabung dengan kolom
-- `modul`. Alasannya bukan kerapian: HARGARDU sudah hidup dan sedang diuji
-- orang, dan menggabungkan dua daftar berarti satu salah sunting di layar
-- pengaturan JTM bisa mengubah formulir gardu yang sedang dipakai regu hari itu.
--
-- DUA KOLOM YANG TIDAK ADA DI HARGARDU, dan keduanya lahir dari keputusan
-- lapangan, bukan dari selera perancang:
--
--   `tier`  — tier 1 dan 2 perlakuannya sama, yang berbeda hanya daftar
--             itemnya. Memindahkan satu item dari tier 2 ke tier 1 = mengubah
--             satu kolom, bukan merilis aplikasi.
--
--   `milik` — 'tiang' atau 'sirkit'. Inilah cara menuliskan aturan "pemilik
--             menilai badan tiang, penumpang menilai miliknya" sebagai DATA.
--             Kalau ditulis di kode, menambah item baru berarti menebak siapa
--             yang wajib mengisinya — dan tebakan itu tidak pernah kelihatan
--             salah, karena akibatnya cuma isian yang tidak pernah ditanyakan.
-- =============================================================================

-- ── 1. Item pemeriksaan ──────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.jtm_item_ref (
  -- TETAP selamanya. Kode inilah yang tertulis di ribuan baris pemeriksaan.
  kode     TEXT PRIMARY KEY,
  nama     TEXT NOT NULL,
  kelompok TEXT NOT NULL,

  -- tunggal = sekali per tiang · fasa = R/S/T · sirkit = per kabel yang lewat
  dimensi  TEXT NOT NULL DEFAULT 'tunggal',
  tipe     TEXT NOT NULL DEFAULT 'pilihan',
  satuan   TEXT,

  -- 1 = inspeksi rutin · 2 = inspeksi detail · 12 = ditanyakan di keduanya
  tier     TEXT NOT NULL DEFAULT '12',

  -- Siapa yang wajib mengisi. 'tiang' = hanya penyulang PEMILIK; 'sirkit' =
  -- tiap penyulang untuk kabelnya sendiri.
  milik    TEXT NOT NULL DEFAULT 'tiang',

  wajib            BOOLEAN NOT NULL DEFAULT true,
  urutan           INT     NOT NULL DEFAULT 100,
  aktif            BOOLEAN NOT NULL DEFAULT true,
  tampil_dashboard BOOLEAN NOT NULL DEFAULT false,
  keterangan       TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.jtm_item_ref DROP CONSTRAINT IF EXISTS jtm_item_dimensi_valid;
ALTER TABLE public.jtm_item_ref ADD CONSTRAINT jtm_item_dimensi_valid
  CHECK (dimensi IN ('tunggal', 'fasa', 'sirkit'));

ALTER TABLE public.jtm_item_ref DROP CONSTRAINT IF EXISTS jtm_item_tipe_valid;
ALTER TABLE public.jtm_item_ref ADD CONSTRAINT jtm_item_tipe_valid
  CHECK (tipe IN ('pilihan', 'angka', 'teks'));

ALTER TABLE public.jtm_item_ref DROP CONSTRAINT IF EXISTS jtm_item_tier_valid;
ALTER TABLE public.jtm_item_ref ADD CONSTRAINT jtm_item_tier_valid
  CHECK (tier IN ('1', '2', '12'));

ALTER TABLE public.jtm_item_ref DROP CONSTRAINT IF EXISTS jtm_item_milik_valid;
ALTER TABLE public.jtm_item_ref ADD CONSTRAINT jtm_item_milik_valid
  CHECK (milik IN ('tiang', 'sirkit'));

COMMENT ON COLUMN public.jtm_item_ref.milik IS
  'tiang = hanya penyulang pemilik yang wajib mengisi; sirkit = tiap penyulang mengisi untuk kabelnya sendiri. Aturan "satu benda satu keadaan" ditulis di sini, bukan di kode.';

-- ── 2. Pilihan jawaban ───────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.jtm_opsi_ref (
  item_kode TEXT NOT NULL REFERENCES public.jtm_item_ref(kode) ON DELETE CASCADE,
  kode      TEXT NOT NULL,
  label     TEXT NOT NULL,

  -- Sama seperti HARGARDU: begitu daftar pilihan boleh diubah orang, kode tidak
  -- boleh lagi tahu sendiri mana yang rusak. Satu kolom ini yang melahirkan
  -- daftar temuan, tiga kelompok dashboard, dan penanda perhatian di formulir.
  normal    BOOLEAN NOT NULL DEFAULT false,

  urutan    INT     NOT NULL DEFAULT 100,
  aktif     BOOLEAN NOT NULL DEFAULT true,
  PRIMARY KEY (item_kode, kode)
);

-- ── 3. Jejak perubahan daftar ────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.jtm_ref_audit (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tabel      TEXT NOT NULL,
  kunci      TEXT NOT NULL,
  aksi       TEXT NOT NULL,
  nilai_lama JSONB,
  nilai_baru JSONB,
  oleh_uid   UUID,
  oleh_nama  TEXT,
  pada       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS jtm_ref_audit_idx
  ON public.jtm_ref_audit (tabel, kunci, pada DESC);

-- ── 4. Penjaga: yang sudah dipakai tidak boleh dihapus ───────────────────────
-- Penjaganya dipasang sekarang, sebelum ada satu pun jawaban tersimpan. Kalau
-- menunggu sampai "nanti dibutuhkan", yang hilang duluan justru catatan
-- pertama — dan itu catatan yang tidak bisa dibuat ulang.

CREATE OR REPLACE FUNCTION public.jaga_jtm_opsi_terpakai()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE dipakai INT;
BEGIN
  -- Tabel jawabannya lahir di `jtm-inspeksi-schema.sql`. Selama belum ada,
  -- penjaga ini melepas begitu saja — bukan gagal.
  IF to_regclass('public.inspeksi_jtm_periksa') IS NULL THEN RETURN OLD; END IF;

  EXECUTE 'SELECT count(*) FROM public.inspeksi_jtm_periksa WHERE item_kode = $1 AND nilai = $2'
    INTO dipakai USING OLD.item_kode, OLD.kode;

  IF dipakai > 0 THEN
    RAISE EXCEPTION
      'Pilihan "%" pada % sudah dipakai % catatan pemeriksaan. Nonaktifkan saja — menghapusnya membuat laporan lama menunjuk pilihan yang tidak ada lagi.',
      OLD.label, OLD.item_kode, dipakai;
  END IF;
  RETURN OLD;
END $$;

DROP TRIGGER IF EXISTS trg_jaga_jtm_opsi_terpakai ON public.jtm_opsi_ref;
CREATE TRIGGER trg_jaga_jtm_opsi_terpakai
  BEFORE DELETE ON public.jtm_opsi_ref
  FOR EACH ROW EXECUTE FUNCTION public.jaga_jtm_opsi_terpakai();

CREATE OR REPLACE FUNCTION public.jaga_jtm_item_terpakai()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE dipakai INT;
BEGIN
  IF to_regclass('public.inspeksi_jtm_periksa') IS NULL THEN RETURN OLD; END IF;

  EXECUTE 'SELECT count(*) FROM public.inspeksi_jtm_periksa WHERE item_kode = $1'
    INTO dipakai USING OLD.kode;

  IF dipakai > 0 THEN
    RAISE EXCEPTION 'Item "%" sudah dipakai % catatan pemeriksaan. Nonaktifkan saja (aktif = false).',
      OLD.nama, dipakai;
  END IF;
  RETURN OLD;
END $$;

DROP TRIGGER IF EXISTS trg_jaga_jtm_item_terpakai ON public.jtm_item_ref;
CREATE TRIGGER trg_jaga_jtm_item_terpakai
  BEFORE DELETE ON public.jtm_item_ref
  FOR EACH ROW EXECUTE FUNCTION public.jaga_jtm_item_terpakai();

-- ── 5. Isi awal — DRAF, bukan ketetapan ──────────────────────────────────────
-- Diturunkan dari tiga sumber: kosakata temuan yang sudah dipakai di 2.394
-- baris `inspeksi`, kolom Sheet tiang referensi, dan bentuk fisik tiang JTM.
-- Urutan kelompok mengikuti cara orang memeriksa tiang: DARI ATAS KE BAWAH.
--
-- Yang SENGAJA tidak masuk: 'Ganti Isolator', 'Pemasangan Tekep', 'Perbaikan
-- Traverst'. Itu PEKERJAAN, bukan kondisi — dan pekerjaan diturunkan dari
-- kondisi. Mencatat dua-duanya berarti dua salinan dari kebenaran yang sama,
-- dan salinan seperti itu selalu berakhir melenceng.
--
-- ON CONFLICT DO UPDATE dilewati untuk baris yang PERNAH DISUNTING orang —
-- dikenali dari `jtm_ref_audit`. Pelajaran dari HARGARDU: sejak daftar bisa
-- diubah dari aplikasi, "mengembalikan ke keadaan baku" berarti menghapus
-- keputusan orang, diam-diam.

INSERT INTO public.jtm_item_ref
  (kode, nama, kelompok, dimensi, tipe, satuan, tier, milik, urutan, tampil_dashboard)
VALUES
  -- 1. Tiang
  ('kondisi_tiang',      'Kondisi Tiang',        'Tiang',      'tunggal', 'pilihan', NULL, '12', 'tiang', 10, true),
  ('jenis_tiang',        'Jenis Tiang',          'Tiang',      'tunggal', 'pilihan', NULL, '12', 'tiang', 11, false),
  ('papan_nomor',        'Papan Nomor Tiang',    'Tiang',      'tunggal', 'pilihan', NULL, '12', 'tiang', 12, true),
  -- 2. Konstruksi & travers
  ('konstruksi',         'Konstruksi',           'Konstruksi', 'tunggal', 'pilihan', NULL, '12', 'tiang', 20, false),
  ('kondisi_travers',    'Kondisi Travers',      'Konstruksi', 'tunggal', 'pilihan', NULL, '12', 'tiang', 21, true),
  ('baut_mur',           'Baut & Mur',           'Konstruksi', 'tunggal', 'pilihan', NULL, '2',  'tiang', 22, false),
  -- 3. Isolator
  ('jenis_isolator',     'Jenis Isolator',       'Isolator',   'tunggal', 'pilihan', NULL, '12', 'sirkit', 30, false),
  ('bahan_isolator',     'Bahan Isolator',       'Isolator',   'tunggal', 'pilihan', NULL, '12', 'sirkit', 31, false),
  ('kondisi_isolator',   'Kondisi Isolator',     'Isolator',   'fasa',    'pilihan', NULL, '12', 'sirkit', 32, true),
  ('tekep_isolator',     'Tekep Isolator',       'Isolator',   'tunggal', 'pilihan', NULL, '12', 'sirkit', 33, true),
  -- 4. Konduktor
  ('jenis_konduktor',    'Jenis Konduktor',      'Konduktor',  'sirkit',  'pilihan', NULL, '12', 'sirkit', 40, false),
  ('kondisi_konduktor',  'Kondisi Konduktor',    'Konduktor',  'sirkit',  'pilihan', NULL, '12', 'sirkit', 41, true),
  ('andongan',           'Andongan',             'Konduktor',  'sirkit',  'pilihan', NULL, '2',  'sirkit', 42, false),
  -- 5. Jumperan & sambungan
  ('kondisi_jumperan',   'Kondisi Jumperan',     'Sambungan',  'fasa',    'pilihan', NULL, '12', 'sirkit', 50, true),
  ('jenis_sambungan',    'Jenis Sambungan',      'Sambungan',  'sirkit',  'pilihan', NULL, '12', 'sirkit', 51, true),
  ('suhu_sambungan',     'Suhu Sambungan',       'Sambungan',  'fasa',    'angka',   '°C', '2',  'sirkit', 52, false),
  -- 6. Pengaman
  ('arrester',           'Arrester',             'Pengaman',   'tunggal', 'pilihan', NULL, '12', 'tiang', 60, true),
  ('kondisi_arrester',   'Kondisi Arrester',     'Pengaman',   'fasa',    'pilihan', NULL, '12', 'tiang', 61, false),
  ('fco',                'Cut Out (FCO)',        'Pengaman',   'tunggal', 'pilihan', NULL, '12', 'tiang', 62, false),
  ('kondisi_fco',        'Kondisi Cut Out',      'Pengaman',   'fasa',    'pilihan', NULL, '12', 'tiang', 63, false),
  ('tekep_konduktor',    'Tekep Konduktor',      'Pengaman',   'tunggal', 'pilihan', NULL, '12', 'sirkit', 64, true),
  -- 7. Pentanahan
  ('pentanahan',         'Pentanahan',           'Pentanahan', 'tunggal', 'pilihan', NULL, '12', 'tiang', 70, true),
  ('kondisi_kawat_tanah','Kondisi Kawat Tanah',  'Pentanahan', 'tunggal', 'pilihan', NULL, '12', 'tiang', 71, false),
  ('nilai_pentanahan',   'Nilai Pentanahan',     'Pentanahan', 'tunggal', 'angka',   'ohm','2',  'tiang', 72, false),
  -- 8. Skur
  ('skur',               'Skur',                 'Skur',       'tunggal', 'pilihan', NULL, '12', 'tiang', 80, false),
  ('kondisi_skur',       'Kondisi Skur',         'Skur',       'tunggal', 'pilihan', NULL, '12', 'tiang', 81, false),
  -- 9. Peralatan hubung
  ('peralatan_hubung',   'Peralatan Hubung',     'Peralatan',  'tunggal', 'pilihan', NULL, '12', 'tiang', 90, false),
  ('kondisi_peralatan',  'Kondisi Peralatan',    'Peralatan',  'tunggal', 'pilihan', NULL, '12', 'tiang', 91, true),
  ('nomor_peralatan',    'Nomor Peralatan',      'Peralatan',  'tunggal', 'teks',    NULL, '12', 'tiang', 92, false),
  -- 10. ROW & lingkungan
  ('vegetasi',           'Vegetasi',             'ROW',        'tunggal', 'pilihan', NULL, '12', 'tiang', 100, true),
  ('layangan',           'Layangan',             'ROW',        'tunggal', 'pilihan', NULL, '12', 'tiang', 101, true),
  ('jarak_bangunan',     'Jarak ke Bangunan',    'ROW',        'tunggal', 'pilihan', NULL, '12', 'tiang', 102, true),
  ('akses_regu',         'Akses Regu',           'ROW',        'tunggal', 'pilihan', NULL, '12', 'tiang', 103, false)
ON CONFLICT (kode) DO UPDATE SET
  nama = EXCLUDED.nama,
  kelompok = EXCLUDED.kelompok,
  dimensi = EXCLUDED.dimensi,
  tipe = EXCLUDED.tipe,
  satuan = EXCLUDED.satuan,
  tier = EXCLUDED.tier,
  milik = EXCLUDED.milik,
  urutan = EXCLUDED.urutan,
  tampil_dashboard = EXCLUDED.tampil_dashboard,
  updated_at = now()
WHERE NOT EXISTS (
  SELECT 1 FROM public.jtm_ref_audit a
  WHERE a.tabel = 'item' AND a.kunci = jtm_item_ref.kode
);

-- Pilihan jawaban. Kosakatanya TEBAKAN TERDIDIK — diambil dari kata yang sudah
-- benar-benar dipakai regu di 2.394 baris inspeksi ('rantas', 'layangan',
-- 'tiang miring', 'isolator pecah'), bukan dari istilah buku. Yang tahu kata
-- sebenarnya tetap orang lapangan, dan mulai hari pertama mereka bisa
-- menyempurnakannya sendiri lewat halaman Pengaturan.
INSERT INTO public.jtm_opsi_ref (item_kode, kode, label, normal, urutan)
VALUES
  ('kondisi_tiang', 'tegak', 'Tegak', true, 10),
  ('kondisi_tiang', 'miring', 'Miring', false, 20),
  ('kondisi_tiang', 'retak', 'Retak', false, 30),
  ('kondisi_tiang', 'keropos', 'Keropos', false, 40),
  ('kondisi_tiang', 'patah', 'Patah', false, 50),

  ('jenis_tiang', 'beton_9', 'Beton 9 m', true, 10),
  ('jenis_tiang', 'beton_11', 'Beton 11 m', true, 20),
  ('jenis_tiang', 'beton_13', 'Beton 13 m', true, 30),
  ('jenis_tiang', 'besi_9', 'Besi 9 m', true, 40),
  ('jenis_tiang', 'besi_11', 'Besi 11 m', true, 50),
  ('jenis_tiang', 'besi_13', 'Besi 13 m', true, 60),
  ('jenis_tiang', 'kayu', 'Kayu', false, 70),

  ('papan_nomor', 'ada', 'Ada', true, 10),
  ('papan_nomor', 'pudar', 'Ada tapi pudar', false, 20),
  ('papan_nomor', 'tidak', 'Tidak ada', false, 30),

  ('konstruksi', 'a1', 'A1', true, 10),
  ('konstruksi', 'a2', 'A2', true, 20),
  ('konstruksi', 'a3', 'A3', true, 30),
  ('konstruksi', 'a4', 'A4', true, 40),
  ('konstruksi', 'b1', 'B1', true, 50),
  ('konstruksi', 'b2', 'B2', true, 60),
  ('konstruksi', 'c1', 'C1', true, 70),
  ('konstruksi', 'd1', 'D1', true, 80),

  ('kondisi_travers', 'baik', 'Baik', true, 10),
  ('kondisi_travers', 'miring', 'Miring', false, 20),
  ('kondisi_travers', 'korosi', 'Korosi', false, 30),
  ('kondisi_travers', 'bengkok', 'Bengkok', false, 40),

  ('baut_mur', 'lengkap', 'Lengkap & kencang', true, 10),
  ('baut_mur', 'kendor', 'Kendor', false, 20),
  ('baut_mur', 'kurang', 'Kurang', false, 30),

  ('jenis_isolator', 'tumpu', 'Tumpu', true, 10),
  ('jenis_isolator', 'tarik', 'Tarik', true, 20),
  ('jenis_isolator', 'tumpu_tarik', 'Tumpu & Tarik', true, 30),

  ('bahan_isolator', 'keramik', 'Keramik', true, 10),
  ('bahan_isolator', 'polimer', 'Polimer', true, 20),

  ('kondisi_isolator', 'baik', 'Baik', true, 10),
  ('kondisi_isolator', 'kotor', 'Kotor', false, 20),
  ('kondisi_isolator', 'retak', 'Retak', false, 30),
  ('kondisi_isolator', 'pecah', 'Pecah', false, 40),
  ('kondisi_isolator', 'flash', 'Flashover', false, 50),

  ('tekep_isolator', 'ada', 'Ada', true, 10),
  ('tekep_isolator', 'sebagian', 'Sebagian', false, 20),
  ('tekep_isolator', 'tidak', 'Tidak ada', false, 30),

  ('jenis_konduktor', 'aaac_150', 'AAAC 150', true, 10),
  ('jenis_konduktor', 'aaacs_240', 'AAACS 240', true, 20),
  ('jenis_konduktor', 'a3c_150', 'A3C 150', true, 30),
  ('jenis_konduktor', 'a3cs_150', 'A3CS 150', true, 40),
  ('jenis_konduktor', 'na2xseyby', 'NA2XSEYBY 150', true, 50),
  ('jenis_konduktor', 'lainnya', 'Lainnya', true, 60),

  ('kondisi_konduktor', 'baik', 'Baik', true, 10),
  ('kondisi_konduktor', 'rantas', 'Rantas', false, 20),
  ('kondisi_konduktor', 'kendor', 'Kendor', false, 30),
  ('kondisi_konduktor', 'serabut', 'Serabut putus', false, 40),
  ('kondisi_konduktor', 'putus', 'Putus', false, 50),

  ('andongan', 'normal', 'Normal', true, 10),
  ('andongan', 'kendor', 'Terlalu kendor', false, 20),
  ('andongan', 'tegang', 'Terlalu tegang', false, 30),

  ('kondisi_jumperan', 'baik', 'Baik', true, 10),
  ('kondisi_jumperan', 'longgar', 'Longgar', false, 20),
  ('kondisi_jumperan', 'korosi', 'Korosi', false, 30),
  ('kondisi_jumperan', 'panas', 'Panas / berubah warna', false, 40),

  ('jenis_sambungan', 'joint_press', 'Joint Press', true, 10),
  ('jenis_sambungan', 'konektor', 'Konektor', true, 20),
  ('jenis_sambungan', 'lilit', 'Lilit', false, 30),

  ('arrester', 'ada', 'Ada', true, 10),
  ('arrester', 'tidak', 'Tidak ada', false, 20),
  ('arrester', 'tidak_perlu', 'Tidak diperlukan', true, 30),

  ('kondisi_arrester', 'baik', 'Baik', true, 10),
  ('kondisi_arrester', 'pecah', 'Pecah', false, 20),
  ('kondisi_arrester', 'terbakar', 'Terbakar', false, 30),
  ('kondisi_arrester', 'kabel_tanah_putus', 'Kabel tanah putus', false, 40),

  ('fco', 'ada', 'Ada', true, 10),
  ('fco', 'tidak', 'Tidak ada', true, 20),

  ('kondisi_fco', 'baik', 'Baik', true, 10),
  ('kondisi_fco', 'pecah', 'Pecah', false, 20),
  ('kondisi_fco', 'terbakar', 'Terbakar', false, 30),
  ('kondisi_fco', 'lepas', 'Lepas / menggantung', false, 40),

  ('tekep_konduktor', 'ada', 'Ada', true, 10),
  ('tekep_konduktor', 'sebagian', 'Sebagian', false, 20),
  ('tekep_konduktor', 'tidak', 'Tidak ada', false, 30),

  ('pentanahan', 'ada', 'Ada', true, 10),
  ('pentanahan', 'tidak', 'Tidak ada', false, 20),

  ('kondisi_kawat_tanah', 'baik', 'Baik', true, 10),
  ('kondisi_kawat_tanah', 'korosi', 'Korosi', false, 20),
  ('kondisi_kawat_tanah', 'putus', 'Putus', false, 30),
  ('kondisi_kawat_tanah', 'hilang', 'Hilang', false, 40),

  ('skur', 'ada', 'Ada', true, 10),
  ('skur', 'tidak_perlu', 'Tidak diperlukan', true, 20),
  ('skur', 'tidak', 'Perlu tapi tidak ada', false, 30),

  ('kondisi_skur', 'baik', 'Baik', true, 10),
  ('kondisi_skur', 'kendor', 'Kendor', false, 20),
  ('kondisi_skur', 'korosi', 'Korosi', false, 30),
  ('kondisi_skur', 'putus', 'Putus', false, 40),

  ('peralatan_hubung', 'tidak_ada', 'Tidak ada', true, 10),
  ('peralatan_hubung', 'lbs', 'LBS', true, 20),
  ('peralatan_hubung', 'rec', 'Recloser', true, 30),
  ('peralatan_hubung', 'fco_seksi', 'FCO Seksi', true, 40),
  ('peralatan_hubung', 'abs', 'ABSW', true, 50),

  ('kondisi_peralatan', 'baik', 'Baik', true, 10),
  ('kondisi_peralatan', 'karat', 'Berkarat', false, 20),
  ('kondisi_peralatan', 'bocor', 'Bocor', false, 30),
  ('kondisi_peralatan', 'rusak', 'Rusak', false, 40),

  ('vegetasi', 'aman', 'Aman', true, 10),
  ('vegetasi', 'berpotensi', 'Berpotensi mengganggu', false, 20),
  ('vegetasi', 'menyentuh', 'Menyentuh jaringan', false, 30),

  ('layangan', 'tidak', 'Tidak ada', true, 10),
  ('layangan', 'ada', 'Ada', false, 20),

  ('jarak_bangunan', 'aman', 'Aman', true, 10),
  ('jarak_bangunan', 'dekat', 'Terlalu dekat', false, 20),

  ('akses_regu', 'mudah', 'Mudah', true, 10),
  ('akses_regu', 'sulit', 'Sulit (perlu alat/izin)', false, 20)
ON CONFLICT (item_kode, kode) DO UPDATE SET
  label = EXCLUDED.label,
  urutan = EXCLUDED.urutan
WHERE NOT EXISTS (
  SELECT 1 FROM public.jtm_ref_audit a
  WHERE a.tabel = 'opsi'
    AND a.kunci = jtm_opsi_ref.item_kode || '/' || jtm_opsi_ref.kode
);

-- `normal` sengaja TIDAK ikut ditimpa saat skrip dijalankan ulang. Kalau UP3
-- sudah memutuskan 'Lilit' tidak layak, keputusan itu keputusan mereka — bukan
-- tebakan saya yang dipulihkan diam-diam tiap kali skrip dijalankan.

-- ── 6. Hak akses ─────────────────────────────────────────────────────────────

DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['jtm_item_ref', 'jtm_opsi_ref', 'jtm_ref_audit'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS auth_all_%I ON public.%I', t, t);
    EXECUTE format(
      'CREATE POLICY auth_all_%I ON public.%I FOR ALL TO authenticated USING (true) WITH CHECK (true)',
      t, t);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON public.%I TO authenticated', t);
  END LOOP;
END $$;

-- =============================================================================
-- Periksa hasilnya
-- =============================================================================
-- a. Urutan kelompok seperti orang memeriksa tiang, dari atas ke bawah:
--      SELECT kelompok, min(urutan) urut, count(*) jml
--      FROM jtm_item_ref WHERE aktif GROUP BY kelompok ORDER BY urut;
--
-- b. Item yang cuma ditanyakan di inspeksi detail:
--      SELECT kode, nama FROM jtm_item_ref WHERE tier = '2' ORDER BY urutan;
--
-- c. Item yang WAJIB diisi penyulang pemilik saja (badan tiang):
--      SELECT kode, nama FROM jtm_item_ref WHERE milik = 'tiang' ORDER BY urutan;
--
-- d. Yang dianggap TIDAK normal — inilah yang akan jadi daftar perbaikan:
--      SELECT item_kode, kode, label FROM jtm_opsi_ref
--      WHERE NOT normal ORDER BY item_kode, urutan;
-- =============================================================================
