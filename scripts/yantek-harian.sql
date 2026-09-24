-- =============================================================================
-- Data Yantek (APKT) pindah dari berkas JSON ke Supabase
-- =============================================================================
-- Jalankan manual di Supabase SQL Editor. Aman diulang.
--
-- ── KENAPA ──────────────────────────────────────────────────────────────────
-- Sampai 24 Sep 2026 tarikan data yantek disimpan sebagai berkas
-- `data/yantek/{tanggal}.json` di folder aplikasi. Di VPS lama itu jalan.
-- Di homelab (Docker) gagal: container berjalan sebagai `nextjs`, `/app` milik
-- root → "EACCES: permission denied, mkdir '/app/data'". Kalaupun diberi izin,
-- berkasnya HILANG setiap image dibangun ulang, dan tidak ikut cadangan database.
--
-- Bentuknya dipertahankan: satu baris = satu tanggal, isinya larik baris APKT
-- apa adanya (JSONB). API `/api/yantek` tetap mengembalikan bentuk yang sama,
-- jadi halaman dan dashboard tidak perlu tahu datanya pindah.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.yantek_harian (
  -- 'YYYY-MM-DD', atau 'unknown' untuk baris tanpa waktu lapor (bentuk lama
  -- berkas `unknown.json` dipertahankan).
  tanggal       TEXT PRIMARY KEY,
  label         TEXT,
  rows          JSONB NOT NULL DEFAULT '[]'::jsonb,
  -- Dihitung database, bukan dikirim aplikasi — daftar tanggal cukup membaca
  -- kolom ini tanpa menarik ratusan KB isi per tanggal.
  jumlah        INT GENERATED ALWAYS AS (jsonb_array_length(rows)) STORED,
  disimpan_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  disimpan_oleh UUID
);

ALTER TABLE public.yantek_harian DROP CONSTRAINT IF EXISTS yantek_harian_tanggal_valid;
ALTER TABLE public.yantek_harian ADD CONSTRAINT yantek_harian_tanggal_valid
  CHECK (tanggal ~ '^\d{4}-\d{2}-\d{2}$' OR tanggal = 'unknown');

ALTER TABLE public.yantek_harian DROP CONSTRAINT IF EXISTS yantek_harian_rows_larik;
ALTER TABLE public.yantek_harian ADD CONSTRAINT yantek_harian_rows_larik
  CHECK (jsonb_typeof(rows) = 'array');

COMMENT ON TABLE public.yantek_harian IS
  'Tarikan data yantek APKT per tanggal lapor. Menggantikan berkas data/yantek/*.json (24 Sep 2026).';

ALTER TABLE public.yantek_harian ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS yantek_harian_semua ON public.yantek_harian;
CREATE POLICY yantek_harian_semua ON public.yantek_harian
  FOR ALL TO authenticated USING (true) WITH CHECK (true);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.yantek_harian TO authenticated;

-- Periksa:
--   SELECT left(tanggal, 7) AS bulan, count(*) AS hari, sum(jumlah) AS baris
--   FROM yantek_harian GROUP BY 1 ORDER BY 1;
