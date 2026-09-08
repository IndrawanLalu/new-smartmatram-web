-- =============================================================================
-- Fase 1.4 + 1.5 + 1.7 — Penyapuan JTR, hasil per tiang, dan temuan turunan
-- Jalankan SESUDAH `jtr-schema.sql`. Idempoten (aman diulang).
--
-- Isian per tiang sengaja mengikuti bentuk yang sudah dipakai unit sekarang
-- (tiang, konduktor, aksesoris, jamperan, andongan, tarikan SR, arde, stay,
-- rawan ROW). Yang diubah bukan APA yang dicatat, tapi BAGAIMANA disimpannya —
-- supaya bisa dijumlahkan.
--
-- Tiga perbaikan bentuk, semuanya demi pengolahan:
--
--   1. Nilai kondisi dibatasi daftar tetap, bukan teks bebas. Teks bebas tidak
--      bisa dihitung: "Tidak Ada", "tidak ada", "-" akan jadi tiga kelompok.
--   2. Jamperan 1-4 yang dulu delapan kolom → satu larik JSONB. Menghitung
--      "berapa jamperan rusak" jadi satu query, bukan empat cabang.
--   3. Rawan ROW → larik teks. Dulu "Pohon, Bangunan" satu sel; sekarang bisa
--      dihitung terpisah tanpa memotong-motong string.
--   4. Konduktor dinilai PER KABEL, bukan satu set kolom. Satu jurusan bisa
--      dipikul 2-3 kabel (underbuild), dan kabel ke-2 bisa putus sementara
--      kabel utama baik-baik saja. Satu kolom kondisi memaksa inspektor
--      memilih salah satu, dan temuan pada kabel lain hilang tanpa jejak.
--
-- Dan yang terpenting: TEMUAN TIDAK DIKETIK. Temuan diturunkan dari kondisi
-- yang sudah dicatat (lihat bagian 4). Kolom "kesimpulan" yang diisi manusia
-- selalu melenceng dari isi barisnya sendiri.
-- =============================================================================

-- ── 1. Penyapuan — satu baris per gardu per putaran ──────────────────────────
-- Satuan pekerjaannya SATU GARDU DISAPU TUNTAS, bukan "sekian titik diperiksa".
-- Itu yang membuat menambah tiang baru jadi bagian dari hasil, bukan kerja
-- ekstra sukarela yang tidak ada yang tahu kalau dilewatkan.

CREATE TABLE IF NOT EXISTS public.inspeksi_jtr (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  gardu_kode     TEXT NOT NULL,
  ulp            TEXT NOT NULL,
  penyulang      TEXT,              -- dari master penyulang, bukan ketikan

  tgl_mulai      DATE NOT NULL DEFAULT CURRENT_DATE,
  tgl_selesai    DATE,

  -- Dijadwalkan → Dalam Proses → Selesai → Diverifikasi
  -- "Selesai" hanya boleh dicapai lewat fungsi di bagian 3, yang memastikan
  -- tidak ada tiang aktif yang terlewat.
  status         TEXT NOT NULL DEFAULT 'Dijadwalkan',

  inspektor_uid  UUID,
  inspektor_nama TEXT,
  petugas_2      TEXT,
  catatan        TEXT,

  -- Verifikasi admin. Identitas diambil dari auth.uid() di sisi server saat
  -- Fase 0.4 terpasang — jangan pernah percaya nama yang dikirim klien.
  verified_at    TIMESTAMPTZ,
  verified_by    UUID,
  verified_note  TEXT,

  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.inspeksi_jtr DROP CONSTRAINT IF EXISTS inspeksi_jtr_status_valid;
ALTER TABLE public.inspeksi_jtr ADD CONSTRAINT inspeksi_jtr_status_valid
  CHECK (status IN ('Dijadwalkan', 'Dalam Proses', 'Selesai', 'Diverifikasi'));

CREATE INDEX IF NOT EXISTS inspeksi_jtr_gardu_idx ON public.inspeksi_jtr (gardu_kode, ulp);
CREATE INDEX IF NOT EXISTS inspeksi_jtr_tgl_idx   ON public.inspeksi_jtr (tgl_mulai DESC);

COMMENT ON TABLE public.inspeksi_jtr IS
  'Satu penyapuan JTR = satu gardu ditelusuri tuntas. Bukan kunjungan per titik.';

-- ── 2. Hasil per tiang ───────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.inspeksi_jtr_titik (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  inspeksi_id  UUID NOT NULL REFERENCES public.inspeksi_jtr(id) ON DELETE CASCADE,

  -- NULL hanya untuk tiang yang BARU ditemukan dan masih menunggu verifikasi
  -- sebelum masuk master.
  tiang_id     UUID REFERENCES public.tiang(id) ON DELETE SET NULL,

  -- Inilah yang membuat penyapuan bisa dinyatakan tuntas. Setiap tiang aktif
  -- milik gardu ini harus mendapat salah satu dari empat nilai berikut —
  -- tidak boleh ada yang didiamkan.
  --   cocok          : ada di lapangan, sesuai catatan
  --   berubah        : ada, tapi datanya berbeda → jadi usulan koreksi master
  --   tidak_ditemukan: tidak ada di lapangan → usulan dinonaktifkan
  --   baru           : tidak ada di catatan, ada di lapangan → usulan tiang baru
  hasil_periksa TEXT NOT NULL,

  -- ── Isian lapangan, mengikuti bentuk yang sudah dipakai ──
  tiang_jenis        TEXT,          -- Beton | Besi | Kayu
  tiang_ukuran_m     NUMERIC(4,1),  -- 7 | 9 | 13  → angka, bukan "13 meter"
  tiang_kondisi      TEXT,          -- Baik | Miring | Retak | Keropos | Rusak

  -- Konduktor TIDAK di sini — dinilai per kabel di `inspeksi_jtr_konduktor`.
  --
  -- Sisanya tetap per tiang, dan itu disengaja: jamperan sudah berbentuk larik
  -- sehingga banyaknya tidak dibatasi, sedangkan aksesoris, andongan, arde,
  -- stay, dan kondisi tiang memang dicatat sekali per tiang pada formulir yang
  -- dipakai regu sekarang. Kalau nanti ternyata regu menilainya per kabel juga,
  -- pemindahannya mengikuti pola tabel konduktor di bawah.

  aks_suspension     TEXT,          -- Baik | Rusak | Tidak Ada
  aks_large_angle    TEXT,
  aks_dead_end       TEXT,

  -- Dulu delapan kolom (Jamperan 1-4 × jenis/kondisi). Satu larik supaya
  -- jumlahnya tidak dibatasi empat dan bisa dihitung dengan satu query.
  -- Bentuk: [{"jenis":"JOINT","kondisi":"Baik"}, ...]
  jamperan           JSONB NOT NULL DEFAULT '[]'::jsonb,

  andongan           TEXT,          -- Baik | Rendah | Kendor
  tarikan_sr         INT,           -- jumlah SR, bukan panjang → tidak masuk KMS

  arde_kondisi       TEXT,          -- Ada | Tidak Ada | Putus
  arde_nilai_ohm     NUMERIC(6,2),

  stay_jenis         TEXT,
  stay_kondisi       TEXT,          -- Baik | Rusak | Tidak Ada TUI

  -- Dulu "Pohon, Bangunan" dalam satu sel. Larik supaya bisa dihitung terpisah.
  rawan_row          TEXT[] NOT NULL DEFAULT '{}',

  -- Titik saat diperiksa. Kalau berbeda jauh dari titik di master, itu sendiri
  -- jadi usulan koreksi koordinat.
  lat                DOUBLE PRECISION,
  lng                DOUBLE PRECISION,
  akurasi_m          NUMERIC(6,1),

  foto_url           TEXT[] NOT NULL DEFAULT '{}',
  catatan            TEXT,

  created_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.inspeksi_jtr_titik DROP CONSTRAINT IF EXISTS inspeksi_jtr_titik_hasil_valid;
ALTER TABLE public.inspeksi_jtr_titik ADD CONSTRAINT inspeksi_jtr_titik_hasil_valid
  CHECK (hasil_periksa IN ('cocok', 'berubah', 'tidak_ditemukan', 'baru'));

CREATE INDEX IF NOT EXISTS inspeksi_jtr_titik_inspeksi_idx ON public.inspeksi_jtr_titik (inspeksi_id);
CREATE INDEX IF NOT EXISTS inspeksi_jtr_titik_tiang_idx    ON public.inspeksi_jtr_titik (tiang_id);

-- Satu tiang hanya boleh dinilai sekali dalam satu penyapuan.
CREATE UNIQUE INDEX IF NOT EXISTS inspeksi_jtr_titik_unik
  ON public.inspeksi_jtr_titik (inspeksi_id, tiang_id) WHERE tiang_id IS NOT NULL;

-- Membersihkan bentuk lama, bila skrip versi sebelumnya sempat dijalankan.
ALTER TABLE public.inspeksi_jtr_titik
  DROP COLUMN IF EXISTS konduktor_jenis,
  DROP COLUMN IF EXISTS konduktor_diameter,
  DROP COLUMN IF EXISTS konduktor_kondisi;

-- ── 2b-5. Konduktor, kelengkapan, dan temuan — lihat `jtr-penyapuan.sql` ──
-- Definisinya DIPINDAH, tidak dihapus begitu saja.
--
-- View ini disempurnakan di `jtr-penyapuan.sql` — versi di sini sudah tertinggal.
-- Selama dua definisi hidup di dua berkas, menjalankan ulang berkas yang lebih
-- awal akan diam-diam menurunkan view ke bentuk lamanya, dan Postgres pun
-- menolak `CREATE OR REPLACE` begitu susunan kolomnya berubah.
-- Satu view, satu tempat.

-- Cakupan penyapuan: berapa gardu yang JTR-nya sudah ditelusuri, dan kapan.
CREATE OR REPLACE VIEW public.jtr_cakupan AS
SELECT
  g.ulp,
  count(*)                                                        AS gardu_master,
  count(*) FILTER (WHERE s.terakhir IS NOT NULL)                  AS pernah_disapu,
  count(*) FILTER (WHERE s.terakhir > CURRENT_DATE - 365)         AS disapu_12_bulan,
  round(100.0 * count(*) FILTER (WHERE s.terakhir > CURRENT_DATE - 365)
        / NULLIF(count(*), 0), 1)                                 AS persen_12_bulan
FROM public.gardu g
LEFT JOIN LATERAL (
  SELECT max(i.tgl_selesai) AS terakhir
  FROM public.inspeksi_jtr i
  WHERE upper(i.gardu_kode) = upper(g.kode)
    AND upper(i.ulp) = upper(g.ulp)
    AND i.status IN ('Selesai', 'Diverifikasi')
) s ON true
GROUP BY g.ulp;

COMMENT ON VIEW public.jtr_cakupan IS
  'Ukuran keberhasilan program untuk JTR: berapa persen gardu yang jaringannya benar-benar dilihat orang dalam 12 bulan terakhir.';

-- ── 6. RLS ───────────────────────────────────────────────────────────────────
ALTER TABLE public.inspeksi_jtr           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inspeksi_jtr_titik     ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS auth_all_inspeksi_jtr           ON public.inspeksi_jtr;
DROP POLICY IF EXISTS auth_all_inspeksi_jtr_titik     ON public.inspeksi_jtr_titik;

-- Sementara mengikuti pola tabel lain; pengetatan per-unit dikerjakan sekaligus
-- untuk semua tabel di Fase 0.4 supaya bisa diuji dalam satu tarikan.
CREATE POLICY auth_all_inspeksi_jtr           ON public.inspeksi_jtr
  FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY auth_all_inspeksi_jtr_titik     ON public.inspeksi_jtr_titik
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

GRANT SELECT ON public.jtr_cakupan              TO authenticated;

-- =============================================================================
-- Periksa hasilnya
-- =============================================================================
-- a. Rekap temuan terbanyak:
--      SELECT temuan, urgensi, sum(jumlah) FROM jtr_rekap_temuan
--      GROUP BY temuan, urgensi ORDER BY 3 DESC;
--
-- b. Gardu dengan temuan terbanyak:
--      SELECT gardu_kode, ulp, sum(jumlah) FROM jtr_rekap_temuan
--      GROUP BY gardu_kode, ulp ORDER BY 3 DESC LIMIT 20;
--
-- c. Cakupan penyapuan per ULP:
--      SELECT * FROM jtr_cakupan ORDER BY persen_12_bulan;
--
-- d. Penyapuan yang belum tuntas — tiang terlewat ATAU kabel belum dinilai:
--      SELECT * FROM inspeksi_jtr_kelengkapan
--      WHERE sudah_diperiksa < tiang_aktif
--         OR kabel_sudah_dinilai < kabel_harus_dinilai;
--
-- e. Temuan konduktor per kabel — kolom tiang menampilkan label lengkapnya,
--    jadi AM001-A1 dan AM001-A1.2 muncul sebagai baris yang berbeda:
--      SELECT tiang_kode, temuan, tgl_mulai FROM inspeksi_jtr_temuan
--      WHERE temuan LIKE 'Konduktor%' ORDER BY tgl_mulai DESC;
-- =============================================================================
