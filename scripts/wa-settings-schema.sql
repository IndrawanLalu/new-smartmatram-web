-- WA Settings: konfigurasi group ID WhatsApp per kategori & ULP
-- Jalankan di Supabase SQL Editor

CREATE TABLE IF NOT EXISTS wa_settings (
  id          text PRIMARY KEY,
  label       text        NOT NULL,
  category    text        NOT NULL, -- 'jaringan' | 'perabasan' | 'morning_brief' | 'reminder'
  ulp         text,                 -- 'AMPENAN' | 'CAKRANEGARA' | 'GERUNG' | 'TANJUNG' | NULL
  group_id    text        NOT NULL DEFAULT '',
  enabled     boolean     NOT NULL DEFAULT true,
  updated_at  timestamptz NOT NULL DEFAULT now()
);

-- Seed data (isi group_id sesuai kondisi real)
INSERT INTO wa_settings (id, label, category, ulp, group_id, enabled) VALUES
  ('jaringan_ampenan',     'Jaringan Urgent — AMPENAN',          'jaringan',     'AMPENAN',     '', true),
  ('jaringan_cakranegara', 'Jaringan Urgent — CAKRANEGARA',      'jaringan',     'CAKRANEGARA', '', false),
  ('jaringan_gerung',      'Jaringan Urgent — GERUNG',           'jaringan',     'GERUNG',      '', false),
  ('jaringan_tanjung',     'Jaringan Urgent — TANJUNG',          'jaringan',     'TANJUNG',     '', false),
  ('perabasan_ampenan',    'Pohon Sangat Tinggi — AMPENAN',      'perabasan',    'AMPENAN',     '', true),
  ('perabasan_cakranegara','Pohon Sangat Tinggi — CAKRANEGARA',  'perabasan',    'CAKRANEGARA', '', false),
  ('perabasan_gerung',     'Pohon Sangat Tinggi — GERUNG',       'perabasan',    'GERUNG',      '', false),
  ('perabasan_tanjung',    'Pohon Sangat Tinggi — TANJUNG',      'perabasan',    'TANJUNG',     '', false),
  ('morning_brief',        'Morning Brief Harian',               'morning_brief', NULL,          '', true),
  ('reminder_ampenan',     'Reminder Urgent — AMPENAN',          'reminder',     'AMPENAN',     '', true),
  ('reminder_cakranegara', 'Reminder Urgent — CAKRANEGARA',      'reminder',     'CAKRANEGARA', '', false),
  ('reminder_gerung',      'Reminder Urgent — GERUNG',           'reminder',     'GERUNG',      '', false),
  ('reminder_tanjung',     'Reminder Urgent — TANJUNG',          'reminder',     'TANJUNG',     '', false)
ON CONFLICT (id) DO NOTHING;

-- RLS
ALTER TABLE wa_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "wa_settings_read_all"
  ON wa_settings FOR SELECT USING (true);

CREATE POLICY "wa_settings_write_admin_up3"
  ON wa_settings FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM user_roles
      WHERE user_id = auth.uid() AND role IN ('UP3', 'admin')
    )
  );
