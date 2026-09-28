-- =============================================================================
-- B3 (28 Sep 2026) — Versi minimum aplikasi HP (wajib perbarui)
-- Jalankan manual di Supabase SQL Editor. Idempoten.
--
-- HP membaca baris ini saat dibuka dan saat kembali ke depan. Versi app di
-- bawah `versi_minimum` → layar penghalang "Versi baru tersedia" dengan tombol
-- ke Play Store. Dibaca SEBELUM login, jadi boleh dibaca anon.
--
-- ⚠ URUTAN (keputusan 28 Sep 2026):
--   1. Baris awal = 1.3.0 → tidak ada yang terhalang. Layar penghalang dikirim
--      lewat OTA ke app 1.3.0 yang sekarang.
--   2. Build 1.4.0 tayang di Play Store (produksi, bukan uji internal).
--   3. Anjurkan dulu (kartu, bisa "Nanti saja"):
--        UPDATE versi_aplikasi SET versi_terbaru = '1.4.0', updated_at = now()
--        WHERE platform = 'android';
--   4. Setelah tenggat, BARU paksa:
--        UPDATE versi_aplikasi SET versi_minimum = '1.4.0', updated_at = now()
--        WHERE platform = 'android';
--   Menaikkan sebelum langkah 2 = regu terkunci tanpa jalan keluar.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.versi_aplikasi (
  platform      TEXT PRIMARY KEY CHECK (platform IN ('android', 'ios')),
  versi_minimum TEXT NOT NULL CHECK (versi_minimum ~ '^[0-9]+\.[0-9]+\.[0-9]+$'),
  pesan         TEXT,
  url_toko      TEXT NOT NULL,
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.versi_aplikasi IS
  'Versi minimum app HP. Dinaikkan HANYA setelah versi baru tayang di toko aplikasi.';

INSERT INTO public.versi_aplikasi (platform, versi_minimum, pesan, url_toko)
VALUES (
  'android',
  '1.3.0',
  'Versi baru SMART Mataram sudah tersedia di Play Store. Perbarui untuk melanjutkan — isian yang tersimpan di HP tidak hilang.',
  'https://play.google.com/store/apps/details?id=com.pln.inspeksiulp'
)
ON CONFLICT (platform) DO NOTHING;

-- Anjuran (bukan paksaan): versi app di bawah `versi_terbaru` → saat dibuka
-- muncul kartu "Versi baru tersedia" · Perbarui sekarang / Nanti saja.
-- Diisi begitu versi baru tayang; `versi_minimum` dinaikkan belakangan.
ALTER TABLE public.versi_aplikasi ADD COLUMN IF NOT EXISTS versi_terbaru TEXT
  CHECK (versi_terbaru IS NULL OR versi_terbaru ~ '^[0-9]+\.[0-9]+\.[0-9]+$');

ALTER TABLE public.versi_aplikasi ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS versi_aplikasi_baca ON public.versi_aplikasi;
CREATE POLICY versi_aplikasi_baca ON public.versi_aplikasi FOR SELECT TO anon, authenticated USING (true);
GRANT SELECT ON public.versi_aplikasi TO anon, authenticated;
-- Tidak ada kebijakan tulis: diubah lewat SQL Editor saja.
