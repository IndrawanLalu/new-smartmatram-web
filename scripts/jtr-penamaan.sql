-- =============================================================================
-- Fase 1.1b — Standardisasi jurusan, penamaan tiang otomatis, dan underbuild
-- Jalankan SESUDAH `jtr-schema.sql`. Idempoten.
--
-- Tiga aturan yang dikunci di sini, semuanya supaya inspektor tidak pernah
-- perlu memikirkan nama:
--
--   1. TITIK AWAL = TITIK GARDU. Gardu adalah pangkal pohon. Inspeksi tidak
--      bisa dimulai sebelum gardunya punya koordinat — kalau belum ada,
--      langkah pertama inspektor adalah berdiri di bawah gardu dan menitiknya.
--
--   2. JURUSAN dibakukan: A=utara · B=timur · C=selatan · D=barat · K=khusus.
--      Inspektor memilih jurusan mana yang disapu.
--
--   3. NOMOR 1 ADALAH TIANG GARDU. Trafo berdiri di sebuah tiang, dan tiang itu
--      tiang pertama tiap jurusan yang berangkat darinya. Karena itu tiang JTR
--      pertama yang dititik inspektor bernomor DUA, bukan satu.
--
--      Tiang gardu tidak jadi baris tersendiri di tabel `tiang`: dia sudah ada
--      sebagai barisnya di `gardu`, lengkap dengan koordinatnya, dan menyalinnya
--      jadi tiang berarti dua tempat menyimpan satu titik yang sama — yang
--      cepat atau lambat akan berselisih.
--
--   4. NAMA TIANG DIBUAT SISTEM, bukan diketik:
--         AM001-A2 · AM001-A3 · AM001-A4    jurusan A — A1 adalah tiang gardu
--         AM001-A4B1 · AM001-A4B2           jalur BELOK ke timur sesudah A4
--         AM001-A4_B1                       BERCABANG ke timur di A4
--         AM001-A4_B3_C1                    cabang lagi ke selatan di A4_B3
--         AM001-A3a                         tiang SISIPAN antara A3 dan A4
--         AM001-A2a                         tiang pertama SIRKIT KEDUA jurusan A
--         AM001-A2.2 · AM001-A2.3           KABEL ke-2 dan ke-3 di tiang A2
--
--      GARIS BAWAH memisahkan PERCABANGAN; belokan ditempel langsung. Bedanya
--      bukan hiasan: A4B1 berarti jalur yang sama berbelok di A4, sedangkan
--      A4_B1 berarti di A4 jalurnya PECAH DUA dan ini yang satunya. Dua bentuk
--      jaringan yang berbeda, dan orang yang membaca namanya perlu tahu mana
--      yang mana tanpa membuka peta.
--
--      Huruf baru muncul saat jalurnya berbelok, bukan hanya saat bercabang.
--      Itu yang dipakai regu di lapangan, dan hasilnya nama tiang menggambarkan
--      bentuk jalurnya: siapa pun yang membaca AM001-A4_B3_C1 tahu jaringan itu
--      naik ke utara, pecah ke timur, lalu pecah lagi ke selatan.
--
--      Titik desimal = nomor kabel, BUKAN tiang. Underbuild tidak menambah
--      tiang; tiangnya satu, kabelnya banyak. Karena itu `.2` adalah label
--      turunan (lihat view `tiang_label`), bukan baris baru di tabel `tiang`.
--
--      Huruf cabang tidak dipilih orang — dihitung dari arah mata angin
--      sebenarnya antara tiang induk dan tiang baru.
-- =============================================================================

-- ── 1. Jurusan dibakukan ─────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.jurusan_ref (
  kode           TEXT PRIMARY KEY,
  arah           TEXT NOT NULL,
  derajat_dari   NUMERIC,   -- NULL untuk K: khusus tidak punya arah
  derajat_sampai NUMERIC,
  urutan         INT NOT NULL
);

INSERT INTO public.jurusan_ref (kode, arah, derajat_dari, derajat_sampai, urutan) VALUES
  ('A', 'Utara',   315,  45, 1),
  ('B', 'Timur',    45, 135, 2),
  ('C', 'Selatan', 135, 225, 3),
  ('D', 'Barat',   225, 315, 4),
  ('K', 'Khusus',  NULL, NULL, 5)
ON CONFLICT (kode) DO UPDATE
  SET arah = EXCLUDED.arah,
      derajat_dari = EXCLUDED.derajat_dari,
      derajat_sampai = EXCLUDED.derajat_sampai,
      urutan = EXCLUDED.urutan;

ALTER TABLE public.tiang DROP CONSTRAINT IF EXISTS tiang_jurusan_valid;
ALTER TABLE public.tiang ADD CONSTRAINT tiang_jurusan_valid
  CHECK (jurusan IS NULL OR jurusan IN ('A', 'B', 'C', 'D', 'K'));

COMMENT ON TABLE public.jurusan_ref IS
  'Jurusan gardu dibakukan: A=utara B=timur C=selatan D=barat K=khusus. Huruf yang sama dipakai untuk menamai cabang, karena cabang pun dinamai menurut arahnya.';

-- ── 2. Arah mata angin dari dua titik ────────────────────────────────────────
-- Inilah yang membuat penamaan cabang otomatis: huruf cabang bukan pilihan
-- orang, tapi arah sebenarnya tiang baru terhadap induknya.

CREATE OR REPLACE FUNCTION public.arah_derajat(
  lat1 DOUBLE PRECISION, lng1 DOUBLE PRECISION,
  lat2 DOUBLE PRECISION, lng2 DOUBLE PRECISION
) RETURNS DOUBLE PRECISION
LANGUAGE sql IMMUTABLE PARALLEL SAFE AS $$
  SELECT CASE
    WHEN lat1 IS NULL OR lng1 IS NULL OR lat2 IS NULL OR lng2 IS NULL THEN NULL
    ELSE (degrees(atan2(
           sin(radians(lng2 - lng1)) * cos(radians(lat2)),
           cos(radians(lat1)) * sin(radians(lat2))
         - sin(radians(lat1)) * cos(radians(lat2)) * cos(radians(lng2 - lng1))
         )) + 360)::numeric % 360
  END
$$;

CREATE OR REPLACE FUNCTION public.arah_huruf(derajat DOUBLE PRECISION)
RETURNS TEXT LANGUAGE sql IMMUTABLE PARALLEL SAFE AS $$
  SELECT CASE
    WHEN derajat IS NULL                THEN NULL
    WHEN derajat >= 315 OR derajat < 45 THEN 'A'
    WHEN derajat < 135                  THEN 'B'
    WHEN derajat < 225                  THEN 'C'
    ELSE                                     'D'
  END
$$;

-- ── 3. Penamaan tiang otomatis ───────────────────────────────────────────────
-- Trigger BEFORE INSERT: aplikasi cukup mengirim gardu, jurusan, induk, dan
-- koordinat — namanya lahir sendiri. Kalau `kode` sengaja diisi (tiang sudah
-- punya nomor tertulis di lapangan), isian itu dihormati.
--
-- Aturannya mengikuti kebiasaan regu: nomor berjalan selama jalurnya lurus, dan
-- huruf arah baru dimulai begitu jalurnya BERBELOK — tidak menunggu ada cabang.
--
--   a. Induk NULL                → pangkal jurusan            → AM001-A1
--   b. Jalur lurus (belok ≤ 60°) → nomor lanjut               → AM001-A4
--   c. Jalur berbelok (> 60°)    → huruf arah baru, mulai 1   → AM001-A3B1
--   d. Searah dengan anak yang sudah ada → sisipan            → AM001-A3a
--
-- Ambang beloknya 60°, BUKAN sekadar berpindah kuadrat mata angin. Jaringan JTR
-- menyusur jalan dan melengkung sedikit demi sedikit; kalau huruf baru dipicu
-- setiap kali arahnya melewati batas kuadrat, satu jalan yang menikung landai
-- akan melahirkan segmen baru berkali-kali tanpa ada yang benar-benar berbelok.
-- Yang dibandingkan pun bukan arah mutlak, melainkan arah bentang SEBELUMNYA —
-- itulah yang menangkap "jalurnya berbelok" sebagaimana dilihat orang.

CREATE OR REPLACE FUNCTION public.tiang_buat_kode()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  induk      RECORD;
  hulu       RECORD;
  anak       RECORD;
  prefiks    TEXT;
  nomor_maks INT;
  arah_baru  DOUBLE PRECISION;
  arah_lama  DOUBLE PRECISION;
  arah_anak  DOUBLE PRECISION;
  belok      DOUBLE PRECISION;
  selisih    DOUBLE PRECISION;
  huruf      TEXT;
  akhiran    TEXT;
  kode_awal  TEXT;
  ada_awal   BOOLEAN;
  -- Jangan diganti dengan `anak IS NOT NULL`. Untuk variabel RECORD, uji itu
  -- bernilai benar HANYA kalau semua kolomnya terisi — dan `tiang` punya banyak
  -- kolom yang boleh kosong, jadi baris yang ketemu akan dianggap tidak ada.
  ada_anak   BOOLEAN;
BEGIN
  IF NEW.kode IS NOT NULL AND btrim(NEW.kode) <> '' THEN
    RETURN NEW;                                   -- nama manual dihormati
  END IF;

  IF NEW.gardu_kode IS NULL OR NEW.jurusan IS NULL THEN
    RETURN NEW;                                   -- tiang JTM: dinamai di tempat lain
  END IF;

  -- (a) Pangkal — anak langsung dari gardu. Hurufnya memakai JURUSAN yang
  --     dipilih inspektor, bukan arah hasil hitungan: jurusan itu terminal di
  --     trafo, dan tiang pertama boleh saja sedikit menyimpang dari arahnya.
  --
  --     Nomornya MULAI DARI DUA. Nomor satu milik tiang gardu, yang tidak
  --     dititik lagi karena titiknya sudah ada sebagai koordinat gardu.
  IF NEW.induk_id IS NULL THEN
    -- STRIP, bukan garis bawah. Garis bawah sudah dipakai menandai
    -- PERCABANGAN, dan kalau dipakai juga di sini 'AM001-A3_D1' tidak bisa
    -- lagi dibaca: entah cabang D1 dari tiang A3, entah gardu 'AM001-A3'.
    prefiks := upper(NEW.gardu_kode) || '-' || NEW.jurusan;

    -- Pangkal KEDUA di jurusan yang sama. Terjadi ketika dua sirkit berangkat
    -- dari gardu ke arah yang sama, masing-masing lewat tiang pertamanya
    -- sendiri, lalu berbagi tiang mulai tiang kedua. Menomorinya melanjutkan
    -- deret akan menyesatkan: tiang yang berdiri di sebelah A1 akan bernama A7
    -- padahal A6 ada jauh di ujung utara. Dia diberi akhiran huruf pada tiang
    -- pertama — A1a, A1b — yang terbaca sebagai "tiang lain di posisi 1".
    SELECT kode INTO kode_awal
    FROM public.tiang
    WHERE upper(gardu_kode) = upper(NEW.gardu_kode)
      AND upper(ulp) = upper(NEW.ulp)
      AND jurusan = NEW.jurusan
      AND induk_id IS NULL
      AND status_hidup = 'aktif'
      AND kode ~ ('^' || prefiks || '[0-9]+$')
    ORDER BY created_at
    LIMIT 1;
    ada_awal := FOUND;

    IF ada_awal THEN
      SELECT chr(97 + count(*)::int) INTO akhiran
      FROM public.tiang
      WHERE upper(gardu_kode) = upper(NEW.gardu_kode)
        AND upper(ulp) = upper(NEW.ulp)
        AND status_hidup = 'aktif'
        AND kode ~ ('^' || kode_awal || '[a-z]$');

      NEW.kode := kode_awal || akhiran;
      RETURN NEW;
    END IF;

    SELECT COALESCE(max((regexp_match(kode, '([0-9]+)[a-z]?$'))[1]::int), 0)
      INTO nomor_maks
    FROM public.tiang
    WHERE upper(gardu_kode) = upper(NEW.gardu_kode)
      AND upper(ulp) = upper(NEW.ulp)
      AND status_hidup = 'aktif'
      AND kode ~ ('^' || prefiks || '[0-9]+[a-z]?$');

    NEW.kode := prefiks || GREATEST(nomor_maks + 1, 2);
    RETURN NEW;
  END IF;

  SELECT * INTO induk FROM public.tiang WHERE id = NEW.induk_id;
  IF NOT FOUND THEN RETURN NEW; END IF;

  arah_baru := public.arah_derajat(induk.lat, induk.lng, NEW.lat, NEW.lng);

  -- (d) Sisipan: sudah ada anak yang menuju arah yang hampir sama, jadi tiang
  --     ini berada di antara induk dan anak itu — bukan segmen baru.
  SELECT * INTO anak
  FROM public.tiang
  WHERE induk_id = induk.id AND status_hidup = 'aktif'
  ORDER BY created_at
  LIMIT 1;
  ada_anak := FOUND;

  IF ada_anak AND arah_baru IS NOT NULL THEN
    arah_anak := public.arah_derajat(induk.lat, induk.lng, anak.lat, anak.lng);
    IF arah_anak IS NOT NULL THEN
      selisih := abs(arah_baru - arah_anak);
      IF selisih > 180 THEN selisih := 360 - selisih; END IF;
      IF selisih <= 45 THEN
        SELECT chr(97 + count(*)::int) INTO akhiran
        FROM public.tiang
        WHERE upper(gardu_kode) = upper(NEW.gardu_kode)
          AND upper(ulp) = upper(NEW.ulp)
          AND status_hidup = 'aktif'
          AND kode ~ ('^' || induk.kode || '[a-z]$');

        NEW.kode := induk.kode || akhiran;
        RETURN NEW;
      END IF;
    END IF;
  END IF;

  -- Arah bentang sebelumnya: dari hulu ke induk. Kalau induk adalah tiang
  -- pangkal, hulunya gardu.
  IF induk.induk_id IS NOT NULL THEN
    SELECT lat, lng INTO hulu FROM public.tiang WHERE id = induk.induk_id;
  ELSE
    SELECT lat, lng INTO hulu FROM public.gardu
    WHERE upper(kode) = upper(NEW.gardu_kode) AND upper(ulp) = upper(NEW.ulp);
  END IF;

  arah_lama := public.arah_derajat(hulu.lat, hulu.lng, induk.lat, induk.lng);

  belok := NULL;
  IF arah_baru IS NOT NULL AND arah_lama IS NOT NULL THEN
    belok := abs(arah_baru - arah_lama);
    IF belok > 180 THEN belok := 360 - belok; END IF;
  END IF;

  IF belok IS NULL OR belok <= 60 THEN
    -- (b) Masih lurus → teruskan nomor pada segmen yang sama.
    --     'AM001-A3B1' → prefiks 'AM001-A3B' → berikutnya 'AM001-A3B2'.
    prefiks := regexp_replace(induk.kode, '[0-9]+[a-z]?$', '');
  ELSE
    -- (c) Segmen baru, hurufnya dari arah mata angin yang baru. Dua bentuk,
    --     dan bedanya nyata di lapangan:
    --
    --       BELOK   — induknya belum punya anak: jalur yang sama membelok.
    --                 'AM001-A4' + ke timur → 'AM001-A4B1'
    --       CABANG  — induknya SUDAH punya anak: di situ jalurnya pecah dua.
    --                 'AM001-A4' + ke timur → 'AM001-A4_B1'
    --
    --     Garis bawah itu satu-satunya tanda percabangan yang terbawa sampai ke
    --     nama tiang, dan itulah yang dibaca regu saat menelusuri gangguan.
    huruf := COALESCE(public.arah_huruf(arah_baru), 'K');
    prefiks := induk.kode || CASE WHEN ada_anak THEN '_' ELSE '' END || huruf;
  END IF;

  SELECT COALESCE(max((regexp_match(kode, '([0-9]+)[a-z]?$'))[1]::int), 0)
    INTO nomor_maks
  FROM public.tiang
  WHERE upper(gardu_kode) = upper(NEW.gardu_kode)
    AND upper(ulp) = upper(NEW.ulp)
    AND status_hidup = 'aktif'
    AND kode ~ ('^' || prefiks || '[0-9]+[a-z]?$');

  NEW.kode := prefiks || (nomor_maks + 1);
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_tiang_buat_kode ON public.tiang;
CREATE TRIGGER trg_tiang_buat_kode
  BEFORE INSERT ON public.tiang
  FOR EACH ROW EXECUTE FUNCTION public.tiang_buat_kode();

COMMENT ON FUNCTION public.tiang_buat_kode IS
  'Nama tiang lahir dari struktur pohon + arah mata angin. Inspektor tidak pernah mengetik nama, dan nama yang sudah terbentuk tidak pernah diubah.';

-- ── 3b. Pindah jurusan ───────────────────────────────────────────────────────
-- Inspektor memilih jurusan sebelum melihat ke mana jalurnya benar-benar pergi.
-- Kalau dia memilih A (utara) padahal jaringannya menuju timur, seluruh tiangnya
-- salah huruf — dan huruf itu ikut ke dalam nama tiap tiang.
--
-- Boleh diperbaiki SELAMA masih awal: nama tiang memang tidak pernah diubah
-- setelah mapan, tapi aturan itu melindungi data yang sudah dipakai — temuan
-- yang menunjuk tiang, tanda yang sudah tertulis di lapangan. Salah pilih yang
-- ketahuan beberapa menit kemudian belum sempat menjadi apa-apa.
--
-- Yang diganti hanya HURUF SEGMEN PERTAMA, yaitu jurusannya. Huruf belokan di
-- belakangnya tidak disentuh: AM001-A3B1 → AM001-B3B1 berarti jurusan B, tiang
-- ke-3, lalu belok timur tiang ke-1 — bentuk jalurnya tetap terbaca.

CREATE OR REPLACE FUNCTION public.pindah_jurusan_tiang(
  p_gardu TEXT,
  p_ulp   TEXT,
  p_dari  TEXT,
  p_ke    TEXT
) RETURNS INT
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  jml_pindah INT;
  jml_tujuan INT;
BEGIN
  IF p_dari = p_ke THEN
    RAISE EXCEPTION 'Jurusan asal dan tujuan sama';
  END IF;
  IF p_ke NOT IN ('A','B','C','D','K') THEN
    RAISE EXCEPTION 'Jurusan % tidak dikenal', p_ke;
  END IF;

  -- Jurusan tujuan harus kosong. Menggabungkan dua jurusan berarti dua tiang
  -- bisa berebut nomor yang sama, dan tidak ada cara memilih siapa yang mengalah
  -- tanpa menebak.
  SELECT count(*) INTO jml_tujuan
  FROM public.tiang
  WHERE upper(gardu_kode) = upper(p_gardu)
    AND upper(ulp) = upper(p_ulp)
    AND jurusan = p_ke
    AND status_hidup = 'aktif';

  IF jml_tujuan > 0 THEN
    RAISE EXCEPTION 'Jurusan % sudah berisi % tiang. Pindah jurusan hanya bisa ke jurusan yang masih kosong.',
      p_ke, jml_tujuan;
  END IF;

  UPDATE public.tiang
  SET jurusan = p_ke,
      kode = regexp_replace(kode, '^(' || upper(p_gardu) || '-)' || p_dari, '\1' || p_ke)
  WHERE upper(gardu_kode) = upper(p_gardu)
    AND upper(ulp) = upper(p_ulp)
    AND jurusan = p_dari
    AND status_hidup = 'aktif';

  GET DIAGNOSTICS jml_pindah = ROW_COUNT;
  RETURN jml_pindah;
END $$;

COMMENT ON FUNCTION public.pindah_jurusan_tiang IS
  'Pindahkan seluruh tiang satu jurusan ke huruf jurusan lain, sekaligus menyesuaikan namanya. Hanya ke jurusan yang masih kosong.';

GRANT EXECUTE ON FUNCTION public.pindah_jurusan_tiang TO authenticated;

-- ── 4. Underbuild — beberapa kabel di tiang yang sama ────────────────────────
-- Satu jurusan bisa dipikul 2-3 kabel. TIANGNYA SATU, kabelnya banyak — jadi
-- underbuild tidak pernah menambah baris di tabel `tiang`.
--
-- `pemilik_gardu_kode` yang membuat KMS tidak dobel: kabel underbuild sering
-- milik gardu LAIN yang menumpang tiang yang sama. Tanpa kolom ini, dua gardu
-- akan sama-sama mengklaim panjang jalur yang sama.

CREATE TABLE IF NOT EXISTS public.jtr_sirkit (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  gardu_kode         TEXT NOT NULL,
  ulp                TEXT NOT NULL,
  jurusan            TEXT NOT NULL,
  nomor              INT  NOT NULL DEFAULT 1,   -- 1 = kabel utama, 2/3 = underbuild

  pemilik_gardu_kode TEXT,      -- NULL = milik gardu jalur ini sendiri
  pemilik_jurusan    TEXT,

  jenis              TEXT,      -- LVTC | Twisted | Telanjang
  ukuran             TEXT,      -- "3x70+50 mm"
  catatan            TEXT,

  created_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.jtr_sirkit DROP CONSTRAINT IF EXISTS jtr_sirkit_jurusan_valid;
ALTER TABLE public.jtr_sirkit ADD CONSTRAINT jtr_sirkit_jurusan_valid
  CHECK (jurusan IN ('A', 'B', 'C', 'D', 'K'));

CREATE UNIQUE INDEX IF NOT EXISTS jtr_sirkit_unik
  ON public.jtr_sirkit (gardu_kode, ulp, jurusan, nomor);

COMMENT ON COLUMN public.jtr_sirkit.pemilik_gardu_kode IS
  'Gardu pemilik kabel ini. Berbeda dari gardu jalur bila kabel underbuild milik gardu lain — inilah yang mencegah panjang dihitung dua kali oleh dua gardu.';

-- Kabel underbuild sering tidak menempuh seluruh jurusan — bisa berhenti di
-- tengah. Tabel sambung ini yang membuat panjang penghantar dihitung tepat,
-- bukan ditaksir "panjang rute × jumlah kabel".
CREATE TABLE IF NOT EXISTS public.tiang_sirkit (
  tiang_id  UUID NOT NULL REFERENCES public.tiang(id)      ON DELETE CASCADE,
  sirkit_id UUID NOT NULL REFERENCES public.jtr_sirkit(id) ON DELETE CASCADE,
  PRIMARY KEY (tiang_id, sirkit_id)
);

CREATE INDEX IF NOT EXISTS tiang_sirkit_sirkit_idx ON public.tiang_sirkit (sirkit_id);

COMMENT ON TABLE public.tiang_sirkit IS
  'Kabel apa saja yang dipikul tiap tiang. Bawaan aplikasi: semua tiang jurusan itu memikul semua kabelnya; inspektor hanya menyesuaikan di tempat kabel underbuild mulai atau berhenti.';

-- ── 5. Label tiang termasuk kabelnya — lihat `jtr-atribut-tiang.sql` ──
-- Definisinya DIPINDAH. Versi di sini bersumber dari `tiang_sirkit`, yang sudah
-- digantikan `tiang_konduktor` sejak konduktor turun ke tiang. Membiarkan dua
-- definisi berarti menjalankan ulang berkas ini akan menarik `tiang_label`
-- kembali ke sumber yang sudah tidak diisi lagi.

-- ── 6. Dua ukuran panjang — lihat `jtr-atribut-tiang.sql` ──
-- Definisinya DIPINDAH, tidak dihapus begitu saja.
--
-- View ini disempurnakan di `jtr-atribut-tiang.sql` — versi di sini sudah tertinggal.
-- Selama dua definisi hidup di dua berkas, menjalankan ulang berkas yang lebih
-- awal akan diam-diam menurunkan view ke bentuk lamanya, dan Postgres pun
-- menolak `CREATE OR REPLACE` begitu susunan kolomnya berubah.
-- Satu view, satu tempat.

-- ── 7. Gardu yang belum bisa diinspeksi ──────────────────────────────────────
-- Karena titik awal adalah titik gardu, gardu tanpa koordinat tidak bisa jadi
-- pangkal pohon. Daftar ini yang dipakai aplikasi untuk menyuruh inspektor
-- menitik gardunya lebih dulu — berdiri di bawah gardu, ambil titik.

CREATE OR REPLACE VIEW public.gardu_tanpa_titik AS
SELECT kode, ulp, nama, alamat, feeder AS penyulang
FROM public.gardu
WHERE lat IS NULL OR lng IS NULL
   OR btrim(lat::text) = '' OR btrim(lng::text) = '';

-- ── 8. Hak baca ──────────────────────────────────────────────────────────────
ALTER TABLE public.jtr_sirkit   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tiang_sirkit ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS auth_all_jtr_sirkit   ON public.jtr_sirkit;
DROP POLICY IF EXISTS auth_all_tiang_sirkit ON public.tiang_sirkit;
CREATE POLICY auth_all_jtr_sirkit   ON public.jtr_sirkit
  FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY auth_all_tiang_sirkit ON public.tiang_sirkit
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

GRANT SELECT ON public.jurusan_ref        TO authenticated;
GRANT SELECT ON public.gardu_tanpa_titik  TO authenticated;

-- =============================================================================
-- Uji penamaan (jalankan lalu ROLLBACK — tidak meninggalkan jejak)
-- =============================================================================
-- BEGIN;
--   INSERT INTO tiang (gardu_kode, ulp, jurusan, lat, lng)
--     VALUES ('AM001','AMPENAN','A', -8.58000, 116.10000);            -- AM001-A1
--
--   INSERT INTO tiang (gardu_kode, ulp, jurusan, induk_id, lat, lng)
--     SELECT 'AM001','AMPENAN','A', id, -8.57960, 116.10000
--     FROM tiang WHERE kode = 'AM001-A1';                             -- AM001-A2  (lurus ke utara)
--
--   INSERT INTO tiang (gardu_kode, ulp, jurusan, induk_id, lat, lng)
--     SELECT 'AM001','AMPENAN','A', id, -8.57920, 116.10000
--     FROM tiang WHERE kode = 'AM001-A2';                             -- AM001-A3  (masih lurus)
--
--   -- jalur BERBELOK ke timur sesudah A3 — tanpa percabangan sama sekali:
--   INSERT INTO tiang (gardu_kode, ulp, jurusan, induk_id, lat, lng)
--     SELECT 'AM001','AMPENAN','A', id, -8.57920, 116.10050
--     FROM tiang WHERE kode = 'AM001-A3';                             -- AM001-A3B1
--
--   INSERT INTO tiang (gardu_kode, ulp, jurusan, induk_id, lat, lng)
--     SELECT 'AM001','AMPENAN','A', id, -8.57920, 116.10100
--     FROM tiang WHERE kode = 'AM001-A3B1';                           -- AM001-A3B2
--
--   SELECT kode FROM tiang WHERE gardu_kode = 'AM001' ORDER BY created_at;
-- ROLLBACK;
--
-- Periksa hasil:
--   SELECT * FROM ulp_jtr_panjang ORDER BY panjang_rute_km DESC;
--   SELECT * FROM gardu_jtr_panjang WHERE jumlah_sirkit > 1;   -- jurusan ber-underbuild
--   SELECT label FROM tiang_label WHERE gardu_kode='AM001' ORDER BY kode_tiang, nomor_sirkit;
-- =============================================================================
