-- =============================================================================
-- WO Pengukuran Gardu — SMART Mataram
-- Jalankan manual di Supabase SQL Editor.
--
-- Menjawab satu pertanyaan operasional: gardu mana yang HARUS diukur bulan ini,
-- dan sudah terealisasi berapa. Sumber kandidatnya master gardu (lewat view
-- `gardu_master_state`), bukan tabel pengukuran — gardu yang belum pernah
-- diukur sama sekali tidak punya baris pengukuran, jadi mustahil ditemukan
-- dari sisi sana.
--
-- Bedanya dengan `pengukuran_gardu.wo_sent_at`: kolom itu milik WO ANOMALI
-- per-gardu (PDF + kirim WA dari modal detail), diterbitkan reaktif setelah
-- ketahuan ada masalah. WO di sini terjadwal, terbit tiap tanggal 1, dan
-- tidak menyentuh kolom itu sama sekali. Dua hal berbeda yang sengaja tidak
-- berbagi penanda.
--
-- Bedanya dengan `wo_batch`/`wo_item`: di sana kolomnya bebas (paste Excel) dan
-- penyelesaian ditandai manual oleh petugas. Di sini barisnya selalu satu gardu
-- dan realisasinya DITURUNKAN dari pengukuran yang masuk — tidak ada tombol
-- "tandai selesai" yang bisa lupa ditekan, dan tidak ada jalur tulis kedua yang
-- bisa melenceng dari kenyataan.
-- =============================================================================

-- ── Pengaturan per ULP ───────────────────────────────────────────────────────
-- Pola sama dengan `anomali_settings`: satu baris per ULP, plus 'ALL' sebagai
-- nilai jatuh-tempat untuk UP3 yang sedang tidak menyaring ULP.
CREATE TABLE IF NOT EXISTS public.wo_pengukuran_settings (
  ulp                    TEXT PRIMARY KEY,
  -- Batas "gardu berbeban tinggi". Di atas ini, potret lama lebih cepat basi:
  -- pada beban segitu kenaikan kecil saja sudah menembus ambang.
  ambang_beban_pct       NUMERIC(5,1) NOT NULL DEFAULT 80,
  -- Umur pengukuran sebelum gardu wajib diukur ulang, dipisah per tingkat beban.
  -- Isi kedua kolom dengan angka yang SAMA kalau ingin satu ambang untuk semua.
  bulan_beban_tinggi     INT     NOT NULL DEFAULT 3 CHECK (bulan_beban_tinggi  BETWEEN 1 AND 60),
  bulan_beban_rendah     INT     NOT NULL DEFAULT 5 CHECK (bulan_beban_rendah  BETWEEN 1 AND 60),
  -- Berapa gardu yang diterbitkan per bulan per ULP.
  kuota_per_bulan        INT     NOT NULL DEFAULT 50 CHECK (kuota_per_bulan BETWEEN 1 AND 2000),
  sertakan_belum_pernah  BOOLEAN NOT NULL DEFAULT TRUE,
  hanya_gardu_aktif      BOOLEAN NOT NULL DEFAULT TRUE,
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE public.wo_pengukuran_settings IS
  'Kriteria penyusunan WO Pengukuran per ULP. Baris ''ALL'' dipakai UP3 tanpa filter ULP.';

-- ── Header WO: satu per ULP per bulan ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.wo_pengukuran (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ulp        TEXT NOT NULL,
  bulan      INT  NOT NULL CHECK (bulan BETWEEN 1 AND 12),
  tahun      INT  NOT NULL CHECK (tahun BETWEEN 2020 AND 2100),
  -- Selalu tanggal 1 bulan yang bersangkutan. Dijaga di database, bukan hanya di
  -- aplikasi: seluruh perhitungan realisasi memakai `tgl_wo` sebagai batas bawah
  -- jendela, jadi satu baris dengan tanggal meleset akan menghasilkan capaian
  -- yang salah tanpa gejala apa pun.
  tgl_wo     DATE NOT NULL,
  CONSTRAINT wo_pengukuran_tgl_awal_bulan CHECK (tgl_wo = make_date(tahun, bulan, 1)),
  -- Kuota yang berlaku saat diterbitkan. Disimpan karena pengaturan bisa berubah
  -- kapan saja, sementara WO yang sudah terbit harus tetap bisa dibaca apa adanya.
  kuota      INT  NOT NULL,
  -- Salinan seluruh kriteria saat penerbitan — supaya enam bulan lagi masih bisa
  -- dijawab "kenapa gardu ini masuk WO Mei?".
  kriteria   JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Inilah yang menolak WO ganda. Menerbitkan ulang harus lewat hapus yang
-- disengaja, bukan diam-diam menimpa daftar yang sudah dipegang petugas.
CREATE UNIQUE INDEX IF NOT EXISTS wo_pengukuran_periode_unik
  ON public.wo_pengukuran (ulp, tahun, bulan);

-- ── Baris WO: satu gardu ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.wo_pengukuran_item (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  wo_id      UUID NOT NULL REFERENCES public.wo_pengukuran(id) ON DELETE CASCADE,
  kode_gardu TEXT NOT NULL,
  -- Ikut disimpan meski sudah ada di header: dipakai menyambung ke pengukuran,
  -- dan kode gardu TIDAK unik lintas ULP (GR160, KE022, KE105, KE108, LA132,
  -- GS239 masing-masing muncul di dua ULP).
  ulp        TEXT NOT NULL,

  -- ── Potret identitas saat WO terbit ──
  -- Sengaja disalin, bukan di-join ke master saat ditampilkan. WO adalah dokumen
  -- bertanggal: kalau nama atau penyulang gardu diperbaiki di master pertengahan
  -- bulan, lembar yang sudah dipegang petugas tidak boleh ikut berubah.
  nama       TEXT,
  alamat     TEXT,
  penyulang  TEXT,
  kva_master NUMERIC(10,2),

  -- ── Kenapa gardu ini masuk ──
  alasan            TEXT NOT NULL CHECK (alasan IN ('belum_pernah', 'kedaluwarsa')),
  tgl_ukur_terakhir DATE,          -- NULL untuk yang belum pernah diukur
  umur_bulan        INT,           -- NULL untuk yang belum pernah diukur
  urutan            INT NOT NULL DEFAULT 0,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS wo_pengukuran_item_unik
  ON public.wo_pengukuran_item (wo_id, kode_gardu, ulp);
CREATE INDEX IF NOT EXISTS wo_pengukuran_item_wo_idx
  ON public.wo_pengukuran_item (wo_id);
-- Dipakai mobile: "gardu apa saja yang harus saya ukur bulan ini".
CREATE INDEX IF NOT EXISTS wo_pengukuran_item_gardu_idx
  ON public.wo_pengukuran_item (ulp, kode_gardu);

-- ── Indeks penunjang pencarian realisasi ─────────────────────────────────────
-- View di bawah menjalankan satu subquery LATERAL PER BARIS WO — bisa 2.000 kali
-- untuk empat ULP berkuota penuh. Tanpa indeks ini tiap panggilan memindai
-- seluruh `pengukuran_gardu`, dan tabel itu tumbuh terus seumur aplikasi.
--
-- Bentuknya mengikuti persis apa yang dicari view: dua kesetaraan `upper()`
-- lebih dulu, lalu `tanggal_pengukuran` sebagai kolom rentang sekaligus urutan.
-- Karena itulah perbandingan tanggalnya dibiarkan teks-lawan-teks di sana —
-- meng-cast kolomnya jadi `::date` akan membuat indeks ini tidak terpakai.
CREATE INDEX IF NOT EXISTS pengukuran_gardu_wo_lookup_idx
  ON public.pengukuran_gardu (upper(no_gardu), upper(petugas_unit), tanggal_pengukuran)
  WHERE hasil_penyeimbangan_id IS NULL;

-- ── View realisasi ───────────────────────────────────────────────────────────
-- Realisasi TIDAK PERNAH ditulis ke tabel. Begitu petugas menyimpan pengukuran,
-- baris WO-nya terisi sendiri lewat view ini. Tidak ada penanda kedua yang bisa
-- basi, dan mobile tidak perlu menulis apa pun ke tabel WO.
--
-- Tiga hal yang dikunci di sini:
--   1. Jendela = bulan WO saja (>= tgl_wo, < tgl_wo + 1 bulan). Gardu yang telat
--      diukur otomatis jadi kandidat WO bulan berikutnya, jadi tidak hilang.
--   2. `hasil_penyeimbangan_id IS NULL` — baris pembawa data ke AMG bukan
--      pengukuran rutin; tanpa filter ini pemerataan beban akan salah terhitung
--      sebagai realisasi.
--   3. Sambungan pakai kode DAN ulp, sebab kode gardu tidak unik lintas ULP.
CREATE OR REPLACE VIEW public.wo_pengukuran_realisasi AS
SELECT
  i.id,
  i.wo_id,
  i.kode_gardu,
  i.ulp,
  i.nama,
  i.alamat,
  i.penyulang,
  i.kva_master,
  i.alasan,
  i.tgl_ukur_terakhir,
  i.umur_bulan,
  i.urutan,

  w.bulan,
  w.tahun,
  w.tgl_wo,

  p.id                  AS pengukuran_id,
  p.tanggal_pengukuran  AS tgl_realisasi,
  p.petugas_nama,
  p.persen_beban,
  p.beban_kva,
  p.kva_trafo           AS kva_pengukuran,
  (p.id IS NOT NULL)    AS terealisasi
FROM public.wo_pengukuran_item i
JOIN public.wo_pengukuran w ON w.id = i.wo_id
LEFT JOIN LATERAL (
  SELECT pg.id, pg.tanggal_pengukuran, pg.petugas_nama,
         pg.persen_beban, pg.beban_kva, pg.kva_trafo
  FROM public.pengukuran_gardu pg
  WHERE upper(pg.no_gardu)     = upper(i.kode_gardu)
    AND upper(pg.petugas_unit) = upper(i.ulp)
    -- `pengukuran_gardu.tanggal_pengukuran` bertipe TEXT, bukan DATE. Yang
    -- diubah adalah BATASNYA jadi teks, bukan kolomnya jadi tanggal — meski
    -- `::date` juga sah di sini (`gardu_latest_state` sudah memakainya).
    -- Sebabnya indeks: `pengukuran_gardu_wo_lookup_idx` di atas dibangun pada
    -- kolom apa adanya, dan begitu kolomnya dibungkus cast, indeks itu tidak
    -- terpakai — padahal subquery ini berjalan sekali PER BARIS WO.
    --
    -- Perbandingan teks tetap benar karena formatnya ISO (YYYY-MM-DD): urutan
    -- leksikografisnya sama dengan urutan tanggal, dan tetap benar meski ada
    -- baris yang membawa jam di belakangnya. Ini juga persis cara aplikasi
    -- menyaring kolom yang sama (`.gte("tanggal_pengukuran", "2026-09-01")`).
    AND pg.tanggal_pengukuran >= to_char(w.tgl_wo, 'YYYY-MM-DD')
    AND pg.tanggal_pengukuran <  to_char(w.tgl_wo + INTERVAL '1 month', 'YYYY-MM-DD')
    AND pg.hasil_penyeimbangan_id IS NULL
  ORDER BY pg.tanggal_pengukuran
  LIMIT 1
) p ON TRUE;

COMMENT ON VIEW public.wo_pengukuran_realisasi IS
  'Baris WO Pengukuran + realisasinya. Realisasi diturunkan dari pengukuran_gardu dalam jendela bulan WO, tidak disimpan.';

-- ── RLS ──────────────────────────────────────────────────────────────────────
-- Mengikuti pola proyek: auth-all di database, penyaringan ULP/role di aplikasi.
ALTER TABLE public.wo_pengukuran_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wo_pengukuran          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wo_pengukuran_item     ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "auth_all_wo_pengukuran_settings" ON public.wo_pengukuran_settings;
DROP POLICY IF EXISTS "auth_all_wo_pengukuran"          ON public.wo_pengukuran;
DROP POLICY IF EXISTS "auth_all_wo_pengukuran_item"     ON public.wo_pengukuran_item;

CREATE POLICY "auth_all_wo_pengukuran_settings"
  ON public.wo_pengukuran_settings FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "auth_all_wo_pengukuran"
  ON public.wo_pengukuran FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "auth_all_wo_pengukuran_item"
  ON public.wo_pengukuran_item FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ── Seed pengaturan ──────────────────────────────────────────────────────────
-- HANYA 'ALL'. Baris per-ULP sengaja TIDAK disemai.
--
-- Aplikasi mencari kriteria dengan urutan: baris ULP-nya → baris 'ALL' → bawaan
-- kode. Menyemai keempat ULP membuat langkah kedua tidak pernah tercapai: baris
-- 'ALL' yang disunting UP3 (saat tidak menyaring ULP) kalah oleh baris bawaan
-- yang cuma hasil semaian, dan pengaturannya tampak tersimpan tapi tidak
-- berpengaruh apa-apa.
--
-- Sebuah ULP baru punya barisnya sendiri kalau ada yang MENYIMPAN pengaturan
-- khusus untuk ULP itu — dan waktu itu barulah pantas ia mengalahkan 'ALL'.
INSERT INTO public.wo_pengukuran_settings (ulp)
VALUES ('ALL')
ON CONFLICT (ulp) DO NOTHING;

-- Bersihkan semaian dari versi skrip sebelumnya. Hanya baris yang MASIH persis
-- nilai bawaan yang dihapus — pengaturan yang sudah pernah disunting untuk ULP
-- tertentu dibiarkan utuh.
DELETE FROM public.wo_pengukuran_settings
WHERE ulp <> 'ALL'
  AND ambang_beban_pct   = 80
  AND bulan_beban_tinggi = 3
  AND bulan_beban_rendah = 5
  AND kuota_per_bulan    = 50
  AND sertakan_belum_pernah
  AND hanya_gardu_aktif;

-- ── Periksa hasilnya ─────────────────────────────────────────────────────────
--   SELECT ulp, tahun, bulan, tgl_wo, kuota FROM wo_pengukuran ORDER BY tgl_wo DESC;
--
--   SELECT ulp, tahun, bulan,
--          count(*)                              AS total,
--          count(*) FILTER (WHERE terealisasi)   AS realisasi
--   FROM wo_pengukuran_realisasi
--   GROUP BY 1,2,3 ORDER BY 2 DESC, 3 DESC, 1;
