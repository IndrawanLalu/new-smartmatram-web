-- =============================================================================
-- Drone: "sudah dititik" ikut riwayat warisan Pecah/Gabung (9 Nov 2026).
-- jtm-drone-segmen.sql membaca inspeksi_jtm langsung → segmen hasil pecahan
-- dari segmen yang sudah disetujui terbaca "belum dititik", padahal syarat
-- Tier 2 (jtm_segmen_dititik) menganggapnya sudah. Satu aturan, satu sumber:
-- keduanya kini membaca inspeksi_jtm_milik. Idempoten.
-- (segmen_asal rekursif atas segmen_warisan — 8 baris, murah per panggilan.)
-- =============================================================================
CREATE OR REPLACE FUNCTION public.jtm_segmen_sudah_dititik(p_segmen UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SET search_path = public AS $fn$
  SELECT EXISTS (SELECT 1 FROM public.inspeksi_jtm_milik m
                 WHERE m.segmen_id = p_segmen AND m.status = 'Diverifikasi' AND COALESCE(m.tier, '1') = '1');
$fn$;
GRANT EXECUTE ON FUNCTION public.jtm_segmen_sudah_dititik(UUID) TO authenticated;

-- Item WO drone (Susun WO "Tier 1 + drone" utuh, atau Tambah item ke WO drone)
-- hanya untuk segmen yang sudah dititik — drone tidak menitik tiang. Pemicu
-- dinamai "zz" supaya berjalan SESUDAH trg_wo_item_ikut_tier (urutan abjad),
-- yang mengisi NEW.drone dari WO-nya.
CREATE OR REPLACE FUNCTION public.wo_item_drone_wajib_dititik()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $fn$
BEGIN
  IF NEW.jenis = 'JTM' AND COALESCE(NEW.drone, false) AND NEW.segmen_id IS NOT NULL
     AND NOT public.jtm_segmen_sudah_dititik(NEW.segmen_id) THEN
    RAISE EXCEPTION 'Segmen "%" belum pernah diinspeksi Tier 1 dan disetujui — Tier 1 + drone hanya untuk segmen yang sudah dititik.',
      COALESCE(NEW.objek_nama, NEW.segmen_id::text);
  END IF;
  RETURN NEW;
END $fn$;
DROP TRIGGER IF EXISTS trg_wo_item_zz_drone_dititik ON public.wo_inspeksi_item;
CREATE TRIGGER trg_wo_item_zz_drone_dititik BEFORE INSERT ON public.wo_inspeksi_item
  FOR EACH ROW EXECUTE FUNCTION public.wo_item_drone_wajib_dititik();
