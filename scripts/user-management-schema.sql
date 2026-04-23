-- ============================================================
-- SMART Mataram — User Management Schema
-- Jalankan di Supabase SQL Editor
-- ============================================================

-- 1. Update tabel user_roles — tambah kolom baru
ALTER TABLE user_roles
  ADD COLUMN IF NOT EXISTS platform text DEFAULT 'all'
    CHECK (platform IN ('web', 'mobile', 'all')),
  ADD COLUMN IF NOT EXISTS is_active boolean DEFAULT true;

-- 2. Buat tabel petugas (migrasi dari Firebase Firestore)
CREATE TABLE IF NOT EXISTS petugas (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  nama        text        NOT NULL,
  group_name  text        NOT NULL,  -- INSPEKTOR, PERABASAN, YANGU, HARJAR, HARGAR, PDKB, dll
  ulp         text        NOT NULL
    CHECK (ulp IN ('AMPENAN', 'CAKRANEGARA', 'GERUNG', 'TANJUNG')),
  phone       text,
  email       text,
  status      text        NOT NULL DEFAULT 'aktif'
    CHECK (status IN ('aktif', 'non-aktif')),
  created_at  timestamptz DEFAULT now(),
  updated_at  timestamptz DEFAULT now()
);

-- 3. RLS untuk petugas
ALTER TABLE petugas ENABLE ROW LEVEL SECURITY;

-- Semua user authenticated bisa baca petugas (untuk dropdown di mobile)
CREATE POLICY "authenticated can read petugas"
  ON petugas FOR SELECT
  TO authenticated
  USING (true);

-- Hanya service_role yang bisa write
CREATE POLICY "service role full access petugas"
  ON petugas FOR ALL
  USING (auth.role() = 'service_role');

-- 4. Trigger updated_at untuk petugas
CREATE TRIGGER set_updated_at_petugas
  BEFORE UPDATE ON petugas
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- 5. Update RLS user_roles — tambah policy untuk admin bisa baca semua role di unitnya
CREATE POLICY "admin can read unit roles"
  ON user_roles FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM user_roles ur
      WHERE ur.user_id = auth.uid()
        AND ur.role = 'admin'
        AND ur.unit = user_roles.unit
    )
  );
