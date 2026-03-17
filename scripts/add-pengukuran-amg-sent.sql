-- Tambah kolom amg_sent_at ke tabel pengukuran_gardu
-- NULL  = belum di-input ke sistem AMG
-- NOT NULL = sudah di-input (timestamp penandaan)

ALTER TABLE pengukuran_gardu
  ADD COLUMN IF NOT EXISTS amg_sent_at TIMESTAMPTZ NULL;
