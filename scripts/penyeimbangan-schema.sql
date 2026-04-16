-- Tabel rekap penyeimbangan beban gardu
-- Jalankan di Supabase SQL Editor

CREATE TABLE IF NOT EXISTS penyeimbangan_gardu (
  id                  UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  pengukuran_id       TEXT REFERENCES pengukuran_gardu(id) ON DELETE SET NULL,

  -- Identitas gardu
  no_gardu            TEXT NOT NULL,
  penyulang           TEXT,
  alamat              TEXT,
  ulp                 TEXT,
  kva_trafo           NUMERIC DEFAULT 0,

  -- Snapshot SEBELUM diseimbangkan
  arus_r_before       NUMERIC DEFAULT 0,
  arus_s_before       NUMERIC DEFAULT 0,
  arus_t_before       NUMERIC DEFAULT 0,
  arus_n_before       NUMERIC DEFAULT 0,
  beban_kva_before    NUMERIC DEFAULT 0,
  beban_pct_before    NUMERIC DEFAULT 0,
  perjurusan_before   JSONB DEFAULT '{}',

  -- Data SESUDAH diseimbangkan
  arus_r_after        NUMERIC DEFAULT 0,
  arus_s_after        NUMERIC DEFAULT 0,
  arus_t_after        NUMERIC DEFAULT 0,
  arus_n_after        NUMERIC DEFAULT 0,
  beban_kva_after     NUMERIC DEFAULT 0,
  beban_pct_after     NUMERIC DEFAULT 0,
  perjurusan_after    JSONB DEFAULT '{}',

  -- Info penyeimbangan
  tgl_penyeimbangan   DATE NOT NULL,
  petugas_penyeimbang TEXT,
  catatan             TEXT,

  created_at          TIMESTAMPTZ DEFAULT now()
);

-- Index untuk query rekap per bulan
CREATE INDEX IF NOT EXISTS idx_penyeimbangan_tgl
  ON penyeimbangan_gardu (tgl_penyeimbangan DESC);

CREATE INDEX IF NOT EXISTS idx_penyeimbangan_ulp
  ON penyeimbangan_gardu (ulp, tgl_penyeimbangan DESC);

-- RLS
ALTER TABLE penyeimbangan_gardu ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all for authenticated"
  ON penyeimbangan_gardu
  FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);
