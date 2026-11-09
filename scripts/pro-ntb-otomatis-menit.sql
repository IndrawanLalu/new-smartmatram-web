-- PRO NTB — Kirim otomatis: jam + MENIT (9 Nov 2026, untuk uji coba tanpa
-- menunggu jam penuh). Pekerja kini memanggil /api/pro-ntb/otomatis tiap menit.
-- Aman dijalankan ulang.
ALTER TABLE public.pro_ntb_sheet
  ADD COLUMN IF NOT EXISTS menit_kirim SMALLINT NOT NULL DEFAULT 0 CHECK (menit_kirim BETWEEN 0 AND 59);
