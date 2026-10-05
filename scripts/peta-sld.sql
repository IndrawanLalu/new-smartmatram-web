-- ════════════════════════════════════════════════════════════════════════════
-- Peta SLD — Fase 1: ringkasan per penyulang (5 Okt 2026)
-- ════════════════════════════════════════════════════════════════════════════
-- Rencana: `rencana-peta-sld.md`. Peta SLD menggantikan "Peta Aset"
-- (/admin/peta-gardu). Bentuk SLD-nya sendiri TIDAK disimpan di mana pun: ia
-- diringkas dari pohon tiang (`peta_tiang`) di browser, jadi selalu sama dengan
-- master tiang. Yang disiapkan di sini hanya kartu per penyulang — satu baris
-- per penyulang, supaya daftar di layar tidak menarik ribuan gardu.
--
--   km_tiang        — dari gawang tiang (`penyulang_jtm_panjang`), bila sudah dititik
--   km_segmen       — jumlah panjang segmen (impor/tempelan/lapangan)
--   gardu_*         — Master Gardu menurut `feeder` (nama saja: beberapa
--                     penyulang punya gardu di dua ULP)
--   beban_kva       — pengukuran TERAKHIR tiap gardu (`gardu_latest_state`)
--   gangguan_12bln  — `ml_outage_events` 365 hari terakhir, nama penyulang persis
--                     (yang tercatat di level recloser menyusul di Fase 3)
--
-- Hanya membaca. Aman dijalankan kapan saja.
-- ════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE VIEW public.peta_sld_penyulang AS
WITH g AS (
  SELECT upper(btrim(gd.feeder)) AS penyulang,
         count(*)                                   AS gardu_jumlah,
         COALESCE(sum(gd.daya), 0)                  AS gardu_kva,
         count(s.no_gardu)                          AS gardu_diukur,
         round(COALESCE(sum(s.beban_kva), 0)::numeric, 1) AS beban_kva,
         count(*) FILTER (WHERE s.persen_beban >= 80) AS gardu_overload
  FROM public.gardu gd
  LEFT JOIN public.gardu_latest_state s ON upper(s.no_gardu) = upper(gd.kode)
  WHERE gd.feeder IS NOT NULL AND COALESCE(gd.status, 'Aktif') ILIKE 'aktif'
  GROUP BY 1
), sg AS (
  SELECT upper(penyulang) AS penyulang, count(*) AS segmen_jumlah,
         round(COALESCE(sum(panjang_manual_km), 0)::numeric, 3) AS km_segmen
  FROM public.segmen WHERE status = 'aktif'
  GROUP BY 1
), gg AS (
  SELECT upper(penyulang) AS penyulang, count(*) AS gangguan_12bln
  FROM public.ml_outage_events
  WHERE tgl_gangguan >= current_date - 365
  GROUP BY 1
)
SELECT r.penyulang,
       r.ulp,
       r.kode_singkat,
       COALESCE(p.tiang_dimiliki, 0)       AS tiang_jumlah,
       p.panjang_penghantar_km             AS km_tiang,
       sg.km_segmen,
       COALESCE(sg.segmen_jumlah, 0)       AS segmen_jumlah,
       COALESCE(g.gardu_jumlah, 0)         AS gardu_jumlah,
       COALESCE(g.gardu_kva, 0)            AS gardu_kva,
       COALESCE(g.gardu_diukur, 0)         AS gardu_diukur,
       COALESCE(g.beban_kva, 0)            AS beban_kva,
       COALESCE(g.gardu_overload, 0)       AS gardu_overload,
       COALESCE(gg.gangguan_12bln, 0)      AS gangguan_12bln
FROM public.penyulang_ref r
LEFT JOIN public.penyulang_jtm_panjang p ON upper(p.penyulang) = upper(r.penyulang)
LEFT JOIN g  ON g.penyulang  = upper(r.penyulang)
LEFT JOIN sg ON sg.penyulang = upper(r.penyulang)
LEFT JOIN gg ON gg.penyulang = upper(r.penyulang);

GRANT SELECT ON public.peta_sld_penyulang TO authenticated;

-- Periksa:
--   SELECT * FROM peta_sld_penyulang ORDER BY tiang_jumlah DESC LIMIT 12;
