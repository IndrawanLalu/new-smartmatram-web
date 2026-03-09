-- Migration: create tiang (pole) table for GIS asset management
-- Run this in Supabase SQL Editor

CREATE TABLE IF NOT EXISTS tiang (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kode        text NOT NULL,
  jenis       text,           -- 'Beton' | 'Besi' | 'Kayu'
  tinggi      numeric(5,1),   -- dalam meter: 9.0, 12.0
  kondisi     text,           -- 'Baik' | 'Retak' | 'Miring' | 'Rusak'
  feeder      text,
  jalur_id    text REFERENCES jalur(id) ON DELETE SET NULL,
  alamat      text,
  lat         numeric(12,8),
  lng         numeric(12,8),
  ulp         text,           -- 'AMPENAN' | 'CAKRANEGARA' | 'GERUNG' | 'TANJUNG'
  tgl_pasang  date,
  catatan     text,
  created_at  timestamptz DEFAULT now(),
  updated_at  timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS tiang_ulp_idx    ON tiang(ulp);
CREATE INDEX IF NOT EXISTS tiang_feeder_idx ON tiang(feeder);
CREATE INDEX IF NOT EXISTS tiang_coords_idx ON tiang(lat, lng)
  WHERE lat IS NOT NULL AND lng IS NOT NULL;

ALTER TABLE tiang ENABLE ROW LEVEL SECURITY;

CREATE POLICY "auth read tiang"
  ON tiang FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth insert tiang"
  ON tiang FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "auth update tiang"
  ON tiang FOR UPDATE TO authenticated USING (true);
CREATE POLICY "auth delete tiang"
  ON tiang FOR DELETE TO authenticated USING (true);
