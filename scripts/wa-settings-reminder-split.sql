-- Migrasi: pisah reminder menjadi reminder_jaringan dan reminder_pohon
-- Jalankan di Supabase SQL Editor

-- Hapus reminder lama (combined)
DELETE FROM wa_settings WHERE category = 'reminder';

-- Tambah reminder_jaringan per ULP
INSERT INTO wa_settings (id, label, category, ulp, group_id, enabled) VALUES
  ('reminder_jaringan_ampenan',     'Reminder Jaringan Urgent — AMPENAN',     'reminder_jaringan', 'AMPENAN',     '', true),
  ('reminder_jaringan_cakranegara', 'Reminder Jaringan Urgent — CAKRANEGARA', 'reminder_jaringan', 'CAKRANEGARA', '', false),
  ('reminder_jaringan_gerung',      'Reminder Jaringan Urgent — GERUNG',      'reminder_jaringan', 'GERUNG',      '', false),
  ('reminder_jaringan_tanjung',     'Reminder Jaringan Urgent — TANJUNG',     'reminder_jaringan', 'TANJUNG',     '', false)
ON CONFLICT (id) DO NOTHING;

-- Tambah reminder_pohon per ULP
INSERT INTO wa_settings (id, label, category, ulp, group_id, enabled) VALUES
  ('reminder_pohon_ampenan',     'Reminder Pohon Sangat Tinggi — AMPENAN',     'reminder_pohon', 'AMPENAN',     '', true),
  ('reminder_pohon_cakranegara', 'Reminder Pohon Sangat Tinggi — CAKRANEGARA', 'reminder_pohon', 'CAKRANEGARA', '', false),
  ('reminder_pohon_gerung',      'Reminder Pohon Sangat Tinggi — GERUNG',      'reminder_pohon', 'GERUNG',      '', false),
  ('reminder_pohon_tanjung',     'Reminder Pohon Sangat Tinggi — TANJUNG',     'reminder_pohon', 'TANJUNG',     '', false)
ON CONFLICT (id) DO NOTHING;
