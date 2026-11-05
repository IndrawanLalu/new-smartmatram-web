-- ═══════════════════════════════════════════════════════════════════════════
-- Realisasi Harian LM — R1 (5 Nov 2026), rencana-realisasi-harian-4dx-susut.md
--
-- Halaman "Realisasi Harian LM": tabel baris pekerjaan × tanggal 1–31 untuk
-- dua laporan, LM 4DX dan Penurunan Susut. Barisnya disimpan di tabel yang
-- sama dengan Copy to LM 4DX (`lm4dx_baris`), dibedakan kolom `laporan`.
--
--   1. lm4dx_baris.laporan ('4dx' | 'susut'); baris lama = '4dx'.
--   2. Isi awal 30 baris Penurunan Susut (daftar user 5 Nov). Sumbernya
--      disalin dari baris 4DX yang uraiannya sama; yang berbeda:
--        • Inspeksi penyulang Tier 2 (titik) → jumlah TIANG inspeksi Tier 2
--          (sumber khusus 'jtm2_titik'), bukan kms.
--        • Perisai binatang di JTM (titik)   → sumber baris perisai 4DX.
--        • Penggantian MDU                    → kosong (belakangan).
--      Hanya diisi bila belum ada baris susut — pengaturan tidak tertimpa.
--   3. Baris drone 4DX disambungkan ke Inspeksi JTM Tier 1 + drone bila
--      sumbernya masih kosong.
-- Aman dijalankan ulang.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 1. Kolom laporan ────────────────────────────────────────────────────────
ALTER TABLE public.lm4dx_baris ADD COLUMN IF NOT EXISTS laporan TEXT NOT NULL DEFAULT '4dx';
ALTER TABLE public.lm4dx_baris DROP CONSTRAINT IF EXISTS lm4dx_baris_laporan_valid;
ALTER TABLE public.lm4dx_baris ADD CONSTRAINT lm4dx_baris_laporan_valid CHECK (laporan IN ('4dx', 'susut'));

-- ── 3. Drone 4DX (sebelum isi awal susut, supaya ikut tersalin) ─────────────
UPDATE public.lm4dx_baris
SET sumber = ARRAY['jtm_drone_penyulang'], updated_at = now(), updated_by = 'realisasi-harian-lm.sql'
WHERE laporan = '4dx' AND uraian ILIKE '%drone%' AND cardinality(sumber) = 0;

-- ── 2. Isi awal Penurunan Susut ─────────────────────────────────────────────
INSERT INTO public.lm4dx_baris (laporan, urutan, uraian, sumber, updated_by)
SELECT 'susut', v.urutan, v.uraian,
       COALESCE(v.sumber_tetap,
                (SELECT b.sumber FROM public.lm4dx_baris b
                 WHERE b.laporan = '4dx' AND lower(btrim(b.uraian)) = lower(btrim(COALESCE(v.sama_dengan, v.uraian)))
                 ORDER BY b.urutan LIMIT 1),
                ARRAY[]::text[]),
       'isi awal'
FROM (VALUES
  (1,  'Inspeksi penyulang yang dilaksanakan hari ini (kms)', NULL, NULL::text[]),
  (2,  'Inspeksi penyulang Tier 2 (titik)', NULL, ARRAY['jtm2_titik']),
  (3,  'Inspeksi dengan Drone Skyprobe (Penyulang)', NULL, NULL),
  (4,  'Perabasan/perampalan pohon hari ini (kms)', NULL, NULL),
  (5,  'Penebangan pohon hari ini (pohon)', NULL, NULL),
  (6,  'Peta Kerawanan Distribusi (Penyulang)', NULL, NULL),
  (7,  'Perbaikan Tiang Miring (titik)', NULL, NULL),
  (8,  'Perbaikan Traves Miring (titik)', NULL, NULL),
  (9,  'Penggantian isolator (titik)', NULL, NULL),
  (10, 'Penggantian arester (titik)', NULL, NULL),
  (11, 'Pengencangan / Penggantian Jumperan JTM (titik)', NULL, NULL),
  (12, 'Pemasangan perisai Binatang di JTM rawan binatang (titik)', 'Pemasangan perisai Binatang (set)', NULL),
  (13, 'Pemasangan Arde Pentanahan (Titik)', NULL, NULL),
  (14, 'Penggantian paralel groove dengan LLC (Titik)', NULL, NULL),
  (15, 'Penggantian FCO anomali (Titik)', NULL, NULL),
  (16, 'Penggantian MDU', NULL, ARRAY[]::text[]),
  (17, 'Mapping Gardu (Gardu)', NULL, NULL),
  (18, 'Penyeimbangan Beban (Gardu)', NULL, NULL),
  (19, 'Inspeksi Tier 1 Gardu (Gardu)', NULL, NULL),
  (20, 'Inspeksi Tier 2 Gardu (Gardu)', NULL, NULL),
  (21, 'OPTIMASI TRAFO', NULL, NULL),
  (22, 'Penggantian CO (Titik)', NULL, NULL),
  (23, 'Penyesuaian Fuse Cut Out (titik)', NULL, NULL),
  (24, 'Penyesuaian NH Fuse/Fuse TR (jurusan)', NULL, NULL),
  (25, 'Pengukuran Grounding Trafo/Arester/Netral (titik)', NULL, NULL),
  (26, 'Penyesuaian/Perbaikan Titik Sambung pada LA, FCO, PHB TR, Bushing Trafo (titik)', NULL, NULL),
  (27, 'Pemasangan Gembok Gardu', NULL, NULL),
  (28, 'Penyesuaian Tap Trafo', NULL, NULL),
  (29, 'Pemasangan perisai Binatang di Gardu (Gardu)', NULL, NULL),
  (30, 'Penggantian Jumperan Gardu A3C menjadi A3CS (Titik)', NULL, NULL),
  (31, 'Pengukuran Beban Puncak', NULL, NULL)
) AS v(urutan, uraian, sama_dengan, sumber_tetap)
WHERE NOT EXISTS (SELECT 1 FROM public.lm4dx_baris WHERE laporan = 'susut');

CREATE INDEX IF NOT EXISTS ix_lm4dx_baris_laporan ON public.lm4dx_baris (laporan, urutan);

-- ── Periksa ─────────────────────────────────────────────────────────────────
SELECT laporan, urutan, uraian, sumber FROM public.lm4dx_baris ORDER BY laporan, urutan;
