-- Antrean AMG: user klik "Kirim ke AMG" (web) → set amg_queued_at.
-- Agen lokal (smart-agent) mengirim ke AMG lalu set amg_sent_at (atau amg_error).
-- Jalankan di Supabase SQL Editor.

ALTER TABLE pengukuran_gardu ADD COLUMN IF NOT EXISTS amg_queued_at TIMESTAMPTZ;
ALTER TABLE pengukuran_gardu ADD COLUMN IF NOT EXISTS amg_error     TEXT;
