-- ════════════════════════════════════════════════════════════════════════════
-- "Tiang ini menumpang" membawa TIANG ASAL regu (5 Okt 2026)
-- ════════════════════════════════════════════════════════════════════════════
-- Lanjutan `jtm-induk-per-penyulang.sql`. Di sana induk per penyulang diatur
-- admin dari peta; di sini HP mengirimnya sendiri saat regu menumpang, supaya
-- titik pertemuan dua penyulang (LBSM Sampoerna) tersambung benar sejak awal
-- dan namanya turunan tiang asal — bukan "…-001" seolah pangkal.
--
-- `tumpangi_tiang_jtm_dari(segmen, tiang, dari, nama)`:
--   1. menumpang seperti biasa (`tumpangi_tiang_jtm`, penjaga hak ikut);
--   2. induk di penyulang segmen = `dari`, HANYA bila:
--        • penyulang ini menumpang (bukan pemilik batang),
--        • `dari` tiang aktif yang bernama di penyulang ini,
--        • `dari` BUKAN hilir tiang ini di pohon batang — regu yang menyusuri
--          underbuild dari ujung ke pangkal datang dari hilir; menjadikannya
--          induk akan membalik arah jaringan,
--        • `dari` berbeda dari induk yang sudah berlaku (underbuild yang
--          disusuri searah = tidak ada yang berubah),
--        • tidak membuat jaringan melingkar;
--   3. nama di penyulang ini dihitung ulang dari `dari` — hanya bila nama itu
--      BARU lahir di permintaan ini (nama lama yang sudah dipakai tidak
--      diganti diam-diam; untuk itu ada Generate ulang di web).
-- Syarat tidak terpenuhi = menumpang biasa, tanpa galat.
--
-- HP lama tetap memanggil `tumpangi_tiang_jtm`; tidak terpengaruh.
-- Jalankan SEBELUM OTA HP yang memanggil fungsi ini.
-- ════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.tumpangi_tiang_jtm_dari(
  p_segmen_id UUID,
  p_tiang_id  UUID,
  p_dari_id   UUID,
  p_nama      TEXT DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  d     JSONB;
  s     RECORD;
  t     RECORD;
  kp    RECORD;
  naik  UUID;
  n     INT := 0;
  boleh BOOLEAN := p_dari_id IS NOT NULL AND p_dari_id <> p_tiang_id;
  kode_baru TEXT;
BEGIN
  d := public.tumpangi_tiang_jtm(p_segmen_id, p_tiang_id, 'bawah', p_nama);

  SELECT * INTO s FROM public.segmen WHERE id = p_segmen_id;
  SELECT * INTO t FROM public.tiang WHERE id = p_tiang_id;
  SELECT * INTO kp FROM public.tiang_kode_penyulang
   WHERE tiang_id = p_tiang_id AND upper(penyulang) = upper(s.penyulang);
  IF NOT FOUND OR kp.utama THEN boleh := false; END IF;

  IF boleh AND NOT EXISTS (
    SELECT 1 FROM public.tiang_kode_penyulang k2 JOIN public.tiang t2 ON t2.id = k2.tiang_id
    WHERE k2.tiang_id = p_dari_id AND upper(k2.penyulang) = upper(s.penyulang) AND t2.status_hidup = 'aktif'
  ) THEN boleh := false; END IF;

  -- `dari` di hilir batang tiang ini? (naik dari `dari` lewat induk batang)
  IF boleh THEN
    naik := p_dari_id;
    WHILE naik IS NOT NULL AND n < 5000 LOOP
      IF naik = p_tiang_id THEN boleh := false; EXIT; END IF;
      SELECT induk_id INTO naik FROM public.tiang WHERE id = naik;
      n := n + 1;
    END LOOP;
  END IF;

  IF boleh AND p_dari_id IS NOT DISTINCT FROM public.jtm_induk_di_penyulang(p_tiang_id, s.penyulang) THEN
    boleh := false;
  END IF;

  -- Melingkar di penyulang ini?
  IF boleh THEN
    naik := p_dari_id; n := 0;
    WHILE naik IS NOT NULL AND n < 5000 LOOP
      IF naik = p_tiang_id THEN boleh := false; EXIT; END IF;
      naik := public.jtm_induk_di_penyulang(naik, s.penyulang);
      n := n + 1;
    END LOOP;
  END IF;

  IF boleh THEN
    UPDATE public.tiang_kode_penyulang SET induk_id = p_dari_id, updated_at = now()
    WHERE tiang_id = p_tiang_id AND upper(penyulang) = upper(s.penyulang);

    -- Nama yang baru lahir di permintaan ini (now() = awal transaksi).
    IF kp.created_at >= now() THEN
      -- Nama sementara ("pangkal" dari pemicu) dilepas dulu, kalau tidak dia
      -- dianggap terpakai dan nama barunya meloncat satu nomor.
      UPDATE public.tiang_kode_penyulang SET kode = '~' || left(p_tiang_id::text, 8) || '~'
      WHERE tiang_id = p_tiang_id AND upper(penyulang) = upper(s.penyulang);
      SELECT h.kode INTO kode_baru
      FROM public.jtm_nama_baru(p_dari_id, t.lat, t.lng, false, s.penyulang, COALESCE(s.ulp, t.ulp, '-'), t.id) h;
      IF kode_baru IS NOT NULL AND NOT EXISTS (
        SELECT 1 FROM public.tiang_kode_penyulang x
        WHERE upper(x.ulp) = upper(kp.ulp) AND upper(x.penyulang) = upper(kp.penyulang)
          AND upper(x.kode) = upper(kode_baru) AND x.tiang_id <> p_tiang_id
      ) THEN
        UPDATE public.tiang_kode_penyulang SET kode = kode_baru, updated_at = now()
        WHERE tiang_id = p_tiang_id AND upper(penyulang) = upper(s.penyulang);
      ELSE
        UPDATE public.tiang_kode_penyulang SET kode = kp.kode
        WHERE tiang_id = p_tiang_id AND upper(penyulang) = upper(s.penyulang);
      END IF;
    END IF;

    INSERT INTO public.master_audit
      (entitas, entitas_kode, ulp, field, nilai_lama, nilai_baru, aksi, oleh_uid, oleh_nama)
    VALUES ('tiang', COALESCE(kode_baru, kp.kode), COALESCE(t.ulp, '-'), 'induk_penyulang',
            jsonb_build_object('penyulang', s.penyulang, 'induk', NULL),
            jsonb_build_object('penyulang', s.penyulang,
              'induk', (SELECT kode FROM public.tiang_kode_penyulang
                        WHERE tiang_id = p_dari_id AND upper(penyulang) = upper(s.penyulang)),
              'lewat', 'menumpang'),
            'lapangan', auth.uid(), p_nama);
  END IF;

  RETURN d || jsonb_build_object(
    'kode', (SELECT kode FROM public.tiang_kode_penyulang
             WHERE tiang_id = p_tiang_id AND upper(penyulang) = upper(s.penyulang)),
    'induk_diatur', boleh);
END $fn$;

GRANT EXECUTE ON FUNCTION public.tumpangi_tiang_jtm_dari(UUID, UUID, UUID, TEXT) TO authenticated;
