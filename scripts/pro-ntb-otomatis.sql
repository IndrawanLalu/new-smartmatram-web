-- ═══════════════════════════════════════════════════════════════════════════
-- PRO NTB — Kirim otomatis terjadwal (9 Nov 2026).
--
-- Per ULP: nyala/mati + jam (WITA), diatur di web (layar Cek → Kirim, UP3 /
-- admin ULP itu). Pekerja memanggil /api/pro-ntb/otomatis tiap jam; ULP yang
-- jamnya tiba dikirim PER TAB (satu panggilan Apps Script per jenis
-- pekerjaan), lalu kolom PRO NTB Rekap Kinerja dicek ulang.
-- Tanggal 1–5: bulan lalu ikut dikirim (koreksi susulan sesudah disetujui).
-- Aman dijalankan ulang.
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE public.pro_ntb_sheet
  ADD COLUMN IF NOT EXISTS kirim_otomatis   BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS jam_kirim        SMALLINT NOT NULL DEFAULT 22 CHECK (jam_kirim BETWEEN 0 AND 23),
  -- Putaran terakhir: mulai/selesai + ringkasan (atau galat). Mulai tanpa
  -- selesai < 1 jam = masih berjalan → putaran berikutnya tidak menumpuk.
  ADD COLUMN IF NOT EXISTS otomatis_mulai   TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS otomatis_selesai TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS otomatis_ringkas TEXT;

-- Jejak per tab & asal kiriman.
ALTER TABLE public.pro_ntb_kirim_log
  ADD COLUMN IF NOT EXISTS tab    TEXT,
  ADD COLUMN IF NOT EXISTS sumber TEXT NOT NULL DEFAULT 'tombol';
