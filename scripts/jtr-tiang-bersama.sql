-- =============================================================================
-- J5t `rencana-mobile-jtm-jtr.md` §6b (26 Sep 2026) — MASTER TIANG TUNGGAL
-- JTM + JTR. Jalankan manual di Supabase SQL Editor, SESUDAH
-- `jtm-batang-beda.sql`. Idempoten.
--
-- User: "intinya, akan ada master tiang dan tidak akan ada tiang dobel, baik
-- JTR maupun JTM."
--
--   1. tiang_jtr_tumpang  — keanggotaan JTR untuk batang yang DIPINJAM (tiang
--                           JTM, atau tiang milik gardu lain). Tiang yang lahir
--                           di JTR tetap menyimpan keanggotaannya di `tiang`.
--   2. jtr_tiang          — SATU pohon JTR: milik sendiri + pinjaman, kolom sama
--                           dengan `tiang` (+ `menumpang`).
--   3. jtr_kode_baru()    — aturan penamaan JTR (dari `tiang_buat_kode`) jadi
--                           satu fungsi, dipakai tiang sendiri & pinjaman —
--                           nomornya tidak bentrok.
--   4. tampilan JTR membaca `jtr_tiang` (CREATE OR REPLACE — kolom keluaran
--      SAMA, turunannya tetap hidup). Titik induk/hulu tetap dari master.
--   5. selesaikan / batalkan / pindah jurusan ikut tiang pinjaman.
--   6. tumpangi_tiang_jtr, lepas_tumpang_jtr.
--
-- Definisi tampilan & fungsi di bawah DISALIN dari yang TERPASANG (dibaca
-- lewat `_definisi`, 26 Sep 2026) — bukan dari berkas skrip lama.
-- =============================================================================


-- ── 1. Keanggotaan JTR untuk batang pinjaman ─────────────────────────────────
CREATE TABLE IF NOT EXISTS public.tiang_jtr_tumpang (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tiang_id    UUID NOT NULL REFERENCES public.tiang(id) ON DELETE CASCADE,
  gardu_kode  TEXT NOT NULL,
  ulp         TEXT NOT NULL,
  jurusan     TEXT NOT NULL,
  induk_id    UUID REFERENCES public.tiang(id) ON DELETE SET NULL,   -- induk di pohon JTR gardu ini
  kode        TEXT,                                                  -- nama JTR, lahir dari jtr_kode_baru
  status      TEXT NOT NULL DEFAULT 'aktif',
  catatan     TEXT,
  id_hp       UUID UNIQUE,                                           -- kiriman HP idempoten
  dibuat_oleh TEXT,
  dibuat_uid  UUID,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.tiang_jtr_tumpang DROP CONSTRAINT IF EXISTS tiang_jtr_tumpang_status_valid;
ALTER TABLE public.tiang_jtr_tumpang ADD CONSTRAINT tiang_jtr_tumpang_status_valid CHECK (status IN ('aktif', 'lepas'));
CREATE UNIQUE INDEX IF NOT EXISTS tiang_jtr_tumpang_satu_per_gardu
  ON public.tiang_jtr_tumpang (tiang_id, upper(gardu_kode), upper(ulp)) WHERE status = 'aktif';
CREATE UNIQUE INDEX IF NOT EXISTS tiang_jtr_tumpang_kode_unik
  ON public.tiang_jtr_tumpang (upper(kode), upper(ulp)) WHERE status = 'aktif';
CREATE INDEX IF NOT EXISTS tiang_jtr_tumpang_gardu_idx ON public.tiang_jtr_tumpang (upper(gardu_kode), upper(ulp));
CREATE INDEX IF NOT EXISTS tiang_jtr_tumpang_induk_idx ON public.tiang_jtr_tumpang (induk_id);

COMMENT ON TABLE public.tiang_jtr_tumpang IS
  'Batang yang DIPINJAM jaringan JTR sebuah gardu (tiang JTM, atau tiang gardu lain). Satu batang tetap satu baris di `tiang`; di sini hanya keanggotaan JTR-nya: jurusan, induk JTR, nama JTR.';

ALTER TABLE public.tiang_jtr_tumpang ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tiang_jtr_tumpang_baca ON public.tiang_jtr_tumpang;
CREATE POLICY tiang_jtr_tumpang_baca ON public.tiang_jtr_tumpang FOR SELECT TO authenticated USING (true);
GRANT SELECT ON public.tiang_jtr_tumpang TO authenticated;
-- Penulisan HANYA lewat fungsi di bawah.


-- ── 2. Satu pohon JTR ────────────────────────────────────────────────────────
CREATE OR REPLACE VIEW public.jtr_tiang AS
SELECT
  t.id, t.kode, t.gardu_kode, t.ulp, t.jurusan, t.induk_id,
  t.lat, t.lng, t.status_hidup, t.created_at, t.penyulang, t.penanda, t.percabangan,
  t.jenis, t.tinggi, t.kondisi, t.andongan, t.tarikan_sr, t.arde_kondisi, t.arde_nilai_ohm,
  t.stay_jenis, t.stay_kondisi, t.rawan_row, t.jamperan, t.underbuild_tm, t.catatan_perbaikan,
  t.foto_temuan, t.dikonfirmasi_at,
  false AS menumpang, NULL::uuid AS tumpang_id
FROM public.tiang t
WHERE t.gardu_kode IS NOT NULL
UNION ALL
SELECT
  t.id, m.kode, upper(m.gardu_kode), upper(m.ulp), m.jurusan, m.induk_id,
  t.lat, t.lng,
  CASE WHEN m.status = 'aktif' THEN t.status_hidup ELSE 'lepas' END,
  m.created_at, t.penyulang, t.penanda, t.percabangan,
  t.jenis, t.tinggi, t.kondisi, t.andongan, t.tarikan_sr, t.arde_kondisi, t.arde_nilai_ohm,
  t.stay_jenis, t.stay_kondisi, t.rawan_row, t.jamperan, t.underbuild_tm, t.catatan_perbaikan,
  t.foto_temuan, t.dikonfirmasi_at,
  true, m.id
FROM public.tiang_jtr_tumpang m
JOIN public.tiang t ON t.id = m.tiang_id;

COMMENT ON VIEW public.jtr_tiang IS
  'Pohon JTR per gardu: tiang milik gardu (`tiang`) + batang pinjaman (`tiang_jtr_tumpang`). Titik & atribut selalu dari master `tiang` — satu batang, satu data fisik.';
GRANT SELECT ON public.jtr_tiang TO authenticated;


-- ── 3. Penamaan JTR jadi satu fungsi ─────────────────────────────────────────
-- Isinya aturan `tiang_buat_kode` yang terpasang, apa adanya; yang berubah
-- hanya SUMBERNYA — `jtr_tiang` (milik + pinjaman), sehingga nomor tiang
-- pinjaman dan tiang sendiri berada di satu deret yang sama. Variabel skalar,
-- bukan RECORD (jebakan plpgsql "record is not assigned yet").
CREATE OR REPLACE FUNCTION public.jtr_kode_baru(
  p_gardu TEXT, p_ulp TEXT, p_jurusan TEXT, p_induk_id UUID,
  p_lat DOUBLE PRECISION, p_lng DOUBLE PRECISION
) RETURNS TEXT
LANGUAGE plpgsql STABLE SET search_path = public AS $fn$
DECLARE
  g          TEXT := upper(p_gardu);
  u          TEXT := upper(p_ulp);
  prefiks    TEXT;
  nomor_maks INT;
  i_kode     TEXT;
  i_induk    UUID;
  i_lat      DOUBLE PRECISION;
  i_lng      DOUBLE PRECISION;
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
  kode_awal  TEXT;
  ada_anak   BOOLEAN := false;
BEGIN
  IF p_induk_id IS NULL THEN
    prefiks := g || '-' || p_jurusan;

    SELECT kode INTO kode_awal FROM public.jtr_tiang
    WHERE upper(gardu_kode) = g AND upper(ulp) = u AND jurusan = p_jurusan
      AND induk_id IS NULL AND status_hidup = 'aktif' AND kode ~ ('^' || prefiks || '[0-9]+$')
    ORDER BY created_at LIMIT 1;

    IF kode_awal IS NOT NULL THEN
      SELECT chr(97 + count(*)::int) INTO akhiran FROM public.jtr_tiang
      WHERE upper(gardu_kode) = g AND upper(ulp) = u AND status_hidup = 'aktif'
        AND kode ~ ('^' || kode_awal || '[a-z]$');
      RETURN kode_awal || akhiran;
    END IF;

    SELECT COALESCE(max((regexp_match(kode, '([0-9]+)[a-z]?$'))[1]::int), 0) INTO nomor_maks
    FROM public.jtr_tiang
    WHERE upper(gardu_kode) = g AND upper(ulp) = u AND status_hidup = 'aktif'
      AND kode ~ ('^' || prefiks || '[0-9]+[a-z]?$');
    RETURN prefiks || GREATEST(nomor_maks + 1, 2);
  END IF;

  -- Induk DI POHON JTR GARDU INI (nama JTR-nya, bisa nama pinjaman).
  SELECT kode, induk_id, lat, lng INTO i_kode, i_induk, i_lat, i_lng FROM public.jtr_tiang
  WHERE id = p_induk_id AND upper(gardu_kode) = g AND upper(ulp) = u
  ORDER BY menumpang LIMIT 1;
  IF i_kode IS NULL THEN RETURN NULL; END IF;

  arah_baru := public.arah_derajat(i_lat, i_lng, p_lat, p_lng);

  SELECT lat, lng INTO a_lat, a_lng FROM public.jtr_tiang
  WHERE induk_id = p_induk_id AND upper(gardu_kode) = g AND upper(ulp) = u AND status_hidup = 'aktif'
  ORDER BY created_at LIMIT 1;
  ada_anak := FOUND;

  IF ada_anak AND arah_baru IS NOT NULL THEN
    arah_anak := public.arah_derajat(i_lat, i_lng, a_lat, a_lng);
    IF arah_anak IS NOT NULL THEN
      selisih := abs(arah_baru - arah_anak);
      IF selisih > 180 THEN selisih := 360 - selisih; END IF;
      IF selisih <= 45 THEN
        SELECT chr(97 + count(*)::int) INTO akhiran FROM public.jtr_tiang
        WHERE upper(gardu_kode) = g AND upper(ulp) = u AND status_hidup = 'aktif'
          AND kode ~ ('^' || i_kode || '[a-z]$');
        RETURN i_kode || akhiran;
      END IF;
    END IF;
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
    prefiks := regexp_replace(i_kode, '[0-9]+[a-z]?$', '');
  ELSE
    huruf := COALESCE(public.arah_huruf(arah_baru), 'K');
    prefiks := i_kode || CASE WHEN ada_anak THEN '_' ELSE '' END || huruf;
  END IF;

  SELECT COALESCE(max((regexp_match(kode, '([0-9]+)[a-z]?$'))[1]::int), 0) INTO nomor_maks
  FROM public.jtr_tiang
  WHERE upper(gardu_kode) = g AND upper(ulp) = u AND status_hidup = 'aktif'
    AND kode ~ ('^' || prefiks || '[0-9]+[a-z]?$');
  RETURN prefiks || (nomor_maks + 1);
END $fn$;

-- Pemicu lama memakai fungsi bersama. Nama manual tetap dihormati; tiang JTM
-- (tanpa gardu/jurusan) tetap dinamai pemicunya sendiri.
CREATE OR REPLACE FUNCTION public.tiang_buat_kode()
RETURNS TRIGGER LANGUAGE plpgsql AS $fn$
BEGIN
  IF NEW.kode IS NOT NULL AND btrim(NEW.kode) <> '' THEN RETURN NEW; END IF;
  IF NEW.gardu_kode IS NULL OR NEW.jurusan IS NULL THEN RETURN NEW; END IF;
  NEW.kode := public.jtr_kode_baru(NEW.gardu_kode, NEW.ulp, NEW.jurusan, NEW.induk_id, NEW.lat, NEW.lng);
  RETURN NEW;
END $fn$;

CREATE OR REPLACE FUNCTION public.tiang_jtr_tumpang_kode()
RETURNS TRIGGER LANGUAGE plpgsql AS $fn$
DECLARE
  la DOUBLE PRECISION;
  lo DOUBLE PRECISION;
BEGIN
  NEW.gardu_kode := upper(NEW.gardu_kode);
  NEW.ulp := upper(NEW.ulp);
  IF NEW.kode IS NULL OR btrim(NEW.kode) = '' THEN
    SELECT lat, lng INTO la, lo FROM public.tiang WHERE id = NEW.tiang_id;
    NEW.kode := public.jtr_kode_baru(NEW.gardu_kode, NEW.ulp, NEW.jurusan, NEW.induk_id, la, lo);
  END IF;
  RETURN NEW;
END $fn$;
DROP TRIGGER IF EXISTS trg_tiang_jtr_tumpang_kode ON public.tiang_jtr_tumpang;
CREATE TRIGGER trg_tiang_jtr_tumpang_kode BEFORE INSERT ON public.tiang_jtr_tumpang
  FOR EACH ROW EXECUTE FUNCTION public.tiang_jtr_tumpang_kode();


-- ── 4. Tampilan JTR membaca `jtr_tiang` ──────────────────────────────────────
-- Kolom keluaran SAMA dengan yang terpasang, jadi CREATE OR REPLACE cukup dan
-- tampilan turunannya (jtr_inspeksi, jtr_penyapuan, ulp_jtr_panjang,
-- tiang_perlu_ditinjau, jtr_rekap_temuan, peta_daftar) tetap hidup.
-- Kabel batang pinjaman dihitung hanya yang milik gardu ini (atau tanpa
-- pemilik) — batang yang dipinjam dua gardu tidak menghitung kabelnya dua kali.

CREATE OR REPLACE VIEW public.tiang_gawang AS
SELECT t.id AS tiang_id,
    t.kode,
    t.gardu_kode,
    t.ulp,
    t.jurusan,
    t.induk_id,
    t.induk_id IS NULL AS pangkal,
    jarak_meter(t.lat::double precision, t.lng::double precision, COALESCE(p.lat::double precision, g.lat), COALESCE(p.lng::double precision, g.lng)) AS panjang_m
   FROM jtr_tiang t
     LEFT JOIN tiang p ON p.id = t.induk_id AND p.status_hidup = 'aktif'::text
     LEFT JOIN gardu g ON upper(g.kode) = upper(t.gardu_kode) AND upper(g.ulp) = upper(t.ulp)
  WHERE t.status_hidup = 'aktif'::text AND t.gardu_kode IS NOT NULL;

CREATE OR REPLACE VIEW public.tiang_gawang_kabel AS
SELECT t.id AS tiang_id,
    t.kode,
    t.gardu_kode,
    t.ulp,
    t.jurusan,
    k.id AS konduktor_id,
    k.nomor AS nomor_kabel,
    k.jenis,
    k.ukuran,
    COALESCE(k.induk_tiang_id, t.induk_id) AS hulu_id,
    k.induk_tiang_id IS NOT NULL AS hulu_ditunjuk,
    jarak_meter(t.lat::double precision, t.lng::double precision, COALESCE(h.lat::double precision, g.lat), COALESCE(h.lng::double precision, g.lng)) AS panjang_m,
    COALESCE(k.induk_tiang_id, t.induk_id) IS NULL OR k.induk_tiang_id IS NOT NULL OR (EXISTS ( SELECT 1
           FROM tiang_konduktor kp
          WHERE kp.tiang_id = t.induk_id AND kp.nomor = k.nomor)) AS tersambung
   FROM jtr_tiang t
     JOIN tiang_konduktor k ON k.tiang_id = t.id
      AND (NOT t.menumpang OR k.pemilik_gardu_kode IS NULL OR upper(k.pemilik_gardu_kode) = upper(t.gardu_kode))
     LEFT JOIN tiang h ON h.id = COALESCE(k.induk_tiang_id, t.induk_id) AND h.status_hidup = 'aktif'::text
     LEFT JOIN gardu g ON upper(g.kode) = upper(t.gardu_kode) AND upper(g.ulp) = upper(t.ulp)
  WHERE t.status_hidup = 'aktif'::text AND t.gardu_kode IS NOT NULL;

CREATE OR REPLACE VIEW public.gardu_jtr_panjang AS
WITH rute AS (
         SELECT tiang_gawang.gardu_kode,
            tiang_gawang.ulp,
            tiang_gawang.jurusan,
            count(*) AS jumlah_tiang,
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
                   FROM tiang_konduktor k
                  WHERE k.tiang_id = t.id))
          GROUP BY t.gardu_kode, t.ulp, t.jurusan
        ), penghantar AS (
         SELECT tiang_gawang_kabel.gardu_kode,
            tiang_gawang_kabel.ulp,
            tiang_gawang_kabel.jurusan,
            max(tiang_gawang_kabel.nomor_kabel) AS jumlah_kabel,
            sum(tiang_gawang_kabel.panjang_m) FILTER (WHERE tiang_gawang_kabel.tersambung) AS panjang_m,
            count(*) FILTER (WHERE NOT tiang_gawang_kabel.tersambung) AS gawang_terputus
           FROM tiang_gawang_kabel
          GROUP BY tiang_gawang_kabel.gardu_kode, tiang_gawang_kabel.ulp, tiang_gawang_kabel.jurusan
        )
 SELECT r.gardu_kode,
    r.ulp,
    r.jurusan,
    j.arah AS arah_jurusan,
    r.jumlah_tiang,
    COALESCE(p.jumlah_kabel, 0) AS jumlah_kabel,
    round((r.panjang_m / 1000::double precision)::numeric, 3) AS panjang_rute_km,
    round((COALESCE(p.panjang_m, r.panjang_m) / 1000::double precision)::numeric, 3) AS panjang_penghantar_km,
    round(r.rata_m::numeric, 1) AS rata_gawang_m,
    round(r.maks_m::numeric, 1) AS gawang_terpanjang_m,
    r.gawang_tanpa_titik,
    COALESCE(tk.jml, 0::bigint) AS tiang_tanpa_kabel,
    COALESCE(p.gawang_terputus, 0::bigint) AS gawang_terputus
   FROM rute r
     LEFT JOIN penghantar p ON p.gardu_kode = r.gardu_kode AND p.ulp = r.ulp AND p.jurusan = r.jurusan
     LEFT JOIN tanpa_kabel tk ON tk.gardu_kode = r.gardu_kode AND tk.ulp = r.ulp AND tk.jurusan = r.jurusan
     LEFT JOIN jurusan_ref j ON j.kode = r.jurusan;

CREATE OR REPLACE VIEW public.inspeksi_jtr_kelengkapan AS
SELECT id AS inspeksi_id,
    gardu_kode,
    ulp,
    ( SELECT count(*) AS count
           FROM jtr_tiang t
          WHERE upper(t.gardu_kode) = upper(i.gardu_kode) AND upper(t.ulp) = upper(i.ulp) AND t.status_hidup = 'aktif'::text) AS tiang_aktif,
    ( SELECT count(*) AS count
           FROM inspeksi_jtr_titik x
          WHERE x.inspeksi_id = i.id AND x.tiang_id IS NOT NULL) AS sudah_diperiksa,
    ( SELECT count(*) AS count
           FROM inspeksi_jtr_titik x
          WHERE x.inspeksi_id = i.id AND x.hasil_periksa = 'baru'::text) AS tiang_baru
   FROM inspeksi_jtr i;

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
            d.jurusan,
                CASE
                    WHEN k.nomor = 1 THEN d.tiang_kode
                    ELSE (d.tiang_kode || '.'::text) || k.nomor
                END AS tiang_kode,
            k.kondisi AS kabel_kondisi,
            k.aks_suspension,
            k.aks_large_angle,
            k.aks_dead_end,
            k.foto_temuan
           FROM dasar d
             JOIN tiang_konduktor k ON k.tiang_id = d.tiang_id
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
            'Tinggi'::text,
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
            'Sedang'::text,
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
            'Sedang'::text,
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
            'Sedang'::text,
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
            'Sedang'::text,
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
            'Ada catatan perbaikan'::text,
            'Sedang'::text,
            NULL::text
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
            'Sedang'::text,
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
            'Sedang'::text,
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
            'Sedang'::text,
            kabel.foto_temuan ->> 'aksDeadEnd'::text
           FROM kabel
          WHERE kabel.aks_dead_end IS NOT NULL AND NOT jtr_normal('kondisi_aksesoris'::text, kabel.aks_dead_end)) s;

CREATE OR REPLACE VIEW public.jtr_gawang_terputus AS
SELECT gk.gardu_kode,
    gk.ulp,
    gk.jurusan,
    gk.kode AS tiang_kode,
    gk.tiang_id,
    gk.nomor_kabel,
    gk.jenis,
    gk.ukuran,
    round(gk.panjang_m::numeric, 1) AS panjang_m,
    h.kode AS hulu_kode
   FROM tiang_gawang_kabel gk
     LEFT JOIN jtr_tiang h ON h.id = gk.hulu_id AND upper(h.gardu_kode) = upper(gk.gardu_kode) AND upper(h.ulp) = upper(gk.ulp)
  WHERE NOT gk.tersambung;

CREATE OR REPLACE VIEW public.peta_gardu AS
SELECT kode,
    nama,
    ulp,
    feeder,
    daya,
    lat,
    lng,
    ( SELECT count(*) AS count
           FROM jtr_tiang t
          WHERE upper(COALESCE(t.gardu_kode, ''::text)) = upper(g.kode) AND t.status_hidup = 'aktif'::text) AS jumlah_tiang
   FROM gardu g
  WHERE lat IS NOT NULL AND lng IS NOT NULL;


-- ── 5. Fungsi yang ikut tiang pinjaman ───────────────────────────────────────
CREATE OR REPLACE FUNCTION public.selesaikan_inspeksi_jtr(p_gardu text, p_ulp text, p_penyulang text DEFAULT NULL::text, p_nama text DEFAULT NULL::text, p_petugas_2 text DEFAULT NULL::text, p_catatan text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  id_sapu UUID;
  mulai   TIMESTAMPTZ;
BEGIN
  -- Penyapuan yang masih terbuka dipakai lagi, BEGITU JUGA yang sudah selesai
  -- HARI INI: menekan tombol dua kali tidak boleh melahirkan dua catatan.
  --
  -- Yang selesai di hari LAIN sengaja tidak diambil — menelusuri ulang gardu
  -- bulan depan memang penyapuan yang berbeda, dan riwayatnya harus terpisah
  -- supaya "kapan terakhir gardu ini dilihat" tetap bisa dijawab.
  SELECT id, created_at INTO id_sapu, mulai
  FROM public.inspeksi_jtr
  WHERE upper(gardu_kode) = upper(p_gardu)
    AND upper(ulp) = upper(p_ulp)
    AND (status IN ('Dijadwalkan', 'Dalam Proses')
         OR (status = 'Selesai' AND tgl_selesai = CURRENT_DATE))
  ORDER BY created_at DESC
  LIMIT 1;

  IF id_sapu IS NULL THEN
    INSERT INTO public.inspeksi_jtr (
      gardu_kode, ulp, penyulang, tgl_mulai, status,
      inspektor_uid, inspektor_nama, petugas_2, catatan
    ) VALUES (
      upper(p_gardu), upper(p_ulp), p_penyulang, CURRENT_DATE, 'Dalam Proses',
      auth.uid(), p_nama, p_petugas_2, p_catatan
    )
    RETURNING id, created_at INTO id_sapu, mulai;
  END IF;

  INSERT INTO public.inspeksi_jtr_titik (inspeksi_id, tiang_id, hasil_periksa, lat, lng)
  SELECT
    id_sapu,
    t.id,
    CASE WHEN t.created_at >= mulai - INTERVAL '1 day' THEN 'baru' ELSE 'cocok' END,
    t.lat,
    t.lng
  -- Tiang milik gardu ini DAN yang dipinjam (menumpang) — `jtr_tiang`.
  FROM public.jtr_tiang t
  WHERE upper(t.gardu_kode) = upper(p_gardu)
    AND upper(t.ulp) = upper(p_ulp)
    AND t.status_hidup = 'aktif'
  -- Syarat WHERE-nya harus disebut ulang: indeks uniknya parsial
  -- (`WHERE tiang_id IS NOT NULL`), dan ON CONFLICT tidak mengenali indeks
  -- parsial kalau predikatnya tidak dicantumkan.
  ON CONFLICT (inspeksi_id, tiang_id) WHERE tiang_id IS NOT NULL DO NOTHING;

  UPDATE public.inspeksi_jtr
  SET status = 'Selesai',
      tgl_selesai = CURRENT_DATE,
      inspektor_nama = COALESCE(p_nama, inspektor_nama),
      petugas_2 = COALESCE(p_petugas_2, petugas_2),
      catatan = COALESCE(p_catatan, catatan),
      updated_at = now()
  WHERE id = id_sapu;

  RETURN id_sapu;
END $function$;

CREATE OR REPLACE FUNCTION public.batalkan_tiang(p_id uuid, p_nama text DEFAULT NULL::text, p_alasan text DEFAULT NULL::text)
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
  SELECT (SELECT count(*) FROM public.tiang WHERE induk_id = p_id AND status_hidup = 'aktif')
       + (SELECT count(*) FROM public.tiang_jtr_tumpang WHERE induk_id = p_id AND status = 'aktif')
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
  -- tanpa menebak.
  SELECT count(*) INTO jml_tujuan
  FROM public.jtr_tiang
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

  -- Tiang pinjaman ikut pindah jurusan, namanya ikut disesuaikan.
  UPDATE public.tiang_jtr_tumpang
  SET jurusan = p_ke,
      kode = regexp_replace(kode, '^(' || upper(p_gardu) || '-)' || p_dari, '\1' || p_ke),
      updated_at = now()
  WHERE upper(gardu_kode) = upper(p_gardu) AND upper(ulp) = upper(p_ulp)
    AND jurusan = p_dari AND status = 'aktif';

  RETURN jml_pindah;
END $function$;


-- ── 6. Menumpang & melepas ───────────────────────────────────────────────────
-- Dipakai HP (kiriman J5a) maupun langsung. Idempoten: batang yang sudah
-- menjadi anggota gardu ini (milik atau pinjaman) dipulangkan apa adanya.
CREATE OR REPLACE FUNCTION public.tumpangi_tiang_jtr(
  p_gardu    TEXT,
  p_ulp      TEXT,
  p_jurusan  TEXT,
  p_tiang_id UUID,
  p_induk_id UUID DEFAULT NULL,
  p_nama     TEXT DEFAULT NULL,
  p_id_hp    UUID DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  g      TEXT := upper(btrim(COALESCE(p_gardu, '')));
  u      TEXT := upper(btrim(COALESCE(p_ulp, '')));
  v_role TEXT;
  v_unit TEXT;
  t_ulp  TEXT;
  t_stat TEXT;
  v_id   UUID;
  v_kode TEXT;
BEGIN
  SELECT role, unit INTO v_role, v_unit FROM public.user_roles WHERE user_id = auth.uid();
  IF v_role IS NULL THEN
    RAISE EXCEPTION 'Sesi tidak dikenali server. Keluar lalu masuk lagi, kemudian kirim ulang — isian tetap tersimpan di HP.';
  END IF;
  IF v_role <> 'UP3' AND upper(COALESCE(v_unit, '')) <> u THEN
    RAISE EXCEPTION 'Gardu ini milik ULP %, akun ini ULP %.', u, COALESCE(v_unit, '-');
  END IF;
  IF p_jurusan NOT IN ('A', 'B', 'C', 'D', 'K') THEN RAISE EXCEPTION 'Jurusan % tidak dikenal', COALESCE(p_jurusan, '-'); END IF;

  IF p_id_hp IS NOT NULL THEN
    SELECT id, kode INTO v_id, v_kode FROM public.tiang_jtr_tumpang WHERE id_hp = p_id_hp;
    IF v_id IS NOT NULL THEN
      RETURN jsonb_build_object('tumpang_id', v_id, 'tiang_id', p_tiang_id, 'kode', v_kode, 'sudah_ada', true);
    END IF;
  END IF;

  SELECT upper(ulp), status_hidup INTO t_ulp, t_stat FROM public.tiang WHERE id = p_tiang_id;
  IF t_stat IS NULL THEN RAISE EXCEPTION 'Tiang tidak ditemukan.'; END IF;
  IF t_stat <> 'aktif' THEN RAISE EXCEPTION 'Tiang itu sudah tidak aktif (%).', t_stat; END IF;
  IF t_ulp IS DISTINCT FROM u THEN RAISE EXCEPTION 'Tiang itu milik ULP %, gardu ini ULP %.', COALESCE(t_ulp, '-'), u; END IF;

  -- Sudah anggota gardu ini (milik sendiri atau pinjaman aktif)?
  SELECT kode INTO v_kode FROM public.jtr_tiang
  WHERE id = p_tiang_id AND upper(gardu_kode) = g AND upper(ulp) = u AND status_hidup = 'aktif'
  LIMIT 1;
  IF v_kode IS NOT NULL THEN
    RETURN jsonb_build_object('tiang_id', p_tiang_id, 'kode', v_kode, 'sudah_ada', true);
  END IF;

  IF p_induk_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.jtr_tiang WHERE id = p_induk_id AND upper(gardu_kode) = g AND upper(ulp) = u AND status_hidup = 'aktif'
  ) THEN
    RAISE EXCEPTION 'Tiang induk bukan bagian jaringan gardu %.', g;
  END IF;

  INSERT INTO public.tiang_jtr_tumpang (tiang_id, gardu_kode, ulp, jurusan, induk_id, id_hp, dibuat_oleh, dibuat_uid)
  VALUES (p_tiang_id, g, u, p_jurusan, p_induk_id, p_id_hp, p_nama, auth.uid())
  RETURNING id, kode INTO v_id, v_kode;

  INSERT INTO public.master_audit
    (entitas, entitas_kode, ulp, field, nilai_lama, nilai_baru, aksi, oleh_uid, oleh_nama)
  VALUES ('tiang', v_kode, u, 'tumpang_jtr', NULL,
          jsonb_build_object('gardu', g, 'jurusan', p_jurusan, 'tiang_id', p_tiang_id),
          'koreksi_lapangan', auth.uid(), p_nama);

  RETURN jsonb_build_object('tumpang_id', v_id, 'tiang_id', p_tiang_id, 'kode', v_kode, 'sudah_ada', false);
END $fn$;

CREATE OR REPLACE FUNCTION public.lepas_tumpang_jtr(p_tumpang_id UUID, p_alasan TEXT, p_nama TEXT DEFAULT NULL)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
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

  SELECT count(*) INTO jml FROM public.jtr_tiang
  WHERE induk_id = m_tiang AND upper(gardu_kode) = upper(m_gardu) AND upper(ulp) = upper(m_ulp) AND status_hidup = 'aktif';
  IF jml > 0 THEN
    RAISE EXCEPTION 'Tiang % masih menyuplai % tiang JTR. Pindahkan dulu sambungannya.', m_kode, jml;
  END IF;

  UPDATE public.tiang_jtr_tumpang SET status = 'lepas', catatan = btrim(p_alasan), updated_at = now()
  WHERE id = p_tumpang_id;
  INSERT INTO public.master_audit
    (entitas, entitas_kode, ulp, field, nilai_lama, nilai_baru, aksi, oleh_uid, oleh_nama)
  VALUES ('tiang', m_kode, m_ulp, 'tumpang_jtr', to_jsonb('aktif'::text),
          jsonb_build_object('status', 'lepas', 'alasan', p_alasan), 'batal_salah_input', auth.uid(), p_nama);
END $fn$;

GRANT EXECUTE ON FUNCTION public.tumpangi_tiang_jtr(TEXT, TEXT, TEXT, UUID, UUID, TEXT, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.lepas_tumpang_jtr(UUID, TEXT, TEXT) TO authenticated;
GRANT SELECT ON public.tiang_gawang, public.tiang_gawang_kabel, public.gardu_jtr_panjang,
  public.inspeksi_jtr_kelengkapan, public.inspeksi_jtr_temuan, public.jtr_gawang_terputus,
  public.peta_gardu TO authenticated;


-- ── Periksa ──────────────────────────────────────────────────────────────────
--   SELECT count(*) FROM jtr_tiang;                         -- = tiang JTR aktif+batal (3+1) sebelum ada pinjaman
--   SELECT * FROM gardu_jtr_panjang;                        -- sama dengan sebelum skrip
--   SELECT jtr_kode_baru('AI001','TANJUNG','D', NULL, NULL, NULL);  -- nama pangkal berikutnya
