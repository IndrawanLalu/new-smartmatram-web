-- Tambah kolom category ke tabel inspeksi_pohon
-- Jalankan di Supabase SQL Editor

ALTER TABLE public.inspeksi_pohon
  ADD COLUMN IF NOT EXISTS category TEXT;
