-- scripts/jtm-normal.sql
--
-- "TIANG NORMAL": satu ketukan mengisi seluruh formulir dengan jawaban bawaan.
--
-- Kebanyakan tiang memang normal dan bentuknya sama. Memaksa petugas memilih
-- ulang dua belas jawaban yang itu-itu juga untuk tiap tiang bukan ketelitian,
-- melainkan cara paling pasti membuat orang berhenti menyapu di tiang ke-limapuluh.
--
-- KENAPA TIDAK MEMAKAI `jtm_opsi_ref.normal` SAJA — ini inti berkas ini.
-- `normal` menjawab "apakah jawaban ini sebuah temuan", dan satu item boleh
-- punya banyak jawaban yang sama-sama bukan temuan: tiang beton 9 m normal,
-- besi 11 m juga normal, konstruksi A1 sampai A4 semuanya normal. Dari situ
-- tidak bisa disimpulkan mana yang HARUS diisikan sebagai bawaan — itu
-- keputusan orang yang tahu tiang di wilayahnya kebanyakan bentuknya apa.
--
-- Karena itu jawaban bawaan disimpan terpisah, satu per item, dan diatur dari
-- halaman Pengaturan. Item yang bawaannya kosong dilewati — tetap diisi tangan.
--
-- Prasyarat: jtm-acuan.sql
-- Aman dijalankan berulang.

ALTER TABLE public.jtm_item_ref
  ADD COLUMN IF NOT EXISTS nilai_bawaan TEXT;

COMMENT ON COLUMN public.jtm_item_ref.nilai_bawaan IS
  'Jawaban yang diisikan tombol "Tiang normal". BUKAN sama dengan jtm_opsi_ref.normal: normal = bukan temuan (boleh banyak), bawaan = jawaban yang paling sering benar (hanya satu). NULL = tidak ikut terisi otomatis.';


-- ── Penjaga: bawaan harus jawaban yang benar-benar ada ───────────────────────
-- Tanpa ini, satu salah ketik di pengaturan akan mengisi ratusan tiang dengan
-- nilai yang tidak dikenal item-nya, dan `nilai_tiang_jtm` baru menolaknya satu
-- per satu di lapangan — jauh dari tempat kesalahan itu dibuat.

CREATE OR REPLACE FUNCTION public.jaga_jtm_bawaan()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.nilai_bawaan IS NULL OR btrim(NEW.nilai_bawaan) = '' THEN
    NEW.nilai_bawaan := NULL;
    RETURN NEW;
  END IF;

  IF NEW.tipe = 'pilihan' THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.jtm_opsi_ref o
      WHERE o.item_kode = NEW.kode AND o.kode = NEW.nilai_bawaan AND o.aktif
    ) THEN
      RAISE EXCEPTION
        'Jawaban bawaan "%" bukan pilihan aktif milik item %', NEW.nilai_bawaan, NEW.kode;
    END IF;
  END IF;

  IF NEW.tipe = 'angka' AND NEW.nilai_bawaan !~ '^-?[0-9]+([.,][0-9]+)?$' THEN
    RAISE EXCEPTION 'Jawaban bawaan item % harus berupa angka, bukan "%"',
      NEW.kode, NEW.nilai_bawaan;
  END IF;

  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_jaga_jtm_bawaan ON public.jtm_item_ref;
CREATE TRIGGER trg_jaga_jtm_bawaan
  BEFORE INSERT OR UPDATE OF nilai_bawaan, tipe ON public.jtm_item_ref
  FOR EACH ROW EXECUTE FUNCTION public.jaga_jtm_bawaan();


-- Pilihan yang sedang dipakai sebagai bawaan tidak boleh hilang diam-diam:
-- kalau hilang, tombol "Tiang normal" berhenti mengisi item itu tanpa ada yang
-- memberi tahu siapa pun.
CREATE OR REPLACE FUNCTION public.jaga_jtm_opsi_terpakai()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.jtm_item_ref i
    WHERE i.kode = OLD.item_kode AND i.nilai_bawaan = OLD.kode
  ) THEN
    RAISE EXCEPTION
      'Pilihan "%" sedang dipakai sebagai jawaban bawaan item %. Ganti bawaannya dulu.',
      OLD.label, OLD.item_kode;
  END IF;
  RETURN OLD;
END $$;

DROP TRIGGER IF EXISTS trg_jaga_jtm_opsi_terpakai ON public.jtm_opsi_ref;
CREATE TRIGGER trg_jaga_jtm_opsi_terpakai
  BEFORE DELETE ON public.jtm_opsi_ref
  FOR EACH ROW EXECUTE FUNCTION public.jaga_jtm_opsi_terpakai();


-- ── Isian awal ───────────────────────────────────────────────────────────────
-- Hanya untuk item yang jawabannya TIDAK MENDUA: kalau sebuah item cuma punya
-- satu pilihan yang bukan temuan, pilihan itulah bawaannya, tidak ada yang
-- perlu diputuskan. Item seperti `jenis_tiang` dan `konstruksi` — yang punya
-- banyak pilihan normal — sengaja dibiarkan kosong supaya admin sendiri yang
-- menetapkan tiang yang lazim di wilayahnya.
--
-- Hanya mengisi yang masih kosong, jadi setelan yang sudah diubah orang tidak
-- pernah tertimpa saat skrip ini dijalankan lagi.

WITH tunggal AS (
  SELECT o.item_kode, min(o.kode) AS kode
  FROM public.jtm_opsi_ref o
  WHERE o.normal AND o.aktif
  GROUP BY o.item_kode
  HAVING count(*) = 1
)
UPDATE public.jtm_item_ref i
SET nilai_bawaan = t.kode, updated_at = now()
FROM tunggal t
WHERE i.kode = t.item_kode
  AND i.tipe = 'pilihan'
  AND i.nilai_bawaan IS NULL;
