-- ═══════════════════════════════════════════════════════════════════════════
-- Baris LM 4DX & Penurunan Susut per ULP (5 Nov 2026).
--
-- Sebelumnya satu daftar untuk semua ULP — admin satu ULP mengubah daftar ULP
-- lain. Kini:
--   ulp = 'AMPENAN' / 'CAKRANEGARA' / 'GERUNG' / 'TANJUNG' → diatur admin ULP itu
--   ulp = NULL → tampilan "Semua ULP" (diatur UP3)
-- Pengaturan yang ada sekarang DISALIN ke keempat ULP (baris lama tetap
-- sebagai daftar "Semua ULP").
--
-- "Pekerjaan yang dikerjakan" (tindakan_ref) TETAP satu daftar — dipakai HP
-- semua ULP.
--
-- Aman dijalankan ulang: ULP yang sudah punya baris tidak disalin lagi.
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE public.lm4dx_baris ADD COLUMN IF NOT EXISTS ulp TEXT;
COMMENT ON COLUMN public.lm4dx_baris.ulp IS
  'ULP pemilik daftar baris; NULL = tampilan Semua ULP (UP3). lm-baris-per-ulp.sql';

DROP INDEX IF EXISTS public.ix_lm4dx_baris_laporan;
CREATE INDEX IF NOT EXISTS ix_lm4dx_baris_laporan_ulp ON public.lm4dx_baris (laporan, ulp, urutan);

-- Salin pengaturan sekarang (ulp NULL) ke tiap ULP, per laporan.
INSERT INTO public.lm4dx_baris (laporan, ulp, urutan, kelompok, uraian, sumber, updated_at, updated_by)
SELECT b.laporan, u.ulp, b.urutan, b.kelompok, b.uraian, b.sumber, now(), 'lm-baris-per-ulp.sql'
FROM public.lm4dx_baris b
CROSS JOIN (VALUES ('AMPENAN'), ('CAKRANEGARA'), ('GERUNG'), ('TANJUNG')) AS u(ulp)
WHERE b.ulp IS NULL
  AND NOT EXISTS (SELECT 1 FROM public.lm4dx_baris x WHERE x.laporan = b.laporan AND x.ulp = u.ulp);

-- Hak ubah: UP3 semua; admin hanya baris ULP-nya.
DROP POLICY IF EXISTS lm4dx_baris_ubah ON public.lm4dx_baris;
CREATE POLICY lm4dx_baris_ubah ON public.lm4dx_baris
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.user_roles r WHERE r.user_id = auth.uid()
                 AND (r.role = 'UP3' OR (r.role = 'admin' AND lm4dx_baris.ulp IS NOT NULL
                                         AND upper(COALESCE(r.unit, '')) = upper(lm4dx_baris.ulp)))))
  WITH CHECK (EXISTS (SELECT 1 FROM public.user_roles r WHERE r.user_id = auth.uid()
                 AND (r.role = 'UP3' OR (r.role = 'admin' AND lm4dx_baris.ulp IS NOT NULL
                                         AND upper(COALESCE(r.unit, '')) = upper(lm4dx_baris.ulp)))));

-- Periksa: jumlah baris per laporan & ULP.
SELECT laporan, COALESCE(ulp, '(Semua ULP)') AS ulp, count(*) AS baris
FROM public.lm4dx_baris GROUP BY laporan, ulp ORDER BY laporan, ulp NULLS FIRST;
