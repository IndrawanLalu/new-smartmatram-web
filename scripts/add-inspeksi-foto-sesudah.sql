-- Tambah kolom foto sesudah pada tabel inspeksi
-- Jalankan di Supabase SQL Editor

ALTER TABLE inspeksi ADD COLUMN IF NOT EXISTS foto_sesudah_url text;

-- Buat Storage bucket 'inspeksi' jika belum ada
-- Lakukan via Supabase Dashboard → Storage → New bucket → name: "inspeksi", Public: true
-- Atau via SQL (memerlukan pg_net extension):
-- INSERT INTO storage.buckets (id, name, public) VALUES ('inspeksi', 'inspeksi', true)
-- ON CONFLICT DO NOTHING;
