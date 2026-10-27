-- =============================================================================
-- Batas penelusuran rantai induk tiang 500 → 20.000 langkah (27 Okt 2026)
-- Idempoten — aman dijalankan ulang.
--
-- Masalah: tiang sesudah MSR-183R311 (MVTIC SHERATON) ditolak "Rantai induk
-- terlalu dalam — kemungkinan besar melingkar". Tidak melingkar: rantainya
-- naik tepat 500 tiang lewat penyulang lain sampai PRM-001. Penjaga
-- `tiang_cegah_lingkaran` menganggap >500 langkah pasti melingkar.
--
-- Lingkaran sungguhan tetap ditangkap seperti biasa (penelusuran kembali ke
-- tiang itu sendiri); batas ini hanya pengaman agar tidak berputar selamanya.
--
-- Fungsi yang diubah (keputusan user: sekalian semua):
--   tiang_cegah_lingkaran    — penjaga yang MENOLAK (penyebab masalah)
--   ubah_induk_tiang_jtm     — cek lingkaran saat ganti induk / menumpang
--   jtm_kode_penyulang_baru  — penamaan tiang
--   tiang_buat_kode_jtm      — penamaan tiang saat disimpan
--   jtm_leluhur_di_penyulang — leluhur terdekat di penyulang yang sama
--
-- Caranya: definisi yang SEDANG HIDUP di database dibaca lalu hanya angka
-- batasnya diganti — tidak menimpa fungsi dengan salinan lama dari berkas
-- skrip (beberapa fungsi ini sudah diperbarui oleh berkas-berkas sesudahnya).
-- Hak akses (GRANT) tetap, karena CREATE OR REPLACE mempertahankannya.
-- =============================================================================

DO $$
DECLARE
  f RECORD;
  def TEXT;
  baru TEXT;
  diubah INT := 0;
BEGIN
  FOR f IN
    SELECT p.oid, p.proname
    FROM pg_proc p JOIN pg_namespace ns ON ns.oid = p.pronamespace
    WHERE ns.nspname = 'public'
      AND p.proname IN ('tiang_cegah_lingkaran', 'ubah_induk_tiang_jtm', 'jtm_kode_penyulang_baru',
                        'tiang_buat_kode_jtm', 'jtm_leluhur_di_penyulang')
  LOOP
    def := pg_get_functiondef(f.oid);
    baru := regexp_replace(def, '\m(n|langkah) ([<>]) 500\M', '\1 \2 20000', 'g');
    IF baru <> def THEN
      EXECUTE baru;
      diubah := diubah + 1;
      RAISE NOTICE 'Batas dinaikkan: %', f.proname;
    ELSE
      RAISE NOTICE 'Tidak ada batas 500 (sudah diubah?): %', f.proname;
    END IF;
  END LOOP;
  RAISE NOTICE '% fungsi diubah.', diubah;
END $$;


-- ── Sesudah dijalankan ───────────────────────────────────────────────────────
-- Harus kosong (tidak ada lagi batas 500 di fungsi-fungsi itu):
--   SELECT p.proname FROM pg_proc p JOIN pg_namespace ns ON ns.oid = p.pronamespace
--   WHERE ns.nspname = 'public' AND p.prosrc ~ '\m(n|langkah) [<>] 500\M';
-- Lalu di HP: ketuk tiang yang ditolak → "Coba kirim lagi".
