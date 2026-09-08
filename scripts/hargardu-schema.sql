-- =============================================================================
-- Fase 3.1a — Pemeliharaan Gardu (HARGARDU): struktur
-- Jalankan SESUDAH `master-usulan-schema.sql`. Idempoten.
--
-- Rancangan lengkap dan alasan tiap keputusan: `rencana-hargardu.md` di root.
--
-- Empat prinsip yang dikunci di sini:
--
--   1. CATATAN PEMELIHARAAN ADALAH SEJARAH. Tidak pernah ditulis ulang.
--      Pemeliharaan berikutnya mengoreksi MASTER-nya, bukan laporan lama.
--      Karena itu tiap pekerjaan menyimpan `spek` — apa yang benar-benar terbaca
--      di nama plat hari itu — terpisah dari master.
--
--   2. KOSONG LANGSUNG TERISI, BERBEDA MENUNGGU PERSETUJUAN. Melengkapi master
--      yang kosong tidak merugikan siapa pun; mengubah kVA yang sudah ada
--      menggeser hitungan beban seluruh sistem.
--
--   3. TIDAK DIKETAHUI ≠ TIDAK ADA. Gardu yang belum pernah dipelihara tidak
--      boleh terhitung sebagai "belum bertekep".
--
--   4. DAFTAR ISIAN ADALAH DATA, BUKAN KODE — satu daftar untuk semua ULP, dan
--      hanya UP3 yang boleh mengubahnya.
-- =============================================================================

-- ── 1. Acuan: daftar item pemeriksaan ─────────────────────────────────
-- Isinya di `hargardu-acuan.sql`. Yang di sini cuma bentuknya.

CREATE TABLE IF NOT EXISTS public.hargardu_item_ref (
  -- TETAP selamanya. Yang boleh berubah `nama`-nya, bukan ini: kode inilah yang
  -- tertulis di ribuan baris pemeriksaan, dan menggantinya memutus semuanya.
  kode        TEXT PRIMARY KEY,
  nama        TEXT NOT NULL,
  kelompok    TEXT NOT NULL,

  -- Cut out dan arrester dinilai per fasa; papan injak tidak.
  per_fasa    BOOLEAN NOT NULL DEFAULT false,

  tipe        TEXT NOT NULL DEFAULT 'pilihan',
  satuan      TEXT,                       -- untuk tipe angka: A, mm2, ohm

  wajib       BOOLEAN NOT NULL DEFAULT true,
  urutan      INT     NOT NULL DEFAULT 100,
  aktif       BOOLEAN NOT NULL DEFAULT true,

  -- Ikut jadi angka di halaman utama atau tidak. Tekep, jumperan, dan sambungan
  -- outlet ditandai ini — itu yang diminta pemilik pekerjaan.
  tampil_dashboard BOOLEAN NOT NULL DEFAULT false,

  keterangan  TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.hargardu_item_ref DROP CONSTRAINT IF EXISTS hargardu_item_tipe_valid;
ALTER TABLE public.hargardu_item_ref ADD CONSTRAINT hargardu_item_tipe_valid
  CHECK (tipe IN ('pilihan', 'angka', 'teks'));

COMMENT ON TABLE public.hargardu_item_ref IS
  'Daftar item pemeriksaan HARGARDU. SATU daftar untuk semua ULP, hanya UP3 yang mengubah — kalau tiap ULP mengarang kosakatanya sendiri, angka se-UP3 tidak bisa dijumlahkan lagi.';

-- ── 2. Acuan: pilihan jawaban tiap item ───────────────────────────────

CREATE TABLE IF NOT EXISTS public.hargardu_opsi_ref (
  item_kode TEXT NOT NULL REFERENCES public.hargardu_item_ref(kode) ON DELETE CASCADE,

  -- TETAP. `label` boleh diganti kapan saja — "Rembes" jadi "Rembes/Bocor
  -- Minyak" — tanpa memecah angka dashboard jadi dua.
  kode      TEXT NOT NULL,
  label     TEXT NOT NULL,

  -- INILAH KOLOM YANG MEMBUAT SELURUH MODUL JALAN.
  --
  -- Begitu daftar pilihan boleh diubah orang, kode TIDAK BOLEH lagi tahu sendiri
  -- mana yang bagus dan mana yang rusak. Kalau "rusak" ditentukan di kode, UP3
  -- menambah pilihan baru dari halaman pengaturan dan pilihan itu tidak pernah
  -- terhitung sebagai temuan — tanpa pesan galat apa pun, angkanya cuma terlihat
  -- lebih kecil.
  --
  -- Satu kolom ini melahirkan tiga hal sekaligus: daftar pekerjaan tertunda,
  -- tiga kelompok di dashboard, dan penanda perhatian di formulir mobile.
  normal    BOOLEAN NOT NULL DEFAULT false,

  urutan    INT     NOT NULL DEFAULT 100,
  aktif     BOOLEAN NOT NULL DEFAULT true,
  PRIMARY KEY (item_kode, kode)
);

COMMENT ON COLUMN public.hargardu_opsi_ref.normal IS
  'Apakah nilai ini keadaan normal. Penilaiannya sengaja jadi DATA, bukan kode — supaya pilihan baru yang ditambah UP3 langsung ikut terhitung sebagai temuan.';

-- ── 3. Acuan: slot foto ──────────────────────────────────────────
-- Ikut jadi acuan dengan alasan yang sama: kewajiban foto pasti berubah, dan
-- tiap perubahan tidak perlu menunggu rilis aplikasi.

CREATE TABLE IF NOT EXISTS public.hargardu_foto_ref (
  kode       TEXT PRIMARY KEY,
  nama       TEXT NOT NULL,
  kelompok   TEXT NOT NULL DEFAULT 'Pekerjaan',
  wajib      BOOLEAN NOT NULL DEFAULT false,
  urutan     INT     NOT NULL DEFAULT 100,
  aktif      BOOLEAN NOT NULL DEFAULT true,
  keterangan TEXT
);

-- ── 4. Jejak perubahan daftar acuan ───────────────────────────────
-- Satu hal yang tidak bisa dijaga kode: kalau kosakatanya sering diganti-ganti,
-- angka antar tahun jadi sulit dibandingkan meski semuanya tercatat benar. Itu
-- disiplin orang. Yang bisa dilakukan di sini cuma membuat sebabnya bisa
-- ditelusuri kalau suatu saat angkanya patah.

CREATE TABLE IF NOT EXISTS public.hargardu_ref_audit (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tabel      TEXT NOT NULL,               -- item | opsi | foto
  kunci      TEXT NOT NULL,               -- kode item, atau item_kode/kode opsi
  aksi       TEXT NOT NULL,               -- tambah | ubah | nonaktif | hapus
  nilai_lama JSONB,
  nilai_baru JSONB,
  oleh_uid   UUID,
  oleh_nama  TEXT,
  pada       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS hargardu_ref_audit_idx
  ON public.hargardu_ref_audit (tabel, kunci, pada DESC);

-- ── 5. Pekerjaan pemeliharaan ──────────────────────────────────

CREATE TABLE IF NOT EXISTS public.pemeliharaan_gardu (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Kunci gardu SELALU (kode, ulp): kode tidak unik lintas ULP.
  gardu_kode  TEXT NOT NULL,
  ulp         TEXT NOT NULL,

  -- Disalin saat pekerjaan dibuat, tidak dibaca dari master saat ditampilkan:
  -- penyulang gardu bisa berpindah, dan laporan lama harus tetap menyebut
  -- penyulang yang benar SAAT ITU.
  penyulang   TEXT,

  -- Kata yang sama persis dengan inspeksi JTR. Satu kosakata untuk satu maksud —
  -- petugas tidak perlu belajar dua sistem status di satu aplikasi.
  status      TEXT NOT NULL DEFAULT 'Dalam Proses',
  sumber      TEXT NOT NULL DEFAULT 'lapangan',

  tgl_rencana DATE,
  tgl_padam   TIMESTAMPTZ,
  tgl_selesai TIMESTAMPTZ,

  regu_1      TEXT[] NOT NULL DEFAULT '{}',
  regu_2      TEXT[] NOT NULL DEFAULT '{}',
  petugas_uid UUID,
  petugas_nama TEXT,

  lat         NUMERIC,
  lng         NUMERIC,
  akurasi     NUMERIC(6,1),

  -- Apa yang BENAR-BENAR terbaca di nama plat hari itu. Sengaja terpisah dari
  -- master dan tidak pernah disunting belakangan: kalau tahun ini terbaca 250
  -- kVA dan tahun depan 200, baris ini tetap berbunyi 250 selamanya. Tanpa itu,
  -- pertanyaan "sejak kapan trafonya berbeda" tidak punya jawaban — padahal
  -- justru itu yang menentukan trafonya diganti, salah catat, atau hilang.
  --
  -- JSONB, bukan kolom: daftar spesifikasi yang dibaca regu akan bertambah, dan
  -- selisihnya terhadap master toh sudah tersimpan terstruktur di `master_usulan`.
  spek        JSONB NOT NULL DEFAULT '{}'::jsonb,

  -- Reting fuse TR terpasang, satu set per pekerjaan (bukan sebelum/sesudah):
  -- {"A":{"R":63,"S":63,"T":63}, "B":{...}}
  reting_fuse JSONB NOT NULL DEFAULT '{}'::jsonb,

  catatan_perbaikan TEXT,

  -- PR: pekerjaan yang tidak selesai hari itu. TEKS BEBAS dan memang begitu
  -- maunya — yang perlu diperbaiki sudah tercatat terstruktur di itemnya
  -- (kondisi_trafo = rembes), jadi menyimpannya sekali lagi sebagai kategori
  -- berarti dua salinan dari kebenaran yang sama.
  pr_keterangan TEXT,

  verified_at   TIMESTAMPTZ,
  verified_by   TEXT,
  verified_note TEXT,

  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.pemeliharaan_gardu DROP CONSTRAINT IF EXISTS pemeliharaan_status_valid;
ALTER TABLE public.pemeliharaan_gardu ADD CONSTRAINT pemeliharaan_status_valid
  CHECK (status IN ('Dijadwalkan', 'Dalam Proses', 'Selesai', 'Diverifikasi', 'Ditolak'));

ALTER TABLE public.pemeliharaan_gardu DROP CONSTRAINT IF EXISTS pemeliharaan_sumber_valid;
ALTER TABLE public.pemeliharaan_gardu ADD CONSTRAINT pemeliharaan_sumber_valid
  CHECK (sumber IN ('jadwal', 'lapangan'));

CREATE INDEX IF NOT EXISTS pemeliharaan_gardu_idx
  ON public.pemeliharaan_gardu (upper(gardu_kode), upper(ulp), tgl_selesai DESC);
CREATE INDEX IF NOT EXISTS pemeliharaan_status_idx
  ON public.pemeliharaan_gardu (ulp, status, tgl_selesai DESC);

-- Pencarian teks pada keterangan — diminta pemilik pekerjaan untuk hal yang
-- tidak pernah bisa dibakukan ("gardu mana yang catatannya menyebut material").
CREATE INDEX IF NOT EXISTS pemeliharaan_cari_idx ON public.pemeliharaan_gardu
  USING gin (to_tsvector('simple',
    coalesce(catatan_perbaikan, '') || ' ' || coalesce(pr_keterangan, '')));

-- ── 6. Jawaban pemeriksaan ────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.pemeliharaan_gardu_periksa (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pemeliharaan_id UUID NOT NULL
    REFERENCES public.pemeliharaan_gardu(id) ON DELETE CASCADE,

  item_kode TEXT NOT NULL REFERENCES public.hargardu_item_ref(kode),

  -- '-' untuk item yang bukan per-fasa, BUKAN NULL. Di Postgres dua NULL
  -- dianggap berbeda, jadi kunci unik dengan NULL tidak mencegah baris kembar —
  -- jebakan yang sudah pernah kena di modul JTR.
  fasa TEXT NOT NULL DEFAULT '-',

  nilai       TEXT,      -- kode opsi, untuk tipe pilihan
  nilai_angka NUMERIC,   -- untuk tipe angka
  catatan     TEXT,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (pemeliharaan_id, item_kode, fasa)
);

ALTER TABLE public.pemeliharaan_gardu_periksa DROP CONSTRAINT IF EXISTS periksa_fasa_valid;
ALTER TABLE public.pemeliharaan_gardu_periksa ADD CONSTRAINT periksa_fasa_valid
  CHECK (fasa IN ('R', 'S', 'T', '-'));

CREATE INDEX IF NOT EXISTS periksa_item_idx
  ON public.pemeliharaan_gardu_periksa (item_kode, nilai);

-- ── 7. Pengukuran siang, sebelum dan sesudah ────────────────────────
-- TIDAK masuk realisasi pengukuran gardu. Ini pengukuran SIANG; realisasi
-- memakai beban puncak. Menggabungkannya merusak dua hal sekaligus: gardu
-- tercatat "sudah diukur" padahal pengukuran malamnya belum, dan angka siang
-- yang rendah menutupi trafo yang sebenarnya overload.

CREATE TABLE IF NOT EXISTS public.pemeliharaan_gardu_ukur (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pemeliharaan_id UUID NOT NULL
    REFERENCES public.pemeliharaan_gardu(id) ON DELETE CASCADE,
  tahap TEXT NOT NULL,

  putaran_phasa TEXT,

  arus_r NUMERIC, arus_s NUMERIC, arus_t NUMERIC, arus_n NUMERIC,
  teg_rn NUMERIC, teg_sn NUMERIC, teg_tn NUMERIC,
  teg_rs NUMERIC, teg_st NUMERIC, teg_tr NUMERIC,

  pertanahan_arrester NUMERIC,
  pertanahan_trafo    NUMERIC,
  pertanahan_netral   NUMERIC,

  -- Bentuknya SENGAJA disamakan dengan `pengukuran_gardu.perjurusan` — bukan
  -- untuk digabung, tapi supaya perbandingan siang lawan malam tidak perlu
  -- penerjemahan: {"A":{"arus":{"R":0,"S":0,"T":0,"N":0},"tegangan":{...}}}
  perjurusan JSONB NOT NULL DEFAULT '{}'::jsonb,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (pemeliharaan_id, tahap)
);

ALTER TABLE public.pemeliharaan_gardu_ukur DROP CONSTRAINT IF EXISTS ukur_tahap_valid;
ALTER TABLE public.pemeliharaan_gardu_ukur ADD CONSTRAINT ukur_tahap_valid
  CHECK (tahap IN ('sebelum', 'sesudah'));

-- ── 8. Foto ────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.pemeliharaan_gardu_foto (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pemeliharaan_id UUID NOT NULL
    REFERENCES public.pemeliharaan_gardu(id) ON DELETE CASCADE,
  slot TEXT NOT NULL REFERENCES public.hargardu_foto_ref(kode),
  url  TEXT NOT NULL,
  diambil_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (pemeliharaan_id, slot)
);

-- ── 9. Jembatan ke Work Order ──────────────────────────────────
-- Sengaja TIPIS: menyimpan penugasannya, bukan menyalin temuannya. Temuannya
-- sudah ada di `pemeliharaan_gardu_periksa`, dan daftar pekerjaan tertunda
-- diturunkan dari sana. Kalau tabel ini ikut menyimpan uraian temuan, dua
-- salinan itu pasti melenceng: itemnya diperbaiki, barisnya tertinggal terbuka.

CREATE TABLE IF NOT EXISTS public.tindak_lanjut_gardu (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  gardu_kode TEXT NOT NULL,
  ulp        TEXT NOT NULL,
  item_kode  TEXT NOT NULL REFERENCES public.hargardu_item_ref(kode),
  fasa       TEXT NOT NULL DEFAULT '-',

  -- Kunci asingnya dipasang terpisah di bawah: modul Work Order berdiri sendiri,
  -- dan skrip ini harus tetap bisa dijalankan di basis data yang belum punya
  -- tabelnya (mis. saat diuji lokal).
  wo_item_id UUID,

  ditugaskan_pada TIMESTAMPTZ NOT NULL DEFAULT now(),
  ditugaskan_oleh TEXT,
  catatan         TEXT,
  UNIQUE (gardu_kode, ulp, item_kode, fasa)
);

DO $$
BEGIN
  IF to_regclass('public.wo_item') IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'tindak_lanjut_wo_fk') THEN
    ALTER TABLE public.tindak_lanjut_gardu
      ADD CONSTRAINT tindak_lanjut_wo_fk
      FOREIGN KEY (wo_item_id) REFERENCES public.wo_item(id) ON DELETE SET NULL;
  END IF;
END $$;

-- ── 10. Master gardu diperluas ────────────────────────────────
-- Tujuh spesifikasi yang selama ini diisi regu tiap pemeliharaan tapi tidak
-- punya tempat menyimpannya, ditambah lima yang selama ini terkubur di
-- `data_amg` (JSONB hasil impor) sehingga tidak pernah bisa dikoreksi.
--
-- `data_amg` TETAP disimpan apa adanya — bukan sumber lagi, tapi pembanding.

ALTER TABLE public.gardu
  ADD COLUMN IF NOT EXISTS jenis_gardu       TEXT,
  ADD COLUMN IF NOT EXISTS phase             INT,
  ADD COLUMN IF NOT EXISTS tegangan_primer   NUMERIC,
  ADD COLUMN IF NOT EXISTS tegangan_sekunder NUMERIC,
  ADD COLUMN IF NOT EXISTS jenis_minyak      TEXT,
  ADD COLUMN IF NOT EXISTS volume_minyak     NUMERIC,
  ADD COLUMN IF NOT EXISTS berat_total       NUMERIC,
  ADD COLUMN IF NOT EXISTS tapping           TEXT,
  ADD COLUMN IF NOT EXISTS pendingin         TEXT,
  ADD COLUMN IF NOT EXISTS no_seri           TEXT,
  ADD COLUMN IF NOT EXISTS tahun_pembuatan   INT,
  ADD COLUMN IF NOT EXISTS arus_primer       NUMERIC,
  ADD COLUMN IF NOT EXISTS arus_sekunder     NUMERIC,
  ADD COLUMN IF NOT EXISTS vector            TEXT,
  -- Kapan master gardu ini terakhir dikonfirmasi orang yang berdiri di bawahnya,
  -- dan dari pemeliharaan mana. Inilah ukuran kelengkapan master yang sebenarnya —
  -- 2.536 baris hasil impor AMG tidak satu pun pernah dilihat orang.
  ADD COLUMN IF NOT EXISTS master_terverifikasi_at   TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS master_terverifikasi_dari UUID;

-- ── 11. Penjaga: pilihan yang sudah dipakai tidak boleh dihapus ───────────
-- Menghapusnya membuat laporan lama menunjuk sesuatu yang tidak ada lagi. Itu
-- bukan pembersihan, itu perusakan arsip. Yang belum pernah dipakai boleh
-- dihapus penuh — salah ketik saat menambah tidak perlu jadi sampah abadi.

CREATE OR REPLACE FUNCTION public.jaga_opsi_terpakai()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE dipakai INT;
BEGIN
  SELECT count(*) INTO dipakai
  FROM public.pemeliharaan_gardu_periksa
  WHERE item_kode = OLD.item_kode AND nilai = OLD.kode;

  IF dipakai > 0 THEN
    RAISE EXCEPTION
      'Pilihan "%" pada % sudah dipakai % catatan pemeriksaan. Nonaktifkan saja (aktif = false) — menghapusnya membuat laporan lama menunjuk pilihan yang tidak ada lagi.',
      OLD.label, OLD.item_kode, dipakai;
  END IF;
  RETURN OLD;
END $$;

DROP TRIGGER IF EXISTS trg_jaga_opsi_terpakai ON public.hargardu_opsi_ref;
CREATE TRIGGER trg_jaga_opsi_terpakai
  BEFORE DELETE ON public.hargardu_opsi_ref
  FOR EACH ROW EXECUTE FUNCTION public.jaga_opsi_terpakai();

CREATE OR REPLACE FUNCTION public.jaga_item_terpakai()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE dipakai INT;
BEGIN
  SELECT count(*) INTO dipakai
  FROM public.pemeliharaan_gardu_periksa WHERE item_kode = OLD.kode;

  IF dipakai > 0 THEN
    RAISE EXCEPTION
      'Item "%" sudah dipakai % catatan pemeriksaan. Nonaktifkan saja (aktif = false).',
      OLD.nama, dipakai;
  END IF;
  RETURN OLD;
END $$;

DROP TRIGGER IF EXISTS trg_jaga_item_terpakai ON public.hargardu_item_ref;
CREATE TRIGGER trg_jaga_item_terpakai
  BEFORE DELETE ON public.hargardu_item_ref
  FOR EACH ROW EXECUTE FUNCTION public.jaga_item_terpakai();

-- ── 12. Penjaga: nilai harus salah satu pilihan yang ada ────────────────
-- Tanpa ini, salah ketik dari aplikasi menghasilkan nilai yang tidak pernah
-- cocok dengan opsi mana pun — tidak terhitung normal, tidak terhitung temuan,
-- hilang begitu saja dari semua rekap.

CREATE OR REPLACE FUNCTION public.jaga_nilai_periksa()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE it RECORD;
BEGIN
  SELECT * INTO it FROM public.hargardu_item_ref WHERE kode = NEW.item_kode;
  IF NOT FOUND THEN RAISE EXCEPTION 'Item % tidak dikenal', NEW.item_kode; END IF;

  IF it.tipe = 'pilihan' AND NEW.nilai IS NOT NULL THEN
    IF NOT EXISTS (SELECT 1 FROM public.hargardu_opsi_ref
                   WHERE item_kode = NEW.item_kode AND kode = NEW.nilai) THEN
      RAISE EXCEPTION 'Pilihan "%" tidak ada pada item %', NEW.nilai, NEW.item_kode;
    END IF;
  END IF;

  IF NOT it.per_fasa AND NEW.fasa <> '-' THEN
    RAISE EXCEPTION 'Item % tidak dinilai per fasa', NEW.item_kode;
  END IF;

  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_jaga_nilai_periksa ON public.pemeliharaan_gardu_periksa;
CREATE TRIGGER trg_jaga_nilai_periksa
  BEFORE INSERT OR UPDATE ON public.pemeliharaan_gardu_periksa
  FOR EACH ROW EXECUTE FUNCTION public.jaga_nilai_periksa();

-- ── 13. Hak akses ─────────────────────────────────────────
-- Pengetatan per-unit dikerjakan sekaligus untuk semua tabel di Fase 0.4,
-- karena mengubahnya sepotong-sepotong justru menyulitkan pengujian.

DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'hargardu_item_ref', 'hargardu_opsi_ref', 'hargardu_foto_ref',
    'hargardu_ref_audit', 'pemeliharaan_gardu', 'pemeliharaan_gardu_periksa',
    'pemeliharaan_gardu_ukur', 'pemeliharaan_gardu_foto', 'tindak_lanjut_gardu'
  ] LOOP
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
-- a. Kolom master yang baru:
--      SELECT kode, no_seri, tahun_pembuatan, volume_minyak, master_terverifikasi_at
--      FROM gardu WHERE kode = 'MM219';
--
-- b. Penjaga bekerja — keduanya HARUS gagal:
--      DELETE FROM hargardu_opsi_ref WHERE item_kode='kondisi_trafo' AND kode='baik';
--      INSERT INTO pemeliharaan_gardu_periksa (pemeliharaan_id, item_kode, nilai)
--      VALUES ('...', 'kondisi_trafo', 'entah');
-- =============================================================================
