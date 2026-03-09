-- Fix RLS policies untuk Supabase Storage bucket 'inspections'
-- Jalankan di Supabase SQL Editor

-- Pastikan bucket ada dan public
INSERT INTO storage.buckets (id, name, public)
VALUES ('inspections', 'inspections', true)
ON CONFLICT (id) DO UPDATE SET public = true;

-- Hapus policy lama jika ada
DROP POLICY IF EXISTS "authenticated can upload inspections" ON storage.objects;
DROP POLICY IF EXISTS "authenticated can update inspections" ON storage.objects;
DROP POLICY IF EXISTS "authenticated can delete inspections" ON storage.objects;
DROP POLICY IF EXISTS "public can read inspections" ON storage.objects;

-- Semua user authenticated bisa upload (INSERT)
CREATE POLICY "authenticated can upload inspections"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'inspections');

-- Semua user authenticated bisa update
CREATE POLICY "authenticated can update inspections"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (bucket_id = 'inspections');

-- Semua user authenticated bisa delete
CREATE POLICY "authenticated can delete inspections"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (bucket_id = 'inspections');

-- Public bisa read (SELECT) — karena bucket public
CREATE POLICY "public can read inspections"
  ON storage.objects FOR SELECT
  TO public
  USING (bucket_id = 'inspections');
