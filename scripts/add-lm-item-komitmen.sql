-- Tambah kolom komitmen per item pekerjaan
-- Jalankan di Supabase SQL Editor

ALTER TABLE lead_measure_items
  ADD COLUMN IF NOT EXISTS komitmen TEXT DEFAULT '';
