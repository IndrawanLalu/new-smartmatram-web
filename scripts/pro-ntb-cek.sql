-- ═══════════════════════════════════════════════════════════════════════════
-- PRO NTB — hasil cek terakhir per ULP & bulan (8 Nov 2026).
-- Kolom "PRO NTB" di Rekap Kinerja membaca tabel ini (bukan spreadsheet
-- langsung — membaca 9 tab tiap halaman dimuat terlalu berat). Diisi server:
--   • tiap malam (pekerja, JAM_CEK_PRO_NTB, bawaan 23.00 WITA)
--   • sesudah Kirim ke spreadsheet
--   • tombol "Cek PRO NTB sekarang" di Rekap Kinerja
-- Angka SMART = realisasi + belum disetujui (= yang dikirim ke PRO NTB).
-- Aman dijalankan ulang.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.pro_ntb_cek_ulp (
  ulp        TEXT NOT NULL,
  bulan      TEXT NOT NULL CHECK (bulan ~ '^[0-9]{4}-[0-9]{2}'),   -- "2026-11"
  sampai     DATE,                                                -- tanggal terakhir yang dibandingkan
  dicek_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  sumber     TEXT NOT NULL DEFAULT 'tombol' CHECK (sumber IN ('malam', 'kirim', 'tombol')),
  galat      TEXT,                                                -- NULL = cek berhasil
  oleh       TEXT,
  PRIMARY KEY (ulp, bulan)
);

CREATE TABLE IF NOT EXISTS public.pro_ntb_cek (
  ulp          TEXT NOT NULL,
  bulan        TEXT NOT NULL,
  kunci        TEXT NOT NULL,                                      -- jenis Rekap Kinerja
  smart_n      INT NOT NULL DEFAULT 0,
  smart_jumlah NUMERIC NOT NULL DEFAULT 0,
  sheet_n      INT NOT NULL DEFAULT 0,
  sheet_jumlah NUMERIC NOT NULL DEFAULT 0,
  cocok        INT NOT NULL DEFAULT 0,
  beda         INT NOT NULL DEFAULT 0,
  hanya_smart  INT NOT NULL DEFAULT 0,
  hanya_sheet  INT NOT NULL DEFAULT 0,
  PRIMARY KEY (ulp, bulan, kunci),
  FOREIGN KEY (ulp, bulan) REFERENCES public.pro_ntb_cek_ulp (ulp, bulan) ON DELETE CASCADE
);

ALTER TABLE public.pro_ntb_cek_ulp ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pro_ntb_cek ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS pro_ntb_cek_ulp_baca ON public.pro_ntb_cek_ulp;
CREATE POLICY pro_ntb_cek_ulp_baca ON public.pro_ntb_cek_ulp FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS pro_ntb_cek_baca ON public.pro_ntb_cek;
CREATE POLICY pro_ntb_cek_baca ON public.pro_ntb_cek FOR SELECT TO authenticated USING (true);
GRANT SELECT ON public.pro_ntb_cek_ulp, public.pro_ntb_cek TO authenticated;
-- Ditulis hanya oleh server (service role).
