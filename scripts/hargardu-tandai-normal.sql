-- =============================================================================
-- Perlu Perbaikan — "Tandai normal" (11 Nov 2026). Jalankan SESUDAH
-- hargardu-temuan-wo.sql dan inspeksi-gardu-isian.sql (yang memuat view
-- gardu_perlu_perbaikan terbaru, sudah mengenal jalur 'normal'). Idempoten.
--
-- Admin ULP / UP3 menyatakan temuan sebenarnya normal (mis. FCO memang
-- dilepas karena jurusan tidak terpakai) supaya tidak jadi pekerjaan tertunda.
-- Keputusan user 11 Nov:
--   • Nama tombol "Tandai normal"; hasilnya di chip "Dinyatakan normal".
--   • Alasan WAJIB, foto perbaikan boleh ada (tidak wajib).
--   • Berlaku untuk temuan ITU saja — kunjungan berikutnya yang mencatat hal
--     sama memunculkan temuan lagi (pemeliharaan: bila sesudah tanggal tanda).
--
-- Disimpan di tindak_lanjut_gardu: jalur 'normal', status 'Dikerjakan' — jadi
-- keluar dari gardu_perlu_perbaikan dan tampil lewat gardu_temuan_dikerjakan
-- tanpa view baru. Temuan Inspeksi Gardu ikut status_tl 'Selesai'.
-- =============================================================================

ALTER TABLE public.tindak_lanjut_gardu DROP CONSTRAINT IF EXISTS tindak_lanjut_gardu_jalur_valid;
ALTER TABLE public.tindak_lanjut_gardu ADD CONSTRAINT tindak_lanjut_gardu_jalur_valid
  CHECK (jalur IN ('wo_tugas', 'wo_har', 'perbaikan', 'normal'));
COMMENT ON COLUMN public.tindak_lanjut_gardu.jalur IS
  'wo_tugas = WO "Tindak Lanjut Gardu" lama · wo_har = WO Pemeliharaan Gardu (luar garansi) · perbaikan = WO Perbaikan (dalam garansi) · normal = ditandai normal oleh admin (bukan temuan).';

-- p_temuan: satu baris Perlu Perbaikan (bentuk sama dengan jadikan_wo_temuan_gardu).
CREATE OR REPLACE FUNCTION public.tandai_temuan_normal(
  p_temuan JSONB, p_alasan TEXT, p_foto TEXT DEFAULT NULL, p_oleh TEXT DEFAULT NULL
) RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  v_ulp    TEXT := upper(btrim(COALESCE(p_temuan->>'ulp', '')));
  v_kode   TEXT := btrim(COALESCE(p_temuan->>'gardu_kode', ''));
  v_item   TEXT := p_temuan->>'item_kode';
  v_bagian TEXT := COALESCE(NULLIF(p_temuan->>'bagian', ''), '-');
  v_temuan UUID := NULLIF(p_temuan->>'temuan_id', '')::uuid;
  v_alasan TEXT := NULLIF(btrim(COALESCE(p_alasan, '')), '');
  v_id     UUID;
BEGIN
  PERFORM public.wajib_boleh_ulp(v_ulp);
  IF v_alasan IS NULL THEN RAISE EXCEPTION 'Tulis alasan mengapa temuan ini normal.'; END IF;
  IF COALESCE(p_foto, '') <> '' AND p_foto NOT LIKE 'http%' THEN RAISE EXCEPTION 'Foto belum terunggah.'; END IF;
  IF EXISTS (SELECT 1 FROM public.tindak_lanjut_gardu
             WHERE upper(gardu_kode) = upper(v_kode) AND upper(ulp) = v_ulp AND item_kode = v_item AND bagian = v_bagian
               AND status = 'Di-WO') THEN
    RAISE EXCEPTION 'Temuan ini sedang di-WO — tunggu hasil regu dulu.';
  END IF;

  INSERT INTO public.tindak_lanjut_gardu AS tl
    (gardu_kode, ulp, item_kode, bagian, wo_item_id, ditugaskan_pada, ditugaskan_oleh, catatan,
     jalur, status, sumber, temuan_id, item_nama, nilai_label, uraian, foto_url, prioritas, ditemukan_pada,
     perbaikan_id, wo_har_item_id, har_pemeliharaan_id, har_hasil,
     dikerjakan_at, dikerjakan_oleh, foto_sesudah_url, hasil_catatan)
  VALUES (v_kode, v_ulp, v_item, v_bagian, NULL, now(), p_oleh, NULL,
          'normal', 'Dikerjakan', p_temuan->>'sumber', v_temuan, p_temuan->>'item_nama', p_temuan->>'nilai_label',
          p_temuan->>'catatan',
          COALESCE((SELECT t.foto_url[1] FROM public.inspeksi_gardu_temuan t WHERE t.id = v_temuan), NULLIF(p_temuan->>'foto_url', '')),
          NULLIF(p_temuan->>'prioritas', ''), NULLIF(p_temuan->>'ditemukan_pada', '')::timestamptz,
          NULL, NULL, NULL, NULL,
          now(), p_oleh, NULLIF(p_foto, ''), v_alasan)
  ON CONFLICT (gardu_kode, ulp, item_kode, bagian) DO UPDATE SET
    wo_item_id = NULL, ditugaskan_pada = now(), ditugaskan_oleh = EXCLUDED.ditugaskan_oleh, catatan = NULL,
    jalur = 'normal', status = 'Dikerjakan', sumber = EXCLUDED.sumber, temuan_id = EXCLUDED.temuan_id,
    item_nama = EXCLUDED.item_nama, nilai_label = EXCLUDED.nilai_label, uraian = EXCLUDED.uraian,
    foto_url = EXCLUDED.foto_url, prioritas = EXCLUDED.prioritas, ditemukan_pada = EXCLUDED.ditemukan_pada,
    perbaikan_id = NULL, wo_har_item_id = NULL, har_pemeliharaan_id = NULL, har_hasil = NULL,
    dikerjakan_at = now(), dikerjakan_oleh = EXCLUDED.dikerjakan_oleh,
    foto_sesudah_url = EXCLUDED.foto_sesudah_url, hasil_catatan = EXCLUDED.hasil_catatan
  RETURNING tl.id INTO v_id;

  IF v_temuan IS NOT NULL THEN
    UPDATE public.inspeksi_gardu_temuan
    SET status_tl = 'Selesai', selesai_at = now(), selesai_oleh = p_oleh, selesai_catatan = 'Ditandai normal: ' || v_alasan
    WHERE id = v_temuan AND status_tl = 'Terbuka';
  END IF;
  RETURN v_id;
END $fn$;
REVOKE ALL ON FUNCTION public.tandai_temuan_normal(JSONB, TEXT, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.tandai_temuan_normal(JSONB, TEXT, TEXT, TEXT) TO authenticated;

NOTIFY pgrst, 'reload schema';
