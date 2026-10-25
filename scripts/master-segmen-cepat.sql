-- =============================================================================
-- Master Segmen timeout (25 Okt 2026). Jalankan manual di Supabase. Idempoten.
--
-- 1. segmen_panjang.tiang_bersama — subkueri per segmen ke view
--    tiang_jtm_bersama (view itu dihitung penuh tiap dipanggil, ±0,5 dtk).
--    Dengan 1.441 segmen, master_segmen & segmen_panjang (kolom itu) melewati
--    batas waktu. Kini dihitung sekali (CTE `bersama`). Kolom, urutan, tipe
--    dan arti TIDAK berubah — salinan master-segmen.sql, yang berubah ★.
-- 2. section_rekap (X4) — subkueri per section ke segmen_section_utama
--    (dihitung penuh tiap kali). Kini dijumlah sekali per view.
-- =============================================================================


-- ── 1. segmen_panjang ────────────────────────────────────────────────────────
CREATE OR REPLACE VIEW public.segmen_panjang AS
WITH anggota AS (
  SELECT segmen_id, count(*) AS jumlah_tiang
  FROM public.segmen_tiang
  GROUP BY segmen_id
), gawang AS (
  SELECT
    sa.segmen_id,
    count(*)                                       AS jumlah_gawang,
    sum(g.panjang_m)                               AS panjang_m,
    count(*) FILTER (WHERE g.panjang_m IS NULL)    AS gawang_tanpa_titik,
    max(g.panjang_m)                               AS gawang_terpanjang_m
  FROM public.tiang_gawang_jtm g
  JOIN public.segmen_tiang sa ON sa.tiang_id = g.tiang_id
  JOIN public.segmen_tiang si ON si.segmen_id = sa.segmen_id AND si.tiang_id = g.induk_id
  GROUP BY sa.segmen_id
), bersama AS (
  -- ★ Dihitung SEKALI untuk semua segmen. Dulu subkueri per segmen ke view
  --   tiang_jtm_bersama (±0,5 dtk dihitung penuh tiap kali) → 1.441 segmen
  --   = master_segmen timeout (25 Okt 2026).
  SELECT x.segmen_id, count(*) AS n
  FROM public.segmen_tiang x
  JOIN public.tiang_jtm_bersama b ON b.tiang_id = x.tiang_id
  GROUP BY x.segmen_id
)
SELECT
  s.id AS segmen_id,
  s.nama,
  s.penyulang,
  s.ulp,
  s.status,
  s.induk_segmen_id,
  COALESCE(a.jumlah_tiang, 0)                        AS jumlah_tiang,
  COALESCE(gw.jumlah_gawang, 0)                      AS jumlah_gawang,
  round((COALESCE(gw.panjang_m, 0) / 1000)::numeric, 3) AS panjang_km,
  COALESCE(gw.gawang_tanpa_titik, 0)                 AS gawang_tanpa_titik,
  round(gw.gawang_terpanjang_m::numeric, 1)          AS gawang_terpanjang_m,
  COALESCE(bs.n, 0)                                  AS tiang_bersama,   -- ★

  -- ── Baru ──
  s.sumber,
  s.panjang_manual_km,

  -- Hitungan MENANG. Bukan karena lebih besar atau lebih kecil, tapi karena
  -- dia berasal dari titik koordinat yang benar-benar diambil orang di lapangan.
  CASE
    WHEN COALESCE(gw.jumlah_gawang, 0) > 0
      THEN round((COALESCE(gw.panjang_m, 0) / 1000)::numeric, 3)
    ELSE s.panjang_manual_km
  END                                                AS panjang_pakai_km,

  CASE
    WHEN COALESCE(gw.jumlah_gawang, 0) > 0     THEN 'hitungan'
    WHEN s.panjang_manual_km IS NOT NULL       THEN 'ketikan'
    ELSE                                            'kosong'
  END                                                AS panjang_dari
FROM public.segmen s
LEFT JOIN anggota a ON a.segmen_id = s.id
LEFT JOIN gawang gw ON gw.segmen_id = s.id
LEFT JOIN bersama bs ON bs.segmen_id = s.id;   -- ★


-- ── 2. section_rekap ─────────────────────────────────────────────────────────
-- Arti sama dengan jtm-section-daftar.sql; hanya cara menghitungnya.
CREATE OR REPLACE VIEW public.section_rekap AS
WITH js AS (
  SELECT u.section_id, count(*) AS n FROM public.segmen_section_utama u GROUP BY u.section_id
), tt AS (
  SELECT x.section_id, count(*) AS n
  FROM public.section_tiang x
  JOIN public.section sc ON sc.id = x.section_id
  WHERE NOT EXISTS (
    SELECT 1 FROM public.segmen_tiang st
    JOIN public.segmen s ON s.id = st.segmen_id
    WHERE st.tiang_id = x.tiang_id AND s.status = 'aktif' AND upper(s.penyulang) = upper(sc.penyulang))
  GROUP BY x.section_id
)
SELECT sc.id AS section_id, sc.penyulang, sc.ulp, sc.nama, sc.jenis_hulu, sc.urutan,
  sc.jumlah_tiang, sc.panjang_km,
  COALESCE(js.n, 0) AS jumlah_segmen,
  COALESCE(tt.n, 0) AS tiang_tanpa_segmen
FROM public.section sc
LEFT JOIN js ON js.section_id = sc.id
LEFT JOIN tt ON tt.section_id = sc.id;


-- ── Periksa (harus < 2 dtk) ──────────────────────────────────────────────────
--   EXPLAIN ANALYZE SELECT * FROM master_segmen;
--   EXPLAIN ANALYZE SELECT * FROM section_rekap;
