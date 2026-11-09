-- PRO NTB — hasil cek ikut menyimpan jumlah WO (9 Nov 2026): kolom PRO NTB
-- Rekap Kinerja menampilkan "WO sesuai" dan "Realisasi sesuai" terpisah.
-- NULL = hasil cek sebelum skrip ini (belum ada angka WO). Aman diulang.
ALTER TABLE public.pro_ntb_cek
  ADD COLUMN IF NOT EXISTS smart_wo NUMERIC,
  ADD COLUMN IF NOT EXISTS sheet_wo NUMERIC;
