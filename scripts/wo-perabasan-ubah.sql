-- =============================================================================
-- Ubah WO Perabasan yang sudah terbit (permintaan user 25 Sep 2026:
-- "daftar WO yang sudah dibuat, lihat atau editnya belum ada").
-- Jalankan manual di Supabase SQL Editor. Idempoten.
--
-- Yang boleh diubah: nama, target KMS, tanggal WO — hanya selama WO masih
-- berstatus Terbit, oleh UP3 atau admin ULP-nya. Isi segmennya TIDAK diubah
-- di sini: menambah lewat "Tambah ke WO yang sudah ada" (Susun WO), mengeluarkan
-- lewat "Keluarkan dari WO" per segmen — dua jalan yang sudah menjaga aturannya.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.ubah_wo_perabasan(
  p_wo_id     UUID,
  p_nama      TEXT,
  p_target_km NUMERIC,
  p_tgl_wo    DATE,
  p_oleh      TEXT DEFAULT NULL
) RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  w RECORD;
BEGIN
  SELECT * INTO w FROM public.wo_perabasan WHERE id = p_wo_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'WO tidak ditemukan.'; END IF;
  PERFORM public.wajib_boleh_ulp(w.ulp);

  IF w.status <> 'Terbit' THEN
    RAISE EXCEPTION 'WO ini sudah berstatus % — tidak bisa diubah lagi.', w.status;
  END IF;
  IF btrim(COALESCE(p_nama, '')) = '' THEN RAISE EXCEPTION 'Nama WO belum diisi.'; END IF;
  IF p_target_km IS NULL OR p_target_km <= 0 OR p_target_km > 5000 THEN
    RAISE EXCEPTION 'Target harus lebih dari 0 dan paling banyak 5.000 KMS.';
  END IF;
  IF p_tgl_wo IS NULL THEN RAISE EXCEPTION 'Tanggal WO belum diisi.'; END IF;

  UPDATE public.wo_perabasan
  SET nama = btrim(p_nama), target_km = p_target_km, tgl_wo = p_tgl_wo, updated_at = now()
  WHERE id = p_wo_id;

  INSERT INTO public.master_audit
    (entitas, entitas_kode, ulp, field, nilai_lama, nilai_baru, aksi, oleh_uid, oleh_nama)
  VALUES ('wo_perabasan', btrim(p_nama), w.ulp, 'ubah',
          jsonb_build_object('nama', w.nama, 'target_km', w.target_km, 'tgl_wo', w.tgl_wo),
          jsonb_build_object('nama', btrim(p_nama), 'target_km', p_target_km, 'tgl_wo', p_tgl_wo),
          'sunting_admin', auth.uid(), p_oleh);
END $fn$;

GRANT EXECUTE ON FUNCTION public.ubah_wo_perabasan(UUID, TEXT, NUMERIC, DATE, TEXT) TO authenticated;
