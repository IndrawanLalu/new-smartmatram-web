-- =============================================================================
-- Peta Jaringan: koreksi JTR oleh admin + lapisan kabel
-- Keputusan user 1 Okt 2026. Jalankan manual di Supabase SQL Editor, SESUDAH
-- `peta-jaringan-hidup.sql` dan `wo-inspeksi-jtr.sql`. Idempoten.
--
-- Kejadian (AM263/AM054, 1 Okt): regu mencatat kabel JTR sebagai "posisi 3"
-- di tiang yang ada JTM-nya dan "posisi 1" di cabang tanpa JTM — satu kabel,
-- dua nomor. Sistem tak bisa menyambungkannya: bentang 43 m dan 31 m tidak
-- terhitung, dan kabel tunggal tampil sebagai "Underbuild 3".
--
--   1. `peta_tiang` — tiang JTR pertama bergaris ke gardunya; ditambah
--      `jumlah_kabel` (≥2 = underbuild JTR) dan `kabel_putus` (kabel yang
--      belum jelas datang dari tiang mana) untuk ditandai di peta.
--   2. `koreksi_induk_jtr`     — ganti induk tiang JTR (atau jadikan pangkal di gardu).
--   3. `ubah_nama_tiang_jtr`   — nama tiang diketik bebas, unik per gardu.
--   4. `ubah_kabel_jtr`        — nomor/jenis/ukuran kabel; nomor bisa
--                                 diterapkan ke seluruh tiang sesudahnya (hilir).
--   5. `ubah_jurusan_tiang_jtr` — pindah jurusan tiang (+ hilirnya), nama ikut.
--
-- Semuanya: admin ULP itu atau UP3 (`wajib_boleh_ulp`), tercatat di master_audit.
-- Tiang pinjaman (menumpang di batang gardu lain) diubah di `tiang_jtr_tumpang`,
-- tiang milik sendiri di `tiang`.
-- =============================================================================


-- ── 1. Peta ──────────────────────────────────────────────────────────────────
-- Disalin dari `peta-jaringan-hidup.sql`; yang berubah ditandai ★. Kolom baru
-- di BELAKANG (syarat CREATE OR REPLACE VIEW).
CREATE OR REPLACE VIEW public.peta_tiang AS
SELECT t.id,
       k.kode,
       t.ulp,
       t.lat,
       t.lng,
       t.penanda,
       t.percabangan,
       'jtm'::text          AS jaringan,
       k.penyulang          AS induk_kelompok,
       t.induk_id,
       p.lat                AS induk_lat,
       p.lng                AS induk_lng,
       NOT k.utama          AS menumpang,
       NULL::int            AS jumlah_kabel,
       false                AS kabel_putus
FROM public.tiang t
JOIN public.tiang_kode_penyulang k ON k.tiang_id = t.id
LEFT JOIN public.tiang p ON p.id = t.induk_id AND p.status_hidup = 'aktif'
WHERE t.gardu_kode IS NULL
  AND t.status_hidup = 'aktif' AND t.lat IS NOT NULL AND t.lng IS NOT NULL

UNION ALL

SELECT t.id, t.kode, t.ulp, t.lat, t.lng, t.penanda, t.percabangan,
       'jtm'::text, t.penyulang, t.induk_id, p.lat, p.lng, false,
       NULL::int, false
FROM public.tiang t
LEFT JOIN public.tiang p ON p.id = t.induk_id AND p.status_hidup = 'aktif'
WHERE t.gardu_kode IS NULL
  AND t.status_hidup = 'aktif' AND t.lat IS NOT NULL AND t.lng IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM public.tiang_kode_penyulang k WHERE k.tiang_id = t.id)

UNION ALL

SELECT j.id, j.kode, j.ulp, j.lat, j.lng, j.penanda, j.percabangan,
       'jtr'::text, j.gardu_kode, j.induk_id,
       -- ★ Tiang pertama (tanpa induk) bergaris ke gardunya.
       -- Koordinat gardu double precision, tiang numeric(12,8): disamakan ke
       -- tipe kolom lama view ini (CREATE OR REPLACE tidak boleh mengubahnya).
       (CASE WHEN j.induk_id IS NULL THEN g.lat::numeric ELSE p.lat END)::numeric(12,8),
       (CASE WHEN j.induk_id IS NULL THEN g.lng::numeric ELSE p.lng END)::numeric(12,8),
       j.menumpang,
       -- ★ Kabel JTR gardu ini di tiang ini; ≥2 = underbuild JTR.
       (SELECT count(*)::int FROM public.jtr_kabel kb
         WHERE kb.tiang_id = j.id AND kb.gardu = upper(j.gardu_kode)),
       -- ★ Ada kabel yang belum jelas datang dari tiang mana.
       EXISTS (SELECT 1 FROM public.tiang_gawang_kabel gk
                WHERE gk.tiang_id = j.id AND upper(gk.gardu_kode) = upper(j.gardu_kode) AND NOT gk.tersambung)
FROM public.jtr_tiang j
LEFT JOIN public.tiang p ON p.id = j.induk_id AND p.status_hidup = 'aktif'
LEFT JOIN public.gardu g ON upper(g.kode) = upper(j.gardu_kode) AND upper(g.ulp) = upper(j.ulp)
WHERE j.status_hidup = 'aktif' AND j.lat IS NOT NULL AND j.lng IS NOT NULL;

GRANT SELECT ON public.peta_tiang TO authenticated;


-- ── Pembantu: satu tiang JTR milik gardu tertentu ─────────────────────────────
-- Mengembalikan baris `jtr_tiang` (milik sendiri ATAU pinjaman) dan memeriksa
-- hak ULP. Dipakai semua fungsi di bawah.
CREATE OR REPLACE FUNCTION public._tiang_jtr_sunting(p_id UUID, p_gardu TEXT)
RETURNS public.jtr_tiang
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  r public.jtr_tiang;
BEGIN
  SELECT * INTO r FROM public.jtr_tiang
   WHERE id = p_id AND upper(gardu_kode) = upper(btrim(p_gardu)) AND status_hidup = 'aktif'
   LIMIT 1;
  IF r.id IS NULL THEN RAISE EXCEPTION 'Tiang JTR % tidak ditemukan', p_gardu; END IF;
  PERFORM public.wajib_boleh_ulp(r.ulp);
  RETURN r;
END $fn$;

-- Tiang ini dan seluruh tiang sesudahnya (hilir) di gardu yang sama.
CREATE OR REPLACE FUNCTION public._jtr_hilir(p_id UUID, p_gardu TEXT)
RETURNS TABLE (id UUID)
LANGUAGE sql STABLE SET search_path = public AS $fn$
  WITH RECURSIVE pohon AS (
    SELECT p_id AS id
    UNION
    SELECT j.id FROM public.jtr_tiang j JOIN pohon ON j.induk_id = pohon.id
     WHERE upper(j.gardu_kode) = upper(p_gardu) AND j.status_hidup = 'aktif'
  )
  SELECT id FROM pohon;
$fn$;


-- ── 2. Ganti induk ───────────────────────────────────────────────────────────
-- p_induk_id NULL = tiang ini berpangkal langsung di gardu.
CREATE OR REPLACE FUNCTION public.koreksi_induk_jtr(
  p_id UUID, p_gardu TEXT, p_induk_id UUID, p_alasan TEXT, p_nama TEXT DEFAULT NULL
) RETURNS TEXT
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  r     public.jtr_tiang;
  g     TEXT := upper(btrim(p_gardu));
  lama  TEXT;
  baru  TEXT;
  jtm   BOOLEAN;
BEGIN
  IF btrim(COALESCE(p_alasan, '')) = '' THEN RAISE EXCEPTION 'Alasan wajib diisi'; END IF;
  r := public._tiang_jtr_sunting(p_id, g);

  IF p_induk_id IS NOT NULL THEN
    SELECT kode INTO baru FROM public.jtr_tiang
     WHERE id = p_induk_id AND upper(gardu_kode) = g AND status_hidup = 'aktif' LIMIT 1;
    IF baru IS NULL THEN RAISE EXCEPTION 'Induk harus tiang JTR aktif gardu %', g; END IF;
    IF p_induk_id IN (SELECT id FROM public._jtr_hilir(p_id, g)) THEN
      RAISE EXCEPTION 'Induk melingkar: % ada di sesudah tiang %', baru, r.kode;
    END IF;
  END IF;
  SELECT kode INTO lama FROM public.jtr_tiang WHERE id = r.induk_id AND upper(gardu_kode) = g LIMIT 1;

  IF r.menumpang THEN
    UPDATE public.tiang_jtr_tumpang SET induk_id = p_induk_id, updated_at = now()
     WHERE tiang_id = p_id AND upper(gardu_kode) = g AND status = 'aktif';
  ELSE
    -- Batang JTM yang juga memikul JTR: induk JTR-nya di `induk_jtr_id`,
    -- `induk_id` milik JTM dan tidak disentuh.
    SELECT EXISTS (SELECT 1 FROM public.tiang_kode_penyulang WHERE tiang_id = p_id)
           OR (SELECT induk_jtr_id IS NOT NULL FROM public.tiang WHERE id = p_id)
      INTO jtm;
    IF jtm THEN
      IF p_induk_id IS NULL THEN
        RAISE EXCEPTION 'Tiang % juga tiang JTM — pangkal JTR-nya harus tiang, bukan gardu.', r.kode;
      END IF;
      UPDATE public.tiang SET induk_jtr_id = p_induk_id, updated_at = now() WHERE id = p_id;
    ELSE
      UPDATE public.tiang SET induk_id = p_induk_id, updated_at = now() WHERE id = p_id;
    END IF;
  END IF;

  INSERT INTO public.master_audit (entitas, entitas_kode, ulp, field, nilai_lama, nilai_baru, aksi, oleh_uid, oleh_nama)
  VALUES ('tiang', r.kode, r.ulp, 'induk',
          to_jsonb(COALESCE(lama, '(gardu)')),
          jsonb_build_object('induk', COALESCE(baru, '(gardu)'), 'alasan', p_alasan),
          'sunting_admin', auth.uid(), p_nama);
  RETURN COALESCE(baru, '(gardu)');
END $fn$;


-- ── 3. Nama tiang ────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.ubah_nama_tiang_jtr(
  p_id UUID, p_gardu TEXT, p_kode TEXT, p_nama TEXT DEFAULT NULL
) RETURNS TEXT
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  r    public.jtr_tiang;
  g    TEXT := upper(btrim(p_gardu));
  baru TEXT := upper(regexp_replace(btrim(COALESCE(p_kode, '')), '\s+', '', 'g'));
BEGIN
  r := public._tiang_jtr_sunting(p_id, g);
  IF baru = '' THEN RAISE EXCEPTION 'Nama tiang tidak boleh kosong'; END IF;
  IF baru = upper(r.kode) THEN RETURN baru; END IF;
  IF EXISTS (SELECT 1 FROM public.jtr_tiang WHERE upper(gardu_kode) = g AND upper(kode) = baru
               AND status_hidup = 'aktif' AND id <> p_id) THEN
    RAISE EXCEPTION 'Nama % sudah dipakai tiang lain di gardu %', baru, g;
  END IF;

  IF r.menumpang THEN
    UPDATE public.tiang_jtr_tumpang SET kode = baru, updated_at = now()
     WHERE tiang_id = p_id AND upper(gardu_kode) = g AND status = 'aktif';
  ELSE
    UPDATE public.tiang SET kode = baru, updated_at = now() WHERE id = p_id;
  END IF;

  INSERT INTO public.master_audit (entitas, entitas_kode, ulp, field, nilai_lama, nilai_baru, aksi, oleh_uid, oleh_nama)
  VALUES ('tiang', baru, r.ulp, 'kode', to_jsonb(r.kode), to_jsonb(baru), 'sunting_admin', auth.uid(), p_nama);
  RETURN baru;
END $fn$;


-- ── 4. Kabel ─────────────────────────────────────────────────────────────────
-- Nomor kabel = urutan kabel JTR gardu ini di tiang (JTM tidak dihitung);
-- 1 = kabel utama. `p_hilir` menerapkan NOMOR ke seluruh tiang sesudahnya yang
-- punya kabel bernomor lama — jenis/ukuran hanya di tiang ini, karena ukuran
-- kabel memang mengecil menuju ujung jalur.
-- Tiang yang sudah punya kabel bernomor baru dilewati (bukan ditimpa).
CREATE OR REPLACE FUNCTION public.ubah_kabel_jtr(
  p_id UUID, p_gardu TEXT, p_nomor_lama INT, p_nomor_baru INT,
  p_jenis TEXT DEFAULT NULL, p_ukuran TEXT DEFAULT NULL,
  p_hilir BOOLEAN DEFAULT false, p_nama TEXT DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  r       public.jtr_tiang;
  g       TEXT := upper(btrim(p_gardu));
  x       RECORD;
  diubah  INT := 0;
  bentrok TEXT[] := '{}';
BEGIN
  r := public._tiang_jtr_sunting(p_id, g);
  IF p_nomor_baru NOT BETWEEN 1 AND 3 THEN RAISE EXCEPTION 'Nomor kabel 1 sampai 3'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.jtr_kabel WHERE tiang_id = p_id AND gardu = g AND nomor = p_nomor_lama) THEN
    RAISE EXCEPTION 'Tiang % tidak punya kabel ke-% untuk gardu %', r.kode, p_nomor_lama, g;
  END IF;

  FOR x IN
    SELECT k.id AS konduktor_id, k.tiang_id, j.kode
      FROM public.jtr_kabel k
      JOIN public.jtr_tiang j ON j.id = k.tiang_id AND upper(j.gardu_kode) = g
     WHERE k.gardu = g AND k.nomor = p_nomor_lama
       AND k.tiang_id IN (SELECT id FROM public._jtr_hilir(p_id, g) WHERE p_hilir OR id = p_id)
  LOOP
    IF p_nomor_baru <> p_nomor_lama AND EXISTS (
         SELECT 1 FROM public.jtr_kabel k2 WHERE k2.tiang_id = x.tiang_id AND k2.gardu = g AND k2.nomor = p_nomor_baru) THEN
      bentrok := bentrok || x.kode;
      CONTINUE;
    END IF;
    UPDATE public.tiang_konduktor
       SET nomor  = p_nomor_baru,
           jenis  = CASE WHEN x.tiang_id = p_id THEN COALESCE(NULLIF(btrim(p_jenis), ''), jenis) ELSE jenis END,
           ukuran = CASE WHEN x.tiang_id = p_id THEN COALESCE(NULLIF(btrim(p_ukuran), ''), ukuran) ELSE ukuran END
     WHERE id = x.konduktor_id;
    diubah := diubah + 1;
  END LOOP;

  INSERT INTO public.master_audit (entitas, entitas_kode, ulp, field, nilai_lama, nilai_baru, aksi, oleh_uid, oleh_nama)
  VALUES ('tiang', r.kode, r.ulp, 'kabel',
          jsonb_build_object('nomor', p_nomor_lama),
          jsonb_build_object('nomor', p_nomor_baru, 'jenis', p_jenis, 'ukuran', p_ukuran,
                             'hilir', p_hilir, 'tiang_diubah', diubah, 'dilewati', bentrok),
          'sunting_admin', auth.uid(), p_nama);
  RETURN jsonb_build_object('diubah', diubah, 'dilewati', to_jsonb(bentrok));
END $fn$;


-- ── 5. Jurusan ───────────────────────────────────────────────────────────────
-- Tiang ini (+ hilirnya bila p_hilir) pindah jurusan; huruf jurusan di namanya
-- ikut diganti (AM263-A3_B2 → AM263-B3_B2), sama dengan `pindah_jurusan_tiang`.
CREATE OR REPLACE FUNCTION public.ubah_jurusan_tiang_jtr(
  p_id UUID, p_gardu TEXT, p_jurusan TEXT, p_hilir BOOLEAN DEFAULT true, p_nama TEXT DEFAULT NULL
) RETURNS INT
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
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
    n := n + 1;
  END LOOP;

  INSERT INTO public.master_audit (entitas, entitas_kode, ulp, field, nilai_lama, nilai_baru, aksi, oleh_uid, oleh_nama)
  VALUES ('tiang', r.kode, r.ulp, 'jurusan', to_jsonb(r.jurusan),
          jsonb_build_object('jurusan', ke, 'hilir', p_hilir, 'tiang_diubah', n),
          'sunting_admin', auth.uid(), p_nama);
  RETURN n;
END $fn$;


GRANT EXECUTE ON FUNCTION public.koreksi_induk_jtr(UUID, TEXT, UUID, TEXT, TEXT)               TO authenticated;
GRANT EXECUTE ON FUNCTION public.ubah_nama_tiang_jtr(UUID, TEXT, TEXT, TEXT)                    TO authenticated;
GRANT EXECUTE ON FUNCTION public.ubah_kabel_jtr(UUID, TEXT, INT, INT, TEXT, TEXT, BOOLEAN, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.ubah_jurusan_tiang_jtr(UUID, TEXT, TEXT, BOOLEAN, TEXT)         TO authenticated;
REVOKE EXECUTE ON FUNCTION public._tiang_jtr_sunting(UUID, TEXT) FROM PUBLIC;


-- ── Periksa ──────────────────────────────────────────────────────────────────
--   SELECT kode, jumlah_kabel, kabel_putus FROM peta_tiang
--    WHERE jaringan = 'jtr' AND induk_kelompok IN ('AM263', 'AM054') ORDER BY kode;
--   -- AM263: semua kabel 3 → 1 mulai tiang pertama:
--   --   SELECT ubah_kabel_jtr('<id AM263-A2>', 'AM263', 3, 1, NULL, NULL, true, 'admin');
