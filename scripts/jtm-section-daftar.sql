-- =============================================================================
-- X4 — Daftar segmen per section + rekap per section (25 Okt 2026)
-- Rencana: rencana-section-segmen.md. Jalankan SESUDAH jtm-section-pecah.sql.
-- Idempoten (aman diulang).
--
--   • section.urutan — jarak tiang hulu dari pangkal (jumlah tiang), supaya
--     section tampil dari hulu ke hilir, bukan menurut abjad.
--     susun_section_penyulang disalin dari jtm-section.sql; yang berubah ★ X4.
--   • segmen_section_utama — SATU section per segmen (yang paling banyak
--     tiangnya). Segmen yang melewati keypoint tetap muncul sekali, ditandai
--     `lintas`. Segmen tanpa tiang tidak ada di sini (belum dititik).
--   • section_rekap — ringkasan per section: segmen, panjang, tiang, tiang
--     yang belum masuk segmen mana pun.
--
-- Hanya-baca untuk aplikasi; tidak mengubah segmen, inspeksi, atau WO.
-- =============================================================================


-- ── 1. Urutan section ────────────────────────────────────────────────────────
ALTER TABLE public.section ADD COLUMN IF NOT EXISTS urutan INT NOT NULL DEFAULT 0;
COMMENT ON COLUMN public.section.urutan IS
  'Jarak tiang hulu dari pangkal penyulang (jumlah tiang). Urutan tampil hulu → hilir.';

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
    lat DOUBLE PRECISION, lng DOUBLE PRECISION, hulu UUID,
    dalam INT   -- ★ X4: jarak dari pangkal (jumlah tiang) — urutan section
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
  UPDATE _sc_simpul s SET hulu = w.hulu, dalam = w.dalam FROM w WHERE w.id = s.id;   -- ★ X4: + dalam

  -- Nama pangkal penyulang: titik awal segmen pertamanya (GI / PLTD / GH …).
  SELECT public.segmen_label_titik(sg.titik_awal_jenis, sg.titik_awal_nama) INTO pangkal
  FROM public.segmen sg
  WHERE upper(sg.penyulang) = v_p AND upper(sg.ulp) = v_u AND sg.status = 'aktif'
    AND (sg.titik_awal_jenis IN ('GI', 'PLTD', 'PMT')
         OR sg.titik_awal_jenis IN (SELECT upper(r.kode) FROM public.jtm_ref r WHERE r.kategori = 'pangkal'))
  ORDER BY sg.created_at LIMIT 1;

  -- Baris section: dipertahankan (id stabil) bila hulunya sama.
  INSERT INTO public.section (penyulang, ulp, tiang_hulu_id, jenis_hulu, nama, urutan)   -- ★ X4: + urutan
  SELECT v_p, v_u, h.id,
         CASE WHEN h.batas THEN h.penanda ELSE 'pangkal' END,
         CASE WHEN h.batas THEN public.section_label_hulu(h.penanda, h.nama_alat, h.kode)
              ELSE COALESCE(pangkal, 'Pangkal ' || h.kode) END,
         COALESCE(h.dalam, 0)
  FROM _sc_simpul h
  WHERE h.id IN (SELECT DISTINCT hulu FROM _sc_simpul WHERE hulu IS NOT NULL)
  ON CONFLICT (upper(penyulang), upper(ulp), tiang_hulu_id) DO UPDATE
    SET jenis_hulu = EXCLUDED.jenis_hulu, nama = EXCLUDED.nama, urutan = EXCLUDED.urutan;

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
-- section tidak dihitung — aturan segmen_section). Seri: yang lebih hulu.
CREATE OR REPLACE VIEW public.segmen_section_utama AS
SELECT DISTINCT ON (ss.segmen_id)
  ss.segmen_id, ss.segmen_nama, ss.penyulang, ss.ulp,
  ss.section_id, ss.section_nama, sc.urutan AS section_urutan,
  count(*) FILTER (WHERE ss.jumlah_isi > 0) OVER (PARTITION BY ss.segmen_id) > 1 AS lintas
FROM public.segmen_section ss
JOIN public.section sc ON sc.id = ss.section_id
ORDER BY ss.segmen_id, ss.jumlah_isi DESC, ss.jumlah_tiang DESC, sc.urutan;
COMMENT ON VIEW public.segmen_section_utama IS
  'Satu section per segmen aktif (yang tiang isinya terbanyak). lintas = isinya juga di section lain. Segmen tanpa tiang tidak muncul.';
GRANT SELECT ON public.segmen_section_utama TO authenticated;


-- ── 3. Rekap per section ─────────────────────────────────────────────────────
-- Tiang tanpa segmen dihitung seperti panel Section di /peta: tiang section
-- yang tidak masuk segmen aktif PENYULANG ITU (segmen penyulang lain di tiang
-- underbuild tidak dihitung).
CREATE OR REPLACE VIEW public.section_rekap AS
SELECT sc.id AS section_id, sc.penyulang, sc.ulp, sc.nama, sc.jenis_hulu, sc.urutan,
  sc.jumlah_tiang, sc.panjang_km,
  (SELECT count(*) FROM public.segmen_section_utama u WHERE u.section_id = sc.id) AS jumlah_segmen,
  (SELECT count(*)
     FROM public.section_tiang x
    WHERE x.section_id = sc.id
      AND NOT EXISTS (
        SELECT 1 FROM public.segmen_tiang st
        JOIN public.segmen s ON s.id = st.segmen_id
        WHERE st.tiang_id = x.tiang_id AND s.status = 'aktif' AND upper(s.penyulang) = upper(sc.penyulang))
  ) AS tiang_tanpa_segmen
FROM public.section sc;
COMMENT ON VIEW public.section_rekap IS
  'Ringkasan per section: panjang & tiang (hasil susun), jumlah segmen yang ber-rumah di sini, tiang yang belum masuk segmen mana pun.';
GRANT SELECT ON public.section_rekap TO authenticated;


-- ── 4. Susun ulang semua penyulang (mengisi urutan) ──────────────────────────
UPDATE public.penyulang_section SET kotor = true;
DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN SELECT penyulang, ulp FROM public.penyulang_section ORDER BY ulp, penyulang LOOP
    PERFORM public.susun_section_penyulang(r.penyulang, r.ulp);
  END LOOP;
END $$;


-- ── Periksa ──────────────────────────────────────────────────────────────────
--   SELECT ulp, penyulang, urutan, nama, jumlah_segmen, panjang_km, tiang_tanpa_segmen
--     FROM section_rekap ORDER BY ulp, penyulang, urutan;
--   SELECT count(*), count(*) FILTER (WHERE lintas) FROM segmen_section_utama;
