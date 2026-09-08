-- =============================================================================
-- Fase 1.1 + 1.3 — Master tiang JTR (berbentuk pohon) + panjang gawang turunan
-- Jalankan manual di Supabase SQL Editor. Idempoten (aman diulang).
--
-- Menjawab satu pertanyaan pokok: bagaimana menghitung panjang JTR per gardu
-- kalau jalurnya BERCABANG.
--
-- Jawabannya: setiap tiang menyimpan satu penunjuk ke tiang INDUKnya. Jaringan
-- JTR satu gardu jadi berbentuk pohon — berakar di gardu, bercabang sesuka
-- lapangan, sedalam apa pun.
--
--   Nomor urut (urutan 1,2,3,…) sengaja TIDAK dipakai. Nomor urut hanya sanggup
--   menggambarkan satu garis lurus; begitu ada cabang, "urutan 5" bisa berarti
--   dua tiang berbeda di dua cabang dan panjangnya tidak mungkin dihitung.
--
-- Sifat yang membuat perhitungannya rapi:
--
--   SETIAP TIANG MENYUMBANG TEPAT SATU GAWANG — yaitu gawang ke induknya.
--   Tiang pangkal menyumbang gawang ke gardu.
--
-- Akibatnya jumlah gawang = jumlah tiang. Tidak mungkin ada ruas yang
-- dobel-hitung, tidak mungkin ada yang terlewat, dan percabangan otomatis benar
-- tanpa aturan tambahan: tiang yang punya tiga anak muncul sebagai tiga gawang,
-- masing-masing MILIK ANAKNYA, bukan miliknya.
-- =============================================================================

-- ── 1. Master tiang — tambahan kolom, bukan tabel baru ───────────────────────
-- Tabel `tiang` sudah ada (dipakai layer tiang di Peta Aset) dan masih kosong.
-- Kolom lamanya dipertahankan apa adanya supaya `usePetaGardu` tidak patah;
-- yang di bawah ini murni tambahan.

ALTER TABLE public.tiang
  -- Menempel ke gardu. Tiang JTM tetap memakai `jalur_id` yang sudah ada, jadi
  -- satu tabel melayani dua cara menempel: JTR lewat gardu, JTM lewat jalur.
  -- Kunci gardu selalu (kode, ulp) — kode gardu TIDAK unik lintas ULP.
  ADD COLUMN IF NOT EXISTS gardu_kode   TEXT,

  -- Jurusan gardu: A/B/C/D/K, sejalan dengan `pengukuran_gardu.perjurusan`
  -- yang sudah merekam beban per jurusan. Kesejajaran ini yang nanti
  -- memungkinkan panjang jurusan dipasangkan dengan beban jurusan.
  -- Bukan CHECK: di lapangan ada juga "GARDU KHUSUS" dan "TRAFO CANTOL".
  ADD COLUMN IF NOT EXISTS jurusan      TEXT,

  -- INI KUNCINYA. NULL = tiang pangkal, disuplai langsung dari gardu.
  -- ON DELETE RESTRICT: tiang yang masih punya anak tidak boleh hilang begitu
  -- saja — pohonnya akan putus dan panjangnya langsung salah.
  ADD COLUMN IF NOT EXISTS induk_id     UUID REFERENCES public.tiang(id) ON DELETE RESTRICT,

  -- Siklus hidup. Inilah yang menyelesaikan keluhan "data lama menempel terus":
  -- tiang yang dibongkar TIDAK dihapus, hanya berhenti aktif. Sejarahnya utuh,
  -- tapi yang menempel di gardu dan ikut dihitung hanya yang aktif — sehingga
  -- rekap tahun lalu tetap benar kalau dilihat ulang.
  ADD COLUMN IF NOT EXISTS status_hidup TEXT NOT NULL DEFAULT 'aktif',
  ADD COLUMN IF NOT EXISTS aktif_sejak  DATE,
  ADD COLUMN IF NOT EXISTS aktif_sampai DATE,

  -- Tiang pengganti, saat sebuah tiang diganti tiang baru di titik yang sama.
  ADD COLUMN IF NOT EXISTS diganti_oleh_id UUID REFERENCES public.tiang(id) ON DELETE SET NULL,

  -- Asal-usul: dari mana baris ini datang, dan kapan terakhir benar-benar
  -- dilihat orang di lapangan. Dipakai ukuran keberhasilan program
  -- ("% master yang dikonfirmasi lapangan") dan nanti untuk menggiring
  -- prioritas penyapuan ke data yang paling basi.
  ADD COLUMN IF NOT EXISTS sumber            TEXT DEFAULT 'lapangan',
  ADD COLUMN IF NOT EXISTS dikonfirmasi_at   TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS dikonfirmasi_oleh TEXT;

COMMENT ON COLUMN public.tiang.induk_id IS
  'Tiang yang menyuplai tiang ini. NULL = pangkal, disuplai langsung dari gardu. Struktur pohon inilah yang membuat percabangan bisa dihitung.';
COMMENT ON COLUMN public.tiang.status_hidup IS
  'usulan | aktif | diganti | dibongkar. Tiang tidak pernah dihapus, hanya berhenti aktif — supaya rekap periode lalu tetap benar.';
COMMENT ON COLUMN public.tiang.jurusan IS
  'Jurusan gardu (A/B/C/D/K). Sejajar dengan pengukuran_gardu.perjurusan supaya panjang jurusan bisa dipasangkan dengan beban jurusan.';
COMMENT ON COLUMN public.tiang.sumber IS
  'lapangan | impor | manual. Baris hasil impor dianggap BELUM dikonfirmasi lapangan sampai ada inspektor yang benar-benar melihatnya.';

ALTER TABLE public.tiang
  DROP CONSTRAINT IF EXISTS tiang_status_hidup_valid;
ALTER TABLE public.tiang
  ADD CONSTRAINT tiang_status_hidup_valid
  CHECK (status_hidup IN ('usulan', 'aktif', 'diganti', 'dibongkar'));

-- ── 2. Indeks ────────────────────────────────────────────────────────────────
-- Tiang jauh lebih banyak daripada gardu (satu gardu belasan sampai puluhan
-- tiang), jadi indeksnya bukan kemewahan.

CREATE INDEX IF NOT EXISTS tiang_gardu_idx
  ON public.tiang (gardu_kode, ulp, jurusan) WHERE status_hidup = 'aktif';
CREATE INDEX IF NOT EXISTS tiang_induk_idx
  ON public.tiang (induk_id);

-- Nomor tiang unik di antara yang AKTIF saja — tiang lama yang sudah dibongkar
-- boleh memakai nomor yang sama dengan penggantinya.
CREATE UNIQUE INDEX IF NOT EXISTS tiang_kode_unik_aktif
  ON public.tiang (gardu_kode, ulp, jurusan, kode) WHERE status_hidup = 'aktif';

-- ── 3. Penjaga pohon ─────────────────────────────────────────────────────────
-- Dua kesalahan yang membuat panjang JTR langsung salah dan sulit dilacak,
-- jadi keduanya ditolak di database, bukan hanya di aplikasi.

-- 3a. Pohon tidak boleh menggigit ekornya sendiri. Tanpa ini, satu salah tunjuk
--     induk bisa membuat query rekursif berputar selamanya.
CREATE OR REPLACE FUNCTION public.tiang_cegah_lingkaran()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  kursor UUID := NEW.induk_id;
  langkah INT := 0;
BEGIN
  IF NEW.induk_id IS NULL THEN RETURN NEW; END IF;
  IF NEW.induk_id = NEW.id THEN
    RAISE EXCEPTION 'Tiang tidak boleh menjadi induk dirinya sendiri (%)', NEW.kode;
  END IF;

  WHILE kursor IS NOT NULL LOOP
    langkah := langkah + 1;
    IF langkah > 500 THEN
      RAISE EXCEPTION 'Rantai induk terlalu dalam — kemungkinan besar melingkar';
    END IF;
    SELECT induk_id INTO kursor FROM public.tiang WHERE id = kursor;
    IF kursor = NEW.id THEN
      RAISE EXCEPTION 'Induk melingkar: tiang % berujung kembali ke dirinya sendiri', NEW.kode;
    END IF;
  END LOOP;

  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_tiang_cegah_lingkaran ON public.tiang;
CREATE TRIGGER trg_tiang_cegah_lingkaran
  BEFORE INSERT OR UPDATE OF induk_id ON public.tiang
  FOR EACH ROW EXECUTE FUNCTION public.tiang_cegah_lingkaran();

-- 3b. Tiang tengah yang dibongkar wajib memindahkan anak-anaknya lebih dulu.
--     Kalau tidak, cabang di bawahnya menggantung: tiangnya masih aktif tapi
--     induknya sudah mati, dan gawangnya terhitung ke titik yang sudah tidak ada.
CREATE OR REPLACE FUNCTION public.tiang_cegah_anak_menggantung()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  jml INT;
BEGIN
  IF NEW.status_hidup = 'aktif' OR OLD.status_hidup <> 'aktif' THEN
    RETURN NEW;
  END IF;

  SELECT count(*) INTO jml
  FROM public.tiang
  WHERE induk_id = NEW.id AND status_hidup = 'aktif';

  IF jml > 0 THEN
    RAISE EXCEPTION
      'Tiang % masih menyuplai % tiang aktif. Pindahkan dulu anak-anaknya ke induk lain.',
      NEW.kode, jml;
  END IF;

  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_tiang_cegah_anak_menggantung ON public.tiang;
CREATE TRIGGER trg_tiang_cegah_anak_menggantung
  BEFORE UPDATE OF status_hidup ON public.tiang
  FOR EACH ROW EXECUTE FUNCTION public.tiang_cegah_anak_menggantung();

-- ── 4. Panjang gawang — TURUNAN, tidak pernah disimpan ───────────────────────
-- Aturan program: angka turunan jangan pernah diketik. Panjang yang diketik
-- selalu ketinggalan dari lapangan; panjang yang diturunkan otomatis benar
-- begitu titiknya benar.
--
-- Rumus haversine ditulis langsung, tanpa PostGIS atau earthdistance — supaya
-- skrip ini bisa dijalankan di proyek Supabase mana pun tanpa menyalakan
-- ekstensi apa pun lebih dulu.

CREATE OR REPLACE FUNCTION public.jarak_meter(
  lat1 DOUBLE PRECISION, lng1 DOUBLE PRECISION,
  lat2 DOUBLE PRECISION, lng2 DOUBLE PRECISION
) RETURNS DOUBLE PRECISION
LANGUAGE sql IMMUTABLE PARALLEL SAFE AS $$
  SELECT CASE
    WHEN lat1 IS NULL OR lng1 IS NULL OR lat2 IS NULL OR lng2 IS NULL THEN NULL
    ELSE 2 * 6371000 * asin(sqrt(
        power(sin(radians(lat2 - lat1) / 2), 2)
      + cos(radians(lat1)) * cos(radians(lat2))
      * power(sin(radians(lng2 - lng1) / 2), 2)
    ))
  END
$$;

COMMENT ON FUNCTION public.jarak_meter IS
  'Jarak haversine dalam meter. Sepadan dengan haversineMeters di app/admin/peta-gardu/_hooks/usePetaGardu.ts — dua sisi harus memberi angka yang sama.';

-- Satu baris per gawang. Induk NULL → diukur dari titik gardu, karena
-- penghantar dari trafo ke tiang pertama itu nyata dan tetap harus terhitung.
CREATE OR REPLACE VIEW public.tiang_gawang AS
SELECT
  t.id                AS tiang_id,
  t.kode,
  t.gardu_kode,
  t.ulp,
  t.jurusan,
  t.induk_id,
  (t.induk_id IS NULL) AS pangkal,
  public.jarak_meter(
    t.lat, t.lng,
    COALESCE(p.lat, g.lat),
    COALESCE(p.lng, g.lng)
  ) AS panjang_m
FROM public.tiang t
LEFT JOIN public.tiang p
  ON p.id = t.induk_id
 AND p.status_hidup = 'aktif'
LEFT JOIN public.gardu g
  ON upper(g.kode) = upper(t.gardu_kode)
 AND upper(g.ulp)  = upper(t.ulp)
WHERE t.status_hidup = 'aktif'
  AND t.gardu_kode IS NOT NULL;

COMMENT ON VIEW public.tiang_gawang IS
  'Satu baris per gawang (ruas tiang ke induknya). Jumlah gawang = jumlah tiang aktif, jadi percabangan tidak pernah dobel-hitung.';

-- ── 5. Rekap KMS — lihat `jtr-atribut-tiang.sql` ──
-- Definisinya DIPINDAH, tidak dihapus begitu saja.
--
-- View ini disempurnakan di `jtr-atribut-tiang.sql` — versi di sini sudah tertinggal.
-- Selama dua definisi hidup di dua berkas, menjalankan ulang berkas yang lebih
-- awal akan diam-diam menurunkan view ke bentuk lamanya, dan Postgres pun
-- menolak `CREATE OR REPLACE` begitu susunan kolomnya berubah.
-- Satu view, satu tempat.

-- ── 6. Pemeriksa kewajaran ───────────────────────────────────────────────────
-- Ambangnya diturunkan dari sebaran gawang yang nyata: median 37,5 m, p95 61 m.
-- Ini BUKAN penolak — hanya daftar yang pantas ditengok orang. Menolak data
-- lapangan karena tidak sesuai dugaan kita adalah cara paling cepat membuat
-- petugas berhenti melapor jujur.
CREATE OR REPLACE VIEW public.tiang_perlu_ditinjau AS
SELECT
  tiang_id, kode, gardu_kode, ulp, jurusan, panjang_m,
  CASE
    WHEN panjang_m IS NULL THEN 'titik belum ada'
    WHEN panjang_m > 100   THEN 'bentang tidak wajar — mungkin ada tiang terlewat'
    WHEN panjang_m < 5     THEN 'bentang terlalu pendek — mungkin tiang kembar'
  END AS alasan
FROM public.tiang_gawang
WHERE panjang_m IS NULL OR panjang_m > 100 OR panjang_m < 5;

-- ── 7. RLS ───────────────────────────────────────────────────────────────────
-- Kebijakan lama tabel `tiang` masih `USING (true)`. Dibiarkan apa adanya di
-- skrip ini supaya perubahannya satu topik saja; pengetatan per-unit dikerjakan
-- sekaligus untuk semua tabel di Fase 0.4 (`work-order-rls.sql` dan turunannya),
-- karena mengubahnya sepotong-sepotong justru menyulitkan pengujian.

GRANT SELECT ON public.tiang_gawang         TO authenticated;
GRANT SELECT ON public.tiang_perlu_ditinjau TO authenticated;

-- =============================================================================
-- Periksa hasilnya
-- =============================================================================
-- a. Rekap KMS per ULP:
--      SELECT * FROM ulp_jtr_panjang ORDER BY panjang_km DESC;
--
-- b. Gardu dengan JTR terpanjang:
--      SELECT * FROM gardu_jtr_panjang ORDER BY panjang_km DESC LIMIT 20;
--
-- c. Yang pantas ditengok:
--      SELECT alasan, count(*) FROM tiang_perlu_ditinjau GROUP BY alasan;
--
-- d. Uji pohon — telusuri satu gardu dari pangkal sampai ujung:
--      WITH RECURSIVE pohon AS (
--        SELECT id, kode, induk_id, 1 AS tingkat
--        FROM tiang WHERE gardu_kode = 'AM069' AND induk_id IS NULL AND status_hidup = 'aktif'
--        UNION ALL
--        SELECT t.id, t.kode, t.induk_id, p.tingkat + 1
--        FROM tiang t JOIN pohon p ON t.induk_id = p.id
--        WHERE t.status_hidup = 'aktif'
--      )
--      SELECT repeat('  ', tingkat - 1) || kode AS struktur, tingkat FROM pohon ORDER BY tingkat, kode;
-- =============================================================================
