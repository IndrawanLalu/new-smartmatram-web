-- ============================================================
-- SMART Mataram — Schema: user_roles
-- Jalankan di Supabase SQL Editor
-- ============================================================

-- 1. Drop & recreate (kalau tabel sudah ada)
DROP TABLE IF EXISTS user_roles;

CREATE TABLE user_roles (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role       text        NOT NULL,
  unit       text        DEFAULT NULL,   -- NULL berarti akses semua unit (UP3)
  name       text        NOT NULL DEFAULT '',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),

  UNIQUE (user_id),

  CONSTRAINT role_valid CHECK (
    role IN ('UP3', 'admin', 'inspektor', 'HARJAR', 'HARGAR', 'PERABASAN', 'YANGU', 'PDKB')
  ),
  CONSTRAINT unit_valid CHECK (
    unit IS NULL OR unit IN ('AMPENAN', 'CAKRANEGARA', 'GERUNG', 'TANJUNG')
  )
);

-- 2. RLS — hanya bisa baca data sendiri, kecuali UP3/admin bisa baca semua
ALTER TABLE user_roles ENABLE ROW LEVEL SECURITY;

-- Semua user bisa baca row miliknya sendiri
CREATE POLICY "user can read own role"
  ON user_roles FOR SELECT
  USING (auth.uid() = user_id);

-- UP3 bisa baca semua role
CREATE POLICY "UP3 can read all roles"
  ON user_roles FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM user_roles ur
      WHERE ur.user_id = auth.uid() AND ur.role = 'UP3'
    )
  );

-- Hanya service_role yang bisa insert/update/delete (via admin panel)
CREATE POLICY "service role full access"
  ON user_roles FOR ALL
  USING (auth.role() = 'service_role');

-- 3. Trigger updated_at otomatis
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER set_updated_at
  BEFORE UPDATE ON user_roles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================================
-- Referensi Role & Unit
-- ============================================================
--
-- ROLE        | UNIT          | AKSES DATA
-- ------------|---------------|------------------------------------------
-- UP3         | NULL          | Semua unit, bisa filter per ULP
-- admin       | AMPENAN / ... | Hanya data unit sendiri, semua fitur
-- inspektor   | AMPENAN / ... | Hanya data unit sendiri, input inspeksi
-- HARJAR      | AMPENAN / ... | Hanya task eksekutor = HARJAR, unit sendiri
-- HARGAR      | AMPENAN / ... | Hanya task eksekutor = HARGAR, unit sendiri
-- PERABASAN   | AMPENAN / ... | Hanya inspeksi_pohon eksekutor = PERABASAN
-- YANGU       | AMPENAN / ... | Hanya task eksekutor = YANGU, unit sendiri
-- PDKB        | AMPENAN / ... | Hanya task eksekutor = PDKB, unit sendiri
--
-- UNIT         | KETERANGAN
-- -------------|-------------------
-- AMPENAN      | ULP Ampenan
-- CAKRANEGARA  | ULP Cakranegara
-- GERUNG       | ULP Gerung
-- TANJUNG      | ULP Tanjung
--
-- STATUS INSPEKSI (urutan alur):
-- Temuan → Perlu Tindakan → Ditugaskan → Dalam Proses → Selesai
--
-- KATEGORI INSPEKSI:
-- Emergency, Urgent, Scheduled, Preventive, Normal
-- ============================================================
