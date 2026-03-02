-- ============================================================
-- Fix 1: RLS policies untuk tabel data
-- Jalankan di Supabase → SQL Editor
-- ============================================================

-- Drop dulu kalau sudah ada, lalu recreate
DO $$ BEGIN

  -- inspeksi
  DROP POLICY IF EXISTS "authenticated read inspeksi" ON inspeksi;
  DROP POLICY IF EXISTS "authenticated update inspeksi" ON inspeksi;
  CREATE POLICY "authenticated read inspeksi"
    ON inspeksi FOR SELECT TO authenticated USING (true);
  CREATE POLICY "authenticated update inspeksi"
    ON inspeksi FOR UPDATE TO authenticated USING (true);

  -- inspeksi_pohon
  DROP POLICY IF EXISTS "authenticated read inspeksi_pohon" ON inspeksi_pohon;
  DROP POLICY IF EXISTS "authenticated update inspeksi_pohon" ON inspeksi_pohon;
  CREATE POLICY "authenticated read inspeksi_pohon"
    ON inspeksi_pohon FOR SELECT TO authenticated USING (true);
  CREATE POLICY "authenticated update inspeksi_pohon"
    ON inspeksi_pohon FOR UPDATE TO authenticated USING (true);

  -- gardu
  DROP POLICY IF EXISTS "authenticated read gardu" ON gardu;
  CREATE POLICY "authenticated read gardu"
    ON gardu FOR SELECT TO authenticated USING (true);

  -- jalur
  DROP POLICY IF EXISTS "authenticated read jalur" ON jalur;
  CREATE POLICY "authenticated read jalur"
    ON jalur FOR SELECT TO authenticated USING (true);

  -- jalur_koordinat
  DROP POLICY IF EXISTS "authenticated read jalur_koordinat" ON jalur_koordinat;
  CREATE POLICY "authenticated read jalur_koordinat"
    ON jalur_koordinat FOR SELECT TO authenticated USING (true);

  -- petugas
  DROP POLICY IF EXISTS "authenticated read petugas" ON petugas;
  CREATE POLICY "authenticated read petugas"
    ON petugas FOR SELECT TO authenticated USING (true);

END $$;


-- ============================================================
-- Fix 2: Insert role UP3 untuk akun Anda
-- Ganti email di bawah dengan email login Anda
-- ============================================================

-- Jalankan dua query ini secara terpisah:

-- Step 1: Cari UUID akun Anda
SELECT id, email FROM auth.users WHERE email = 'email_anda@gmail.com';

-- Step 2: Insert role (ganti uuid dan nama)
INSERT INTO user_roles (user_id, role, unit, name)
VALUES (
  'paste-uuid-dari-step1',
  'UP3',
  NULL,
  'Nama Anda'
)
ON CONFLICT (user_id) DO UPDATE
  SET role = EXCLUDED.role,
      unit = EXCLUDED.unit,
      name = EXCLUDED.name;

-- Verifikasi
SELECT * FROM user_roles;
