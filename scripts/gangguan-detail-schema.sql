-- Detail gangguan penyulang per bulan (rekap SAIDI/SAIFI)
CREATE TABLE IF NOT EXISTS gangguan_detail (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ulp              TEXT NOT NULL DEFAULT 'AMPENAN',
  bulan            INT  NOT NULL CHECK (bulan BETWEEN 1 AND 12),
  tahun            INT  NOT NULL,
  titik_gangguan   TEXT NOT NULL DEFAULT '',
  tgl_gangguan     TEXT NOT NULL DEFAULT '',
  jam_padam        TEXT NOT NULL DEFAULT '',
  durasi           TEXT NOT NULL DEFAULT '',
  jml_plgn         INT  NOT NULL DEFAULT 0,
  jml_x_plgn_padam NUMERIC NOT NULL DEFAULT 0,
  penyebab         TEXT NOT NULL DEFAULT '',
  pain_point       TEXT NOT NULL DEFAULT '',
  lesson_learned   TEXT NOT NULL DEFAULT '',
  tindak_lanjut    TEXT NOT NULL DEFAULT '',
  urutan           INT  NOT NULL DEFAULT 0,
  created_at       TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE gangguan_detail ENABLE ROW LEVEL SECURITY;

CREATE POLICY "auth_all_gangguan_detail"
  ON gangguan_detail FOR ALL TO authenticated USING (true) WITH CHECK (true);
