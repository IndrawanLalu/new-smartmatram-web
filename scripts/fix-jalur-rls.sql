-- Fix RLS policies untuk tabel jalur dan jalur_koordinat
-- Jalankan di Supabase SQL Editor

-- ── Cek policy yang sudah ada ─────────────────────────────────────────────────
-- SELECT schemaname, tablename, policyname, cmd, roles
-- FROM pg_policies
-- WHERE tablename IN ('jalur', 'jalur_koordinat');

-- ── jalur ─────────────────────────────────────────────────────────────────────

-- Hapus policy lama kalau ada (aman dijalankan berulang)
DROP POLICY IF EXISTS "auth insert jalur" ON jalur;
DROP POLICY IF EXISTS "auth update jalur" ON jalur;
DROP POLICY IF EXISTS "auth delete jalur" ON jalur;
DROP POLICY IF EXISTS "auth read jalur"   ON jalur;

-- Buat ulang semua policy
CREATE POLICY "auth read jalur"
  ON jalur FOR SELECT TO authenticated USING (true);

CREATE POLICY "auth insert jalur"
  ON jalur FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "auth update jalur"
  ON jalur FOR UPDATE TO authenticated USING (true);

CREATE POLICY "auth delete jalur"
  ON jalur FOR DELETE TO authenticated USING (true);

-- ── jalur_koordinat ───────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "auth insert jalur_koordinat" ON jalur_koordinat;
DROP POLICY IF EXISTS "auth update jalur_koordinat" ON jalur_koordinat;
DROP POLICY IF EXISTS "auth delete jalur_koordinat" ON jalur_koordinat;
DROP POLICY IF EXISTS "auth read jalur_koordinat"   ON jalur_koordinat;

-- Aktifkan RLS kalau belum
ALTER TABLE jalur_koordinat ENABLE ROW LEVEL SECURITY;

CREATE POLICY "auth read jalur_koordinat"
  ON jalur_koordinat FOR SELECT TO authenticated USING (true);

CREATE POLICY "auth insert jalur_koordinat"
  ON jalur_koordinat FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "auth update jalur_koordinat"
  ON jalur_koordinat FOR UPDATE TO authenticated USING (true);

CREATE POLICY "auth delete jalur_koordinat"
  ON jalur_koordinat FOR DELETE TO authenticated USING (true);
