-- =============================================================================
-- WO Pemeliharaan Gardu — langkah 7 `rencana-hargardu.md` (dibangun 24 Sep 2026)
-- Jalankan manual di Supabase SQL Editor, SESUDAH `hargardu-schema.sql`.
-- Idempoten.
--
-- Pola SAMA dengan WO Pengukuran (`wo-pengukuran-schema.sql`), sengaja:
--   • pengaturan per ULP — di sini frekuensi pemeliharaan per tahun + kuota
--   • satu WO per ULP per bulan, WO ganda DITOLAK indeks unik
--   • baris WO = potret gardu saat terbit
--   • realisasi TIDAK PERNAH DITULIS — view menyambung baris WO ke
--     `pemeliharaan_gardu` di jendela bulan WO. HP tidak menulis apa pun ke
--     tabel WO; cukup mengerjakan pemeliharaan seperti biasa.
--
-- Keputusan user (24 Sep 2026):
--   • Realisasi dihitung SAAT DIKIRIM (Selesai), yang belum disetujui tampil
--     terpisah. Ditolak = kembali jadi pekerjaan = otomatis tidak terhitung.
--   • Kandidat diurutkan menurut UMUR saja (belum pernah → paling lama).
-- =============================================================================


-- ── 1. Pengaturan per ULP ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.wo_hargardu_settings (
  ulp                  TEXT PRIMARY KEY,
  -- Berapa kali tiap gardu dipelihara dalam setahun. Jatuh tempo = 12 / angka
  -- ini bulan sejak pemeliharaan terakhir.
  frekuensi_per_tahun  INT     NOT NULL DEFAULT 1  CHECK (frekuensi_per_tahun BETWEEN 1 AND 12),
  kuota_per_bulan      INT     NOT NULL DEFAULT 30 CHECK (kuota_per_bulan BETWEEN 1 AND 2000),
  hanya_gardu_aktif    BOOLEAN NOT NULL DEFAULT TRUE,
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE public.wo_hargardu_settings IS
  'Kriteria penyusunan WO Pemeliharaan Gardu per ULP.';


-- ── 2. Header WO: satu per ULP per bulan ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.wo_hargardu (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ulp        TEXT NOT NULL,
  bulan      INT  NOT NULL CHECK (bulan BETWEEN 1 AND 12),
  tahun      INT  NOT NULL CHECK (tahun BETWEEN 2020 AND 2100),
  -- Selalu tanggal 1: seluruh perhitungan realisasi memakai tanggal ini sebagai
  -- batas bawah jendela, jadi dijaga di database, bukan hanya di aplikasi.
  tgl_wo     DATE NOT NULL,
  CONSTRAINT wo_hargardu_tgl_awal_bulan CHECK (tgl_wo = make_date(tahun, bulan, 1)),
  -- Kuota & kriteria saat terbit — pengaturan bisa berubah, WO yang sudah
  -- terbit harus tetap bisa dibaca apa adanya.
  kuota      INT  NOT NULL,
  kriteria   JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS wo_hargardu_periode_unik
  ON public.wo_hargardu (ulp, tahun, bulan);


-- ── 3. Baris WO: satu gardu ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.wo_hargardu_item (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  wo_id       UUID NOT NULL REFERENCES public.wo_hargardu(id) ON DELETE CASCADE,
  -- Kunci gardu SELALU (kode, ulp): kode tidak unik lintas ULP.
  gardu_kode  TEXT NOT NULL,
  ulp         TEXT NOT NULL,

  -- Potret identitas saat terbit (dokumen bertanggal, tidak ikut berubah).
  nama        TEXT,
  alamat      TEXT,
  penyulang   TEXT,
  lat         DOUBLE PRECISION,
  lng         DOUBLE PRECISION,

  -- Kenapa gardu ini masuk.
  alasan                 TEXT NOT NULL CHECK (alasan IN ('belum_pernah', 'jatuh_tempo')),
  tgl_pelihara_terakhir  DATE,   -- NULL untuk yang belum pernah dipelihara
  umur_bulan             INT,    -- NULL untuk yang belum pernah dipelihara
  urutan                 INT NOT NULL DEFAULT 0,

  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS wo_hargardu_item_unik
  ON public.wo_hargardu_item (wo_id, gardu_kode, ulp);
CREATE INDEX IF NOT EXISTS wo_hargardu_item_wo_idx
  ON public.wo_hargardu_item (wo_id);
-- Dipakai HP: "gardu apa saja yang harus saya pelihara bulan ini".
CREATE INDEX IF NOT EXISTS wo_hargardu_item_gardu_idx
  ON public.wo_hargardu_item (ulp, gardu_kode);

-- Penunjang LATERAL di view: dijalankan sekali PER BARIS WO.
CREATE INDEX IF NOT EXISTS pemeliharaan_gardu_wo_lookup_idx
  ON public.pemeliharaan_gardu (gardu_kode, ulp, created_at);


-- ── 4. View realisasi ────────────────────────────────────────────────────────
-- Satu pemeliharaan per baris WO, dipilih dari yang ada di jendela bulan WO
-- (batas hari mengikuti WITA). Urutan pilihannya: Diverifikasi → Selesai →
-- Dalam Proses — yang paling maju yang mewakili.
--
--   terealisasi  status Selesai/Diverifikasi (dihitung SAAT DIKIRIM)
--   disetujui    status Diverifikasi
--   Dalam Proses tampil sebagai "sedang dikerjakan", BELUM realisasi
--   Ditolak      diabaikan — kembali jadi pekerjaan regu
--
-- Tanggal yang diuji: tgl_selesai untuk yang sudah dikirim, created_at untuk
-- yang masih dikerjakan. Gardu yang telat dikerjakan otomatis jadi kandidat
-- WO bulan berikutnya — tidak hilang.
DROP VIEW IF EXISTS public.wo_hargardu_realisasi;

CREATE VIEW public.wo_hargardu_realisasi AS
SELECT
  i.id,
  i.wo_id,
  i.gardu_kode,
  i.ulp,
  i.nama,
  i.alamat,
  i.penyulang,
  i.lat,
  i.lng,
  i.alasan,
  i.tgl_pelihara_terakhir,
  i.umur_bulan,
  i.urutan,

  w.bulan,
  w.tahun,
  w.tgl_wo,

  p.id                     AS pemeliharaan_id,
  p.status                 AS status_pemeliharaan,
  p.tgl_selesai            AS tgl_realisasi,
  p.petugas_nama,
  (p.status IN ('Selesai', 'Diverifikasi')) IS TRUE AS terealisasi,
  (p.status = 'Diverifikasi') IS TRUE               AS disetujui
FROM public.wo_hargardu_item i
JOIN public.wo_hargardu w ON w.id = i.wo_id
LEFT JOIN LATERAL (
  SELECT pg.id, pg.status, pg.tgl_selesai, pg.petugas_nama
  FROM public.pemeliharaan_gardu pg
  WHERE pg.gardu_kode = i.gardu_kode
    AND pg.ulp = i.ulp
    AND pg.status IN ('Dalam Proses', 'Selesai', 'Diverifikasi')
    AND COALESCE(pg.tgl_selesai, pg.created_at) >= (w.tgl_wo::timestamp AT TIME ZONE 'Asia/Makassar')
    AND COALESCE(pg.tgl_selesai, pg.created_at) <  ((w.tgl_wo + INTERVAL '1 month')::timestamp AT TIME ZONE 'Asia/Makassar')
  ORDER BY
    CASE pg.status WHEN 'Diverifikasi' THEN 0 WHEN 'Selesai' THEN 1 ELSE 2 END,
    COALESCE(pg.tgl_selesai, pg.created_at)
  LIMIT 1
) p ON TRUE;

COMMENT ON VIEW public.wo_hargardu_realisasi IS
  'Baris WO Pemeliharaan Gardu + realisasinya, diturunkan dari pemeliharaan_gardu di jendela bulan WO (WITA). Tidak disimpan.';


-- ── 5. RLS — pola proyek: auth-all, penyaringan ULP di aplikasi ──────────────
ALTER TABLE public.wo_hargardu_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wo_hargardu          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wo_hargardu_item     ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "auth_all_wo_hargardu_settings" ON public.wo_hargardu_settings;
DROP POLICY IF EXISTS "auth_all_wo_hargardu"          ON public.wo_hargardu;
DROP POLICY IF EXISTS "auth_all_wo_hargardu_item"     ON public.wo_hargardu_item;

CREATE POLICY "auth_all_wo_hargardu_settings"
  ON public.wo_hargardu_settings FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "auth_all_wo_hargardu"
  ON public.wo_hargardu FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "auth_all_wo_hargardu_item"
  ON public.wo_hargardu_item FOR ALL TO authenticated USING (true) WITH CHECK (true);

GRANT SELECT ON public.wo_hargardu_realisasi TO authenticated;


-- ── Periksa ──────────────────────────────────────────────────────────────────
--   SELECT ulp, tahun, bulan, count(*) FILTER (WHERE terealisasi) AS jadi, count(*)
--   FROM wo_hargardu_realisasi GROUP BY 1, 2, 3;
