-- Fix RLS petugas: tambah policy INSERT, UPDATE, DELETE
-- + pastikan kolom id punya default gen_random_uuid()
-- Jalankan di Supabase → SQL Editor

ALTER TABLE petugas ALTER COLUMN id SET DEFAULT gen_random_uuid();


DROP POLICY IF EXISTS "authenticated insert petugas" ON petugas;
DROP POLICY IF EXISTS "authenticated update petugas" ON petugas;
DROP POLICY IF EXISTS "authenticated delete petugas" ON petugas;

CREATE POLICY "authenticated insert petugas"
  ON petugas FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "authenticated update petugas"
  ON petugas FOR UPDATE TO authenticated USING (true);

CREATE POLICY "authenticated delete petugas"
  ON petugas FOR DELETE TO authenticated USING (true);
