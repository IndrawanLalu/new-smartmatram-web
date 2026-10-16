-- ════════════════════════════════════════════════════════════════════════════
-- Lepas tumpang JTM — hapus penyulang yang SALAH dinyatakan menumpang (16 Okt 2026)
-- ════════════════════════════════════════════════════════════════════════════
-- Kasus: regu SEKOTONG menekan "Tiang ini menumpang" di LBR-001…007, padahal
-- SEKOTONG tidak lewat di sana. Batangnya sah milik LEMBAR — yang salah hanya
-- catatan SEKOTONG di batang itu. Padanan `lepas_tumpang_jtr` untuk JTM.
--
-- Yang DIHAPUS (keputusan user: "hapus datanya juga karena memang tidak ada"),
-- hanya untuk penyulang yang dilepas:
--   • nama tiang di penyulang itu (`tiang_kode_penyulang`, baris bukan pemilik);
--   • keanggotaan di segmen penyulang itu (`segmen_tiang`);
--   • penilaian tiang ini di inspeksi segmen penyulang itu
--     (`inspeksi_jtm_titik` → jawaban & foto ikut terhapus);
--   • jawaban per kabel penyulang itu yang diisi di inspeksi penyulang lain
--     (`inspeksi_jtm_periksa.sirkit_segmen_id`);
--   • segmen penyulang itu yang berujung di tiang ini → ujungnya dikosongkan;
--   • pemilik peralatan (`tiang.penanda_penyulang`) bila menunjuk penyulang itu.
-- Isi lengkapnya disalin ke `master_audit` sebelum dihapus.
--
-- TIDAK disentuh: batangnya, nama & inspeksi penyulang pemilik, tugas temuan
-- yang sudah diberikan ke regu (dihitung di pratinjau; batalkan terpisah).
--
-- Tiang hilirnya di penyulang itu TIDAK menghalangi: mereka menyambung ke
-- tiang penyulang itu berikutnya di hulu (naik lewat batang), atau menjadi
-- PANGKAL bila di hulu tidak ada lagi. Induk khusus yang menunjuk tiang ini
-- dikosongkan (= ikut batang). Pratinjau menyebut nasib tiap hilir.
-- Kasus asal: rantai salah SKT-001R007…R001 di LBR-001…006 justru di HULU
-- SKT-001 — melepasnya dari arah GI menjadikan SKT-001 pangkal SEKOTONG.
-- Ditolak untuk penyulang pemilik (itu "Batalkan tiang").
-- ════════════════════════════════════════════════════════════════════════════

-- Tiang aktif di penyulang `p` yang induknya (di penyulang itu) = `t`.
CREATE OR REPLACE FUNCTION public._jtm_hilir_di_penyulang(p_tiang UUID, p_penyulang TEXT)
RETURNS TABLE (tiang_id UUID, kode TEXT)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $fn$
  SELECT k.tiang_id, k.kode
  FROM public.tiang_kode_penyulang k
  JOIN public.tiang u ON u.id = k.tiang_id AND u.status_hidup = 'aktif'
  WHERE upper(k.penyulang) = upper(p_penyulang)
    AND k.tiang_id <> p_tiang
    AND public.jtm_induk_di_penyulang(k.tiang_id, p_penyulang) = p_tiang
  ORDER BY k.kode
$fn$;

-- Leluhur terdekat bernama di penyulang `p`, naik dari `p_mulai` lewat batang,
-- MELEWATI `p_kecuali` (tiang yang sedang dilepas). NULL = jadi pangkal.
CREATE OR REPLACE FUNCTION public._jtm_leluhur_kecuali(p_mulai UUID, p_penyulang TEXT, p_kecuali UUID)
RETURNS UUID
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $fn$
DECLARE naik UUID := p_mulai; n INT := 0;
BEGIN
  WHILE naik IS NOT NULL AND n < 5000 LOOP
    IF naik <> p_kecuali AND EXISTS (
      SELECT 1 FROM public.tiang_kode_penyulang WHERE tiang_id = naik AND upper(penyulang) = upper(p_penyulang)
    ) THEN RETURN naik; END IF;
    SELECT induk_id INTO naik FROM public.tiang WHERE id = naik;
    n := n + 1;
  END LOOP;
  RETURN NULL;
END $fn$;

-- Nasib tiap hilir sesudah `p_tiang` dilepas: menyambung ke mana (NULL = pangkal).
CREATE OR REPLACE FUNCTION public._jtm_hilir_sesudah_lepas(p_tiang UUID, p_penyulang TEXT)
RETURNS TABLE (tiang_id UUID, kode TEXT, induk_baru UUID)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $fn$
  SELECT h.tiang_id, h.kode,
         public._jtm_leluhur_kecuali((SELECT t.induk_id FROM public.tiang t WHERE t.id = h.tiang_id), p_penyulang, p_tiang)
  FROM public._jtm_hilir_di_penyulang(p_tiang, p_penyulang) h
$fn$;

-- ── Pratinjau: apa yang akan hilang ──────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.pratinjau_lepas_tumpang_jtm(p_tiang_id UUID, p_penyulang TEXT)
RETURNS JSONB
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  kp     RECORD;
  segs   UUID[];
  hilir  JSONB;
BEGIN
  SELECT * INTO kp FROM public.tiang_kode_penyulang
   WHERE tiang_id = p_tiang_id AND upper(penyulang) = upper(p_penyulang);
  IF NOT FOUND THEN RAISE EXCEPTION 'Tiang ini tidak bernama di penyulang %', p_penyulang; END IF;

  segs := ARRAY(SELECT id FROM public.segmen WHERE upper(penyulang) = upper(p_penyulang));
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'kode', h.kode,
           'ke', (SELECT k.kode FROM public.tiang_kode_penyulang k
                  WHERE k.tiang_id = h.induk_baru AND upper(k.penyulang) = upper(p_penyulang))) ORDER BY h.kode), '[]')
    INTO hilir
  FROM public._jtm_hilir_sesudah_lepas(p_tiang_id, p_penyulang) h;

  RETURN jsonb_build_object(
    'kode', kp.kode,
    'utama', kp.utama,
    'hilir', hilir,
    'segmen', (SELECT count(*) FROM public.segmen_tiang WHERE tiang_id = p_tiang_id AND segmen_id = ANY(segs)),
    'penilaian', (SELECT count(*) FROM public.inspeksi_jtm_titik ti JOIN public.inspeksi_jtm i ON i.id = ti.inspeksi_id
                   WHERE ti.tiang_id = p_tiang_id AND i.segmen_id = ANY(segs)),
    'jawaban_kabel', (SELECT count(*) FROM public.inspeksi_jtm_periksa pr
                       JOIN public.inspeksi_jtm_titik ti ON ti.id = pr.titik_id
                       JOIN public.inspeksi_jtm i ON i.id = ti.inspeksi_id
                      WHERE ti.tiang_id = p_tiang_id AND pr.sirkit_segmen_id = ANY(segs)
                        AND NOT (i.segmen_id = ANY(segs))),
    'tugas', (SELECT count(*) FROM public.inspeksi
               WHERE sumber_tiang_id = p_tiang_id AND upper(COALESCE(penyulang, '')) = upper(p_penyulang))
           + (SELECT count(*) FROM public.inspeksi_pohon
               WHERE sumber_tiang_id = p_tiang_id AND upper(COALESCE(penyulang, '')) = upper(p_penyulang))
  );
END $fn$;

-- ── Lepas ────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.lepas_tumpang_jtm(
  p_tiang_id  UUID,
  p_penyulang TEXT,
  p_alasan    TEXT,
  p_nama      TEXT DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  t      RECORD;
  kp     RECORD;
  segs   UUID[];
  hilir  JSONB;
  catat  JSONB;
  n_titik INT;
  n_kabel INT;
BEGIN
  IF btrim(COALESCE(p_alasan, '')) = '' THEN RAISE EXCEPTION 'Alasan wajib diisi.'; END IF;

  SELECT * INTO t FROM public.tiang WHERE id = p_tiang_id FOR UPDATE;
  IF NOT FOUND OR t.status_hidup <> 'aktif' THEN RAISE EXCEPTION 'Tiang tidak ditemukan atau sudah dibatalkan'; END IF;
  PERFORM public.penyulang_wajib_boleh(t.ulp);

  SELECT * INTO kp FROM public.tiang_kode_penyulang
   WHERE tiang_id = p_tiang_id AND upper(penyulang) = upper(p_penyulang);
  IF NOT FOUND THEN RAISE EXCEPTION 'Tiang ini tidak bernama di penyulang %', p_penyulang; END IF;
  IF kp.utama THEN
    RAISE EXCEPTION '% adalah penyulang pemilik tiang %. Untuk tiang yang salah dimasukkan, pakai Batalkan tiang.', kp.penyulang, kp.kode;
  END IF;

  -- Hilir dicatat SEBELUM dilepas (sesudahnya tiang ini sudah tak bernama).
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'kode', h.kode,
           'ke', (SELECT k.kode FROM public.tiang_kode_penyulang k
                  WHERE k.tiang_id = h.induk_baru AND upper(k.penyulang) = upper(kp.penyulang))) ORDER BY h.kode), '[]')
    INTO hilir
  FROM public._jtm_hilir_sesudah_lepas(p_tiang_id, kp.penyulang) h;

  segs := ARRAY(SELECT id FROM public.segmen WHERE upper(penyulang) = upper(kp.penyulang));

  -- Salinan untuk audit — sesudah ini datanya tidak ada lagi.
  catat := jsonb_build_object(
    'penyulang', kp.penyulang,
    'kode', kp.kode,
    'induk', (SELECT kode FROM public.tiang_kode_penyulang WHERE tiang_id = kp.induk_id AND upper(penyulang) = upper(kp.penyulang)),
    'segmen', (SELECT COALESCE(jsonb_agg(s.nama), '[]') FROM public.segmen_tiang st JOIN public.segmen s ON s.id = st.segmen_id
                WHERE st.tiang_id = p_tiang_id AND st.segmen_id = ANY(segs)),
    'penilaian', (SELECT COALESCE(jsonb_agg(jsonb_build_object(
                     'inspeksi', ti.inspeksi_id, 'dinilai_at', ti.dinilai_at, 'catatan', ti.catatan,
                     'jawaban', (SELECT COALESCE(jsonb_agg(jsonb_build_object('item', pr.item_kode, 'bagian', pr.bagian, 'nilai', pr.nilai)), '[]')
                                 FROM public.inspeksi_jtm_periksa pr WHERE pr.titik_id = ti.id),
                     'foto', (SELECT COALESCE(jsonb_agg(f.url), '[]') FROM public.inspeksi_jtm_foto f WHERE f.titik_id = ti.id))), '[]')
                  FROM public.inspeksi_jtm_titik ti JOIN public.inspeksi_jtm i ON i.id = ti.inspeksi_id
                  WHERE ti.tiang_id = p_tiang_id AND i.segmen_id = ANY(segs))
  );

  -- Jawaban per kabel penyulang ini yang diisi di inspeksi penyulang lain.
  DELETE FROM public.inspeksi_jtm_periksa pr
   USING public.inspeksi_jtm_titik ti
   WHERE ti.id = pr.titik_id AND ti.tiang_id = p_tiang_id AND pr.sirkit_segmen_id = ANY(segs);
  GET DIAGNOSTICS n_kabel = ROW_COUNT;

  -- Penilaian di inspeksi penyulang ini (jawaban & foto ikut, ON DELETE CASCADE).
  DELETE FROM public.inspeksi_jtm_titik ti
   USING public.inspeksi_jtm i
   WHERE i.id = ti.inspeksi_id AND ti.tiang_id = p_tiang_id AND i.segmen_id = ANY(segs);
  GET DIAGNOSTICS n_titik = ROW_COUNT;

  DELETE FROM public.segmen_tiang WHERE tiang_id = p_tiang_id AND segmen_id = ANY(segs);
  UPDATE public.segmen SET titik_awal_tiang_id = NULL
   WHERE id = ANY(segs) AND titik_awal_tiang_id = p_tiang_id;
  UPDATE public.segmen SET titik_akhir_tiang_id = NULL
   WHERE id = ANY(segs) AND titik_akhir_tiang_id = p_tiang_id;
  UPDATE public.tiang SET penanda_penyulang = NULL, updated_at = now()
   WHERE id = p_tiang_id AND upper(COALESCE(penanda_penyulang, '')) = upper(kp.penyulang);

  DELETE FROM public.tiang_kode_penyulang
   WHERE tiang_id = p_tiang_id AND upper(penyulang) = upper(kp.penyulang);
  -- Induk khusus yang menunjuk tiang ini → ikut batang (naik ke hulu berikutnya).
  UPDATE public.tiang_kode_penyulang SET induk_id = NULL, updated_at = now()
   WHERE induk_id = p_tiang_id AND upper(penyulang) = upper(kp.penyulang);

  INSERT INTO public.master_audit
    (entitas, entitas_kode, ulp, field, nilai_lama, nilai_baru, aksi, oleh_uid, oleh_nama)
  VALUES ('tiang', t.kode, COALESCE(t.ulp, '-'), 'tumpang_jtm', catat,
          jsonb_build_object('status', 'dilepas', 'alasan', btrim(p_alasan),
                             'penilaian_dihapus', n_titik, 'jawaban_kabel_dihapus', n_kabel,
                             'hilir', hilir),
          'batal_salah_input', auth.uid(), p_nama);

  RETURN jsonb_build_object('kode', kp.kode, 'pemilik', t.kode, 'penyulang', kp.penyulang, 'penilaian', n_titik, 'hilir', hilir);
END $fn$;

REVOKE EXECUTE ON FUNCTION public._jtm_hilir_di_penyulang(UUID, TEXT) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public._jtm_leluhur_kecuali(UUID, TEXT, UUID) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public._jtm_hilir_sesudah_lepas(UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.pratinjau_lepas_tumpang_jtm(UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.lepas_tumpang_jtm(UUID, TEXT, TEXT, TEXT) TO authenticated;

-- ════════════════════════════════════════════════════════════════════════════
-- Peta: induk JTM PER PENYULANG + kolom `pangkal` (label "Pangkal" di peta)
-- ════════════════════════════════════════════════════════════════════════════
-- Sebelumnya garis tiang tumpangan ditarik ke induk BATANG walau batang itu
-- tidak dilewati penyulangnya — SKT-001 (di LBR-007) tetap bergaris ke LBR-006
-- sesudah SEKOTONG dilepas dari sana, dan tidak bisa dikenali sebagai pangkal.
-- Disalin dari `jtm-nama-peralatan.sql` (versi hidup 16 Okt); yang berubah ★,
-- kolom baru di BELAKANG (syarat CREATE OR REPLACE VIEW).

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
       ip.induk_id,                                             -- ★
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
       t.nama_peralatan,
       ip.induk_id IS NULL  AS pangkal                          -- ★
FROM public.tiang t
JOIN public.tiang_kode_penyulang k ON k.tiang_id = t.id
-- ★ Induk di penyulang INI (= jtm_induk_di_penyulang): induk khusus, atau
-- induk batang bila batang itu juga dilewati penyulang ini, atau leluhur
-- terdekat yang dilewati. Yang terakhir hanya dihitung untuk pangkal tumpangan
-- (jarang), jadi peta tidak melambat. NULL = pangkal penyulang ini.
CROSS JOIN LATERAL (
  SELECT COALESCE(
    k.induk_id,
    CASE
      WHEN t.induk_id IS NULL THEN NULL
      WHEN EXISTS (SELECT 1 FROM public.tiang_kode_penyulang k1
                    WHERE k1.tiang_id = t.induk_id AND upper(k1.penyulang) = upper(k.penyulang)) THEN t.induk_id
      ELSE public.jtm_leluhur_di_penyulang(t.induk_id, k.penyulang)
    END) AS induk_id
) ip
LEFT JOIN public.tiang p ON p.id = ip.induk_id AND p.status_hidup = 'aktif'
WHERE t.gardu_kode IS NULL
  AND t.status_hidup = 'aktif' AND t.lat IS NOT NULL AND t.lng IS NOT NULL

UNION ALL

SELECT t.id, t.kode, t.ulp, t.lat, t.lng, t.penanda, t.percabangan,
       'jtm'::text, t.penyulang, t.induk_id, p.lat, p.lng, false,
       NULL::int, false, false, NULL::text, NULL::text,
       t.pasangan_portal_dari,
       t.gardu_di_tiang,
       t.nama_peralatan,
       t.induk_id IS NULL                                       -- ★
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
       NULL::text,
       false                                                    -- ★
FROM public.jtr_tiang j
LEFT JOIN public.tiang p ON p.id = j.induk_id AND p.status_hidup = 'aktif'
LEFT JOIN public.gardu g ON upper(g.kode) = upper(j.gardu_kode) AND upper(g.ulp) = upper(j.ulp)
JOIN public.tiang bt ON bt.id = j.id
WHERE j.status_hidup = 'aktif' AND j.lat IS NOT NULL AND j.lng IS NOT NULL;

GRANT SELECT ON public.peta_tiang TO authenticated;
