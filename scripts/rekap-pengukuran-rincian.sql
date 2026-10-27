-- =============================================================================
-- Rekap Kinerja — rincian Pengukuran Beban & Tegangan Ujung (27 Okt 2026)
-- Jalankan SESUDAH inspeksi-gardu-rekap.sql. Idempoten.
--
-- Masalah: realisasi Pengukuran = gardu WO yang pengukuran bebannya masuk,
-- tidak tertahan usulan titik/kVA, DAN tegangan ujungnya sudah DISETUJUI.
-- Gardu yang tegangan ujungnya masih menunggu persetujuan tidak terhitung
-- realisasi maupun "Belum disetujui" — CAKRANEGARA Okt: 70 gardu diukur,
-- realisasi 0, belum disetujui hanya 23.
--
-- Keputusan user 27 Okt: tampilkan semua angkanya — pengukuran beban berapa,
-- tegangan ujung berapa, belum disetujui berapa. Aturan realisasi & persetujuan
-- titik TETAP seperti semula (usulan "titik tidak menahan" dibatalkan user).
--   1. _rekap_kinerja_inti (salinan utuh inspeksi-gardu-rekap.sql, ★★★ =
--      baru): Belum disetujui Pengukuran + tegangan ujung terkirim belum
--      disetujui. ⚠ Definisi terbaru _rekap_kinerja_inti kini di SINI.
--   2. rekap_pengukuran_rincian — angka rincian untuk layar Rekap Kinerja,
--      dihitung di server (satu baris; tidak terkena batas 1.000 baris).
--
-- Satu gardu dihitung sekali: tertahan titik/kVA lebih dulu, baru tegangan ujung.
-- Pengukuran beban = Realisasi + Belum disetujui + tegangan ujung belum dikirim.
-- =============================================================================

-- ── 1. Rekap Kinerja ─────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public._rekap_kinerja_inti(p_ulp TEXT, p_tahun INT, p_bulan INT)
RETURNS TABLE (kunci TEXT, wo_terbit NUMERIC, realisasi NUMERIC, belum_disetujui NUMERIC, luar_wo NUMERIC)
LANGUAGE plpgsql STABLE SET search_path = public AS $$
DECLARE
  u      TEXT := NULLIF(NULLIF(upper(btrim(COALESCE(p_ulp, ''))), ''), 'SEMUA');
  d_awal DATE := make_date(p_tahun, CASE WHEN p_bulan = 0 THEN 1 ELSE p_bulan END, 1);
  d_akhr DATE;
  t_awal TIMESTAMPTZ;
  t_akhr TIMESTAMPTZ;
  jadi   NUMERIC;
  sistem NUMERIC;
  tempel NUMERIC;
  centang NUMERIC;   -- ★ realisasi tempelan JTM Tier 2 (dicentang di web)
  anomali NUMERIC;
BEGIN
  d_akhr := CASE WHEN p_bulan = 0 THEN make_date(p_tahun + 1, 1, 1)
                 ELSE (d_awal + INTERVAL '1 month')::date END;
  t_awal := d_awal::timestamp AT TIME ZONE 'Asia/Makassar';
  t_akhr := d_akhr::timestamp AT TIME ZONE 'Asia/Makassar';

  RETURN QUERY
  SELECT 'perabasan'::text, round(COALESCE(sum(c.target_km), 0), 3), round(COALESCE(sum(c.capaian_km), 0), 3),
    -- ★★ Belum disetujui = km segmen yang sudah selesai dirabas regu tapi
    --    belum diverifikasi (status 'Selesai'), dari WO bulan yang sama
    --    dengan Realisasi. Dulu ditulis mati 0.
    (SELECT round(COALESCE(sum(i.panjang_km), 0), 3)
       FROM public.wo_perabasan_item i JOIN public.wo_perabasan w ON w.id = i.wo_id
      WHERE i.status = 'Selesai'
        AND w.tgl_wo::date >= d_awal AND w.tgl_wo::date < d_akhr
        AND w.status <> 'Dibatalkan'
        AND (u IS NULL OR upper(w.ulp) = u)),
    (SELECT count(*)::numeric FROM public.perabasan_luar_wo l
      WHERE l.status IN ('Selesai', 'Diverifikasi')
        AND l.tgl >= d_awal AND l.tgl < d_akhr
        AND (u IS NULL OR upper(l.ulp_regu) = u))
  FROM public.wo_perabasan_capaian c
  WHERE c.tgl_wo::date >= d_awal AND c.tgl_wo::date < d_akhr
    AND c.status <> 'Dibatalkan'   -- ★ WO yang dibatalkan tidak dihitung terbit
    AND (u IS NULL OR upper(c.ulp) = u);

  RETURN QUERY
  SELECT 'harjtm'::text, public._wo_manual_total(u, p_tahun, p_bulan, 'harjtm', false, false),
    count(*)::numeric, count(*) FILTER (WHERE j.status = 'Selesai')::numeric,
    count(*) FILTER (WHERE j.inspeksi_id IS NOT NULL)::numeric
  FROM public.pemeliharaan_jaringan j
  WHERE j.status NOT IN ('Dibatalkan', 'Dikembalikan')
    AND j.tgl::date >= d_awal AND j.tgl::date < d_akhr
    AND (u IS NULL OR upper(j.ulp) = u);

  SELECT count(*) FILTER (WHERE r.terealisasi) INTO jadi
  FROM public.wo_hargardu_realisasi r
  WHERE r.tahun = p_tahun AND (p_bulan = 0 OR r.bulan = p_bulan)
    AND (u IS NULL OR upper(r.ulp) = u);

  RETURN QUERY
  SELECT 'hargardu'::text,
    (SELECT count(*)::numeric FROM public.wo_hargardu_realisasi r
      WHERE r.tahun = p_tahun AND (p_bulan = 0 OR r.bulan = p_bulan) AND (u IS NULL OR upper(r.ulp) = u)),
    jadi,
    (SELECT count(*) FILTER (WHERE r.terealisasi AND NOT r.disetujui)::numeric FROM public.wo_hargardu_realisasi r
      WHERE r.tahun = p_tahun AND (p_bulan = 0 OR r.bulan = p_bulan) AND (u IS NULL OR upper(r.ulp) = u)),
    GREATEST(0, (SELECT count(*) FROM public.pemeliharaan_gardu g
                  WHERE g.status IN ('Selesai', 'Diverifikasi')
                    AND g.created_at >= t_awal AND g.created_at < t_akhr
                    AND (u IS NULL OR upper(g.ulp) = u)) - jadi)::numeric;

  -- ★ WO Penyeimbangan = tempelan + WO dari anomali pengukuran (Bulan WO).
  -- Gardu yang ada di keduanya pada bulan yang sama dihitung sekali; gardu
  -- yang di-WO dua kali dari anomali dalam sebulan juga sekali.
  tempel := public._wo_manual_total(u, p_tahun, p_bulan, 'penyeimbangan', false, false);
  SELECT count(DISTINCT (pg.wo_bulan, upper(pg.petugas_unit), upper(pg.no_gardu))) INTO anomali
    FROM public.pengukuran_gardu pg
   WHERE pg.jenis_pemeliharaan = 'PEMERATAAN BEBAN'
     AND pg.hasil_penyeimbangan_id IS NULL
     AND pg.wo_bulan >= d_awal AND pg.wo_bulan < d_akhr
     AND (u IS NULL OR upper(pg.petugas_unit) = u)
     AND NOT public._gardu_di_tempelan('penyeimbangan', upper(pg.petugas_unit), pg.wo_bulan, pg.no_gardu);

  RETURN QUERY
  SELECT 'penyeimbangan'::text,
    CASE WHEN tempel IS NULL AND anomali = 0 THEN NULL ELSE COALESCE(tempel, 0) + anomali END,
    count(*)::numeric, NULL::numeric, NULL::numeric
  FROM public.penyeimbangan_gardu p
  -- ★ Realisasi = pekerjaan yang SUDAH DISETOR (status Selesai, termasuk yang
  --   menunggu persetujuan). 'Dikerjakan' = baru diambil regu, belum ada
  --   pekerjaan — dulu ikut terhitung begitu tombol "Ambil tugas" ditekan.
  -- ★ Bulannya = tanggal pekerjaan (tgl_penyeimbangan), bukan saat diambil:
  --   diambil 30 Sep, dikerjakan 2 Okt = realisasi Oktober.
  WHERE p.status = 'Selesai'
    AND p.tgl_penyeimbangan >= d_awal AND p.tgl_penyeimbangan < d_akhr
    AND (u IS NULL OR upper(p.ulp) = u);

  RETURN QUERY
  SELECT 'optimasi'::text,
    (SELECT count(*)::numeric FROM public.pengukuran_gardu pg
      WHERE pg.jenis_pemeliharaan = 'OPTIMASI TRAFO'
        AND pg.wo_bulan >= d_awal AND pg.wo_bulan < d_akhr   -- ★ Bulan WO
        AND (u IS NULL OR upper(pg.petugas_unit) = u)
        AND NOT EXISTS (SELECT 1 FROM public.optimasi_wo_batal b WHERE b.pengukuran_id::text = pg.id::text)),
    count(*)::numeric,
    count(*) FILTER (WHERE o.status = 'Selesai')::numeric,
    NULL::numeric
  FROM public.optimasi_trafo o
  WHERE o.status NOT IN ('Dibatalkan', 'Dikembalikan')
    AND o.tgl_operasi::date >= d_awal AND o.tgl_operasi::date < d_akhr
    AND (u IS NULL OR upper(o.ulp) = u);

  -- ★★★ Belum disetujui = tertahan usulan titik/kVA + tegangan ujung yang
  --      SUDAH dikirim regu tapi belum disetujui (27 Okt 2026). Dulu gardu yang
  --      menunggu persetujuan tegangan ujung tidak muncul di kolom mana pun.
  --      Aturan Realisasi TIDAK berubah.
  RETURN QUERY
  SELECT 'pengukuran'::text, count(*)::numeric,
    count(*) FILTER (WHERE r.terealisasi)::numeric,
    count(*) FILTER (WHERE r.tertahan OR (r.menunggu_tegangan_ujung AND EXISTS (
      SELECT 1 FROM public.pengukuran_tegangan_ujung x
      WHERE x.pengukuran_id = r.pengukuran_id AND x.status = 'Terkirim')))::numeric,
    NULL::numeric
  FROM public.wo_pengukuran_realisasi r
  WHERE r.tahun = p_tahun AND (p_bulan = 0 OR r.bulan = p_bulan)
    AND (u IS NULL OR upper(r.ulp) = u);

  -- ★ Inspeksi JTM Tier 1: WO sistem (termasuk tempelan yang cocok master)
  -- DITAMBAH tempelan yang segmennya belum di master. NULL kalau dua-duanya tidak ada.
  SELECT round(sum(i.panjang_km), 3) INTO sistem
    FROM public.wo_inspeksi_item i JOIN public.wo_inspeksi w ON w.id = i.wo_id
   WHERE w.jenis = 'JTM' AND i.status <> 'Dibatalkan'
     AND w.tier = '1'   -- ★ WO Tier 2 punya barisnya sendiri
     AND w.tgl_wo >= d_awal AND w.tgl_wo < d_akhr
     AND (u IS NULL OR upper(i.ulp) = u);
  tempel := public._wo_manual_total(u, p_tahun, p_bulan, 'jtm', true, false);

  RETURN QUERY
  SELECT 'jtm'::text,
    CASE WHEN sistem IS NULL AND tempel IS NULL THEN 0::numeric ELSE COALESCE(sistem, 0) + COALESCE(tempel, 0) END,
    round(COALESCE(sum(COALESCE(kd.km, sp.panjang_pakai_km)) FILTER (WHERE m.status IN ('Selesai', 'Diverifikasi')), 0), 3),
    round(COALESCE(sum(COALESCE(kd.km, sp.panjang_pakai_km)) FILTER (WHERE m.status = 'Selesai'), 0), 3),
    round(COALESCE(sum(COALESCE(kd.km, sp.panjang_pakai_km)) FILTER (
      WHERE m.status IN ('Selesai', 'Diverifikasi') AND m.wo_item_id IS NULL), 0), 3)
  FROM public.inspeksi_jtm m
  LEFT JOIN public.segmen_panjang sp ON sp.segmen_id = m.segmen_id
  LEFT JOIN public.inspeksi_jtm_km kd ON kd.inspeksi_id = m.id   -- ★ km dibekukan saat disetujui
  -- ★ Bulan realisasi = bulan DIKIRIM (tgl_selesai), bukan bulan dimulai
  -- (keputusan user 2 Okt 2026). Yang belum dikirim memang tidak dihitung.
  WHERE COALESCE(m.tgl_selesai, m.created_at) >= t_awal
    AND COALESCE(m.tgl_selesai, m.created_at) < t_akhr
    AND m.tier = '1'
    AND (u IS NULL OR upper(m.ulp) = u);

  -- ★ Inspeksi JTM Tier 2 (rencana-wo-jtm-tier2.md): dua jalur WO.
  --   WO        = WO susun Tier 2 (segmen master, dikerjakan di HP)
  --             + tempelan Tier 2 (wo_manual, dicentang di web).
  --   Realisasi = inspeksi HP Tier 2 (tersambung WO maupun di luar WO)
  --             + centang tempelan. Hitungan ganda (tempelan dicentang DAN
  --             segmennya diinspeksi di HP) dibiarkan — web merinci keduanya.
  --   NULL di WO = belum ada WO apa pun (keadaan "belum ber-WO" di web).
  SELECT round(sum(i.panjang_km), 3) INTO sistem
    FROM public.wo_inspeksi_item i JOIN public.wo_inspeksi w ON w.id = i.wo_id
   WHERE w.jenis = 'JTM' AND w.tier = '2' AND i.status <> 'Dibatalkan'
     AND w.tgl_wo >= d_awal AND w.tgl_wo < d_akhr
     AND (u IS NULL OR upper(i.ulp) = u);
  tempel  := public._wo_manual_total(u, p_tahun, p_bulan, 'jtm2', true, false);
  centang := public._wo_manual_total(u, p_tahun, p_bulan, 'jtm2', true, true);

  RETURN QUERY
  SELECT 'jtm2'::text,
    CASE WHEN sistem IS NULL AND tempel IS NULL THEN NULL::numeric ELSE COALESCE(sistem, 0) + COALESCE(tempel, 0) END,
    round(COALESCE(sum(COALESCE(kd.km, sp.panjang_pakai_km)) FILTER (WHERE m.status IN ('Selesai', 'Diverifikasi')), 0)
          + COALESCE(centang, 0), 3),
    round(COALESCE(sum(COALESCE(kd.km, sp.panjang_pakai_km)) FILTER (WHERE m.status = 'Selesai'), 0), 3),
    round(COALESCE(sum(COALESCE(kd.km, sp.panjang_pakai_km)) FILTER (
      WHERE m.status IN ('Selesai', 'Diverifikasi') AND m.wo_item_id IS NULL), 0), 3)
  FROM public.inspeksi_jtm m
  LEFT JOIN public.segmen_panjang sp ON sp.segmen_id = m.segmen_id
  LEFT JOIN public.inspeksi_jtm_km kd ON kd.inspeksi_id = m.id   -- ★ km dibekukan saat disetujui
  -- Bulan realisasi = bulan DIKIRIM, sama dengan Tier 1.
  WHERE COALESCE(m.tgl_selesai, m.created_at) >= t_awal
    AND COALESCE(m.tgl_selesai, m.created_at) < t_akhr
    AND m.tier = '2'
    AND (u IS NULL OR upper(m.ulp) = u);

  RETURN QUERY
  SELECT 'jtr'::text,
    (SELECT round(COALESCE(sum(i.panjang_km), 0), 3)
       FROM public.wo_inspeksi_item i
       JOIN public.wo_inspeksi w ON w.id = i.wo_id
      WHERE w.jenis = 'JTR' AND i.status <> 'Dibatalkan'
        AND w.tgl_wo >= d_awal AND w.tgl_wo < d_akhr
        AND (u IS NULL OR upper(i.ulp) = u)),
    round(COALESCE(sum(pj.km) FILTER (WHERE r.status IN ('Selesai', 'Diverifikasi')), 0), 3),
    round(COALESCE(sum(pj.km) FILTER (WHERE r.status = 'Selesai'), 0), 3),
    round(COALESCE(sum(pj.km) FILTER (
      WHERE r.status IN ('Selesai', 'Diverifikasi') AND r.wo_item_id IS NULL), 0), 3)
  FROM public.inspeksi_jtr r
  LEFT JOIN LATERAL (
    SELECT sum(g.panjang_km) AS km FROM public.gardu_jtr_penghantar g
    WHERE g.gardu_kode = r.gardu_kode AND g.ulp = r.ulp
  ) pj ON true
  WHERE r.created_at >= t_awal AND r.created_at < t_akhr
    AND (u IS NULL OR upper(r.ulp) = u);

  -- ★★ Inspeksi Gardu Tier 1 & 2 (G4, 27 Okt 2026) — tempelan Excel (dicentang
  --    di web) + WO Inspeksi Gardu dari aplikasi. Bulan+ULP yang SUDAH punya
  --    tempelan tetap memakai tempelan saja; WO aplikasi di bulan itu tidak
  --    ikut dihitung (tidak ganda). Realisasi = gardu WO yang kunjungannya
  --    sudah dikirim (Selesai/Diverifikasi, tidak tertahan usulan titik) —
  --    sama dengan wo_igardu_capaian. Belum disetujui = terkirim tapi belum
  --    Diverifikasi. Di luar WO = kunjungan terkirim tanpa item WO.
  RETURN QUERY
  WITH item AS (
    SELECT i.tier,
           EXISTS (SELECT 1 FROM public.inspeksi_gardu g
                    WHERE g.wo_item_id = i.id AND g.status IN ('Selesai', 'Diverifikasi')
                      AND NOT EXISTS (SELECT 1 FROM public.master_usulan mu
                                       WHERE mu.sumber_modul = 'inspeksi_gardu' AND mu.sumber_id = g.id
                                         AND mu.status = 'menunggu')) AS terkirim,
           EXISTS (SELECT 1 FROM public.inspeksi_gardu g
                    WHERE g.wo_item_id = i.id AND g.status = 'Diverifikasi') AS disetujui
    FROM public.wo_igardu_item i
    JOIN public.wo_igardu w ON w.id = i.wo_id
    WHERE i.status <> 'Dibatalkan' AND w.status <> 'Dibatalkan'
      AND w.tgl_wo >= d_awal AND w.tgl_wo < d_akhr
      AND (u IS NULL OR upper(w.ulp) = u)
      AND NOT EXISTS (SELECT 1 FROM public.wo_manual m
                       WHERE m.jenis = 'igardu' || i.tier
                         AND m.tahun = extract(year FROM w.tgl_wo)::int
                         AND m.bulan = extract(month FROM w.tgl_wo)::int
                         AND m.ulp = upper(w.ulp))
  ), luar AS (
    SELECT x.tier, count(*)::numeric AS n
    FROM public.inspeksi_gardu x
    WHERE x.wo_item_id IS NULL AND x.status IN ('Selesai', 'Diverifikasi')
      AND x.tgl >= t_awal AND x.tgl < t_akhr
      AND (u IS NULL OR upper(x.ulp) = u)
    GROUP BY x.tier
  )
  SELECT 'igardu' || t.tier,
    -- NULL = belum ada WO sama sekali (tampil "—"), seperti sebelumnya.
    CASE WHEN tm.wo IS NULL AND NOT EXISTS (SELECT 1 FROM item WHERE item.tier = t.tier) THEN NULL
         ELSE COALESCE(tm.wo, 0) + (SELECT count(*) FROM item WHERE item.tier = t.tier) END,
    COALESCE(tm.jadi, 0) + (SELECT count(*) FILTER (WHERE item.terkirim) FROM item WHERE item.tier = t.tier),
    (SELECT count(*) FILTER (WHERE item.terkirim AND NOT item.disetujui) FROM item WHERE item.tier = t.tier)::numeric,
    COALESCE((SELECT luar.n FROM luar WHERE luar.tier = t.tier), 0)
  FROM (VALUES ('1'), ('2')) t(tier)
  CROSS JOIN LATERAL (
    SELECT public._wo_manual_total(u, p_tahun, p_bulan, 'igardu' || t.tier, false, false) AS wo,
           public._wo_manual_total(u, p_tahun, p_bulan, 'igardu' || t.tier, false, true)  AS jadi
  ) tm;
END $$;


-- ── 2. Rincian Pengukuran ────────────────────────────────────────────────────
-- Per gardu WO pada periode (aturan periode & ULP = baris pengukuran rekap):
--   diukur         pengukuran beban masuk (tidak dikembalikan)
--   tu_terkirim    tegangan ujungnya sudah dikirim regu (disetujui atau belum)
--   tu_disetujui   tegangan ujungnya sudah disetujui
--   tertahan_titik tertahan usulan titik / kVA
--   tu_menunggu    tegangan ujung terkirim, belum disetujui (tidak tertahan titik)
--   tu_belum       beban sudah diukur, tegangan ujung belum dikirim (atau dikembalikan)
DROP FUNCTION IF EXISTS public.rekap_pengukuran_rincian(TEXT, INT, INT);
CREATE OR REPLACE FUNCTION public.rekap_pengukuran_rincian(p_ulp TEXT, p_tahun INT, p_bulan INT)
RETURNS TABLE (diukur INT, tu_terkirim INT, tu_disetujui INT, tertahan_titik INT, tu_menunggu INT, tu_belum INT)
LANGUAGE sql STABLE SET search_path = public AS $fn$
  WITH r AS (
    SELECT w.pengukuran_id, w.tertahan, w.tegangan_ujung_ada, w.menunggu_tegangan_ujung,
           EXISTS (SELECT 1 FROM public.pengukuran_tegangan_ujung x
                    WHERE x.pengukuran_id = w.pengukuran_id AND x.status = 'Terkirim') AS tu_kirim
    FROM public.wo_pengukuran_realisasi w
    WHERE w.tahun = p_tahun AND (p_bulan = 0 OR w.bulan = p_bulan)
      AND (NULLIF(NULLIF(upper(btrim(COALESCE(p_ulp, ''))), ''), 'SEMUA') IS NULL
           OR upper(w.ulp) = upper(btrim(p_ulp)))
  )
  SELECT count(*) FILTER (WHERE pengukuran_id IS NOT NULL)::int,
         count(*) FILTER (WHERE tu_kirim)::int,
         count(*) FILTER (WHERE tegangan_ujung_ada)::int,
         count(*) FILTER (WHERE tertahan)::int,
         count(*) FILTER (WHERE menunggu_tegangan_ujung AND tu_kirim)::int,
         count(*) FILTER (WHERE menunggu_tegangan_ujung AND NOT tu_kirim)::int
  FROM r;
$fn$;
GRANT EXECUTE ON FUNCTION public.rekap_pengukuran_rincian(TEXT, INT, INT) TO authenticated;


-- ── Periksa ──────────────────────────────────────────────────────────────────
--   SELECT * FROM rekap_pengukuran_rincian('CAKRANEGARA', 2026, 10);
--   SELECT * FROM rekap_kinerja('CAKRANEGARA', 2026, 10) WHERE kunci = 'pengukuran';
