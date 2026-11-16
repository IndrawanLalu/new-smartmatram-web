-- =============================================================================
-- "Tiang baik" JTR hanya diubah UP3 (16 Nov 2026, keputusan user). Idempoten.
-- Pasangan jtm-normal-up3.sql.
--
-- Jawaban bawaan tombol "Tiang baik" (`jtr_item_ref.nilai_bawaan`) SATU untuk
-- semua ULP. Sebelumnya setiap akun yang masuk boleh mengubahnya (RLS
-- `auth_all_jtr_item_ref`), tanpa jejak.
--
-- Sekarang:
--   • mengubah `nilai_bawaan` dari aplikasi hanya untuk akun ber-role UP3;
--   • setiap perubahan dicatat di `master_audit` (entitas 'jtr_item',
--     field 'nilai_bawaan') — JTR tidak punya tabel riwayat acuan sendiri;
--   • SQL Editor / skrip (tanpa sesi aplikasi) tidak dihalangi.
-- Kolom lain di jtr_item_ref TIDAK berubah aturannya.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.jaga_jtr_bawaan_up3()
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
    RAISE EXCEPTION 'Jawaban "Tiang baik" hanya bisa diubah akun UP3 — isiannya berlaku untuk semua ULP. Akun ini: %.',
      COALESCE(v_role, 'tanpa peran');
  END IF;

  INSERT INTO public.master_audit (entitas, entitas_kode, ulp, field, nilai_lama, nilai_baru, aksi, oleh_uid, oleh_nama)
  VALUES ('jtr_item', NEW.field, '-', 'nilai_bawaan',
          CASE WHEN TG_OP = 'UPDATE' THEN to_jsonb(OLD.nilai_bawaan) END,
          to_jsonb(NEW.nilai_bawaan), 'sunting_admin', auth.uid(),
          COALESCE(v_nama, (SELECT email FROM auth.users WHERE id = auth.uid())));
  RETURN NEW;
END $$;

-- Sesudah trg_jaga_jtr_bawaan (urutan abjad): '' sudah jadi NULL, nilai sudah diperiksa.
DROP TRIGGER IF EXISTS trg_jtr_bawaan_up3 ON public.jtr_item_ref;
CREATE TRIGGER trg_jtr_bawaan_up3
  BEFORE INSERT OR UPDATE OF nilai_bawaan ON public.jtr_item_ref
  FOR EACH ROW EXECUTE FUNCTION public.jaga_jtr_bawaan_up3();

-- Periksa hasilnya
--   a. Pemicu ada:
--      SELECT tgname FROM pg_trigger WHERE tgname = 'trg_jtr_bawaan_up3';
--   b. Riwayat perubahan Tiang baik:
--      SELECT entitas_kode, nilai_lama, nilai_baru, oleh_nama, pada FROM master_audit
--      WHERE entitas = 'jtr_item' AND field = 'nilai_bawaan' ORDER BY pada DESC LIMIT 20;
