-- =============================================================================
-- gardu.id: beri nilai bawaan
-- Jalankan manual di Supabase SQL Editor. Idempoten. WAJIB sebelum impor master.
--
-- Masalahnya: kolom `id` bertipe teks, NOT NULL, TANPA nilai bawaan — sisa
-- migrasi dari Firebase (id lama berbentuk "09ooIVZupVSTr7jQ7oVp"). Akibatnya
-- setiap INSERT yang tidak menyebut `id` ditolak.
--
-- Itu memblokir upsert SEKALIGUS di dua arah, dan yang kedua tidak kelihatan
-- sampai dicoba:
--   • baris BARU     → jelas gagal, tidak ada id
--   • baris LAMA     → JUGA gagal. Postgres memeriksa NOT NULL milik bagian
--                      INSERT sebelum sampai ke ON CONFLICT, jadi "cuma
--                      memperbarui" pun tetap butuh id.
--
-- Mengisi id dari sisi aplikasi bukan jalan keluar: pada baris yang diperbarui,
-- id yang ikut terkirim akan MENIMPA primary key gardu yang sudah ada.
-- Nilai bawaan di database menyelesaikan keduanya — INSERT dapat id sendiri,
-- UPDATE tidak menyentuh kolomnya sama sekali.
--
-- Id lama dibiarkan apa adanya. Bentuknya jadi campur (Firebase lama + UUID
-- baru), dan itu tidak masalah: id di sini hanya kunci buram, tidak pernah
-- dibaca manusia. Menyeragamkannya berarti memutus rujukan yang sudah ada.
-- =============================================================================

ALTER TABLE gardu
  ALTER COLUMN id SET DEFAULT gen_random_uuid()::text;

-- Periksa:
--   SELECT column_default FROM information_schema.columns
--   WHERE table_name = 'gardu' AND column_name = 'id';
