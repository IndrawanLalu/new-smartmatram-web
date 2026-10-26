-- =============================================================================
-- Gardu belum masuk segmen — rincian untuk dicek user (25 Okt 2026)
-- Jalankan SESUDAH jtm-section-gardu.sql. Idempoten. Hanya-baca.
--
-- gardu_belum_segmen ditambah (di BELAKANG, kolom lama tetap):
--   • alamat, lat, lng      — dari master gardu, untuk mencari di lapangan/peta;
--   • di_tiang_penyulang    — gardu ini tercatat di tiang penyulang LAIN (feeder
--     master mungkin salah, atau gardunya memang dipasok penyulang lain).
-- =============================================================================

CREATE OR REPLACE VIEW public.gardu_belum_segmen AS
WITH g AS (
  SELECT DISTINCT ON (upper(btrim(kode)))
         upper(btrim(kode)) AS kode, nama, daya, upper(btrim(feeder)) AS penyulang, upper(btrim(ulp)) AS ulp,
         alamat, lat, lng
  FROM public.gardu
  WHERE lower(COALESCE(status, 'aktif')) = 'aktif' AND NULLIF(btrim(feeder), '') IS NOT NULL
  ORDER BY upper(btrim(kode)), daya DESC NULLS LAST
)
SELECT g.kode, g.nama, g.daya, g.penyulang, g.ulp,
  EXISTS (SELECT 1 FROM public.gardu_jtm_tiang gt WHERE gt.gardu_kode = g.kode AND gt.p = g.penyulang) AS di_section,
  g.alamat, g.lat, g.lng,
  (SELECT string_agg(DISTINCT k.penyulang, ', ' ORDER BY k.penyulang)
     FROM public.tiang t
     JOIN public.tiang_kode_penyulang k ON k.tiang_id = t.id
    WHERE t.status_hidup = 'aktif' AND upper(btrim(t.gardu_di_tiang)) = g.kode
      AND upper(k.penyulang) <> g.penyulang) AS di_tiang_penyulang
FROM g
WHERE NOT EXISTS (
  SELECT 1
  FROM public.gardu_jtm_tiang gt
  JOIN public.segmen_tiang st ON st.tiang_id = gt.tiang_id
  JOIN public.segmen s ON s.id = st.segmen_id AND s.status = 'aktif' AND upper(s.penyulang) = gt.p
  WHERE gt.gardu_kode = g.kode AND gt.p = g.penyulang);
COMMENT ON VIEW public.gardu_belum_segmen IS
  'Gardu aktif master tiap penyulang (feeder) yang belum ada di segmen aktif mana pun di penyulang itu. di_section = tiangnya sudah di pohon penyulang; di_tiang_penyulang = tercatat di tiang penyulang lain.';
GRANT SELECT ON public.gardu_belum_segmen TO authenticated;
