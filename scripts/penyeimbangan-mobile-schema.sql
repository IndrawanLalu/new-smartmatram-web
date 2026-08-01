-- =============================================================================
-- Fase 0 — Fondasi fitur Penyeimbangan Beban di mobile
-- Jalankan manual di Supabase SQL Editor. Idempoten — aman diulang.
--
-- TIDAK ada perubahan tampilan web setelah skrip ini: semua kolom baru bernilai
-- NULL untuk 20 baris penyeimbangan_gardu dan ~990 baris pengukuran_gardu yang
-- sudah ada, dan tidak ada satu pun query lama yang membacanya.
-- =============================================================================

-- ── 1. Bukti foto: 4 URL per titik ukur ─────────────────────────────────────
-- Bentuk foto_total      : {"R": url, "S": url, "T": url, "N": url}
-- Bentuk foto_perjurusan : {"A": {"R": url, "S": url, "T": url, "N": url}, "C": {...}}
--
-- Empat foto disimpan TERPISAH, bukan digabung jadi satu gambar. Penyusunan
-- 2x2 dilakukan saat ditampilkan, sehingga foto asli tetap utuh sebagai bukti
-- dan aplikasi mobile tidak butuh dependensi native untuk menjahit gambar.
--
-- Hanya jurusan berbeban yang wajib difoto — pada gardu nyata sebagian besar
-- jurusan (A/B/C/D/K) bernilai 0 dan tidak perlu dibuktikan.
ALTER TABLE penyeimbangan_gardu
  ADD COLUMN IF NOT EXISTS foto_total      JSONB,
  ADD COLUMN IF NOT EXISTS foto_perjurusan JSONB;

-- ── 2. Klaim & status (model pool per ULP) ──────────────────────────────────
-- Petugas melihat semua WO PEMERATAAN BEBAN di unitnya lalu MENGKLAIM satu.
-- Klaim = baris penyeimbangan_gardu lahir dengan status 'Dikerjakan'; setelah
-- nilai after + foto masuk, statusnya jadi 'Selesai'.
--
-- Default sengaja 'Selesai': 20 baris lama semuanya memang pekerjaan yang sudah
-- rampung, jadi tidak perlu backfill dan tidak ada yang berubah di rekap web.
ALTER TABLE penyeimbangan_gardu
  ADD COLUMN IF NOT EXISTS status      TEXT NOT NULL DEFAULT 'Selesai',
  ADD COLUMN IF NOT EXISTS petugas_uid TEXT,
  ADD COLUMN IF NOT EXISTS diklaim_at  TIMESTAMPTZ;

-- CHECK tidak punya sintaks IF NOT EXISTS — bungkus agar skrip tetap idempoten.
DO $$
BEGIN
  ALTER TABLE penyeimbangan_gardu
    ADD CONSTRAINT penyeimbangan_status_valid
    CHECK (status IN ('Dikerjakan', 'Selesai'));
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- ── 3. Penanda baris pengukuran hasil penyeimbangan ─────────────────────────
-- Fase 4 akan menyisipkan SATU baris pengukuran_gardu berisi kondisi SETELAH
-- diseimbangkan, semata supaya mesin AMG yang sudah ada (antrean → agen lokal →
-- batas 3 percobaan) bisa mengirimkannya tanpa diubah sama sekali.
--
-- Baris itu BUKAN pengukuran rutin. Tanpa penanda ini:
--   • timeline gardu menampilkan DUA kartu untuk satu pekerjaan — kartu
--     Penyeimbangan dan kartu Pengukuran dengan angka yang sama persis;
--   • gardu_latest_state berebut menentukan event terkini lewat tie-break
--     `source_id DESC` yang praktis acak, sehingga KPI "Kondisi dari
--     Pemeliharaan (tanpa ukur ulang)" berubah-ubah sendiri.
--
-- Karena itu penandanya diletakkan di pengukuran_gardu (bukan sebaliknya):
-- semua query riwayat menyaring dari sisi ini, cukup dengan IS NULL tanpa join.
ALTER TABLE pengukuran_gardu
  ADD COLUMN IF NOT EXISTS hasil_penyeimbangan_id UUID
    REFERENCES penyeimbangan_gardu(id) ON DELETE SET NULL;

-- ── 4. Index ────────────────────────────────────────────────────────────────

-- Daftar WO terbuka = pengukuran ber-WO yang BELUM punya baris penyeimbangan.
CREATE INDEX IF NOT EXISTS idx_penyeimbangan_pengukuran
  ON penyeimbangan_gardu (pengukuran_id);

-- Pool per ULP: WO PEMERATAAN BEBAN milik unit petugas.
CREATE INDEX IF NOT EXISTS idx_pengukuran_wo_jenis
  ON pengukuran_gardu (petugas_unit, jenis_pemeliharaan)
  WHERE jenis_pemeliharaan IS NOT NULL;

-- Parsial: baris bertanda selalu jadi minoritas, sisanya tak perlu diindeks.
CREATE INDEX IF NOT EXISTS idx_pengukuran_hasil_penyeimbangan
  ON pengukuran_gardu (hasil_penyeimbangan_id)
  WHERE hasil_penyeimbangan_id IS NOT NULL;

-- Antrean klaim milik seorang petugas.
CREATE INDEX IF NOT EXISTS idx_penyeimbangan_status_petugas
  ON penyeimbangan_gardu (status, petugas_uid)
  WHERE status = 'Dikerjakan';
