-- Migration: tambah kolom KVA range ke tabel anomali_settings
-- Jalankan manual di Supabase SQL Editor

ALTER TABLE public.anomali_settings
  ADD COLUMN IF NOT EXISTS min_kva_trafo NUMERIC(6,1) NULL,
  ADD COLUMN IF NOT EXISTS max_kva_trafo NUMERIC(6,1) NULL;
