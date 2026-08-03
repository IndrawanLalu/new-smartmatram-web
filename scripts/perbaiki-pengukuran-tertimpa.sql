-- =============================================================================
-- Pemulihan pengukuran asal yang tertimpa nilai "sesudah"
-- Jalankan manual di Supabase SQL Editor. Aman diulang (idempoten by nature).
--
-- MASALAHNYA (sudah diperbaiki di kode, commit menyusul):
--   usePenyeimbangan.updatePenyeimbangan dulu menulis balik nilai SESUDAH ke
--   baris pengukuran ASAL. Jadi setiap kali admin menyunting satu rekap
--   penyeimbangan dari web, bukti kondisi SEBELUM di baris pengukuran itu
--   tertimpa — dan baris anomali yang jadi dasar WO mendadak terlihat sehat.
--
--   Terdeteksi 2026-08-03: 3 dari 22 rekap tertaut terkena.
--     GS038  before 177/156/217  →  jadi 167/170/186
--     AM261  before 144/171/207  →  jadi 156/171/182
--     MM009  before 237/258/203  →  jadi 218/220/222
--
-- KENAPA BISA DIPULIHKAN:
--   penyeimbangan_gardu menyimpan snapshot *_before saat rekap dibuat. Snapshot
--   itu TIDAK ikut tertimpa, jadi nilai asli masih ada. Sudah dicek: arus N,
--   beban kVA, persen, dan perjurusan_before ketiganya lengkap.
--
--   Tegangan tidak perlu dipulihkan — kode lama tidak pernah menulisnya.
-- =============================================================================

-- ── 1. Lihat dulu apa yang akan berubah (JALANKAN INI LEBIH DULU) ───────────
SELECT
  pg.no_gardu,
  pg.tanggal_pengukuran,
  pg.total_arus_r || '/' || pg.total_arus_s || '/' || pg.total_arus_t AS arus_sekarang,
  ps.arus_r_before || '/' || ps.arus_s_before || '/' || ps.arus_t_before AS akan_dipulihkan_jadi,
  ROUND(pg.persen_beban::numeric, 1) AS pct_sekarang,
  ROUND(ps.beban_pct_before::numeric, 1) AS pct_asli
FROM pengukuran_gardu pg
JOIN penyeimbangan_gardu ps ON ps.pengukuran_id = pg.id
WHERE pg.hasil_penyeimbangan_id IS NULL          -- hanya baris pengukuran rutin
  AND ABS(pg.total_arus_r - ps.arus_r_after) < 0.51
  AND ABS(pg.total_arus_s - ps.arus_s_after) < 0.51
  AND ABS(pg.total_arus_t - ps.arus_t_after) < 0.51
  AND ABS(pg.total_arus_r - ps.arus_r_before) >= 0.51;

-- ── 2. Pulihkan ─────────────────────────────────────────────────────────────
-- Syarat WHERE-nya sengaja ketat: hanya baris yang nilainya PERSIS sama dengan
-- "sesudah" DAN berbeda dari "sebelum". Baris yang kebetulan tidak berubah
-- (pemerataan tidak mengubah arus total) tidak ikut tersentuh.

UPDATE pengukuran_gardu pg
SET
  total_arus_r = ps.arus_r_before,
  total_arus_s = ps.arus_s_before,
  total_arus_t = ps.arus_t_before,
  total_arus_n = ps.arus_n_before,
  beban_kva    = ps.beban_kva_before,
  persen_beban = ps.beban_pct_before,
  perjurusan   = ps.perjurusan_before
FROM penyeimbangan_gardu ps
WHERE ps.pengukuran_id = pg.id
  AND pg.hasil_penyeimbangan_id IS NULL
  AND ABS(pg.total_arus_r - ps.arus_r_after) < 0.51
  AND ABS(pg.total_arus_s - ps.arus_s_after) < 0.51
  AND ABS(pg.total_arus_t - ps.arus_t_after) < 0.51
  AND ABS(pg.total_arus_r - ps.arus_r_before) >= 0.51
  -- Jangan pulihkan dari snapshot kosong: lebih baik biarkan apa adanya
  -- daripada mengganti data dengan nol.
  AND ps.beban_kva_before > 0;

-- ── 3. Verifikasi: query nomor 1 harus mengembalikan 0 baris ────────────────
