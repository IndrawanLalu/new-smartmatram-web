-- =============================================================================
-- Perbaikan 9 Nov 2026: HP Pemerataan Beban gagal kirim
--   "operator does not exist: text = uuid"
--
-- penyeimbangan_gardu.petugas_uid bertipe TEXT (pemeliharaan_gardu: UUID).
-- simpan_tindakan_penyeimbangan (pekerjaan-tindakan.sql, 5 Nov) membandingkannya
-- langsung dengan auth.uid() → galat untuk regu lapangan (bukan UP3/admin)
-- yang mengisi "pekerjaan yang dikerjakan". Sejak 5 Nov belum satu pun
-- tindakan pemerataan tersimpan. Draf di HP utuh — cukup kirim ulang.
-- Idempoten.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.simpan_tindakan_penyeimbangan(p_id UUID, p_tindakan JSONB)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_role TEXT; v_unit TEXT; s RECORD;
BEGIN
  SELECT role, unit INTO v_role, v_unit FROM public.user_roles WHERE user_id = auth.uid();
  IF v_role IS NULL THEN
    RAISE EXCEPTION 'Sesi tidak dikenali server. Keluar lalu masuk lagi, kemudian simpan ulang.';
  END IF;
  SELECT id, ulp, petugas_uid, no_gardu INTO s FROM public.penyeimbangan_gardu WHERE id = p_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Pekerjaan pemerataan ini tidak ada di server (mungkin sudah dilepas).';
  END IF;
  IF v_role <> 'UP3' AND upper(COALESCE(v_unit, '')) <> upper(COALESCE(s.ulp, '')) THEN
    RAISE EXCEPTION 'Akun ini untuk ULP %, bukan %.', COALESCE(v_unit, '-'), s.ulp;
  END IF;
  -- petugas_uid di tabel ini TEXT → bandingkan sebagai teks.
  IF v_role NOT IN ('UP3', 'admin') AND s.petugas_uid IS DISTINCT FROM auth.uid()::text THEN
    RAISE EXCEPTION 'Pemerataan gardu % dikerjakan akun lain.', s.no_gardu;
  END IF;
  PERFORM public._simpan_tindakan('penyeimbangan', p_id::text, p_tindakan);
END $$;
REVOKE ALL ON FUNCTION public.simpan_tindakan_penyeimbangan(UUID, JSONB) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.simpan_tindakan_penyeimbangan(UUID, JSONB) TO authenticated;
