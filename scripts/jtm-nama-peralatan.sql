-- ════════════════════════════════════════════════════════════════════════════
-- Nama peralatan di tiang JTM (6 Okt 2026)
-- ════════════════════════════════════════════════════════════════════════════
-- Koreksi user: penanda tiang JTM (Recloser → LBSM) harus bisa diganti dari
-- peta, BESERTA nama peralatannya (mis. SAMPOERNA). Selama ini nama itu hanya
-- hidup di titik ujung segmen; tiangnya cuma tahu jenisnya.
--
--   1. tiang.nama_peralatan
--   2. ubah_atribut_tiang + 'nama_peralatan' — disalin dari versi hidup
--      scripts/jtm-kode-gardu.sql; yang berubah ditandai ★.
--   3. peta_tiang + kolom nama_peralatan DI BELAKANG — disalin dari versi hidup
--      scripts/jtm-induk-per-penyulang.sql.
--
-- ⚠ Jalankan SEBELUM web baru dipasang: peta memilih kolom baru, tanpa SQL ini
-- tiang hilang dari peta. Idempoten.
-- ════════════════════════════════════════════════════════════════════════════

-- ── 1. Kolom ─────────────────────────────────────────────────────────────────
ALTER TABLE public.tiang ADD COLUMN IF NOT EXISTS nama_peralatan TEXT;
COMMENT ON COLUMN public.tiang.nama_peralatan IS
  'Nama peralatan di tiang (LBS/recloser/FCO …), mis. SAMPOERNA. Ditampilkan di samping ikon peta.';


-- ── 2. Ubah atribut dari peta ────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.ubah_atribut_tiang(
  p_id    UUID,
  p_isi   JSONB,
  p_oleh  TEXT DEFAULT NULL
) RETURNS INT
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  t      RECORD;
  boleh  TEXT[];
  f      TEXT;
  lama   TEXT;
  baru   TEXT;
  n      INT := 0;
BEGIN
  SELECT * INTO t FROM public.tiang WHERE id = p_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Tiang tidak ditemukan'; END IF;
  IF t.status_hidup <> 'aktif' THEN RAISE EXCEPTION 'Tiang % sudah %', t.kode, t.status_hidup; END IF;
  PERFORM public.penyulang_wajib_boleh(t.ulp);

  boleh := CASE WHEN t.gardu_kode IS NULL
                THEN ARRAY['jenis', 'konstruksi', 'nomor_lama', 'penanda', 'gardu_di_tiang', 'nama_peralatan']  -- ★
                ELSE ARRAY['jenis', 'tinggi'] END;

  FOR f IN SELECT jsonb_object_keys(COALESCE(p_isi, '{}'::jsonb)) LOOP
    IF NOT (f = ANY (boleh)) THEN
      RAISE EXCEPTION 'Isian "%" tidak bisa diubah dari peta', f;
    END IF;
    baru := NULLIF(btrim(COALESCE(p_isi->>f, '')), '');

    IF f = 'penanda' AND baru IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM public.jtm_ref WHERE kategori = 'penanda' AND kode = baru AND aktif) THEN
      RAISE EXCEPTION 'Penanda "%" tidak dikenal', baru;
    END IF;
    -- Kode gardu: dirapikan ke bentuk Master (Am13 → AM013). Kode baru yang
    -- belum ada di Master tetap boleh — pemutakhiran data dimulai dari sini.
    IF f = 'gardu_di_tiang' AND baru IS NOT NULL THEN
      IF public.normal_kode_gardu(baru) IS NULL THEN
        RAISE EXCEPTION 'Kode gardu "%" tidak sah — tulis seperti AM013', baru;
      END IF;
      baru := public.normal_kode_gardu(baru);
    END IF;
    -- ★ Nama peralatan ditulis seperti di lapangan: huruf besar, spasi rapi.
    IF f = 'nama_peralatan' AND baru IS NOT NULL THEN
      baru := upper(regexp_replace(baru, '\s+', ' ', 'g'));
    END IF;
    IF f = 'tinggi' AND baru IS NOT NULL AND baru !~ '^[0-9]+([.,][0-9]+)?$' THEN
      RAISE EXCEPTION 'Tinggi tiang harus angka meter';
    END IF;

    EXECUTE format('SELECT (%I)::text FROM public.tiang WHERE id = $1', f) INTO lama USING p_id;
    IF lama IS NOT DISTINCT FROM baru
       OR (f = 'tinggi' AND lama IS NOT NULL AND baru IS NOT NULL
           AND lama::numeric = replace(baru, ',', '.')::numeric) THEN
      CONTINUE;
    END IF;

    IF f = 'tinggi' THEN
      UPDATE public.tiang SET tinggi = replace(baru, ',', '.')::numeric, updated_at = now() WHERE id = p_id;
    ELSE
      EXECUTE format('UPDATE public.tiang SET %I = $1, updated_at = now() WHERE id = $2', f) USING baru, p_id;
    END IF;

    INSERT INTO public.master_audit
      (entitas, entitas_kode, ulp, field, nilai_lama, nilai_baru, aksi, oleh_uid, oleh_nama)
    VALUES ('tiang', COALESCE(t.kode, p_id::text), COALESCE(t.ulp, '-'), f,
            to_jsonb(lama), jsonb_build_object('nilai', baru, 'lewat', 'peta'),
            'sunting_admin', auth.uid(), p_oleh);
    n := n + 1;
  END LOOP;

  RETURN n;
END $$;
GRANT EXECUTE ON FUNCTION public.ubah_atribut_tiang(UUID, JSONB, TEXT) TO authenticated;


-- ── 3. peta_tiang + nama_peralatan (kolom baru di belakang ★) ────────────────
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
       COALESCE(k.induk_id, t.induk_id) AS induk_id,
       p.lat                AS induk_lat,
       p.lng                AS induk_lng,
       NOT k.utama          AS menumpang,
       NULL::int            AS jumlah_kabel,
       false                AS kabel_putus,
       false                AS di_jtm,
       NULL::text           AS gardu_bersama,
       NULL::text           AS nomor_kabel,
       t.pasangan_portal_dari,
       t.gardu_di_tiang,
       t.nama_peralatan                                         -- ★
FROM public.tiang t
JOIN public.tiang_kode_penyulang k ON k.tiang_id = t.id
-- Induk di penyulang INI: titik pertemuan dua penyulang punya induk sendiri
-- di tiap penyulang; selebihnya ikut batang.
LEFT JOIN public.tiang p ON p.id = COALESCE(k.induk_id, t.induk_id) AND p.status_hidup = 'aktif'
WHERE t.gardu_kode IS NULL
  AND t.status_hidup = 'aktif' AND t.lat IS NOT NULL AND t.lng IS NOT NULL

UNION ALL

SELECT t.id, t.kode, t.ulp, t.lat, t.lng, t.penanda, t.percabangan,
       'jtm'::text, t.penyulang, t.induk_id, p.lat, p.lng, false,
       NULL::int, false, false, NULL::text, NULL::text,
       t.pasangan_portal_dari,
       t.gardu_di_tiang,
       t.nama_peralatan                                         -- ★
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
       NULL::text,
       NULL::text                                               -- ★
FROM public.jtr_tiang j
LEFT JOIN public.tiang p ON p.id = j.induk_id AND p.status_hidup = 'aktif'
LEFT JOIN public.gardu g ON upper(g.kode) = upper(j.gardu_kode) AND upper(g.ulp) = upper(j.ulp)
JOIN public.tiang bt ON bt.id = j.id
WHERE j.status_hidup = 'aktif' AND j.lat IS NOT NULL AND j.lng IS NOT NULL;

GRANT SELECT ON public.peta_tiang TO authenticated;
