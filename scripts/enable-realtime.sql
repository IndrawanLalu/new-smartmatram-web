-- Aktifkan Supabase Realtime untuk tabel yang dibutuhkan
-- Jalankan di Supabase SQL Editor (Database → SQL Editor)

-- 1. Daftarkan tabel ke publication realtime Supabase
ALTER PUBLICATION supabase_realtime ADD TABLE inspeksi;
ALTER PUBLICATION supabase_realtime ADD TABLE inspeksi_pohon;
ALTER PUBLICATION supabase_realtime ADD TABLE pengukuran_gardu;

-- 2. Set REPLICA IDENTITY FULL agar event DELETE membawa kolom id
--    (default hanya kirim primary key — sudah cukup untuk filter kita,
--     tapi FULL lebih aman jika PK-nya composite atau perlu data lain)
ALTER TABLE inspeksi         REPLICA IDENTITY FULL;
ALTER TABLE inspeksi_pohon   REPLICA IDENTITY FULL;
ALTER TABLE pengukuran_gardu REPLICA IDENTITY FULL;
