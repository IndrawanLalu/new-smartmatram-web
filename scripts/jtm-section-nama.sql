-- =============================================================================
-- Nama section = batas hulu + batas hilir (27 Okt 2026)
-- Jalankan SESUDAH jtm-section-daftar.sql. Idempoten.
--
-- Masalah: nama section hanya keypoint hulunya ("GI AMPENAN") — user tidak
-- tahu section itu berakhir di mana.
--
-- Keputusan user 27 Okt:
--   • Nama otomatis "<hulu> - <keypoint hilir>", beberapa keypoint hilir
--     dipisah garis miring: REC. MALOMBA - LBS. PELNI/LBSM. KONCO.
--   • Alat REC/LBS/LBSM di ujung section (titik pertemuan dengan penyulang
--     lain) ikut jadi batas hilir: REC. MALOMBA - LBS. PELNI/LBSM. KONCO/LBSM.
--     KARANG UJUNG (perbaikan 27 Okt sore — jalankan ulang file ini).
--   • Tanpa keypoint/alat di hilir (berakhir di ujung jaringan): kode tiang
--     terjauh, mis. LBS. PELNI - 3Y NK.
--   • Nama tetap bisa diubah admin (ubah_nama_section). Nama ubahan tidak
--     ditimpa saat section disusun ulang; kosongkan = kembali otomatis.
--     Bila hulunya hilang (keypoint dihapus) section-nya ikut hilang, termasuk
--     nama ubahannya.
-- =============================================================================

ALTER TABLE public.section ADD COLUMN IF NOT EXISTS nama_otomatis TEXT;
ALTER TABLE public.section ADD COLUMN IF NOT EXISTS nama_bebas BOOLEAN NOT NULL DEFAULT false;
COMMENT ON COLUMN public.section.nama_otomatis IS 'Nama hasil susun: hulu - keypoint hilir (garis miring) / kode tiang terjauh.';
COMMENT ON COLUMN public.section.nama_bebas IS 'true = nama diubah admin; susun ulang tidak menimpa `nama`.';


-- ── 1. Susun section (versi jtm-section-daftar.sql + nama hulu–hilir) ───────
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
    id UUID PRIMARY KEY, induk UUID, batas BOOLEAN, alat BOOLEAN, penanda TEXT, nama_alat TEXT, kode TEXT,
    lat DOUBLE PRECISION, lng DOUBLE PRECISION, hulu UUID,
    dalam INT   -- ★ X4: jarak dari pangkal (jumlah tiang) — urutan section
  ) ON COMMIT DROP;

  -- Pohon penamaan penyulang ini (sama dengan susun_nama_jtm).
  -- ★ alat: REC/LBS/LBSM apa adanya, sebelum `batas` dipangkas di bawah —
  -- dipakai menamai section yang berakhir di alat (titik pertemuan penyulang).
  INSERT INTO _sc_simpul (id, induk, batas, alat, penanda, nama_alat, kode, lat, lng)
  SELECT t.id, COALESCE(kp.induk_id, public.jtm_leluhur_di_penyulang(t.induk_id, kp.penyulang)),
         public.section_jenis_batas(t.penanda), public.section_jenis_batas(t.penanda), lower(t.penanda), t.nama_peralatan, kp.kode, t.lat, t.lng
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
  UPDATE _sc_simpul s SET hulu = w.hulu, dalam = w.dalam FROM w WHERE w.id = s.id;   -- ★ X4: + dalam

  -- Nama pangkal penyulang: titik awal segmen pertamanya (GI / PLTD / GH …).
  SELECT public.segmen_label_titik(sg.titik_awal_jenis, sg.titik_awal_nama) INTO pangkal
  FROM public.segmen sg
  WHERE upper(sg.penyulang) = v_p AND upper(sg.ulp) = v_u AND sg.status = 'aktif'
    AND (sg.titik_awal_jenis IN ('GI', 'PLTD', 'PMT')
         OR sg.titik_awal_jenis IN (SELECT upper(r.kode) FROM public.jtm_ref r WHERE r.kategori = 'pangkal'))
  ORDER BY sg.created_at LIMIT 1;

  -- ★ Nama otomatis (27 Okt): "<hulu> - <keypoint hilir>/<keypoint hilir>",
  -- atau "<hulu> - <kode tiang terjauh>" bila tidak ada keypoint di hilirnya.
  DROP TABLE IF EXISTS _sc_nama;
  CREATE TEMP TABLE _sc_nama ON COMMIT DROP AS
  SELECT h.id AS hulu,
         CASE WHEN h.batas THEN public.section_label_hulu(h.penanda, h.nama_alat, h.kode)
              ELSE COALESCE(pangkal, 'Pangkal ' || h.kode) END AS label
  FROM _sc_simpul h
  WHERE h.id IN (SELECT DISTINCT hulu FROM _sc_simpul WHERE hulu IS NOT NULL);
  ALTER TABLE _sc_nama ADD COLUMN nama TEXT;
  UPDATE _sc_nama n SET nama = n.label || ' - ' || COALESCE(
    (SELECT string_agg(public.section_label_hulu(k.penanda, k.nama_alat, k.kode), '/' ORDER BY k.dalam, k.kode)
       FROM _sc_simpul k
      WHERE k.id <> n.hulu AND (
            -- Keypoint yang membuka section berikutnya, induknya di section ini.
            (k.batas AND k.hulu = k.id AND (SELECT i.hulu FROM _sc_simpul i WHERE i.id = k.induk) = n.hulu)
            -- ★ Alat di UJUNG section (tanpa tiang sesudahnya di penyulang ini):
            -- LBSM titik pertemuan dengan penyulang lain, mis. LBSM. KONCO.
         OR (k.alat AND NOT k.batas AND k.hulu = n.hulu
             AND NOT EXISTS (SELECT 1 FROM _sc_simpul c WHERE c.induk = k.id)))),
    (SELECT t.kode FROM _sc_simpul t WHERE t.hulu = n.hulu ORDER BY t.dalam DESC NULLS LAST, t.kode LIMIT 1))
  WHERE true;   -- WHERE wajib: Supabase menolak UPDATE tanpa WHERE (safeupdate)

  -- Baris section: dipertahankan (id stabil) bila hulunya sama. Nama yang
  -- diubah admin (nama_bebas) tidak ditimpa; nama_otomatis selalu terkini.
  INSERT INTO public.section AS sc (penyulang, ulp, tiang_hulu_id, jenis_hulu, nama, nama_otomatis, urutan)
  SELECT v_p, v_u, h.id,
         CASE WHEN h.batas THEN h.penanda ELSE 'pangkal' END,
         n.nama, n.nama,
         COALESCE(h.dalam, 0)
  FROM _sc_simpul h JOIN _sc_nama n ON n.hulu = h.id
  ON CONFLICT (upper(penyulang), upper(ulp), tiang_hulu_id) DO UPDATE
    SET jenis_hulu = EXCLUDED.jenis_hulu,
        nama = CASE WHEN sc.nama_bebas THEN sc.nama ELSE EXCLUDED.nama END,
        nama_otomatis = EXCLUDED.nama_otomatis,
        urutan = EXCLUDED.urutan;

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


-- ── 2. Satu section per segmen ───────────────────────────────────────────────
-- Section "rumah" segmen = yang memuat tiang isinya paling banyak (tiang hulu


-- ── 2. Ubah nama section ─────────────────────────────────────────────────────
-- p_nama kosong = kembali ke nama otomatis.
CREATE OR REPLACE FUNCTION public.ubah_nama_section(p_section UUID, p_nama TEXT, p_oleh TEXT DEFAULT NULL)
RETURNS TEXT
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  s RECORD;
  v_nama TEXT := upper(btrim(regexp_replace(COALESCE(p_nama, ''), '\s+', ' ', 'g')));
  v_bebas BOOLEAN := v_nama <> '';
BEGIN
  SELECT * INTO s FROM public.section WHERE id = p_section;
  IF NOT FOUND THEN RAISE EXCEPTION 'Section tidak ditemukan'; END IF;
  PERFORM public.penyulang_wajib_boleh(s.ulp);
  IF NOT v_bebas THEN v_nama := COALESCE(s.nama_otomatis, s.nama); END IF;
  IF EXISTS (SELECT 1 FROM public.section o
             WHERE o.id <> s.id AND upper(o.penyulang) = upper(s.penyulang) AND upper(o.ulp) = upper(s.ulp)
               AND upper(o.nama) = v_nama) THEN
    RAISE EXCEPTION 'Nama "%" sudah dipakai section lain di penyulang %.', v_nama, s.penyulang;
  END IF;

  UPDATE public.section SET nama = v_nama, nama_bebas = v_bebas WHERE id = s.id;

  INSERT INTO public.master_audit
    (entitas, entitas_kode, ulp, field, nilai_lama, nilai_baru, aksi, oleh_uid, oleh_nama)
  VALUES ('section', s.nama, COALESCE(s.ulp, '-'), 'nama',
          jsonb_build_object('nama', s.nama), jsonb_build_object('nama', v_nama, 'otomatis', NOT v_bebas),
          'sunting_admin', auth.uid(), p_oleh);
  RETURN v_nama;
END $$;
REVOKE ALL ON FUNCTION public.ubah_nama_section(UUID, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ubah_nama_section(UUID, TEXT, TEXT) TO authenticated;


-- ── 3. Susun ulang semua penyulang (nama baru langsung terpakai) ────────────
UPDATE public.penyulang_section SET kotor = true WHERE true;

DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN SELECT penyulang, ulp FROM public.penyulang_section ORDER BY ulp, penyulang LOOP
    PERFORM public.susun_section_penyulang(r.penyulang, r.ulp);
  END LOOP;
END $$;


-- ── Sesudah dijalankan ───────────────────────────────────────────────────────
--   SELECT ulp, penyulang, nama, urutan FROM section ORDER BY ulp, penyulang, urutan;
