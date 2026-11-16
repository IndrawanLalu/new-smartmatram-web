-- =============================================================================
-- "Tiang normal" JTM hanya diubah UP3 (16 Nov 2026, keputusan user). Idempoten.
--
-- Jawaban bawaan tombol "Tiang normal" (`jtm_item_ref.nilai_bawaan`) SATU untuk
-- semua ULP — HP AMPENAN, CAKRANEGARA, GERUNG, TANJUNG membaca kolom yang sama.
-- Sebelumnya setiap akun yang masuk boleh mengubahnya (RLS `auth_all_*`), jadi
-- admin satu ULP bisa mengubah isian HP ULP lain tanpa jejak.
--
-- Sekarang:
--   • mengubah `nilai_bawaan` dari aplikasi hanya untuk akun ber-role UP3;
--     akun lain ditolak dengan pesan yang jelas;
--   • setiap perubahan dicatat di `jtm_ref_audit` (tabel = 'bawaan' — BUKAN
--     'item', supaya skrip benih jtm-acuan.sql tetap memperbarui item itu);
--   • SQL Editor / skrip (tanpa sesi aplikasi, auth.uid() NULL) tidak dihalangi.
-- Kolom lain di jtm_item_ref (Isian & pilihan) TIDAK berubah aturannya.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.jaga_jtm_bawaan_up3()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_role TEXT;
  v_nama TEXT;
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.nilai_bawaan IS NOT DISTINCT FROM OLD.nilai_bawaan THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'INSERT' AND NEW.nilai_bawaan IS NULL THEN
    RETURN NEW;
  END IF;
  IF auth.uid() IS NULL THEN
    RETURN NEW;  -- SQL Editor / skrip
  END IF;

  SELECT role, NULLIF(btrim(name), '') INTO v_role, v_nama
  FROM public.user_roles WHERE user_id = auth.uid();
  IF v_role IS DISTINCT FROM 'UP3' THEN
    RAISE EXCEPTION 'Jawaban "Tiang normal" hanya bisa diubah akun UP3 — isiannya berlaku untuk semua ULP. Akun ini: %.',
      COALESCE(v_role, 'tanpa peran');
  END IF;

  INSERT INTO public.jtm_ref_audit (tabel, kunci, aksi, nilai_lama, nilai_baru, oleh_uid, oleh_nama)
  VALUES ('bawaan', NEW.kode, lower(TG_OP),
          CASE WHEN TG_OP = 'UPDATE' THEN to_jsonb(OLD.nilai_bawaan) END,
          to_jsonb(NEW.nilai_bawaan), auth.uid(),
          COALESCE(v_nama, (SELECT email FROM auth.users WHERE id = auth.uid())));
  RETURN NEW;
END $$;

-- Sesudah trg_jaga_jtm_bawaan (urutan abjad): '' sudah jadi NULL, nilai sudah diperiksa.
DROP TRIGGER IF EXISTS trg_jtm_bawaan_up3 ON public.jtm_item_ref;
CREATE TRIGGER trg_jtm_bawaan_up3
  BEFORE INSERT OR UPDATE OF nilai_bawaan ON public.jtm_item_ref
  FOR EACH ROW EXECUTE FUNCTION public.jaga_jtm_bawaan_up3();

-- Periksa hasilnya
--   a. Pemicu ada:
--      SELECT tgname FROM pg_trigger WHERE tgname = 'trg_jtm_bawaan_up3';
--   b. Riwayat perubahan Tiang normal:
--      SELECT kunci, nilai_lama, nilai_baru, oleh_nama, pada FROM jtm_ref_audit
--      WHERE tabel = 'bawaan' ORDER BY pada DESC LIMIT 20;
