-- =============================================================================
-- 28 Sep 2026 — Daftar regu WO Inspeksi mengikuti tabel `roles`
-- Jalankan manual di Supabase SQL Editor, SESUDAH `wo-inspeksi-jtm.sql`.
-- Idempoten.
--
-- Temuan user: petugas AHYAR (grup INSP_JTR) tidak muncul di pilihan regu WO
-- Inspeksi JTR. View lama menulis kode grup TETAP ('INSPEKTOR', 'INSPEKSI_JTM',
-- 'INSPEKSI_JTR') — padahal role dibuat lewat Kelola Role dan kode Inspeksi JTR
-- yang dibuat user adalah 'INSP_JTR'. Sekarang: petugas masuk daftar kalau role
-- grupnya punya menu HP `jtm` atau `jtr`. Role inspeksi baru / berganti kode
-- ikut dengan sendirinya.
--
-- Kolom jtm / jtr: layar WO JTM hanya menawarkan yang boleh JTM, layar WO JTR
-- hanya yang boleh JTR. Kolom lama (regu, ulp, group_name) tetap di urutan yang
-- sama.
-- =============================================================================

CREATE OR REPLACE VIEW public.regu_inspeksi AS
SELECT p.nama AS regu,
       upper(p.ulp) AS ulp,
       p.group_name,
       to_jsonb(r.menus) ? 'jtm' AS jtm,
       to_jsonb(r.menus) ? 'jtr' AS jtr
FROM public.petugas p
JOIN public.roles r ON upper(r.code) = upper(p.group_name)
WHERE lower(COALESCE(p.status, 'aktif')) = 'aktif'
  AND to_jsonb(r.menus) ?| ARRAY['jtm', 'jtr']
  -- Admin & UP3 punya menu jtm/jtr tapi bukan grup regu lapangan.
  AND upper(r.code) NOT IN ('UP3', 'ADMIN');
GRANT SELECT ON public.regu_inspeksi TO authenticated;

-- ── Periksa ──────────────────────────────────────────────────────────────────
--   SELECT * FROM regu_inspeksi ORDER BY ulp, regu;   -- AHYAR · AMPENAN · INSP_JTR · jtr = true
