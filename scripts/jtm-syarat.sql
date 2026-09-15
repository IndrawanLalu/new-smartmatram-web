-- scripts/jtm-syarat.sql
--
-- ITEM YANG HANYA MUNCUL KALAU KOMPONENNYA MEMANG ADA.
--
-- Arrester, FCO, skur, pentanahan, keypoint, gardu, jumperan — tidak satu pun
-- ada di setiap tiang. Menanyakan "kondisi arrester" di tiang yang tidak punya
-- arrester bukan cuma membuang ketukan: petugas akhirnya mengisi apa saja
-- supaya isian wajibnya lengkap, dan sejak itu laporan kondisi arrester berisi
-- tiang-tiang yang arresternya tidak pernah ada.
--
-- SYARATNYA DATA, BUKAN KODE. Kalau ditulis di aplikasi, tiap kali ada komponen
-- baru yang tidak selalu ada, regu harus menunggu rilis. Dua kolom di bawah ini
-- membuatnya cukup satu baris UPDATE.
--
-- Prasyarat: jtm-acuan.sql · jtm-normal.sql
-- Aman dijalankan berulang.

ALTER TABLE public.jtm_item_ref
  ADD COLUMN IF NOT EXISTS syarat_item  TEXT,
  ADD COLUMN IF NOT EXISTS syarat_nilai TEXT[];

COMMENT ON COLUMN public.jtm_item_ref.syarat_item IS
  'Item penentu. Item ini hanya ditanyakan kalau jawaban item penentu ada di syarat_nilai. NULL = selalu ditanyakan.';
COMMENT ON COLUMN public.jtm_item_ref.syarat_nilai IS
  'Jawaban item penentu yang memunculkan item ini. Kosong/NULL bersama syarat_item = selalu ditanyakan.';


-- ── Penjaga ──────────────────────────────────────────────────────────────────
-- Syarat yang menunjuk item tidak ada, atau nilai yang bukan pilihan item itu,
-- akan menyembunyikan isian SELAMANYA tanpa ada yang tahu kenapa. Ditolak di
-- sini, bukan ditemukan enam bulan lagi sebagai kolom yang selalu kosong.

CREATE OR REPLACE FUNCTION public.jaga_jtm_syarat()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  penentu public.jtm_item_ref%ROWTYPE;
  v TEXT;
BEGIN
  IF NEW.syarat_item IS NULL OR btrim(NEW.syarat_item) = '' THEN
    NEW.syarat_item := NULL;
    NEW.syarat_nilai := NULL;
    RETURN NEW;
  END IF;

  IF NEW.syarat_item = NEW.kode THEN
    RAISE EXCEPTION 'Item % tidak bisa jadi syarat bagi dirinya sendiri', NEW.kode;
  END IF;

  SELECT * INTO penentu FROM public.jtm_item_ref WHERE kode = NEW.syarat_item;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Item penentu "%" tidak ada', NEW.syarat_item;
  END IF;
  IF penentu.tipe <> 'pilihan' THEN
    RAISE EXCEPTION 'Item penentu % harus bertipe pilihan, bukan %',
      penentu.kode, penentu.tipe;
  END IF;

  -- Syarat bertingkat dilarang: begitu A menentukan B dan B menentukan C, tidak
  -- ada lagi yang bisa membaca formulirnya tanpa menjalankannya di kepala.
  IF penentu.syarat_item IS NOT NULL THEN
    RAISE EXCEPTION
      'Item % sudah punya syarat sendiri — syarat bertingkat tidak diizinkan', penentu.kode;
  END IF;

  IF NEW.syarat_nilai IS NULL OR array_length(NEW.syarat_nilai, 1) IS NULL THEN
    RAISE EXCEPTION 'Sebutkan jawaban % yang memunculkan item %', penentu.kode, NEW.kode;
  END IF;

  FOREACH v IN ARRAY NEW.syarat_nilai LOOP
    IF NOT EXISTS (
      SELECT 1 FROM public.jtm_opsi_ref o WHERE o.item_kode = penentu.kode AND o.kode = v
    ) THEN
      RAISE EXCEPTION 'Jawaban "%" bukan pilihan milik item %', v, penentu.kode;
    END IF;
  END LOOP;

  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_jaga_jtm_syarat ON public.jtm_item_ref;
CREATE TRIGGER trg_jaga_jtm_syarat
  BEFORE INSERT OR UPDATE OF syarat_item, syarat_nilai ON public.jtm_item_ref
  FOR EACH ROW EXECUTE FUNCTION public.jaga_jtm_syarat();


-- ── Dua komponen yang belum punya penentu ────────────────────────────────────
-- FCO, arrester, skur, pentanahan dan keypoint sudah punya item "ada/tidak"
-- sejak awal. Jumperan dan gardu belum — padahal keduanya justru yang paling
-- jarang ada: jumperan hanya di belokan dan percabangan, gardu hanya di tiang
-- yang memikulnya.

INSERT INTO public.jtm_item_ref
  (kode, nama, kelompok, dimensi, tipe, satuan, tier, milik, urutan, tampil_dashboard)
VALUES
  ('jumperan', 'Ada jumperan?', 'Sambungan', 'tunggal', 'pilihan', NULL, '12', 'tiang', 49, false),
  ('gardu',    'Gardu di tiang ini', 'Gardu', 'tunggal', 'pilihan', NULL, '12', 'tiang', 95, false),
  ('nomor_gardu', 'Nomor gardu', 'Gardu', 'tunggal', 'teks', NULL, '12', 'tiang', 96, false)
ON CONFLICT (kode) DO NOTHING;

INSERT INTO public.jtm_opsi_ref (item_kode, kode, label, normal, urutan) VALUES
  ('jumperan', 'tidak', 'Tidak ada', true,  10),
  ('jumperan', 'ada',   'Ada',       true,  20),
  ('gardu', 'tidak_ada', 'Tidak ada', true, 10),
  ('gardu', 'cantol',    'Cantol',    true, 20),
  ('gardu', 'portal',    'Portal',    true, 30),
  ('gardu', 'beton',     'Beton',     true, 40)
ON CONFLICT (item_kode, kode) DO NOTHING;

-- Bawaan dua item ini jelas tanpa perlu diputuskan admin: yang paling sering
-- benar memang "tidak ada".
UPDATE public.jtm_item_ref SET nilai_bawaan = 'tidak',     updated_at = now()
  WHERE kode = 'jumperan' AND nilai_bawaan IS NULL;
UPDATE public.jtm_item_ref SET nilai_bawaan = 'tidak_ada', updated_at = now()
  WHERE kode = 'gardu'    AND nilai_bawaan IS NULL;


-- ── Syaratnya ────────────────────────────────────────────────────────────────
-- Ditulis ulang tiap kali skrip dijalankan: daftar ini kecil, dan menyamakannya
-- lebih aman daripada menebak mana yang sudah berubah di tangan admin.

UPDATE public.jtm_item_ref SET syarat_item = 'jumperan', syarat_nilai = ARRAY['ada']
  WHERE kode IN ('kondisi_jumperan', 'jenis_sambungan', 'suhu_sambungan');

UPDATE public.jtm_item_ref SET syarat_item = 'arrester', syarat_nilai = ARRAY['ada']
  WHERE kode = 'kondisi_arrester';

UPDATE public.jtm_item_ref SET syarat_item = 'fco', syarat_nilai = ARRAY['ada']
  WHERE kode = 'kondisi_fco';

UPDATE public.jtm_item_ref SET syarat_item = 'pentanahan', syarat_nilai = ARRAY['ada']
  WHERE kode IN ('kondisi_kawat_tanah', 'nilai_pentanahan');

UPDATE public.jtm_item_ref SET syarat_item = 'skur', syarat_nilai = ARRAY['ada']
  WHERE kode = 'kondisi_skur';

-- Keypoint: apa pun selain 'tidak_ada' berarti ada peralatannya.
UPDATE public.jtm_item_ref
SET syarat_item = 'peralatan_hubung', syarat_nilai = ARRAY['lbs', 'rec', 'fco_seksi', 'abs']
  WHERE kode IN ('kondisi_peralatan', 'nomor_peralatan');

UPDATE public.jtm_item_ref
SET syarat_item = 'gardu', syarat_nilai = ARRAY['cantol', 'portal', 'beton']
  WHERE kode = 'nomor_gardu';
