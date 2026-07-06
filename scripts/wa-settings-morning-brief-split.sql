-- Migrasi: pecah morning_brief (1 baris global, ulp NULL) → per-ULP (fan-out seperti reminder).
-- Ampenan mewarisi group_id lama & tetap AKTIF; ULP lain kosong & nonaktif (isi via Settings WA).
-- Jalankan di Supabase SQL Editor.

-- 1. Ampenan: pakai group_id lama yang sudah ada, enabled true
INSERT INTO wa_settings (id, label, category, ulp, group_id, enabled)
SELECT 'morning_brief_ampenan', 'Morning Brief — AMPENAN', 'morning_brief', 'AMPENAN',
       COALESCE(group_id, ''), true
FROM wa_settings WHERE id = 'morning_brief'
ON CONFLICT (id) DO NOTHING;

-- Fallback bila baris lama tak ada: Ampenan kosong & nonaktif
INSERT INTO wa_settings (id, label, category, ulp, group_id, enabled) VALUES
  ('morning_brief_ampenan', 'Morning Brief — AMPENAN', 'morning_brief', 'AMPENAN', '', false)
ON CONFLICT (id) DO NOTHING;

-- 2. ULP lain: kosong & nonaktif (isi group + enable via halaman Settings WA saat siap)
INSERT INTO wa_settings (id, label, category, ulp, group_id, enabled) VALUES
  ('morning_brief_cakranegara', 'Morning Brief — CAKRANEGARA', 'morning_brief', 'CAKRANEGARA', '', false),
  ('morning_brief_gerung',      'Morning Brief — GERUNG',      'morning_brief', 'GERUNG',      '', false),
  ('morning_brief_tanjung',     'Morning Brief — TANJUNG',     'morning_brief', 'TANJUNG',     '', false)
ON CONFLICT (id) DO NOTHING;

-- 3. Hapus baris lama global (ulp NULL)
DELETE FROM wa_settings WHERE id = 'morning_brief';
