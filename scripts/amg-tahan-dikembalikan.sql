-- =============================================================================
-- 28 Sep 2026 — Pengukuran yang DIKEMBALIKAN ke petugas tidak boleh ke AMG
-- Jalankan manual di Supabase SQL Editor, SESUDAH `tegangan-ujung-persetujuan.sql`.
-- Idempoten.
--
-- Temuan user: pengukuran yang dikembalikan masih bisa "Kirim ke AMG" — padahal
-- isiannya sedang diperbaiki petugas. Gerbang `tahan_amg` kini menahannya
-- juga, TANPA bergantung aturan tegangan ujung (berlaku semua ULP, semua bulan).
-- Kiriman ulang petugas mengosongkan dikembalikan_at → otomatis lepas.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.tahan_amg(p_ids TEXT[])
RETURNS TABLE (id TEXT, no_gardu TEXT, alasan TEXT)
LANGUAGE sql STABLE SET search_path = public AS $$
  SELECT m.id, m.no_gardu,
         CASE WHEN m.dikembalikan_at IS NOT NULL
              THEN 'Pengukuran ini sedang dikembalikan ke petugas — tunggu kiriman ulangnya.'
              WHEN EXISTS (SELECT 1 FROM public.pengukuran_tegangan_ujung x
                           WHERE x.pengukuran_id = m.id AND x.status = 'Terkirim')
              THEN 'Tegangan ujung gardu ini belum disetujui — setujui dulu di tab Tegangan Ujung.'
              ELSE 'Tegangan ujung gardu ini belum dikirim petugas — AMG menunggu tegangan ujung.' END
  FROM public.pengukuran_gardu m
  WHERE m.id = ANY (p_ids)
    AND m.hasil_penyeimbangan_id IS NULL
    AND (m.dikembalikan_at IS NOT NULL
         OR (public.tegangan_ujung_berlaku(m.petugas_unit, m.tanggal_pengukuran::date)
             AND NOT EXISTS (SELECT 1 FROM public.pengukuran_tegangan_ujung x
                             WHERE x.pengukuran_id = m.id AND x.status = 'Terkirim' AND x.verified_at IS NOT NULL)));
$$;

-- ── Periksa ──────────────────────────────────────────────────────────────────
--   SELECT * FROM tahan_amg(ARRAY(SELECT id FROM pengukuran_gardu WHERE dikembalikan_at IS NOT NULL LIMIT 5));
