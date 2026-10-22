-- ════════════════════════════════════════════════════════════════════════════
-- peta_gardu cepat — jumlah tiang JTR dihitung SEKALI, bukan per gardu (22 Okt 2026)
-- ════════════════════════════════════════════════════════════════════════════
-- Gejala: /peta "canceling statement due to statement timeout" saat dibuka —
-- panel kiri (peta_daftar) kosong, jadi JTM, JTR, dan gardu tidak muncul.
--
-- Sebab: `jumlah_tiang` di peta_gardu adalah subquery per gardu ke view
-- `jtr_tiang` (UNION tiang + tiang_jtr_tumpang, dengan upper() di kedua sisi).
-- 2.544 gardu × 6.657 tiang JTR = belasan juta pembandingan → >8 detik.
--
-- Sekarang: tiang JTR aktif dikelompokkan per kode gardu sekali (hash), lalu
-- disambungkan. Hitungannya SAMA dengan yang lama: tiang milik gardu yang
-- aktif + tiang tumpangan yang aktif & batangnya aktif.
--
-- Kolom tetap sama dan berurutan sama, jadi peta_daftar dan semua pembaca
-- tidak perlu diubah. Aman dijalankan kapan saja (hanya mengganti view).
-- ════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE VIEW public.peta_gardu AS
WITH jumlah AS (
  SELECT kode, count(*) AS n
  FROM (
    SELECT upper(t.gardu_kode) AS kode
    FROM public.tiang t
    WHERE t.gardu_kode IS NOT NULL AND t.status_hidup = 'aktif'
    UNION ALL
    SELECT upper(m.gardu_kode)
    FROM public.tiang_jtr_tumpang m
    JOIN public.tiang t ON t.id = m.tiang_id
    WHERE m.status = 'aktif' AND t.status_hidup = 'aktif'
  ) x
  GROUP BY kode
)
SELECT g.kode,
    g.nama,
    g.ulp,
    g.feeder,
    g.daya,
    g.lat,
    g.lng,
    COALESCE(j.n, 0)::bigint AS jumlah_tiang
FROM public.gardu g
LEFT JOIN jumlah j ON j.kode = upper(g.kode)
WHERE g.lat IS NOT NULL AND g.lng IS NOT NULL;

-- Periksa sesudah dijalankan (harus selesai jauh di bawah 1 detik):
--   EXPLAIN ANALYZE SELECT count(*) FROM public.peta_daftar;
