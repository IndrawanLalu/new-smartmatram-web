-- REVERT: kembalikan ke waktu_nyala_sementara (text) satu kolom
-- Jalankan di Supabase SQL Editor jika sebelumnya sudah menjalankan migrasi split

alter table padam_apkt
  drop column if exists tgl_nyala_sementara,
  drop column if exists jam_nyala_sementara,
  add column if not exists waktu_nyala_sementara text;
