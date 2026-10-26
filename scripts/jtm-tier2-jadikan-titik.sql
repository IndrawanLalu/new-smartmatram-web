-- =============================================================================
-- "Jadikan + titik" (26 Okt 2026)
-- Jalankan SESUDAH jtm-tier2-titik.sql. Idempoten.
--
-- WO Tier 2 biasa yang sudah terbit (sebelum ada mode titik) bisa diubah jadi
-- "Tier 2 + titik" tanpa dibatalkan — inspeksi yang sudah berjalan tetap.
-- Satu arah saja: + titik → biasa tidak disediakan (tiang yang terlanjur
-- dititik tidak bisa "dibatalkan").
-- Penjaga "segmen wajib sudah dititik" hanya BEFORE INSERT, jadi UPDATE ini
-- tidak tertolak.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.jadikan_wo_jtm_titik(p_wo_id UUID, p_oleh TEXT DEFAULT NULL)
RETURNS INT
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  w RECORD;
  n INT;
BEGIN
  SELECT * INTO w FROM public.wo_inspeksi WHERE id = p_wo_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'WO tidak ditemukan'; END IF;
  PERFORM public.wajib_boleh_ulp(w.ulp);
  IF w.jenis <> 'JTM' OR w.tier <> '2' THEN
    RAISE EXCEPTION 'Hanya WO inspeksi JTM Tier 2 yang bisa dijadikan + titik.';
  END IF;
  IF w.status <> 'Terbit' THEN RAISE EXCEPTION 'WO "%" sudah berstatus %.', w.nama, w.status; END IF;
  IF w.titik THEN RAISE EXCEPTION 'WO "%" sudah Tier 2 + titik.', w.nama; END IF;

  UPDATE public.wo_inspeksi SET titik = true WHERE id = p_wo_id;
  -- Item yang sudah Selesai/Dibatalkan ikut ditandai supaya satu WO satu mode;
  -- izin menitik tetap hanya untuk yang Terbuka (jtm_tier2_boleh_titik).
  UPDATE public.wo_inspeksi_item SET titik = true WHERE wo_id = p_wo_id AND NOT titik;
  GET DIAGNOSTICS n = ROW_COUNT;

  INSERT INTO public.master_audit
    (entitas, entitas_kode, ulp, field, nilai_lama, nilai_baru, aksi, oleh_uid, oleh_nama)
  VALUES ('wo_inspeksi', w.nama, w.ulp, 'titik', to_jsonb(false),
          jsonb_build_object('titik', true, 'item', n), 'sunting_admin', auth.uid(), p_oleh);
  RETURN n;
END $fn$;
GRANT EXECUTE ON FUNCTION public.jadikan_wo_jtm_titik(UUID, TEXT) TO authenticated;

NOTIFY pgrst, 'reload schema';
