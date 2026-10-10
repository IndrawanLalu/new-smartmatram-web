-- =============================================================================
-- Gardu janggal di peta (10 Okt 2026) — alat di kelompok "Gardu" /peta
--
-- Kode gardu yang dicatat regu di tiang JTM (`tiang.gardu_di_tiang`) dibanding
-- master gardu. Dua keadaan yang perlu dilihat orang:
--
--   beda   penyulang di master gardu (feeder) bukan penyulang yang lewat tiang
--          itu. Data 10 Okt: 70 gardu, bergerombol (PAGUTAN→BATU DAWA 26,
--          BERTAIS→SANDUBAYA 29) — dibetulkan dari peta: master ikut tiang.
--          Gardu di tiang bersama yang feeder-nya salah satu penyulang tiang
--          itu BUKAN janggal (jtm-peralatan-tiang-bersama.sql).
--          `ulp_master` = ULP gardu di master — bisa beda dari ULP tiangnya
--          (AM009, CN174, AM065: tiang AMPENAN, master CAKRANEGARA); hak
--          mengubah master mengikuti ULP master.
--   ganda  satu kode gardu di lebih dari satu tiang di ULP yang sama (AM232
--          di dua tiang 211 m) — tiang kedua gardu portal tidak dihitung.
--          Dibetulkan di panel tiang (kode gardu / pasangan portal).
--
-- Satu tiang bisa muncul dua kali (beda DAN ganda).
-- =============================================================================

CREATE OR REPLACE VIEW public.gardu_janggal_peta AS
WITH gt AS (
  SELECT t.id AS tiang_id, t.kode AS tiang_kode, upper(t.ulp) AS ulp, t.lat, t.lng,
         COALESCE((SELECT k.penyulang FROM tiang_kode_penyulang k
                    WHERE k.tiang_id = t.id AND k.utama LIMIT 1), t.penyulang) AS penyulang_tiang,
         upper(btrim(t.gardu_di_tiang)) AS gardu_kode
  FROM tiang t
  WHERE t.status_hidup = 'aktif' AND t.gardu_kode IS NULL AND t.pasangan_portal_dari IS NULL
    AND NULLIF(btrim(t.gardu_di_tiang), '') IS NOT NULL
    AND t.lat IS NOT NULL AND t.lng IS NOT NULL
), dgn_master AS (
  SELECT gt.*, m.kode_master, m.feeder, m.ulp_master
  FROM gt
  LEFT JOIN LATERAL (
    -- Kode gardu tidak unik lintas ULP: ULP tiang dulu.
    SELECT g.kode AS kode_master, NULLIF(btrim(g.feeder), '') AS feeder, upper(g.ulp) AS ulp_master
    FROM gardu g
    WHERE upper(g.kode) = gt.gardu_kode
    ORDER BY (upper(COALESCE(g.ulp, '')) = gt.ulp) DESC
    LIMIT 1
  ) m ON true
)
SELECT 'beda'::text AS jenis, d.tiang_id, d.tiang_kode, d.ulp, d.lat, d.lng, d.gardu_kode,
       d.penyulang_tiang, d.feeder AS penyulang_master, NULL::text AS lain, d.ulp_master
FROM dgn_master d
WHERE d.kode_master IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM tiang_kode_penyulang k
                   WHERE k.tiang_id = d.tiang_id AND upper(k.penyulang) = upper(COALESCE(d.feeder, '')))
  AND upper(COALESCE(d.feeder, '')) <> upper(COALESCE(d.penyulang_tiang, ''))
UNION ALL
SELECT 'ganda', d.tiang_id, d.tiang_kode, d.ulp, d.lat, d.lng, d.gardu_kode,
       d.penyulang_tiang, d.feeder,
       (SELECT string_agg(o.tiang_kode || ' (' || round(jarak_meter(d.lat::float8, d.lng::float8, o.lat::float8, o.lng::float8)) || ' m)', ', '
                          ORDER BY o.tiang_kode)
          FROM gt o WHERE o.gardu_kode = d.gardu_kode AND o.ulp = d.ulp AND o.tiang_id <> d.tiang_id),
       d.ulp_master
FROM dgn_master d
WHERE EXISTS (SELECT 1 FROM gt o WHERE o.gardu_kode = d.gardu_kode AND o.ulp = d.ulp AND o.tiang_id <> d.tiang_id);

COMMENT ON VIEW public.gardu_janggal_peta IS
  'Gardu di tiang JTM yang janggal: beda (penyulang master gardu ≠ penyulang tiang) | ganda (satu kode di >1 tiang satu ULP).';

GRANT SELECT ON public.gardu_janggal_peta TO authenticated;


-- ── Samakan penyulang di master gardu dengan penyulang tiangnya ─────────────
-- Satu panggilan untuk satu kelompok (mis. 26 gardu PAGUTAN → BATU DAWA).

CREATE OR REPLACE FUNCTION public.samakan_penyulang_gardu(
  p_kode      TEXT[],
  p_ulp       TEXT,   -- ULP gardu DI MASTER (gardu_janggal_peta.ulp_master)
  p_penyulang TEXT,
  p_oleh      TEXT DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  -- Bukan `nama`: tabel gardu punya kolom nama → "column reference is ambiguous".
  v_penyulang TEXT;
  g     RECORD;
  n     INT := 0;
BEGIN
  PERFORM public.wajib_boleh_ulp(p_ulp);

  SELECT r.penyulang INTO v_penyulang FROM public.penyulang_ref r
   WHERE upper(r.penyulang) = upper(btrim(p_penyulang))
   ORDER BY (upper(COALESCE(r.ulp, '')) = upper(p_ulp)) DESC
   LIMIT 1;
  IF v_penyulang IS NULL THEN RAISE EXCEPTION 'Penyulang % belum terdaftar di Master Penyulang', p_penyulang; END IF;
  IF COALESCE(array_length(p_kode, 1), 0) = 0 THEN RAISE EXCEPTION 'Tidak ada gardu yang dipilih'; END IF;
  IF array_length(p_kode, 1) > 500 THEN RAISE EXCEPTION 'Paling banyak 500 gardu sekali jalan'; END IF;

  FOR g IN
    SELECT x.id, x.kode, x.ulp, x.feeder
    FROM public.gardu x
    WHERE upper(x.kode) IN (SELECT upper(btrim(k)) FROM unnest(p_kode) k)
      AND upper(COALESCE(x.ulp, '')) = upper(p_ulp)
      AND upper(COALESCE(btrim(x.feeder), '')) <> upper(v_penyulang)
  LOOP
    UPDATE public.gardu SET feeder = v_penyulang, updated_at = now() WHERE id = g.id;
    INSERT INTO public.master_audit
      (entitas, entitas_kode, ulp, field, nilai_lama, nilai_baru, aksi, oleh_uid, oleh_nama)
    VALUES ('gardu', g.kode, COALESCE(g.ulp, '-'), 'feeder', to_jsonb(g.feeder),
            jsonb_build_object('feeder', v_penyulang, 'lewat', 'peta: ikut penyulang tiang'),
            'sunting_admin', auth.uid(), p_oleh);
    n := n + 1;
  END LOOP;

  RETURN jsonb_build_object('penyulang', v_penyulang, 'diubah', n);
END $$;

REVOKE ALL ON FUNCTION public.samakan_penyulang_gardu(TEXT[], TEXT, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.samakan_penyulang_gardu(TEXT[], TEXT, TEXT, TEXT) TO authenticated;

-- Periksa:
-- SELECT jenis, count(*) FROM gardu_janggal_peta GROUP BY 1;
-- SELECT penyulang_master, penyulang_tiang, count(*) FROM gardu_janggal_peta
--  WHERE jenis = 'beda' GROUP BY 1, 2 ORDER BY 3 DESC;
