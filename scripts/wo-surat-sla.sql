-- =============================================================================
-- Cetak/Kirim WO: sakelar WO / SLA per pekerjaan (4 Nov 2026).
-- Jalankan manual di Supabase SQL Editor, SESUDAH wo-pemerataan-tunggakan.sql.
-- Idempoten.
--
-- Masalah: Inspeksi JTM Tier 1 rintis (segmen lahir dari penitikan), Inspeksi
-- JTR (KMS WO ikut penitikan) dan Pemeliharaan Jaringan tidak punya WO tersusun
-- di awal bulan → halaman 1 surat 0 / 20 KMS, padahal ULP lain yang menyusun
-- segmennya dulu sudah sesuai SLA.
-- Keputusan user 4 Nov: sakelar di samping "Tempel dari Excel", per pekerjaan:
--   • WO  (bawaan) = WO tersusun, walau sedikit di bawah SLA;
--   • SLA          = volume = SLA, lampiran tanpa daftar objek, keterangan
--                    "SESUAI SLA".
-- Surat = Rekap Kinerja, jadi WO terbit Rekap Kinerja ikut sakelar ini.
--
-- Isi:
--   1. wo_surat_mode (ulp, tahun, bulan, kunci) — baris ada = pakai SLA.
--   2. atur_wo_surat_mode — UP3 semua ULP, admin ULP-nya sendiri.
--   3. rekap_kinerja (pembungkus _rekap_kinerja_inti + SLA): wo_terbit = SLA
--      untuk pekerjaan bersakelar SLA. Semua ULP / setahun = dijumlah per ULP-bulan.
--      ⚠ Definisi terbaru rekap_kinerja kini di SINI (dulu sla-kinerja.sql).
-- =============================================================================

-- ── 1. Sakelar ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.wo_surat_mode (
  ulp       TEXT NOT NULL,
  tahun     INT  NOT NULL,
  bulan     INT  NOT NULL,
  kunci     TEXT NOT NULL,
  oleh      TEXT,
  diubah_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (ulp, tahun, bulan, kunci)
);

COMMENT ON TABLE public.wo_surat_mode IS
  'Pekerjaan yang WO-nya SESUAI SLA (surat WO & Rekap Kinerja), per ULP per bulan. Tidak ada baris = pakai WO tersusun.';

ALTER TABLE public.wo_surat_mode ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS wo_surat_mode_baca ON public.wo_surat_mode;
CREATE POLICY wo_surat_mode_baca ON public.wo_surat_mode FOR SELECT TO authenticated USING (true);


-- ── 2. Mengubah sakelar ──────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.atur_wo_surat_mode(
  p_ulp TEXT, p_tahun INT, p_bulan INT, p_kunci TEXT, p_sla BOOLEAN, p_oleh TEXT DEFAULT NULL
) RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  v_role TEXT;
  v_unit TEXT;
  u      TEXT := upper(btrim(COALESCE(p_ulp, '')));
BEGIN
  SELECT role, unit INTO v_role, v_unit FROM public.user_roles WHERE user_id = auth.uid();
  IF v_role IS NULL OR v_role NOT IN ('UP3', 'admin') THEN
    RAISE EXCEPTION 'Hanya UP3 dan admin yang boleh mengubah WO / SLA.';
  END IF;
  IF v_role = 'admin' AND upper(COALESCE(v_unit, '')) <> u THEN
    RAISE EXCEPTION 'Admin hanya boleh mengubah WO ULP %.', COALESCE(v_unit, '-');
  END IF;
  IF p_sla THEN
    INSERT INTO public.wo_surat_mode (ulp, tahun, bulan, kunci, oleh)
    VALUES (u, p_tahun, p_bulan, p_kunci, p_oleh)
    ON CONFLICT (ulp, tahun, bulan, kunci) DO UPDATE SET oleh = EXCLUDED.oleh, diubah_at = now();
  ELSE
    DELETE FROM public.wo_surat_mode
    WHERE ulp = u AND tahun = p_tahun AND bulan = p_bulan AND kunci = p_kunci;
  END IF;
END $fn$;

REVOKE ALL ON FUNCTION public.atur_wo_surat_mode(TEXT, INT, INT, TEXT, BOOLEAN, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.atur_wo_surat_mode(TEXT, INT, INT, TEXT, BOOLEAN, TEXT) TO authenticated;


-- ── 3. Rekap kinerja ─────────────────────────────────────────────────────────
-- Satu ULP satu bulan (layar biasa & surat): WO terbit langsung diganti SLA —
-- tanpa hitungan tambahan. Semua ULP / setahun: tiap pasangan (ULP, bulan)
-- bersakelar SLA menyumbang selisih (SLA − WO tersusun) ke jumlahnya.
CREATE OR REPLACE FUNCTION public.rekap_kinerja(p_ulp TEXT, p_tahun INT, p_bulan INT)
RETURNS TABLE (kunci TEXT, wo_terbit NUMERIC, realisasi NUMERIC, belum_disetujui NUMERIC, luar_wo NUMERIC, sla NUMERIC)
LANGUAGE plpgsql STABLE SET search_path = public AS $fn$
DECLARE
  u      TEXT := NULLIF(NULLIF(upper(btrim(COALESCE(p_ulp, ''))), ''), 'SEMUA');
  g      RECORD;
  tambah JSONB := '{}'::jsonb;
  selisih NUMERIC;
  k      TEXT;
BEGIN
  IF u IS NULL OR p_bulan = 0 THEN
    FOR g IN
      SELECT m.ulp, m.tahun, m.bulan, array_agg(m.kunci) AS kunci
      FROM public.wo_surat_mode m
      WHERE m.tahun = p_tahun AND (p_bulan = 0 OR m.bulan = p_bulan) AND (u IS NULL OR m.ulp = u)
      GROUP BY 1, 2, 3
    LOOP
      FOREACH k IN ARRAY g.kunci LOOP
        SELECT COALESCE(public.sla_rekap(g.ulp, k, g.tahun, g.bulan), 0) - COALESCE(x.wo_terbit, 0)
          INTO selisih
        FROM public._rekap_kinerja_inti(g.ulp, g.tahun, g.bulan) x WHERE x.kunci = k;
        IF public.sla_rekap(g.ulp, k, g.tahun, g.bulan) IS NOT NULL THEN
          tambah := jsonb_set(tambah, ARRAY[k], to_jsonb(COALESCE((tambah->>k)::numeric, 0) + COALESCE(selisih, 0)));
        END IF;
      END LOOP;
    END LOOP;
  END IF;

  RETURN QUERY
  SELECT r.kunci,
    CASE
      WHEN u IS NOT NULL AND p_bulan <> 0 AND s.sla IS NOT NULL AND EXISTS (
        SELECT 1 FROM public.wo_surat_mode m
        WHERE m.ulp = u AND m.tahun = p_tahun AND m.bulan = p_bulan AND m.kunci = r.kunci)
        THEN s.sla
      WHEN tambah ? r.kunci THEN COALESCE(r.wo_terbit, 0) + (tambah->>r.kunci)::numeric
      ELSE r.wo_terbit
    END,
    r.realisasi, r.belum_disetujui, r.luar_wo, s.sla
  FROM public._rekap_kinerja_inti(p_ulp, p_tahun, p_bulan) r
  CROSS JOIN LATERAL (SELECT public.sla_rekap(u, r.kunci, p_tahun, p_bulan) AS sla) s;
END $fn$;

GRANT EXECUTE ON FUNCTION public.rekap_kinerja(TEXT, INT, INT) TO authenticated;


-- ── Periksa ──────────────────────────────────────────────────────────────────
--   SELECT * FROM wo_surat_mode;
--   SELECT kunci, wo_terbit, sla FROM rekap_kinerja('AMPENAN', 2026, 11);
