-- scripts/jtm-master.sql
--
-- JAWABAN INSPEKSI MENGOREKSI MASTER, BUKAN CUMA JADI SEJARAH.
--
-- Dilaporkan dari lapangan, tiga keluhan yang ternyata satu sebab:
--
--   "PRM-002 ditandai sebagai Gardu, tapi simbolnya tidak berubah"
--   "jenis belum dicatat — ini maksudnya apa?"
--   "ukuran penghantar belum ada di mobile"
--
-- Diperiksa ke basis data: `PRM-002.penanda` NULL dan `PRM-002.jenis` NULL —
-- padahal regu SUDAH menjawab `jenis_tiang = beton_11` dan menandai gardunya.
-- Jawabannya tersimpan rapi di `inspeksi_jtm_periksa` dan berhenti di situ.
--
-- Itu bukan cuma tampilan yang keliru. Peta memakai `tiang.penanda` untuk
-- memilih ikon, jadi tiang yang memikul gardu tetap digambar seperti tiang
-- biasa — dan regu yang menandainya di lapangan melihat kerjanya seolah tidak
-- terjadi. Aplikasi yang membuat orang merasa pekerjaannya diabaikan akan
-- berhenti diisi dengan sungguh-sungguh.
--
-- Arahnya sama dengan HARGARDU: catatan pemeliharaan adalah SEJARAH, dan yang
-- dikoreksi olehnya adalah MASTERNYA.
--
-- Prasyarat: jtm-temuan.sql · jtm-nama.sql
-- Aman dijalankan berulang.


-- ── 1. Item mana yang mengoreksi kolom master mana ───────────────────────────
-- Data, bukan kode: item berikutnya yang ternyata fakta master cukup satu baris
-- UPDATE, tidak menunggu rilis.

ALTER TABLE public.jtm_item_ref
  ADD COLUMN IF NOT EXISTS master_field TEXT;

ALTER TABLE public.jtm_item_ref DROP CONSTRAINT IF EXISTS jtm_item_master_field_valid;
ALTER TABLE public.jtm_item_ref ADD CONSTRAINT jtm_item_master_field_valid
  CHECK (master_field IS NULL OR master_field IN ('jenis', 'konstruksi', 'penanda'));

COMMENT ON COLUMN public.jtm_item_ref.master_field IS
  'Kolom `tiang` yang dikoreksi jawaban item ini. NULL = jawabannya murni catatan keadaan, tidak menyentuh master.';


-- ── 2. Ukuran penghantar ─────────────────────────────────────────────────────
-- Belum pernah ada. Daftarnya sudah lama tersedia di Pengaturan JTM (kategori
-- `ukuran`), jadi tinggal disambungkan lewat `sumber_opsi` — tidak ada daftar
-- kedua yang harus dijaga tetap sama.

INSERT INTO public.jtm_item_ref
  (kode, nama, kelompok, dimensi, tipe, satuan, tier, milik, urutan, tampil_dashboard, sumber_opsi)
VALUES
  ('ukuran_konduktor', 'Ukuran Konduktor', 'Konduktor', 'sirkit', 'pilihan',
   'mm²', '12', 'sirkit', 41, false, 'ukuran')
ON CONFLICT (kode) DO UPDATE SET sumber_opsi = 'ukuran';

-- Digeser supaya ukuran berdiri tepat di bawah jenisnya — regu membaca kolom
-- ini berurutan, dan dua hal tentang benda yang sama tidak boleh terpisah.
UPDATE public.jtm_item_ref SET urutan = 42 WHERE kode = 'kondisi_konduktor';
UPDATE public.jtm_item_ref SET urutan = 43 WHERE kode = 'andongan';

SELECT public.jtm_selaraskan_opsi('ukuran');


-- ── 3. Item yang mengoreksi master ───────────────────────────────────────────

UPDATE public.jtm_item_ref SET master_field = 'jenis'      WHERE kode = 'jenis_tiang';
UPDATE public.jtm_item_ref SET master_field = 'konstruksi' WHERE kode = 'konstruksi';
UPDATE public.jtm_item_ref SET master_field = 'penanda'    WHERE kode IN ('peralatan_hubung', 'gardu');


-- ── 4. Mengalirkan jawaban ke master ─────────────────────────────────────────
-- Dipasang sebagai pemicu di tabel jawaban, BUKAN ditambahkan ke
-- `nilai_tiang_jtm`. Fungsi itu sudah panjang dan sudah digantikan dua kali;
-- menyalinnya lagi cuma untuk menempel belasan baris berarti empat salinan
-- aturan penilaian yang harus selalu sama.

CREATE OR REPLACE FUNCTION public.jtm_koreksi_master()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  it       RECORD;
  v_tiang  UUID;
  v_label  TEXT;
  v_kini   TEXT;
  v_gardu  TEXT;
BEGIN
  IF NEW.nilai IS NULL THEN RETURN NEW; END IF;

  SELECT kode, master_field INTO it
  FROM public.jtm_item_ref WHERE kode = NEW.item_kode;
  IF it.master_field IS NULL THEN RETURN NEW; END IF;

  SELECT tiang_id INTO v_tiang
  FROM public.inspeksi_jtm_titik WHERE id = NEW.titik_id;
  IF v_tiang IS NULL THEN RETURN NEW; END IF;

  SELECT label INTO v_label
  FROM public.jtm_opsi_ref
  WHERE item_kode = NEW.item_kode AND kode = NEW.nilai;

  IF it.master_field = 'jenis' THEN
    UPDATE public.tiang SET jenis = COALESCE(v_label, NEW.nilai), updated_at = now()
    WHERE id = v_tiang;

  ELSIF it.master_field = 'konstruksi' THEN
    UPDATE public.tiang SET konstruksi = COALESCE(v_label, NEW.nilai), updated_at = now()
    WHERE id = v_tiang;

  ELSIF it.master_field = 'penanda' THEN
    SELECT penanda INTO v_kini FROM public.tiang WHERE id = v_tiang;

    IF it.kode = 'peralatan_hubung' THEN
      -- Peralatan hubung MENANG atas gardu kalau tiangnya memikul keduanya:
      -- dialah yang menentukan bagian mana padam saat dibuka, dan itu
      -- pertanyaan yang lebih sering dibawa orang ke peta.
      IF NEW.nilai = 'tidak_ada' THEN
        -- Peralatan hubungnya dicabut, tapi gardunya belum tentu ikut hilang.
        -- Dikembalikan ke penanda gardu kalau tiang ini memang masih memikul
        -- satu — kalau tidak, tiang yang kehilangan LBS-nya ikut kehilangan
        -- tanda gardunya, dan itu tidak pernah diminta siapa pun.
        SELECT p2.nilai INTO v_gardu
        FROM public.inspeksi_jtm_periksa p2
        JOIN public.inspeksi_jtm_titik tk2 ON tk2.id = p2.titik_id
        WHERE tk2.tiang_id = v_tiang AND p2.item_kode = 'gardu' AND p2.nilai IS NOT NULL
        ORDER BY p2.updated_at DESC
        LIMIT 1;

        UPDATE public.tiang
        SET penanda = CASE WHEN COALESCE(v_gardu, 'tidak_ada') <> 'tidak_ada'
                           THEN 'gardu' ELSE NULL END,
            updated_at = now()
        WHERE id = v_tiang;
      ELSIF EXISTS (
        SELECT 1 FROM public.jtm_ref
        WHERE kategori = 'penanda' AND kode = NEW.nilai AND aktif
      ) THEN
        UPDATE public.tiang SET penanda = NEW.nilai, updated_at = now() WHERE id = v_tiang;
      END IF;

    ELSIF it.kode = 'gardu' THEN
      IF NEW.nilai = 'tidak_ada' THEN
        IF v_kini = 'gardu' THEN
          UPDATE public.tiang SET penanda = NULL, updated_at = now() WHERE id = v_tiang;
        END IF;
      ELSIF v_kini IS NULL OR v_kini = 'gardu' THEN
        UPDATE public.tiang SET penanda = 'gardu', updated_at = now() WHERE id = v_tiang;
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_jtm_koreksi_master ON public.inspeksi_jtm_periksa;
CREATE TRIGGER trg_jtm_koreksi_master
  AFTER INSERT OR UPDATE OF nilai ON public.inspeksi_jtm_periksa
  FOR EACH ROW EXECUTE FUNCTION public.jtm_koreksi_master();

COMMENT ON FUNCTION public.jtm_koreksi_master IS
  'Mengalirkan jawaban yang bersifat FAKTA (jenis tiang, konstruksi, penanda) ke master tiang. Jawaban yang bersifat KEADAAN tidak lewat sini — dia sejarah, bukan master.';


-- ── 5. Menyusulkan yang sudah terlanjur dijawab ──────────────────────────────
-- Jawaban yang masuk sebelum berkas ini ada tidak akan pernah menyentuh master
-- kalau tidak disusulkan di sini. Diambil yang TERAKHIR per tiang.

DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN
    SELECT DISTINCT ON (tk.tiang_id, p.item_kode)
           p.id, p.titik_id, p.item_kode, p.nilai
    FROM public.inspeksi_jtm_periksa p
    JOIN public.inspeksi_jtm_titik tk ON tk.id = p.titik_id
    JOIN public.jtm_item_ref i ON i.kode = p.item_kode AND i.master_field IS NOT NULL
    WHERE p.nilai IS NOT NULL
    ORDER BY tk.tiang_id, p.item_kode, p.updated_at DESC
  LOOP
    -- Disentuh lewat UPDATE supaya pemicunya sendiri yang mengerjakan — satu
    -- aturan, satu tempat.
    UPDATE public.inspeksi_jtm_periksa SET nilai = r.nilai WHERE id = r.id;
  END LOOP;
END $$;


GRANT EXECUTE ON FUNCTION public.jtm_koreksi_master TO authenticated;
