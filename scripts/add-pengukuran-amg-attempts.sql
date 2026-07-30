-- Batas percobaan kirim AMG.
-- Jalankan manual di Supabase SQL Editor.
--
-- Sebelumnya agen mengambil SEMUA baris `amg_queued_at not null AND amg_sent_at is null`
-- tanpa melihat amg_error, sehingga baris yang gagal permanen (mis. URL AMG salah)
-- dicoba ulang tiap siklus polling — default 60 detik — selamanya.
--
-- Dengan kolom ini agen berhenti setelah 3 kali gagal. Baris yang mentok
-- tetap terlihat di web sebagai "AMG GAGAL" dan bisa diantre ulang lewat
-- tombol Kirim ke AMG (yang mengembalikan amg_attempts ke 0).

ALTER TABLE pengukuran_gardu
  ADD COLUMN IF NOT EXISTS amg_attempts INT NOT NULL DEFAULT 0;

-- Baris yang sudah gagal sebelum kolom ini ada: biarkan 0 supaya masih dapat
-- 3 kesempatan setelah URL-nya diperbaiki.

-- Index untuk query antrean agen (queued, belum terkirim, percobaan < 3)
CREATE INDEX IF NOT EXISTS idx_pengukuran_amg_antrean
  ON pengukuran_gardu (amg_queued_at, amg_sent_at, amg_attempts)
  WHERE amg_queued_at IS NOT NULL AND amg_sent_at IS NULL;
