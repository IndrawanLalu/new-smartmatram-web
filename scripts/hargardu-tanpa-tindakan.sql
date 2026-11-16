-- =============================================================================
-- Pemeliharaan Gardu: catat pilihan "Tidak ada pekerjaan perbaikan" (16 Nov 2026).
-- Idempoten.
--
-- Langkah "Pekerjaan yang dikerjakan" di HP mewajibkan regu mencentang
-- pekerjaan ATAU memilih "Tidak ada pekerjaan perbaikan". Pilihan kedua dulu
-- tidak tersimpan, jadi di persetujuan web catatan tanpa pekerjaan tidak bisa
-- dibedakan antara "regu memilih tidak ada" dan "langkahnya tidak muncul di HP".
--
-- Sekarang `pemeliharaan_gardu.tanpa_tindakan`:
--   true  = regu memilih "Tidak ada pekerjaan perbaikan"
--   false = regu tidak memilihnya (ada pekerjaan, atau langkahnya tidak muncul)
--   NULL  = HP belum mengirim keterangan ini (kiriman sebelum OTA 16 Nov)
-- =============================================================================

ALTER TABLE public.pemeliharaan_gardu ADD COLUMN IF NOT EXISTS tanpa_tindakan BOOLEAN;

DO $do$
DECLARE
  f    TEXT := 'public.kirim_pemeliharaan_gardu(jsonb)';
  lama TEXT := $x$PERFORM public._simpan_tindakan('hargardu', v_id::text, p_isi->'tindakan');$x$;
  baru TEXT := $x$PERFORM public._simpan_tindakan('hargardu', v_id::text, p_isi->'tindakan');
  -- ★ "Tidak ada pekerjaan perbaikan" (hargardu-tanpa-tindakan.sql). HP lama tidak mengirimnya → NULL.
  UPDATE public.pemeliharaan_gardu
  SET tanpa_tindakan = CASE WHEN jsonb_typeof(p_isi->'tanpa_tindakan') = 'boolean'
                            THEN (p_isi->>'tanpa_tindakan')::boolean END
  WHERE id = v_id;$x$;
  def  TEXT;
  n    INT;
BEGIN
  def := pg_get_functiondef(f::regprocedure);
  IF strpos(def, 'hargardu-tanpa-tindakan.sql') > 0 THEN
    RAISE NOTICE '% sudah ditambal', f;
    RETURN;
  END IF;
  n := (length(def) - length(replace(def, lama, ''))) / length(lama);
  IF n <> 1 THEN
    RAISE EXCEPTION '% : penanda _simpan_tindakan ketemu % kali (harus 1) — tidak ada yang diubah', f, n;
  END IF;
  EXECUTE replace(def, lama, baru);
  RAISE NOTICE '% ditambal', f;
END $do$;

-- Periksa hasilnya
--   a. Kolom ada:
--      SELECT column_name FROM information_schema.columns
--      WHERE table_name = 'pemeliharaan_gardu' AND column_name = 'tanpa_tindakan';
--   b. Fungsi sudah ditambal (harus true):
--      SELECT strpos(pg_get_functiondef('public.kirim_pemeliharaan_gardu(jsonb)'::regprocedure),
--                    'hargardu-tanpa-tindakan.sql') > 0;
--   c. Sesudah OTA, sebaran pilihan regu:
--      SELECT petugas_nama, tanpa_tindakan, count(*) FROM pemeliharaan_gardu
--      WHERE tgl_selesai >= '2026-11-16' GROUP BY 1, 2 ORDER BY 1, 2;
