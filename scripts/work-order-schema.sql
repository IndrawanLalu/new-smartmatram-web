-- ============================================================
-- Manajemen Work Order — SMART Mataram
-- Jalankan manual di Supabase SQL Editor.
--
-- Model kolom kustom = hibrida:
--   wo_batch.columns (JSONB)  → definisi kolom per WO (bebas, dari paste Excel)
--   wo_item.data     (JSONB)  → nilai sel kustom, keyed by column.key
--   Field WAJIB terstruktur (bukan JSONB) karena dipakai logika app:
--     regu          → filter mobile (per eksekutor role)
--     status        → toggle selesai/belum
--     tgl_realisasi → hitung realisasi di dashboard
--
--   Realisasi 2 basis:
--     1) jumlah baris Selesai (count-based)
--     2) volume/panjang (mis. kms) → sum kolom ukuran untuk baris Selesai.
--        Admin menunjuk measure_column (+ measure_unit). Nilai sel dinormalisasi
--        (koma/titik → desimal) di app; dashboard menjumlahkan on-the-fly.
--
-- RLS: mengikuti pola proyek (auth-all); filtering ULP/regu dilakukan
--      di layer aplikasi (buildUnitFilter + filter regu di query mobile).
-- ============================================================

-- Header / batch WO bulanan
CREATE TABLE IF NOT EXISTS wo_batch (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ulp          TEXT NOT NULL,
  bulan        INT  NOT NULL CHECK (bulan BETWEEN 1 AND 12),
  tahun        INT  NOT NULL,
  judul        TEXT NOT NULL DEFAULT '',
  columns      JSONB NOT NULL DEFAULT '[]'::jsonb,  -- [{ key, label, type, hidden }]
  regu_column  TEXT,                                -- key kolom sumber regu (informasional)
  verifier_column TEXT,                             -- key kolom sumber verifikator (informasional)
  title_column TEXT,                                -- key kolom untuk judul kartu di mobile
  measure_column TEXT,                              -- key kolom ukuran/volume (mis. panjang) untuk realisasi berbasis kms
  measure_unit   TEXT,                              -- satuan ukuran, mis. 'kms'
  sheet_id     TEXT,                                -- spreadsheet sumber (untuk tulis-balik)
  sheet_tab    TEXT,                                -- nama tab
  sheet_sync   JSONB,                               -- { keyCols:[..], write:{ "TGL REALISASI":"tgl_realisasi", ...} }
  created_by   UUID,
  created_at   TIMESTAMPTZ DEFAULT NOW(),
  updated_at   TIMESTAMPTZ DEFAULT NOW()
);

-- Baris pekerjaan per batch
CREATE TABLE IF NOT EXISTS wo_item (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id       UUID NOT NULL REFERENCES wo_batch(id) ON DELETE CASCADE,
  data           JSONB NOT NULL DEFAULT '{}'::jsonb,   -- { colKey: value }
  regu           TEXT,                                 -- eksekutor role: HARJAR/HARGAR/PERABASAN/YANGU/PDKB
  verifier_role  TEXT,                                 -- role yang boleh memverifikasi baris ini (per-row)
  status         TEXT NOT NULL DEFAULT 'Belum' CHECK (status IN ('Belum','Selesai')),
  tgl_realisasi  DATE,
  foto_bukti_url TEXT,
  catatan_petugas TEXT,
  selesai_by     TEXT,              -- nama petugas yang menandai selesai (dari mobile)
  selesai_lat    DOUBLE PRECISION,  -- tagging lokasi saat selesai
  selesai_lng    DOUBLE PRECISION,
  selesai_alamat TEXT,              -- hasil reverse-geocode (desa/dusun/jalan)
  selesai_geo    JSONB,             -- komponen alamat mentah
  -- Alur persetujuan
  verified_by    TEXT,              -- nama verifikator
  verified_role  TEXT,              -- role verifikator saat verifikasi
  verified_at    TIMESTAMPTZ,
  sla_ok         BOOLEAN,           -- true=sesuai SLA, false=tidak, null=belum
  verified_note  TEXT,
  approved_by    TEXT,              -- nama supervisor
  approved_at    TIMESTAMPTZ,
  sheet_key      JSONB,             -- nilai kunci baris di Sheet, mis. { "NO_WO":"...", "NO":"1" }
  sheet_synced_at TIMESTAMPTZ,      -- kapan terakhir ditulis-balik ke Sheet
  urutan         INT NOT NULL DEFAULT 0,
  created_at     TIMESTAMPTZ DEFAULT NOW(),
  updated_at     TIMESTAMPTZ DEFAULT NOW()
);

-- Index untuk query yang sering: daftar batch per unit/bulan, item per batch, filter regu (mobile)
CREATE INDEX IF NOT EXISTS idx_wo_batch_ulp_periode ON wo_batch (ulp, tahun, bulan);
CREATE INDEX IF NOT EXISTS idx_wo_item_batch         ON wo_item (batch_id);
CREATE INDEX IF NOT EXISTS idx_wo_item_regu          ON wo_item (regu);

-- RLS
ALTER TABLE wo_batch ENABLE ROW LEVEL SECURITY;
ALTER TABLE wo_item  ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "auth_all_wo_batch" ON wo_batch;
DROP POLICY IF EXISTS "auth_all_wo_item"  ON wo_item;

CREATE POLICY "auth_all_wo_batch"
  ON wo_batch FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "auth_all_wo_item"
  ON wo_item FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Migrasi aman jika tabel sudah terlanjur dibuat tanpa kolom ukuran:
ALTER TABLE wo_batch ADD COLUMN IF NOT EXISTS measure_column TEXT;
ALTER TABLE wo_batch ADD COLUMN IF NOT EXISTS measure_unit   TEXT;

-- Bukti penyelesaian dari mobile (foto wajib + tagging lokasi + siapa):
ALTER TABLE wo_item ADD COLUMN IF NOT EXISTS selesai_by  TEXT;
ALTER TABLE wo_item ADD COLUMN IF NOT EXISTS selesai_lat DOUBLE PRECISION;
ALTER TABLE wo_item ADD COLUMN IF NOT EXISTS selesai_lng DOUBLE PRECISION;
ALTER TABLE wo_item ADD COLUMN IF NOT EXISTS selesai_alamat TEXT;
ALTER TABLE wo_item ADD COLUMN IF NOT EXISTS selesai_geo JSONB;

-- Alur persetujuan berjenjang (verifikator per-row + approver supervisor):
ALTER TABLE wo_batch ADD COLUMN IF NOT EXISTS verifier_column TEXT;
ALTER TABLE wo_item  ADD COLUMN IF NOT EXISTS verifier_role  TEXT;
ALTER TABLE wo_item  ADD COLUMN IF NOT EXISTS verified_by    TEXT;
ALTER TABLE wo_item  ADD COLUMN IF NOT EXISTS verified_role  TEXT;
ALTER TABLE wo_item  ADD COLUMN IF NOT EXISTS verified_at    TIMESTAMPTZ;
ALTER TABLE wo_item  ADD COLUMN IF NOT EXISTS sla_ok         BOOLEAN;
ALTER TABLE wo_item  ADD COLUMN IF NOT EXISTS verified_note  TEXT;
ALTER TABLE wo_item  ADD COLUMN IF NOT EXISTS approved_by    TEXT;
ALTER TABLE wo_item  ADD COLUMN IF NOT EXISTS approved_at    TIMESTAMPTZ;

-- Integrasi Google Sheet (impor + tulis-balik):
ALTER TABLE wo_batch ADD COLUMN IF NOT EXISTS sheet_id   TEXT;
ALTER TABLE wo_batch ADD COLUMN IF NOT EXISTS sheet_tab  TEXT;
ALTER TABLE wo_batch ADD COLUMN IF NOT EXISTS sheet_sync JSONB;
ALTER TABLE wo_item  ADD COLUMN IF NOT EXISTS sheet_key       JSONB;
ALTER TABLE wo_item  ADD COLUMN IF NOT EXISTS sheet_synced_at TIMESTAMPTZ;
