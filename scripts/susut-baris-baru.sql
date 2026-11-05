-- ═══════════════════════════════════════════════════════════════════════════
-- Penurunan Susut — daftar baris yang benar (5 Nov 2026, daftar user).
-- Isi awal di realisasi-harian-lm.sql keliru menyalin baris LM 4DX; di sini
-- diganti 15 baris Susut + kelompok JTM / Gardu / JTR / SR.
--
-- Sumber diisi hanya yang jelas sama; sisanya kosong (tersalin kosong) —
-- atur lewat Atur baris. Aman dijalankan ulang (baris susut diganti utuh).
-- ═══════════════════════════════════════════════════════════════════════════

-- Kelompok SR (Sambungan Rumah).
ALTER TABLE public.lm4dx_baris DROP CONSTRAINT IF EXISTS lm4dx_baris_kelompok_valid;
ALTER TABLE public.lm4dx_baris ADD CONSTRAINT lm4dx_baris_kelompok_valid
  CHECK (kelompok IS NULL OR kelompok IN ('JTM', 'GARDU', 'JTR', 'SR'));

BEGIN;
DELETE FROM public.lm4dx_baris WHERE laporan = 'susut';

INSERT INTO public.lm4dx_baris (laporan, urutan, kelompok, uraian, sumber, updated_by)
VALUES
  ('susut',  1, 'JTM',   'Penarikan Penyulang Baru untuk Pemecahan Beban (kms)', ARRAY[]::text[], 'susut-baris-baru.sql'),
  ('susut',  2, 'JTM',   'Rehabilitasi/Pemberatan JTM (kms)',                    ARRAY[]::text[], 'susut-baris-baru.sql'),
  ('susut',  3, 'JTM',   'Rekonektorisasi Jumper/Sambungan (titik)',             ARRAY['harjtm:penggantian_konektor_jtm'], 'susut-baris-baru.sql'),
  ('susut',  4, 'JTM',   'Penggantian Isolator/Arrester Bocor/Tembus (buah)',    ARRAY['harjtm:penggantian_isolator', 'harjtm:arrester'], 'susut-baris-baru.sql'),
  ('susut',  5, 'JTM',   'Pemasangan AVR (buah)',                                ARRAY[]::text[], 'susut-baris-baru.sql'),
  ('susut',  6, 'JTM',   'Pemasangan Kapasitor (buah)',                          ARRAY[]::text[], 'susut-baris-baru.sql'),
  ('susut',  7, 'GARDU', 'Pembangunan Gardu Sisipan (buah)',                     ARRAY[]::text[], 'susut-baris-baru.sql'),
  ('susut',  8, 'GARDU', 'Manajemen Trafo Distribusi (buah)',                    ARRAY['optimasi'], 'susut-baris-baru.sql'),
  ('susut',  9, 'GARDU', 'Menaikan Tap Changer trafo distribusi (buah)',         ARRAY['tindakan:gardu_tap_trafo'], 'susut-baris-baru.sql'),
  ('susut', 10, 'GARDU', 'Penyeimbangan Beban (buah)',                           ARRAY['penyeimbangan'], 'susut-baris-baru.sql'),
  ('susut', 11, 'GARDU', 'Pemeliharaan PHBTR Gardu Distribusi (buah)',           ARRAY['hargardu'], 'susut-baris-baru.sql'),
  ('susut', 12, 'GARDU', 'Perbaikan Grounding Gardu (buah)',                     ARRAY['tindakan:gardu_grounding'], 'susut-baris-baru.sql'),
  ('susut', 13, 'JTR',   'Penarikan Jurusan Baru untuk Pemecahan Beban (kms)',   ARRAY[]::text[], 'susut-baris-baru.sql'),
  ('susut', 14, 'JTR',   'Rekonektorisasi Sambungan JTR (titik)',                ARRAY[]::text[], 'susut-baris-baru.sql'),
  ('susut', 15, 'SR',    'Perbaikan SR Seri banyak (kms)',                       ARRAY['tindakan:rata_sr_seri'], 'susut-baris-baru.sql');
COMMIT;

-- Periksa
SELECT urutan, kelompok, uraian, sumber FROM public.lm4dx_baris WHERE laporan = 'susut' ORDER BY urutan;
