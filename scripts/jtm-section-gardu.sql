-- =============================================================================
-- X4 — Gardu per section & segmen + gardu yang belum masuk segmen (25 Okt 2026)
-- Jalankan SESUDAH master-segmen-cepat.sql. Idempoten. Hanya-baca.
--
-- Gardu diletakkan di tiang (`tiang.gardu_di_tiang`); kVA & penyulangnya dari
-- MASTER GARDU (`gardu.daya`, `gardu.feeder`). Gardu yang di master Nonaktif
-- tidak dihitung (status kosong = aktif, 812 baris master tanpa status); kode
-- di tiang yang tidak ada di master tetap dihitung, tanpa kVA (sama dengan
-- Rekap Data Master Penyulang).
--
-- Tiang bersama: gardu dihitung di SATU penyulang —
--   • tiang hanya dipikul satu penyulang → penyulang itu;
--   • dipikul beberapa → penyulang sesuai master gardu (feeder);
--   • feeder master bukan salah satu pemikul (atau gardu tak ada di master) →
--     pemilik tiang.
--
--   • gardu_jtm_tiang     — gardu di tiang + penyulang yang menghitungnya.
--   • section_rekap       — + jumlah_gardu, gardu_kva (kolom ditambah di belakang).
--   • segmen_gardu        — jumlah gardu & kVA per segmen.
--   • gardu_belum_segmen  — gardu master tiap penyulang yang belum berada di
--     segmen aktif mana pun di penyulang itu; `di_section` = tiangnya sudah
--     ada di pohon penyulang (tinggal dimasukkan ke segmen) atau belum sama
--     sekali (belum dititik).
-- =============================================================================


-- ── 1. Gardu di tiang ────────────────────────────────────────────────────────
CREATE OR REPLACE VIEW public.gardu_jtm_tiang AS
WITH g AS (
  SELECT DISTINCT ON (upper(btrim(kode)))
         upper(btrim(kode)) AS kode, upper(btrim(feeder)) AS feeder, daya,
         lower(COALESCE(status, 'aktif')) = 'aktif' AS aktif
  FROM public.gardu
  ORDER BY upper(btrim(kode)), (lower(COALESCE(status, 'aktif')) = 'aktif') DESC, daya DESC NULLS LAST
), k AS (
  SELECT tiang_id, upper(penyulang) AS p, upper(COALESCE(ulp, '-')) AS u,
         count(*) OVER (PARTITION BY tiang_id) AS n
  FROM public.tiang_kode_penyulang
)
SELECT t.id AS tiang_id, k.p, k.u, upper(btrim(t.gardu_di_tiang)) AS gardu_kode, g.daya, (g.kode IS NOT NULL) AS di_master
FROM public.tiang t
JOIN k ON k.tiang_id = t.id
LEFT JOIN g ON g.kode = upper(btrim(t.gardu_di_tiang))
WHERE t.status_hidup = 'aktif' AND NULLIF(btrim(t.gardu_di_tiang), '') IS NOT NULL
  AND g.aktif IS NOT FALSE   -- nonaktif di master tidak dihitung; yang tak ada di master tetap (sama dengan Rekap Data)
  AND (k.n = 1
       OR g.feeder = k.p
       OR (NOT EXISTS (SELECT 1 FROM public.tiang_kode_penyulang x
                        WHERE x.tiang_id = t.id AND upper(x.penyulang) = g.feeder)
           AND upper(COALESCE(t.penyulang, '')) = k.p));
COMMENT ON VIEW public.gardu_jtm_tiang IS
  'Gardu di tiang JTM beserta SATU penyulang yang menghitungnya (tiang bersama: feeder master gardu, kalau bukan pemikul: pemilik tiang). daya dari master gardu.';
GRANT SELECT ON public.gardu_jtm_tiang TO authenticated;


-- ── 2. Rekap section + gardu ─────────────────────────────────────────────────
-- Salinan master-segmen-cepat.sql; kolom gardu ditambah di BELAKANG
-- (CREATE OR REPLACE VIEW hanya boleh menambah kolom di akhir).
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
), gd AS (   -- ★ gardu
  SELECT d.section_id, count(*) AS n, COALESCE(sum(d.daya), 0) AS kva
  FROM (
    SELECT DISTINCT x.section_id, gt.gardu_kode, gt.daya
    FROM public.section_tiang x
    JOIN public.section sc ON sc.id = x.section_id
    JOIN public.gardu_jtm_tiang gt ON gt.tiang_id = x.tiang_id AND gt.p = upper(sc.penyulang) AND gt.u = upper(sc.ulp)
  ) d
  GROUP BY d.section_id
)
SELECT sc.id AS section_id, sc.penyulang, sc.ulp, sc.nama, sc.jenis_hulu, sc.urutan,
  sc.jumlah_tiang, sc.panjang_km,
  COALESCE(js.n, 0) AS jumlah_segmen,
  COALESCE(tt.n, 0) AS tiang_tanpa_segmen,
  COALESCE(gd.n, 0) AS jumlah_gardu,   -- ★
  COALESCE(gd.kva, 0) AS gardu_kva      -- ★
FROM public.section sc
LEFT JOIN js ON js.section_id = sc.id
LEFT JOIN tt ON tt.section_id = sc.id
LEFT JOIN gd ON gd.section_id = sc.id;


-- ── 3. Gardu per segmen ──────────────────────────────────────────────────────
CREATE OR REPLACE VIEW public.segmen_gardu AS
SELECT d.segmen_id, count(*) AS jumlah_gardu, COALESCE(sum(d.daya), 0) AS gardu_kva,
       string_agg(d.gardu_kode, ', ' ORDER BY d.gardu_kode) AS gardu
FROM (
  SELECT DISTINCT st.segmen_id, gt.gardu_kode, gt.daya
  FROM public.segmen_tiang st
  JOIN public.segmen s ON s.id = st.segmen_id AND s.status = 'aktif'
  JOIN public.gardu_jtm_tiang gt ON gt.tiang_id = st.tiang_id
   AND gt.p = upper(s.penyulang) AND gt.u = upper(COALESCE(s.ulp, '-'))
) d
GROUP BY d.segmen_id;
COMMENT ON VIEW public.segmen_gardu IS 'Jumlah gardu & kVA (master gardu) di tiang segmen aktif, tiang bersama dihitung di satu penyulang (gardu_jtm_tiang).';
GRANT SELECT ON public.segmen_gardu TO authenticated;


-- ── 4. Gardu master yang belum masuk segmen penyulangnya ─────────────────────
CREATE OR REPLACE VIEW public.gardu_belum_segmen AS
WITH g AS (
  SELECT DISTINCT ON (upper(btrim(kode)))
         upper(btrim(kode)) AS kode, nama, daya, upper(btrim(feeder)) AS penyulang, upper(btrim(ulp)) AS ulp
  FROM public.gardu
  WHERE lower(COALESCE(status, 'aktif')) = 'aktif' AND NULLIF(btrim(feeder), '') IS NOT NULL
  ORDER BY upper(btrim(kode)), daya DESC NULLS LAST
)
SELECT g.kode, g.nama, g.daya, g.penyulang, g.ulp,
  EXISTS (SELECT 1 FROM public.gardu_jtm_tiang gt WHERE gt.gardu_kode = g.kode AND gt.p = g.penyulang) AS di_section
FROM g
WHERE NOT EXISTS (
  SELECT 1
  FROM public.gardu_jtm_tiang gt
  JOIN public.segmen_tiang st ON st.tiang_id = gt.tiang_id
  JOIN public.segmen s ON s.id = st.segmen_id AND s.status = 'aktif' AND upper(s.penyulang) = gt.p
  WHERE gt.gardu_kode = g.kode AND gt.p = g.penyulang);
COMMENT ON VIEW public.gardu_belum_segmen IS
  'Gardu aktif master tiap penyulang (feeder) yang belum ada di segmen aktif mana pun di penyulang itu. di_section = tiangnya sudah di pohon penyulang (tinggal masuk segmen).';
GRANT SELECT ON public.gardu_belum_segmen TO authenticated;


-- ── Periksa ──────────────────────────────────────────────────────────────────
--   SELECT nama, jumlah_gardu, gardu_kva FROM section_rekap WHERE penyulang = 'AMPENAN' ORDER BY urutan;
--   SELECT penyulang, count(*), count(*) FILTER (WHERE di_section) FROM gardu_belum_segmen GROUP BY 1 ORDER BY 1;
