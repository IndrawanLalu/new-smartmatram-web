-- =============================================================================
-- Usulan Perbaikan JTR — ubah titik pecah + cara "pindah SR" (21 Okt 2026).
-- Lanjutan scripts/jtr-usulan-perbaikan.sql (harus sudah dijalankan).
-- Jalankan manual di Supabase SQL Editor. Idempoten (aman diulang).
--
-- 1. Material bawaan "pindah-sr": tambah jurusan TANPA potong kabel — kabel
--    baru ditarik sejajar dan SR sepanjang jalurnya dipindah ke kabel baru.
-- 2. ubah_pecah_usulan_jtr: titik pecah usulan yang belum di-WO-kan boleh
--    diganti (salah klik tiang / berubah pikiran). Angka dasar, titik lokasi
--    dan material ikut diganti dengan yang dikirim web.
-- =============================================================================


-- ── 1. Material bawaan pindah SR ────────────────────────────────────────────
DO $$
DECLARE c TEXT;
BEGIN
  -- CHECK pekerjaan lama tanpa nama tetap — cari lewat definisinya.
  FOR c IN
    SELECT conname FROM pg_constraint
     WHERE conrelid = 'public.jtr_material_ref'::regclass AND contype = 'c'
       AND pg_get_constraintdef(oid) LIKE '%pekerjaan%'
  LOOP
    EXECUTE format('ALTER TABLE public.jtr_material_ref DROP CONSTRAINT %I', c);
  END LOOP;
END $$;
ALTER TABLE public.jtr_material_ref ADD CONSTRAINT jtr_material_ref_pekerjaan_check
  CHECK (pekerjaan IN ('tambah-jurusan', 'pindah-sr', 'ganti-kabel', 'pemerataan'));

INSERT INTO public.jtr_material_ref (pekerjaan, nama, satuan, dasar, faktor, urutan)
SELECT * FROM (VALUES
  ('pindah-sr', 'Kabel {kabel}',                   'm',   'kabel_m', 1.05, 1),
  ('pindah-sr', 'Suspension clamp (penggantung)',  'bh',  'tiang',   1,    2),
  ('pindah-sr', 'Strain clamp (dead end)',         'bh',  'tetap',   2,    3),
  ('pindah-sr', 'Konektor piercing SR (pindah ke kabel baru)', 'bh', 'sr', 1, 4),
  ('pindah-sr', 'Sepatu kabel (skun)',             'bh',  'tetap',   4,    5),
  ('pindah-sr', 'NH fuse + dudukan (PHB-TR)',      'set', 'tetap',   3,    6)
) v(pekerjaan, nama, satuan, dasar, faktor, urutan)
WHERE NOT EXISTS (SELECT 1 FROM public.jtr_material_ref WHERE pekerjaan = 'pindah-sr');


-- ── 2. Ubah titik pecah selama masih usulan ─────────────────────────────────
-- Usulan sisip yang dipilihkan titik pecah berubah menjadi tambah jurusan.
CREATE OR REPLACE FUNCTION public.ubah_pecah_usulan_jtr(p_id UUID, p JSONB, p_nama TEXT)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE u public.jtr_usulan_perbaikan;
BEGIN
  SELECT * INTO u FROM public.jtr_usulan_perbaikan WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Usulan tidak ditemukan.'; END IF;
  PERFORM public.wajib_boleh_ulp(u.ulp);
  IF u.status <> 'Usulan' THEN RAISE EXCEPTION 'Usulan sudah %, titik pecah tidak bisa diubah.', u.status; END IF;
  IF u.pekerjaan NOT IN ('tambah-jurusan', 'sisip') THEN
    RAISE EXCEPTION 'Titik pecah hanya ada pada usulan tambah jurusan / sisip.';
  END IF;
  IF p->'opsi' IS NULL OR jsonb_typeof(p->'opsi') <> 'object' THEN
    RAISE EXCEPTION 'Titik pecah belum dipilih.';
  END IF;
  UPDATE public.jtr_usulan_perbaikan
     SET pekerjaan = 'tambah-jurusan',
         ringkas   = COALESCE(NULLIF(btrim(p->>'ringkas'), ''), ringkas),
         dasar     = COALESCE(p->'dasar', dasar),
         opsi      = p->'opsi',
         titik_lat = (p->>'titik_lat')::double precision,
         titik_lng = (p->>'titik_lng')::double precision,
         material  = COALESCE(p->'material', '[]'::jsonb),
         catatan   = NULLIF(btrim(COALESCE(p->>'catatan', '')), '')
   WHERE id = p_id;
END $fn$;
GRANT EXECUTE ON FUNCTION public.ubah_pecah_usulan_jtr(UUID, JSONB, TEXT) TO authenticated;
