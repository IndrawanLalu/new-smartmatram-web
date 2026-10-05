-- ════════════════════════════════════════════════════════════════════════════
-- Induk per penyulang — titik pertemuan dua penyulang (5 Okt 2026)
-- ════════════════════════════════════════════════════════════════════════════
-- Kasus: LBSM Sampoerna. Batangnya milik PERUMNAS (PRM-024R008, induk
-- PRM-024R007); BATU DAWA berakhir di tiang yang sama (BTW-001, menumpang).
-- Satu tiang hanya punya SATU induk, jadi:
--   • peta lapisan BATU DAWA menarik garis ke PRM-024R007 (bentang Perumnas);
--   • penamaan tidak menemukan leluhur BATU DAWA lewat pohon batang, lalu
--     menganggap tiang itu PANGKAL BATU DAWA → "BTW-001" padahal ia UJUNG.
--
-- Model "menumpang" cocok untuk underbuild (dua penyulang berjalan bersama),
-- tidak untuk titik pertemuan (keduanya datang dari arah berbeda).
--
--   • `tiang_kode_penyulang.induk_id` — induk tiang ini DI PENYULANG ITU.
--     NULL = ikut batang (semua underbuild yang ada tidak berubah). Hanya untuk
--     penyulang yang menumpang; induk pemilik tetap `tiang.induk_id`.
--   • `atur_induk_penyulang` — admin dari peta (HP menyusul).
--   • `peta_tiang` & `susun_nama_jtm` membaca induk per penyulang.
--   • Simulasi buka TIDAK diubah: tetap mengikuti pohon batang (aliran dari
--     pemilik); titik pertemuan normalnya terbuka.
--
-- Jalankan SESUDAH jtm-kode-gardu.sql (peta_tiang di sini memuat kolomnya).
-- ════════════════════════════════════════════════════════════════════════════

ALTER TABLE public.tiang_kode_penyulang
  ADD COLUMN IF NOT EXISTS induk_id UUID REFERENCES public.tiang(id) ON DELETE SET NULL;
COMMENT ON COLUMN public.tiang_kode_penyulang.induk_id IS
  'Induk tiang ini di penyulang ini (titik pertemuan dua penyulang). NULL = ikut induk batangnya.';


-- ── 1. Induk efektif satu tiang di satu penyulang ────────────────────────────
CREATE OR REPLACE FUNCTION public.jtm_induk_di_penyulang(p_tiang UUID, p_penyulang TEXT)
RETURNS UUID LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $fn$
  SELECT COALESCE(
    (SELECT kp.induk_id FROM public.tiang_kode_penyulang kp
      WHERE kp.tiang_id = p_tiang AND upper(kp.penyulang) = upper(p_penyulang)),
    public.jtm_leluhur_di_penyulang((SELECT t.induk_id FROM public.tiang t WHERE t.id = p_tiang), p_penyulang))
$fn$;


-- ── 2. Mengatur induk per penyulang (admin, dari peta) ───────────────────────
CREATE OR REPLACE FUNCTION public.atur_induk_penyulang(
  p_tiang_id  UUID,
  p_penyulang TEXT,
  p_induk_id  UUID,          -- NULL = kembali ikut batang
  p_oleh      TEXT DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  t      RECORD;
  kp     RECORD;
  i_kode TEXT;
  lama   TEXT;
  naik   UUID;
  n      INT := 0;
BEGIN
  SELECT * INTO t FROM public.tiang WHERE id = p_tiang_id;
  IF NOT FOUND OR t.status_hidup <> 'aktif' THEN RAISE EXCEPTION 'Tiang tidak ditemukan atau sudah dibatalkan'; END IF;
  PERFORM public.penyulang_wajib_boleh(t.ulp);

  SELECT * INTO kp FROM public.tiang_kode_penyulang
   WHERE tiang_id = p_tiang_id AND upper(penyulang) = upper(p_penyulang);
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Tiang % tidak punya nama di penyulang %', t.kode, p_penyulang;
  END IF;
  IF kp.utama THEN
    RAISE EXCEPTION '% pemilik batang ini — induknya diatur lewat Ganti induk', p_penyulang;
  END IF;

  IF p_induk_id IS NOT NULL THEN
    IF p_induk_id = p_tiang_id THEN RAISE EXCEPTION 'Tiang tidak bisa jadi induk dirinya sendiri'; END IF;
    SELECT k2.kode INTO i_kode
    FROM public.tiang_kode_penyulang k2 JOIN public.tiang t2 ON t2.id = k2.tiang_id
    WHERE k2.tiang_id = p_induk_id AND upper(k2.penyulang) = upper(p_penyulang) AND t2.status_hidup = 'aktif';
    IF i_kode IS NULL THEN
      RAISE EXCEPTION 'Induk harus tiang aktif yang bernama di penyulang %', p_penyulang;
    END IF;
    -- Tidak boleh melingkar: naik dari calon induk tidak boleh bertemu tiang ini.
    naik := p_induk_id;
    WHILE naik IS NOT NULL AND n < 5000 LOOP
      IF naik = p_tiang_id THEN
        RAISE EXCEPTION '% ada di hilir % di penyulang % — jaringan jadi melingkar', i_kode, kp.kode, p_penyulang;
      END IF;
      naik := public.jtm_induk_di_penyulang(naik, p_penyulang);
      n := n + 1;
    END LOOP;
  END IF;

  SELECT k3.kode INTO lama FROM public.tiang_kode_penyulang k3
   WHERE k3.tiang_id = kp.induk_id AND upper(k3.penyulang) = upper(p_penyulang);

  UPDATE public.tiang_kode_penyulang SET induk_id = p_induk_id, updated_at = now()
  WHERE tiang_id = p_tiang_id AND upper(penyulang) = upper(p_penyulang);

  INSERT INTO public.master_audit
    (entitas, entitas_kode, ulp, field, nilai_lama, nilai_baru, aksi, oleh_uid, oleh_nama)
  VALUES ('tiang', kp.kode, COALESCE(t.ulp, '-'), 'induk_penyulang',
          jsonb_build_object('penyulang', kp.penyulang, 'induk', lama),
          jsonb_build_object('penyulang', kp.penyulang, 'induk', i_kode, 'lewat', 'peta'),
          'sunting_admin', auth.uid(), p_oleh);

  RETURN jsonb_build_object('kode', kp.kode, 'penyulang', kp.penyulang, 'induk', i_kode);
END $fn$;

GRANT EXECUTE ON FUNCTION public.atur_induk_penyulang(UUID, TEXT, UUID, TEXT) TO authenticated;


-- ── 3. Penamaan membaca induk per penyulang (disalin dari jtm-penamaan-baru.sql; ★) ──
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
  n        UUID;
  k        TEXT;
  s_id     UUID[];
  s_kode   TEXT[];
  urut     INT := 0;
  pokok    INT := 0;
  m        RECORD;
  ch       RECORD;
  u_id     UUID;
  arah_u   DOUBLE PRECISION;
  h        RECORD;
  masuk    DOUBLE PRECISION;
  sisi     TEXT;
  nama_akar TEXT;
  anak_id  UUID[];
  anak_kd  TEXT[];
  jml_r    INT;
  jml_l    INT;
  awalan   TEXT;
  angka    INT;
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
    sendiri BOOLEAN DEFAULT false   -- ★ induknya diatur khusus di penyulang ini
  ) ON COMMIT DROP;
  DROP TABLE IF EXISTS _sn_hasil;
  CREATE TEMP TABLE _sn_hasil (
    id UUID, lama TEXT, baru TEXT, induk UUID, cabang BOOLEAN, catatan TEXT, urut INT
  ) ON COMMIT DROP;

  -- ★ Induk di penyulang ini: yang diatur khusus (titik pertemuan dua
  -- penyulang), kalau tidak ada baru naik lewat pohon batangnya.
  INSERT INTO _sn_simpul (id, induk, lat, lng, cabang, dibuat, lama, arah_utama, sendiri)
  SELECT t.id, COALESCE(kp.induk_id, public.jtm_leluhur_di_penyulang(t.induk_id, p_penyulang)), t.lat, t.lng,
         COALESCE(t.cabang_baru, false), t.created_at, kp.kode, t.arah_utama_dari_sini, kp.induk_id IS NOT NULL
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
    s_id := ARRAY[akar.id];
    s_kode := ARRAY[nama_akar];

    WHILE cardinality(s_id) > 0 LOOP
      n := s_id[cardinality(s_id)];
      k := s_kode[cardinality(s_kode)];
      s_id := s_id[1:cardinality(s_id) - 1];
      s_kode := s_kode[1:cardinality(s_kode) - 1];
      SELECT * INTO m FROM _sn_simpul WHERE id = n;
      urut := urut + 1;
      INSERT INTO _sn_hasil VALUES (n, m.lama, k, m.induk, m.cabang, NULL, urut);
      IF k ~ ('^' || singkat || '-[0-9]+$') THEN
        pokok := greatest(pokok, (regexp_match(k, '([0-9]+)$'))[1]::int);
      END IF;

      -- Anak jalur utama: yang bukan cabang, tertua dulu. Anak bukan-cabang
      -- lainnya dianggap cabang (satu tiang, satu lanjutan utama).
      SELECT id INTO u_id FROM _sn_simpul WHERE induk = n AND NOT cabang ORDER BY dibuat, id LIMIT 1;

      -- Arah jalur utama yang keluar dari n (untuk sisi R/L cabang).
      arah_u := NULL;
      IF u_id IS NOT NULL THEN
        SELECT public.arah_derajat(m.lat, m.lng, x.lat, x.lng) INTO arah_u FROM _sn_simpul x WHERE x.id = u_id;
      ELSE
        SELECT lat, lng INTO h FROM _sn_simpul WHERE id = m.induk;
        masuk := public.arah_derajat(h.lat, h.lng, m.lat, m.lng);
        IF masuk IS NOT NULL THEN
          arah_u := (masuk + CASE m.arah_utama WHEN 'kanan' THEN 90 WHEN 'kiri' THEN 270 ELSE 0 END)::numeric % 360;
        END IF;
      END IF;

      -- Cabang: R sebelum L, lalu tertua. Disusun dulu, didorong ke tumpukan
      -- terbalik supaya keluar berurutan sesudah jalur utama.
      anak_id := '{}'; anak_kd := '{}'; jml_r := 0; jml_l := 0;
      FOR ch IN
        SELECT x.id, x.cabang, public._jtm_sisi(arah_u, public.arah_derajat(m.lat, m.lng, x.lat, x.lng)) AS sisi
        FROM _sn_simpul x
        WHERE x.induk = n AND x.id IS DISTINCT FROM u_id
        ORDER BY 3 DESC, x.dibuat, x.id     -- 'R' > 'L'
      LOOP
        IF ch.sisi = 'R' THEN jml_r := jml_r + 1; sisi := repeat('R', jml_r);
        ELSE jml_l := jml_l + 1; sisi := repeat('L', jml_l); END IF;
        anak_id := anak_id || ch.id;
        anak_kd := anak_kd || (k || sisi || '001');
        IF NOT ch.cabang THEN
          INSERT INTO _sn_hasil VALUES (ch.id, NULL, NULL, NULL, NULL,
            'dianggap cabang — ' || k || ' sudah punya lanjutan utama', -1);
        END IF;
      END LOOP;
      FOR i IN REVERSE cardinality(anak_id)..1 LOOP
        s_id := s_id || anak_id[i];
        s_kode := s_kode || anak_kd[i];
      END LOOP;

      IF u_id IS NOT NULL THEN
        awalan := regexp_replace(k, '[0-9]+[a-z]?$', '');
        angka  := COALESCE((regexp_match(k, '([0-9]+)[a-z]?$'))[1]::int, 0);
        s_id := s_id || u_id;
        s_kode := s_kode || (awalan || lpad((angka + 1)::text, 3, '0'));
      END IF;
    END LOOP;
  END LOOP;

  -- Induk yang dipindah (sisipan) dicatat di baris tiangnya.
  UPDATE _sn_hasil r
  SET catatan = 'induk dipindah ke ' || COALESCE((SELECT y.baru FROM _sn_hasil y WHERE y.id = r.induk AND y.urut > 0 LIMIT 1), 'tiang sisipan')
                || ' (tiang sisipan di antaranya)'
  FROM _sn_simpul x WHERE x.id = r.id AND x.pindah AND r.urut > 0;

  -- Catatan "dianggap cabang" dipindah ke baris tiangnya.
  UPDATE _sn_hasil r SET catatan = c.catatan, cabang = true
  FROM _sn_hasil c WHERE c.urut = -1 AND c.id = r.id AND r.urut > 0;
  DELETE FROM _sn_hasil WHERE urut = -1;

  -- Ganti nama sebagian pohon: nama baru tidak boleh dipakai tiang di luarnya.
  IF p_mulai IS NOT NULL THEN
    UPDATE _sn_hasil r
    SET catatan = 'bentrok — ' || r.baru || ' sudah dipakai ' || COALESCE(x.lama, 'tiang lain') || ' di luar bagian ini'
    FROM _sn_simpul x
    WHERE upper(x.lama) = upper(r.baru)
      AND NOT EXISTS (SELECT 1 FROM _sn_hasil y WHERE y.id = x.id);
  END IF;

  RETURN QUERY SELECT r.id, r.lama, r.baru, r.induk, r.cabang, r.catatan FROM _sn_hasil r ORDER BY r.urut;
END $$;

GRANT EXECUTE ON FUNCTION public.susun_nama_jtm(TEXT, TEXT, UUID, TEXT, UUID) TO authenticated;


-- ── 4. peta_tiang: garis ke induk di penyulang itu (disalin dari jtm-kode-gardu.sql; ★) ──
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
       COALESCE(k.induk_id, t.induk_id) AS induk_id,               -- ★
       p.lat                AS induk_lat,
       p.lng                AS induk_lng,
       NOT k.utama          AS menumpang,
       NULL::int            AS jumlah_kabel,
       false                AS kabel_putus,
       false                AS di_jtm,
       NULL::text           AS gardu_bersama,
       NULL::text           AS nomor_kabel,
       t.pasangan_portal_dari,
       t.gardu_di_tiang
FROM public.tiang t
JOIN public.tiang_kode_penyulang k ON k.tiang_id = t.id
-- ★ Induk di penyulang INI: titik pertemuan dua penyulang punya induk sendiri
-- di tiap penyulang; selebihnya ikut batang.
LEFT JOIN public.tiang p ON p.id = COALESCE(k.induk_id, t.induk_id) AND p.status_hidup = 'aktif'
WHERE t.gardu_kode IS NULL
  AND t.status_hidup = 'aktif' AND t.lat IS NOT NULL AND t.lng IS NOT NULL

UNION ALL

SELECT t.id, t.kode, t.ulp, t.lat, t.lng, t.penanda, t.percabangan,
       'jtm'::text, t.penyulang, t.induk_id, p.lat, p.lng, false,
       NULL::int, false, false, NULL::text, NULL::text,
       t.pasangan_portal_dari,
       t.gardu_di_tiang
FROM public.tiang t
LEFT JOIN public.tiang p ON p.id = t.induk_id AND p.status_hidup = 'aktif'
WHERE t.gardu_kode IS NULL
  AND t.status_hidup = 'aktif' AND t.lat IS NOT NULL AND t.lng IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM public.tiang_kode_penyulang k WHERE k.tiang_id = t.id)

UNION ALL

SELECT j.id, j.kode, j.ulp, j.lat, j.lng, j.penanda, j.percabangan,
       'jtr'::text, j.gardu_kode, j.induk_id,
       (CASE WHEN j.induk_id IS NULL THEN g.lat::numeric ELSE p.lat END)::numeric(12,8),
       (CASE WHEN j.induk_id IS NULL THEN g.lng::numeric ELSE p.lng END)::numeric(12,8),
       j.menumpang,
       (SELECT count(*)::int FROM public.jtr_kabel kb
         WHERE kb.tiang_id = j.id AND kb.gardu = upper(j.gardu_kode)),
       EXISTS (SELECT 1 FROM public.tiang_gawang_kabel gk
                WHERE gk.tiang_id = j.id AND upper(gk.gardu_kode) = upper(j.gardu_kode) AND NOT gk.tersambung),
       COALESCE(j.underbuild_tm, false)
         OR (j.menumpang AND EXISTS (SELECT 1 FROM public.tiang_kode_penyulang kp WHERE kp.tiang_id = j.id)),
       NULLIF(concat_ws(', ',
         (SELECT string_agg(DISTINCT upper(o.gardu_kode), ', ') FROM public.jtr_tiang o
           WHERE o.id = j.id AND upper(o.gardu_kode) <> upper(j.gardu_kode) AND o.status_hidup = 'aktif'),
         CASE
           WHEN NOT bt.jtr_gardu_lain THEN NULL
           WHEN bt.jtr_gardu_lain_kode IS NULL THEN
             CASE WHEN NOT EXISTS (SELECT 1 FROM public.jtr_tiang o2
                                    WHERE o2.id = j.id AND upper(o2.gardu_kode) <> upper(j.gardu_kode) AND o2.status_hidup = 'aktif')
                  THEN '?' END
           WHEN upper(bt.jtr_gardu_lain_kode) <> upper(j.gardu_kode)
                AND NOT EXISTS (SELECT 1 FROM public.jtr_tiang o2
                                 WHERE o2.id = j.id AND upper(o2.gardu_kode) = upper(bt.jtr_gardu_lain_kode) AND o2.status_hidup = 'aktif')
             THEN upper(bt.jtr_gardu_lain_kode)
         END), ''),
       (SELECT string_agg(kb.nomor::text, ',' ORDER BY kb.nomor) FROM public.jtr_kabel kb
         WHERE kb.tiang_id = j.id AND kb.gardu = upper(j.gardu_kode)),
       NULL::uuid,
       NULL::text
FROM public.jtr_tiang j
LEFT JOIN public.tiang p ON p.id = j.induk_id AND p.status_hidup = 'aktif'
LEFT JOIN public.gardu g ON upper(g.kode) = upper(j.gardu_kode) AND upper(g.ulp) = upper(j.ulp)
JOIN public.tiang bt ON bt.id = j.id
WHERE j.status_hidup = 'aktif' AND j.lat IS NOT NULL AND j.lng IS NOT NULL;

GRANT SELECT ON public.peta_tiang TO authenticated;


-- ── Sesudah dijalankan ───────────────────────────────────────────────────────
-- LBSM Sampoerna diatur dari peta: buka PRM-024R008 → "Induk di BATU DAWA" →
-- klik BTW-025L002. Lalu Generate ulang nama BATU DAWA (BTW-001 jadi turunan
-- BTW-025L002).
--   SELECT tiang_id, penyulang, kode, induk_id FROM tiang_kode_penyulang WHERE induk_id IS NOT NULL;
