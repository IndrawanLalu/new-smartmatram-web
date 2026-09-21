-- =============================================================================
-- JTR: jenis stay, isian bersyarat, dan nama isian yang bisa diganti sendiri
-- Jalankan SESUDAH `jtr-temuan-datadriven.sql`. Idempoten.
--
-- Tiga hal, dan ketiganya satu tarikan karena menyentuh katalog isian yang sama:
--
--   1. JENIS STAY dihidupkan. Kolom `tiang.stay_jenis` sudah ada sejak awal dan
--      tidak pernah dipakai formulir — jadi selama ini yang tercatat cuma
--      kondisinya, tanpa ada yang tahu penopangnya berbentuk apa.
--
--   2. ISIAN BERSYARAT. Kondisi stay tidak masuk akal ditanyakan di tiang yang
--      memang tidak berskur, sama seperti kondisi jamperan di tiang tanpa
--      jamperan. Syaratnya disimpan sebagai DATA, meniru `jtm_item_ref`, supaya
--      bisa diubah dari halaman Pengaturan — bukan ditanam di kode aplikasi.
--
--   3. NAMA ISIAN BISA DIGANTI. "Stay" boleh jadi "Penopang" tanpa rilis apa
--      pun. Yang TETAP adalah `field` — itu kunci yang menyambungkan isian ini
--      dengan kolom database dan dengan kode aplikasi. Nama cuma yang dibaca
--      orang, dan tiap unit berhak menyebutnya dengan istilah yang dipakai
--      regunya sendiri.
-- =============================================================================

-- ── 1. Kategori pilihan baru: jenis stay ─────────────────────────────────────

ALTER TABLE public.jtr_ref DROP CONSTRAINT IF EXISTS jtr_ref_kategori_valid;
ALTER TABLE public.jtr_ref ADD CONSTRAINT jtr_ref_kategori_valid
  CHECK (kategori IN (
    'jenis_tiang', 'ukuran_tiang', 'kondisi_tiang',
    'jenis_kabel', 'ukuran_kabel', 'kondisi_kabel',
    'kondisi_aksesoris', 'kondisi_andongan', 'kondisi_arde',
    'jenis_stay', 'kondisi_stay',
    'jenis_jamperan', 'kondisi_jamperan', 'rawan_row'
  ));

-- Jenis penopang. Tidak ada yang temuan — bentuk skur bukan kerusakan; yang
-- dinilai rusak atau tidaknya ada di `kondisi_stay`.
INSERT INTO public.jtr_ref (kategori, kode, label, normal, urutan) VALUES
  ('jenis_stay', 'Ada',         'Ada',          true, 10),
  ('jenis_stay', 'Tidak Ada',   'Tidak Ada',    true, 20),
  ('jenis_stay', 'Treckschoer', 'Treckschoer',  true, 30),
  ('jenis_stay', 'Drugschoer',  'Drugschoer',   true, 40)
ON CONFLICT (kategori, kode) DO NOTHING;


-- ── 1b. Perbaiki penjaga yang tertinggal saat aksesoris pindah ke kabel ──────
--
-- ⚠ PEMBETULAN. `jtr-kabel-aksesoris.sql` memindahkan aks_* dari `tiang` ke
-- `tiang_konduktor` lalu membuang kolom lamanya — tapi `jaga_jtr_ref_terpakai`
-- (dibuat di `jtr-baik.sql`) masih membaca `tiang.aks_suspension`.
--
-- Kesalahannya tidak ketahuan saat itu juga, dan itu yang membuatnya berbahaya:
-- badan fungsi plpgsql baru diperiksa Postgres SAAT DIJALANKAN. Jadi skripnya
-- lolos, fungsinya tersimpan rapi, dan galat "column aks_suspension does not
-- exist" baru muncul berminggu-minggu kemudian — pada orang yang cuma sedang
-- menghapus satu pilihan, jauh dari tempat kesalahannya dibuat.
--
-- Definisi di bawah ini sekarang SATU-SATUNYA yang berlaku. `jtr-baik.sql`
-- memuat versi lamanya; menjalankan ulang berkas itu akan menurunkan penjaga
-- ini ke bentuk yang salah lagi, jadi kalau itu terpaksa dilakukan, berkas ini
-- harus dijalankan lagi sesudahnya.

CREATE OR REPLACE FUNCTION public.jaga_jtr_ref_terpakai()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE dipakai INT := 0;
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.jtr_item_ref i
    WHERE i.kategori = OLD.kategori AND i.nilai_bawaan = OLD.kode
  ) THEN
    RAISE EXCEPTION
      'Pilihan "%" sedang dipakai sebagai jawaban bawaan. Ganti bawaannya dulu.', OLD.label;
  END IF;

  dipakai := CASE OLD.kategori
    WHEN 'jenis_tiang'   THEN (SELECT count(*) FROM public.tiang WHERE jenis = OLD.kode)
    WHEN 'ukuran_tiang'  THEN (SELECT count(*) FROM public.tiang WHERE tinggi::text = OLD.kode)
    WHEN 'kondisi_tiang' THEN (SELECT count(*) FROM public.tiang WHERE kondisi = OLD.kode)
    WHEN 'jenis_kabel'   THEN (SELECT count(*) FROM public.tiang_konduktor WHERE jenis = OLD.kode)
    WHEN 'ukuran_kabel'  THEN (SELECT count(*) FROM public.tiang_konduktor WHERE ukuran = OLD.kode)
    WHEN 'kondisi_kabel' THEN (SELECT count(*) FROM public.tiang_konduktor WHERE kondisi = OLD.kode)
    -- Aksesoris kini di KABEL, bukan tiang. Inilah baris yang dulu patah.
    WHEN 'kondisi_aksesoris' THEN (
      SELECT count(*) FROM public.tiang_konduktor
      WHERE OLD.kode IN (COALESCE(aks_suspension, ''),
                         COALESCE(aks_large_angle, ''),
                         COALESCE(aks_dead_end, '')))
    WHEN 'kondisi_andongan' THEN (SELECT count(*) FROM public.tiang WHERE andongan = OLD.kode)
    WHEN 'kondisi_arde'     THEN (SELECT count(*) FROM public.tiang WHERE arde_kondisi = OLD.kode)
    WHEN 'jenis_stay'       THEN (SELECT count(*) FROM public.tiang WHERE stay_jenis = OLD.kode)
    WHEN 'kondisi_stay'     THEN (SELECT count(*) FROM public.tiang WHERE stay_kondisi = OLD.kode)
    WHEN 'jenis_jamperan'   THEN (
      SELECT count(*) FROM public.tiang t
      WHERE EXISTS (SELECT 1 FROM jsonb_array_elements(t.jamperan) j WHERE j->>'jenis' = OLD.kode))
    WHEN 'kondisi_jamperan' THEN (
      SELECT count(*) FROM public.tiang t
      WHERE EXISTS (SELECT 1 FROM jsonb_array_elements(t.jamperan) j WHERE j->>'kondisi' = OLD.kode))
    WHEN 'rawan_row' THEN (SELECT count(*) FROM public.tiang WHERE OLD.kode = ANY(rawan_row))
    ELSE 0
  END;

  IF dipakai > 0 THEN
    RAISE EXCEPTION
      'Pilihan "%" masih tercatat di % tiang. Nonaktifkan saja — menghapusnya membuat baris-baris itu menyimpan nilai yang tidak ada lagi daftarnya.',
      OLD.label, dipakai;
  END IF;

  RETURN OLD;
END $$;


-- ── 2. Kondisi stay: Baik / Putus / Rusak ────────────────────────────────────
-- Urutannya penting. Jawaban bawaan harus dipindahkan LEBIH DULU, karena
-- penjaga `jaga_jtr_bawaan` menolak bawaan yang menunjuk pilihan nonaktif —
-- dan kalau "Tidak Ada TUI" dinonaktifkan duluan, bawaannya terlanjur
-- menggantung pada pilihan yang sudah mati.

INSERT INTO public.jtr_ref (kategori, kode, label, normal, urutan) VALUES
  ('kondisi_stay', 'Putus', 'Putus', false, 15)
ON CONFLICT (kategori, kode) DO NOTHING;

UPDATE public.jtr_item_ref SET nilai_bawaan = 'Baik' WHERE field = 'stayKondisi';

-- "Tidak Ada TUI" pindah tempat: ketiadaan penopang sekarang dijawab di JENIS,
-- bukan di kondisi. Dinonaktifkan, bukan dihapus — tiga tiang sudah terlanjur
-- menyimpannya, dan menghapusnya akan membuat ketiga baris itu menyimpan nilai
-- yang tidak ada lagi daftarnya.
UPDATE public.jtr_ref SET aktif = false, updated_at = now()
  WHERE kategori = 'kondisi_stay' AND kode = 'Tidak Ada TUI';

-- Pilihan "treckschoer" sempat ditambahkan ke kondisi_stay — tempatnya
-- sebenarnya di JENIS, dan sekarang sudah ada di sana. Dihapus karena belum
-- ada satu tiang pun yang memakainya; penjaga di database sendiri yang akan
-- menolak kalau ternyata sudah terpakai.
DELETE FROM public.jtr_ref
  WHERE kategori = 'kondisi_stay' AND kode = 'treckschoer';


-- ── 3. Katalog: syarat kemunculan + nama yang bisa diganti ───────────────────
-- Bentuknya sama persis dengan `jtm_item_ref`, supaya dua modul ini tidak
-- berbeda cara berpikirnya tanpa alasan.

ALTER TABLE public.jtr_item_ref
  -- Isian ini hanya ditanyakan kalau jawaban `syarat_item` ada di `syarat_nilai`.
  ADD COLUMN IF NOT EXISTS syarat_item   TEXT REFERENCES public.jtr_item_ref(field) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS syarat_nilai  TEXT[] NOT NULL DEFAULT '{}',
  -- true = tampil kalau jawaban penentu BUKAN salah satu `syarat_nilai`.
  -- Dipakai di sini karena yang menyembunyikan isian justru SATU jawaban
  -- ("Tidak Ada"), sementara semua jawaban lain memunculkannya. Menulis
  -- daftar positifnya berarti harus menyuntingnya lagi tiap kali ada jenis
  -- penopang baru — dan itu pasti terlupa.
  ADD COLUMN IF NOT EXISTS syarat_negasi BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN public.jtr_item_ref.nama IS
  'Nama yang dibaca orang. BOLEH diganti dari halaman Pengaturan — "Stay" jadi "Penopang" tidak mengubah apa pun selain tulisannya. Yang tidak boleh berubah adalah `field`.';
COMMENT ON COLUMN public.jtr_item_ref.field IS
  'TETAP. Kunci yang menyambungkan isian ini dengan kolom database dan dengan kode aplikasi. Mengubahnya memutus keduanya tanpa ada yang memberi tahu.';


-- ── 4. Isian baru: jenis stay ────────────────────────────────────────────────
-- Ditaruh tepat sebelum kondisinya, karena dialah yang menentukan kondisinya
-- ditanyakan atau tidak — dan pertanyaan penentu harus selalu datang lebih dulu.

INSERT INTO public.jtr_item_ref
  (field, nama, kelompok, urutan, tipe, kategori, satuan, nilai_bawaan) VALUES
  ('stayJenis', 'Jenis stay', 'Andongan, arde, stay & ROW', 35,
   'pilihan', 'jenis_stay', NULL, 'Tidak Ada')
ON CONFLICT (field) DO NOTHING;


-- ── 5. Dua isian yang jadi bersyarat ─────────────────────────────────────────
-- Kondisi jamperan sebelumnya disembunyikan oleh aturan yang ditanam di kode
-- aplikasi. Dipindahkan ke sini supaya keduanya bekerja dengan cara yang sama,
-- dan supaya keduanya bisa diubah tanpa rilis.

UPDATE public.jtr_item_ref
SET syarat_item = 'stayJenis', syarat_nilai = ARRAY['Tidak Ada'], syarat_negasi = true
WHERE field = 'stayKondisi';

UPDATE public.jtr_item_ref
SET syarat_item = 'jamperanJenis', syarat_nilai = ARRAY['Tidak Ada'], syarat_negasi = true
WHERE field = 'jamperanKondisi';


-- ── 6. Rapikan data yang sudah ada ───────────────────────────────────────────
-- Tiang yang kondisinya tercatat "Tidak Ada TUI" sebenarnya sedang menyatakan
-- bahwa penopangnya TIDAK ADA. Pernyataan itu dipindahkan ke tempat barunya,
-- dan kolom kondisinya dikosongkan — bukan dibiarkan menyimpan jawaban untuk
-- pertanyaan yang tidak lagi ditanyakan padanya.

UPDATE public.tiang
SET stay_jenis = 'Tidak Ada', stay_kondisi = NULL, updated_at = now()
WHERE stay_kondisi = 'Tidak Ada TUI';


-- ── 7. Penjaga: syarat harus masuk akal ──────────────────────────────────────
-- Isian tidak boleh jadi syarat bagi dirinya sendiri — kalau itu terjadi, isian
-- tersebut tidak akan pernah muncul di layar, dan tidak ada satu pun pesan yang
-- menerangkan kenapa.

CREATE OR REPLACE FUNCTION public.jaga_jtr_syarat()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.syarat_item IS NULL THEN
    NEW.syarat_nilai := '{}';
    RETURN NEW;
  END IF;

  IF NEW.syarat_item = NEW.field THEN
    RAISE EXCEPTION 'Isian % tidak bisa jadi syarat bagi dirinya sendiri', NEW.field;
  END IF;

  IF array_length(NEW.syarat_nilai, 1) IS NULL THEN
    RAISE EXCEPTION
      'Syarat isian % menunjuk % tapi tidak menyebut jawaban mana pun', NEW.field, NEW.syarat_item;
  END IF;

  -- Penentunya harus datang lebih dulu di layar. Kalau tidak, syaratnya dinilai
  -- dari jawaban yang belum sempat ditanyakan.
  IF EXISTS (
    SELECT 1 FROM public.jtr_item_ref p
    WHERE p.field = NEW.syarat_item
      AND (p.kelompok, p.urutan) > (NEW.kelompok, NEW.urutan)
  ) THEN
    RAISE EXCEPTION
      'Isian penentu % muncul SESUDAH %. Tukar urutannya, kalau tidak syaratnya dinilai dari jawaban yang belum ditanyakan.',
      NEW.syarat_item, NEW.field;
  END IF;

  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_jaga_jtr_syarat ON public.jtr_item_ref;
CREATE TRIGGER trg_jaga_jtr_syarat
  BEFORE INSERT OR UPDATE OF syarat_item, syarat_nilai, urutan, kelompok
  ON public.jtr_item_ref
  FOR EACH ROW EXECUTE FUNCTION public.jaga_jtr_syarat();


-- ── 8. Hak akses ─────────────────────────────────────────────────────────────
-- `nama`, `urutan`, dan `aktif` kini disunting dari web, jadi UPDATE sudah
-- cukup — INSERT dan DELETE tetap tertutup: menambah isian berarti menambah
-- kolom, dan itu tidak bisa dikerjakan dari halaman pengaturan.

GRANT SELECT, UPDATE ON public.jtr_item_ref TO authenticated;


-- =============================================================================
-- Periksa hasilnya
-- =============================================================================
-- a. Isian stay sekarang dua, dan kondisinya bersyarat:
--      SELECT field, nama, urutan, nilai_bawaan, syarat_item, syarat_nilai, syarat_negasi
--      FROM jtr_item_ref WHERE field LIKE 'stay%' ORDER BY urutan;
--
-- b. Pilihan jenis stay:
--      SELECT kode, label, normal FROM jtr_ref WHERE kategori = 'jenis_stay' ORDER BY urutan;
--
-- c. Kondisi stay — "Tidak Ada TUI" harus nonaktif, "Putus" harus ada:
--      SELECT kode, label, normal, aktif FROM jtr_ref
--      WHERE kategori = 'kondisi_stay' ORDER BY urutan;
--
-- d. Data lama sudah pindah — harus 0 baris:
--      SELECT count(*) FROM tiang WHERE stay_kondisi = 'Tidak Ada TUI';
--
-- e. Coba ganti namanya, dan pastikan tidak ada yang lain ikut berubah:
--      UPDATE jtr_item_ref SET nama = 'Penopang' WHERE field = 'stayJenis';
-- =============================================================================
