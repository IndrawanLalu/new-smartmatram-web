-- Tabel konfigurasi jadwal kirim Morning Brief ke Telegram
-- Singleton: selalu 1 baris (id = 1)

CREATE TABLE IF NOT EXISTS morning_brief_settings (
  id            INT PRIMARY KEY DEFAULT 1,
  send_hour_wita INT NOT NULL DEFAULT 8
                  CHECK (send_hour_wita >= 0 AND send_hour_wita <= 23),
  enabled       BOOLEAN NOT NULL DEFAULT true,
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);

-- Pastikan baris default sudah ada
INSERT INTO morning_brief_settings (id, send_hour_wita, enabled)
VALUES (1, 8, true)
ON CONFLICT (id) DO NOTHING;

-- RLS: semua user terautentikasi bisa baca; update via service_role saja
ALTER TABLE morning_brief_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read settings"
  ON morning_brief_settings FOR SELECT
  TO authenticated
  USING (true);
