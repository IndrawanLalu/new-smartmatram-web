-- =============================================================================
-- CEK SAJA — tidak mengubah apa pun. Jalankan SEBELUM `jtm-batal-hp.sql`.
-- `rencana-batal-segmen-hp.md` bagian "45/50 tiang dinilai".
--
-- Tiang yang dihapus karena salah dititik (`batalkan_tiang`) tetap tercatat
-- sebagai anggota segmennya. Daftar persetujuan (`inspeksi_jtm_ringkas`) dan
-- Master Segmen menghitung semua anggota, jadi angkanya "45/50" walau seluruh
-- tiang yang masih berdiri sudah dinilai.
-- =============================================================================

-- 1. Per segmen: anggota yang berstatus batal.
SELECT s.ulp, s.penyulang, s.nama AS segmen, s.sumber,
       count(*) FILTER (WHERE t.status_hidup = 'batal') AS tiang_batal_masih_anggota,
       count(*) FILTER (WHERE t.status_hidup = 'aktif') AS tiang_aktif
FROM public.segmen s
JOIN public.segmen_tiang st ON st.segmen_id = s.id
JOIN public.tiang t ON t.id = st.tiang_id
GROUP BY s.ulp, s.penyulang, s.nama, s.sumber
HAVING count(*) FILTER (WHERE t.status_hidup = 'batal') > 0
ORDER BY s.ulp, s.penyulang, s.nama;

-- 2. Inspeksi yang tampil "x/y dinilai" padahal semua tiang AKTIF sudah dinilai.
SELECT r.ulp, r.segmen_nama, r.tier, r.status, r.tiang_dinilai, r.tiang_segmen,
       (SELECT count(*) FROM public.segmen_tiang st JOIN public.tiang t ON t.id = st.tiang_id
         WHERE st.segmen_id = r.segmen_id AND t.status_hidup = 'aktif') AS tiang_aktif
FROM public.inspeksi_jtm_ringkas r
WHERE r.status IN ('Selesai', 'Diverifikasi')
  AND r.tiang_dinilai < r.tiang_segmen
ORDER BY r.ulp, r.segmen_nama;

-- 3. Segmen yatim — hasil rintis tanpa inspeksi hidup dan tanpa WO.
SELECT s.ulp, s.penyulang, s.nama, s.created_at,
       (SELECT count(*) FROM public.segmen_tiang st JOIN public.tiang t ON t.id = st.tiang_id AND t.status_hidup = 'aktif'
         WHERE st.segmen_id = s.id) AS tiang_aktif
FROM public.segmen s
WHERE s.status = 'aktif' AND s.sumber = 'lapangan'
  AND NOT EXISTS (SELECT 1 FROM public.inspeksi_jtm m WHERE m.segmen_id = s.id AND m.status <> 'Dibatalkan')
  AND NOT EXISTS (SELECT 1 FROM public.wo_inspeksi_item i WHERE i.segmen_id = s.id AND i.status <> 'Dibatalkan')
  AND NOT EXISTS (SELECT 1 FROM public.wo_perabasan_item i WHERE i.segmen_id = s.id AND i.status <> 'Dibatalkan')
ORDER BY s.ulp, s.penyulang, s.nama;
