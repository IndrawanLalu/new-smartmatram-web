-- Jalankan di Supabase SQL Editor

alter table padam_apkt
  add column if not exists status_gangguan      text,   -- 'murni' | 'tidak_murni'
  add column if not exists analisis_keterangan  text,
  add column if not exists ref_gangguan         jsonb;  -- referensi dari sheet gangguanPenyulang
