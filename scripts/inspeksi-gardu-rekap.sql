-- =============================================================================
-- Inspeksi Gardu — G4: Rekap Kinerja, Realisasi Harian/Bulanan, Riwayat HP
-- (27 Okt 2026). Rencana: rencana-wo-gardu-dan-inspeksi-gardu.md.
-- Jalankan SESUDAH inspeksi-gardu.sql & inspeksi-gardu-pengaturan.sql.
-- Idempoten.
--
-- Disalin UTUH dari jtm-km-disetujui.sql (definisi terbaru ketiganya);
-- yang berubah ditandai ★★:
--   1. _rekap_kinerja_inti — baris igardu1/igardu2: tempelan Excel + WO
--      Inspeksi Gardu aplikasi. Bulan+ULP yang sudah ditempel tetap memakai
--      tempelan (keputusan rencana: "Bulan yang sudah ditempel Excel tetap").
--   2. realisasi_rentang — kunjungan Inspeksi Gardu terkirim (Realisasi
--      Harian, Realisasi Bulanan, Copy to PRO NTB, lampiran).
--   3. riwayat_pekerjaan — jenis 'igardu' untuk Riwayat HP.
--   4. foto_riwayat (dari riwayat-petugas-foto.sql) — foto gardu & temuan di
--      rincian Riwayat HP.
-- ⚠ Definisi terbaru keempatnya kini di SINI — salin dari sini bila mengubahnya.
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

  RETURN QUERY
  SELECT 'pengukuran'::text, count(*)::numeric,
    count(*) FILTER (WHERE r.terealisasi)::numeric,
    count(*) FILTER (WHERE r.tertahan)::numeric, NULL::numeric
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


-- ── 2. Realisasi Harian / Bulanan / PRO NTB / lampiran ──────────────────────
-- Disalin UTUH dari realisasi-bulanan-lampiran.sql (bentuk hasil sama, jadi
-- CREATE OR REPLACE tanpa DROP); yang berubah hanya km JTM (★ kd).
CREATE OR REPLACE FUNCTION public.realisasi_rentang(p_ulp TEXT, p_dari DATE, p_sampai DATE)
RETURNS TABLE (tgl DATE, kunci TEXT, bagian TEXT, ulp TEXT, objek TEXT, rincian TEXT, petugas TEXT,
               waktu TIME, km NUMERIC, disetujui BOOLEAN, sumber TEXT, sumber_id TEXT)
LANGUAGE sql STABLE SET search_path = public AS $fn$
WITH u AS (SELECT NULLIF(NULLIF(upper(btrim(COALESCE(p_ulp, ''))), ''), 'SEMUA') AS v),
semua AS (
  -- Perabasan (WO): segmen yang SELESAI dirabas hari itu.
  SELECT i.tgl_selesai AS tgl, 'perabasan'::text AS kunci, NULL::text AS bagian, upper(w.ulp) AS ulp,
    i.segmen_nama::text AS objek,
    concat_ws(' · ', i.penyulang,
      (SELECT count(*) FROM public.perabasan_realisasi r WHERE r.item_id = i.id) || ' pohon')::text AS rincian,
    COALESCE(i.regu, i.pelaksana)::text AS petugas, NULL::time AS waktu,
    i.panjang_km::numeric AS km, (i.status = 'Diverifikasi') AS disetujui, 'wo_perabasan_item'::text AS sumber, i.id::text AS sumber_id
  FROM public.wo_perabasan_item i JOIN public.wo_perabasan w ON w.id = i.wo_id
  WHERE i.tgl_selesai BETWEEN p_dari AND p_sampai
    AND i.status IN ('Selesai', 'Diverifikasi') AND w.status <> 'Dibatalkan'

  UNION ALL  -- Perabasan di luar WO (dihitung ke ULP regu, sama dengan Rekap Kinerja)
  SELECT l.tgl, 'perabasan', 'luar', upper(COALESCE(l.ulp_regu, l.ulp)),
    concat_ws(' · ', l.penyulang, NULLIF(l.lokasi, '')), concat_ws(' · ', 'Di luar WO', l.jenis_pohon),
    l.regu, (l.created_at AT TIME ZONE 'Asia/Makassar')::time, NULL, (l.status = 'Diverifikasi'), 'perabasan_luar_wo', l.id::text
  FROM public.perabasan_luar_wo l
  WHERE l.tgl BETWEEN p_dari AND p_sampai AND l.status IN ('Selesai', 'Diverifikasi')

  UNION ALL  -- Pemeliharaan Jaringan
  SELECT j.tgl::date, 'harjtm', NULL, upper(j.ulp), concat_ws(' · ', j.jenis, j.penyulang), j.pekerjaan,
    j.petugas_nama, (j.created_at AT TIME ZONE 'Asia/Makassar')::time, NULL, (j.status = 'Diverifikasi'), 'pemeliharaan_jaringan', j.id::text
  FROM public.pemeliharaan_jaringan j
  WHERE j.tgl::date BETWEEN p_dari AND p_sampai AND j.status IN ('Selesai', 'Diverifikasi')

  UNION ALL  -- Pemeliharaan Gardu
  SELECT (COALESCE(g.tgl_selesai, g.tgl_padam, g.created_at) AT TIME ZONE 'Asia/Makassar')::date,
    'hargardu', NULL, upper(g.ulp), g.gardu_kode, g.penyulang, g.petugas_nama,
    (COALESCE(g.tgl_selesai, g.tgl_padam, g.created_at) AT TIME ZONE 'Asia/Makassar')::time, NULL,
    (g.status = 'Diverifikasi'), 'pemeliharaan_gardu', g.id::text
  FROM public.pemeliharaan_gardu g
  WHERE (COALESCE(g.tgl_selesai, g.tgl_padam, g.created_at) AT TIME ZONE 'Asia/Makassar')::date
          BETWEEN p_dari AND p_sampai
    AND g.status IN ('Selesai', 'Diverifikasi')

  UNION ALL  -- Penyeimbangan Beban (tanpa tahap persetujuan; 'Dikerjakan' = belum selesai)
  SELECT CASE WHEN s.tgl_penyeimbangan::text ~ '^\d{4}-\d{2}-\d{2}' THEN left(s.tgl_penyeimbangan::text, 10)::date
              ELSE (s.created_at AT TIME ZONE 'Asia/Makassar')::date END,
    'penyeimbangan', NULL, upper(s.ulp), s.no_gardu,
    concat_ws(' · ', s.penyulang,
      CASE WHEN s.beban_pct_after IS NOT NULL
           THEN 'beban ' || round(s.beban_pct_before::numeric, 0) || '% → ' || round(s.beban_pct_after::numeric, 0) || '%' END),
    s.petugas_penyeimbang, (s.created_at AT TIME ZONE 'Asia/Makassar')::time, NULL, true, 'penyeimbangan_gardu', s.id::text
  FROM public.penyeimbangan_gardu s
  WHERE CASE WHEN s.tgl_penyeimbangan::text ~ '^\d{4}-\d{2}-\d{2}' THEN left(s.tgl_penyeimbangan::text, 10)::date
             ELSE (s.created_at AT TIME ZONE 'Asia/Makassar')::date END BETWEEN p_dari AND p_sampai
    AND s.status IS DISTINCT FROM 'Dikerjakan'

  UNION ALL  -- Optimasi Trafo
  SELECT o.tgl_operasi::date, 'optimasi', NULL, upper(o.ulp), o.kode_gardu,
    concat_ws(' · ', o.penyulang, o.kva_lama || ' → ' || o.kva_baru || ' kVA'),
    o.petugas_nama, NULL, NULL, (o.status = 'Diverifikasi'), 'optimasi_trafo', o.id::text
  FROM public.optimasi_trafo o
  WHERE o.tgl_operasi::date BETWEEN p_dari AND p_sampai
    AND o.status IN ('Selesai', 'Diverifikasi') AND o.dikembalikan_at IS NULL

  UNION ALL  -- Pengukuran beban gardu
  SELECT CASE WHEN p.tanggal_pengukuran::text ~ '^\d{4}-\d{2}-\d{2}' THEN left(p.tanggal_pengukuran::text, 10)::date
              ELSE (p.created_at AT TIME ZONE 'Asia/Makassar')::date END,
    'pengukuran', NULL, upper(p.petugas_unit), p.no_gardu,
    concat_ws(' · ', p.penyulang, 'beban ' || round(p.persen_beban::numeric, 0) || '%'),
    p.petugas_nama,
    CASE WHEN p.jam_pengukuran::text ~ '^\d{2}:\d{2}' THEN left(p.jam_pengukuran::text, 5)::time END,
    NULL, NOT EXISTS (SELECT 1 FROM public.pengukuran_tertahan t WHERE t.pengukuran_id = p.id), 'pengukuran_gardu', p.id::text
  FROM public.pengukuran_gardu p
  WHERE p.hasil_penyeimbangan_id IS NULL AND p.dikembalikan_at IS NULL
    AND CASE WHEN p.tanggal_pengukuran::text ~ '^\d{4}-\d{2}-\d{2}' THEN left(p.tanggal_pengukuran::text, 10)::date
             ELSE (p.created_at AT TIME ZONE 'Asia/Makassar')::date END BETWEEN p_dari AND p_sampai

  UNION ALL  -- Tegangan ujung (baris Pengukuran)
  SELECT t.tgl_ukur, 'pengukuran', 'ujung', upper(t.ulp), t.gardu_kode, 'Jurusan ' || t.jurusan,
    t.petugas_nama, t.jam_ukur, NULL, (t.verified_at IS NOT NULL), 'pengukuran_tegangan_ujung', t.id::text
  FROM public.pengukuran_tegangan_ujung t
  WHERE t.tgl_ukur BETWEEN p_dari AND p_sampai AND t.status = 'Terkirim'

  UNION ALL  -- Inspeksi JTM (tanggal = dikirim, sama dengan Rekap Kinerja)
  SELECT (COALESCE(m.tgl_selesai, m.created_at) AT TIME ZONE 'Asia/Makassar')::date,
    CASE WHEN m.tier = '2' THEN 'jtm2' ELSE 'jtm' END, NULL, upper(m.ulp),
    COALESCE(sg.nama, 'segmen'), m.penyulang, m.petugas_nama,
    (COALESCE(m.tgl_selesai, m.created_at) AT TIME ZONE 'Asia/Makassar')::time,
    COALESCE(kd.km, sp.panjang_pakai_km), (m.status = 'Diverifikasi'), 'inspeksi_jtm', m.id::text
  FROM public.inspeksi_jtm m
  LEFT JOIN public.segmen sg ON sg.id = m.segmen_id
  LEFT JOIN public.segmen_panjang sp ON sp.segmen_id = m.segmen_id
  LEFT JOIN public.inspeksi_jtm_km kd ON kd.inspeksi_id = m.id   -- ★ km dibekukan saat disetujui
  WHERE (COALESCE(m.tgl_selesai, m.created_at) AT TIME ZONE 'Asia/Makassar')::date BETWEEN p_dari AND p_sampai
    AND m.status IN ('Selesai', 'Diverifikasi')

  UNION ALL  -- Inspeksi JTR
  SELECT COALESCE(r.tgl_selesai, r.tgl_mulai, (r.created_at AT TIME ZONE 'Asia/Makassar')::date),
    'jtr', NULL, upper(r.ulp), upper(r.gardu_kode), r.penyulang, r.inspektor_nama,
    (COALESCE(r.updated_at, r.created_at) AT TIME ZONE 'Asia/Makassar')::time,
    (SELECT round(sum(g.panjang_km)::numeric, 3) FROM public.gardu_jtr_penghantar g
      WHERE g.gardu_kode = r.gardu_kode AND g.ulp = r.ulp),
    (r.status = 'Diverifikasi'), 'inspeksi_jtr', r.id::text
  FROM public.inspeksi_jtr r
  WHERE COALESCE(r.tgl_selesai, r.tgl_mulai, (r.created_at AT TIME ZONE 'Asia/Makassar')::date)
          BETWEEN p_dari AND p_sampai
    AND r.status IN ('Selesai', 'Diverifikasi')

  UNION ALL  -- ★★ Inspeksi Gardu dari aplikasi (tanggal = kunjungan, WITA)
  SELECT (x.tgl AT TIME ZONE 'Asia/Makassar')::date, 'igardu' || x.tier, NULL, upper(x.ulp), x.gardu_kode,
    concat_ws(' · ', x.penyulang,
      CASE WHEN x.ada_temuan
           THEN (SELECT count(*) FROM public.inspeksi_gardu_temuan t WHERE t.inspeksi_id = x.id) || ' temuan'
           ELSE 'tanpa temuan' END,
      CASE WHEN x.wo_item_id IS NULL THEN 'Di luar WO' END),
    x.petugas_nama, (x.tgl AT TIME ZONE 'Asia/Makassar')::time, NULL,
    (x.status = 'Diverifikasi'), 'inspeksi_gardu', x.id::text
  FROM public.inspeksi_gardu x
  WHERE (x.tgl AT TIME ZONE 'Asia/Makassar')::date BETWEEN p_dari AND p_sampai
    AND x.status IN ('Selesai', 'Diverifikasi')

  UNION ALL  -- Dicentang di web: JTM Tier 2 & Inspeksi Gardu (tempelan WO)
  SELECT i.selesai_tgl, m.jenis, NULL, upper(m.ulp), i.objek, COALESCE(i.uraian, i.alamat),
    i.selesai_oleh, NULL, CASE WHEN m.jenis = 'jtm2' THEN i.km END, true, 'wo_manual_item', i.id::text
  FROM public.wo_manual_item i JOIN public.wo_manual m ON m.id = i.wo_id
  WHERE i.selesai_tgl BETWEEN p_dari AND p_sampai AND m.jenis IN ('jtm2', 'igardu1', 'igardu2')
)
SELECT s.* FROM semua s, u
WHERE u.v IS NULL OR s.ulp = u.v
ORDER BY s.tgl, s.ulp, s.kunci, s.bagian NULLS FIRST, s.waktu NULLS LAST, s.objek;
$fn$;

COMMENT ON FUNCTION public.realisasi_rentang(TEXT, DATE, DATE) IS
  'Pekerjaan yang dikirim regu dalam rentang tanggal (WITA), per kunci baris Rekap Kinerja, termasuk yang belum disetujui. sumber/sumber_id = tabel & id baris modulnya (Realisasi Bulanan). Sumber realisasi_harian, realisasi_bulanan, Copy to PRO NTB, Realisasi Bulanan.';
GRANT EXECUTE ON FUNCTION public.realisasi_rentang(TEXT, DATE, DATE) TO authenticated;


-- ── 3. Riwayat pekerjaan (HP) ────────────────────────────────────────────────
-- Disalin UTUH dari jtm-temuan-tugas-regu.sql; yang berubah hanya km JTM (★ kd).
CREATE OR REPLACE VIEW public.riwayat_pekerjaan
WITH (security_invoker = true) AS

-- Pemeliharaan Gardu (yang baru dijadwalkan belum pekerjaan)
SELECT 'hargardu'::text AS jenis, g.id::text AS sumber_id, upper(g.ulp) AS ulp,
  (COALESCE(g.tgl_selesai, g.tgl_padam, g.created_at) AT TIME ZONE 'Asia/Makassar')::date AS tgl,
  (COALESCE(g.tgl_selesai, g.tgl_padam, g.created_at) AT TIME ZONE 'Asia/Makassar')::time AS waktu,
  g.gardu_kode::text AS objek,
  concat_ws(' · ', g.penyulang, NULLIF(array_to_string(g.regu_1, ', '), ''))::text AS keterangan,
  CASE g.status WHEN 'Dalam Proses' THEN 'Sedang dikerjakan' WHEN 'Selesai' THEN 'Menunggu verifikasi'
    WHEN 'Diverifikasi' THEN 'Diterima' WHEN 'Ditolak' THEN 'Dikembalikan' ELSE 'Dibatalkan' END AS status,
  g.status::text AS status_asli, g.verified_note::text AS alasan,
  g.petugas_nama::text AS petugas, NULL::text AS petugas_lain, NULL::numeric AS km,
  NULL::text AS foto_url, g.lat::double precision AS lat, g.lng::double precision AS lng
FROM public.pemeliharaan_gardu g
WHERE g.status <> 'Dijadwalkan'

UNION ALL
-- Pengukuran Gardu (baris pembawa hasil penyeimbangan bukan pengukuran petugas)
SELECT 'pengukuran', p.id::text, upper(p.petugas_unit),
  CASE WHEN p.tanggal_pengukuran::text ~ '^\d{4}-\d{2}-\d{2}' THEN left(p.tanggal_pengukuran::text, 10)::date
       ELSE (p.created_at AT TIME ZONE 'Asia/Makassar')::date END,
  CASE WHEN p.jam_pengukuran::text ~ '^\d{2}:\d{2}' THEN left(p.jam_pengukuran::text, 5)::time END,
  p.no_gardu::text,
  concat_ws(' · ', p.penyulang, 'beban ' || round(p.persen_beban::numeric, 0) || '%'),
  CASE WHEN p.dikembalikan_at IS NOT NULL THEN 'Dikembalikan'
       WHEN EXISTS (SELECT 1 FROM public.pengukuran_tertahan t WHERE t.pengukuran_id = p.id) THEN 'Menunggu verifikasi'
       ELSE 'Diterima' END,
  CASE WHEN p.dikembalikan_at IS NOT NULL THEN 'Dikembalikan'
       WHEN EXISTS (SELECT 1 FROM public.pengukuran_tertahan t WHERE t.pengukuran_id = p.id) THEN 'Menunggu persetujuan usulan titik/kVA'
       ELSE 'Terkirim' END,
  p.dikembalikan_alasan::text, p.petugas_nama::text, NULL, NULL,
  NULL, p.lokasi_lat::double precision, p.lokasi_lng::double precision
FROM public.pengukuran_gardu p
WHERE p.hasil_penyeimbangan_id IS NULL

UNION ALL
-- Tegangan Ujung
SELECT 'ujung', u.id::text, upper(u.ulp), u.tgl_ukur, u.jam_ukur, u.gardu_kode,
  concat_ws(' · ', 'Jurusan ' || u.jurusan, u.v_rn || '/' || u.v_sn || '/' || u.v_tn || ' V',
            CASE WHEN u.jarak_rekomendasi_m IS NOT NULL THEN round(u.jarak_rekomendasi_m) || ' m dari ujung terjauh' END),
  CASE u.status WHEN 'Terkirim' THEN 'Diterima' ELSE u.status END,
  u.status, u.alasan, u.petugas_nama, NULL, NULL, u.foto_url, u.lat, u.lng
FROM public.pengukuran_tegangan_ujung u

UNION ALL
-- Optimasi Trafo
SELECT 'optimasi', o.id::text, upper(o.ulp), o.tgl_operasi::date, NULL::time, o.kode_gardu,
  concat_ws(' · ', o.penyulang, o.kva_lama || ' → ' || o.kva_baru || ' kVA'),
  CASE WHEN o.dikembalikan_at IS NOT NULL THEN 'Dikembalikan'
       WHEN o.status = 'Selesai' THEN 'Menunggu verifikasi' WHEN o.status = 'Diverifikasi' THEN 'Diterima'
       WHEN o.status = 'Ditolak' THEN 'Dikembalikan' ELSE 'Dibatalkan' END,
  CASE WHEN o.dikembalikan_at IS NOT NULL THEN 'Dikembalikan' ELSE o.status END,
  o.dikembalikan_alasan, o.petugas_nama, NULL, NULL, o.foto_nameplate_baru_url,
  o.lat::double precision, o.lng::double precision
FROM public.optimasi_trafo o

UNION ALL
-- Perabasan WO: pohon per item WO per hari per tim (satu baris = satu hari kerja di satu segmen)
SELECT 'perabasan', r.item_id::text || '|' || r.tgl || '|' || COALESCE(r.petugas_nama, ''), upper(i.ulp),
  r.tgl, r.waktu, i.segmen_nama,
  concat_ws(' · ', i.penyulang, r.pohon || ' pohon'),
  CASE i.status WHEN 'Selesai' THEN 'Menunggu verifikasi' WHEN 'Diverifikasi' THEN 'Diterima'
    WHEN 'Ditolak' THEN 'Dikembalikan' WHEN 'Dibatalkan' THEN 'Dibatalkan' ELSE 'Sedang dikerjakan' END,
  i.status, i.verified_note, r.petugas_nama, NULL, i.panjang_km, r.foto, r.lat, r.lng
FROM (
  SELECT x.item_id, x.petugas_nama,
         (x.dikerjakan_at AT TIME ZONE 'Asia/Makassar')::date AS tgl,
         max((x.dikerjakan_at AT TIME ZONE 'Asia/Makassar')::time) AS waktu,
         count(*) AS pohon,
         (array_agg(x.foto_sesudah_url ORDER BY x.dikerjakan_at DESC))[1] AS foto,
         (array_agg(x.lat::double precision ORDER BY x.dikerjakan_at DESC))[1] AS lat,
         (array_agg(x.lng::double precision ORDER BY x.dikerjakan_at DESC))[1] AS lng
  FROM public.perabasan_realisasi x
  GROUP BY x.item_id, x.petugas_nama, (x.dikerjakan_at AT TIME ZONE 'Asia/Makassar')::date
) r
JOIN public.wo_perabasan_item i ON i.id = r.item_id

UNION ALL
-- Perabasan di luar WO
SELECT 'rabas_luar', l.id::text, upper(l.ulp), l.tgl, (l.created_at AT TIME ZONE 'Asia/Makassar')::time,
  concat_ws(' · ', l.penyulang, NULLIF(l.lokasi, '')),
  concat_ws(' · ', 'Di luar WO', l.jenis_pohon),
  CASE l.status WHEN 'Selesai' THEN 'Menunggu verifikasi' WHEN 'Diverifikasi' THEN 'Diterima'
    WHEN 'Dikembalikan' THEN 'Dikembalikan' ELSE 'Dibatalkan' END,
  l.status, l.verified_note, l.regu, NULL, NULL, l.foto_sesudah_url,
  l.lat::double precision, l.lng::double precision
FROM public.perabasan_luar_wo l

UNION ALL
-- Pemeliharaan Jaringan (Harjar)
SELECT 'harjar', j.id::text, upper(j.ulp), j.tgl::date, (j.created_at AT TIME ZONE 'Asia/Makassar')::time,
  concat_ws(' · ', j.jenis, j.penyulang),
  concat_ws(' · ', j.kategori, j.pekerjaan),
  CASE j.status WHEN 'Selesai' THEN 'Menunggu verifikasi' WHEN 'Diverifikasi' THEN 'Diterima'
    WHEN 'Dikembalikan' THEN 'Dikembalikan' ELSE 'Dibatalkan' END,
  j.status, j.dikembalikan_alasan, j.petugas_nama, NULL, NULL, j.foto_sesudah_url,
  j.lat::double precision, j.lng::double precision
FROM public.pemeliharaan_jaringan j

UNION ALL
-- Penyeimbangan Beban (tanpa tahap persetujuan)
SELECT 'penyeimbangan', s.id::text, upper(s.ulp),
  CASE WHEN s.tgl_penyeimbangan::text ~ '^\d{4}-\d{2}-\d{2}' THEN left(s.tgl_penyeimbangan::text, 10)::date
       ELSE (s.created_at AT TIME ZONE 'Asia/Makassar')::date END,
  (s.created_at AT TIME ZONE 'Asia/Makassar')::time, s.no_gardu,
  concat_ws(' · ', s.penyulang,
    CASE WHEN s.beban_pct_after IS NOT NULL
         THEN 'beban ' || round(s.beban_pct_before::numeric, 0) || '% → ' || round(s.beban_pct_after::numeric, 0) || '%' END),
  CASE s.status WHEN 'Dikerjakan' THEN 'Sedang dikerjakan' ELSE 'Diterima' END,
  s.status, NULL, s.petugas_penyeimbang, NULL, NULL, NULL, NULL, NULL
FROM public.penyeimbangan_gardu s

UNION ALL
-- Inspeksi JTM
SELECT 'jtm', m.id::text, upper(m.ulp),
  (COALESCE(m.tgl_selesai, m.tgl_mulai, m.created_at) AT TIME ZONE 'Asia/Makassar')::date,
  (COALESCE(m.tgl_selesai, m.tgl_mulai, m.created_at) AT TIME ZONE 'Asia/Makassar')::time,
  COALESCE(sg.nama, 'segmen'), concat_ws(' · ', m.penyulang, 'Tier ' || COALESCE(m.tier, '1')),
  CASE m.status WHEN 'Selesai' THEN 'Menunggu verifikasi' WHEN 'Diverifikasi' THEN 'Diterima'
    WHEN 'Ditolak' THEN 'Dikembalikan' WHEN 'Dibatalkan' THEN 'Dibatalkan' ELSE 'Sedang dikerjakan' END,
  m.status, m.verified_note, m.petugas_nama, NULL, COALESCE(kd.km, sp.panjang_pakai_km), NULL, NULL, NULL
FROM public.inspeksi_jtm m
LEFT JOIN public.segmen sg ON sg.id = m.segmen_id
LEFT JOIN public.segmen_panjang sp ON sp.segmen_id = m.segmen_id
LEFT JOIN public.inspeksi_jtm_km kd ON kd.inspeksi_id = m.id   -- ★ km dibekukan saat disetujui

UNION ALL
-- Inspeksi JTR
SELECT 'jtr', r.id::text, upper(r.ulp),
  COALESCE(r.tgl_selesai, r.tgl_mulai, (r.created_at AT TIME ZONE 'Asia/Makassar')::date),
  (COALESCE(r.updated_at, r.created_at) AT TIME ZONE 'Asia/Makassar')::time,
  upper(r.gardu_kode), r.penyulang,
  CASE r.status WHEN 'Selesai' THEN 'Menunggu verifikasi' WHEN 'Diverifikasi' THEN 'Diterima'
    WHEN 'Ditolak' THEN 'Dikembalikan' WHEN 'Dibatalkan' THEN 'Dibatalkan' ELSE 'Sedang dikerjakan' END,
  r.status, r.verified_note, r.inspektor_nama, r.petugas_2, NULL, NULL, NULL, NULL
FROM public.inspeksi_jtr r

UNION ALL
-- Laporan Temuan (penemu). Temuan yang lahir dari inspeksi JTM/JTR sudah
-- terwakili cabang JTM/JTR — tidak diulang di sini.
SELECT 'laporan', i.id::text, upper(i.ulp),
  CASE WHEN i.tgl_inspeksi::text ~ '^\d{4}-\d{2}-\d{2}' THEN left(i.tgl_inspeksi::text, 10)::date
       ELSE (i.created_at AT TIME ZONE 'Asia/Makassar')::date END,
  (i.created_at AT TIME ZONE 'Asia/Makassar')::time,
  concat_ws(' · ', NULLIF(i.temuan, ''), NULLIF(i.lokasi, '')),
  concat_ws(' · ', i.penyulang,
    CASE i.status WHEN 'Selesai' THEN 'Selesai ditindaklanjuti' || COALESCE(' ' || NULLIF(i.eksekutor, ''), '')
      WHEN 'Batal' THEN 'Dibatalkan'
      WHEN 'Ditugaskan' THEN 'Ditugaskan ke ' || COALESCE(NULLIF(i.eksekutor, ''), '-')
      WHEN 'Dalam Proses' THEN 'Dikerjakan ' || COALESCE(NULLIF(i.eksekutor, ''), '-')
      ELSE 'Belum ditindaklanjuti' END),
  CASE i.status WHEN 'Selesai' THEN 'Diterima' WHEN 'Batal' THEN 'Dibatalkan'
    WHEN 'Ditugaskan' THEN 'Sedang dikerjakan' WHEN 'Dalam Proses' THEN 'Sedang dikerjakan'
    ELSE 'Menunggu verifikasi' END,
  i.status, NULL, COALESCE(NULLIF(i.nama_inspektor, ''), i.inspektor), NULL, NULL,
  COALESCE(i.foto_sebelum_url, i.image_url),
  CASE WHEN kb.k ~ '^-?\d+(\.\d+)?,-?\d+(\.\d+)?$' THEN split_part(kb.k, ',', 1)::double precision END,
  CASE WHEN kb.k ~ '^-?\d+(\.\d+)?,-?\d+(\.\d+)?$' THEN split_part(kb.k, ',', 2)::double precision END
FROM public.inspeksi i
CROSS JOIN LATERAL (SELECT regexp_replace(COALESCE(i.koordinat, ''), '[\s+]', '', 'g') AS k) kb
WHERE i.sumber_tiang_id IS NULL

UNION ALL
SELECT 'laporan', 'pohon|' || i.id::text, upper(i.ulp),
  CASE WHEN i.tgl_inspeksi::text ~ '^\d{4}-\d{2}-\d{2}' THEN left(i.tgl_inspeksi::text, 10)::date
       ELSE (i.created_at AT TIME ZONE 'Asia/Makassar')::date END,
  (i.created_at AT TIME ZONE 'Asia/Makassar')::time,
  concat_ws(' · ', 'Pohon' || COALESCE(' ' || NULLIF(i.jenis_pohon, ''), ''), NULLIF(i.lokasi, '')),
  concat_ws(' · ', i.penyulang,
    CASE i.status WHEN 'Selesai' THEN 'Selesai ditindaklanjuti' || COALESCE(' ' || NULLIF(i.eksekutor, ''), '')
      WHEN 'Ditugaskan' THEN 'Ditugaskan ke ' || COALESCE(NULLIF(i.eksekutor, ''), '-')
      WHEN 'Dalam Proses' THEN 'Dikerjakan ' || COALESCE(NULLIF(i.eksekutor, ''), '-')
      WHEN 'Proses' THEN 'Dikerjakan ' || COALESCE(NULLIF(i.eksekutor, ''), '-')
      ELSE 'Belum ditindaklanjuti' END),
  CASE i.status WHEN 'Selesai' THEN 'Diterima' WHEN 'Batal' THEN 'Dibatalkan'
    WHEN 'Ditugaskan' THEN 'Sedang dikerjakan' WHEN 'Dalam Proses' THEN 'Sedang dikerjakan'
    WHEN 'Proses' THEN 'Sedang dikerjakan' ELSE 'Menunggu verifikasi' END,
  i.status, NULL, COALESCE(NULLIF(i.nama_inspektor, ''), i.inspektor), NULL, NULL, i.foto_sebelum_url,
  CASE WHEN kb.k ~ '^-?\d+(\.\d+)?,-?\d+(\.\d+)?$' THEN split_part(kb.k, ',', 1)::double precision END,
  CASE WHEN kb.k ~ '^-?\d+(\.\d+)?,-?\d+(\.\d+)?$' THEN split_part(kb.k, ',', 2)::double precision END
FROM public.inspeksi_pohon i
CROSS JOIN LATERAL (SELECT regexp_replace(COALESCE(i.koordinat, ''), '[\s+]', '', 'g') AS k) kb
-- ★ Tugas pohon yang lahir dari temuan JTM sudah terwakili cabang JTM.
WHERE i.sumber_tiang_id IS NULL

UNION ALL
-- Tugas Temuan (eksekutor): hanya yang DITUGASKAN (`assigned_at`). Temuan
-- yang ditemukan lalu langsung dikerjakan tim yang sama cukup sekali, sebagai
-- laporan. Tugas yang dikerjakan lewat Pemeliharaan Jaringan sudah terwakili
-- cabang Harjar.
SELECT 'tugas', i.id::text, upper(i.ulp),
  COALESCE(
    CASE WHEN i.tgl_eksekusi::text ~ '^\d{4}-\d{2}-\d{2}' THEN left(i.tgl_eksekusi::text, 10)::date END,
    (i.assigned_at AT TIME ZONE 'Asia/Makassar')::date),
  (COALESCE(i.updated_at, i.assigned_at) AT TIME ZONE 'Asia/Makassar')::time,
  concat_ws(' · ', NULLIF(i.temuan, ''), NULLIF(i.lokasi, '')),
  concat_ws(' · ', i.penyulang, 'Temuan ' || COALESCE(NULLIF(i.nama_inspektor, ''), i.inspektor, '-')),
  CASE i.status WHEN 'Selesai' THEN 'Diterima' WHEN 'Batal' THEN 'Dibatalkan' ELSE 'Sedang dikerjakan' END,
  i.status, NULL, i.team_name, NULL, NULL, COALESCE(i.foto_sesudah_url, i.foto_sebelum_url),
  CASE WHEN kb.k ~ '^-?\d+(\.\d+)?,-?\d+(\.\d+)?$' THEN split_part(kb.k, ',', 1)::double precision END,
  CASE WHEN kb.k ~ '^-?\d+(\.\d+)?,-?\d+(\.\d+)?$' THEN split_part(kb.k, ',', 2)::double precision END
FROM public.inspeksi i
CROSS JOIN LATERAL (SELECT regexp_replace(COALESCE(i.koordinat, ''), '[\s+]', '', 'g') AS k) kb
WHERE i.assigned_at IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM public.pemeliharaan_jaringan pj WHERE pj.inspeksi_id::text = i.id::text)

UNION ALL
SELECT 'tugas', 'pohon|' || i.id::text, upper(i.ulp),
  COALESCE(
    CASE WHEN i.tgl_eksekusi::text ~ '^\d{4}-\d{2}-\d{2}' THEN left(i.tgl_eksekusi::text, 10)::date END,
    (i.assigned_at AT TIME ZONE 'Asia/Makassar')::date),
  (COALESCE(i.updated_at, i.assigned_at) AT TIME ZONE 'Asia/Makassar')::time,
  concat_ws(' · ', 'Pohon' || COALESCE(' ' || NULLIF(i.jenis_pohon, ''), ''), NULLIF(i.lokasi, '')),
  concat_ws(' · ', i.penyulang, 'Temuan ' || COALESCE(NULLIF(i.nama_inspektor, ''), i.inspektor, '-')),
  CASE i.status WHEN 'Selesai' THEN 'Diterima' WHEN 'Batal' THEN 'Dibatalkan' ELSE 'Sedang dikerjakan' END,
  i.status, NULL, i.team_name, NULL, NULL, COALESCE(i.foto_sesudah_url, i.foto_sebelum_url),
  CASE WHEN kb.k ~ '^-?\d+(\.\d+)?,-?\d+(\.\d+)?$' THEN split_part(kb.k, ',', 1)::double precision END,
  CASE WHEN kb.k ~ '^-?\d+(\.\d+)?,-?\d+(\.\d+)?$' THEN split_part(kb.k, ',', 2)::double precision END
FROM public.inspeksi_pohon i
CROSS JOIN LATERAL (SELECT regexp_replace(COALESCE(i.koordinat, ''), '[\s+]', '', 'g') AS k) kb
WHERE i.assigned_at IS NOT NULL

UNION ALL
-- ★★ Inspeksi Gardu (G4) — jenis 'igardu' ditunggu HP (riwayatService, RincianRiwayat)
SELECT 'igardu', x.id::text, upper(x.ulp),
  (x.tgl AT TIME ZONE 'Asia/Makassar')::date, (x.tgl AT TIME ZONE 'Asia/Makassar')::time,
  x.gardu_kode,
  concat_ws(' · ', 'Tier ' || x.tier, x.penyulang,
    CASE WHEN x.ada_temuan
         THEN (SELECT count(*) FROM public.inspeksi_gardu_temuan t WHERE t.inspeksi_id = x.id) || ' temuan'
         ELSE 'tanpa temuan' END),
  CASE x.status WHEN 'Selesai' THEN 'Menunggu verifikasi' WHEN 'Diverifikasi' THEN 'Diterima'
    WHEN 'Dikembalikan' THEN 'Dikembalikan' ELSE 'Dibatalkan' END,
  x.status, COALESCE(x.dikembalikan_alasan, x.batal_alasan), x.petugas_nama, NULL, NULL,
  x.foto_gardu_url, x.lat, x.lng
FROM public.inspeksi_gardu x;

COMMENT ON VIEW public.riwayat_pekerjaan IS
  'Riwayat pekerjaan lintas modul, kolom & status seragam (rencana-mobile-kerja-lapangan.md §10). Dibaca HP lewat riwayat_pekerjaan_saya.';
GRANT SELECT ON public.riwayat_pekerjaan TO authenticated;


-- ── 4. Foto Riwayat HP ───────────────────────────────────────────────────────
-- Disalin UTUH dari riwayat-petugas-foto.sql; ★★ = cabang 'igardu'.
CREATE OR REPLACE FUNCTION public.foto_riwayat(p_jenis TEXT, p_sumber_id TEXT)
RETURNS TABLE (label TEXT, url TEXT)
LANGUAGE plpgsql STABLE SET search_path = public AS $$
DECLARE
  -- Baris pohon membawa awalan "pohon|" (view riwayat_pekerjaan).
  v_pohon BOOLEAN := p_sumber_id LIKE 'pohon|%';
  v_id    TEXT := CASE WHEN p_sumber_id LIKE 'pohon|%' THEN substr(p_sumber_id, 7) ELSE p_sumber_id END;
BEGIN
  IF p_jenis IN ('laporan', 'tugas') AND v_pohon THEN
    RETURN QUERY SELECT f.* FROM public.inspeksi_pohon i, LATERAL public._foto_dari_baris(to_jsonb(i)) f
      WHERE i.id::text = v_id;
  ELSIF p_jenis IN ('laporan', 'tugas') THEN
    RETURN QUERY SELECT f.* FROM public.inspeksi i, LATERAL public._foto_dari_baris(to_jsonb(i)) f
      WHERE i.id::text = v_id;
  ELSIF p_jenis = 'harjar' THEN
    RETURN QUERY SELECT f.* FROM public.pemeliharaan_jaringan x, LATERAL public._foto_dari_baris(to_jsonb(x)) f
      WHERE x.id::text = v_id;
  ELSIF p_jenis = 'rabas_luar' THEN
    RETURN QUERY SELECT f.* FROM public.perabasan_luar_wo x, LATERAL public._foto_dari_baris(to_jsonb(x)) f
      WHERE x.id::text = v_id;
  ELSIF p_jenis = 'optimasi' THEN
    RETURN QUERY SELECT f.* FROM public.optimasi_trafo x, LATERAL public._foto_dari_baris(to_jsonb(x)) f
      WHERE x.id::text = v_id;
  ELSIF p_jenis = 'ujung' THEN
    RETURN QUERY SELECT 'Alat ukur'::text, f.url FROM public.pengukuran_tegangan_ujung x,
      LATERAL public._foto_dari_baris(to_jsonb(x)) f WHERE x.id::text = v_id;
  ELSIF p_jenis = 'pengukuran' THEN
    RETURN QUERY SELECT f.* FROM public.pengukuran_gardu x, LATERAL public._foto_dari_baris(to_jsonb(x)) f
      WHERE x.id::text = v_id;
  ELSIF p_jenis = 'penyeimbangan' THEN
    RETURN QUERY SELECT f.* FROM public.penyeimbangan_gardu x, LATERAL public._foto_dari_baris(to_jsonb(x)) f
      WHERE x.id::text = v_id;
  ELSIF p_jenis = 'hargardu' THEN
    RETURN QUERY SELECT COALESCE(NULLIF(x.slot, ''), 'Foto')::text, x.url::text
      FROM public.pemeliharaan_gardu_foto x
      WHERE x.pemeliharaan_id::text = v_id AND x.url LIKE 'http%'
      ORDER BY x.diambil_at LIMIT 40;
  ELSIF p_jenis = 'perabasan' THEN
    -- sumber_id = item_id | tanggal WITA | petugas (satu hari kerja satu tim)
    RETURN QUERY
      SELECT ('Pohon ' || p.n || ' · ' || f.label)::text, f.url
      FROM (
        SELECT x.*, row_number() OVER (ORDER BY x.dikerjakan_at) AS n
        FROM public.perabasan_realisasi x
        WHERE x.item_id::text = split_part(p_sumber_id, '|', 1)
          AND (x.dikerjakan_at AT TIME ZONE 'Asia/Makassar')::date::text = split_part(p_sumber_id, '|', 2)
          AND COALESCE(x.petugas_nama, '') = split_part(p_sumber_id, '|', 3)
      ) p, LATERAL public._foto_dari_baris(to_jsonb(p) - 'n') f
      LIMIT 40;
  ELSIF p_jenis = 'jtm' THEN
    RETURN QUERY
      SELECT ('Tiang ' || COALESCE(tg.kode, '?') || CASE WHEN f.kode <> 'tiang' THEN ' · ' || f.kode ELSE '' END)::text, f.url::text
      FROM public.inspeksi_jtm_titik t
      JOIN public.inspeksi_jtm_foto f ON f.titik_id = t.id
      LEFT JOIN public.tiang tg ON tg.id = t.tiang_id
      WHERE t.inspeksi_id::text = v_id AND f.url LIKE 'http%'
      ORDER BY t.dinilai_at, f.created_at
      LIMIT 40;
  ELSIF p_jenis = 'jtr' THEN
    RETURN QUERY
      SELECT ('Tiang ' || COALESCE(tg.kode, '?'))::text, u.url::text
      FROM public.inspeksi_jtr_titik t
      CROSS JOIN LATERAL unnest(t.foto_url) AS u(url)
      LEFT JOIN public.tiang tg ON tg.id = t.tiang_id
      WHERE t.inspeksi_id::text = v_id AND u.url LIKE 'http%'
      ORDER BY t.created_at
      LIMIT 40;
  ELSIF p_jenis = 'igardu' THEN
    -- ★★ Inspeksi Gardu: foto gardu (bila tanpa temuan) + foto tiap temuan.
    RETURN QUERY
      SELECT 'Foto gardu'::text, x.foto_gardu_url::text
      FROM public.inspeksi_gardu x
      WHERE x.id::text = v_id AND x.foto_gardu_url LIKE 'http%'
      UNION ALL
      SELECT * FROM (
        SELECT ('Temuan ' || t.urutan || ' · ' || r.label)::text, u.url::text
        FROM public.inspeksi_gardu_temuan t
        JOIN public.igardu_ref r ON r.kode = t.kategori
        CROSS JOIN LATERAL unnest(t.foto_url) WITH ORDINALITY AS u(url, n)
        WHERE t.inspeksi_id::text = v_id AND u.url LIKE 'http%'
        ORDER BY t.urutan, u.n
        LIMIT 40) f;
  END IF;
END $$;
GRANT EXECUTE ON FUNCTION public.foto_riwayat(TEXT, TEXT) TO authenticated;

-- ── Periksa ──────────────────────────────────────────────────────────────────
--   SELECT * FROM rekap_kinerja('AMPENAN', 2026, 10) WHERE kunci LIKE 'igardu%';
--   SELECT * FROM realisasi_rentang('AMPENAN', '2026-10-01', '2026-10-31') WHERE kunci LIKE 'igardu%';
--   SELECT jenis, count(*) FROM riwayat_pekerjaan WHERE jenis = 'igardu' GROUP BY 1;
