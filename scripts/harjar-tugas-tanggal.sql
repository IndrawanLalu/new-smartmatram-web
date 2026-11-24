-- =============================================================================
-- Tugas HARJAR: tanggal untuk tugas lama tanpa assigned_at (24 Nov 2026).
-- Idempoten. Hanya MENAMBAH dua kolom di BELAKANG view harjar_tugas:
--   dibuat_at  = inspeksi.created_at
--   tgl_temuan = inspeksi.tgl_inspeksi
-- Tab Tugas Pemeliharaan Jaringan memakai: ditugaskan → dibuat → temuan, dan
-- tugas lama tanpa assigned_at kini muncul di bulan dibuatnya.
--
-- TAMBALAN pada definisi HIDUP (teknisaplikasi.md 23.7): definisi diambil dari
-- pg_get_viewdef, kolom disisipkan sebelum FROM utama. Berhenti bila bentuknya
-- tidak dikenali — view tidak diubah.
-- =============================================================================

DO $patch$
DECLARE
  def  TEXT := pg_get_viewdef('public.harjar_tugas'::regclass, true);
  baru TEXT;
BEGIN
  IF position('dibuat_at' IN def) > 0 THEN
    RAISE NOTICE 'harjar_tugas sudah punya dibuat_at — dilewati.';
    RETURN;
  END IF;
  IF def !~ '\n\s*FROM inspeksi i\M' THEN
    RAISE EXCEPTION 'Bentuk harjar_tugas tidak dikenali (FROM inspeksi i tidak ditemukan) — view TIDAK diubah.';
  END IF;
  -- Tanpa flag 'g': hanya FROM PERTAMA (kepala SELECT utama) yang diganti.
  baru := regexp_replace(def, '\n(\s*)FROM inspeksi i\M',
            E',\n    i.created_at AS dibuat_at,\n    i.tgl_inspeksi::text AS tgl_temuan\n\\1FROM inspeksi i');
  EXECUTE 'CREATE OR REPLACE VIEW public.harjar_tugas AS ' || baru;
END $patch$;
GRANT SELECT ON public.harjar_tugas TO authenticated;

NOTIFY pgrst, 'reload schema';

-- Periksa (hanya baca) — harus ada isinya:
--   SELECT id, assigned_at, dibuat_at, tgl_temuan FROM harjar_tugas ORDER BY dibuat_at DESC LIMIT 5;
