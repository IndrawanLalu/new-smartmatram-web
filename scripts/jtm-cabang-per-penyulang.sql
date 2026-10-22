-- =============================================================================
-- Tanda CABANG per penyulang (22 Okt 2026).
-- Jalankan SESUDAH jtm-nama-dobel.sql. Idempoten (aman diulang).
--
-- Gejala (user): ganti nama / generate di satu penyulang melewati tiang
-- underbuild yang bercabang di PENYULANG LAIN → namanya jadi …R001/…L001,
-- padahal di penyulang ini tiang itu lanjutan lurus.
-- Akar: `tiang.cabang_baru` satu tanda per BATANG, sedangkan nama per
-- penyulang. 22 Okt: 30 tiang bersama bertanda cabang, 52 pasangan
-- tiang–penyulang yang sebenarnya satu-satunya lanjutan tapi ikut "cabang".
--
--   1. tiang_kode_penyulang.cabang — NULL = ikut tanda batang (tiang satu
--      penyulang tidak berubah apa pun).
--   2. Isi awal untuk tiang BERSAMA yang bertanda cabang: dibaca dari namanya
--      sekarang di tiap penyulang (nama = induk + R/L + nnn → cabang; selain
--      itu lanjutan). TIDAK ada nama yang diganti di sini.
--   3. susun_nama_jtm membaca kp.cabang dulu (disalin dari jtm-nama-dobel.sql,
--      yang baru ditandai ★★).
--   4. terapkan_nama_jtm (Jadikan jalur utama, "dianggap cabang") menulis
--      tanda penyulang itu; tanda batang hanya untuk tiang tidak bersama
--      (disalin dari jtm-penamaan-baru.sql, yang baru ditandai ★).
-- =============================================================================

ALTER TABLE public.tiang_kode_penyulang ADD COLUMN IF NOT EXISTS cabang BOOLEAN;
COMMENT ON COLUMN public.tiang_kode_penyulang.cabang IS
  'Cabang (bukan lanjutan utama) di penyulang ini. NULL = ikut tiang.cabang_baru. Untuk tiang underbuild yang cabang di satu penyulang tapi lurus di penyulang lain.';

-- Tiang yang dinamai lebih dari satu penyulang (underbuild / tiang bersama).
CREATE OR REPLACE FUNCTION public._jtm_tiang_bersama(p_tiang_id UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SET search_path = public AS $$
  SELECT count(*) > 1 FROM public.tiang_kode_penyulang WHERE tiang_id = p_tiang_id
$$;

-- ── 2. Isi awal (hanya yang belum diisi) ─────────────────────────────────────
WITH calon AS (
  SELECT kp.tiang_id, kp.penyulang, kp.kode,
         (SELECT i.kode FROM public.tiang_kode_penyulang i
           WHERE i.tiang_id = COALESCE(kp.induk_id, public.jtm_leluhur_di_penyulang(t.induk_id, kp.penyulang))
             AND upper(i.penyulang) = upper(kp.penyulang)) AS induk_kode
  FROM public.tiang_kode_penyulang kp
  JOIN public.tiang t ON t.id = kp.tiang_id
  WHERE t.cabang_baru AND kp.cabang IS NULL AND public._jtm_tiang_bersama(kp.tiang_id)
)
UPDATE public.tiang_kode_penyulang kp
SET cabang = (c.induk_kode IS NOT NULL
              AND left(upper(c.kode), length(c.induk_kode)) = upper(c.induk_kode)
              AND upper(substr(c.kode, length(c.induk_kode) + 1)) ~ '^[RL]+[0-9]{3}[A-Z]?$'),
    updated_at = now()
FROM calon c
WHERE kp.tiang_id = c.tiang_id AND kp.penyulang = c.penyulang;


-- ── 3. Penamaan ──────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.susun_nama_jtm(
  p_penyulang   TEXT,
  p_ulp         TEXT,
  p_mulai       UUID DEFAULT NULL,
  p_nama_mulai  TEXT DEFAULT NULL,
  p_utama_paksa UUID DEFAULT NULL
) RETURNS TABLE (tiang_id UUID, lama TEXT, baru TEXT, induk_id UUID, cabang BOOLEAN, catatan TEXT)
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS $$
#variable_conflict use_column
DECLARE
  singkat  TEXT;
  v_ulp    TEXT := upper(btrim(COALESCE(p_ulp, '')));
  akar     RECORD;
  urut     INT := 0;
  pokok    INT := 0;
  ch       RECORD;
  nama_akar TEXT;
  kalah    RECORD;
  nama_induk TEXT;
  batas    INT;
BEGIN
  singkat := public.kode_singkat_penyulang(p_penyulang, p_ulp);
  IF singkat IS NULL THEN
    RAISE EXCEPTION 'Penyulang "%" belum punya kode singkat — atur di Pengaturan penyulang', p_penyulang;
  END IF;
  IF p_nama_mulai IS NOT NULL AND upper(btrim(p_nama_mulai)) !~ '[0-9]{3}$' THEN
    RAISE EXCEPTION 'Nama harus diakhiri tiga angka — contoh: PRM-020 atau PRM-015R001';
  END IF;

  DROP TABLE IF EXISTS _sn_simpul;
  CREATE TEMP TABLE _sn_simpul (
    id UUID PRIMARY KEY, induk UUID, lat DOUBLE PRECISION, lng DOUBLE PRECISION,
    cabang BOOLEAN, dibuat TIMESTAMPTZ, lama TEXT, arah_utama TEXT, pindah BOOLEAN DEFAULT false,
    sendiri BOOLEAN DEFAULT false,  -- ★ induknya diatur khusus di penyulang ini
    dalam INT                       -- ★ jumlah tiang dari pangkal (nama dobel)
  ) ON COMMIT DROP;
  DROP TABLE IF EXISTS _sn_hasil;
  CREATE TEMP TABLE _sn_hasil (
    id UUID, lama TEXT, baru TEXT, induk UUID, cabang BOOLEAN, catatan TEXT, urut INT
  ) ON COMMIT DROP;

  -- ★ Induk di penyulang ini: yang diatur khusus (titik pertemuan dua
  -- penyulang), kalau tidak ada baru naik lewat pohon batangnya.
  -- ★★ Cabang di penyulang ini: tanda per penyulang dulu (kp.cabang), baru
  -- tanda batang — tiang underbuild bisa cabang di satu penyulang tapi
  -- lanjutan utama di penyulang lain (jtm-cabang-per-penyulang.sql).
  INSERT INTO _sn_simpul (id, induk, lat, lng, cabang, dibuat, lama, arah_utama, sendiri)
  SELECT t.id, COALESCE(kp.induk_id, public.jtm_leluhur_di_penyulang(t.induk_id, p_penyulang)), t.lat, t.lng,
         COALESCE(kp.cabang, t.cabang_baru, false), t.created_at, kp.kode, t.arah_utama_dari_sini, kp.induk_id IS NOT NULL
  FROM public.tiang_kode_penyulang kp
  JOIN public.tiang t ON t.id = kp.tiang_id
  WHERE upper(kp.penyulang) = upper(p_penyulang) AND upper(kp.ulp) = v_ulp AND t.status_hidup = 'aktif';
  UPDATE _sn_simpul s SET induk = NULL
  WHERE s.induk IS NOT NULL AND NOT EXISTS (SELECT 1 FROM _sn_simpul x WHERE x.id = s.induk);

  -- Sisipan lama: tiang yang dititik DI ANTARA J dan anak utamanya tercatat
  -- sebagai saudara (induk keduanya J). Urutan jalurnya dipulihkan: anak yang
  -- lebih jauh (searah ±45°) dipindah menjadi anak tiang yang lebih dekat —
  -- tercatat di pratinjau sebagai "induk dipindah", diterapkan bersama nama.
  -- ★ Kecuali yang induknya diatur khusus: memindahnya akan menulis induk
  -- BATANG-nya, padahal batang itu milik penyulang lain.
  FOR ch IN SELECT x.id, x.induk, x.lat, x.lng FROM _sn_simpul x WHERE x.induk IS NOT NULL AND NOT x.cabang AND NOT x.sendiri LOOP
    UPDATE _sn_simpul c SET induk = pilih.id, pindah = true
    FROM (
      SELECT a.id FROM _sn_simpul a, _sn_simpul j
      WHERE j.id = ch.induk AND a.induk = ch.induk AND a.id <> ch.id AND NOT a.cabang
        AND public.jarak_meter(j.lat, j.lng, a.lat, a.lng) < public.jarak_meter(j.lat, j.lng, ch.lat, ch.lng)
        AND least(abs(public.arah_derajat(j.lat, j.lng, a.lat, a.lng) - public.arah_derajat(j.lat, j.lng, ch.lat, ch.lng)),
                  360 - abs(public.arah_derajat(j.lat, j.lng, a.lat, a.lng) - public.arah_derajat(j.lat, j.lng, ch.lat, ch.lng))) <= 45
      ORDER BY public.jarak_meter(a.lat, a.lng, ch.lat, ch.lng) LIMIT 1
    ) pilih
    WHERE c.id = ch.id;
  END LOOP;

  IF p_utama_paksa IS NOT NULL THEN
    IF NOT EXISTS (SELECT 1 FROM _sn_simpul WHERE id = p_utama_paksa AND induk IS NOT NULL) THEN
      RAISE EXCEPTION 'Tiang yang dijadikan jalur utama bukan anak tiang lain di penyulang ini';
    END IF;
    UPDATE _sn_simpul SET cabang = (id <> p_utama_paksa)
    WHERE induk = (SELECT induk FROM _sn_simpul WHERE id = p_utama_paksa);
  END IF;

  IF p_mulai IS NOT NULL AND NOT EXISTS (SELECT 1 FROM _sn_simpul WHERE id = p_mulai) THEN
    RAISE EXCEPTION 'Tiang itu belum punya nama di penyulang %', p_penyulang;
  END IF;

  FOR akar IN
    SELECT s.id, s.lama FROM _sn_simpul s
    WHERE (p_mulai IS NULL AND s.induk IS NULL) OR s.id = p_mulai
    ORDER BY s.dibuat, s.id
  LOOP
    IF p_mulai IS NOT NULL THEN
      nama_akar := upper(btrim(COALESCE(p_nama_mulai, akar.lama)));
    ELSE
      nama_akar := singkat || '-' || lpad((pokok + 1)::text, 3, '0');
    END IF;
    urut := public._jtm_sn_jalan(akar.id, nama_akar, singkat, urut);
    -- Nomor pokok terbesar sejauh ini — akar berikutnya mulai sesudahnya.
    SELECT greatest(pokok, COALESCE(max((regexp_match(r.baru, '([0-9]+)$'))[1]::int), 0)) INTO pokok
    FROM _sn_hasil r WHERE r.baru ~ ('^' || singkat || '-[0-9]+$');
  END LOOP;


  -- ★ Nama dobel (ganti nama sebagian pohon): tiang DI LUAR bagian ini yang
  -- memakai nama baru salah satu tiangnya. Yang LEBIH DEKAT KE PANGKAL (lebih
  -- sedikit tiang dari akarnya) menang. Tiang luar yang lebih ke ujung kalah:
  -- ia + hilirnya diberi nama ulang menurut aturan dari induknya (keputusan
  -- user 22 Okt 2026 — "biasanya yang salah yang di ujung"). Tiang luar yang
  -- lebih dekat pangkal tetap jadi bentrok (diblokir).
  IF p_mulai IS NOT NULL THEN
    WITH RECURSIVE d AS (
      SELECT x.id, 0 AS dalam FROM _sn_simpul x WHERE x.induk IS NULL
      UNION ALL
      SELECT x.id, d.dalam + 1 FROM _sn_simpul x JOIN d ON x.induk = d.id WHERE d.dalam < 5000
    )
    UPDATE _sn_simpul x SET dalam = d.dalam FROM d WHERE d.id = x.id;

    FOR putaran IN 1..50 LOOP
      SELECT x.id, x.induk, x.lama, r.baru AS nama, r.id AS pemenang INTO kalah
      FROM _sn_hasil r
      JOIN _sn_simpul w ON w.id = r.id
      JOIN _sn_simpul x ON upper(x.lama) = upper(r.baru)
      WHERE r.urut > 0
        AND NOT EXISTS (SELECT 1 FROM _sn_hasil y WHERE y.id = x.id)
        AND x.induk IS NOT NULL AND x.dalam IS NOT NULL AND w.dalam IS NOT NULL
        AND x.dalam > w.dalam
      ORDER BY x.dalam, x.id
      LIMIT 1;
      EXIT WHEN NOT FOUND;

      -- Nama tiang yang kalah = nama yang diberikan aturan dari induknya:
      -- telusuri dari induknya (dengan nama induk SESUDAH perubahan ini), lalu
      -- simpan hanya tiang yang kalah + hilirnya.
      SELECT COALESCE((SELECT y.baru FROM _sn_hasil y WHERE y.id = kalah.induk AND y.urut > 0 LIMIT 1),
                      (SELECT p.lama FROM _sn_simpul p WHERE p.id = kalah.induk))
        INTO nama_induk;
      -- Catatan "dianggap cabang" (urut -1) yang sudah ada disisihkan (-2)
      -- supaya bisa dibedakan dari yang lahir di penelusuran ini.
      UPDATE _sn_hasil SET urut = -2 WHERE urut = -1;
      batas := urut;
      urut := public._jtm_sn_jalan(kalah.induk, nama_induk, singkat, urut);
      DROP TABLE IF EXISTS _sn_hilir;
      CREATE TEMP TABLE _sn_hilir ON COMMIT DROP AS
      WITH RECURSIVE hilir AS (
        SELECT kalah.id AS id
        UNION
        SELECT x.id FROM _sn_simpul x JOIN hilir ON x.induk = hilir.id
      )
      SELECT id FROM hilir;
      -- Baris baru di luar hilir tiang yang kalah dibuang (saudara-saudaranya
      -- ikut tertelusuri dari induk yang sama, namanya tidak diubah).
      DELETE FROM _sn_hasil r
      WHERE (r.urut > batas OR r.urut = -1) AND r.id NOT IN (SELECT id FROM _sn_hilir);
      -- Tiang hilir yang sudah punya baris (tiang kalah sebelumnya yang ternyata
      -- di hilir tiang ini): baris lamanya diganti baris baru.
      DELETE FROM _sn_hasil r
      WHERE (r.urut BETWEEN 1 AND batas OR r.urut = -2) AND r.id IN (SELECT id FROM _sn_hilir);
      UPDATE _sn_hasil SET urut = -1 WHERE urut = -2;
      UPDATE _sn_hasil r
      SET catatan = 'nama dobel — ' || kalah.nama || ' dipakai tiang yang lebih dekat ke pangkal'
                    || COALESCE(' (dulu ' || (SELECT w.lama FROM _sn_simpul w WHERE w.id = kalah.pemenang) || ')', '')
                    || '; tiang ini diberi nama dari induknya'
      WHERE r.id = kalah.id AND r.urut > batas;
    END LOOP;
  END IF;

  -- Induk yang dipindah (sisipan) dicatat di baris tiangnya.
  UPDATE _sn_hasil r
  SET catatan = CASE WHEN r.catatan LIKE 'nama dobel%' THEN r.catatan || ' · ' ELSE '' END || 'induk dipindah ke ' || COALESCE((SELECT y.baru FROM _sn_hasil y WHERE y.id = r.induk AND y.urut > 0 LIMIT 1), 'tiang sisipan')
                || ' (tiang sisipan di antaranya)'
  FROM _sn_simpul x WHERE x.id = r.id AND x.pindah AND r.urut > 0;

  -- Catatan "dianggap cabang" dipindah ke baris tiangnya.
  UPDATE _sn_hasil r
  SET catatan = CASE WHEN r.catatan LIKE 'nama dobel%' THEN r.catatan || ' · ' || c.catatan ELSE c.catatan END, cabang = true
  FROM _sn_hasil c WHERE c.urut = -1 AND c.id = r.id AND r.urut > 0;
  DELETE FROM _sn_hasil WHERE urut = -1;

  -- Ganti nama sebagian pohon: nama baru tidak boleh dipakai tiang di luarnya.
  -- ★ Yang tersisa = tiang luar yang lebih dekat ke pangkal (atau sama jauh /
  -- tak terhubung ke pangkal) → tetap diblokir; plus nama yang terpakai dua
  -- kali di dalam hasil ini sendiri (bisa muncul dari nama ulang tiang kalah).
  IF p_mulai IS NOT NULL THEN
    UPDATE _sn_hasil r
    SET catatan = 'bentrok — ' || r.baru || ' sudah dipakai ' || COALESCE(x.lama, 'tiang lain')
                  || ' di luar bagian ini, yang lebih dekat ke pangkal'
    FROM _sn_simpul x
    WHERE upper(x.lama) = upper(r.baru)
      AND NOT EXISTS (SELECT 1 FROM _sn_hasil y WHERE y.id = x.id);
    UPDATE _sn_hasil r
    SET catatan = 'bentrok — ' || r.baru || ' terpakai dua tiang dalam perubahan ini'
    WHERE (r.catatan IS NULL OR r.catatan NOT LIKE 'bentrok%')
      AND EXISTS (SELECT 1 FROM _sn_hasil y WHERE y.id <> r.id AND upper(y.baru) = upper(r.baru));
  END IF;

  RETURN QUERY SELECT r.id, r.lama, r.baru, r.induk, r.cabang, r.catatan FROM _sn_hasil r ORDER BY r.urut;
END $$;

GRANT EXECUTE ON FUNCTION public.susun_nama_jtm(TEXT, TEXT, UUID, TEXT, UUID) TO authenticated;


-- ── 4. Terapkan ──────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.terapkan_nama_jtm(
  p_penyulang   TEXT,
  p_ulp         TEXT,
  p_mulai       UUID DEFAULT NULL,
  p_nama_mulai  TEXT DEFAULT NULL,
  p_utama_paksa UUID DEFAULT NULL,
  p_jumlah      INT DEFAULT NULL,
  p_oleh        TEXT DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
#variable_conflict use_column
DECLARE
  v_ulp   TEXT := upper(btrim(COALESCE(p_ulp, '')));
  total   INT;
  berubah INT;
  b       RECORD;
  induk_paksa UUID;
BEGIN
  PERFORM public.wajib_boleh_ulp(p_ulp);

  DROP TABLE IF EXISTS _sn_terap;
  CREATE TEMP TABLE _sn_terap ON COMMIT DROP AS
  SELECT * FROM public.susun_nama_jtm(p_penyulang, p_ulp, p_mulai, p_nama_mulai, p_utama_paksa);

  SELECT count(*), count(*) FILTER (WHERE lama IS DISTINCT FROM baru) INTO total, berubah FROM _sn_terap;
  IF p_jumlah IS NOT NULL AND total <> p_jumlah THEN
    RAISE EXCEPTION 'Jaringan berubah sejak pratinjau dibuat (% tiang, kini %). Pratinjau dimuat ulang — periksa lalu Terapkan lagi.', p_jumlah, total;
  END IF;
  SELECT * INTO b FROM _sn_terap WHERE catatan LIKE 'bentrok%' LIMIT 1;
  IF FOUND THEN
    RAISE EXCEPTION 'Nama % sudah dipakai tiang lain di penyulang % — pilih nama lain, atau ganti dulu tiang itu.', b.baru, p_penyulang;
  END IF;

  -- Tukar utama/cabang: penandanya ikut disimpan.
  -- ★ Per penyulang (tiang_kode_penyulang.cabang); tanda batang hanya untuk
  -- tiang yang tidak dinamai penyulang lain — tiang underbuild bisa cabang di
  -- penyulang lain dan tandanya tidak boleh tertimpa dari sini.
  IF p_utama_paksa IS NOT NULL THEN
    SELECT induk_id INTO induk_paksa FROM _sn_terap WHERE tiang_id = p_utama_paksa;
    UPDATE public.tiang_kode_penyulang kp SET cabang = (kp.tiang_id <> p_utama_paksa), updated_at = now()
    FROM _sn_terap r
    WHERE r.tiang_id = kp.tiang_id AND r.induk_id = induk_paksa
      AND upper(kp.penyulang) = upper(p_penyulang) AND upper(kp.ulp) = v_ulp;
    UPDATE public.tiang t SET cabang_baru = (t.id <> p_utama_paksa), updated_at = now()
    FROM _sn_terap r WHERE r.tiang_id = t.id AND r.induk_id = induk_paksa
      AND NOT public._jtm_tiang_bersama(t.id);
  END IF;
  -- Sisipan lama: induk tiang sesudahnya dipindah ke tiang sisipan (jalur lewat situ).
  INSERT INTO public.master_audit
    (entitas, entitas_kode, ulp, field, nilai_lama, nilai_baru, aksi, oleh_uid, oleh_nama)
  SELECT 'tiang', r.baru, v_ulp, 'induk',
         to_jsonb((SELECT kode FROM public.tiang WHERE id = t.induk_id)), to_jsonb((SELECT y.baru FROM _sn_terap y WHERE y.tiang_id = r.induk_id)),
         'generate_nama', auth.uid(), p_oleh
  FROM _sn_terap r JOIN public.tiang t ON t.id = r.tiang_id
  WHERE r.catatan LIKE 'induk dipindah%' AND t.induk_id IS DISTINCT FROM r.induk_id;
  UPDATE public.tiang t SET induk_id = r.induk_id, updated_at = now()
  FROM _sn_terap r WHERE r.tiang_id = t.id AND r.catatan LIKE 'induk dipindah%' AND t.induk_id IS DISTINCT FROM r.induk_id;

  -- Anak yang "dianggap cabang" ditandai cabang supaya penamaan berikutnya konsisten.
  -- ★ Per penyulang; tanda batang hanya untuk tiang yang tidak bersama.
  -- (catatan bisa berawalan "nama dobel — … · dianggap cabang …")
  UPDATE public.tiang_kode_penyulang kp SET cabang = true, updated_at = now()
  FROM _sn_terap r
  WHERE r.tiang_id = kp.tiang_id AND r.catatan LIKE '%dianggap cabang%'
    AND upper(kp.penyulang) = upper(p_penyulang) AND upper(kp.ulp) = v_ulp
    AND kp.cabang IS DISTINCT FROM true;
  UPDATE public.tiang t SET cabang_baru = true, updated_at = now()
  FROM _sn_terap r WHERE r.tiang_id = t.id AND r.catatan LIKE '%dianggap cabang%' AND NOT COALESCE(t.cabang_baru, false)
    AND NOT public._jtm_tiang_bersama(t.id);

  IF berubah = 0 THEN
    RETURN jsonb_build_object('total', total, 'berubah', 0);
  END IF;

  -- Nama sementara dulu: dua indeks unik (per penyulang & tiang aktif) tidak
  -- boleh bertabrakan di tengah penggantian.
  UPDATE public.tiang t SET kode = '~' || left(t.id::text, 8) || '~'
  FROM _sn_terap r, public.tiang_kode_penyulang kp
  WHERE r.tiang_id = t.id AND r.lama IS DISTINCT FROM r.baru
    AND kp.tiang_id = t.id AND upper(kp.penyulang) = upper(p_penyulang) AND kp.utama;
  UPDATE public.tiang_kode_penyulang kp SET kode = '~' || left(kp.tiang_id::text, 8) || '~'
  FROM _sn_terap r
  WHERE r.tiang_id = kp.tiang_id AND upper(kp.penyulang) = upper(p_penyulang) AND upper(kp.ulp) = v_ulp
    AND r.lama IS DISTINCT FROM r.baru;

  UPDATE public.tiang_kode_penyulang kp SET kode = r.baru, updated_at = now()
  FROM _sn_terap r
  WHERE r.tiang_id = kp.tiang_id AND upper(kp.penyulang) = upper(p_penyulang) AND upper(kp.ulp) = v_ulp
    AND r.lama IS DISTINCT FROM r.baru;
  UPDATE public.tiang t SET kode = r.baru, updated_at = now()
  FROM _sn_terap r, public.tiang_kode_penyulang kp
  WHERE r.tiang_id = t.id AND r.lama IS DISTINCT FROM r.baru
    AND kp.tiang_id = t.id AND upper(kp.penyulang) = upper(p_penyulang) AND kp.utama;

  -- Label segmen yang menyebut nama tiang (titik bertipe TIANG) ikut.
  UPDATE public.segmen s SET titik_awal_nama = r.baru || substr(s.titik_awal_nama, length(r.lama) + 1), updated_at = now()
  FROM _sn_terap r
  WHERE s.titik_awal_tiang_id = r.tiang_id AND s.titik_awal_jenis = 'TIANG'
    AND r.lama IS DISTINCT FROM r.baru AND upper(s.titik_awal_nama) LIKE upper(r.lama) || '%';
  UPDATE public.segmen s SET titik_akhir_nama = r.baru || substr(s.titik_akhir_nama, length(r.lama) + 1), updated_at = now()
  FROM _sn_terap r
  WHERE s.titik_akhir_tiang_id = r.tiang_id AND s.titik_akhir_jenis = 'TIANG'
    AND r.lama IS DISTINCT FROM r.baru AND upper(s.titik_akhir_nama) LIKE upper(r.lama) || '%';

  INSERT INTO public.master_audit
    (entitas, entitas_kode, ulp, field, nilai_lama, nilai_baru, aksi, oleh_uid, oleh_nama)
  SELECT 'tiang', r.baru, v_ulp, 'kode/' || upper(p_penyulang), to_jsonb(r.lama), to_jsonb(r.baru),
         CASE WHEN p_mulai IS NULL AND p_utama_paksa IS NULL THEN 'generate_nama' ELSE 'ganti_nama_hilir' END,
         auth.uid(), p_oleh
  FROM _sn_terap r WHERE r.lama IS DISTINCT FROM r.baru;

  RETURN jsonb_build_object('total', total, 'berubah', berubah);
END $$;

GRANT EXECUTE ON FUNCTION public.terapkan_nama_jtm(TEXT, TEXT, UUID, TEXT, UUID, INT, TEXT) TO authenticated;


-- ── Sesudah dijalankan ───────────────────────────────────────────────────────
-- Tanda per penyulang yang terisi:
--   SELECT kp.penyulang, kp.kode, kp.cabang FROM tiang_kode_penyulang kp
--   WHERE kp.cabang IS NOT NULL ORDER BY kp.tiang_id, kp.penyulang;
