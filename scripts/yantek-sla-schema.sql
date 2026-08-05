-- =============================================================================
-- Ambang SLA response & recovery time Yantek
-- Jalankan manual di Supabase SQL Editor. Idempoten.
--
-- Pola pembacaan BERJENJANG, sama seperti `anomali_settings`:
--     baris ULP  →  baris 'ALL'  →  default di kode
-- Jadi cukup mengisi 'ALL' kalau ambangnya seragam; ULP yang punya kondisi
-- khusus (Tanjung dan Gerung jarak tempuhnya jauh) tinggal menimpa.
--
-- Satuan MENIT, menyamai kolom sumbernya di data APKT
-- (`durasi_menit_response`, `durasi_menit_recovery`).
-- =============================================================================

CREATE TABLE IF NOT EXISTS yantek_sla (
  ulp                    TEXT PRIMARY KEY,
  target_response_menit  NUMERIC NOT NULL CHECK (target_response_menit > 0),
  target_recovery_menit  NUMERIC NOT NULL CHECK (target_recovery_menit > 0),
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE  yantek_sla IS 'Ambang SLA yantek per ULP. Baris ulp=''ALL'' adalah default seluruh UP3.';
COMMENT ON COLUMN yantek_sla.target_response_menit IS 'Batas waktu response (menit). Durasi DI ATAS angka ini dihitung melanggar.';
COMMENT ON COLUMN yantek_sla.target_recovery_menit IS 'Batas waktu recovery (menit). Durasi DI ATAS angka ini dihitung melanggar.';

-- Baris default. Angkanya sengaja konservatif dan HARUS disesuaikan lewat UI —
-- dari 4.929 baris Mei–Juni 2026, median response 32 menit dan recovery 67 menit,
-- jadi 45/90 memberi ruang tanpa membuat ambangnya kehilangan arti.
INSERT INTO yantek_sla (ulp, target_response_menit, target_recovery_menit)
VALUES ('ALL', 45, 90)
ON CONFLICT (ulp) DO NOTHING;

-- RLS: baca untuk semua yang sudah login, tulis juga — sama dengan
-- `anomali_settings`. Pembatasan siapa yang boleh menyunting ada di UI
-- (`canManageSettings`), bukan di basis data.
ALTER TABLE yantek_sla ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "yantek_sla_read"  ON yantek_sla;
DROP POLICY IF EXISTS "yantek_sla_write" ON yantek_sla;

CREATE POLICY "yantek_sla_read"  ON yantek_sla FOR SELECT TO authenticated USING (true);
CREATE POLICY "yantek_sla_write" ON yantek_sla FOR ALL    TO authenticated USING (true) WITH CHECK (true);
