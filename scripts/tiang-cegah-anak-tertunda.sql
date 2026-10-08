-- =============================================================================
-- Penjaga "anak menggantung" diperiksa di AKHIR transaksi (8 Okt 2026)
-- =============================================================================
-- `tiang_cegah_anak_menggantung` (jtr-schema.sql) memeriksa per baris SEBELUM
-- diubah: tiang tidak boleh dibatalkan selama masih ada anak aktif. Benar
-- untuk satu tiang, tapi MENOLAK pembatalan satu rantai sekaligus — dalam satu
-- UPDATE, induk sering diproses lebih dulu daripada anaknya. Akibatnya
-- `_ulangi_inspeksi_inti` dan `_batalkan_segmen_inti` (jtm-batal-hp.sql) gagal
-- untuk setiap rantai ≥ 2 tiang: "Tiang X masih menyuplai 1 tiang aktif".
-- Di data nyata "ulangi inspeksi" belum pernah berhasil sekali pun, dan batal
-- segmen hanya berhasil untuk segmen satu tiang. Tombol "Batalkan inspeksi +
-- N tiang" di web (8 Okt) memakai fungsi yang sama.
--
-- Perbaikan: aturannya SAMA, waktunya digeser — CONSTRAINT TRIGGER yang
-- ditunda sampai COMMIT. Rantai yang dibatalkan bersama lolos; tiang yang
-- meninggalkan anak aktif tetap ditolak dengan pesan yang sama (seluruh
-- transaksi batal). Diuji PGlite: rantai sekaligus OK, induk saja ditolak,
-- rantai dengan anak lain tertinggal ditolak, anak dipindah dalam transaksi OK.
--
-- Jalankan di Supabase SQL Editor. Idempoten. Tanpa perubahan data.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.tiang_cegah_anak_menggantung()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  jml INT;
BEGIN
  IF NEW.status_hidup = 'aktif' OR OLD.status_hidup <> 'aktif' THEN
    RETURN NULL;
  END IF;
  -- Ditunda: yang dinilai keadaan baris SAAT COMMIT, bukan saat diubah.
  IF EXISTS (SELECT 1 FROM public.tiang WHERE id = NEW.id AND status_hidup = 'aktif') THEN
    RETURN NULL;
  END IF;

  SELECT count(*) INTO jml
  FROM public.tiang
  WHERE induk_id = NEW.id AND status_hidup = 'aktif';

  IF jml > 0 THEN
    RAISE EXCEPTION
      'Tiang % masih menyuplai % tiang aktif. Pindahkan dulu anak-anaknya ke induk lain.',
      NEW.kode, jml;
  END IF;

  RETURN NULL;
END $$;

DROP TRIGGER IF EXISTS trg_tiang_cegah_anak_menggantung ON public.tiang;
CREATE CONSTRAINT TRIGGER trg_tiang_cegah_anak_menggantung
  AFTER UPDATE OF status_hidup ON public.tiang
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION public.tiang_cegah_anak_menggantung();
