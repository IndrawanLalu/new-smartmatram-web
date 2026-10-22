-- =============================================================================
-- jtm_cakupan dipercepat (22 Okt 2026, audit performa HP JTM/JTR).
--
-- Gejala: daftar segmen Inspeksi JTM (HP) 1,6 dtk per ULP, 3,5 dtk tanpa
-- saringan (akun UP3 & Dasbor JTM web) — makin dekat batas statement timeout
-- seiring jawaban periksa bertambah (262 ribu baris).
--
-- Akarnya: "tiang dinilai" dibaca lewat view `tiang_kondisi_terakhir`, yang
-- untuk TIAP tiang menyusun row_number() atas seluruh jawaban periksa — padahal
-- yang ditanya cuma "pernah dinilai di inspeksi terverifikasi atau belum".
--
-- Perbaikan: pertanyaan yang sama dijawab dengan EXISTS lewat indeks
-- (inspeksi_jtm_titik.tiang_id, periksa_jtm_unik.titik_id). Syaratnya disalin
-- dari tiang_kondisi_terakhir: inspeksi Diverifikasi, jawaban berisi (nilai /
-- nilai_angka), item masih ada di jtm_item_ref, tiangnya ada. Kolom, tipe, dan
-- arti angka TIDAK berubah — HP & web tidak perlu diubah. Idempoten.
-- =============================================================================

CREATE OR REPLACE VIEW public.jtm_cakupan AS
WITH per_segmen AS (
  SELECT
    s.id AS segmen_id, s.nama, s.penyulang, s.ulp,
    count(st.tiang_id)                                        AS tiang,
    count(*) FILTER (WHERE k.ada)                             AS tiang_dinilai
  FROM public.segmen s
  LEFT JOIN public.segmen_tiang st ON st.segmen_id = s.id
  LEFT JOIN LATERAL (
    SELECT true AS ada
    FROM public.inspeksi_jtm_titik tk
    JOIN public.inspeksi_jtm m          ON m.id = tk.inspeksi_id AND m.status = 'Diverifikasi'
    JOIN public.inspeksi_jtm_periksa p  ON p.titik_id = tk.id
                                       AND (p.nilai IS NOT NULL OR p.nilai_angka IS NOT NULL)
    JOIN public.jtm_item_ref i          ON i.kode = p.item_kode
    JOIN public.tiang t                 ON t.id = tk.tiang_id
    WHERE tk.tiang_id = st.tiang_id
    LIMIT 1
  ) k ON true
  WHERE s.status = 'aktif'
    AND s.sumber IS DISTINCT FROM 'tempelan'   -- segmen tempelan WO bukan segmen inspeksi JTM
  GROUP BY s.id, s.nama, s.penyulang, s.ulp
)
SELECT
  p.*,
  round(100.0 * p.tiang_dinilai / NULLIF(p.tiang, 0), 1) AS persen_dinilai,
  (SELECT max(COALESCE(m.tgl_selesai, m.tgl_mulai))
     FROM public.inspeksi_jtm m
    WHERE m.segmen_id = p.segmen_id AND m.status = 'Diverifikasi') AS terakhir_disapu,
  (SELECT max(COALESCE(m.tgl_selesai, m.tgl_mulai))
     FROM public.inspeksi_jtm m
    WHERE m.segmen_id = p.segmen_id AND m.status = 'Diverifikasi') AS terakhir_inspeksi
FROM per_segmen p;
