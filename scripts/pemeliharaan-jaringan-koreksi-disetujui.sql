-- =============================================================================
-- Pemeliharaan Jaringan — koreksi web SESUDAH disetujui (16 Nov 2026). Idempoten.
--
-- Sebelumnya ubah_pemeliharaan_jaringan hanya menerima catatan berstatus
-- 'Selesai' (menunggu verifikasi). Kini catatan 'Diverifikasi' juga bisa
-- dikoreksi, tetapi HANYA oleh UP3 atau admin ULP catatan itu
-- (wajib_boleh_ulp). Status tetap Diverifikasi; foto & titik tetap tidak
-- disentuh dari web. Dikembalikan / Dibatalkan tetap ditolak.
--
-- Tambalan pada definisi HIDUP (fungsinya sudah ditambal pekerjaan-tindakan.sql);
-- berhenti tanpa mengubah apa pun bila penandanya tidak ditemukan tepat sekali.
-- =============================================================================

DO $do$
DECLARE
  f    TEXT := 'public.ubah_pemeliharaan_jaringan(uuid,text,text,text,text,text,double precision,double precision,text,text,text)';
  def  TEXT;
  lama TEXT := E'  IF v_status <> ''Selesai'' THEN\n';
  baru TEXT := E'  -- ★ sudah disetujui: koreksi hanya oleh UP3 / admin ULP itu (pemeliharaan-jaringan-koreksi-disetujui.sql)\n'
            || E'  IF v_status = ''Diverifikasi'' THEN\n'
            || E'    PERFORM public.wajib_boleh_ulp((SELECT j.ulp FROM public.pemeliharaan_jaringan j WHERE j.id = p_id));\n'
            || E'  ELSIF v_status <> ''Selesai'' THEN\n';
BEGIN
  SELECT replace(pg_get_functiondef(f::regprocedure), E'\r\n', E'\n') INTO def;
  IF position('pemeliharaan-jaringan-koreksi-disetujui.sql' IN def) > 0 THEN
    RAISE NOTICE 'ubah_pemeliharaan_jaringan sudah menerima catatan Diverifikasi — dilewati.';
    RETURN;
  END IF;
  IF (length(def) - length(replace(def, lama, ''))) / length(lama) <> 1 THEN
    RAISE EXCEPTION 'Tambalan ubah_pemeliharaan_jaringan: penanda status tidak ditemukan tepat sekali — tidak ada yang berubah.';
  END IF;
  EXECUTE replace(def, lama, baru);
  RAISE NOTICE 'ubah_pemeliharaan_jaringan kini menerima koreksi catatan Diverifikasi (UP3 / admin ULP).';
END $do$;

COMMENT ON FUNCTION public.ubah_pemeliharaan_jaringan(
  UUID, TEXT, TEXT, TEXT, TEXT, TEXT,
  DOUBLE PRECISION, DOUBLE PRECISION, TEXT, TEXT, TEXT) IS
  'Koreksi catatan pemeliharaan jaringan: status Selesai (menunggu verifikasi), atau Diverifikasi oleh UP3 / admin ULP itu.';

-- Periksa hasilnya
--   SELECT position('Diverifikasi' IN pg_get_functiondef(
--     'public.ubah_pemeliharaan_jaringan(uuid,text,text,text,text,text,double precision,double precision,text,text,text)'::regprocedure)) > 0;
