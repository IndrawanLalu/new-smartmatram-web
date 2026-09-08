-- =============================================================================
-- Fase 1.1d — Atribut lapangan menempel pada TIANG, bukan pada jurusan
-- Jalankan SESUDAH `jtr-koreksi.sql`. Idempoten.
--
-- Koreksi rancangan: saya sempat menaruh ukuran kabel di tingkat jurusan dengan
-- alasan "satu kabel membentang sepanjang jurusan". Itu keliru. Di formulir yang
-- dipakai regu, tiap BARIS adalah satu tiang, dan tiap tiang punya konduktor,
-- aksesoris, jamperan, arde, dan stay-nya sendiri. Ukuran kabel pun mengecil di
-- tengah jalur — 70 di pangkal, 50 di ujung — dan itu justru salah satu hal yang
-- ingin diketahui.
--
-- Jadi semuanya turun ke tiang. Yang tetap di tingkat jurusan hanya identitas
-- sirkit untuk underbuild (`jtr_sirkit`): siapa PEMILIK kabel ke-2, karena itu
-- yang menentukan panjangnya dihitung ke gardu yang mana.
-- =============================================================================

-- ── 1. Atribut yang cuma punya satu nilai per tiang ──────────────────────────
-- Kolom sungguhan, bukan JSONB, untuk apa pun yang akan dijumlahkan: "berapa
-- tiang tanpa arde" harus bisa dijawab satu query, bukan dengan membongkar teks.

ALTER TABLE public.tiang
  ADD COLUMN IF NOT EXISTS aks_suspension  TEXT,   -- Baik | Rusak | Tidak Ada
  ADD COLUMN IF NOT EXISTS aks_large_angle TEXT,
  ADD COLUMN IF NOT EXISTS aks_dead_end    TEXT,
  ADD COLUMN IF NOT EXISTS andongan        TEXT,   -- Baik | Rendah | Kendor
  ADD COLUMN IF NOT EXISTS tarikan_sr      INT,    -- jumlah SR; bukan panjang, tak masuk KMS
  ADD COLUMN IF NOT EXISTS arde_kondisi    TEXT,   -- Ada | Tidak Ada | Putus
  ADD COLUMN IF NOT EXISTS arde_nilai_ohm  NUMERIC(6,2),
  ADD COLUMN IF NOT EXISTS stay_jenis      TEXT,
  ADD COLUMN IF NOT EXISTS stay_kondisi    TEXT,   -- Baik | Rusak | Tidak Ada TUI
  -- Larik, bukan satu sel "Pohon, Bangunan": supaya pohon dan bangunan bisa
  -- dihitung terpisah tanpa memotong-motong teks.
  ADD COLUMN IF NOT EXISTS rawan_row       TEXT[] NOT NULL DEFAULT '{}',
  -- Jumlahnya tidak dibatasi empat seperti formulir lama.
  -- Bentuk: [{"jenis":"JOINT","kondisi":"Baik"}, ...]
  ADD COLUMN IF NOT EXISTS jamperan        JSONB NOT NULL DEFAULT '[]'::jsonb,
  -- Sebagian JTR digantung di tiang TM, bukan tiang JTR sendiri. Bukan cacat,
  -- hanya keterangan konstruksi — tapi menentukan siapa yang berwenang
  -- mengerjakan tiangnya kalau nanti perlu ditangani.
  ADD COLUMN IF NOT EXISTS underbuild_tm   BOOLEAN NOT NULL DEFAULT false,
  -- Catatan bebas dari inspektor tentang apa yang perlu diperbaiki di tiang ini.
  -- Tetap ada meski kondisinya sudah terekam di kolom sendiri: daftar pilihan
  -- tidak pernah cukup untuk hal yang belum terpikir saat merancangnya.
  ADD COLUMN IF NOT EXISTS catatan_perbaikan TEXT;

COMMENT ON COLUMN public.tiang.tarikan_sr IS
  'Jumlah sambungan rumah di tiang ini. Cacah, bukan panjang — tidak ikut menghitung KMS jaringan.';
COMMENT ON COLUMN public.tiang.rawan_row IS
  'Penghalang di jalur: Pohon, Bangunan, dst. Larik supaya tiap jenis bisa dihitung sendiri.';

-- ── 2. Konduktor per tiang, satu baris per kabel ─────────────────────────────
-- Tiang ber-underbuild memikul 2-3 kabel, dan tiap kabel bisa berbeda ukuran
-- maupun kondisinya di tiang yang sama. Karena itu tabel anak, bukan kolom.
--
-- Menggantikan `tiang_sirkit` yang dulu hanya menyambungkan tiang ke kabel
-- tanpa menyimpan apa pun tentang kabelnya di titik itu.

CREATE TABLE IF NOT EXISTS public.tiang_konduktor (
  id       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tiang_id UUID NOT NULL REFERENCES public.tiang(id) ON DELETE CASCADE,

  -- 1 = kabel utama, 2/3 = underbuild. Inilah angka di belakang titik pada
  -- label tiang: AM001-A1.2 berarti kabel ke-2 di tiang AM001-A1.
  nomor    INT NOT NULL DEFAULT 1,

  jenis    TEXT,   -- LVTC | Twisted | Telanjang
  ukuran   TEXT,   -- "3x70+50 mm"
  kondisi  TEXT,   -- Baik | Lepas | Pecah-pecah | Putus | Terkelupas

  -- Tiang asal kabel INI, bila berbeda dari induk tiangnya. Kosong = ikut
  -- induk tiang, dan itu keadaan biasa.
  --
  -- Ada karena tiang hanya punya SATU induk, sedangkan satu tiang bisa
  -- dipasok dua kabel dari dua arah: dua sirkit berangkat dari gardu yang
  -- sama menuju arah yang sama, masing-masing lewat tiang pertamanya
  -- sendiri, lalu berbagi tiang mulai tiang kedua. Tanpa penunjuk ini
  -- bentang pertama kabel kedua tidak punya tempat untuk dicatat, dan
  -- panjangnya hilang tanpa ada yang tahu.
  induk_tiang_id UUID REFERENCES public.tiang(id) ON DELETE SET NULL,

  -- Diisi hanya bila kabel ini milik gardu LAIN yang menumpang tiang ini.
  -- Kosong berarti milik gardu tiang itu sendiri. Inilah yang mencegah dua
  -- gardu sama-sama mengklaim panjang jalur yang sama.
  pemilik_gardu_kode TEXT,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS tiang_konduktor_unik
  ON public.tiang_konduktor (tiang_id, nomor);

-- Untuk basis data yang tabelnya sudah ada sebelum kolom ini lahir.
ALTER TABLE public.tiang_konduktor
  ADD COLUMN IF NOT EXISTS induk_tiang_id UUID REFERENCES public.tiang(id) ON DELETE SET NULL;

-- ⚠ AKIBAT DI SISI APLIKASI, jangan sampai terlupa:
-- `tiang_konduktor` sekarang punya DUA kunci asing ke `tiang` (tiang_id dan
-- induk_tiang_id), jadi PostgREST tidak bisa lagi menebak lewat mana harus
-- menyambung. Setiap query yang menyertakan konduktor HARUS menyebut kuncinya:
--
--   tiang?select=...,tiang_konduktor!tiang_konduktor_tiang_id_fkey(nomor,jenis,...)
--
-- Tanpa itu jawabannya HTTP 300 "more than one relationship was found" — dan
-- galatnya muncul di aplikasi, bukan di sini, jadi sebabnya tidak kelihatan.

COMMENT ON TABLE public.tiang_konduktor IS
  'Kabel yang lewat di satu tiang, satu baris per kabel. Ukuran boleh berbeda antar tiang — penghantar memang mengecil menuju ujung jalur.';

-- ── 3. Label tiang + kabel ───────────────────────────────────────────────────
-- Sekarang bersumber dari konduktor per tiang, bukan dari sirkit per jurusan.

DROP VIEW IF EXISTS public.tiang_label;
CREATE VIEW public.tiang_label AS
SELECT
  t.id           AS tiang_id,
  k.id           AS konduktor_id,
  t.gardu_kode,
  t.ulp,
  t.jurusan,
  k.nomor        AS nomor_kabel,
  t.kode         AS kode_tiang,
  CASE WHEN k.nomor = 1 THEN t.kode
       ELSE t.kode || '.' || k.nomor END AS label,
  COALESCE(k.pemilik_gardu_kode, t.gardu_kode) AS pemilik_gardu_kode,
  k.jenis,
  k.ukuran,
  k.kondisi
FROM public.tiang t
JOIN public.tiang_konduktor k ON k.tiang_id = t.id
WHERE t.status_hidup = 'aktif';

-- ── 4. Panjang: rute sekali, penghantar per kabel ────────────────────────
-- Dua angka yang berbeda dan dua-duanya dipakai:
--   RUTE       — panjang jalurnya, tiap bentang dihitung sekali.
--   PENGHANTAR — panjang kabelnya; jalur ber-underbuild terhitung berlipat.
--
-- Semuanya berangkat dari satu view dasar, `tiang_gawang_kabel`: satu baris per
-- KABEL per tiang, lengkap dengan hulunya sendiri. Sudut pandangnya sengaja
-- kabel, bukan tiang — dua kabel di satu tiang boleh datang dari tiang yang
-- berbeda, dan pandangan per-tiang tidak bisa menyatakan itu.

-- `jtr_penyapuan` (dibuat di `jtr-penyapuan.sql`) dan `gardu_jtr_penghantar`
-- (bagian 8 di bawah) ikut bergantung pada view panjang, jadi harus dibuang
-- lebih dulu saat skrip ini dijalankan ulang. Keduanya dibangun kembali —
-- itulah sebabnya urutan menjalankan skrip harus utuh, bukan sepotong-sepotong.
DROP VIEW IF EXISTS public.jtr_penyapuan;
DROP VIEW IF EXISTS public.jtr_gawang_terputus;
DROP VIEW IF EXISTS public.ulp_jtr_panjang;
DROP VIEW IF EXISTS public.gardu_jtr_panjang;
DROP VIEW IF EXISTS public.gardu_jtr_penghantar;
DROP VIEW IF EXISTS public.tiang_gawang_kabel;

CREATE VIEW public.tiang_gawang_kabel AS
SELECT
  t.id           AS tiang_id,
  t.kode,
  t.gardu_kode,
  t.ulp,
  t.jurusan,
  k.id           AS konduktor_id,
  k.nomor        AS nomor_kabel,
  k.jenis,
  k.ukuran,
  COALESCE(k.induk_tiang_id, t.induk_id) AS hulu_id,
  (k.induk_tiang_id IS NOT NULL)         AS hulu_ditunjuk,
  public.jarak_meter(
    t.lat, t.lng,
    COALESCE(h.lat, g.lat),
    COALESCE(h.lng, g.lng)
  ) AS panjang_m,
  -- Bentang ini benar-benar memikul kabel tersebut bila salah satu berlaku:
  --   a. dia bentang pangkal — ujung satunya gardu, tak ada tiang dicocokkan;
  --   b. hulunya DITUNJUK di baris kabel ini — penunjukan itu sendiri sudah
  --      pernyataan bahwa kabelnya datang dari sana;
  --   c. hulunya memikul kabel bernomor sama.
  --
  -- Yang tidak memenuhi satu pun berarti kabelnya muncul entah dari mana:
  -- panjangnya TIDAK dijumlahkan, tapi juga tidak didiamkan — dia terhitung
  -- sebagai `gawang_terputus` supaya kekurangannya kelihatan sebagai
  -- kekurangan, bukan sekadar angka yang lebih kecil.
  (COALESCE(k.induk_tiang_id, t.induk_id) IS NULL
   OR k.induk_tiang_id IS NOT NULL
   OR EXISTS (
        SELECT 1 FROM public.tiang_konduktor kp
        WHERE kp.tiang_id = t.induk_id AND kp.nomor = k.nomor
      )) AS tersambung
FROM public.tiang t
JOIN public.tiang_konduktor k ON k.tiang_id = t.id
LEFT JOIN public.tiang h
  ON h.id = COALESCE(k.induk_tiang_id, t.induk_id)
 AND h.status_hidup = 'aktif'
LEFT JOIN public.gardu g
  ON upper(g.kode) = upper(t.gardu_kode)
 AND upper(g.ulp)  = upper(t.ulp)
WHERE t.status_hidup = 'aktif'
  AND t.gardu_kode IS NOT NULL;

COMMENT ON VIEW public.tiang_gawang_kabel IS
  'Satu baris per kabel per tiang, dengan hulu dan panjang bentangnya sendiri. Dasar semua hitungan penghantar.';

CREATE VIEW public.gardu_jtr_panjang AS
WITH rute AS (
  SELECT gardu_kode, ulp, jurusan,
         count(*)                                  AS jumlah_tiang,
         sum(panjang_m)                            AS panjang_m,
         avg(panjang_m)                            AS rata_m,
         max(panjang_m)                            AS maks_m,
         count(*) FILTER (WHERE panjang_m IS NULL) AS gawang_tanpa_titik
  FROM public.tiang_gawang
  GROUP BY gardu_kode, ulp, jurusan
), tanpa_kabel AS (
  -- Tiang yang konduktornya belum dicatat sama sekali. Bentangnya TIDAK bisa
  -- ikut menghitung panjang penghantar, jadi angkanya akan lebih kecil dari
  -- semestinya. Tanpa penanda ini, kekurangan itu tidak kelihatan sebagai
  -- kekurangan — dia cuma tampil sebagai angka yang lebih kecil, dan angka
  -- salah tanpa tanda jauh lebih berbahaya daripada angka yang jelas kosong.
  SELECT t.gardu_kode, t.ulp, t.jurusan, count(*) AS jml
  FROM public.tiang t
  WHERE t.status_hidup = 'aktif'
    AND t.gardu_kode IS NOT NULL
    AND NOT EXISTS (SELECT 1 FROM public.tiang_konduktor k WHERE k.tiang_id = t.id)
  GROUP BY t.gardu_kode, t.ulp, t.jurusan
), penghantar AS (
  SELECT gardu_kode, ulp, jurusan,
         max(nomor_kabel)                         AS jumlah_kabel,
         sum(panjang_m) FILTER (WHERE tersambung) AS panjang_m,
         count(*) FILTER (WHERE NOT tersambung)   AS gawang_terputus
  FROM public.tiang_gawang_kabel
  GROUP BY gardu_kode, ulp, jurusan
)
SELECT
  r.gardu_kode,
  r.ulp,
  r.jurusan,
  j.arah                                          AS arah_jurusan,
  r.jumlah_tiang,
  COALESCE(p.jumlah_kabel, 0)                     AS jumlah_kabel,
  round((r.panjang_m / 1000)::numeric, 3)         AS panjang_rute_km,
  round((COALESCE(p.panjang_m, r.panjang_m) / 1000)::numeric, 3)
                                                  AS panjang_penghantar_km,
  round(r.rata_m::numeric, 1)                     AS rata_gawang_m,
  round(r.maks_m::numeric, 1)                     AS gawang_terpanjang_m,
  r.gawang_tanpa_titik,
  COALESCE(tk.jml, 0)                             AS tiang_tanpa_kabel,
  COALESCE(p.gawang_terputus, 0)                  AS gawang_terputus
FROM rute r
LEFT JOIN penghantar p
  ON p.gardu_kode = r.gardu_kode AND p.ulp = r.ulp AND p.jurusan = r.jurusan
LEFT JOIN tanpa_kabel tk
  ON tk.gardu_kode = r.gardu_kode AND tk.ulp = r.ulp AND tk.jurusan = r.jurusan
LEFT JOIN public.jurusan_ref j ON j.kode = r.jurusan;

CREATE VIEW public.ulp_jtr_panjang AS
SELECT
  ulp,
  count(DISTINCT gardu_kode)                    AS jumlah_gardu,
  sum(jumlah_tiang)                             AS jumlah_tiang,
  round(sum(panjang_rute_km)::numeric, 2)       AS panjang_rute_km,
  round(sum(panjang_penghantar_km)::numeric, 2) AS panjang_penghantar_km,
  sum(tiang_tanpa_kabel)                        AS tiang_tanpa_kabel,
  sum(gawang_terputus)                          AS gawang_terputus
FROM public.gardu_jtr_panjang
GROUP BY ulp;

-- ── 5. Simpan konduktor satu tiang ───────────────────────────────────────────
-- Menggantikan `set_kabel_jurusan`, yang berangkat dari anggapan keliru bahwa
-- satu ukuran berlaku sepanjang jurusan.

DROP FUNCTION IF EXISTS public.set_kabel_jurusan(TEXT, TEXT, TEXT, TEXT, TEXT, INT);

CREATE OR REPLACE FUNCTION public.set_konduktor_tiang(
  p_tiang_id UUID,
  p_nomor    INT,
  p_jenis    TEXT,
  p_ukuran   TEXT,
  p_kondisi  TEXT DEFAULT NULL,
  p_pemilik  TEXT DEFAULT NULL,
  p_nama     TEXT DEFAULT NULL
) RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  t    RECORD;
  lama RECORD;
  id_k UUID;
BEGIN
  SELECT kode, ulp INTO t FROM public.tiang WHERE id = p_tiang_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Tiang tidak ditemukan'; END IF;

  SELECT * INTO lama FROM public.tiang_konduktor
  WHERE tiang_id = p_tiang_id AND nomor = p_nomor;

  INSERT INTO public.tiang_konduktor (tiang_id, nomor, jenis, ukuran, kondisi, pemilik_gardu_kode)
  VALUES (p_tiang_id, p_nomor, p_jenis, p_ukuran, p_kondisi, p_pemilik)
  ON CONFLICT (tiang_id, nomor) DO UPDATE
    SET jenis = EXCLUDED.jenis,
        ukuran = EXCLUDED.ukuran,
        kondisi = COALESCE(EXCLUDED.kondisi, public.tiang_konduktor.kondisi),
        pemilik_gardu_kode = COALESCE(EXCLUDED.pemilik_gardu_kode, public.tiang_konduktor.pemilik_gardu_kode),
        updated_at = now()
  RETURNING id INTO id_k;

  IF FOUND AND lama.id IS NOT NULL
     AND (lama.ukuran IS DISTINCT FROM p_ukuran OR lama.jenis IS DISTINCT FROM p_jenis) THEN
    INSERT INTO public.master_audit (entitas, entitas_kode, ulp, field, nilai_lama, nilai_baru, aksi, oleh_uid, oleh_nama)
    VALUES ('tiang', t.kode, t.ulp, 'konduktor_' || p_nomor,
            jsonb_build_object('jenis', lama.jenis, 'ukuran', lama.ukuran),
            jsonb_build_object('jenis', p_jenis, 'ukuran', p_ukuran),
            'koreksi_lapangan', auth.uid(), p_nama);
  END IF;

  RETURN id_k;
END $$;

-- Simpan SELURUH daftar kabel satu tiang sekali jalan.
--
-- Berbeda dari `set_konduktor_tiang` di atas yang menyimpan satu kabel: yang
-- ini juga MENGHAPUS kabel yang tidak lagi ada di daftar. Tanpa itu, menghapus
-- underbuild di layar tidak menghapus apa pun di database — kabel yang sudah
-- dicabut tetap ikut menghitung panjang penghantar selamanya, dan tidak ada
-- yang tahu dari mana angkanya datang.
--
-- Di sini juga `induk_tiang_id` ditulis apa adanya, termasuk dikosongkan.
-- Fungsi lama sengaja dibiarkan tidak menyentuh kolom itu supaya aplikasi versi
-- lama, yang belum tahu kolom ini ada, tidak diam-diam menghapus penunjuk yang
-- sudah benar setiap kali seseorang mengoreksi tiangnya.

CREATE OR REPLACE FUNCTION public.simpan_konduktor_tiang(
  p_tiang_id UUID,
  p_daftar   JSONB,
  p_nama     TEXT DEFAULT NULL
) RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  t       RECORD;
  h       RECORD;
  k       JSONB;
  lama    RECORD;
  hulu    UUID;
  no_kabel INT;
  dipakai INT[] := '{}';
  diff    JSONB := '{}'::jsonb;
BEGIN
  SELECT kode, ulp, gardu_kode INTO t FROM public.tiang WHERE id = p_tiang_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Tiang tidak ditemukan'; END IF;

  FOR k IN SELECT * FROM jsonb_array_elements(COALESCE(p_daftar, '[]'::jsonb)) LOOP
    no_kabel := (k->>'nomor')::int;
    hulu  := NULLIF(k->>'hulu_id', '')::uuid;
    dipakai := dipakai || no_kabel;

    IF hulu IS NOT NULL THEN
      IF hulu = p_tiang_id THEN
        RAISE EXCEPTION 'Tiang % tidak bisa jadi asal kabel bagi dirinya sendiri', t.kode;
      END IF;
      SELECT kode, ulp, gardu_kode INTO h FROM public.tiang
      WHERE id = hulu AND status_hidup = 'aktif';
      IF NOT FOUND THEN
        RAISE EXCEPTION 'Tiang asal kabel ke-% tidak ditemukan atau sudah tidak aktif', no_kabel;
      END IF;
      IF upper(h.gardu_kode) IS DISTINCT FROM upper(t.gardu_kode)
         OR upper(h.ulp) IS DISTINCT FROM upper(t.ulp) THEN
        RAISE EXCEPTION 'Tiang asal % bukan milik gardu yang sama', h.kode;
      END IF;
      -- Cegah dua tiang saling menunjuk: bentangnya akan terhitung dua kali.
      IF EXISTS (
        SELECT 1 FROM public.tiang_konduktor x
        WHERE x.tiang_id = hulu AND x.induk_tiang_id = p_tiang_id
      ) THEN
        RAISE EXCEPTION 'Tiang % sudah menunjuk % sebagai asal kabelnya', h.kode, t.kode;
      END IF;
    END IF;

    SELECT * INTO lama FROM public.tiang_konduktor
    WHERE tiang_id = p_tiang_id AND nomor = no_kabel;

    IF FOUND THEN
      IF lama.jenis IS DISTINCT FROM (k->>'jenis')
         OR lama.ukuran IS DISTINCT FROM (k->>'ukuran') THEN
        diff := diff || jsonb_build_object(
          'kabel_' || no_kabel,
          jsonb_build_array(
            concat_ws(' ', lama.jenis, lama.ukuran),
            concat_ws(' ', k->>'jenis', k->>'ukuran')));
      END IF;
      IF lama.induk_tiang_id IS DISTINCT FROM hulu THEN
        diff := diff || jsonb_build_object(
          'asal_kabel_' || no_kabel,
          jsonb_build_array(
            (SELECT kode FROM public.tiang WHERE id = lama.induk_tiang_id),
            (SELECT kode FROM public.tiang WHERE id = hulu)));
      END IF;
    END IF;

    INSERT INTO public.tiang_konduktor
      (tiang_id, nomor, jenis, ukuran, kondisi, induk_tiang_id)
    VALUES (p_tiang_id, no_kabel, k->>'jenis', k->>'ukuran', k->>'kondisi', hulu)
    ON CONFLICT (tiang_id, nomor) DO UPDATE
      SET jenis          = EXCLUDED.jenis,
          ukuran         = EXCLUDED.ukuran,
          kondisi        = EXCLUDED.kondisi,
          induk_tiang_id = EXCLUDED.induk_tiang_id,
          updated_at     = now();
  END LOOP;

  DELETE FROM public.tiang_konduktor
  WHERE tiang_id = p_tiang_id AND NOT (nomor = ANY (dipakai));

  IF diff <> '{}'::jsonb THEN
    INSERT INTO public.master_audit
      (entitas, entitas_kode, ulp, field, nilai_lama, nilai_baru, aksi, oleh_uid, oleh_nama)
    VALUES ('tiang', t.kode, t.ulp, 'konduktor', NULL, diff,
            'koreksi_lapangan', auth.uid(), p_nama);
  END IF;
END $$;

-- ── 6. Hak akses ─────────────────────────────────────────────────────────────
ALTER TABLE public.tiang_konduktor ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS auth_all_tiang_konduktor ON public.tiang_konduktor;
CREATE POLICY auth_all_tiang_konduktor ON public.tiang_konduktor
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

GRANT SELECT ON public.tiang_label       TO authenticated;
GRANT SELECT ON public.gardu_jtr_panjang TO authenticated;
GRANT SELECT ON public.ulp_jtr_panjang   TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_konduktor_tiang TO authenticated;
GRANT EXECUTE ON FUNCTION public.simpan_konduktor_tiang TO authenticated;

-- =============================================================================
-- Periksa hasilnya
-- =============================================================================
-- a. Tiang tanpa arde — satu query, tanpa membongkar teks:
--      SELECT count(*) FROM tiang WHERE status_hidup='aktif' AND arde_kondisi='Tidak Ada';
--
-- b. Penghalang di jalur, terhitung terpisah:
--      SELECT r, count(*) FROM tiang, unnest(rawan_row) AS r
--      WHERE status_hidup='aktif' GROUP BY r ORDER BY 2 DESC;
--
-- c. Jurusan yang panjang penghantarnya belum bisa dipercaya:
--      SELECT gardu_kode, jurusan, jumlah_tiang, tiang_tanpa_kabel,
--             panjang_rute_km, panjang_penghantar_km
--      FROM gardu_jtr_panjang WHERE tiang_tanpa_kabel > 0;
--
-- d. Tiang yang menumpang tiang TM, dan yang punya catatan perbaikan:
--      SELECT kode, underbuild_tm, catatan_perbaikan FROM tiang
--      WHERE status_hidup='aktif' AND (underbuild_tm OR catatan_perbaikan IS NOT NULL);
--
-- d. Ukuran kabel yang berubah di tengah jalur:
--      SELECT kode_tiang, nomor_kabel, ukuran FROM tiang_label
--      WHERE gardu_kode='AM001' ORDER BY kode_tiang, nomor_kabel;
-- =============================================================================

-- ── 7. Koreksi lengkap, termasuk atribut lapangan ────────────────────────────
-- Menggantikan `koreksi_tiang` versi 5-field. Atribut lapangan diaudit sebagai
-- SATU baris berisi selisihnya, bukan satu baris per kolom: perubahan aksesoris
-- biasanya datang bersamaan dalam satu kunjungan, dan memecahnya jadi sepuluh
-- baris membuat riwayat sulit dibaca justru pada saat paling dibutuhkan.

DROP FUNCTION IF EXISTS public.koreksi_tiang(UUID, TEXT, NUMERIC, TEXT, DOUBLE PRECISION, DOUBLE PRECISION, TEXT, TEXT);

CREATE OR REPLACE FUNCTION public.koreksi_tiang(
  p_id      UUID,
  p_jenis   TEXT DEFAULT NULL,
  p_tinggi  NUMERIC DEFAULT NULL,
  p_kondisi TEXT DEFAULT NULL,
  p_lat     DOUBLE PRECISION DEFAULT NULL,
  p_lng     DOUBLE PRECISION DEFAULT NULL,
  p_nama    TEXT DEFAULT NULL,
  p_catatan TEXT DEFAULT NULL,
  p_atribut JSONB DEFAULT NULL
) RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  t    RECORD;
  diff JSONB := '{}'::jsonb;
BEGIN
  SELECT * INTO t FROM public.tiang WHERE id = p_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Tiang tidak ditemukan'; END IF;
  IF t.status_hidup <> 'aktif' THEN
    RAISE EXCEPTION 'Tiang % sudah tidak aktif (%)', t.kode, t.status_hidup;
  END IF;

  IF p_jenis IS NOT NULL AND p_jenis IS DISTINCT FROM t.jenis THEN
    INSERT INTO public.master_audit (entitas, entitas_kode, ulp, field, nilai_lama, nilai_baru, aksi, oleh_uid, oleh_nama)
    VALUES ('tiang', t.kode, t.ulp, 'jenis', to_jsonb(t.jenis), to_jsonb(p_jenis), 'koreksi_lapangan', auth.uid(), p_nama);
  END IF;
  IF p_tinggi IS NOT NULL AND p_tinggi IS DISTINCT FROM t.tinggi THEN
    INSERT INTO public.master_audit (entitas, entitas_kode, ulp, field, nilai_lama, nilai_baru, aksi, oleh_uid, oleh_nama)
    VALUES ('tiang', t.kode, t.ulp, 'tinggi', to_jsonb(t.tinggi), to_jsonb(p_tinggi), 'koreksi_lapangan', auth.uid(), p_nama);
  END IF;
  IF p_kondisi IS NOT NULL AND p_kondisi IS DISTINCT FROM t.kondisi THEN
    INSERT INTO public.master_audit (entitas, entitas_kode, ulp, field, nilai_lama, nilai_baru, aksi, oleh_uid, oleh_nama)
    VALUES ('tiang', t.kode, t.ulp, 'kondisi', to_jsonb(t.kondisi), to_jsonb(p_kondisi), 'koreksi_lapangan', auth.uid(), p_nama);
  END IF;
  IF p_lat IS NOT NULL AND p_lng IS NOT NULL
     AND (p_lat IS DISTINCT FROM t.lat::double precision OR p_lng IS DISTINCT FROM t.lng::double precision) THEN
    INSERT INTO public.master_audit (entitas, entitas_kode, ulp, field, nilai_lama, nilai_baru, aksi, oleh_uid, oleh_nama)
    VALUES ('tiang', t.kode, t.ulp, 'koordinat',
            jsonb_build_object('lat', t.lat, 'lng', t.lng),
            jsonb_build_object('lat', p_lat, 'lng', p_lng), 'koreksi_lapangan', auth.uid(), p_nama);
  END IF;

  IF p_atribut IS NOT NULL THEN
    -- Kumpulkan hanya yang benar-benar berbeda.
    IF p_atribut ? 'aks_suspension'  AND (p_atribut->>'aks_suspension')  IS DISTINCT FROM t.aks_suspension  THEN diff := diff || jsonb_build_object('aks_suspension',  jsonb_build_array(t.aks_suspension,  p_atribut->>'aks_suspension'));  END IF;
    IF p_atribut ? 'aks_large_angle' AND (p_atribut->>'aks_large_angle') IS DISTINCT FROM t.aks_large_angle THEN diff := diff || jsonb_build_object('aks_large_angle', jsonb_build_array(t.aks_large_angle, p_atribut->>'aks_large_angle')); END IF;
    IF p_atribut ? 'aks_dead_end'    AND (p_atribut->>'aks_dead_end')    IS DISTINCT FROM t.aks_dead_end    THEN diff := diff || jsonb_build_object('aks_dead_end',    jsonb_build_array(t.aks_dead_end,    p_atribut->>'aks_dead_end'));    END IF;
    IF p_atribut ? 'andongan'        AND (p_atribut->>'andongan')        IS DISTINCT FROM t.andongan        THEN diff := diff || jsonb_build_object('andongan',        jsonb_build_array(t.andongan,        p_atribut->>'andongan'));        END IF;
    IF p_atribut ? 'arde_kondisi'    AND (p_atribut->>'arde_kondisi')    IS DISTINCT FROM t.arde_kondisi    THEN diff := diff || jsonb_build_object('arde_kondisi',    jsonb_build_array(t.arde_kondisi,    p_atribut->>'arde_kondisi'));    END IF;
    IF p_atribut ? 'stay_kondisi'    AND (p_atribut->>'stay_kondisi')    IS DISTINCT FROM t.stay_kondisi    THEN diff := diff || jsonb_build_object('stay_kondisi',    jsonb_build_array(t.stay_kondisi,    p_atribut->>'stay_kondisi'));    END IF;
    IF p_atribut ? 'underbuild_tm'   AND (p_atribut->>'underbuild_tm')::boolean IS DISTINCT FROM t.underbuild_tm THEN diff := diff || jsonb_build_object('underbuild_tm', jsonb_build_array(t.underbuild_tm, (p_atribut->>'underbuild_tm')::boolean)); END IF;
    IF p_atribut ? 'catatan_perbaikan' AND (p_atribut->>'catatan_perbaikan') IS DISTINCT FROM t.catatan_perbaikan THEN diff := diff || jsonb_build_object('catatan_perbaikan', jsonb_build_array(t.catatan_perbaikan, p_atribut->>'catatan_perbaikan')); END IF;

    UPDATE public.tiang SET
      aks_suspension  = COALESCE(p_atribut->>'aks_suspension',  aks_suspension),
      aks_large_angle = COALESCE(p_atribut->>'aks_large_angle', aks_large_angle),
      aks_dead_end    = COALESCE(p_atribut->>'aks_dead_end',    aks_dead_end),
      andongan        = COALESCE(p_atribut->>'andongan',        andongan),
      tarikan_sr      = COALESCE((p_atribut->>'tarikan_sr')::int,        tarikan_sr),
      arde_kondisi    = COALESCE(p_atribut->>'arde_kondisi',    arde_kondisi),
      arde_nilai_ohm  = COALESCE((p_atribut->>'arde_nilai_ohm')::numeric, arde_nilai_ohm),
      stay_jenis      = COALESCE(p_atribut->>'stay_jenis',      stay_jenis),
      stay_kondisi    = COALESCE(p_atribut->>'stay_kondisi',    stay_kondisi),
      rawan_row       = COALESCE(
                          (SELECT array_agg(x) FROM jsonb_array_elements_text(p_atribut->'rawan_row') AS x),
                          rawan_row),
      jamperan        = COALESCE(p_atribut->'jamperan', jamperan),
      underbuild_tm   = COALESCE((p_atribut->>'underbuild_tm')::boolean, underbuild_tm),
      catatan_perbaikan = COALESCE(p_atribut->>'catatan_perbaikan', catatan_perbaikan)
    WHERE id = p_id;

    IF diff <> '{}'::jsonb THEN
      INSERT INTO public.master_audit (entitas, entitas_kode, ulp, field, nilai_lama, nilai_baru, aksi, oleh_uid, oleh_nama)
      VALUES ('tiang', t.kode, t.ulp, 'atribut', NULL, diff, 'koreksi_lapangan', auth.uid(), p_nama);
    END IF;
  END IF;

  UPDATE public.tiang
  SET jenis   = COALESCE(p_jenis, jenis),
      tinggi  = COALESCE(p_tinggi, tinggi),
      kondisi = COALESCE(p_kondisi, kondisi),
      lat     = COALESCE(p_lat, lat),
      lng     = COALESCE(p_lng, lng),
      catatan = COALESCE(p_catatan, catatan),
      dikonfirmasi_at   = now(),
      dikonfirmasi_oleh = COALESCE(p_nama, dikonfirmasi_oleh),
      updated_at = now()
  WHERE id = p_id;
END $$;

GRANT EXECUTE ON FUNCTION public.koreksi_tiang TO authenticated;

-- ── 8. Panjang penghantar dipecah per kabel dan per ukuran ───────────────
-- `gardu_jtr_panjang` menjawab "berapa total penghantarnya". Yang dibutuhkan
-- saat menyetujui pekerjaan dan saat menghitung material adalah jawaban yang
-- lebih rinci: kabel yang mana, ukuran berapa, sepanjang apa.
--
-- Dipecah sampai UKURAN, bukan berhenti di nomor kabel, karena satu kabel bisa
-- mengecil di tengah jalur — 70 di pangkal, 50 di ujung — dan menjumlahkannya
-- jadi satu angka menghapus justru perbedaan yang ingin diketahui.

CREATE VIEW public.gardu_jtr_penghantar AS
SELECT
  gardu_kode,
  ulp,
  jurusan,
  nomor_kabel,
  jenis,
  ukuran,
  count(*)                                   AS jumlah_gawang,
  round((sum(panjang_m) / 1000)::numeric, 3) AS panjang_km
FROM public.tiang_gawang_kabel
WHERE tersambung
GROUP BY gardu_kode, ulp, jurusan, nomor_kabel, jenis, ukuran;

COMMENT ON VIEW public.gardu_jtr_penghantar IS
  'Panjang penghantar per gardu/jurusan/nomor kabel/ukuran. Kabel nomor >1 adalah underbuild.';

-- Bentang yang hulunya tak bisa ditelusuri. Bukan daftar kesalahan — daftar
-- pekerjaan: tiap baris berarti ada kabel tercatat di sebuah tiang tapi belum
-- jelas datang dari mana, jadi panjangnya belum ikut terhitung. Perbaikannya
-- satu ketukan di lapangan: tunjuk tiang asalnya.
CREATE VIEW public.jtr_gawang_terputus AS
SELECT
  gk.gardu_kode,
  gk.ulp,
  gk.jurusan,
  gk.kode        AS tiang_kode,
  gk.tiang_id,
  gk.nomor_kabel,
  gk.jenis,
  gk.ukuran,
  round(gk.panjang_m::numeric, 1) AS panjang_m,
  h.kode         AS hulu_kode
FROM public.tiang_gawang_kabel gk
LEFT JOIN public.tiang h ON h.id = gk.hulu_id
WHERE NOT gk.tersambung;

GRANT SELECT ON public.tiang_gawang_kabel   TO authenticated;
GRANT SELECT ON public.gardu_jtr_penghantar TO authenticated;
GRANT SELECT ON public.jtr_gawang_terputus  TO authenticated;
