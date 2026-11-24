-- ════════════════════════════════════════════════════════════════════════════
-- Inspeksi JTM tidak terkirim: "Segmen ... sudah ditutup sebelumnya" (24 Nov 2026)
-- ════════════════════════════════════════════════════════════════════════════
-- Kasus TANJUNG: segmen IMPOR bernama "... - UJUNG" yang ujungnya sudah tiang
-- (titik_akhir_jenis = 'TIANG', mis. TJK-042L011). HP (JtmPenyapuanScreen:255)
-- menebak "belum berujung" dari NAMA berakhiran "- UJUNG", jadi "Selesai di
-- segmen ini" meminta regu menentukan ujung → tutup_segmen_jtm → ditolak karena
-- segmennya sudah berujung → inspeksinya tidak pernah selesai.
--
-- Perbaikan server (berlaku tanpa OTA): segmen yang SUDAH berujung tidak lagi
-- ditolak. Inspeksinya diselesaikan seperti jalur "Selesai" biasa; isian ujung
-- dari regu diabaikan (ujungnya sudah ada). HP menyusul: tidak menebak dari nama.
--
-- Yang hidup di DB: `tutup_segmen_jtm` = PEMBUNGKUS pemeriksa hak
-- (jtm-hak-akses-portal.sql), badannya di `_tutup_segmen_jtm_inti`. Badan inti
-- TIDAK disentuh; yang ditulis ulang hanya pembungkusnya, lewat helper yang
-- sama, dengan cabang tambahan sebelum memanggil inti.
--
-- Aman dijalankan ulang.
-- ════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public._tutup_segmen_sudah_berujung(
  p_segmen_id UUID,
  p_oleh      TEXT,
  p_catatan   TEXT
) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_nama     TEXT;
  v_tiang    INT;
  v_inspeksi UUID;
  v_dinilai  INT := 0;
BEGIN
  SELECT nama INTO v_nama FROM public.segmen WHERE id = p_segmen_id;
  SELECT count(*) INTO v_tiang FROM public.segmen_tiang WHERE segmen_id = p_segmen_id;

  SELECT id INTO v_inspeksi FROM public.inspeksi_jtm
  WHERE segmen_id = p_segmen_id AND status IN ('Dijadwalkan', 'Dalam Proses')
  ORDER BY created_at DESC LIMIT 1;

  IF v_inspeksi IS NULL THEN
    -- Tidak ada yang bisa diselesaikan — sama dengan dulu: segmennya memang
    -- sudah berujung, dan tidak ada inspeksi terbuka.
    RAISE EXCEPTION 'Segmen "%" sudah berujung dan tidak ada inspeksi terbuka di segmen ini.', v_nama;
  END IF;

  SELECT count(*) INTO v_dinilai FROM public.inspeksi_jtm_titik WHERE inspeksi_id = v_inspeksi;
  IF v_dinilai = 0 THEN
    RAISE EXCEPTION 'Belum ada tiang yang dinilai di segmen "%".', v_nama;
  END IF;

  -- Penjaga "semua tiang sudah dinilai" dll. tetap di fungsi ini.
  PERFORM public.selesaikan_inspeksi_jtm(v_inspeksi, p_oleh, p_catatan);

  RETURN jsonb_build_object(
    'segmen_id',         p_segmen_id,
    'nama',              v_nama,
    'tiang',             v_tiang,
    'dinilai',           v_dinilai,
    'penyapuan_selesai', true
  );
END $$;

REVOKE ALL ON FUNCTION public._tutup_segmen_sudah_berujung(UUID, TEXT, TEXT) FROM PUBLIC, anon, authenticated;

-- Pembungkus ditulis ulang: pemeriksa hak SAMA dengan jtm-hak-akses-portal.sql,
-- lalu cabang segmen-sudah-berujung, baru inti.
SELECT public._pasang_pemeriksa_hak(
  'tutup_segmen_jtm',
  'public.wajib_kerja_ulp((SELECT ulp FROM public.segmen WHERE id = p_segmen_id))',
  'IF EXISTS (SELECT 1 FROM public.segmen WHERE id = p_segmen_id AND titik_akhir_jenis IS DISTINCT FROM ''UJUNG'') '
  || 'THEN RETURN public._tutup_segmen_sudah_berujung(p_segmen_id, p_oleh, p_catatan); END IF'
);

-- ── Periksa (hanya baca) ──────────────────────────────────────────────────────
-- Pembungkus baru harus memuat "_tutup_segmen_sudah_berujung" DAN "wajib_kerja_ulp":
SELECT position('_tutup_segmen_sudah_berujung' IN pg_get_functiondef('public.tutup_segmen_jtm'::regproc)) > 0 AS cabang_baru,
       position('wajib_kerja_ulp' IN pg_get_functiondef('public.tutup_segmen_jtm'::regproc)) > 0 AS hak_tetap;
