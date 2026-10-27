-- ═══════════════════════════════════════════════════════════════════════════
-- Copy to LM 4DX — baris spreadsheet Lead Measure 4DX (27 Okt 2026)
--
-- Spreadsheet LM 4DX berisi satu blok per bulan: baris = uraian pekerjaan,
-- kolom = tanggal 1–31. Tabel ini menyimpan DAFTAR BARIS blok itu (urutan
-- sama persis dengan spreadsheet) dan sumber angkanya di SMART. Matriksnya
-- disusun di web dari `realisasi_rentang` (Rekap Kinerja → Realisasi →
-- Copy to LM 4DX), lalu disalin dan ditempel di sel tanggal spreadsheet.
--
-- sumber: daftar kunci, dijumlahkan bila lebih dari satu.
--   'jtm', 'jtm2', 'perabasan', …   = kunci baris Rekap Kinerja
--   'harjtm:<kode>'                 = Pemeliharaan Jaringan kategori <kode>
--                                     (pemeliharaan_jaringan_ref.kode)
--   kosong                          = tidak ada di SMART, tersalin kosong
--
-- Satu daftar untuk semua ULP. Dibaca semua akun; diubah UP3 dan admin.
-- Aman dijalankan ulang.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.lm4dx_baris (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  urutan      INT  NOT NULL,
  uraian      TEXT NOT NULL,
  sumber      TEXT[] NOT NULL DEFAULT '{}',
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by  TEXT
);

ALTER TABLE public.lm4dx_baris ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS lm4dx_baris_baca ON public.lm4dx_baris;
CREATE POLICY lm4dx_baris_baca ON public.lm4dx_baris
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS lm4dx_baris_ubah ON public.lm4dx_baris;
CREATE POLICY lm4dx_baris_ubah ON public.lm4dx_baris
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.user_roles r WHERE r.user_id = auth.uid() AND r.role IN ('UP3', 'admin')))
  WITH CHECK (EXISTS (SELECT 1 FROM public.user_roles r WHERE r.user_id = auth.uid() AND r.role IN ('UP3', 'admin')));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.lm4dx_baris TO authenticated;

-- Isi awal: 30 baris dari spreadsheet user. Sumber hanya diisi yang pasti;
-- sisanya (kategori Pemeliharaan Jaringan dll.) diatur dari layar.
-- Hanya diisi bila tabel masih kosong, supaya pengaturan tidak tertimpa.
INSERT INTO public.lm4dx_baris (urutan, uraian, sumber, updated_by)
SELECT v.urutan, v.uraian, v.sumber, 'isi awal'
FROM (VALUES
  (1,  'Inspeksi penyulang yang dilaksanakan hari ini (kms)', ARRAY['jtm']),
  (2,  'Inspeksi penyulang Tier 2 (kms)', ARRAY['jtm2']),
  (3,  'Inspeksi dengan Drone Skyprobe (Penyulang)', ARRAY[]::text[]),
  (4,  'Perabasan/perampalan pohon hari ini (kms)', ARRAY['perabasan']),
  (5,  'Penebangan pohon hari ini (pohon)', ARRAY[]::text[]),
  (6,  'Peta Kerawanan Distribusi (Penyulang)', ARRAY[]::text[]),
  (7,  'Perbaikan Tiang Miring (titik)', ARRAY[]::text[]),
  (8,  'Perbaikan Traves Miring (titik)', ARRAY[]::text[]),
  (9,  'Penggantian isolator (titik)', ARRAY[]::text[]),
  (10, 'Penggantian arester (titik)', ARRAY[]::text[]),
  (11, 'Pengencangan / Penggantian Jumperan JTM (titik)', ARRAY[]::text[]),
  (12, 'Pemasangan perisai Binatang (set)', ARRAY[]::text[]),
  (13, 'Pemasangan Arde Pentanahan (Titik)', ARRAY[]::text[]),
  (14, 'Penggantian paralel groove dengan LLC (Titik)', ARRAY[]::text[]),
  (15, 'Penggantian FCO anomali (Titik)', ARRAY[]::text[]),
  (16, 'Mapping Gardu (Gardu)', ARRAY[]::text[]),
  (17, 'Penyeimbangan Beban (Gardu)', ARRAY['penyeimbangan']),
  (18, 'Inspeksi Tier 1 Gardu (Gardu)', ARRAY['igardu1']),
  (19, 'Inspeksi Tier 2 Gardu (Gardu)', ARRAY['igardu2']),
  (20, 'OPTIMASI TRAFO', ARRAY['optimasi']),
  (21, 'Penggantian CO (Titik)', ARRAY[]::text[]),
  (22, 'Penyesuaian Fuse Cut Out (titik)', ARRAY[]::text[]),
  (23, 'Penyesuaian NH Fuse/Fuse TR (jurusan)', ARRAY[]::text[]),
  (24, 'Pengukuran Grounding Trafo/Arester/Netral (titik)', ARRAY[]::text[]),
  (25, 'Penyesuaian/Perbaikan Titik Sambung pada LA, FCO, PHB TR, Bushing Trafo (titik)', ARRAY[]::text[]),
  (26, 'Pemasangan Gembok Gardu', ARRAY[]::text[]),
  (27, 'Penyesuaian Tap Trafo', ARRAY[]::text[]),
  (28, 'Pemasangan perisai Binatang di Gardu (Gardu)', ARRAY[]::text[]),
  (29, 'Penggantian Jumperan Gardu A3C menjadi A3CS (Titik)', ARRAY[]::text[]),
  (30, 'Pengukuran Beban Puncak', ARRAY[]::text[])
) AS v(urutan, uraian, sumber)
WHERE NOT EXISTS (SELECT 1 FROM public.lm4dx_baris);
