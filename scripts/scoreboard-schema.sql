-- Lead Measures (header/kategori LM)
CREATE TABLE IF NOT EXISTS lead_measures (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nama       TEXT NOT NULL,
  pic        TEXT NOT NULL DEFAULT '',
  ulp        TEXT NOT NULL DEFAULT 'AMPENAN',
  bulan      INT  NOT NULL CHECK (bulan BETWEEN 1 AND 12),
  tahun      INT  NOT NULL,
  komitmen   TEXT NOT NULL DEFAULT '',
  urutan     INT  NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Item pekerjaan per LM (bisa banyak)
CREATE TABLE IF NOT EXISTS lead_measure_items (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_measure_id UUID NOT NULL REFERENCES lead_measures(id) ON DELETE CASCADE,
  nama_item       TEXT    NOT NULL,
  satuan          TEXT    NOT NULL DEFAULT '',
  target_m1       NUMERIC NOT NULL DEFAULT 0,
  target_m2       NUMERIC NOT NULL DEFAULT 0,
  target_m3       NUMERIC NOT NULL DEFAULT 0,
  target_m4       NUMERIC NOT NULL DEFAULT 0,
  realisasi_m1    NUMERIC NOT NULL DEFAULT 0,
  realisasi_m2    NUMERIC NOT NULL DEFAULT 0,
  realisasi_m3    NUMERIC NOT NULL DEFAULT 0,
  realisasi_m4    NUMERIC NOT NULL DEFAULT 0,
  urutan          INT     NOT NULL DEFAULT 0,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- RLS
ALTER TABLE lead_measures      ENABLE ROW LEVEL SECURITY;
ALTER TABLE lead_measure_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "auth_all_lead_measures"
  ON lead_measures FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "auth_all_lead_measure_items"
  ON lead_measure_items FOR ALL TO authenticated USING (true) WITH CHECK (true);
