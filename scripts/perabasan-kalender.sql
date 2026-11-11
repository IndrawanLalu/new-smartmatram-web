-- =============================================================================
-- Dashboard Perabasan: kalender rabas per penyulang/segmen + siklus rabas
-- per ULP + usulan WO bulan depan (11 Nov 2026). Jalankan SESUDAH
-- wo-perabasan.sql, wo-perabasan-regu.sql, wo-daftar-garansi.sql,
-- master-segmen-cepat.sql. Idempoten.
--
-- Keputusan user 11 Nov:
--   • Daftar penyulang = tabel KALENDER bulanan: bulan berapa penyulang /
--     segmen itu dirabas. Dirabas sebagian segmen saja harus terlihat.
--   • Siklus rabas diatur per ULP, bawaan 2 bulan. Garansi perabasan 1 bulan
--     (pengaturan garansi yang sudah ada, sla_kinerja — tidak dibuat dua kali).
--   • Usulan WO bulan depan = siklus saja (temuan ROW inspeksi tidak dihitung).
--   • "Terakhir dirabas" = segmen DIVERIFIKASI, bulan = tanggal MULAI dirabas
--     (aturan capaian & Rekap Kinerja).
-- =============================================================================

-- ── 1. Siklus rabas per ULP ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.perabasan_siklus (
  ulp         TEXT PRIMARY KEY,
  bulan       INT  NOT NULL DEFAULT 2 CHECK (bulan BETWEEN 1 AND 24),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_oleh TEXT
);
ALTER TABLE public.perabasan_siklus ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS perabasan_siklus_baca ON public.perabasan_siklus;
CREATE POLICY perabasan_siklus_baca ON public.perabasan_siklus FOR SELECT TO authenticated USING (true);
GRANT SELECT ON public.perabasan_siklus TO authenticated;

CREATE OR REPLACE FUNCTION public.simpan_perabasan_siklus(p_ulp TEXT, p_bulan INT, p_oleh TEXT DEFAULT NULL)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
BEGIN
  PERFORM public.wajib_boleh_ulp(upper(p_ulp));
  IF COALESCE(p_bulan, 0) NOT BETWEEN 1 AND 24 THEN RAISE EXCEPTION 'Siklus rabas 1–24 bulan.'; END IF;
  INSERT INTO public.perabasan_siklus (ulp, bulan, updated_at, updated_oleh)
  VALUES (upper(p_ulp), p_bulan, now(), p_oleh)
  ON CONFLICT (ulp) DO UPDATE SET bulan = EXCLUDED.bulan, updated_at = now(), updated_oleh = EXCLUDED.updated_oleh;
END $fn$;
REVOKE ALL ON FUNCTION public.simpan_perabasan_siklus(TEXT, INT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.simpan_perabasan_siklus(TEXT, INT, TEXT) TO authenticated;


-- ── 2. Kalender per segmen ───────────────────────────────────────────────────
-- Satu JSON (satu kali hitung, bukan per 1.000 baris). Per segmen aktif:
--   km, terakhir dirabas (diverifikasi, sepanjang masa) + regunya,
--   rabas[]  bulan (1–12) tahun p_tahun yang segmen itu dirabas (diverifikasi),
--   wo[]     bulan WO tahun p_tahun yang segmen itu di-WO-kan tapi BELUM
--            diverifikasi (masih jalan / tertunda / ditolak),
--   wo_aktif nama WO yang sekarang masih memegang segmen ini (belum diverifikasi),
--   garansi_sampai  bila segmen masih bergaransi di awal bulan depan.
CREATE OR REPLACE FUNCTION public.perabasan_kalender(p_ulp TEXT, p_tahun INT)
RETURNS JSONB
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $fn$
  WITH u AS (SELECT NULLIF(upper(btrim(COALESCE(p_ulp, ''))), 'SEMUA') AS ulp),
  bulan_depan AS (SELECT (date_trunc('month', (now() AT TIME ZONE 'Asia/Makassar')) + interval '1 month')::date AS tgl),
  seg AS (
    SELECT p.segmen_id, upper(p.ulp) AS ulp, p.penyulang, p.nama, p.panjang_pakai_km AS km
    FROM public.segmen_panjang p, u
    WHERE p.status = 'aktif' AND (u.ulp IS NULL OR upper(p.ulp) = u.ulp)
  ),
  it AS (
    SELECT i.segmen_id, i.status, i.tgl_mulai, i.regu, w.tgl_wo, w.nama AS wo_nama, w.status AS wo_status
    FROM public.wo_perabasan_item i
    JOIN public.wo_perabasan w ON w.id = i.wo_id
    JOIN seg ON seg.segmen_id = i.segmen_id
    WHERE i.status <> 'Dibatalkan' AND w.status <> 'Dibatalkan'
  ),
  terakhir AS (
    SELECT DISTINCT ON (segmen_id) segmen_id, tgl_mulai, regu
    FROM it WHERE status = 'Diverifikasi' AND tgl_mulai IS NOT NULL
    ORDER BY segmen_id, tgl_mulai DESC
  ),
  garansi AS (
    SELECT g.objek::uuid AS segmen_id, max(g.garansi_sampai) AS sampai
    FROM (SELECT DISTINCT ulp FROM seg) s, bulan_depan b,
         LATERAL public.garansi_objek('perabasan', s.ulp, b.tgl) g
    GROUP BY 1
  )
  SELECT jsonb_build_object(
    'bulan_depan', (SELECT tgl FROM bulan_depan),
    'siklus', COALESCE((SELECT jsonb_object_agg(ulp, bulan) FROM public.perabasan_siklus), '{}'::jsonb),
    'segmen', COALESCE(jsonb_agg(jsonb_build_object(
      'id', s.segmen_id, 'ulp', s.ulp, 'penyulang', s.penyulang, 'nama', s.nama, 'km', s.km,
      'terakhir', t.tgl_mulai, 'terakhir_regu', t.regu,
      'rabas', (SELECT COALESCE(jsonb_agg(DISTINCT extract(month FROM x.tgl_mulai)::int), '[]'::jsonb) FROM it x
                WHERE x.segmen_id = s.segmen_id AND x.status = 'Diverifikasi'
                  AND extract(year FROM x.tgl_mulai) = p_tahun),
      'wo', (SELECT COALESCE(jsonb_agg(DISTINCT extract(month FROM x.tgl_wo)::int), '[]'::jsonb) FROM it x
             WHERE x.segmen_id = s.segmen_id AND x.status <> 'Diverifikasi'
               AND extract(year FROM x.tgl_wo) = p_tahun),
      'wo_aktif', (SELECT x.wo_nama FROM it x
                   WHERE x.segmen_id = s.segmen_id AND x.wo_status = 'Terbit'
                     AND x.status IN ('Dijadwalkan', 'Dalam Proses', 'Selesai', 'Ditolak')
                   ORDER BY x.tgl_wo DESC LIMIT 1),
      'garansi_sampai', g.sampai
    ) ORDER BY s.ulp, s.penyulang, s.nama), '[]'::jsonb)
  )
  FROM seg s
  LEFT JOIN terakhir t ON t.segmen_id = s.segmen_id
  LEFT JOIN garansi g ON g.segmen_id = s.segmen_id;
$fn$;
REVOKE ALL ON FUNCTION public.perabasan_kalender(TEXT, INT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.perabasan_kalender(TEXT, INT) TO authenticated;

NOTIFY pgrst, 'reload schema';

-- ── Periksa ──────────────────────────────────────────────────────────────────
--   SELECT jsonb_array_length(public.perabasan_kalender('AMPENAN', 2026)->'segmen');
--   EXPLAIN ANALYZE SELECT public.perabasan_kalender(NULL, 2026);
