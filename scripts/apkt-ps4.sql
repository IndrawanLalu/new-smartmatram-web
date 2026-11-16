-- =============================================================================
-- Realisasi PS4 (16 Nov 2026). Idempoten. Membutuhkan apkt-foto.sql.
--
-- Per petugas APKT, laporan berstatus persis 'Selesai' dalam rentang tanggal:
--   Laporan   = laporan Selesai (penyebut kedua versi)
--   Berfoto   = punya minimal 1 foto (Dalam Pengerjaan atau Selesai)
--   Versi tanpa verifikasi : Berfoto ÷ Laporan
--   Versi verifikasi       : Masuk PS4 ÷ Laporan (hanya yang berfoto bisa diverifikasi)
-- Laporan yang belum diambil pekerja (petugas belum diketahui) = baris petugas NULL.
--
-- Verifikasi: UP3 semua ULP, admin hanya ULP sendiri. Akun selain UP3 hanya
-- melihat ULP sendiri.
-- =============================================================================

-- ULP yang boleh dilihat akun ini: UP3 = pilihan (NULL semua), lainnya = unit sendiri.
CREATE OR REPLACE FUNCTION public._ps4_ulp(p_ulp TEXT)
RETURNS TEXT LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_role TEXT; v_unit TEXT;
BEGIN
  SELECT role, unit INTO v_role, v_unit FROM public.user_roles WHERE user_id = auth.uid();
  IF v_role IS NULL THEN
    RAISE EXCEPTION 'Sesi tidak dikenali server. Keluar lalu masuk lagi.';
  END IF;
  IF v_role = 'UP3' THEN RETURN NULLIF(upper(btrim(p_ulp)), ''); END IF;
  RETURN upper(COALESCE(v_unit, '-'));
END $$;

CREATE OR REPLACE FUNCTION public.realisasi_ps4(p_dari DATE, p_sampai DATE, p_ulp TEXT)
RETURNS TABLE (petugas TEXT, laporan INT, berfoto INT, diverifikasi INT, masuk_ps4 INT)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH u AS (SELECT public._ps4_ulp(p_ulp) AS ulp),
  l AS (
    SELECT f.petugas,
           EXISTS (SELECT 1 FROM public.apkt_foto a WHERE a.no_laporan = g.no_laporan) AS berfoto,
           f.ps4
    FROM public.apkt_gangguan g
    CROSS JOIN u
    LEFT JOIN public.apkt_foto_laporan f ON f.no_laporan = g.no_laporan
    WHERE g.status_akhir = 'Selesai'
      AND g.tgl_lapor BETWEEN p_dari AND p_sampai
      AND (u.ulp IS NULL OR upper(g.ulp) = u.ulp)
  )
  SELECT petugas, count(*)::int,
         count(*) FILTER (WHERE berfoto)::int,
         count(*) FILTER (WHERE berfoto AND ps4 IS NOT NULL)::int,
         count(*) FILTER (WHERE berfoto AND ps4 = 'ya')::int
  FROM l
  GROUP BY petugas
  ORDER BY petugas NULLS LAST
$$;

-- Daftar laporan satu petugas (p_petugas NULL = belum diambil pekerja).
CREATE OR REPLACE FUNCTION public.realisasi_ps4_laporan(
  p_dari DATE, p_sampai DATE, p_ulp TEXT, p_petugas TEXT, p_belum_verifikasi BOOLEAN)
RETURNS TABLE (no_laporan TEXT, waktu_lapor TEXT, alamat_pelapor TEXT, keterangan_pelapor TEXT,
               penyebab TEXT, status_foto TEXT, ps4 TEXT, ps4_oleh TEXT, foto JSONB)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH u AS (SELECT public._ps4_ulp(p_ulp) AS ulp)
  SELECT g.no_laporan, g.waktu_lapor, g.alamat_pelapor, g.keterangan_pelapor, g.penyebab,
         f.status, f.ps4, f.ps4_oleh,
         COALESCE((SELECT jsonb_agg(jsonb_build_object('tahap', a.tahap, 'path', a.path) ORDER BY a.tahap)
                   FROM public.apkt_foto a WHERE a.no_laporan = g.no_laporan), '[]'::jsonb)
  FROM public.apkt_gangguan g
  CROSS JOIN u
  LEFT JOIN public.apkt_foto_laporan f ON f.no_laporan = g.no_laporan
  WHERE g.status_akhir = 'Selesai'
    AND g.tgl_lapor BETWEEN p_dari AND p_sampai
    AND (u.ulp IS NULL OR upper(g.ulp) = u.ulp)
    AND f.petugas IS NOT DISTINCT FROM p_petugas
    AND (NOT p_belum_verifikasi
         OR (f.ps4 IS NULL AND EXISTS (SELECT 1 FROM public.apkt_foto a WHERE a.no_laporan = g.no_laporan)))
  ORDER BY g.tgl_lapor, g.no_laporan
$$;

-- Masuk PS4 / Tidak masuk / batalkan (p_ps4 NULL).
CREATE OR REPLACE FUNCTION public.apkt_ps4_tetapkan(p_no_laporan TEXT, p_ps4 TEXT)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_role TEXT; v_unit TEXT; v_nama TEXT; v_ulp TEXT;
BEGIN
  SELECT role, unit, NULLIF(btrim(name), '') INTO v_role, v_unit, v_nama
  FROM public.user_roles WHERE user_id = auth.uid();
  IF v_role IS NULL THEN
    RAISE EXCEPTION 'Sesi tidak dikenali server. Keluar lalu masuk lagi.';
  END IF;
  IF v_role NOT IN ('UP3', 'admin') THEN
    RAISE EXCEPTION 'Verifikasi PS4 hanya untuk akun UP3 atau admin ULP. Akun ini: %.', v_role;
  END IF;
  IF p_ps4 IS NOT NULL AND p_ps4 NOT IN ('ya', 'tidak') THEN
    RAISE EXCEPTION 'Pilihan verifikasi % tidak dikenal.', p_ps4;
  END IF;

  SELECT upper(ulp) INTO v_ulp FROM public.apkt_gangguan WHERE no_laporan = p_no_laporan;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Laporan % tidak ada di data APKT Smart.', p_no_laporan;
  END IF;
  IF v_role <> 'UP3' AND v_ulp IS DISTINCT FROM upper(COALESCE(v_unit, '')) THEN
    RAISE EXCEPTION 'Laporan % milik ULP %, bukan ULP akun ini (%).', p_no_laporan, COALESCE(v_ulp, '-'), COALESCE(v_unit, '-');
  END IF;
  IF p_ps4 IS NOT NULL AND NOT EXISTS (
       SELECT 1 FROM public.apkt_foto WHERE no_laporan = p_no_laporan AND path IS NOT NULL) THEN
    RAISE EXCEPTION 'Laporan % tidak punya foto yang bisa dilihat — tidak bisa diverifikasi.', p_no_laporan;
  END IF;

  UPDATE public.apkt_foto_laporan
  SET ps4 = p_ps4,
      ps4_oleh = CASE WHEN p_ps4 IS NULL THEN NULL
                      ELSE COALESCE(v_nama, (SELECT email FROM auth.users WHERE id = auth.uid())) END,
      ps4_at = CASE WHEN p_ps4 IS NULL THEN NULL ELSE now() END
  WHERE no_laporan = p_no_laporan;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Foto laporan % belum diambil — tekan Ambil foto dulu.', p_no_laporan;
  END IF;
END $$;

REVOKE ALL ON FUNCTION public._ps4_ulp(TEXT) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.realisasi_ps4(DATE, DATE, TEXT) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.realisasi_ps4_laporan(DATE, DATE, TEXT, TEXT, BOOLEAN) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.apkt_ps4_tetapkan(TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public._ps4_ulp(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.realisasi_ps4(DATE, DATE, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.realisasi_ps4_laporan(DATE, DATE, TEXT, TEXT, BOOLEAN) TO authenticated;
GRANT EXECUTE ON FUNCTION public.apkt_ps4_tetapkan(TEXT, TEXT) TO authenticated;

-- Periksa hasilnya
--   SELECT * FROM realisasi_ps4('2026-11-01', '2026-11-30', NULL);   -- di SQL Editor auth.uid() NULL → galat sesi (wajar)
