-- ═══════════════════════════════════════════════════════════════════════════
-- Copy to PRO NTB — kolom tetap per jenis pekerjaan (13 Okt 2026)
--
-- Laporan harian UIW (spreadsheet PRO NTB) berkolom:
--   NO · TANGGAL · UIW NTB · UP3 · ULP · JENIS PEKERJAAN · LOKASI PEKERJAAN ·
--   NAMA TIM · TIM PELAKSANA · JENIS KONTRAK · KELOMPOK PEKERJAAN · SATUAN ·
--   WORK ORDER · REALISASI
-- Barisnya disusun di web dari `realisasi_rentang` (Rekap Kinerja → Realisasi
-- → Copy to PRO NTB). Tabel ini menyimpan lima kolom yang TETAP per jenis
-- (kunci = kunci baris Rekap Kinerja). NAMA TIM diketik di layar, tidak disimpan.
--
-- Dibaca semua akun; diubah UP3 dan admin. Aman dijalankan ulang.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.pro_ntb_jenis (
  kunci            TEXT PRIMARY KEY,
  jenis_pekerjaan  TEXT,
  tim_pelaksana    TEXT,
  jenis_kontrak    TEXT,
  kelompok         TEXT,
  satuan           TEXT,
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by       TEXT
);

ALTER TABLE public.pro_ntb_jenis ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS pro_ntb_jenis_baca ON public.pro_ntb_jenis;
CREATE POLICY pro_ntb_jenis_baca ON public.pro_ntb_jenis
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS pro_ntb_jenis_ubah ON public.pro_ntb_jenis;
CREATE POLICY pro_ntb_jenis_ubah ON public.pro_ntb_jenis
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.user_roles r WHERE r.user_id = auth.uid() AND r.role IN ('UP3', 'admin')))
  WITH CHECK (EXISTS (SELECT 1 FROM public.user_roles r WHERE r.user_id = auth.uid() AND r.role IN ('UP3', 'admin')));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.pro_ntb_jenis TO authenticated;

-- Isi awal dari contoh laporan user; jenis lain dilengkapi dari layar.
INSERT INTO public.pro_ntb_jenis (kunci, jenis_pekerjaan, tim_pelaksana, jenis_kontrak, kelompok, satuan, updated_by)
VALUES
  ('perabasan', 'PERABASAN POHON', 'PERABASAN POHON', 'VARIABLE COST', 'JTM', 'KMS', 'isi awal'),
  ('hargardu', 'PEMELIHARAAN GARDU DISTRIBUSI', 'PEMELIHARAAN GARDU', 'VARIABLE COST', 'GARDU', 'GARDU', 'isi awal')
ON CONFLICT (kunci) DO NOTHING;
