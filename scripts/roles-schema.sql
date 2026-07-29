-- ============================================================
-- Roles data-driven — SMART Mataram
-- Jalankan manual di Supabase SQL Editor.
--
-- Sumber kebenaran runtime untuk daftar role/regu. Flag menggantikan logika
-- berbasis-nama role:
--   sees_all_units → UP3 (lihat semua ULP)
--   can_assign     → boleh assign eksekutor / kelola (UP3, admin)
--   is_eksekutor   → tim pengeksekusi WO → muncul sbg opsi regu + dasar filter WO mobile
--   needs_unit     → wajib punya ULP
--   is_system      → role inti; tak bisa dihapus, flag terkunci (perilaku di kode)
--
-- Writes lewat /api/roles (service_role). Reads lewat browser (RLS SELECT authenticated).
-- ============================================================

CREATE TABLE IF NOT EXISTS roles (
  code           TEXT PRIMARY KEY,
  label          TEXT NOT NULL,
  platform       TEXT NOT NULL DEFAULT 'mobile' CHECK (platform IN ('web','mobile','all')),
  needs_unit     BOOLEAN NOT NULL DEFAULT true,
  is_eksekutor   BOOLEAN NOT NULL DEFAULT false,
  sees_all_units BOOLEAN NOT NULL DEFAULT false,
  can_assign     BOOLEAN NOT NULL DEFAULT false,
  can_verify_wo  BOOLEAN NOT NULL DEFAULT false, -- verifikator WO (Koordinator/Staff Teknik)
  can_approve_wo BOOLEAN NOT NULL DEFAULT false, -- approver WO (Supervisor)
  is_system      BOOLEAN NOT NULL DEFAULT false,
  menus          TEXT[] NOT NULL DEFAULT '{}',   -- id menu mobile yang boleh diakses role ini
  urutan         INT NOT NULL DEFAULT 0,
  created_at     TIMESTAMPTZ DEFAULT now(),
  updated_at     TIMESTAMPTZ DEFAULT now()
);

-- Seed role sistem (sekaligus beresi drift manager/K3)
INSERT INTO roles (code, label, platform, needs_unit, is_eksekutor, sees_all_units, can_assign, is_system, urutan) VALUES
  ('UP3',       'UP3',       'web',    false, false, true,  true,  true, 1),
  ('admin',     'Admin ULP', 'all',    true,  false, false, true,  true, 2),
  ('inspektor', 'Inspektor', 'mobile', true,  false, false, false, true, 3),
  ('HARJAR',    'HARJAR',    'mobile', true,  true,  false, false, true, 4),
  ('HARGAR',    'HARGAR',    'mobile', true,  true,  false, false, true, 5),
  ('PERABASAN', 'Perabasan', 'mobile', true,  true,  false, false, true, 6),
  ('YANGU',     'YANGU',     'mobile', true,  true,  false, false, true, 7),
  ('PDKB',      'PDKB',      'mobile', true,  true,  false, false, true, 8),
  ('manager',   'Manager',   'web',    true,  false, false, false, true, 9),
  ('K3',        'Tim K3',    'all',    true,  false, false, false, true, 10)
ON CONFLICT (code) DO NOTHING;

-- RLS: semua authenticated boleh baca; tulis via service_role (bypass RLS).
ALTER TABLE roles ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "read_roles_authenticated" ON roles;
CREATE POLICY "read_roles_authenticated"
  ON roles FOR SELECT TO authenticated USING (true);

-- user_roles: ganti CHECK role_valid (statis) → FK ke roles(code) (dinamis + integritas).
-- FK mencegah assign role tak-ada & mencegah hapus role yang masih dipakai user.
-- Prasyarat: semua nilai user_roles.role sudah ada di roles (seed di atas mencakup 10 kanonik).
ALTER TABLE user_roles DROP CONSTRAINT IF EXISTS role_valid;
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'user_roles_role_fkey'
  ) THEN
    ALTER TABLE user_roles
      ADD CONSTRAINT user_roles_role_fkey
      FOREIGN KEY (role) REFERENCES roles(code) ON UPDATE CASCADE;
  END IF;
END $$;

-- Akses menu mobile per role (data-driven). Aman dijalankan ulang.
ALTER TABLE roles ADD COLUMN IF NOT EXISTS menus TEXT[] NOT NULL DEFAULT '{}';

-- Kapabilitas alur persetujuan WO
ALTER TABLE roles ADD COLUMN IF NOT EXISTS can_verify_wo  BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE roles ADD COLUMN IF NOT EXISTS can_approve_wo BOOLEAN NOT NULL DEFAULT false;

-- Seed default menu untuk role sistem (hanya bila masih kosong) → cocokkan menuConfig.ts mobile.
UPDATE roles SET menus = ARRAY['inspeksi','petaPohon','gangguan','bebanTrafo','pengukuranGardu','riwayatGardu','scanMeter']
  WHERE code IN ('admin','inspektor') AND (menus IS NULL OR menus = '{}');
UPDATE roles SET menus = ARRAY['petaPohon','gangguan','bebanTrafo','pengukuranGardu','riwayatGardu','scanMeter']
  WHERE code IN ('PERABASAN','YANGU') AND (menus IS NULL OR menus = '{}');
