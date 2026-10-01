-- =============================================================================
-- Ubah titik ujung segmen lapangan dari web (Master Segmen)
-- Keputusan user 1 Okt 2026. Jalankan manual di Supabase SQL Editor, SESUDAH
-- `segmen-nama-tempel.sql`. Idempoten.
--
-- Nama segmen lapangan TIDAK diketik — disusun dari kedua titik ujungnya
-- (`segmen_susun_nama`), dan ujung satu segmen adalah pangkal segmen
-- berikutnya. Yang dibetulkan karena itu TITIKNYA, bukan namanya:
--
--   MATARAM, 1 Okt: ujung tertulis TIANG "MTR-029 REC KAMBOJA" padahal tiang
--   itu recloser → diubah jadi REC "KAMBOJA" → "PLTD TAMAN - REC. KAMBOJA",
--   dan segmen sesudahnya ikut jadi "REC. KAMBOJA - UJUNG".
--
--   • Segmen yang bersambung lewat tiang yang sama ikut diperbarui (pangkal
--     segmen sesudahnya / ujung segmen sebelumnya) — rantainya tidak putus.
--   • Tiang ujungnya tidak berubah. Jenis keypoint/gardu menulis penanda
--     tiangnya, sama dengan saat regu menutup segmen dari HP.
--   • Segmen impor & tempelan tidak lewat sini — namanya ditulis orang,
--     dibetulkan dengan `ubah_nama_segmen`.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.ubah_titik_segmen(
  p_segmen_id UUID,
  p_ujung     TEXT,            -- 'awal' | 'akhir'
  p_jenis     TEXT,
  p_nama      TEXT,
  p_oleh      TEXT DEFAULT NULL
) RETURNS TEXT
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  s        RECORD;
  v_jenis  TEXT := upper(btrim(COALESCE(p_jenis, '')));
  v_nama   TEXT := upper(regexp_replace(btrim(COALESCE(p_nama, '')), '\s+', ' ', 'g'));
  v_tiang  UUID;
  v_penanda TEXT;
  lama     TEXT;
  baru     TEXT;
  o        RECORD;
BEGIN
  IF p_ujung NOT IN ('awal', 'akhir') THEN RAISE EXCEPTION 'Ujung harus awal atau akhir'; END IF;

  SELECT * INTO s FROM public.segmen WHERE id = p_segmen_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Segmen tidak ditemukan'; END IF;
  PERFORM public.penyulang_wajib_boleh(s.ulp);

  IF s.sumber NOT IN ('lapangan', 'manual') THEN
    RAISE EXCEPTION 'Segmen % bersumber %: namanya ditulis orang — ubah lewat nama segmennya.', s.nama, s.sumber;
  END IF;
  IF s.status <> 'aktif' THEN RAISE EXCEPTION 'Segmen % tidak aktif', s.nama; END IF;
  IF p_ujung = 'akhir' AND s.titik_akhir_jenis = 'UJUNG' THEN
    RAISE EXCEPTION 'Segmen % masih dirintis — ujungnya ditentukan regu saat menyimpan segmen.', s.nama;
  END IF;
  IF NOT public.jtm_jenis_titik_sah(v_jenis) THEN RAISE EXCEPTION 'Jenis titik "%" tidak dikenal', p_jenis; END IF;
  IF v_nama = '' THEN RAISE EXCEPTION 'Nama titik wajib diisi'; END IF;

  lama := s.nama;
  v_tiang := CASE WHEN p_ujung = 'awal' THEN s.titik_awal_tiang_id ELSE s.titik_akhir_tiang_id END;

  IF p_ujung = 'awal' THEN
    UPDATE public.segmen SET titik_awal_jenis = v_jenis, titik_awal_nama = v_nama WHERE id = s.id;
  ELSE
    UPDATE public.segmen SET titik_akhir_jenis = v_jenis, titik_akhir_nama = v_nama WHERE id = s.id;
  END IF;
  SELECT nama INTO baru FROM public.segmen WHERE id = s.id;

  INSERT INTO public.master_audit
    (entitas, entitas_kode, ulp, field, nilai_lama, nilai_baru, aksi, oleh_uid, oleh_nama)
  VALUES ('segmen', baru, COALESCE(s.ulp, '-'), 'titik_' || p_ujung,
          jsonb_build_object('nama', lama),
          jsonb_build_object('nama', baru, 'jenis', v_jenis, 'titik', v_nama),
          'sunting_admin', auth.uid(), p_oleh);

  -- Segmen yang bersambung di tiang yang sama: sisi seberangnya ikut.
  IF v_tiang IS NOT NULL THEN
    FOR o IN
      SELECT id, nama FROM public.segmen
       WHERE status = 'aktif' AND id <> s.id AND sumber IN ('lapangan', 'manual')
         AND CASE WHEN p_ujung = 'akhir' THEN titik_awal_tiang_id ELSE titik_akhir_tiang_id END = v_tiang
    LOOP
      IF p_ujung = 'akhir' THEN
        UPDATE public.segmen SET titik_awal_jenis = v_jenis, titik_awal_nama = v_nama WHERE id = o.id;
      ELSE
        UPDATE public.segmen SET titik_akhir_jenis = v_jenis, titik_akhir_nama = v_nama WHERE id = o.id;
      END IF;
      INSERT INTO public.master_audit
        (entitas, entitas_kode, ulp, field, nilai_lama, nilai_baru, aksi, oleh_uid, oleh_nama)
      SELECT 'segmen', sg.nama, COALESCE(sg.ulp, '-'),
             CASE WHEN p_ujung = 'akhir' THEN 'titik_awal' ELSE 'titik_akhir' END,
             jsonb_build_object('nama', o.nama),
             jsonb_build_object('nama', sg.nama, 'ikut', baru),
             'sunting_admin', auth.uid(), p_oleh
        FROM public.segmen sg WHERE sg.id = o.id;
    END LOOP;

    -- Penanda tiang mengikuti jenis keypoint/gardu.
    v_penanda := CASE v_jenis WHEN 'REC' THEN 'recloser' WHEN 'LBS' THEN 'lbs' WHEN 'PMT' THEN 'pmt'
                              WHEN 'PENG' THEN 'peng' WHEN 'GARDU' THEN 'gardu' END;
    IF v_penanda IS NOT NULL THEN
      UPDATE public.tiang SET penanda = v_penanda, updated_at = now()
       WHERE id = v_tiang AND penanda IS DISTINCT FROM v_penanda;
    END IF;
  END IF;

  RETURN baru;
END $fn$;

GRANT EXECUTE ON FUNCTION public.ubah_titik_segmen(UUID, TEXT, TEXT, TEXT, TEXT) TO authenticated;


-- ── Periksa ──────────────────────────────────────────────────────────────────
--   SELECT nama, titik_awal_jenis, titik_awal_nama, titik_akhir_jenis, titik_akhir_nama
--     FROM segmen WHERE penyulang = 'MATARAM' AND status = 'aktif';
