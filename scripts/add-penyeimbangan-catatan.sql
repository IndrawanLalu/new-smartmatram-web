-- Tambah kolom catatan ke tabel penyeimbangan_gardu
-- Jalankan di Supabase SQL Editor (untuk tabel yang sudah ada)

ALTER TABLE penyeimbangan_gardu
  ADD COLUMN IF NOT EXISTS catatan TEXT;
