-- =============================================================================
-- Perbaikan 9 Nov 2026: "Gardu NM059 belum punya satu tiang pun" padahal HP
-- mengirim 81 tiang.
--
-- Penyebab: jtr-panjang-simpan.sql membuat inspeksi_jtr_kelengkapan.tiang_aktif
-- membaca simpanan (disegarkan pg_cron tiap menit). HP mengirim tiang DAN
-- menutup inspeksi dalam SATU RPC (kirim_tiang_jtr) — saat pemicu "Selesai"
-- memeriksa, tiang baru belum masuk simpanan → 0 → ditolak → seluruh kiriman
-- dibatalkan. Draf di HP tetap utuh; cukup kirim ulang sesudah skrip ini.
--
-- Perbaikan: pemicu menghitung tiang LANGSUNG dari jtr_tiang (aturan sama
-- dengan kelengkapan sebelum 9 Nov). View kelengkapan untuk daftar tetap
-- membaca simpanan — terlambat paling lama semenit, tidak menolak apa pun.
-- Idempoten.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.inspeksi_jtr_cegah_selesai_separuh()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  v_aktif BIGINT;
  v_diperiksa BIGINT;
BEGIN
  IF NEW.status <> 'Selesai' OR OLD.status = 'Selesai' THEN
    RETURN NEW;
  END IF;

  -- Langsung, bukan dari simpanan: tiang yang dikirim di transaksi yang sama
  -- harus ikut terhitung.
  SELECT count(*) INTO v_aktif
  FROM public.jtr_tiang t
  WHERE upper(t.gardu_kode) = upper(NEW.gardu_kode)
    AND upper(t.ulp) = upper(NEW.ulp)
    AND t.status_hidup = 'aktif';

  SELECT count(*) INTO v_diperiksa
  FROM public.inspeksi_jtr_titik x
  WHERE x.inspeksi_id = NEW.id AND x.tiang_id IS NOT NULL;

  IF v_aktif = 0 THEN
    RAISE EXCEPTION
      'Gardu % belum punya satu tiang pun. Titik jaringannya dulu sebelum menyatakan selesai.',
      NEW.gardu_kode;
  END IF;

  IF v_diperiksa < v_aktif THEN
    RAISE EXCEPTION
      'Penyapuan belum tuntas: % dari % tiang aktif belum dinilai.',
      v_aktif - v_diperiksa, v_aktif;
  END IF;

  RETURN NEW;
END $$;
