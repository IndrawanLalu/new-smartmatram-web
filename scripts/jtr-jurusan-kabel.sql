-- =============================================================================
-- JTR F2 — kabel membawa jurusan, tiang dilewati beberapa jurusan (8 Okt 2026)
-- `rencana-jtr-jurusan-kabel.md` bagian 5–7 (F2). Jalankan manual di Supabase
-- SQL Editor, SESUDAH `jtr-sambung-per-gardu.sql` (F1). Idempoten.
-- TIDAK mengubah data yang sudah ada — hanya menambah tempat & aturan.
--
-- Keputusan user 8 Okt:
--   • Jurusan JTR = huruf jurusan di PANEL gardu (A–D), bukan arah mata angin.
--   • Tiap jurusan menomori deretnya sendiri. Tiang yang dilewati beberapa
--     jurusan bernama gabungan, urut POSISI KABEL: AM104-A4/B5, AM104-A4/B5/C3.
--   • Jalur kedua dari gardu di jurusan yang sama: C2-2, C3-2, … (C2-3 …).
--   • Dua kabel jurusan yang SAMA di satu tiang: kabel berikutnya tetap `.2`.
--
--   1. tiang_konduktor.jurusan   — jurusan kabel; KOSONG = jurusan tiangnya
--                                  (semua kabel lama, HP lama tetap jalan)
--   2. tiang_kode_jurusan        — "tiang ini dilewati jurusan B juga": nama &
--                                  induk tiang itu DI DERET jurusan B (pola
--                                  `tiang_kode_penyulang` JTM)
--   3. jtr_tiang_jurusan         — satu baris per (tiang, gardu, jurusan)
--   4. jtr_kode_baru             — penamaan per deret jurusan + jalur ke-2 dari
--                                  gardu `C2-2`
--   5. jtr_tiang.kode            — nama gabungan bila tiangnya dilewati
--                                  beberapa jurusan (selain itu tetap)
--   6. jtr_kabel (+jurusan, +dari_gardu), tiang_gawang (+utama),
--      tiang_gawang_kabel, gardu_jtr_panjang, inspeksi_jtr_temuan,
--      usul_asal_kabel_jtr, jtr_ujung_terjauh — membaca jurusan per kabel
--   7. lewatkan_jurusan_jtr / lepas_jurusan_jtr — catat & lepas
--   8. simpan_konduktor_tiang & kirim_tiang_jtr — menerima jurusan per kabel
--      dan `jurusan_lain` per tiang (HP F3); kiriman HP lama tidak berubah
--   9. batal / lepas tumpang / gabung / pindah & ubah jurusan / ubah nama —
--      ikut membawa keanggotaan jurusan
--  10. jtr_kabel_perlu_dipastikan — kabel ke-2 dst. yang jurusannya belum
--      dipastikan (data lama: ditandai, TIDAK ditebak)
--
-- Definisi yang diganti DISALIN dari yang TERPASANG (dibaca lewat `_definisi`
-- 8 Okt 2026), yang baru bertanda ★.
--
-- Aturan sambung bentang (tiang_gawang_kabel.tersambung) hanya BERTAMBAH:
-- semua bentang yang tersambung sekarang tetap tersambung. Data lama tanpa
-- tiang bersama jurusan → KMS, panjang, nama identik dengan sebelum skrip.
-- =============================================================================


-- ── 1. Jurusan per kabel ─────────────────────────────────────────────────────
ALTER TABLE public.tiang_konduktor ADD COLUMN IF NOT EXISTS jurusan TEXT;
ALTER TABLE public.tiang_konduktor DROP CONSTRAINT IF EXISTS tiang_konduktor_jurusan_valid;
ALTER TABLE public.tiang_konduktor ADD CONSTRAINT tiang_konduktor_jurusan_valid
  CHECK (jurusan IS NULL OR jurusan IN ('A', 'B', 'C', 'D'));
COMMENT ON COLUMN public.tiang_konduktor.jurusan IS
  'Jurusan (huruf di panel gardu) yang dibawa kabel ini. KOSONG = jurusan tiangnya di gardu pemilik kabel — semua kabel sebelum 8 Okt 2026.';


-- ── 2. Tiang dilewati jurusan lain dari gardu yang sama ──────────────────────
-- Jurusan UTAMA tiang tetap di `tiang` (milik) / `tiang_jtr_tumpang`
-- (pinjaman). Di sini hanya jurusan TAMBAHAN: nama tiang di deret jurusan itu
-- dan induknya di deret itu (NULL = langsung dari gardu).
CREATE TABLE IF NOT EXISTS public.tiang_kode_jurusan (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tiang_id    UUID NOT NULL REFERENCES public.tiang(id) ON DELETE CASCADE,
  gardu_kode  TEXT NOT NULL,
  ulp         TEXT NOT NULL,
  jurusan     TEXT NOT NULL,
  induk_id    UUID REFERENCES public.tiang(id) ON DELETE SET NULL,
  kode        TEXT,
  status      TEXT NOT NULL DEFAULT 'aktif',
  catatan     TEXT,
  id_hp       UUID UNIQUE,
  dibuat_oleh TEXT,
  dibuat_uid  UUID,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.tiang_kode_jurusan DROP CONSTRAINT IF EXISTS tiang_kode_jurusan_status_valid;
ALTER TABLE public.tiang_kode_jurusan ADD CONSTRAINT tiang_kode_jurusan_status_valid CHECK (status IN ('aktif', 'lepas'));
ALTER TABLE public.tiang_kode_jurusan DROP CONSTRAINT IF EXISTS tiang_kode_jurusan_jurusan_valid;
ALTER TABLE public.tiang_kode_jurusan ADD CONSTRAINT tiang_kode_jurusan_jurusan_valid CHECK (jurusan IN ('A', 'B', 'C', 'D'));
CREATE UNIQUE INDEX IF NOT EXISTS tiang_kode_jurusan_satu
  ON public.tiang_kode_jurusan (tiang_id, upper(gardu_kode), upper(ulp), jurusan) WHERE status = 'aktif';
CREATE UNIQUE INDEX IF NOT EXISTS tiang_kode_jurusan_kode_unik
  ON public.tiang_kode_jurusan (upper(kode), upper(ulp)) WHERE status = 'aktif';
CREATE INDEX IF NOT EXISTS tiang_kode_jurusan_tiang_idx ON public.tiang_kode_jurusan (tiang_id);
CREATE INDEX IF NOT EXISTS tiang_kode_jurusan_induk_idx ON public.tiang_kode_jurusan (induk_id);
CREATE INDEX IF NOT EXISTS tiang_kode_jurusan_gardu_idx ON public.tiang_kode_jurusan (upper(gardu_kode), upper(ulp));

COMMENT ON TABLE public.tiang_kode_jurusan IS
  'Tiang JTR yang dilewati jurusan LAIN dari gardu yang sama (dua jurusan panel searah memakai tiang yang sama). Nama & induk tiang di deret jurusan itu. Jurusan utamanya tetap di tiang / tiang_jtr_tumpang. Satu batang tetap satu data fisik.';

ALTER TABLE public.tiang_kode_jurusan ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tiang_kode_jurusan_baca ON public.tiang_kode_jurusan;
CREATE POLICY tiang_kode_jurusan_baca ON public.tiang_kode_jurusan FOR SELECT TO authenticated USING (true);
GRANT SELECT ON public.tiang_kode_jurusan TO authenticated;
-- Penulisan HANYA lewat fungsi di bawah.


-- ── 3. Satu baris per (tiang, gardu, jurusan) ────────────────────────────────
-- `jtr_tiang` tetap satu baris per (tiang, gardu) — 40-an objek membacanya dan
-- tidak satu pun tiba-tiba menerima baris ganda. Topologi per jurusan dibaca
-- dari sini. Gardu & ULP huruf besar.
CREATE OR REPLACE VIEW public.jtr_tiang_jurusan AS
SELECT t.id, t.kode, upper(t.gardu_kode) AS gardu_kode, upper(t.ulp) AS ulp, t.jurusan,
       COALESCE(t.induk_jtr_id, t.induk_id) AS induk_id,
       t.lat, t.lng, t.status_hidup, t.created_at,
       false AS menumpang, true AS utama, NULL::uuid AS lewat_id
FROM public.tiang t
WHERE t.gardu_kode IS NOT NULL
UNION ALL
SELECT t.id, m.kode, upper(m.gardu_kode), upper(m.ulp), m.jurusan, m.induk_id,
       t.lat, t.lng,
       CASE WHEN m.status = 'aktif' THEN t.status_hidup ELSE 'lepas' END,
       m.created_at, true, true, NULL::uuid
FROM public.tiang_jtr_tumpang m
JOIN public.tiang t ON t.id = m.tiang_id
UNION ALL
SELECT t.id, x.kode, upper(x.gardu_kode), upper(x.ulp), x.jurusan, x.induk_id,
       t.lat, t.lng,
       CASE WHEN x.status = 'aktif' THEN t.status_hidup ELSE 'lepas' END,
       x.created_at, upper(COALESCE(t.gardu_kode, '')) <> upper(x.gardu_kode), false, x.id
FROM public.tiang_kode_jurusan x
JOIN public.tiang t ON t.id = x.tiang_id;

COMMENT ON VIEW public.jtr_tiang_jurusan IS
  'Keanggotaan JTR per (tiang, gardu, jurusan): jurusan utama (tiang / pinjaman) + jurusan yang ikut lewat (tiang_kode_jurusan). kode = nama tiang DI DERET jurusan itu.';
GRANT SELECT ON public.jtr_tiang_jurusan TO authenticated;

-- Seluruh hilir sebuah tiang di satu gardu, lewat induk jurusan mana pun —
-- penjaga induk melingkar.
CREATE OR REPLACE FUNCTION public._jtr_hilir_semua(p_id UUID, p_gardu TEXT)
RETURNS TABLE (id UUID)
LANGUAGE sql STABLE SET search_path = public AS $fn$
  WITH RECURSIVE pohon AS (
    SELECT p_id AS id
    UNION
    SELECT j.id FROM public.jtr_tiang_jurusan j JOIN pohon ON j.induk_id = pohon.id
     WHERE j.gardu_kode = upper(btrim(p_gardu)) AND j.status_hidup = 'aktif'
  )
  SELECT id FROM pohon;
$fn$;


-- ── 4. Penamaan per deret jurusan ────────────────────────────────────────────
-- Aturan lama utuh (pangkal mulai 2, lurus = lanjut nomor, sisipan = huruf,
-- belok = cabang); yang berubah:
--   ★ sumbernya `jtr_tiang_jurusan` — nama di deret jurusan yang diminta;
--   ★ anak/arah dibaca dari jurusan yang sama — A5 yang lurus tidak membuat
--     B5 dari tiang A4/B4 dikira sisipan;
--   ★ pangkal kedua di jurusan yang sama → C2-2 (dulu C2a), jalur ke-3 C2-3;
--     tiang sesudahnya mewarisi akhiran: C3-2, C4-2 …;
--   ★ induk yang TIDAK dilewati jurusan ini (data lama / HP lama) → deret
--     jurusan ini yang dilanjutkan, bukan deret jurusan induknya.
--   ★ tiang BERSAMA (induknya dilewati jurusan lain, atau tiang itu sendiri
--     sedang dicatat dilewati jurusan ini) tidak memakai aturan belok:
--     "A4/B4 → lurus A5, belokannya B5, B6" dan "bertemu di tengah A4/B5"
--     (contoh user 8 Okt) — jurusan yang berpisah/bertemu tetap melanjutkan
--     nomornya, bukan cabang B4B1. Cabang sungguhan (sudah ada anak sejurusan
--     dari induk itu) tetap mengikuti aturan lama.
CREATE OR REPLACE FUNCTION public._jtr_kode_baru(
  p_gardu TEXT, p_ulp TEXT, p_jurusan TEXT, p_induk_id UUID,
  p_lat DOUBLE PRECISION, p_lng DOUBLE PRECISION, p_bersama BOOLEAN
) RETURNS TEXT
LANGUAGE plpgsql STABLE SET search_path = public AS $fn$
DECLARE
  bersama    BOOLEAN := COALESCE(p_bersama, false);
  g          TEXT := upper(p_gardu);
  u          TEXT := upper(p_ulp);
  prefiks    TEXT;
  dasar      TEXT;
  jalur      TEXT := '';
  calon      TEXT;
  jalur_ke   INT;
  nomor_maks INT;
  i_kode     TEXT;
  i_induk    UUID;
  i_lat      DOUBLE PRECISION;
  i_lng      DOUBLE PRECISION;
  i_jur      TEXT;
  a_lat      DOUBLE PRECISION;
  a_lng      DOUBLE PRECISION;
  h_lat      DOUBLE PRECISION;
  h_lng      DOUBLE PRECISION;
  arah_baru  DOUBLE PRECISION;
  arah_lama  DOUBLE PRECISION;
  arah_anak  DOUBLE PRECISION;
  belok      DOUBLE PRECISION;
  selisih    DOUBLE PRECISION;
  huruf      TEXT;
  akhiran    TEXT;
  ada_anak   BOOLEAN := false;
BEGIN
  IF p_induk_id IS NULL THEN
    prefiks := g || '-' || p_jurusan;

    -- ★ Jurusan ini sudah punya jalur dari gardu → jalur berikutnya C2-2 …
    SELECT count(*) INTO jalur_ke FROM public.jtr_tiang_jurusan
    WHERE gardu_kode = g AND ulp = u AND jurusan = p_jurusan
      AND induk_id IS NULL AND status_hidup = 'aktif'
      AND kode ~ ('^' || prefiks || '[0-9]+([a-z]|-[0-9]+)?$');
    IF jalur_ke > 0 THEN
      LOOP
        jalur_ke := jalur_ke + 1;
        calon := prefiks || '2-' || jalur_ke;
        EXIT WHEN NOT EXISTS (SELECT 1 FROM public.jtr_tiang_jurusan
                              WHERE ulp = u AND upper(kode) = upper(calon) AND status_hidup = 'aktif');
      END LOOP;
      RETURN calon;
    END IF;

    SELECT COALESCE(max((regexp_match(kode, '([0-9]+)[a-z]?$'))[1]::int), 0) INTO nomor_maks
    FROM public.jtr_tiang_jurusan
    WHERE gardu_kode = g AND ulp = u AND status_hidup = 'aktif'
      AND kode ~ ('^' || prefiks || '[0-9]+[a-z]?$');
    RETURN prefiks || GREATEST(nomor_maks + 1, 2);
  END IF;

  -- ★ Nama induk DI DERET JURUSAN INI bila induk dilewati jurusan ini.
  SELECT j.kode, j.induk_id, j.lat, j.lng, j.jurusan
    INTO i_kode, i_induk, i_lat, i_lng, i_jur
  FROM public.jtr_tiang_jurusan j
  WHERE j.id = p_induk_id AND j.gardu_kode = g AND j.ulp = u
  ORDER BY (j.jurusan = p_jurusan) DESC NULLS LAST, (j.status_hidup = 'aktif') DESC, j.utama DESC
  LIMIT 1;
  IF i_kode IS NULL THEN RETURN NULL; END IF;

  -- ★ Induk tidak dilewati jurusan ini → lanjutkan deret jurusan ini.
  IF p_jurusan IS NOT NULL AND i_jur IS DISTINCT FROM p_jurusan THEN
    prefiks := g || '-' || p_jurusan;
    SELECT COALESCE(max((regexp_match(kode, '([0-9]+)[a-z]?$'))[1]::int), 0) INTO nomor_maks
    FROM public.jtr_tiang_jurusan
    WHERE gardu_kode = g AND ulp = u AND status_hidup = 'aktif'
      AND kode ~ ('^' || prefiks || '[0-9]+[a-z]?$');
    RETURN prefiks || GREATEST(nomor_maks + 1, 2);
  END IF;

  -- ★ Akhiran jalur (-2, -3 …) diwarisi; nomor & huruf di depannya.
  jalur := COALESCE(substring(i_kode FROM '(-[0-9]+)$'), '');
  dasar := left(i_kode, length(i_kode) - length(jalur));

  arah_baru := public.arah_derajat(i_lat, i_lng, p_lat, p_lng);

  SELECT lat, lng INTO a_lat, a_lng FROM public.jtr_tiang_jurusan
  WHERE induk_id = p_induk_id AND gardu_kode = g AND ulp = u
    AND jurusan IS NOT DISTINCT FROM p_jurusan AND status_hidup = 'aktif'
  ORDER BY created_at LIMIT 1;
  ada_anak := FOUND;

  IF ada_anak AND arah_baru IS NOT NULL THEN
    arah_anak := public.arah_derajat(i_lat, i_lng, a_lat, a_lng);
    IF arah_anak IS NOT NULL THEN
      selisih := abs(arah_baru - arah_anak);
      IF selisih > 180 THEN selisih := 360 - selisih; END IF;
      IF selisih <= 45 THEN
        SELECT chr(97 + count(*)::int) INTO akhiran FROM public.jtr_tiang_jurusan
        WHERE gardu_kode = g AND ulp = u AND status_hidup = 'aktif'
          AND kode ~ ('^' || dasar || '[a-z]' || jalur || '$');
        RETURN dasar || akhiran || jalur;
      END IF;
    END IF;
  END IF;

  -- ★ Tiang bersama tanpa anak sejurusan dari induk ini: lanjut nomor.
  IF NOT ada_anak AND (bersama OR (SELECT count(*) FROM public.jtr_tiang_jurusan
                                    WHERE id = p_induk_id AND gardu_kode = g AND ulp = u AND status_hidup = 'aktif') > 1) THEN
    prefiks := regexp_replace(dasar, '[0-9]+[a-z]?$', '');
    SELECT COALESCE(max((regexp_match(kode, '([0-9]+)[a-z]?' || jalur || '$'))[1]::int), 0) INTO nomor_maks
    FROM public.jtr_tiang_jurusan
    WHERE gardu_kode = g AND ulp = u AND status_hidup = 'aktif'
      AND kode ~ ('^' || prefiks || '[0-9]+[a-z]?' || jalur || '$');
    RETURN prefiks || (nomor_maks + 1) || jalur;
  END IF;

  IF i_induk IS NOT NULL THEN
    SELECT lat, lng INTO h_lat, h_lng FROM public.tiang WHERE id = i_induk;
  ELSE
    SELECT lat, lng INTO h_lat, h_lng FROM public.gardu WHERE upper(kode) = g AND upper(ulp) = u;
  END IF;
  arah_lama := public.arah_derajat(h_lat, h_lng, i_lat, i_lng);

  IF arah_baru IS NOT NULL AND arah_lama IS NOT NULL THEN
    belok := abs(arah_baru - arah_lama);
    IF belok > 180 THEN belok := 360 - belok; END IF;
  END IF;

  IF belok IS NULL OR belok <= 60 THEN
    prefiks := regexp_replace(dasar, '[0-9]+[a-z]?$', '');
  ELSE
    huruf := COALESCE(public.arah_huruf(arah_baru), 'K');
    prefiks := i_kode || CASE WHEN ada_anak THEN '_' ELSE '' END || huruf;
    jalur := '';
  END IF;

  SELECT COALESCE(max((regexp_match(kode, '([0-9]+)[a-z]?' || jalur || '$'))[1]::int), 0) INTO nomor_maks
  FROM public.jtr_tiang_jurusan
  WHERE gardu_kode = g AND ulp = u AND status_hidup = 'aktif'
    AND kode ~ ('^' || prefiks || '[0-9]+[a-z]?' || jalur || '$');
  RETURN prefiks || (nomor_maks + 1) || jalur;
END $fn$;

-- Tanda tangan lama dipertahankan (pemicu tiang & tumpang memanggilnya).
CREATE OR REPLACE FUNCTION public.jtr_kode_baru(
  p_gardu TEXT, p_ulp TEXT, p_jurusan TEXT, p_induk_id UUID,
  p_lat DOUBLE PRECISION, p_lng DOUBLE PRECISION
) RETURNS TEXT
LANGUAGE sql STABLE SET search_path = public AS $fn$
  SELECT public._jtr_kode_baru(p_gardu, p_ulp, p_jurusan, p_induk_id, p_lat, p_lng, false)
$fn$;

CREATE OR REPLACE FUNCTION public.tiang_kode_jurusan_kode()
RETURNS TRIGGER LANGUAGE plpgsql AS $fn$
DECLARE
  la DOUBLE PRECISION;
  lo DOUBLE PRECISION;
BEGIN
  NEW.gardu_kode := upper(btrim(NEW.gardu_kode));
  NEW.ulp := upper(btrim(NEW.ulp));
  NEW.jurusan := upper(btrim(NEW.jurusan));
  IF NEW.kode IS NULL OR btrim(NEW.kode) = '' THEN
    SELECT lat, lng INTO la, lo FROM public.tiang WHERE id = NEW.tiang_id;
    NEW.kode := public._jtr_kode_baru(NEW.gardu_kode, NEW.ulp, NEW.jurusan, NEW.induk_id, la, lo, true);
  END IF;
  RETURN NEW;
END $fn$;
DROP TRIGGER IF EXISTS trg_tiang_kode_jurusan_kode ON public.tiang_kode_jurusan;
CREATE TRIGGER trg_tiang_kode_jurusan_kode BEFORE INSERT ON public.tiang_kode_jurusan
  FOR EACH ROW EXECUTE FUNCTION public.tiang_kode_jurusan_kode();


-- ── 5. Kabel: jurusan efektif ────────────────────────────────────────────────
-- Kolom lama & urutannya sama; dua kolom ditambahkan di BELAKANG.
--   jurusan    = jurusan kabel, atau jurusan tiangnya di gardu pemilik kabel
--   dari_gardu = (dulu harus dibaca dari tiang_konduktor)
CREATE OR REPLACE VIEW public.jtr_kabel AS
 SELECT k.id,
    k.tiang_id,
    k.nomor,
    k.jenis,
    k.ukuran,
    k.kondisi,
    k.pemilik_gardu_kode,
    k.created_at,
    k.updated_at,
    k.induk_tiang_id,
    k.aks_suspension,
    k.aks_large_angle,
    k.aks_dead_end,
    k.foto_temuan,
    upper(COALESCE(k.pemilik_gardu_kode, t.gardu_kode)) AS gardu,
    COALESCE(k.jurusan,
      CASE WHEN k.pemilik_gardu_kode IS NULL THEN t.jurusan
           ELSE (SELECT m.jurusan FROM public.tiang_jtr_tumpang m
                  WHERE m.tiang_id = k.tiang_id AND upper(m.gardu_kode) = upper(k.pemilik_gardu_kode)
                  ORDER BY (m.status = 'aktif') DESC, m.created_at DESC LIMIT 1)
      END) AS jurusan,
    k.dari_gardu
   FROM tiang_konduktor k
     JOIN tiang t ON t.id = k.tiang_id;


-- ── 6. Nama tiang: gabungan bila dilewati beberapa jurusan ───────────────────
-- Urut POSISI KABEL (nomor kabel terkecil tiap jurusan), lalu jurusan utama.
-- Nama pertama utuh, berikutnya tanpa awalan gardu: AM104-A4/B5/C3.
CREATE OR REPLACE FUNCTION public.jtr_nama_gabungan(p_tiang UUID, p_gardu TEXT)
RETURNS TEXT
LANGUAGE sql STABLE SET search_path = public AS $fn$
  SELECT string_agg(
           CASE WHEN s.rn = 1 THEN s.kode
                ELSE regexp_replace(s.kode, '^' || upper(p_gardu) || '-', '', 'i') END,
           '/' ORDER BY s.rn)
  FROM (
    SELECT j.kode,
           row_number() OVER (ORDER BY p.posisi NULLS LAST, j.utama DESC, j.jurusan) AS rn
    FROM public.jtr_tiang_jurusan j
    LEFT JOIN LATERAL (
      SELECT min(k.nomor) AS posisi FROM public.jtr_kabel k
       WHERE k.tiang_id = j.id AND k.gardu = j.gardu_kode AND k.jurusan = j.jurusan
    ) p ON true
    WHERE j.id = p_tiang AND j.gardu_kode = upper(p_gardu)
      AND (j.utama OR j.status_hidup = 'aktif')
  ) s
$fn$;

-- Kolom sama dengan yang terpasang; yang berubah hanya `kode` (★).
CREATE OR REPLACE VIEW public.jtr_tiang AS
 SELECT t.id,
        CASE WHEN EXISTS (SELECT 1 FROM public.tiang_kode_jurusan x
                           WHERE x.tiang_id = t.id AND x.status = 'aktif'
                             AND upper(x.gardu_kode) = upper(t.gardu_kode) AND upper(x.ulp) = upper(t.ulp))
             THEN public.jtr_nama_gabungan(t.id, t.gardu_kode)
             ELSE t.kode END AS kode,
    t.gardu_kode,
    t.ulp,
    t.jurusan,
    COALESCE(t.induk_jtr_id, t.induk_id) AS induk_id,
    t.lat,
    t.lng,
    t.status_hidup,
    t.created_at,
    t.penyulang,
    t.penanda,
    t.percabangan,
    t.jenis,
    t.tinggi,
    t.kondisi,
    t.andongan,
    t.tarikan_sr,
    t.arde_kondisi,
    t.arde_nilai_ohm,
    t.stay_jenis,
    t.stay_kondisi,
    t.rawan_row,
    t.jamperan,
    t.underbuild_tm,
    t.catatan_perbaikan,
    t.foto_temuan,
    t.dikonfirmasi_at,
    false AS menumpang,
    NULL::uuid AS tumpang_id
   FROM tiang t
  WHERE t.gardu_kode IS NOT NULL
UNION ALL
 SELECT t.id,
        CASE WHEN EXISTS (SELECT 1 FROM public.tiang_kode_jurusan x
                           WHERE x.tiang_id = t.id AND x.status = 'aktif'
                             AND upper(x.gardu_kode) = upper(m.gardu_kode) AND upper(x.ulp) = upper(m.ulp))
             THEN public.jtr_nama_gabungan(t.id, m.gardu_kode)
             ELSE m.kode END AS kode,
    upper(m.gardu_kode) AS gardu_kode,
    upper(m.ulp) AS ulp,
    m.jurusan,
    m.induk_id,
    t.lat,
    t.lng,
        CASE
            WHEN m.status = 'aktif'::text THEN t.status_hidup
            ELSE 'lepas'::text
        END AS status_hidup,
    m.created_at,
    t.penyulang,
    t.penanda,
    t.percabangan,
    t.jenis,
    t.tinggi,
    t.kondisi,
    t.andongan,
    t.tarikan_sr,
    t.arde_kondisi,
    t.arde_nilai_ohm,
    t.stay_jenis,
    t.stay_kondisi,
    t.rawan_row,
    t.jamperan,
    t.underbuild_tm,
    t.catatan_perbaikan,
    t.foto_temuan,
    t.dikonfirmasi_at,
    true AS menumpang,
    m.id AS tumpang_id
   FROM tiang_jtr_tumpang m
     JOIN tiang t ON t.id = m.tiang_id;


-- ── 7. Rute: tiap bentang fisik sekali, lewat jurusan mana pun ───────────────
-- ★ Bentang dibaca dari SEMUA keanggotaan jurusan, bentang yang sama (tiang +
-- induk yang sama) dihitung sekali dan dimasukkan ke jurusan utamanya.
-- Gardu & ULP huruf besar (data yang ada memang huruf besar semua).
-- Contoh: B4 → A4/B5 kini ikut rute (dulu hilang karena A4 hanya kenal
-- induk A3). Kolom `utama` ditambahkan di belakang: jumlah tiang per jurusan
-- dihitung dari baris utama saja, supaya satu batang tidak terhitung dua kali.
CREATE OR REPLACE VIEW public.tiang_gawang AS
 SELECT DISTINCT ON (j.id, j.gardu_kode, j.ulp, j.induk_id)
    j.id AS tiang_id,
        CASE WHEN EXISTS (SELECT 1 FROM tiang_kode_jurusan x
                           WHERE x.tiang_id = j.id AND x.status = 'aktif'::text
                             AND upper(x.gardu_kode) = j.gardu_kode AND upper(x.ulp) = j.ulp)
             THEN jtr_nama_gabungan(j.id, j.gardu_kode)
             ELSE j.kode END AS kode,
    j.gardu_kode,
    j.ulp,
    j.jurusan,
    j.induk_id,
    j.induk_id IS NULL AS pangkal,
    jarak_meter(j.lat::double precision, j.lng::double precision, COALESCE(p.lat::double precision, g.lat), COALESCE(p.lng::double precision, g.lng)) AS panjang_m,
    j.utama
   FROM jtr_tiang_jurusan j
     LEFT JOIN tiang p ON p.id = j.induk_id AND p.status_hidup = 'aktif'::text
     LEFT JOIN gardu g ON upper(g.kode) = j.gardu_kode AND upper(g.ulp) = j.ulp
  WHERE j.status_hidup = 'aktif'::text
  ORDER BY j.id, j.gardu_kode, j.ulp, j.induk_id, j.utama DESC, j.jurusan;


-- ── 8. Bentang per kabel: jurusan kabel, induk di deret jurusan kabel ────────
-- ★ jurusan  = jurusan KABEL (dulu jurusan tiang).
-- ★ hulu     = induk tiang di deret jurusan kabel (tiang_kode_jurusan), bila
--              tiangnya dilewati jurusan itu; selain itu induk utama.
-- ★ tersambung bertambah satu jalan (P4): hulu membawa TEPAT SATU kabel gardu
--   + jurusan yang sama. Tiga aturan lama tetap (nomor sama, tepat satu kabel
--   gardu yang sama, asal ditunjuk/dari gardu) — tidak ada bentang yang
--   tadinya tersambung menjadi putus.
CREATE OR REPLACE VIEW public.tiang_gawang_kabel AS
 SELECT t.id AS tiang_id,
    t.kode,
    t.gardu_kode,
    t.ulp,
    k.jurusan,
    k.id AS konduktor_id,
    k.nomor AS nomor_kabel,
    k.jenis,
    k.ukuran,
        CASE
            WHEN k.dari_gardu THEN NULL::uuid
            ELSE COALESCE(k.induk_tiang_id, ij.induk)
        END AS hulu_id,
    k.induk_tiang_id IS NOT NULL OR k.dari_gardu AS hulu_ditunjuk,
    jarak_meter(t.lat::double precision, t.lng::double precision, COALESCE(h.lat::double precision, g.lat), COALESCE(h.lng::double precision, g.lng)) AS panjang_m,
    k.dari_gardu OR COALESCE(k.induk_tiang_id, ij.induk) IS NULL OR k.induk_tiang_id IS NOT NULL
      OR (EXISTS ( SELECT 1
           FROM jtr_kabel kp
          WHERE kp.tiang_id = ij.induk AND kp.nomor = k.nomor AND kp.gardu = upper(t.gardu_kode)))
      OR (( SELECT count(*) AS count
           FROM jtr_kabel kp
          WHERE kp.tiang_id = ij.induk AND kp.gardu = upper(t.gardu_kode))) = 1
      OR (( SELECT count(*) AS count
           FROM jtr_kabel kp
          WHERE kp.tiang_id = ij.induk AND kp.gardu = upper(t.gardu_kode) AND kp.jurusan = k.jurusan)) = 1 AS tersambung
   FROM jtr_tiang t
     JOIN jtr_kabel k ON k.tiang_id = t.id AND k.gardu = upper(t.gardu_kode)
     LEFT JOIN tiang_kode_jurusan x ON x.tiang_id = t.id AND x.status = 'aktif'::text
          AND upper(x.gardu_kode) = upper(t.gardu_kode) AND upper(x.ulp) = upper(t.ulp)
          AND x.jurusan = k.jurusan AND x.jurusan IS DISTINCT FROM t.jurusan
     CROSS JOIN LATERAL ( SELECT CASE WHEN x.id IS NOT NULL THEN x.induk_id ELSE t.induk_id END AS induk) ij
     LEFT JOIN tiang h ON h.id =
        CASE
            WHEN k.dari_gardu THEN NULL::uuid
            ELSE COALESCE(k.induk_tiang_id, ij.induk)
        END AND h.status_hidup = 'aktif'::text
     LEFT JOIN gardu g ON upper(g.kode) = upper(t.gardu_kode) AND upper(g.ulp) = upper(t.ulp)
  WHERE t.status_hidup = 'aktif'::text AND t.gardu_kode IS NOT NULL;


-- ── 9. Panjang per gardu-jurusan ─────────────────────────────────────────────
-- Kolom sama. Yang berubah (★):
--   • penghantar & gawang terputus per jurusan KABEL;
--   • jumlah_kabel = kabel jurusan itu yang berjalan sejajar (terbanyak di satu
--     tiang), bukan nomor kabel terbesar — nomor = posisi di batang, kabel
--     jurusan B yang lewat tiang A tercatat ke-2 padahal B hanya satu kabel;
--   • jumlah_tiang = tiang yang jurusan UTAMA-nya jurusan itu;
--   • jurusan yang hanya ada lewat kabel (belum punya tiang sendiri) tetap
--     muncul.
CREATE OR REPLACE VIEW public.gardu_jtr_panjang AS
 WITH rute AS (
         SELECT tiang_gawang.gardu_kode,
            tiang_gawang.ulp,
            tiang_gawang.jurusan,
            count(*) FILTER (WHERE tiang_gawang.utama) AS jumlah_tiang,
            sum(tiang_gawang.panjang_m) AS panjang_m,
            avg(tiang_gawang.panjang_m) AS rata_m,
            max(tiang_gawang.panjang_m) AS maks_m,
            count(*) FILTER (WHERE tiang_gawang.panjang_m IS NULL) AS gawang_tanpa_titik
           FROM tiang_gawang
          GROUP BY tiang_gawang.gardu_kode, tiang_gawang.ulp, tiang_gawang.jurusan
        ), tanpa_kabel AS (
         SELECT t.gardu_kode,
            t.ulp,
            t.jurusan,
            count(*) AS jml
           FROM jtr_tiang t
          WHERE t.status_hidup = 'aktif'::text AND t.gardu_kode IS NOT NULL AND NOT (EXISTS ( SELECT 1
                   FROM jtr_kabel k
                  WHERE k.tiang_id = t.id AND k.gardu = upper(t.gardu_kode)))
          GROUP BY t.gardu_kode, t.ulp, t.jurusan
        ), per_tiang AS (
         SELECT tiang_gawang_kabel.gardu_kode,
            tiang_gawang_kabel.ulp,
            tiang_gawang_kabel.jurusan,
            count(*) AS n,
            sum(tiang_gawang_kabel.panjang_m) FILTER (WHERE tiang_gawang_kabel.tersambung) AS panjang_m,
            count(*) FILTER (WHERE NOT tiang_gawang_kabel.tersambung) AS putus
           FROM tiang_gawang_kabel
          GROUP BY tiang_gawang_kabel.gardu_kode, tiang_gawang_kabel.ulp, tiang_gawang_kabel.jurusan, tiang_gawang_kabel.tiang_id
        ), penghantar AS (
         SELECT per_tiang.gardu_kode,
            per_tiang.ulp,
            per_tiang.jurusan,
            max(per_tiang.n) AS jumlah_kabel,
            sum(per_tiang.panjang_m) AS panjang_m,
            sum(per_tiang.putus)::bigint AS gawang_terputus
           FROM per_tiang
          GROUP BY per_tiang.gardu_kode, per_tiang.ulp, per_tiang.jurusan
        ), kunci AS (
         SELECT rute.gardu_kode, rute.ulp, rute.jurusan FROM rute
        UNION
         SELECT penghantar.gardu_kode, penghantar.ulp, penghantar.jurusan FROM penghantar
        )
 SELECT c.gardu_kode,
    c.ulp,
    c.jurusan,
    j.arah AS arah_jurusan,
    COALESCE(r.jumlah_tiang, 0::bigint) AS jumlah_tiang,
    COALESCE(p.jumlah_kabel::integer, 0) AS jumlah_kabel,
    round((COALESCE(r.panjang_m, 0::double precision) / 1000::double precision)::numeric, 3) AS panjang_rute_km,
    round((COALESCE(p.panjang_m, r.panjang_m) / 1000::double precision)::numeric, 3) AS panjang_penghantar_km,
    round(r.rata_m::numeric, 1) AS rata_gawang_m,
    round(r.maks_m::numeric, 1) AS gawang_terpanjang_m,
    COALESCE(r.gawang_tanpa_titik, 0::bigint) AS gawang_tanpa_titik,
    COALESCE(tk.jml, 0::bigint) AS tiang_tanpa_kabel,
    COALESCE(p.gawang_terputus, 0::bigint) AS gawang_terputus
   FROM kunci c
     LEFT JOIN rute r ON r.gardu_kode = c.gardu_kode AND r.ulp = c.ulp AND COALESCE(r.jurusan, '') = COALESCE(c.jurusan, '')
     LEFT JOIN penghantar p ON p.gardu_kode = c.gardu_kode AND p.ulp = c.ulp AND COALESCE(p.jurusan, '') = COALESCE(c.jurusan, '')
     LEFT JOIN tanpa_kabel tk ON tk.gardu_kode = c.gardu_kode AND tk.ulp = c.ulp AND COALESCE(tk.jurusan, '') = COALESCE(c.jurusan, '')
     LEFT JOIN jurusan_ref j ON j.kode = c.jurusan;


-- ── 10. Temuan: label kabel per jurusan ──────────────────────────────────────
-- ★ Temuan kabel memakai nama tiang DI DERET jurusan kabelnya (AM104-B5, bukan
--   AM104-A4/B5), dan `.2` hanya untuk kabel kedua dari jurusan yang SAMA di
--   tiang itu (keputusan user). Dulu `.N` = nomor kabel → kabel AM104 yang
--   tercatat ke-2 karena kabel gardu lain di posisi 1 ikut berlabel `.2`.
-- ★ jurusan baris kabel = jurusan kabel. Bagian tiang tidak berubah.
CREATE OR REPLACE VIEW public.inspeksi_jtr_temuan AS
 WITH dasar AS (
         SELECT i.id AS inspeksi_id,
            i.gardu_kode,
            i.ulp,
            i.penyulang,
            i.tgl_mulai,
            t.id AS tiang_id,
            COALESCE(a.kode, t.kode) AS tiang_kode,
            COALESCE(a.jurusan, t.jurusan) AS jurusan,
            t.kondisi,
            t.arde_kondisi,
            t.andongan,
            t.rawan_row,
            t.stay_kondisi,
            t.jamperan,
            t.catatan_perbaikan,
            t.foto_temuan
           FROM inspeksi_jtr i
             JOIN inspeksi_jtr_titik x ON x.inspeksi_id = i.id
             JOIN tiang t ON t.id = x.tiang_id
             LEFT JOIN jtr_tiang a ON a.id = x.tiang_id AND upper(a.gardu_kode) = upper(i.gardu_kode) AND upper(a.ulp) = upper(i.ulp)
          WHERE i.status <> 'Dibatalkan'::text
        ), kabel AS (
         SELECT d.inspeksi_id,
            d.gardu_kode,
            d.ulp,
            d.penyulang,
            d.tgl_mulai,
            d.tiang_id,
            k.jurusan,
                CASE
                    WHEN u.ke = 1 THEN COALESCE(n.kode, d.tiang_kode)
                    ELSE (COALESCE(n.kode, d.tiang_kode) || '.'::text) || u.ke
                END AS tiang_kode,
            k.kondisi AS kabel_kondisi,
            k.aks_suspension,
            k.aks_large_angle,
            k.aks_dead_end,
            k.foto_temuan
           FROM dasar d
             JOIN jtr_kabel k ON k.tiang_id = d.tiang_id AND k.gardu = upper(d.gardu_kode)
             LEFT JOIN LATERAL ( SELECT j.kode
                   FROM jtr_tiang_jurusan j
                  WHERE j.id = d.tiang_id AND j.gardu_kode = k.gardu AND j.jurusan = k.jurusan
                  ORDER BY (j.status_hidup = 'aktif'::text) DESC, j.utama DESC
                 LIMIT 1) n ON true
             CROSS JOIN LATERAL ( SELECT count(*) + 1 AS ke
                   FROM jtr_kabel k2
                  WHERE k2.tiang_id = k.tiang_id AND k2.gardu = k.gardu AND NOT k2.jurusan IS DISTINCT FROM k.jurusan AND k2.nomor < k.nomor) u
        )
 SELECT inspeksi_id,
    tiang_id,
    tiang_kode,
    gardu_kode,
    ulp,
    penyulang,
    jurusan,
    tgl_mulai,
    temuan,
    urgensi,
    foto_url
   FROM ( SELECT dasar.inspeksi_id,
            dasar.tiang_id,
            dasar.tiang_kode,
            dasar.gardu_kode,
            dasar.ulp,
            dasar.penyulang,
            dasar.jurusan,
            dasar.tgl_mulai,
            'Tiang '::text || lower(dasar.kondisi) AS temuan,
                CASE
                    WHEN dasar.kondisi = 'Miring'::text THEN 'Sedang'::text
                    ELSE 'Tinggi'::text
                END AS urgensi,
            dasar.foto_temuan ->> 'kondisi'::text AS foto_url
           FROM dasar
          WHERE dasar.kondisi IS NOT NULL AND NOT jtr_normal('kondisi_tiang'::text, dasar.kondisi)
        UNION ALL
         SELECT dasar.inspeksi_id,
            dasar.tiang_id,
            dasar.tiang_kode,
            dasar.gardu_kode,
            dasar.ulp,
            dasar.penyulang,
            dasar.jurusan,
            dasar.tgl_mulai,
            'Arde '::text || lower(dasar.arde_kondisi),
            'Tinggi'::text AS text,
            dasar.foto_temuan ->> 'ardeKondisi'::text
           FROM dasar
          WHERE dasar.arde_kondisi IS NOT NULL AND NOT jtr_normal('kondisi_arde'::text, dasar.arde_kondisi)
        UNION ALL
         SELECT dasar.inspeksi_id,
            dasar.tiang_id,
            dasar.tiang_kode,
            dasar.gardu_kode,
            dasar.ulp,
            dasar.penyulang,
            dasar.jurusan,
            dasar.tgl_mulai,
            'Andongan '::text || lower(dasar.andongan),
            'Sedang'::text AS text,
            dasar.foto_temuan ->> 'andongan'::text
           FROM dasar
          WHERE dasar.andongan IS NOT NULL AND NOT jtr_normal('kondisi_andongan'::text, dasar.andongan)
        UNION ALL
         SELECT dasar.inspeksi_id,
            dasar.tiang_id,
            dasar.tiang_kode,
            dasar.gardu_kode,
            dasar.ulp,
            dasar.penyulang,
            dasar.jurusan,
            dasar.tgl_mulai,
            'Stay '::text || lower(dasar.stay_kondisi),
            'Sedang'::text AS text,
            dasar.foto_temuan ->> 'stayKondisi'::text
           FROM dasar
          WHERE dasar.stay_kondisi IS NOT NULL AND NOT jtr_normal('kondisi_stay'::text, dasar.stay_kondisi)
        UNION ALL
         SELECT dasar.inspeksi_id,
            dasar.tiang_id,
            dasar.tiang_kode,
            dasar.gardu_kode,
            dasar.ulp,
            dasar.penyulang,
            dasar.jurusan,
            dasar.tgl_mulai,
            'Rawan ROW: '::text || lower(r.r),
            'Sedang'::text AS text,
            dasar.foto_temuan ->> 'rawanRow'::text
           FROM dasar,
            LATERAL unnest(dasar.rawan_row) r(r)
          WHERE r.r IS NOT NULL AND r.r <> ''::text AND NOT jtr_normal('rawan_row'::text, r.r)
        UNION ALL
         SELECT dasar.inspeksi_id,
            dasar.tiang_id,
            dasar.tiang_kode,
            dasar.gardu_kode,
            dasar.ulp,
            dasar.penyulang,
            dasar.jurusan,
            dasar.tgl_mulai,
            'Jamperan '::text || lower(j.value ->> 'kondisi'::text),
            'Sedang'::text AS text,
            dasar.foto_temuan ->> 'jamperanKondisi'::text
           FROM dasar,
            LATERAL jsonb_array_elements(dasar.jamperan) j(value)
          WHERE (j.value ->> 'kondisi'::text) IS NOT NULL AND NOT jtr_normal('kondisi_jamperan'::text, j.value ->> 'kondisi'::text)
        UNION ALL
         SELECT dasar.inspeksi_id,
            dasar.tiang_id,
            dasar.tiang_kode,
            dasar.gardu_kode,
            dasar.ulp,
            dasar.penyulang,
            dasar.jurusan,
            dasar.tgl_mulai,
            'Ada catatan perbaikan'::text AS text,
            'Sedang'::text AS text,
            NULL::text AS text
           FROM dasar
          WHERE btrim(COALESCE(dasar.catatan_perbaikan, ''::text)) <> ''::text
        UNION ALL
         SELECT kabel.inspeksi_id,
            kabel.tiang_id,
            kabel.tiang_kode,
            kabel.gardu_kode,
            kabel.ulp,
            kabel.penyulang,
            kabel.jurusan,
            kabel.tgl_mulai,
            'Konduktor '::text || lower(kabel.kabel_kondisi),
                CASE
                    WHEN kabel.kabel_kondisi = 'Putus'::text THEN 'Tinggi'::text
                    ELSE 'Sedang'::text
                END AS "case",
            kabel.foto_temuan ->> 'konduktorKondisi'::text
           FROM kabel
          WHERE kabel.kabel_kondisi IS NOT NULL AND NOT jtr_normal('kondisi_kabel'::text, kabel.kabel_kondisi)
        UNION ALL
         SELECT kabel.inspeksi_id,
            kabel.tiang_id,
            kabel.tiang_kode,
            kabel.gardu_kode,
            kabel.ulp,
            kabel.penyulang,
            kabel.jurusan,
            kabel.tgl_mulai,
            'Suspension '::text || lower(kabel.aks_suspension),
            'Sedang'::text AS text,
            kabel.foto_temuan ->> 'aksSuspension'::text
           FROM kabel
          WHERE kabel.aks_suspension IS NOT NULL AND NOT jtr_normal('kondisi_aksesoris'::text, kabel.aks_suspension)
        UNION ALL
         SELECT kabel.inspeksi_id,
            kabel.tiang_id,
            kabel.tiang_kode,
            kabel.gardu_kode,
            kabel.ulp,
            kabel.penyulang,
            kabel.jurusan,
            kabel.tgl_mulai,
            'Large angle '::text || lower(kabel.aks_large_angle),
            'Sedang'::text AS text,
            kabel.foto_temuan ->> 'aksLargeAngle'::text
           FROM kabel
          WHERE kabel.aks_large_angle IS NOT NULL AND NOT jtr_normal('kondisi_aksesoris'::text, kabel.aks_large_angle)
        UNION ALL
         SELECT kabel.inspeksi_id,
            kabel.tiang_id,
            kabel.tiang_kode,
            kabel.gardu_kode,
            kabel.ulp,
            kabel.penyulang,
            kabel.jurusan,
            kabel.tgl_mulai,
            'Dead end '::text || lower(kabel.aks_dead_end),
            'Sedang'::text AS text,
            kabel.foto_temuan ->> 'aksDeadEnd'::text
           FROM kabel
          WHERE kabel.aks_dead_end IS NOT NULL AND NOT jtr_normal('kondisi_aksesoris'::text, kabel.aks_dead_end)) s;


-- ── 11. Kabel yang jurusannya belum dipastikan ───────────────────────────────
-- Data lama: dua kabel gardu yang sama di satu tiang, keduanya tanpa jurusan
-- → kabel ke-2 dst. dianggap jurusan tiangnya, tapi BELUM DIPASTIKAN (bisa
-- jurusan lain yang lewat). Tidak ditebak; dibetulkan admin/regu. Begitu
-- jurusannya tercatat, kabel itu keluar dari daftar ini.
CREATE OR REPLACE VIEW public.jtr_kabel_perlu_dipastikan AS
SELECT k.gardu AS gardu_kode,
       upper(t.ulp) AS ulp,
       k.tiang_id,
       t.kode AS tiang_kode,
       k.id AS konduktor_id,
       k.nomor AS nomor_kabel,
       k.jurusan AS jurusan_dianggap
FROM public.jtr_kabel k
JOIN public.tiang_konduktor kk ON kk.id = k.id AND kk.jurusan IS NULL
JOIN public.jtr_tiang t ON t.id = k.tiang_id AND upper(t.gardu_kode) = k.gardu AND t.status_hidup = 'aktif'
WHERE EXISTS (SELECT 1 FROM public.jtr_kabel k2
              WHERE k2.tiang_id = k.tiang_id AND k2.gardu = k.gardu
                AND k2.jurusan IS NOT DISTINCT FROM k.jurusan AND k2.nomor < k.nomor);
COMMENT ON VIEW public.jtr_kabel_perlu_dipastikan IS
  'Kabel ke-2 dst. dari jurusan yang sama di satu tiang yang jurusannya belum pernah dicatat (data sebelum 8 Okt 2026). Dianggap jurusan tiangnya sampai dipastikan.';
GRANT SELECT ON public.jtr_kabel_perlu_dipastikan TO authenticated;


-- ── 12. Usulan asal kabel: sejurusan kabel ───────────────────────────────────
-- Disalin dari jtr-asal-kabel.sql. ★ Calon = tiang yang membawa kabel gardu +
-- JURUSAN KABEL yang sama (dulu: nomor yang sama), bukan di hilirnya (lewat
-- induk jurusan mana pun). Kolom `jurusan` = jurusan kabel.
CREATE OR REPLACE FUNCTION public.usul_asal_kabel_jtr(p_gardu TEXT, p_ulp TEXT)
RETURNS TABLE (
  tiang_id UUID, tiang_kode TEXT, jurusan TEXT, nomor_kabel INT,
  usul_tiang_id UUID, usul_kode TEXT, usul_dari_gardu BOOLEAN, jarak_m NUMERIC
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH RECURSIVE jar AS (
    SELECT DISTINCT ON (j.id) j.id, j.kode, j.lat, j.lng
    FROM public.jtr_tiang j
    WHERE upper(j.gardu_kode) = upper(p_gardu) AND upper(j.ulp) = upper(p_ulp) AND j.status_hidup = 'aktif'
    ORDER BY j.id, j.menumpang
  ), sisi AS (
    SELECT DISTINCT j.id, j.induk_id FROM public.jtr_tiang_jurusan j
    WHERE j.gardu_kode = upper(p_gardu) AND j.ulp = upper(p_ulp) AND j.status_hidup = 'aktif'
  ), putus AS (
    SELECT DISTINCT gk.tiang_id, gk.nomor_kabel, gk.jurusan, j.kode, j.lat, j.lng
    FROM public.tiang_gawang_kabel gk
    JOIN jar j ON j.id = gk.tiang_id
    WHERE NOT gk.tersambung AND upper(gk.gardu_kode) = upper(p_gardu) AND upper(gk.ulp) = upper(p_ulp)
  ), hilir AS (
    SELECT p.tiang_id AS akar, p.tiang_id AS id FROM putus p
    UNION
    SELECT h.akar, s.id FROM hilir h JOIN sisi s ON s.induk_id = h.id
  ), calon AS (
    SELECT DISTINCT ON (p.tiang_id, p.nomor_kabel)
           p.tiang_id, p.nomor_kabel, j.id AS usul_id, j.kode AS usul_kode,
           public.jarak_meter(p.lat, p.lng, j.lat, j.lng) AS m
    FROM putus p
    JOIN public.jtr_kabel k ON k.gardu = upper(p_gardu) AND k.jurusan IS NOT DISTINCT FROM p.jurusan
    JOIN jar j ON j.id = k.tiang_id AND j.lat IS NOT NULL
    WHERE j.id <> p.tiang_id
      AND NOT EXISTS (SELECT 1 FROM hilir h WHERE h.akar = p.tiang_id AND h.id = j.id)
    ORDER BY p.tiang_id, p.nomor_kabel, public.jarak_meter(p.lat, p.lng, j.lat, j.lng), (k.nomor = p.nomor_kabel) DESC
  ), g AS (
    SELECT lat, lng FROM public.gardu
    WHERE upper(kode) = upper(p_gardu) AND upper(ulp) = upper(p_ulp) AND lat IS NOT NULL LIMIT 1
  )
  SELECT p.tiang_id, p.kode, p.jurusan, p.nomor_kabel,
         CASE WHEN dg.m IS NULL OR c.m <= dg.m THEN c.usul_id END,
         CASE WHEN dg.m IS NULL OR c.m <= dg.m THEN c.usul_kode END,
         (dg.m IS NOT NULL AND (c.usul_id IS NULL OR dg.m < c.m)),
         round((CASE WHEN dg.m IS NOT NULL AND (c.usul_id IS NULL OR dg.m < c.m) THEN dg.m ELSE c.m END)::numeric, 0)
  FROM putus p
  LEFT JOIN calon c ON c.tiang_id = p.tiang_id AND c.nomor_kabel = p.nomor_kabel
  LEFT JOIN LATERAL (SELECT public.jarak_meter(p.lat, p.lng, g.lat, g.lng) AS m FROM g) dg ON true
  ORDER BY p.kode, p.nomor_kabel
$$;
GRANT EXECUTE ON FUNCTION public.usul_asal_kabel_jtr(TEXT, TEXT) TO authenticated;


-- ── 13. Ujung terjauh per jurusan (tegangan ujung) ───────────────────────────
-- Disalin dari yang terpasang. ★ Berjalan di deret TIAP jurusan, termasuk
-- jurusan yang hanya lewat tiang jurusan lain (A2/B2 → B mulai di sana).
-- Dari satu tiang hanya diikuti anak jurusan yang sama, kecuali data lama:
-- anak berjurusan lain dari induk yang TIDAK dilewati jurusan anak itu tetap
-- diikuti seperti dulu (hasil data lama tidak berubah).
CREATE OR REPLACE FUNCTION public.jtr_ujung_terjauh(p_ulp text, p_gardu text DEFAULT NULL::text)
 RETURNS TABLE(gardu_kode text, ulp text, jurusan text, tiang_id uuid, tiang_kode text, panjang_jaringan_m numeric, lat double precision, lng double precision)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  WITH RECURSIVE sisi AS (
    SELECT j.id, j.gardu_kode AS gardu, j.ulp AS u, j.jurusan AS jur, j.induk_id, j.kode, j.utama,
           public.jarak_meter(j.lat::double precision, j.lng::double precision,
                              COALESCE(p.lat::double precision, g.lat), COALESCE(p.lng::double precision, g.lng)) AS panjang_m
    FROM public.jtr_tiang_jurusan j
    LEFT JOIN public.tiang p ON p.id = j.induk_id AND p.status_hidup = 'aktif'
    LEFT JOIN public.gardu g ON upper(g.kode) = j.gardu_kode AND upper(g.ulp) = j.ulp
    WHERE j.status_hidup = 'aktif'
      AND j.ulp = upper(btrim(p_ulp))
      AND (p_gardu IS NULL OR j.gardu_kode = upper(btrim(p_gardu)))
  ), jalur AS (
    SELECT s.gardu, s.u, s.jur, s.id, s.kode, COALESCE(s.panjang_m, 0) AS m, ARRAY[s.id] AS lewat
    FROM sisi s
    WHERE s.induk_id IS NULL
    UNION ALL
    SELECT j.gardu, j.u, j.jur, c.id, c.kode, j.m + COALESCE(c.panjang_m, 0), j.lewat || c.id
    FROM jalur j
    JOIN sisi c ON c.induk_id = j.id AND c.gardu = j.gardu AND c.u = j.u
    WHERE NOT c.id = ANY (j.lewat) AND cardinality(j.lewat) < 5000
      AND (c.jur IS NOT DISTINCT FROM j.jur
           OR (c.utama
               AND NOT EXISTS (SELECT 1 FROM sisi x WHERE x.id = c.id AND x.jur IS NOT DISTINCT FROM j.jur)
               -- Induk yang tercatat dilewati KEDUA jurusan = tiang bersama:
               -- anaknya ikut deret jurusannya sendiri, tidak menyeberang.
               AND NOT (EXISTS (SELECT 1 FROM sisi y WHERE y.id = j.id AND y.jur IS NOT DISTINCT FROM c.jur)
                        AND EXISTS (SELECT 1 FROM sisi z WHERE z.id = j.id AND z.jur IS NOT DISTINCT FROM j.jur))))
  )
  SELECT DISTINCT ON (j.gardu, j.u, j.jur)
    j.gardu, j.u, j.jur, j.id, j.kode, round(j.m::numeric, 1), t.lat::double precision, t.lng::double precision
  FROM jalur j
  JOIN public.tiang t ON t.id = j.id
  WHERE j.jur IS NOT NULL
  ORDER BY j.gardu, j.u, j.jur, j.m DESC;
$function$;


-- ── 14. Mencatat & melepas "dilewati jurusan lain" ───────────────────────────
-- HP (kiriman F3, `jurusan_lain`) dan web (F4). Idempoten: jurusan yang sudah
-- tercatat di tiang itu dipulangkan apa adanya.
CREATE OR REPLACE FUNCTION public.lewatkan_jurusan_jtr(
  p_tiang_id UUID,
  p_gardu    TEXT,
  p_jurusan  TEXT,
  p_induk_id UUID DEFAULT NULL,   -- tiang sebelumnya di deret jurusan ini; NULL = langsung dari gardu
  p_nama     TEXT DEFAULT NULL,
  p_id_hp    UUID DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  g      TEXT := upper(btrim(COALESCE(p_gardu, '')));
  jur    TEXT := upper(btrim(COALESCE(p_jurusan, '')));
  v_role TEXT;
  v_unit TEXT;
  t_kode TEXT;
  t_ulp  TEXT;
  t_jur  TEXT;
  i_kode TEXT;
  v_id   UUID;
  v_kode TEXT;
BEGIN
  SELECT role, unit INTO v_role, v_unit FROM public.user_roles WHERE user_id = auth.uid();
  IF v_role IS NULL THEN
    RAISE EXCEPTION 'Sesi tidak dikenali server. Keluar lalu masuk lagi, kemudian kirim ulang — isian tetap tersimpan di HP.';
  END IF;
  IF jur NOT IN ('A', 'B', 'C', 'D') THEN
    RAISE EXCEPTION 'Jurusan % tidak dikenal — pilih huruf jurusan di panel gardu (A–D).', COALESCE(NULLIF(jur, ''), '-');
  END IF;

  IF p_id_hp IS NOT NULL THEN
    SELECT id, kode INTO v_id, v_kode FROM public.tiang_kode_jurusan WHERE id_hp = p_id_hp;
    IF v_id IS NOT NULL THEN
      RETURN jsonb_build_object('lewat_id', v_id, 'kode', v_kode, 'sudah_ada', true);
    END IF;
  END IF;

  SELECT j.kode, j.ulp, j.jurusan INTO t_kode, t_ulp, t_jur
  FROM public.jtr_tiang_jurusan j
  WHERE j.id = p_tiang_id AND j.gardu_kode = g AND j.utama AND j.status_hidup = 'aktif'
  LIMIT 1;
  IF t_kode IS NULL THEN
    RAISE EXCEPTION 'Tiang ini belum bagian jaringan gardu % — catat (atau tumpangi) dulu tiangnya di gardu itu.', g;
  END IF;
  IF v_role <> 'UP3' AND upper(COALESCE(v_unit, '')) <> t_ulp THEN
    RAISE EXCEPTION 'Gardu ini milik ULP %, akun ini ULP %.', t_ulp, COALESCE(v_unit, '-');
  END IF;
  IF t_jur = jur THEN
    RAISE EXCEPTION 'Tiang % memang tiang jurusan % gardu %.', t_kode, jur, g;
  END IF;

  SELECT id, kode INTO v_id, v_kode FROM public.tiang_kode_jurusan
  WHERE tiang_id = p_tiang_id AND upper(gardu_kode) = g AND upper(ulp) = t_ulp AND jurusan = jur AND status = 'aktif';
  IF v_id IS NOT NULL THEN
    RETURN jsonb_build_object('lewat_id', v_id, 'kode', v_kode, 'sudah_ada', true);
  END IF;

  IF p_induk_id IS NOT NULL THEN
    IF p_induk_id = p_tiang_id THEN RAISE EXCEPTION 'Tiang % tidak bisa jadi induknya sendiri.', t_kode; END IF;
    SELECT j.kode INTO i_kode FROM public.jtr_tiang_jurusan j
    WHERE j.id = p_induk_id AND j.gardu_kode = g AND j.ulp = t_ulp AND j.status_hidup = 'aktif'
    ORDER BY (j.jurusan = jur) DESC, j.utama DESC LIMIT 1;
    IF i_kode IS NULL THEN RAISE EXCEPTION 'Tiang sebelumnya bukan bagian jaringan gardu %.', g; END IF;
    IF p_induk_id IN (SELECT id FROM public._jtr_hilir_semua(p_tiang_id, g)) THEN
      RAISE EXCEPTION 'Induk melingkar: % ada di sesudah tiang %.', i_kode, t_kode;
    END IF;
  END IF;

  INSERT INTO public.tiang_kode_jurusan (tiang_id, gardu_kode, ulp, jurusan, induk_id, id_hp, dibuat_oleh, dibuat_uid)
  VALUES (p_tiang_id, g, t_ulp, jur, p_induk_id, p_id_hp, p_nama, auth.uid())
  RETURNING id, kode INTO v_id, v_kode;

  INSERT INTO public.master_audit
    (entitas, entitas_kode, ulp, field, nilai_lama, nilai_baru, aksi, oleh_uid, oleh_nama)
  VALUES ('tiang', t_kode, t_ulp, 'jurusan_lewat', NULL,
          jsonb_build_object('gardu', g, 'jurusan', jur, 'nama', v_kode,
                             'induk', COALESCE(i_kode, '(gardu)'), 'tiang_id', p_tiang_id),
          'koreksi_lapangan', auth.uid(), p_nama);

  RETURN jsonb_build_object('lewat_id', v_id, 'kode', v_kode, 'sudah_ada', false,
    'label', (SELECT kode FROM public.jtr_tiang WHERE id = p_tiang_id AND upper(gardu_kode) = g ORDER BY menumpang LIMIT 1));
END $fn$;

CREATE OR REPLACE FUNCTION public.lepas_jurusan_jtr(p_lewat_id UUID, p_alasan TEXT, p_nama TEXT DEFAULT NULL)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  x   RECORD;
  jml INT;
BEGIN
  IF btrim(COALESCE(p_alasan, '')) = '' THEN RAISE EXCEPTION 'Alasan wajib diisi.'; END IF;
  SELECT * INTO x FROM public.tiang_kode_jurusan WHERE id = p_lewat_id AND status = 'aktif';
  IF NOT FOUND THEN RAISE EXCEPTION 'Jurusan ini tidak tercatat di tiang itu, atau sudah dilepas.'; END IF;
  PERFORM public.wajib_kerja_ulp(x.ulp);

  SELECT count(*) INTO jml FROM public.jtr_tiang_jurusan
  WHERE induk_id = x.tiang_id AND gardu_kode = upper(x.gardu_kode) AND ulp = upper(x.ulp)
    AND jurusan = x.jurusan AND status_hidup = 'aktif';
  IF jml > 0 THEN
    RAISE EXCEPTION 'Tiang % masih menyuplai % tiang jurusan %. Pindahkan dulu sambungannya.', x.kode, jml, x.jurusan;
  END IF;
  SELECT count(*) INTO jml FROM public.jtr_kabel
  WHERE tiang_id = x.tiang_id AND gardu = upper(x.gardu_kode) AND jurusan = x.jurusan;
  IF jml > 0 THEN
    RAISE EXCEPTION 'Masih ada % kabel jurusan % di tiang %. Ubah atau hapus dulu kabelnya.', jml, x.jurusan, x.kode;
  END IF;

  UPDATE public.tiang_kode_jurusan SET status = 'lepas', catatan = btrim(p_alasan), updated_at = now()
  WHERE id = p_lewat_id;
  INSERT INTO public.master_audit
    (entitas, entitas_kode, ulp, field, nilai_lama, nilai_baru, aksi, oleh_uid, oleh_nama)
  VALUES ('tiang', x.kode, x.ulp, 'jurusan_lewat', to_jsonb('aktif'::text),
          jsonb_build_object('status', 'lepas', 'jurusan', x.jurusan, 'alasan', p_alasan),
          'batal_salah_input', auth.uid(), p_nama);
END $fn$;

GRANT EXECUTE ON FUNCTION public.lewatkan_jurusan_jtr(UUID, TEXT, TEXT, UUID, TEXT, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.lepas_jurusan_jtr(UUID, TEXT, TEXT) TO authenticated;


-- ── 15. Menyimpan kabel: jurusan per kabel ───────────────────────────────────
-- Disalin dari yang terpasang (jtr-asal-kabel.sql). ★ Kunci `jurusan` per
-- kabel (HP F3 / web). HP lama tidak mengirimnya → jurusan yang sudah
-- tercatat dipertahankan (pola yang sama dengan `dari_gardu`). Jurusan kabel
-- harus jurusan utama tiangnya, atau jurusan yang tercatat lewat tiang itu.
-- Nomor kabel TETAP dihitung per gardu (formulir HP sejak 1 Okt, kasus AM263:
-- "JTM & JTR gardu lain tidak dihitung") — identitas jalur kini dibawa jurusan
-- kabel, jadi nomor lintas gardu tidak perlu dijaga.
CREATE OR REPLACE FUNCTION public.simpan_konduktor_tiang(p_tiang_id uuid, p_daftar jsonb, p_nama text DEFAULT NULL::text, p_gardu text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  t       RECORD;
  h       RECORD;
  k       JSONB;
  lama    RECORD;
  hulu    UUID;
  no_kabel INT;
  dipakai INT[] := '{}';
  diff    JSONB := '{}'::jsonb;
  v_gardu TEXT;
  pemilik TEXT;   -- NULL = gardu pemilik batang; terisi = gardu yang meminjam
  dari    BOOLEAN;
  jur     TEXT;   -- ★
  jur_utama TEXT; -- ★
BEGIN
  SELECT kode, ulp, gardu_kode INTO t FROM public.tiang WHERE id = p_tiang_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Tiang tidak ditemukan'; END IF;

  -- Kabel dicatat PER GARDU. Tanpa p_gardu (aplikasi lama): gardu pemilik
  -- batang, perilaku lama utuh. Dengan p_gardu: batang harus anggota
  -- jaringan gardu itu (milik atau pinjaman), dan hanya kabel gardu itu
  -- yang disentuh — kabel gardu lain di batang yang sama tidak terhapus.
  v_gardu := upper(COALESCE(NULLIF(btrim(p_gardu), ''), t.gardu_kode));
  IF v_gardu IS NULL THEN RAISE EXCEPTION 'Tiang % belum menjadi bagian JTR gardu mana pun', t.kode; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.jtr_tiang j
                 WHERE j.id = p_tiang_id AND upper(j.gardu_kode) = v_gardu AND j.status_hidup = 'aktif') THEN
    RAISE EXCEPTION 'Tiang % bukan bagian jaringan gardu %', t.kode, v_gardu;
  END IF;
  pemilik := CASE WHEN v_gardu = upper(t.gardu_kode) THEN NULL ELSE v_gardu END;
  SELECT kode, jurusan INTO t.kode, jur_utama FROM public.jtr_tiang j
  WHERE j.id = p_tiang_id AND upper(j.gardu_kode) = v_gardu ORDER BY j.menumpang LIMIT 1;

  FOR k IN SELECT * FROM jsonb_array_elements(COALESCE(p_daftar, '[]'::jsonb)) LOOP
    no_kabel := (k->>'nomor')::int;
    hulu  := NULLIF(k->>'hulu_id', '')::uuid;
    dipakai := dipakai || no_kabel;

    SELECT * INTO lama FROM public.tiang_konduktor
    WHERE tiang_id = p_tiang_id AND nomor = no_kabel
      AND COALESCE(pemilik_gardu_kode, '') = COALESCE(pemilik, '');
    -- "Langsung dari gardu" (jtr-asal-kabel.sql). HP lama tidak mengirim
    -- kuncinya → nilai yang sudah tercatat dipertahankan, supaya koreksi admin
    -- tidak terhapus tiap kali HP lama menyimpan ulang tiangnya.
    dari := CASE WHEN k ? 'dari_gardu' THEN COALESCE((k->>'dari_gardu')::boolean, false)
                 ELSE COALESCE(lama.dari_gardu, false) END;
    IF dari THEN hulu := NULL; END IF;

    -- ★ Jurusan kabel — aturan yang sama: tanpa kunci = yang tercatat.
    jur := CASE WHEN k ? 'jurusan' THEN NULLIF(upper(btrim(COALESCE(k->>'jurusan', ''))), '')
                ELSE lama.jurusan END;
    IF jur IS NOT NULL AND jur IS DISTINCT FROM jur_utama AND NOT EXISTS (
         SELECT 1 FROM public.tiang_kode_jurusan x
         WHERE x.tiang_id = p_tiang_id AND upper(x.gardu_kode) = v_gardu AND x.jurusan = jur AND x.status = 'aktif') THEN
      RAISE EXCEPTION 'Kabel ke-% jurusan %, tapi tiang % belum dicatat dilewati jurusan % — tandai dulu "Dilewati jurusan % juga".',
        no_kabel, jur, t.kode, jur, jur;
    END IF;

    IF hulu IS NOT NULL THEN
      IF hulu = p_tiang_id THEN
        RAISE EXCEPTION 'Tiang % tidak bisa jadi asal kabel bagi dirinya sendiri', t.kode;
      END IF;
      SELECT kode, ulp, gardu_kode INTO h FROM public.tiang
      WHERE id = hulu AND status_hidup = 'aktif';
      IF NOT FOUND THEN
        RAISE EXCEPTION 'Tiang asal kabel ke-% tidak ditemukan atau sudah tidak aktif', no_kabel;
      END IF;
      IF NOT EXISTS (SELECT 1 FROM public.jtr_tiang j
                     WHERE j.id = hulu AND upper(j.gardu_kode) = v_gardu
                       AND upper(j.ulp) = upper(t.ulp) AND j.status_hidup = 'aktif') THEN
        RAISE EXCEPTION 'Tiang asal % bukan bagian jaringan gardu yang sama', h.kode;
      END IF;
      -- Cegah dua tiang saling menunjuk: bentangnya akan terhitung dua kali.
      IF EXISTS (
        SELECT 1 FROM public.jtr_kabel x
        WHERE x.tiang_id = hulu AND x.induk_tiang_id = p_tiang_id AND x.gardu = v_gardu
      ) THEN
        RAISE EXCEPTION 'Tiang % sudah menunjuk % sebagai asal kabelnya', h.kode, t.kode;
      END IF;
    END IF;

    IF lama.tiang_id IS NOT NULL THEN
      IF lama.jenis IS DISTINCT FROM (k->>'jenis')
         OR lama.ukuran IS DISTINCT FROM (k->>'ukuran') THEN
        diff := diff || jsonb_build_object(
          'kabel_' || no_kabel,
          jsonb_build_array(
            concat_ws(' ', lama.jenis, lama.ukuran),
            concat_ws(' ', k->>'jenis', k->>'ukuran')));
      END IF;
      IF lama.induk_tiang_id IS DISTINCT FROM hulu OR COALESCE(lama.dari_gardu, false) IS DISTINCT FROM dari THEN
        diff := diff || jsonb_build_object(
          'asal_kabel_' || no_kabel,
          jsonb_build_array(
            CASE WHEN lama.dari_gardu THEN 'gardu' ELSE (SELECT kode FROM public.tiang WHERE id = lama.induk_tiang_id) END,
            CASE WHEN dari THEN 'gardu' ELSE (SELECT kode FROM public.tiang WHERE id = hulu) END));
      END IF;
      IF lama.jurusan IS DISTINCT FROM jur THEN   -- ★
        diff := diff || jsonb_build_object(
          'jurusan_kabel_' || no_kabel, jsonb_build_array(lama.jurusan, jur));
      END IF;
    END IF;

    INSERT INTO public.tiang_konduktor
      (tiang_id, nomor, jenis, ukuran, kondisi, induk_tiang_id,
       aks_suspension, aks_large_angle, aks_dead_end, foto_temuan, pemilik_gardu_kode, dari_gardu, jurusan)
    VALUES (p_tiang_id, no_kabel, k->>'jenis', k->>'ukuran', k->>'kondisi', hulu,
            k->>'aks_suspension', k->>'aks_large_angle', k->>'aks_dead_end',
            COALESCE(k->'foto_temuan', '{}'::jsonb), pemilik, dari, jur)
    ON CONFLICT (tiang_id, (COALESCE(pemilik_gardu_kode, '')), nomor) DO UPDATE
      SET jenis           = EXCLUDED.jenis,
          ukuran          = EXCLUDED.ukuran,
          kondisi         = EXCLUDED.kondisi,
          induk_tiang_id  = EXCLUDED.induk_tiang_id,
          dari_gardu      = EXCLUDED.dari_gardu,
          jurusan         = EXCLUDED.jurusan,
          aks_suspension  = EXCLUDED.aks_suspension,
          aks_large_angle = EXCLUDED.aks_large_angle,
          aks_dead_end    = EXCLUDED.aks_dead_end,
          -- Digabung, bukan ditimpa — alasan yang sama dengan `koreksi_tiang`.
          foto_temuan     = public.tiang_konduktor.foto_temuan || EXCLUDED.foto_temuan,
          updated_at      = now();
  END LOOP;

  DELETE FROM public.tiang_konduktor
  WHERE tiang_id = p_tiang_id AND NOT (nomor = ANY (dipakai))
    AND COALESCE(pemilik_gardu_kode, '') = COALESCE(pemilik, '');

  IF diff <> '{}'::jsonb THEN
    INSERT INTO public.master_audit
      (entitas, entitas_kode, ulp, field, nilai_lama, nilai_baru, aksi, oleh_uid, oleh_nama)
    VALUES ('tiang', t.kode, t.ulp, 'konduktor', NULL, diff,
            'koreksi_lapangan', auth.uid(), p_nama);
  END IF;
END $function$;
GRANT EXECUTE ON FUNCTION public.simpan_konduktor_tiang(uuid, jsonb, text, text) TO authenticated;


-- ── 16. Kiriman HP: `jurusan_lain` per tiang ─────────────────────────────────
-- Disalin dari yang terpasang. ★ Putaran 1 juga mencatat jurusan lain yang lewat;
-- kabel boleh membawa `jurusan` (diteruskan apa adanya ke
-- simpan_konduktor_tiang). Kiriman HP lama tidak membawa keduanya → tidak berubah.
CREATE OR REPLACE FUNCTION public.kirim_tiang_jtr(p_isi jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_role  TEXT;
  v_unit  TEXT;
  v_gardu TEXT := upper(btrim(COALESCE(p_isi->>'gardu_kode', '')));
  v_ulp   TEXT := upper(btrim(COALESCE(p_isi->>'ulp', '')));
  v_nama  TEXT := NULLIF(btrim(COALESCE(p_isi->>'nama', '')), '');
  v_insp  UUID;
  v_stat  TEXT;
  peta    JSONB := '{}'::jsonb;   -- id_lokal → tiang_id
  hasil   JSONB := '[]'::jsonb;
  r       JSONB;
  b       JSONB;
  k       JSONB;
  kol     JSONB;
  kabel   JSONB;
  v_lokal UUID;
  v_tiang UUID;
  v_induk UUID;
  v_pinjam BOOLEAN;
  v_kode  TEXT;
  v_lat  DOUBLE PRECISION;
  v_lng   DOUBLE PRECISION;
  radius  NUMERIC;
  d_id    UUID;
  d_kode  TEXT;
  d_m     DOUBLE PRECISION;
  sisa    INT := 0;
  e       JSONB;   -- ★
BEGIN
  SELECT role, unit INTO v_role, v_unit FROM public.user_roles WHERE user_id = auth.uid();
  IF v_role IS NULL THEN
    RAISE EXCEPTION 'Sesi tidak dikenali server. Keluar lalu masuk lagi, kemudian kirim ulang — isian tetap tersimpan di HP.';
  END IF;
  IF v_gardu = '' OR v_ulp = '' THEN RAISE EXCEPTION 'Gardu tidak disebut — perbarui aplikasi lalu kirim ulang.'; END IF;
  IF v_role <> 'UP3' AND upper(COALESCE(v_unit, '')) <> v_ulp THEN
    RAISE EXCEPTION 'Gardu ini milik ULP %, akun ini ULP %.', v_ulp, COALESCE(v_unit, '-');
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext('inspeksi-jtr|' || v_gardu || '|' || v_ulp));
  radius := (public.jtm_ambang(v_ulp)).radius_tumpang_m;

  -- Foto temuan harus sudah terunggah.
  IF EXISTS (
    SELECT 1
    FROM jsonb_array_elements(COALESCE(p_isi->'tiang', '[]'::jsonb)) t,
         LATERAL (
           SELECT value FROM jsonb_each_text(COALESCE(t->'kolom'->'foto_temuan', '{}'::jsonb))
           UNION ALL
           SELECT f.value FROM jsonb_array_elements(COALESCE(t->'konduktor', '[]'::jsonb)) c,
                  jsonb_each_text(COALESCE(c->'foto_temuan', '{}'::jsonb)) f
         ) foto
    WHERE foto.value NOT LIKE 'http%'
  ) THEN
    RAISE EXCEPTION 'Foto temuan belum terunggah. Kirim ulang saat sinyal lebih baik.';
  END IF;

  -- Inspeksi terakhir gardu ini.
  SELECT id, status INTO v_insp, v_stat FROM public.inspeksi_jtr
  WHERE upper(gardu_kode) = v_gardu AND upper(ulp) = v_ulp AND status <> 'Dibatalkan'
  ORDER BY created_at DESC LIMIT 1;

  IF v_stat = 'Selesai' THEN
    -- Kiriman "selesai" yang jawabannya hilang di jalan: semua tiang baru &
    -- pinjaman sudah tercatat → anggap berhasil. Selain itu: sudah dikirim.
    FOR r IN SELECT * FROM jsonb_array_elements(COALESCE(p_isi->'tiang', '[]'::jsonb)) LOOP
      v_lokal := NULLIF(r->>'id_lokal', '')::uuid;
      IF (jsonb_typeof(r->'baru') = 'object' AND NOT EXISTS (SELECT 1 FROM public.tiang WHERE id_hp = v_lokal))
         OR (jsonb_typeof(r->'tumpang') = 'object' AND NOT EXISTS (SELECT 1 FROM public.tiang_jtr_tumpang WHERE id_hp = v_lokal))
         -- ★ jurusan_lain yang ber-id_lokal juga harus sudah tercatat.
         OR EXISTS (SELECT 1 FROM jsonb_array_elements(CASE WHEN jsonb_typeof(r->'jurusan_lain') = 'array' THEN r->'jurusan_lain' ELSE '[]'::jsonb END) e2
                    WHERE NULLIF(e2->>'id_lokal', '') IS NOT NULL
                      AND NOT EXISTS (SELECT 1 FROM public.tiang_kode_jurusan WHERE id_hp = (e2->>'id_lokal')::uuid)) THEN
        sisa := sisa + 1;
      END IF;
    END LOOP;
    IF sisa = 0 AND COALESCE((p_isi->>'selesai')::boolean, false) THEN
      RETURN jsonb_build_object('inspeksi_id', v_insp, 'sudah_ada', true, 'tiang', '[]'::jsonb);
    END IF;
    RAISE EXCEPTION 'Inspeksi gardu % sudah dikirim dan menunggu persetujuan — tidak bisa ditambah. Minta admin mengembalikannya bila perlu.', v_gardu;
  END IF;

  IF v_stat = 'Ditolak' THEN
    -- Dikembalikan admin: inspeksi yang SAMA dibuka lagi, bukan lahir baru.
    UPDATE public.inspeksi_jtr SET status = 'Dalam Proses', tgl_selesai = NULL, updated_at = now()
    WHERE id = v_insp;
  ELSIF v_stat IS NULL OR v_stat = 'Diverifikasi' THEN
    -- Belum ada yang berjalan: kepala Dalam Proses — kiriman sementara pun
    -- terlihat di web dan di HP tim lain.
    INSERT INTO public.inspeksi_jtr (gardu_kode, ulp, penyulang, tgl_mulai, status, inspektor_uid, inspektor_nama, petugas_2)
    VALUES (v_gardu, v_ulp, NULLIF(p_isi->>'penyulang', ''), (now() AT TIME ZONE 'Asia/Makassar')::date,
            'Dalam Proses', auth.uid(), v_nama, NULLIF(p_isi->>'petugas_2', ''))
    RETURNING id INTO v_insp;
  END IF;

  -- Putaran 1: tiang baru & pinjaman (idempoten lewat id_hp).
  FOR r IN SELECT * FROM jsonb_array_elements(COALESCE(p_isi->'tiang', '[]'::jsonb)) LOOP
    v_lokal := NULLIF(r->>'id_lokal', '')::uuid;

    IF jsonb_typeof(r->'baru') = 'object' THEN
      b := r->'baru';
      SELECT id INTO v_tiang FROM public.tiang WHERE id_hp = v_lokal;
      IF v_tiang IS NULL THEN
        v_induk := COALESCE(NULLIF(b->>'induk_id', '')::uuid, public.jtr_id_lokal(peta, b->>'induk_lokal'));
        v_lat := NULLIF(b->>'lat', '')::double precision;
        v_lng := NULLIF(b->>'lng', '')::double precision;

        -- Satu batang tidak boleh lahir dua kali — kecuali regu menyatakan
        -- memang batang lain (JTR di sebelah JTM bisa berjarak 0,2 m).
        d_id := NULL;
        SELECT t.id, t.kode, public.jarak_meter(v_lat, v_lng, t.lat, t.lng)
          INTO d_id, d_kode, d_m
        FROM public.tiang t
        WHERE t.status_hidup = 'aktif' AND t.lat IS NOT NULL AND t.lng IS NOT NULL
          AND upper(COALESCE(t.ulp, '')) = v_ulp
        ORDER BY public.jarak_meter(v_lat, v_lng, t.lat, t.lng)
        LIMIT 1;
        IF d_id IS NOT NULL AND d_m <= radius AND NOT COALESCE((b->>'batang_beda')::boolean, false) THEN
          RAISE EXCEPTION 'Tiang % sudah berdiri % m dari titik tiang baru. Pilih "menumpang tiang itu", atau nyatakan dua batang berbeda.',
            d_kode, round(d_m::numeric, 1);
        END IF;

        IF v_induk IS NOT NULL AND NOT EXISTS (
          SELECT 1 FROM public.jtr_tiang
          WHERE id = v_induk AND upper(gardu_kode) = v_gardu AND upper(ulp) = v_ulp AND status_hidup = 'aktif') THEN
          RAISE EXCEPTION 'Tiang induk bukan bagian jaringan gardu % — tumpangi dulu tiang itu.', v_gardu;
        END IF;

        -- Induk tiang JTR gardu ini sendiri → induk_id; induk batang pinjaman
        -- → induk_jtr_id (pohon pemilik batang tidak ketambahan anak).
        v_pinjam := v_induk IS NOT NULL AND NOT EXISTS (
          SELECT 1 FROM public.tiang WHERE id = v_induk AND upper(gardu_kode) = v_gardu AND upper(ulp) = v_ulp);

        INSERT INTO public.tiang
          (gardu_kode, ulp, jurusan, induk_id, induk_jtr_id, lat, lng, status_hidup, sumber, dikonfirmasi_at, dikonfirmasi_oleh, id_hp,
           beda_dari_tiang_id, beda_dari_jarak_m)
        VALUES (v_gardu, v_ulp, NULLIF(b->>'jurusan', ''),
                CASE WHEN v_pinjam THEN NULL ELSE v_induk END,
                CASE WHEN v_pinjam THEN v_induk END,
                v_lat, v_lng,
                'aktif', 'lapangan', now(), v_nama, v_lokal,
                CASE WHEN d_m <= radius THEN d_id END,
                CASE WHEN d_m <= radius THEN round(d_m::numeric, 1) END)
        RETURNING id INTO v_tiang;
      END IF;
      peta := peta || jsonb_build_object(r->>'id_lokal', v_tiang);

    ELSIF jsonb_typeof(r->'tumpang') = 'object' THEN
      b := r->'tumpang';
      v_tiang := NULLIF(b->>'tiang_id', '')::uuid;
      PERFORM public.tumpangi_tiang_jtr(
        v_gardu, v_ulp, NULLIF(b->>'jurusan', ''), v_tiang,
        COALESCE(NULLIF(b->>'induk_id', '')::uuid, public.jtr_id_lokal(peta, b->>'induk_lokal')),
        v_nama, v_lokal);
      peta := peta || jsonb_build_object(r->>'id_lokal', v_tiang);
    END IF;

    -- ★ Jurusan lain yang lewat tiang ini (HP F3, `jurusan_lain`):
    --   [{ jurusan, induk_id | induk_lokal (kosong = langsung dari gardu), id_lokal }]
    --   Di putaran yang SAMA dengan lahirnya tiang, urut kiriman = urut regu
    --   berjalan: nama deret jurusan itu lahir berurutan (B2, B3 …), dan tiang
    --   sesudahnya sudah melihat induknya dilewati jurusan itu. Sebelum kabel:
    --   kabel jurusan B butuh keanggotaan B.
    IF jsonb_typeof(r->'jurusan_lain') = 'array' THEN
      v_tiang := COALESCE(NULLIF(r->>'tiang_id', '')::uuid, NULLIF(peta->>(r->>'id_lokal'), '')::uuid);
      FOR e IN SELECT * FROM jsonb_array_elements(r->'jurusan_lain') LOOP
        PERFORM public.lewatkan_jurusan_jtr(
          v_tiang, v_gardu, e->>'jurusan',
          COALESCE(NULLIF(e->>'induk_id', '')::uuid, public.jtr_id_lokal(peta, e->>'induk_lokal')),
          v_nama, NULLIF(e->>'id_lokal', '')::uuid);
      END LOOP;
    END IF;
  END LOOP;

  -- Putaran 2: isian & kabel (tiang baru, pinjaman, maupun lama).
  FOR r IN SELECT * FROM jsonb_array_elements(COALESCE(p_isi->'tiang', '[]'::jsonb)) LOOP
    v_tiang := COALESCE(NULLIF(r->>'tiang_id', '')::uuid, NULLIF(peta->>(r->>'id_lokal'), '')::uuid);
    IF v_tiang IS NULL THEN
      RAISE EXCEPTION 'Satu tiang di kiriman ini tidak punya id — perbarui aplikasi lalu kirim ulang.';
    END IF;
    kol := COALESCE(r->'kolom', '{}'::jsonb);

    -- Isian fisik menulis MASTER — satu batang, satu data, dari JTR maupun JTM.
    PERFORM public.koreksi_tiang(
      v_tiang,
      NULLIF(kol->>'jenis', ''),
      NULLIF(kol->>'tinggi', '')::numeric,
      NULLIF(kol->>'kondisi', ''),
      NULLIF(r->'titik'->>'lat', '')::double precision,
      NULLIF(r->'titik'->>'lng', '')::double precision,
      v_nama,
      NULL,
      jsonb_strip_nulls(jsonb_build_object(
        'andongan', kol->'andongan', 'tarikan_sr', kol->'tarikan_sr',
        'arde_kondisi', kol->'arde_kondisi', 'arde_nilai_ohm', kol->'arde_nilai_ohm',
        'stay_jenis', kol->'stay_jenis', 'stay_kondisi', kol->'stay_kondisi',
        'rawan_row', kol->'rawan_row', 'jamperan', kol->'jamperan',
        'underbuild_tm', kol->'underbuild_tm', 'catatan_perbaikan', kol->'catatan_perbaikan',
        'foto_temuan', kol->'foto_temuan',
        -- ★ Ada JTR gardu lain di tiang ini. Kode kosong dikirim sebagai ""
        --   (bukan null) supaya kode lama bisa dihapus — strip_nulls membuang null.
        'jtr_gardu_lain', kol->'jtr_gardu_lain', 'jtr_gardu_lain_kode', kol->'jtr_gardu_lain_kode')));

    -- ★ Tiang ini DINILAI pada inspeksi ini. Dulu tidak ada catatannya sama
    --   sekali, dan "Selesai" mendaftar SEMUA tiang aktif sebagai "cocok" —
    --   termasuk yang tidak pernah dibuka regu.
    INSERT INTO public.inspeksi_jtr_titik (inspeksi_id, tiang_id, hasil_periksa, lat, lng)
    SELECT v_insp, t.id,
           CASE WHEN jsonb_typeof(r->'baru') = 'object' THEN 'baru' ELSE 'cocok' END,
           t.lat, t.lng
    FROM public.tiang t WHERE t.id = v_tiang
    ON CONFLICT (inspeksi_id, tiang_id) WHERE tiang_id IS NOT NULL DO NOTHING;

    IF jsonb_typeof(r->'konduktor') = 'array' THEN
      kabel := '[]'::jsonb;
      FOR k IN SELECT * FROM jsonb_array_elements(r->'konduktor') LOOP
        kabel := kabel || jsonb_build_array(k || jsonb_build_object(
          'hulu_id', COALESCE(NULLIF(k->>'hulu_id', '')::uuid, public.jtr_id_lokal(peta, k->>'hulu_lokal'))));
      END LOOP;
      PERFORM public.simpan_konduktor_tiang(v_tiang, kabel, v_nama, v_gardu);
    END IF;

    -- Nama JTR di gardu ini (untuk batang pinjaman: nama pinjamannya).
    SELECT kode INTO v_kode FROM public.jtr_tiang
    WHERE id = v_tiang AND upper(gardu_kode) = v_gardu AND status_hidup = 'aktif'
    ORDER BY menumpang LIMIT 1;
    hasil := hasil || jsonb_build_object('id_lokal', r->>'id_lokal', 'tiang_id', v_tiang, 'kode', v_kode);
  END LOOP;

  -- Tutup: fungsi yang sudah ada (mendaftar semua tiang aktif & menutup).
  IF COALESCE((p_isi->>'selesai')::boolean, false) THEN
    v_insp := public.selesaikan_inspeksi_jtr(
      v_gardu, v_ulp, NULLIF(p_isi->>'penyulang', ''), v_nama,
      NULLIF(p_isi->>'petugas_2', ''), NULLIF(btrim(COALESCE(p_isi->>'catatan_selesai', '')), ''));
  END IF;

  RETURN jsonb_build_object('inspeksi_id', v_insp, 'sudah_ada', false, 'tiang', hasil);
END $function$
;


-- ── 17. Batal, lepas, gabung: keanggotaan jurusan ikut ───────────────────────
-- Disalin dari yang terpasang; yang baru bertanda ★.

CREATE OR REPLACE FUNCTION public._batalkan_tiang_inti(p_id uuid, p_nama text DEFAULT NULL::text, p_alasan text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  t     RECORD;
  jml   INT;
  nama_dibuang TEXT[];
BEGIN
  SELECT * INTO t FROM public.tiang WHERE id = p_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Tiang tidak ditemukan'; END IF;

  IF t.status_hidup = 'batal' THEN
    RAISE EXCEPTION 'Tiang % sudah dibatalkan sebelumnya', t.kode;
  END IF;

  -- Alasan diwajibkan. Pembatalan tanpa alasan tidak memberi satu pun petunjuk
  -- kepada orang yang membacanya enam bulan lagi — dan yang tidak diterangkan
  -- akan dikira kesalahan sistem, bukan keputusan orang.
  IF btrim(COALESCE(p_alasan, '')) = '' THEN
    RAISE EXCEPTION 'Alasan pembatalan wajib diisi';
  END IF;

  -- Anak di pohon JTM/JTR milik sendiri DAN anak lewat keanggotaan JTR
  -- pinjaman (`tiang_jtr_tumpang`) — keduanya kehilangan induk kalau dibatalkan.
  -- ★ Juga anak di deret jurusan yang lewat (`tiang_kode_jurusan`).
  SELECT (SELECT count(*) FROM public.tiang WHERE (induk_id = p_id OR induk_jtr_id = p_id) AND status_hidup = 'aktif')
       + (SELECT count(*) FROM public.tiang_jtr_tumpang WHERE induk_id = p_id AND status = 'aktif')
       + (SELECT count(*) FROM public.tiang_kode_jurusan x JOIN public.tiang c ON c.id = x.tiang_id
           WHERE x.induk_id = p_id AND x.status = 'aktif' AND c.status_hidup = 'aktif' AND x.tiang_id <> p_id)
    INTO jml;

  IF jml > 0 THEN
    RAISE EXCEPTION
      'Tiang % masih menyuplai % tiang. Pindahkan dulu sambungannya ke tiang lain.',
      t.kode, jml;
  END IF;

  -- Dikumpulkan SEBELUM dibuang, supaya jejaknya menyebut nama apa saja yang
  -- hilang. Tanpa ini audit cuma bisa bilang "ada nama yang dibuang".
  SELECT array_agg(penyulang || '=' || kode ORDER BY penyulang)
    INTO nama_dibuang
  FROM public.tiang_kode_penyulang WHERE tiang_id = p_id;

  DELETE FROM public.tiang_kode_penyulang WHERE tiang_id = p_id;
  -- Batang yang dibatalkan lepas juga dari gardu-gardu yang meminjamnya.
  UPDATE public.tiang_jtr_tumpang SET status = 'lepas', catatan = 'tiangnya dibatalkan: ' || p_alasan, updated_at = now()
  WHERE tiang_id = p_id AND status = 'aktif';
  -- ★ … dan dari jurusan-jurusan yang lewat.
  UPDATE public.tiang_kode_jurusan SET status = 'lepas', catatan = 'tiangnya dibatalkan: ' || p_alasan, updated_at = now()
  WHERE tiang_id = p_id AND status = 'aktif';

  UPDATE public.tiang
  SET status_hidup = 'batal',
      aktif_sampai = CURRENT_DATE,
      catatan = p_alasan,
      updated_at = now()
  WHERE id = p_id;

  INSERT INTO public.master_audit
    (entitas, entitas_kode, ulp, field, nilai_lama, nilai_baru, aksi, oleh_uid, oleh_nama)
  VALUES ('tiang', t.kode, COALESCE(t.ulp, '-'), 'status_hidup',
          to_jsonb(t.status_hidup),
          jsonb_build_object('status', 'batal', 'alasan', p_alasan,
                             'nama_dibuang', COALESCE(nama_dibuang, '{}')),
          'batal_salah_input', auth.uid(), p_nama);
END $function$;

CREATE OR REPLACE FUNCTION public.lepas_tumpang_jtr(p_tumpang_id uuid, p_alasan text, p_nama text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  m_tiang UUID;
  m_gardu TEXT;
  m_ulp   TEXT;
  m_kode  TEXT;
  jml     INT;
BEGIN
  IF btrim(COALESCE(p_alasan, '')) = '' THEN RAISE EXCEPTION 'Alasan wajib diisi.'; END IF;
  SELECT tiang_id, gardu_kode, ulp, kode INTO m_tiang, m_gardu, m_ulp, m_kode
  FROM public.tiang_jtr_tumpang WHERE id = p_tumpang_id AND status = 'aktif';
  IF m_tiang IS NULL THEN RAISE EXCEPTION 'Keanggotaan tidak ditemukan atau sudah dilepas.'; END IF;

  -- ★ Anak lewat jurusan mana pun di gardu ini (bukan keanggotaan tiang ini sendiri).
  SELECT count(*) INTO jml FROM public.jtr_tiang_jurusan
  WHERE induk_id = m_tiang AND gardu_kode = upper(m_gardu) AND ulp = upper(m_ulp)
    AND status_hidup = 'aktif' AND id <> m_tiang;
  IF jml > 0 THEN
    RAISE EXCEPTION 'Tiang % masih menyuplai % tiang JTR. Pindahkan dulu sambungannya.', m_kode, jml;
  END IF;

  UPDATE public.tiang_jtr_tumpang SET status = 'lepas', catatan = btrim(p_alasan), updated_at = now()
  WHERE id = p_tumpang_id;
  -- ★ Jurusan yang lewat batang ini di gardu ini ikut lepas.
  UPDATE public.tiang_kode_jurusan SET status = 'lepas', catatan = 'pinjaman batang dilepas: ' || btrim(p_alasan), updated_at = now()
  WHERE tiang_id = m_tiang AND upper(gardu_kode) = upper(m_gardu) AND upper(ulp) = upper(m_ulp) AND status = 'aktif';
  INSERT INTO public.master_audit
    (entitas, entitas_kode, ulp, field, nilai_lama, nilai_baru, aksi, oleh_uid, oleh_nama)
  VALUES ('tiang', m_kode, m_ulp, 'tumpang_jtr', to_jsonb('aktif'::text),
          jsonb_build_object('status', 'lepas', 'alasan', p_alasan), 'batal_salah_input', auth.uid(), p_nama);
END $function$;

-- ★ Gabung tiang kembar: jurusan yang lewat kembar ikut pindah.
CREATE OR REPLACE FUNCTION public.gabung_tiang_jtr(p_kembar uuid, p_gardu text, p_batang uuid, p_alasan text, p_nama text DEFAULT NULL::text)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  g  TEXT := upper(btrim(p_gardu));
  k  RECORD;
  b  RECORD;
  bk TEXT;
BEGIN
  IF btrim(COALESCE(p_alasan, '')) = '' THEN RAISE EXCEPTION 'Alasan wajib diisi'; END IF;
  IF p_kembar = p_batang THEN RAISE EXCEPTION 'Tiang kembar dan batang tujuan sama'; END IF;

  SELECT * INTO k FROM public.tiang WHERE id = p_kembar AND status_hidup = 'aktif' FOR UPDATE;
  IF NOT FOUND OR upper(COALESCE(k.gardu_kode, '')) <> g THEN
    RAISE EXCEPTION 'Tiang kembar harus tiang JTR aktif MILIK gardu % (bukan pinjaman)', g;
  END IF;
  PERFORM public.wajib_boleh_ulp(k.ulp);
  IF EXISTS (SELECT 1 FROM public.tiang_kode_penyulang WHERE tiang_id = p_kembar) THEN
    RAISE EXCEPTION 'Tiang % juga tiang JTM — gabungkan lewat Inspeksi JTM', k.kode;
  END IF;

  SELECT * INTO b FROM public.tiang WHERE id = p_batang AND status_hidup = 'aktif' FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Batang tujuan tidak ditemukan / tidak aktif'; END IF;
  IF upper(COALESCE(b.ulp, '')) <> upper(COALESCE(k.ulp, '')) THEN RAISE EXCEPTION 'Batang tujuan beda ULP'; END IF;
  IF EXISTS (SELECT 1 FROM public.jtr_tiang WHERE id = p_batang AND upper(gardu_kode) = g AND status_hidup = 'aktif') THEN
    RAISE EXCEPTION 'Batang tujuan sudah bagian jaringan gardu % — bukan kembar, pakai Ganti induk', g;
  END IF;
  bk := COALESCE(b.kode, '(tanpa nama)');

  -- Pinjaman baru: nama, jurusan, induk gardu ini ikut. Nama sementara dulu —
  -- nama kembar masih dipakai baris tiangnya sampai dibatalkan di bawah.
  INSERT INTO public.tiang_jtr_tumpang (tiang_id, gardu_kode, ulp, jurusan, induk_id, kode, status, dibuat_oleh, dibuat_uid)
  VALUES (p_batang, g, upper(k.ulp), k.jurusan, COALESCE(k.induk_jtr_id, k.induk_id),
          k.kode || '~gabung', 'aktif', p_nama, auth.uid());

  -- Kabel gardu ini pindah ke batang (milik gardu ini di batang orang lain).
  UPDATE public.tiang_konduktor
     SET tiang_id = p_batang, pemilik_gardu_kode = g
   WHERE tiang_id = p_kembar AND upper(COALESCE(pemilik_gardu_kode, k.gardu_kode)) = g;

  -- Semua yang menunjuk kembar sebagai hulu → batang.
  -- Anak milik sendiri yang berinduk ke batang PINJAMAN → induk_jtr_id (aturan
  -- kirim_tiang_jtr: pohon pemilik batang tidak ketambahan anak).
  UPDATE public.tiang SET induk_id = NULL, induk_jtr_id = p_batang, updated_at = now()
   WHERE induk_id = p_kembar AND status_hidup = 'aktif';
  UPDATE public.tiang SET induk_jtr_id = p_batang, updated_at = now() WHERE induk_jtr_id = p_kembar AND status_hidup = 'aktif';
  UPDATE public.tiang_jtr_tumpang SET induk_id = p_batang, updated_at = now() WHERE induk_id = p_kembar AND status = 'aktif';
  UPDATE public.tiang_konduktor SET induk_tiang_id = p_batang WHERE induk_tiang_id = p_kembar;
  UPDATE public.tiang_kode_jurusan SET induk_id = p_batang, updated_at = now() WHERE induk_id = p_kembar AND status = 'aktif';  -- ★
  -- Gardu lain yang (keliru) menumpang di kembar ikut pindah ke batang asli.
  UPDATE public.tiang_jtr_tumpang SET tiang_id = p_batang, updated_at = now()
   WHERE tiang_id = p_kembar AND status = 'aktif'
     AND NOT EXISTS (SELECT 1 FROM public.tiang_jtr_tumpang x
                      WHERE x.tiang_id = p_batang AND upper(x.gardu_kode) = upper(tiang_jtr_tumpang.gardu_kode) AND x.status = 'aktif');

  -- ★ Jurusan yang lewat kembar pindah ke batang bila gardunya kini
  --   anggota batang itu; sisanya lepas bersama kembarnya.
  UPDATE public.tiang_kode_jurusan x SET tiang_id = p_batang, updated_at = now()
   WHERE x.tiang_id = p_kembar AND x.status = 'aktif'
     AND EXISTS (SELECT 1 FROM public.jtr_tiang j WHERE j.id = p_batang AND upper(j.gardu_kode) = upper(x.gardu_kode) AND j.status_hidup = 'aktif')
     AND NOT EXISTS (SELECT 1 FROM public.tiang_kode_jurusan y
                      WHERE y.tiang_id = p_batang AND upper(y.gardu_kode) = upper(x.gardu_kode) AND y.jurusan = x.jurusan AND y.status = 'aktif');
  UPDATE public.tiang_kode_jurusan SET status = 'lepas', catatan = 'digabung ke batang ' || bk, updated_at = now()
   WHERE tiang_id = p_kembar AND status = 'aktif';

  -- Kembar dibatalkan, namanya dibebaskan untuk baris pinjaman.
  UPDATE public.tiang
     SET status_hidup = 'batal', aktif_sampai = CURRENT_DATE,
         catatan = 'Digabung ke batang ' || bk || ': ' || btrim(p_alasan), updated_at = now()
   WHERE id = p_kembar;
  UPDATE public.tiang_jtr_tumpang SET kode = k.kode, updated_at = now()
   WHERE tiang_id = p_batang AND upper(gardu_kode) = g AND status = 'aktif';

  INSERT INTO public.master_audit (entitas, entitas_kode, ulp, field, nilai_lama, nilai_baru, aksi, oleh_uid, oleh_nama)
  VALUES ('tiang', k.kode, k.ulp, 'gabung_batang',
          jsonb_build_object('batang', k.kode),
          jsonb_build_object('batang', bk, 'alasan', p_alasan),
          'sunting_admin', auth.uid(), p_nama);
  RETURN bk;
END $function$
;

CREATE OR REPLACE FUNCTION public.pindah_jurusan_tiang(p_gardu text, p_ulp text, p_dari text, p_ke text)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
  -- tanpa menebak. ★ Termasuk tiang yang hanya dilewati jurusan tujuan.
  SELECT count(*) INTO jml_tujuan
  FROM public.jtr_tiang_jurusan
  WHERE gardu_kode = upper(p_gardu)
    AND ulp = upper(p_ulp)
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

  -- Tiang pinjaman ikut pindah jurusan, namanya ikut disesuaikan.
  UPDATE public.tiang_jtr_tumpang
  SET jurusan = p_ke,
      kode = regexp_replace(kode, '^(' || upper(p_gardu) || '-)' || p_dari, '\1' || p_ke),
      updated_at = now()
  WHERE upper(gardu_kode) = upper(p_gardu) AND upper(ulp) = upper(p_ulp)
    AND jurusan = p_dari AND status = 'aktif';

  -- ★ Jurusan yang lewat & kabel yang menyebut jurusan itu ikut.
  IF p_ke IN ('A', 'B', 'C', 'D') THEN
    UPDATE public.tiang_kode_jurusan
    SET jurusan = p_ke,
        kode = regexp_replace(kode, '^(' || upper(p_gardu) || '-)' || p_dari, '\1' || p_ke),
        updated_at = now()
    WHERE upper(gardu_kode) = upper(p_gardu) AND upper(ulp) = upper(p_ulp)
      AND jurusan = p_dari AND status = 'aktif';
    UPDATE public.tiang_konduktor k
    SET jurusan = p_ke, updated_at = now()
    FROM public.tiang t
    WHERE t.id = k.tiang_id AND k.jurusan = p_dari
      AND upper(COALESCE(k.pemilik_gardu_kode, t.gardu_kode)) = upper(p_gardu)
      AND upper(t.ulp) = upper(p_ulp);
  END IF;

  RETURN jml_pindah;
END $function$;

CREATE OR REPLACE FUNCTION public.ubah_jurusan_tiang_jtr(p_id uuid, p_gardu text, p_jurusan text, p_hilir boolean DEFAULT true, p_nama text DEFAULT NULL::text)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  r   public.jtr_tiang;
  g   TEXT := upper(btrim(p_gardu));
  ke  TEXT := upper(btrim(COALESCE(p_jurusan, '')));
  n   INT := 0;
  x   RECORD;
BEGIN
  r := public._tiang_jtr_sunting(p_id, g);
  IF ke NOT IN ('A', 'B', 'C', 'D', 'K') THEN RAISE EXCEPTION 'Jurusan % tidak dikenal', ke; END IF;

  FOR x IN
    SELECT j.id, j.kode, j.jurusan, j.menumpang FROM public.jtr_tiang j
     WHERE upper(j.gardu_kode) = g AND j.status_hidup = 'aktif'
       AND j.id IN (SELECT id FROM public._jtr_hilir(p_id, g) WHERE p_hilir OR id = p_id)
       AND j.jurusan IS DISTINCT FROM ke
  LOOP
    -- ★ Tiang yang sudah dilewati jurusan tujuan: dua keanggotaan jurusan
    -- yang sama tidak boleh ada.
    IF EXISTS (SELECT 1 FROM public.tiang_kode_jurusan
               WHERE tiang_id = x.id AND upper(gardu_kode) = g AND jurusan = ke AND status = 'aktif') THEN
      RAISE EXCEPTION 'Tiang % sudah tercatat dilewati jurusan %. Lepas dulu jurusan % di tiang itu.', x.kode, ke, ke;
    END IF;
    IF x.menumpang THEN
      UPDATE public.tiang_jtr_tumpang
         SET jurusan = ke, kode = regexp_replace(kode, '^(' || g || '-)' || COALESCE(x.jurusan, ''), '\1' || ke),
             updated_at = now()
       WHERE tiang_id = x.id AND upper(gardu_kode) = g AND status = 'aktif';
    ELSE
      UPDATE public.tiang
         SET jurusan = ke, kode = regexp_replace(kode, '^(' || g || '-)' || COALESCE(x.jurusan, ''), '\1' || ke),
             updated_at = now()
       WHERE id = x.id;
    END IF;
    -- ★ Kabel yang tercatat berjurusan lama (= jurusan utama tiang) ikut.
    IF x.jurusan IS NOT NULL AND ke IN ('A', 'B', 'C', 'D') THEN
      UPDATE public.tiang_konduktor k
         SET jurusan = ke, updated_at = now()
        FROM public.tiang t
       WHERE t.id = k.tiang_id AND k.tiang_id = x.id AND k.jurusan = x.jurusan
         AND upper(COALESCE(k.pemilik_gardu_kode, t.gardu_kode)) = g;
    END IF;
    n := n + 1;
  END LOOP;

  INSERT INTO public.master_audit (entitas, entitas_kode, ulp, field, nilai_lama, nilai_baru, aksi, oleh_uid, oleh_nama)
  VALUES ('tiang', r.kode, r.ulp, 'jurusan', to_jsonb(r.jurusan),
          jsonb_build_object('jurusan', ke, 'hilir', p_hilir, 'tiang_diubah', n),
          'sunting_admin', auth.uid(), p_nama);
  RETURN n;
END $function$;

-- ★ Nama yang dibandingkan & diganti = nama di jurusan UTAMA (bukan gabungan);
-- keunikannya diperiksa terhadap nama di SEMUA deret jurusan gardu itu.
CREATE OR REPLACE FUNCTION public.ubah_nama_tiang_jtr(p_id uuid, p_gardu text, p_kode text, p_nama text DEFAULT NULL::text)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  r    public.jtr_tiang;
  g    TEXT := upper(btrim(p_gardu));
  baru TEXT := upper(regexp_replace(btrim(COALESCE(p_kode, '')), '\s+', '', 'g'));
  lama TEXT;
BEGIN
  r := public._tiang_jtr_sunting(p_id, g);
  IF baru = '' THEN RAISE EXCEPTION 'Nama tiang tidak boleh kosong'; END IF;
  SELECT kode INTO lama FROM public.jtr_tiang_jurusan
   WHERE id = p_id AND gardu_kode = g AND utama ORDER BY menumpang LIMIT 1;
  IF baru = upper(COALESCE(lama, '')) THEN RETURN baru; END IF;
  IF EXISTS (SELECT 1 FROM public.jtr_tiang_jurusan WHERE gardu_kode = g AND upper(kode) = baru
               AND status_hidup = 'aktif' AND NOT (id = p_id AND utama)) THEN
    RAISE EXCEPTION 'Nama % sudah dipakai tiang lain di gardu %', baru, g;
  END IF;

  IF r.menumpang THEN
    UPDATE public.tiang_jtr_tumpang SET kode = baru, updated_at = now()
     WHERE tiang_id = p_id AND upper(gardu_kode) = g AND status = 'aktif';
  ELSE
    UPDATE public.tiang SET kode = baru, updated_at = now() WHERE id = p_id;
  END IF;

  INSERT INTO public.master_audit (entitas, entitas_kode, ulp, field, nilai_lama, nilai_baru, aksi, oleh_uid, oleh_nama)
  VALUES ('tiang', baru, r.ulp, 'kode', to_jsonb(lama), to_jsonb(baru), 'sunting_admin', auth.uid(), p_nama);
  RETURN baru;
END $function$;


GRANT SELECT ON public.jtr_tiang, public.jtr_kabel, public.tiang_gawang, public.tiang_gawang_kabel,
  public.gardu_jtr_panjang, public.inspeksi_jtr_temuan TO authenticated;


-- ── Periksa ──────────────────────────────────────────────────────────────────
-- a. Data lama tidak berubah (belum ada jurusan yang lewat):
--      SELECT count(*) FROM tiang_kode_jurusan;                       -- 0
--      SELECT count(*) FILTER (WHERE NOT tersambung) FROM tiang_gawang_kabel;   -- 3
--      SELECT round(sum(panjang_penghantar_km), 3) FROM gardu_jtr_panjang;      -- sama dgn sebelum skrip
-- b. Kabel yang jurusannya belum dipastikan (data lama, dua kabel sejurusan):
--      SELECT gardu_kode, count(*) FROM jtr_kabel_perlu_dipastikan GROUP BY 1 ORDER BY 2 DESC;
-- c. Nama jalur kedua dari gardu (tanpa menyimpan apa pun):
--      SELECT jtr_kode_baru('AM104', 'AMPENAN', 'A', NULL, NULL, NULL);   -- AM104-A2-2 bila A sudah punya pangkal
