-- Tambah kolom wo_sent_at ke tabel pengukuran_gardu
-- Jalankan di Supabase SQL Editor

ALTER TABLE pengukuran_gardu
  ADD COLUMN IF NOT EXISTS wo_sent_at TIMESTAMPTZ NULL;

COMMENT ON COLUMN pengukuran_gardu.wo_sent_at IS
  'Timestamp saat WO dikirim untuk pengukuran ini. NULL = belum di-WO.';
