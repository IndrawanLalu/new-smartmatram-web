-- =============================================================================
-- X1 — Section JTM: Penyulang → Section → Segmen (22 Okt 2026)
-- Rencana: rencana-section-segmen.md. Jalankan SESUDAH jtm-tambah-pulihkan-tiang.sql.
-- Idempoten (aman diulang).
--
-- Keputusan user 22 Okt:
--   • Section = bagian penyulang di antara keypoint. Batas HANYA penanda
--     recloser / lbs / lbsm (+ pangkal penyulang). FCO, PENG, 3Y bukan batas.
--   • Nama section OTOMATIS dari keypoint hulunya ("REC. MALOMBA"); section
--     pertama = nama pangkal penyulang ("GI AMPENAN").
--
-- Section DITURUNKAN dari pohon tiang, tidak pernah diketik:
--   • pohon per penyulang = pohon penamaan (induk di penyulang itu, kalau tidak
--     ada naik lewat batang — susun_nama_jtm);
--   • tiap keypoint MILIK penyulang itu membuka section baru ke hilirnya
--     (tiang bersama: pemilik peralatan = pilihan admin, kalau belum pemilik
--     tiang — aturan jtm_pemilik_penanda); keypoint tanpa hilir tidak membuka
--     section;
--   • identitas = (penyulang, ulp, tiang hulu) — id stabil selama keypoint ada.
-- Disimpan sebagai hasil hitung (section, section_tiang). Perubahan tiang
-- hanya MENANDAI penyulangnya kotor; dihitung ulang saat dibaca (pola
-- penyulang_rute / segarkan_rute_kotor) — menulis tetap murah.
--
-- Segmen tidak berubah di X1. Laporan `segmen_lintas_section`: segmen yang
-- isinya ada di dua section atau lebih (bahan Pecah di X3). Segmen yang hanya
-- BERUJUNG di keypoint (keypoint = hulu section berikutnya) tidak dihitung.
-- =============================================================================


-- ── 1. Tabel ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.section (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  penyulang     TEXT NOT NULL,
  ulp           TEXT NOT NULL,
  tiang_hulu_id UUID NOT NULL REFERENCES public.tiang(id) ON DELETE CASCADE,
  jenis_hulu    TEXT NOT NULL,          -- 'pangkal' | 'recloser' | 'lbs' | 'lbsm'
  nama          TEXT NOT NULL,
  jumlah_tiang  INT NOT NULL DEFAULT 0,
  panjang_km    NUMERIC(10,3) NOT NULL DEFAULT 0,
  diperbarui_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS section_hulu_unik ON public.section (upper(penyulang), upper(ulp), tiang_hulu_id);
CREATE INDEX IF NOT EXISTS section_penyulang_idx ON public.section (upper(penyulang), upper(ulp));
COMMENT ON TABLE public.section IS
  'Section JTM = bagian penyulang di antara keypoint (recloser/lbs/lbsm milik penyulang itu). DITURUNKAN dari pohon tiang oleh susun_section_penyulang — jangan ditulis aplikasi.';

CREATE TABLE IF NOT EXISTS public.section_tiang (
  section_id UUID NOT NULL REFERENCES public.section(id) ON DELETE CASCADE,
  tiang_id   UUID NOT NULL REFERENCES public.tiang(id) ON DELETE CASCADE,
  PRIMARY KEY (section_id, tiang_id)
);
CREATE INDEX IF NOT EXISTS section_tiang_tiang_idx ON public.section_tiang (tiang_id);

-- Penanda kotor per penyulang.
CREATE TABLE IF NOT EXISTS public.penyulang_section (
  penyulang     TEXT NOT NULL,
  ulp           TEXT NOT NULL,
  kotor         BOOLEAN NOT NULL DEFAULT true,
  disusun_at    TIMESTAMPTZ,
  PRIMARY KEY (penyulang, ulp)
);

ALTER TABLE public.section ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.section_tiang ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.penyulang_section ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "auth baca section" ON public.section;
CREATE POLICY "auth baca section" ON public.section FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "auth baca section_tiang" ON public.section_tiang;
CREATE POLICY "auth baca section_tiang" ON public.section_tiang FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "auth baca penyulang_section" ON public.penyulang_section;
CREATE POLICY "auth baca penyulang_section" ON public.penyulang_section FOR SELECT TO authenticated USING (true);
GRANT SELECT ON public.section, public.section_tiang, public.penyulang_section TO authenticated;


-- ── 2. Batas section ─────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.section_jenis_batas(p_penanda TEXT)
RETURNS BOOLEAN LANGUAGE sql IMMUTABLE AS $$
  SELECT COALESCE(lower(p_penanda) IN ('recloser', 'lbs', 'lbsm'), false)
$$;
COMMENT ON FUNCTION public.section_jenis_batas IS
  'Penanda yang membuka section baru (keputusan user 22 Okt 2026): recloser, LBS, LBSM. FCO/PENG/3Y bukan batas section.';

CREATE OR REPLACE FUNCTION public.section_label_hulu(p_penanda TEXT, p_nama TEXT, p_kode TEXT)
RETURNS TEXT LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE lower(p_penanda) WHEN 'recloser' THEN 'REC. ' WHEN 'lbs' THEN 'LBS. ' WHEN 'lbsm' THEN 'LBSM. ' ELSE '' END
         || COALESCE(NULLIF(upper(btrim(p_nama)), ''), p_kode)
$$;


-- ── 3. Susun section satu penyulang ──────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.susun_section_penyulang(p_penyulang TEXT, p_ulp TEXT)
RETURNS INT
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_p   TEXT := upper(btrim(p_penyulang));
  v_u   TEXT := upper(btrim(COALESCE(p_ulp, '-')));
  pangkal TEXT;
  n     INT;
BEGIN
  DROP TABLE IF EXISTS _sc_simpul;
  CREATE TEMP TABLE _sc_simpul (
    id UUID PRIMARY KEY, induk UUID, batas BOOLEAN, penanda TEXT, nama_alat TEXT, kode TEXT,
    lat DOUBLE PRECISION, lng DOUBLE PRECISION, hulu UUID
  ) ON COMMIT DROP;

  -- Pohon penamaan penyulang ini (sama dengan susun_nama_jtm).
  INSERT INTO _sc_simpul (id, induk, batas, penanda, nama_alat, kode, lat, lng)
  SELECT t.id, COALESCE(kp.induk_id, public.jtm_leluhur_di_penyulang(t.induk_id, kp.penyulang)),
         public.section_jenis_batas(t.penanda), lower(t.penanda), t.nama_peralatan, kp.kode, t.lat, t.lng
  FROM public.tiang_kode_penyulang kp
  JOIN public.tiang t ON t.id = kp.tiang_id
  WHERE upper(kp.penyulang) = v_p AND upper(kp.ulp) = v_u AND t.status_hidup = 'aktif';
  UPDATE _sc_simpul s SET induk = NULL
  WHERE s.induk IS NOT NULL AND NOT EXISTS (SELECT 1 FROM _sc_simpul x WHERE x.id = s.induk);

  -- Tiang bersama: peralatan hanya membatasi section penyulang PEMILIKNYA —
  -- yang dipilih admin di peta (penanda_penyulang), kalau belum dipilih
  -- pemilik tiangnya (aturan jtm_pemilik_penanda; view itu sendiri tidak
  -- dipakai — dihitung penuh tiap dibaca, ±1,5 dtk).
  UPDATE _sc_simpul s SET batas = false
  FROM public.tiang t
  WHERE s.batas AND t.id = s.id
    AND (SELECT count(*) FROM public.tiang_kode_penyulang k WHERE k.tiang_id = s.id) >= 2
    AND v_p <> upper(COALESCE(
          (SELECT k.penyulang FROM public.tiang_kode_penyulang k
            WHERE k.tiang_id = s.id AND upper(k.penyulang) = upper(t.penanda_penyulang) LIMIT 1),
          (SELECT k.penyulang FROM public.tiang_kode_penyulang k WHERE k.tiang_id = s.id AND k.utama LIMIT 1),
          t.penyulang, ''));
  -- Keypoint tanpa hilir di penyulang ini (ujung jaringan / titik pertemuan
  -- tempat penyulang ini berakhir) tidak membuka section.
  UPDATE _sc_simpul s SET batas = false
  WHERE s.batas AND NOT EXISTS (SELECT 1 FROM _sc_simpul c WHERE c.induk = s.id);

  -- Hulu tiap tiang: keypoint terdekat di hulunya (dirinya sendiri bila keypoint), atau pangkal.
  WITH RECURSIVE w AS (
    SELECT s.id, s.id AS hulu, 0 AS dalam FROM _sc_simpul s WHERE s.induk IS NULL
    UNION ALL
    SELECT c.id, CASE WHEN c.batas THEN c.id ELSE w.hulu END, w.dalam + 1
    FROM _sc_simpul c JOIN w ON c.induk = w.id
    WHERE w.dalam < 5000
  )
  UPDATE _sc_simpul s SET hulu = w.hulu FROM w WHERE w.id = s.id;

  -- Nama pangkal penyulang: titik awal segmen pertamanya (GI / PLTD / GH …).
  SELECT public.segmen_label_titik(sg.titik_awal_jenis, sg.titik_awal_nama) INTO pangkal
  FROM public.segmen sg
  WHERE upper(sg.penyulang) = v_p AND upper(sg.ulp) = v_u AND sg.status = 'aktif'
    AND (sg.titik_awal_jenis IN ('GI', 'PLTD', 'PMT')
         OR sg.titik_awal_jenis IN (SELECT upper(r.kode) FROM public.jtm_ref r WHERE r.kategori = 'pangkal'))
  ORDER BY sg.created_at LIMIT 1;

  -- Baris section: dipertahankan (id stabil) bila hulunya sama.
  INSERT INTO public.section (penyulang, ulp, tiang_hulu_id, jenis_hulu, nama)
  SELECT v_p, v_u, h.id,
         CASE WHEN h.batas THEN h.penanda ELSE 'pangkal' END,
         CASE WHEN h.batas THEN public.section_label_hulu(h.penanda, h.nama_alat, h.kode)
              ELSE COALESCE(pangkal, 'Pangkal ' || h.kode) END
  FROM _sc_simpul h
  WHERE h.id IN (SELECT DISTINCT hulu FROM _sc_simpul WHERE hulu IS NOT NULL)
  ON CONFLICT (upper(penyulang), upper(ulp), tiang_hulu_id) DO UPDATE
    SET jenis_hulu = EXCLUDED.jenis_hulu, nama = EXCLUDED.nama;

  DELETE FROM public.section sc
  WHERE upper(sc.penyulang) = v_p AND upper(sc.ulp) = v_u
    AND sc.tiang_hulu_id NOT IN (SELECT DISTINCT hulu FROM _sc_simpul WHERE hulu IS NOT NULL);

  DELETE FROM public.section_tiang x
  USING public.section sc
  WHERE sc.id = x.section_id AND upper(sc.penyulang) = v_p AND upper(sc.ulp) = v_u;

  INSERT INTO public.section_tiang (section_id, tiang_id)
  SELECT sc.id, s.id
  FROM _sc_simpul s
  JOIN public.section sc ON sc.tiang_hulu_id = s.hulu AND upper(sc.penyulang) = v_p AND upper(sc.ulp) = v_u;

  -- Ringkasan. Bentang tiang → induknya masuk section tiang itu, KECUALI
  -- bentang yang masuk ke keypoint: kabel itu masih di sisi hulu peralatannya,
  -- jadi milik section sebelumnya.
  UPDATE public.section sc
  SET jumlah_tiang = COALESCE(j.n, 0), panjang_km = round((COALESCE(b.m, 0) / 1000)::numeric, 3), diperbarui_at = now()
  FROM (SELECT s.hulu, count(*) AS n FROM _sc_simpul s WHERE s.hulu IS NOT NULL GROUP BY s.hulu) j
  LEFT JOIN (
    SELECT CASE WHEN s.batas AND s.id = s.hulu THEN i.hulu ELSE s.hulu END AS hulu,
           sum(public.jarak_meter(s.lat, s.lng, i.lat, i.lng)) AS m
    FROM _sc_simpul s
    JOIN _sc_simpul i ON i.id = s.induk
    WHERE s.hulu IS NOT NULL AND i.hulu IS NOT NULL
    GROUP BY 1
  ) b ON b.hulu = j.hulu
  WHERE sc.tiang_hulu_id = j.hulu AND upper(sc.penyulang) = v_p AND upper(sc.ulp) = v_u;

  SELECT count(*) INTO n FROM public.section WHERE upper(penyulang) = v_p AND upper(ulp) = v_u;

  INSERT INTO public.penyulang_section (penyulang, ulp, kotor, disusun_at)
  VALUES (v_p, v_u, false, now())
  ON CONFLICT (penyulang, ulp) DO UPDATE SET kotor = false, disusun_at = now();
  RETURN n;
END $$;
REVOKE ALL ON FUNCTION public.susun_section_penyulang(TEXT, TEXT) FROM PUBLIC;


-- ── 4. Tanda kotor ───────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.section_kotor_dari_nama()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP IN ('INSERT', 'UPDATE') THEN
    INSERT INTO public.penyulang_section (penyulang, ulp, kotor)
    VALUES (upper(NEW.penyulang), upper(COALESCE(NEW.ulp, '-')), true)
    ON CONFLICT (penyulang, ulp) DO UPDATE SET kotor = true;
  END IF;
  IF TG_OP IN ('DELETE', 'UPDATE') THEN
    INSERT INTO public.penyulang_section (penyulang, ulp, kotor)
    VALUES (upper(OLD.penyulang), upper(COALESCE(OLD.ulp, '-')), true)
    ON CONFLICT (penyulang, ulp) DO UPDATE SET kotor = true;
  END IF;
  RETURN NULL;
END $$;
DROP TRIGGER IF EXISTS trg_section_kotor_dari_nama ON public.tiang_kode_penyulang;
CREATE TRIGGER trg_section_kotor_dari_nama
  AFTER INSERT OR UPDATE OF penyulang, ulp, kode, induk_id, tiang_id OR DELETE ON public.tiang_kode_penyulang
  FOR EACH ROW EXECUTE FUNCTION public.section_kotor_dari_nama();

CREATE OR REPLACE FUNCTION public.section_kotor_dari_tiang()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.gardu_kode IS NOT NULL THEN RETURN NULL; END IF;
  INSERT INTO public.penyulang_section (penyulang, ulp, kotor)
  SELECT DISTINCT upper(k.penyulang), upper(COALESCE(k.ulp, '-')), true
  FROM public.tiang_kode_penyulang k
  WHERE k.tiang_id = NEW.id
  ON CONFLICT (penyulang, ulp) DO UPDATE SET kotor = true;
  RETURN NULL;
END $$;
DROP TRIGGER IF EXISTS trg_section_kotor_dari_tiang ON public.tiang;
CREATE TRIGGER trg_section_kotor_dari_tiang
  AFTER UPDATE OF lat, lng, status_hidup, induk_id, penanda, penanda_penyulang, nama_peralatan ON public.tiang
  FOR EACH ROW
  WHEN (OLD.lat IS DISTINCT FROM NEW.lat OR OLD.lng IS DISTINCT FROM NEW.lng
        OR OLD.status_hidup IS DISTINCT FROM NEW.status_hidup
        OR OLD.induk_id IS DISTINCT FROM NEW.induk_id
        OR OLD.penanda IS DISTINCT FROM NEW.penanda
        OR OLD.penanda_penyulang IS DISTINCT FROM NEW.penanda_penyulang
        OR OLD.nama_peralatan IS DISTINCT FROM NEW.nama_peralatan)
  EXECUTE FUNCTION public.section_kotor_dari_tiang();

-- Nama pangkal ikut segmen pertama penyulang.
CREATE OR REPLACE FUNCTION public.section_kotor_dari_segmen()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.penyulang_section (penyulang, ulp, kotor)
  VALUES (upper(NEW.penyulang), upper(NEW.ulp), true)
  ON CONFLICT (penyulang, ulp) DO UPDATE SET kotor = true;
  RETURN NULL;
END $$;
DROP TRIGGER IF EXISTS trg_section_kotor_dari_segmen ON public.segmen;
CREATE TRIGGER trg_section_kotor_dari_segmen
  AFTER INSERT OR UPDATE OF titik_awal_jenis, titik_awal_nama, status ON public.segmen
  FOR EACH ROW EXECUTE FUNCTION public.section_kotor_dari_segmen();


-- ── 5. Baca: hitung ulang yang kotor dulu ────────────────────────────────────
CREATE OR REPLACE FUNCTION public.segarkan_section_kotor(p_ulp TEXT DEFAULT NULL, p_batas INT DEFAULT 30)
RETURNS INT
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r RECORD; n INT := 0;
BEGIN
  FOR r IN
    SELECT penyulang, ulp FROM public.penyulang_section
    WHERE kotor AND (p_ulp IS NULL OR btrim(p_ulp) = '' OR ulp = upper(btrim(p_ulp)))
    ORDER BY disusun_at NULLS FIRST LIMIT GREATEST(p_batas, 1)
  LOOP
    PERFORM public.susun_section_penyulang(r.penyulang, r.ulp);
    n := n + 1;
  END LOOP;
  RETURN n;
END $$;
GRANT EXECUTE ON FUNCTION public.segarkan_section_kotor(TEXT, INT) TO authenticated;


-- ── 6. Segmen per section & laporan "segmen melewati keypoint" ──────────────
-- Tiang hulu sebuah section yang menjadi satu-satunya sentuhan segmen pada
-- section itu = segmen BERUJUNG di keypoint, bukan masuk ke section-nya.
CREATE OR REPLACE VIEW public.segmen_section AS
SELECT s.id AS segmen_id, s.nama AS segmen_nama, s.penyulang, s.ulp,
       sc.id AS section_id, sc.nama AS section_nama,
       count(*) AS jumlah_tiang,
       count(*) FILTER (WHERE st.tiang_id <> sc.tiang_hulu_id) AS jumlah_isi
FROM public.segmen s
JOIN public.segmen_tiang st ON st.segmen_id = s.id
JOIN public.section_tiang x ON x.tiang_id = st.tiang_id
JOIN public.section sc ON sc.id = x.section_id
  AND upper(sc.penyulang) = upper(s.penyulang) AND upper(sc.ulp) = upper(s.ulp)
WHERE s.status = 'aktif'
GROUP BY s.id, s.nama, s.penyulang, s.ulp, sc.id, sc.nama;
GRANT SELECT ON public.segmen_section TO authenticated;

CREATE OR REPLACE VIEW public.segmen_lintas_section AS
SELECT ss.segmen_id, ss.segmen_nama, ss.penyulang, ss.ulp,
       count(*) AS jumlah_section,
       string_agg(ss.section_nama || ' (' || ss.jumlah_isi || ' tiang)', ' · ' ORDER BY ss.section_nama) AS section
FROM public.segmen_section ss
WHERE ss.jumlah_isi > 0
GROUP BY ss.segmen_id, ss.segmen_nama, ss.penyulang, ss.ulp
HAVING count(*) > 1;
GRANT SELECT ON public.segmen_lintas_section TO authenticated;


-- ── 7. Susun sekarang untuk semua penyulang ──────────────────────────────────
INSERT INTO public.penyulang_section (penyulang, ulp, kotor)
SELECT DISTINCT upper(k.penyulang), upper(COALESCE(k.ulp, '-')), true
FROM public.tiang_kode_penyulang k
ON CONFLICT (penyulang, ulp) DO UPDATE SET kotor = true;

DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN SELECT penyulang, ulp FROM public.penyulang_section ORDER BY ulp, penyulang LOOP
    PERFORM public.susun_section_penyulang(r.penyulang, r.ulp);
  END LOOP;
END $$;


-- ── Sesudah dijalankan ───────────────────────────────────────────────────────
--   SELECT ulp, penyulang, nama, jenis_hulu, jumlah_tiang, panjang_km FROM section ORDER BY ulp, penyulang, nama;
--   SELECT * FROM segmen_lintas_section ORDER BY ulp, penyulang, segmen_nama;
