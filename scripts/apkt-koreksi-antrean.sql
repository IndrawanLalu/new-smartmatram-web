-- Antrean koreksi kode G ke APKT (19 Nov 2026). Idempoten.
-- Jalankan manual di Supabase SQL Editor SEBELUM web baru dipakai.
--
-- Bookmark "Isi APKT dari Smart" melaporkan laporan yang sudah tersimpan di
-- APKT ke /api/apkt/koreksi/masuk → kolom ini terisi → laporan itu tidak ikut
-- antrean berikutnya dan di tabel bertanda "Sudah dikoreksi" (sebelumnya "Masuk antrian").

ALTER TABLE public.apkt_koreksi
  ADD COLUMN IF NOT EXISTS apkt_masuk_at TIMESTAMPTZ;
