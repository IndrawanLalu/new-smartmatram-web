-- =============================================================================
-- CEK SAJA — tidak mengubah apa pun. Jalankan SEBELUM `wo-jtm-tier.sql`.
-- `rencana-wo-jtm-tier2.md` keputusan 3.
--
-- Pemicu `jtm_sambung_wo` (wo-inspeksi-jtm.sql) menyambungkan inspeksi ke
-- item WO terbuka hanya menurut SEGMEN, tanpa melihat tier. Semua WO JTM
-- selama ini Tier 1, jadi inspeksi Tier 2 di segmen yang sedang ber-WO ikut
-- tersambung ke item Tier 1 — dan kalau disetujui, menutup item Tier 1 itu
-- (`jtm_tutup_item_wo`) padahal Tier 1-nya belum dikerjakan.
--
-- Hasilnya dibaca user dulu; perbaikannya diputuskan sesudah itu.
-- =============================================================================

-- 1. Inspeksi Tier 2 yang tersambung ke item WO (semua item WO masih Tier 1).
SELECT m.id            AS inspeksi_id,
       m.ulp,
       m.penyulang,
       s.nama          AS segmen,
       m.tier,
       m.status        AS status_inspeksi,
       m.tgl_selesai,
       w.nama          AS wo,
       w.tgl_wo,
       i.status        AS status_item_wo
FROM public.inspeksi_jtm m
JOIN public.wo_inspeksi_item i ON i.id = m.wo_item_id
JOIN public.wo_inspeksi w      ON w.id = i.wo_id
LEFT JOIN public.segmen s      ON s.id = m.segmen_id
WHERE COALESCE(m.tier, '1') <> '1'
ORDER BY m.ulp, w.tgl_wo, s.nama;

-- 2. Item WO yang TERTUTUP oleh inspeksi Tier 2 — tanpa satu pun inspeksi
--    Tier 1 yang disetujui di item itu. Item inilah yang seharusnya masih
--    terbuka (target Tier 1 terhitung selesai padahal belum).
SELECT i.id     AS item_id,
       i.ulp,
       i.objek_nama AS segmen,
       w.nama   AS wo,
       w.tgl_wo,
       i.panjang_km
FROM public.wo_inspeksi_item i
JOIN public.wo_inspeksi w ON w.id = i.wo_id
WHERE i.jenis = 'JTM' AND i.status = 'Selesai'
  AND EXISTS (SELECT 1 FROM public.inspeksi_jtm m
              WHERE m.wo_item_id = i.id AND COALESCE(m.tier, '1') <> '1' AND m.status = 'Diverifikasi')
  AND NOT EXISTS (SELECT 1 FROM public.inspeksi_jtm m
                  WHERE m.wo_item_id = i.id AND COALESCE(m.tier, '1') = '1' AND m.status = 'Diverifikasi')
ORDER BY i.ulp, w.tgl_wo;

-- 3. Ringkasan per ULP.
SELECT m.ulp,
       count(*)                                         AS inspeksi_t2_tersambung,
       count(*) FILTER (WHERE m.status = 'Diverifikasi') AS sudah_disetujui
FROM public.inspeksi_jtm m
WHERE m.wo_item_id IS NOT NULL AND COALESCE(m.tier, '1') <> '1'
GROUP BY m.ulp
ORDER BY m.ulp;
