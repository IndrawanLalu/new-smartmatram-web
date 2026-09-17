-- scripts/jtm-nama-penuh.sql
--
-- NAMA TIANG MEMBAWA SELURUH JALURNYA.
--
-- Diminta pemilik pekerjaan setelah melihat GUNUNG SARI, dan contohnya jelas:
--
--   GNN-003 bercabang       → ke utara  GNN-003_A1 · ke selatan GNN-003_C1
--   GNN-003_A37 membelok    → ke barat  GNN-003_A37D1
--   GNN-003_A47 bercabang   → ke timur  GNN-003_A47_B1
--
-- Satu aturan: TIAP BELOKAN DAN TIAP PERCABANGAN MENAMBAH RUAS pada nama
-- induknya. Percabangan memakai garis bawah, belokan tidak, dan nama induk
-- dibawa UTUH — tidak ditambatkan ke nomor pokok seperti sebelumnya.
--
-- Konsekuensinya sudah dihitung di data sebenarnya sebelum ini ditulis: pada
-- 252 tiang GUNUNG SARI, nama terpanjang 63 huruf dan rata-rata 30. Yang
-- memanjangkan bukan belokan melainkan percabangan — jalur terpanjangnya
-- melewati dua belas titik cabang. Pemilik pekerjaan menerima itu dengan angka
-- di depan mata, dan menyatakan rutenya memang sudah benar.
--
-- SATU ATURAN, SATU TEMPAT. Sebelumnya penamaan hidup di tiga fungsi — pemicu
-- saat menitik, penamaan saat menumpang, dan penomoran ulang — dan ketiganya
-- sempat berbeda. Di sini ketiganya memanggil `jtm_kode_anak`.
--
-- Prasyarat: jtm-nama.sql · jtm-percabangan.sql
-- Aman dijalankan berulang.


-- ── 1. Ambang belokan, bisa disetel ──────────────────────────────────────────

ALTER TABLE public.jtm_settings
  ADD COLUMN IF NOT EXISTS belok_maks_derajat DOUBLE PRECISION NOT NULL DEFAULT 60;

COMMENT ON COLUMN public.jtm_settings.belok_maks_derajat IS
  'Belokan sampai sebesar ini masih dianggap jalur yang sama dan meneruskan nomor. Di atasnya, deret huruf baru dimulai. 60 mengikuti JTR.';


-- ── 2. Satu-satunya tempat nama tiang disusun ────────────────────────────────

CREATE OR REPLACE FUNCTION public.jtm_kode_anak(
  p_induk_kode TEXT,                 -- nama induk DI PENYULANG INI; NULL = pangkal
  p_cabang     BOOLEAN,              -- induknya tiang percabangan
  p_belok      DOUBLE PRECISION,     -- sudut belok; NULL = tidak diketahui, dianggap lurus
  p_arah       DOUBLE PRECISION,     -- arah induk → tiang baru
  p_penyulang  TEXT,
  p_ulp        TEXT,
  p_singkat    TEXT,
  p_ambang     DOUBLE PRECISION DEFAULT 60
) RETURNS TEXT
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  prefiks TEXT;
  pokok   BOOLEAN;
  n       INT;
BEGIN
  IF p_induk_kode IS NULL THEN
    -- Pangkal penyulang. Tiga angka supaya deretnya terbaca urut.
    prefiks := p_singkat || '-';

  ELSIF COALESCE(p_cabang, false) THEN
    -- DI TIANG PERCABANGAN, SEMUA ANAKNYA memulai deret berhuruf — termasuk
    -- yang arahnya lurus. Itu maksud garis bawah: di sini jalurnya pecah, dan
    -- tidak ada satu pun anak yang berhak mewarisi deret induknya.
    prefiks := p_induk_kode || '_' || COALESCE(public.arah_huruf(p_arah), 'K');

  ELSIF p_belok IS NULL OR p_belok <= COALESCE(p_ambang, 60) THEN
    -- Jalur yang sama diteruskan: angka di belakang nama induk diganti.
    prefiks := regexp_replace(p_induk_kode, '[0-9]+[a-z]?$', '');

  ELSE
    -- Membelok, tapi tidak bercabang. Huruf ditempel TANPA garis bawah, dan
    -- nama induknya dibawa utuh — itulah yang membuat jalur bisa ditelusuri
    -- mundur dari namanya saja.
    prefiks := p_induk_kode || COALESCE(public.arah_huruf(p_arah), 'K');
  END IF;

  pokok := prefiks = p_singkat || '-';

  SELECT COALESCE(max((regexp_match(kode, '([0-9]+)[a-z]?$'))[1]::int), 0)
    INTO n
  FROM public.tiang_kode_penyulang
  WHERE upper(penyulang) = upper(p_penyulang)
    AND upper(ulp) = upper(p_ulp)
    AND kode ~ ('^' || prefiks || '[0-9]+[a-z]?$');

  RETURN prefiks || CASE WHEN pokok THEN lpad((n + 1)::text, 3, '0')
                         ELSE (n + 1)::text END;
END $$;

COMMENT ON FUNCTION public.jtm_kode_anak IS
  'Menyusun nama tiang dari nama induknya. Satu-satunya tempat aturan penamaan JTM hidup — pemicu saat menitik, penamaan saat menumpang, dan penomoran ulang semuanya memanggil ini.';


-- ── 3. Pemicu penamaan saat tiang lahir ──────────────────────────────────────
-- Menggantikan yang di `jtm-nama.sql`.

CREATE OR REPLACE FUNCTION public.tiang_buat_kode_jtm()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  singkat  TEXT;
  ambang   DOUBLE PRECISION;
  naik     UUID;
  l_id     UUID;
  l_kode   TEXT;
  l_lat    DOUBLE PRECISION;
  l_lng    DOUBLE PRECISION;
  l_induk  UUID;
  l_cabang BOOLEAN := false;
  hulu_lat DOUBLE PRECISION;
  hulu_lng DOUBLE PRECISION;
  anak_lat DOUBLE PRECISION;
  anak_lng DOUBLE PRECISION;
  ada_anak BOOLEAN := false;
  arah_baru DOUBLE PRECISION;
  arah_lama DOUBLE PRECISION;
  arah_anak DOUBLE PRECISION;
  belok    DOUBLE PRECISION;
  selisih  DOUBLE PRECISION;
  huruf    TEXT;
  n        INT := 0;
BEGIN
  IF NEW.kode IS NOT NULL AND btrim(NEW.kode) <> '' THEN RETURN NEW; END IF;
  IF NEW.penyulang IS NULL OR NEW.gardu_kode IS NOT NULL THEN RETURN NEW; END IF;

  singkat := public.kode_singkat_penyulang(NEW.penyulang, NEW.ulp);
  IF singkat IS NULL THEN
    RAISE EXCEPTION 'Penyulang "%" tidak bisa dibuatkan kode singkat', NEW.penyulang;
  END IF;
  IF NEW.feeder IS NULL THEN NEW.feeder := NEW.penyulang; END IF;

  SELECT belok_maks_derajat INTO ambang FROM public.jtm_ambang(NEW.ulp);

  -- Leluhur terdekat yang bernama DI PENYULANG INI.
  naik := NEW.induk_id;
  WHILE naik IS NOT NULL AND n < 500 LOOP
    SELECT k.kode, t.id, t.lat, t.lng, t.induk_id, t.percabangan
      INTO l_kode, l_id, l_lat, l_lng, l_induk, l_cabang
    FROM public.tiang t
    JOIN public.tiang_kode_penyulang k
      ON k.tiang_id = t.id AND upper(k.penyulang) = upper(NEW.penyulang)
    WHERE t.id = naik;
    EXIT WHEN l_id IS NOT NULL;
    SELECT induk_id INTO naik FROM public.tiang WHERE id = naik;
    n := n + 1;
  END LOOP;

  IF l_id IS NULL THEN
    NEW.kode := public.jtm_kode_anak(NULL, false, NULL, NULL,
                                     NEW.penyulang, COALESCE(NEW.ulp,'-'), singkat, ambang);
    RETURN NEW;
  END IF;

  arah_baru := public.arah_derajat(l_lat, l_lng, NEW.lat, NEW.lng);

  SELECT t.lat, t.lng INTO anak_lat, anak_lng
  FROM public.tiang t
  JOIN public.tiang_kode_penyulang k
    ON k.tiang_id = t.id AND upper(k.penyulang) = upper(NEW.penyulang)
  WHERE t.induk_id = l_id AND t.status_hidup = 'aktif'
  ORDER BY t.created_at LIMIT 1;
  ada_anak := FOUND;

  -- Sisipan: berdiri DI ANTARA leluhur dan anaknya. Arah saja tidak cukup —
  -- saudara yang searah juga lolos uji arah; yang benar-benar di antara pasti
  -- lebih dekat ke induk daripada anak itu.
  IF ada_anak AND arah_baru IS NOT NULL AND NOT COALESCE(NEW.cabang_baru, false) THEN
    arah_anak := public.arah_derajat(l_lat, l_lng, anak_lat, anak_lng);
    IF arah_anak IS NOT NULL THEN
      selisih := abs(arah_baru - arah_anak);
      IF selisih > 180 THEN selisih := 360 - selisih; END IF;
      IF selisih <= 45
         AND public.jarak_meter(l_lat, l_lng, NEW.lat, NEW.lng)
             < public.jarak_meter(l_lat, l_lng, anak_lat, anak_lng) THEN
        SELECT COALESCE(max(substring(kode from '([a-z])$')), '') INTO huruf
        FROM public.tiang_kode_penyulang
        WHERE upper(penyulang) = upper(NEW.penyulang)
          AND upper(ulp) = upper(COALESCE(NEW.ulp, '-'))
          AND kode ~ ('^' || l_kode || '[a-z]$');
        NEW.kode := l_kode || CASE WHEN huruf = '' THEN 'a' ELSE chr(ascii(huruf)+1) END;
        RETURN NEW;
      END IF;
    END IF;
  END IF;

  IF l_induk IS NOT NULL AND arah_baru IS NOT NULL THEN
    SELECT lat, lng INTO hulu_lat, hulu_lng FROM public.tiang WHERE id = l_induk;
    IF FOUND THEN
      arah_lama := public.arah_derajat(hulu_lat, hulu_lng, l_lat, l_lng);
      IF arah_lama IS NOT NULL THEN
        belok := abs(arah_baru - arah_lama);
        IF belok > 180 THEN belok := 360 - belok; END IF;
      END IF;
    END IF;
  END IF;

  NEW.kode := public.jtm_kode_anak(
    l_kode,
    l_cabang OR ada_anak OR COALESCE(NEW.cabang_baru, false),
    belok, arah_baru,
    NEW.penyulang, COALESCE(NEW.ulp, '-'), singkat, ambang);

  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_tiang_buat_kode_jtm ON public.tiang;
CREATE TRIGGER trg_tiang_buat_kode_jtm
  BEFORE INSERT ON public.tiang
  FOR EACH ROW EXECUTE FUNCTION public.tiang_buat_kode_jtm();


-- ── 4. Nama saat tiang menumpang penyulang lain ──────────────────────────────
-- Menggantikan yang di `jtm-nama.sql`: kini memakai aturan yang sama persis,
-- termasuk belokan dan percabangan.

CREATE OR REPLACE FUNCTION public.jtm_kode_penyulang_baru(
  p_tiang_id  UUID,
  p_penyulang TEXT,
  p_ulp       TEXT
) RETURNS TEXT
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  singkat  TEXT;
  ambang   DOUBLE PRECISION;
  t        RECORD;
  naik     UUID;
  l_id     UUID;
  l_kode   TEXT;
  l_lat    DOUBLE PRECISION;
  l_lng    DOUBLE PRECISION;
  l_induk  UUID;
  l_cabang BOOLEAN := false;
  hulu_lat DOUBLE PRECISION;
  hulu_lng DOUBLE PRECISION;
  arah_baru DOUBLE PRECISION;
  arah_lama DOUBLE PRECISION;
  belok    DOUBLE PRECISION;
  n        INT := 0;
BEGIN
  singkat := public.kode_singkat_penyulang(p_penyulang, p_ulp);
  IF singkat IS NULL THEN RETURN NULL; END IF;

  SELECT * INTO t FROM public.tiang WHERE id = p_tiang_id;
  IF NOT FOUND THEN RETURN NULL; END IF;

  SELECT belok_maks_derajat INTO ambang FROM public.jtm_ambang(p_ulp);

  naik := t.induk_id;
  WHILE naik IS NOT NULL AND n < 500 LOOP
    SELECT k.kode, x.id, x.lat, x.lng, x.induk_id, x.percabangan
      INTO l_kode, l_id, l_lat, l_lng, l_induk, l_cabang
    FROM public.tiang x
    JOIN public.tiang_kode_penyulang k
      ON k.tiang_id = x.id AND upper(k.penyulang) = upper(p_penyulang)
    WHERE x.id = naik;
    EXIT WHEN l_id IS NOT NULL;
    SELECT induk_id INTO naik FROM public.tiang WHERE id = naik;
    n := n + 1;
  END LOOP;

  IF l_id IS NULL THEN
    RETURN public.jtm_kode_anak(NULL, false, NULL, NULL, p_penyulang, p_ulp, singkat, ambang);
  END IF;

  arah_baru := public.arah_derajat(l_lat, l_lng, t.lat, t.lng);
  IF l_induk IS NOT NULL AND arah_baru IS NOT NULL THEN
    SELECT lat, lng INTO hulu_lat, hulu_lng FROM public.tiang WHERE id = l_induk;
    IF FOUND THEN
      arah_lama := public.arah_derajat(hulu_lat, hulu_lng, l_lat, l_lng);
      IF arah_lama IS NOT NULL THEN
        belok := abs(arah_baru - arah_lama);
        IF belok > 180 THEN belok := 360 - belok; END IF;
      END IF;
    END IF;
  END IF;

  RETURN public.jtm_kode_anak(l_kode, l_cabang, belok, arah_baru,
                              p_penyulang, p_ulp, singkat, ambang);
END $$;


-- ── 5. Penomoran ulang memakai aturan yang sama ──────────────────────────────
-- Menggantikan yang di `jtm-nama.sql`. Sebelumnya fungsi ini punya aturannya
-- sendiri — hanya memberi huruf di percabangan, tanpa aturan belokan — jadi
-- tiang yang dinomori ulang hari ini bisa bernama berbeda dari tiang yang
-- dititik besok di tempat yang sama persis.

CREATE OR REPLACE FUNCTION public.nomori_ulang_penyulang_jtm(
  p_penyulang TEXT,
  p_ulp       TEXT,
  p_oleh      TEXT DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  singkat  TEXT;
  ambang   DOUBLE PRECISION;
  r        RECORD;
  v_kode   TEXT;
  induk_kode TEXT;
  i_lat    DOUBLE PRECISION;
  i_lng    DOUBLE PRECISION;
  i_induk  UUID;
  i_cabang BOOLEAN;
  h_lat    DOUBLE PRECISION;
  h_lng    DOUBLE PRECISION;
  arah_baru DOUBLE PRECISION;
  arah_lama DOUBLE PRECISION;
  belok    DOUBLE PRECISION;
  n_ubah   INT := 0;
  n_total  INT := 0;
BEGIN
  singkat := public.kode_singkat_penyulang(p_penyulang, p_ulp);
  IF singkat IS NULL THEN RAISE EXCEPTION 'Penyulang % tidak dikenal', p_penyulang; END IF;

  SELECT belok_maks_derajat INTO ambang FROM public.jtm_ambang(p_ulp);

  -- Nama sementara di KEDUA tabel: indeks uniknya berdiri di dua tempat, dan
  -- menggeser 001 jadi 002 bertabrakan dengan 002 yang masih hidup.
  UPDATE public.tiang_kode_penyulang
  SET kode = '~' || left(tiang_id::text, 8) || '~'
  WHERE upper(penyulang) = upper(p_penyulang) AND upper(ulp) = upper(p_ulp);

  UPDATE public.tiang
  SET kode = '~' || left(id::text, 8) || '~'
  WHERE upper(COALESCE(penyulang, '')) = upper(p_penyulang)
    AND upper(COALESCE(ulp, '')) = upper(p_ulp)
    AND status_hidup = 'aktif';

  FOR r IN
    WITH RECURSIVE bernama AS (
      SELECT k.tiang_id, t.induk_id, t.created_at
      FROM public.tiang_kode_penyulang k
      JOIN public.tiang t ON t.id = k.tiang_id
      WHERE upper(k.penyulang) = upper(p_penyulang) AND upper(k.ulp) = upper(p_ulp)
    ),
    jalur AS (
      SELECT b.tiang_id, b.induk_id, ARRAY[b.created_at] AS urut, 0 AS dalam
      FROM bernama b
      WHERE b.induk_id IS NULL
         OR NOT EXISTS (SELECT 1 FROM bernama x WHERE x.tiang_id = b.induk_id)
      UNION ALL
      SELECT a.tiang_id, a.induk_id, j.urut || a.created_at, j.dalam + 1
      FROM bernama a JOIN jalur j ON a.induk_id = j.tiang_id
      WHERE j.dalam < 2000
    )
    SELECT j.tiang_id, t.induk_id, t.lat, t.lng
    FROM jalur j JOIN public.tiang t ON t.id = j.tiang_id
    ORDER BY j.urut
  LOOP
    n_total := n_total + 1;
    induk_kode := NULL; belok := NULL; arah_baru := NULL;

    IF r.induk_id IS NOT NULL THEN
      SELECT k.kode, x.lat, x.lng, x.induk_id, x.percabangan
        INTO induk_kode, i_lat, i_lng, i_induk, i_cabang
      FROM public.tiang x
      LEFT JOIN public.tiang_kode_penyulang k
        ON k.tiang_id = x.id AND upper(k.penyulang) = upper(p_penyulang)
      WHERE x.id = r.induk_id;

      IF induk_kode LIKE '~%' THEN induk_kode := NULL; END IF;

      IF induk_kode IS NOT NULL THEN
        arah_baru := public.arah_derajat(i_lat, i_lng, r.lat, r.lng);
        IF i_induk IS NOT NULL AND arah_baru IS NOT NULL THEN
          SELECT lat, lng INTO h_lat, h_lng FROM public.tiang WHERE id = i_induk;
          IF FOUND THEN
            arah_lama := public.arah_derajat(h_lat, h_lng, i_lat, i_lng);
            IF arah_lama IS NOT NULL THEN
              belok := abs(arah_baru - arah_lama);
              IF belok > 180 THEN belok := 360 - belok; END IF;
            END IF;
          END IF;
        END IF;
      END IF;
    END IF;

    v_kode := public.jtm_kode_anak(induk_kode, COALESCE(i_cabang, false),
                                   belok, arah_baru,
                                   p_penyulang, p_ulp, singkat, ambang);

    UPDATE public.tiang_kode_penyulang
    SET kode = v_kode, updated_at = now()
    WHERE tiang_id = r.tiang_id AND upper(penyulang) = upper(p_penyulang);

    UPDATE public.tiang SET kode = v_kode, updated_at = now()
    WHERE id = r.tiang_id AND upper(COALESCE(penyulang, '')) = upper(p_penyulang);

    n_ubah := n_ubah + 1;
  END LOOP;

  -- Tiang yang pohonnya terputus tetap harus bernama, bukan tertinggal '~'.
  FOR r IN
    SELECT tiang_id FROM public.tiang_kode_penyulang
    WHERE upper(penyulang) = upper(p_penyulang) AND upper(ulp) = upper(p_ulp)
      AND kode LIKE '~%'
  LOOP
    v_kode := public.jtm_kode_penyulang_baru(r.tiang_id, p_penyulang, p_ulp);
    UPDATE public.tiang_kode_penyulang SET kode = v_kode, updated_at = now()
    WHERE tiang_id = r.tiang_id AND upper(penyulang) = upper(p_penyulang);
    UPDATE public.tiang SET kode = v_kode WHERE id = r.tiang_id
      AND upper(COALESCE(penyulang, '')) = upper(p_penyulang);
    n_ubah := n_ubah + 1;
  END LOOP;

  INSERT INTO public.master_audit
    (entitas, entitas_kode, ulp, field, nilai_lama, nilai_baru, aksi, oleh_uid, oleh_nama)
  VALUES ('penyulang', upper(p_penyulang), upper(p_ulp), 'nomor_tiang',
          to_jsonb(n_total), to_jsonb(n_ubah), 'nomor_ulang', auth.uid(), p_oleh);

  RETURN jsonb_build_object('penyulang', p_penyulang, 'tiang', n_total, 'diubah', n_ubah);
END $$;


GRANT EXECUTE ON FUNCTION public.jtm_kode_anak TO authenticated;
