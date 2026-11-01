-- =============================================================================
-- Prediksi Lokasi Gangguan (31 Okt 2026). Jalankan manual di Supabase SQL
-- Editor. Idempoten.
--
-- Lokasi temuan gangguan yang sebenarnya, diisi UP3/admin di web (tab
-- "Prediksi Lokasi Gangguan" di SMART Learning), termasuk gangguan lama.
-- Dipakai untuk:
--   • kalibrasi kekuatan sumber per trafo GI (xs_hitung, gangguan OC);
--   • rapor akurasi (peringkat tiang temuan di daftar calon / seksi).
-- Kolom penilaian diisi aplikasi (lib/prediksiGangguan/temuan.ts), bukan SQL.
--
-- Satu baris = satu gangguan. `kunci` = "S|<dedup_key ml_outage_events>" atau
-- "W|<id gangguan_realtime>"; laporan WA yang belakangan masuk sheet dicocokkan
-- lewat penyulang + tanggal + jam ±20 menit, lalu kuncinya ikut berganti.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.lokasi_gangguan_temuan (
  id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  kunci       TEXT NOT NULL,
  penyulang   TEXT NOT NULL,
  ulp         TEXT,
  tanggal     DATE NOT NULL,
  jam_padam   TIME,
  tiang_id    UUID REFERENCES public.tiang(id) ON DELETE SET NULL,
  tiang_kode  TEXT,
  catatan     TEXT,

  -- Penilaian (diisi aplikasi)
  trafo        TEXT,      -- "GI AMPENAN #3"
  jenis        TEXT,      -- OC2 | OC3 | EF | TAK_JELAS
  xs_hitung    NUMERIC,   -- Ω, hanya OC
  peringkat    INTEGER,   -- peringkat tiang temuan di daftar calon OC (NULL = tidak masuk)
  jumlah_calon INTEGER,
  seksi_ke     INTEGER,   -- urutan SARAN yang memuat tiang temuan: kelompok cabang (OC) / seksi (EF)
  jumlah_seksi INTEGER,   -- jumlah saran
  selisih_km   NUMERIC,
  masuk_zona   BOOLEAN,
  dinilai_at   TIMESTAMPTZ,

  diisi_oleh  TEXT,
  diisi_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  diubah_at   TIMESTAMPTZ
);

CREATE UNIQUE INDEX IF NOT EXISTS lokasi_gangguan_temuan_kunci ON public.lokasi_gangguan_temuan (kunci);
CREATE INDEX IF NOT EXISTS lokasi_gangguan_temuan_tanggal ON public.lokasi_gangguan_temuan (tanggal);
CREATE INDEX IF NOT EXISTS lokasi_gangguan_temuan_trafo ON public.lokasi_gangguan_temuan (trafo) WHERE xs_hitung IS NOT NULL;

COMMENT ON TABLE public.lokasi_gangguan_temuan IS
  'Lokasi temuan gangguan sebenarnya (diisi web UP3/admin) — kalibrasi sumber per trafo GI + rapor akurasi Prediksi Lokasi Gangguan.';

-- Ditulis lewat API server (service role) yang memeriksa peran UP3/admin.
ALTER TABLE public.lokasi_gangguan_temuan ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS lokasi_gangguan_temuan_baca ON public.lokasi_gangguan_temuan;
CREATE POLICY lokasi_gangguan_temuan_baca ON public.lokasi_gangguan_temuan
  FOR SELECT TO authenticated USING (true);


-- ── Temuan pertama: tiga gangguan yang diuji 31 Okt 2026 ─────────────────────
-- Penilaiannya (xs_hitung, peringkat, …) diisi tombol "Nilai ulang semua" di
-- tab Prediksi Lokasi Gangguan — tekan sekali setelah skrip ini dijalankan.
INSERT INTO public.lokasi_gangguan_temuan (kunci, penyulang, ulp, tanggal, jam_padam, tiang_id, tiang_kode, catatan, diisi_oleh)
SELECT v.kunci, v.penyulang, 'AMPENAN', v.tanggal::date, v.jam::time, kp.tiang_id, v.kode, v.catatan, 'uji 31 Okt 2026'
FROM (VALUES
  ('S|BUNG KARNO|2026-10-28|14:54:00', 'BUNG KARNO', '2026-10-28', '14:54:00', 'BKR-108L001R003', 'Rec. Karang Seme trip, OC S–T'),
  ('S|BUNG KARNO|2026-10-29|09:46:00', 'BUNG KARNO', '2026-10-29', '09:46:00', 'BKR-122R003',     'Rec. Crystal Regency trip, OC S–T'),
  ('S|MENINTING|2026-10-29|09:16:00',  'MENINTING',  '2026-10-29', '09:16:00', 'MEN-211R044',     'Antara MEN-211R044 dan MEN-211R044L001 — spandek rumah warga')
) AS v(kunci, penyulang, tanggal, jam, kode, catatan)
JOIN LATERAL (
  SELECT k.tiang_id FROM public.tiang_kode_penyulang k
  WHERE k.penyulang = v.penyulang AND k.kode = v.kode
  UNION ALL
  SELECT t.id FROM public.tiang t
  WHERE t.penyulang = v.penyulang AND t.kode = v.kode AND t.status_hidup = 'aktif'
  LIMIT 1
) kp ON true
ON CONFLICT (kunci) DO NOTHING;

-- Periksa:
--   SELECT kunci, tiang_kode, tiang_id IS NOT NULL AS tiang_ketemu FROM lokasi_gangguan_temuan;
