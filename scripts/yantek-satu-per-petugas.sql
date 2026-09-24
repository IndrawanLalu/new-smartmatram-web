-- =============================================================================
-- yantek_harian: satu nomor gangguan per petugas = satu baris
-- =============================================================================
-- Jalankan SESUDAH `yantek-harian-posko.sql`. Aman diulang (yang sudah bersih
-- tidak disentuh).
--
-- APKT `detailCheckInCheckOutIndividu` mengembalikan satu baris per CHECK-IN:
-- petugas yang mengerjakan satu gangguan di dua shift muncul dua kali, dan
-- terhitung dua WO. Contoh: G4426090100193, AHMAD AZMI check-in 1 Sep lalu
-- 2 Sep. Per 24 Sep 2026: 218 dari 18.969 baris adalah baris kedua semacam ini.
--
-- Aturan (user, 24 Sep 2026): satu nomor gangguan dengan petugas yang sama
-- hanya dihitung SATU kali. Yang dipertahankan baris PERTAMA dalam urutan
-- aslinya (shift saat pekerjaan dimulai). Sejak commit ini, penyimpanan baru
-- sudah menyaringnya sendiri (`satuPerPetugas` di `_lib/yantek.ts`); skrip
-- ini membersihkan yang sudah telanjur tersimpan.
-- =============================================================================

WITH bersih AS (
  SELECT h.tanggal, h.id_posko, jsonb_agg(s.e ORDER BY s.idx) AS rows
  FROM public.yantek_harian h
  CROSS JOIN LATERAL (
    SELECT DISTINCT ON (
      -- Baris tanpa nomor laporan dikunci dengan posisinya sendiri → tidak
      -- pernah dianggap kembar.
      COALESCE(e->>'no_laporan', 'tanpa-nomor-' || idx),
      COALESCE(e->>'personil_yantek', '')
    ) e, idx
    FROM jsonb_array_elements(h.rows) WITH ORDINALITY AS t(e, idx)
    ORDER BY
      COALESCE(e->>'no_laporan', 'tanpa-nomor-' || idx),
      COALESCE(e->>'personil_yantek', ''),
      idx
  ) s
  GROUP BY h.tanggal, h.id_posko
)
UPDATE public.yantek_harian h
SET rows = b.rows
FROM bersih b
WHERE h.tanggal = b.tanggal
  AND h.id_posko = b.id_posko
  AND jsonb_array_length(h.rows) <> jsonb_array_length(b.rows);

-- Periksa (harus 0 baris):
--   SELECT e->>'no_laporan', e->>'personil_yantek', count(*)
--   FROM yantek_harian, jsonb_array_elements(rows) e
--   GROUP BY 1, 2 HAVING count(*) > 1;
