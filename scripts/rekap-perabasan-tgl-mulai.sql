-- =============================================================================
-- Realisasi perabasan dihitung di bulan MULAI dirabas (3 Nov 2026).
-- Jalankan manual di Supabase SQL Editor, SESUDAH rekap-perabasan-wo-segmen.sql.
-- Idempoten.
--
-- Keputusan user 3 Nov: segmen yang dikerjakan 30 Okt – 2 Nov masuk realisasi
-- OKTOBER, mengikuti tanggal mulai kerja (dulu: tanggal selesai → November).
-- Berlaku untuk semua segmen perabasan WO. 8 segmen berpindah bulan saat ini,
-- termasuk GH GOMONG - LBS MTRZD PENGADILAN (Ampenan, mulai 30 Sep, selesai
-- 26 Okt) yang pindah dari Oktober ke SEPTEMBER.
--
-- Isi (dua-duanya salinan utuh definisi terakhir, yang berubah hanya ★):
--   1. _rekap_kinerja_inti   (dari rekap-perabasan-wo-segmen.sql)
--      ⚠ Definisi terbaru _rekap_kinerja_inti kini di SINI.
--   2. realisasi_rentang     (dari inspeksi-gardu-rekap.sql) — Realisasi
--      Harian, Realisasi Bulanan, PRO NTB, lampiran tagihan.
--      ⚠ Definisi terbaru realisasi_rentang kini di SINI.
-- Perabasan di luar WO tidak berubah (satu tanggal kerja, `tgl`).
-- =============================================================================

-- ── 1. Rekap kinerja ─────────────────────────────────────────────────────────
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

  -- ★★★★ Realisasi & Belum disetujui dari WO bulan mana pun (tunggakan ikut).
  --      WO terbit tetap bulan WO.
  -- ★★★★★★ Bulan realisasi = bulan MULAI DIRABAS (tgl_mulai), bukan bulan
  --      selesai (keputusan user 3 Nov 2026: segmen dikerjakan 30 Okt – 2 Nov
  --      masuk Oktober).
  -- ★★★★★ WO terbit = TOTAL PANJANG SEGMEN di WO (tanpa segmen dibatalkan),
  --      bukan target yang diketik saat terbit (keputusan user 3 Nov 2026:
  --      WO RABAS NOVEMBER Ampenan target 150, segmennya 133,02 km).
  RETURN QUERY
  SELECT 'perabasan'::text,
    (SELECT round(COALESCE(sum(i.panjang_km), 0), 3)
       FROM public.wo_perabasan_item i JOIN public.wo_perabasan w ON w.id = i.wo_id
      WHERE i.status <> 'Dibatalkan'
        AND w.tgl_wo::date >= d_awal AND w.tgl_wo::date < d_akhr
        AND w.status <> 'Dibatalkan'
        AND (u IS NULL OR upper(w.ulp) = u)),
    (SELECT round(COALESCE(sum(i.panjang_km), 0), 3)
       FROM public.wo_perabasan_item i JOIN public.wo_perabasan w ON w.id = i.wo_id
      WHERE i.status = 'Diverifikasi'
        AND COALESCE(i.tgl_mulai, i.tgl_selesai) >= d_awal AND COALESCE(i.tgl_mulai, i.tgl_selesai) < d_akhr
        AND w.status <> 'Dibatalkan'
        AND (u IS NULL OR upper(w.ulp) = u)),
    (SELECT round(COALESCE(sum(i.panjang_km), 0), 3)
       FROM public.wo_perabasan_item i JOIN public.wo_perabasan w ON w.id = i.wo_id
      WHERE i.status = 'Selesai'
        AND COALESCE(i.tgl_mulai, i.tgl_selesai) >= d_awal AND COALESCE(i.tgl_mulai, i.tgl_selesai) < d_akhr
        AND w.status <> 'Dibatalkan'
        AND (u IS NULL OR upper(w.ulp) = u)),
    (SELECT count(*)::numeric FROM public.perabasan_luar_wo l
      WHERE l.status IN ('Selesai', 'Diverifikasi')
        AND l.tgl >= d_awal AND l.tgl < d_akhr
        AND (u IS NULL OR upper(l.ulp_regu) = u));

  RETURN QUERY
  SELECT 'harjtm'::text, public._wo_manual_total(u, p_tahun, p_bulan, 'harjtm', false, false),
    count(*)::numeric, count(*) FILTER (WHERE j.status = 'Selesai')::numeric,
    count(*) FILTER (WHERE j.inspeksi_id IS NOT NULL)::numeric
  FROM public.pemeliharaan_jaringan j
  WHERE j.status NOT IN ('Dibatalkan', 'Dikembalikan')
    AND j.tgl::date >= d_awal AND j.tgl::date < d_akhr
    AND (u IS NULL OR upper(j.ulp) = u);

  -- ★★★★ Realisasi = pemeliharaan WO yang dikerjakan di bulan ini: gardu WO
  --      bulan ini + tunggakan WO bulan lalu yang selesai susulan bulan ini.
  --      Satu pemeliharaan dihitung sekali (gardu di dua WO).
  SELECT count(DISTINCT x.id) INTO jadi FROM (
    SELECT r.pemeliharaan_id AS id FROM public.wo_hargardu_realisasi r
     WHERE r.terealisasi AND r.tahun = p_tahun AND (p_bulan = 0 OR r.bulan = p_bulan)
       AND (u IS NULL OR upper(r.ulp) = u)
    UNION ALL
    SELECT r.susulan_id FROM public.wo_hargardu_realisasi r
     WHERE r.susulan_terealisasi
       AND r.tgl_susulan >= t_awal AND r.tgl_susulan < t_akhr
       AND (u IS NULL OR upper(r.ulp) = u)) x;

  RETURN QUERY
  SELECT 'hargardu'::text,
    (SELECT count(*)::numeric FROM public.wo_hargardu_realisasi r
      WHERE r.tahun = p_tahun AND (p_bulan = 0 OR r.bulan = p_bulan) AND (u IS NULL OR upper(r.ulp) = u)),
    jadi,
    (SELECT count(DISTINCT x.id)::numeric FROM (
       SELECT r.pemeliharaan_id AS id FROM public.wo_hargardu_realisasi r
        WHERE r.terealisasi AND NOT r.disetujui AND r.tahun = p_tahun AND (p_bulan = 0 OR r.bulan = p_bulan)
          AND (u IS NULL OR upper(r.ulp) = u)
       UNION ALL
       SELECT r.susulan_id FROM public.wo_hargardu_realisasi r
        WHERE r.susulan_terealisasi AND NOT r.susulan_disetujui
          AND r.tgl_susulan >= t_awal AND r.tgl_susulan < t_akhr
          AND (u IS NULL OR upper(r.ulp) = u)) x),
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
  -- ★★★★ Realisasi & Belum disetujui = gardu WO bulan ini + tunggakan WO bulan
  --      lalu yang diukur susulan bulan ini. Satu pengukuran dihitung sekali.
  RETURN QUERY
  WITH r AS (
    SELECT * FROM public.wo_pengukuran_realisasi r
    WHERE r.tgl_wo < d_akhr AND (u IS NULL OR upper(r.ulp) = u)
  ), kerja AS (
    SELECT r.pengukuran_id AS id, r.terealisasi AS sah,
           r.tertahan OR (r.menunggu_tegangan_ujung AND EXISTS (
             SELECT 1 FROM public.pengukuran_tegangan_ujung x
             WHERE x.pengukuran_id = r.pengukuran_id AND x.status = 'Terkirim')) AS tahan
    FROM r WHERE r.pengukuran_id IS NOT NULL AND r.tahun = p_tahun AND (p_bulan = 0 OR r.bulan = p_bulan)
    UNION
    SELECT r.susulan_id, r.susulan_terealisasi,
           r.susulan_tertahan OR (r.susulan_menunggu_tu AND EXISTS (
             SELECT 1 FROM public.pengukuran_tegangan_ujung x
             WHERE x.pengukuran_id = r.susulan_id AND x.status = 'Terkirim'))
    FROM r WHERE r.susulan_id IS NOT NULL
      AND r.tgl_susulan >= to_char(d_awal, 'YYYY-MM-DD') AND r.tgl_susulan < to_char(d_akhr, 'YYYY-MM-DD')
  )
  SELECT 'pengukuran'::text,
    (SELECT count(*) FROM r WHERE r.tahun = p_tahun AND (p_bulan = 0 OR r.bulan = p_bulan))::numeric,
    (SELECT count(DISTINCT k.id) FILTER (WHERE k.sah) FROM kerja k)::numeric,
    (SELECT count(DISTINCT k.id) FILTER (WHERE k.tahan) FROM kerja k)::numeric,
    NULL::numeric;

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
  -- ★★★★ Realisasi & Belum disetujui = bulan KUNJUNGAN yang terkirim, dari WO
  --      bulan mana pun (tunggakan ikut). WO terbit tetap bulan WO.
  RETURN QUERY
  WITH wo_app AS (
    SELECT i.id, i.tier, w.tgl_wo
    FROM public.wo_igardu_item i
    JOIN public.wo_igardu w ON w.id = i.wo_id
    WHERE i.status <> 'Dibatalkan' AND w.status <> 'Dibatalkan'
      AND w.tgl_wo < d_akhr
      AND (u IS NULL OR upper(w.ulp) = u)
      AND NOT EXISTS (SELECT 1 FROM public.wo_manual m
                       WHERE m.jenis = 'igardu' || i.tier
                         AND m.tahun = extract(year FROM w.tgl_wo)::int
                         AND m.bulan = extract(month FROM w.tgl_wo)::int
                         AND m.ulp = upper(w.ulp))
  ), item AS (
    SELECT a.tier FROM wo_app a WHERE a.tgl_wo >= d_awal
  ), kirim AS (
    SELECT a.tier,
           EXISTS (SELECT 1 FROM public.inspeksi_gardu g
                    WHERE g.wo_item_id = a.id AND g.status = 'Diverifikasi') AS disetujui
    FROM wo_app a
    JOIN LATERAL (
      SELECT g.tgl FROM public.inspeksi_gardu g
      WHERE g.wo_item_id = a.id AND g.status IN ('Selesai', 'Diverifikasi')
        AND NOT EXISTS (SELECT 1 FROM public.master_usulan mu
                         WHERE mu.sumber_modul = 'inspeksi_gardu' AND mu.sumber_id = g.id
                           AND mu.status = 'menunggu')
      ORDER BY g.tgl LIMIT 1
    ) g ON true
    WHERE g.tgl >= t_awal AND g.tgl < t_akhr
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
    COALESCE(tm.jadi, 0) + (SELECT count(*) FROM kirim WHERE kirim.tier = t.tier),
    (SELECT count(*) FILTER (WHERE NOT kirim.disetujui) FROM kirim WHERE kirim.tier = t.tier)::numeric,
    COALESCE((SELECT luar.n FROM luar WHERE luar.tier = t.tier), 0)
  FROM (VALUES ('1'), ('2')) t(tier)
  CROSS JOIN LATERAL (
    SELECT public._wo_manual_total(u, p_tahun, p_bulan, 'igardu' || t.tier, false, false) AS wo,
           public._wo_manual_total(u, p_tahun, p_bulan, 'igardu' || t.tier, false, true)  AS jadi
  ) tm;
END $$;


-- ── 2. Realisasi harian / bulanan / lampiran ─────────────────────────────────
CREATE OR REPLACE FUNCTION public.realisasi_rentang(p_ulp TEXT, p_dari DATE, p_sampai DATE)
RETURNS TABLE (tgl DATE, kunci TEXT, bagian TEXT, ulp TEXT, objek TEXT, rincian TEXT, petugas TEXT,
               waktu TIME, km NUMERIC, disetujui BOOLEAN, sumber TEXT, sumber_id TEXT)
LANGUAGE sql STABLE SET search_path = public AS $fn$
WITH u AS (SELECT NULLIF(NULLIF(upper(btrim(COALESCE(p_ulp, ''))), ''), 'SEMUA') AS v),
semua AS (
  -- Perabasan (WO): dicatat di tanggal MULAI dirabas (★ 3 Nov 2026), sama
  -- dengan Rekap Kinerja — segmen 30 Okt – 2 Nov masuk Oktober.
  SELECT COALESCE(i.tgl_mulai, i.tgl_selesai) AS tgl, 'perabasan'::text AS kunci, NULL::text AS bagian, upper(w.ulp) AS ulp,
    i.segmen_nama::text AS objek,
    concat_ws(' · ', i.penyulang,
      (SELECT count(*) FROM public.perabasan_realisasi r WHERE r.item_id = i.id) || ' pohon')::text AS rincian,
    COALESCE(i.regu, i.pelaksana)::text AS petugas, NULL::time AS waktu,
    i.panjang_km::numeric AS km, (i.status = 'Diverifikasi') AS disetujui, 'wo_perabasan_item'::text AS sumber, i.id::text AS sumber_id
  FROM public.wo_perabasan_item i JOIN public.wo_perabasan w ON w.id = i.wo_id
  WHERE COALESCE(i.tgl_mulai, i.tgl_selesai) BETWEEN p_dari AND p_sampai
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


-- ── Periksa ──────────────────────────────────────────────────────────────────
--   SELECT kunci, realisasi, belum_disetujui FROM rekap_kinerja('AMPENAN', 2026, 10) WHERE kunci = 'perabasan';
--   SELECT kunci, realisasi, belum_disetujui FROM rekap_kinerja('AMPENAN', 2026, 11) WHERE kunci = 'perabasan';
--   -- RECLOSER GELANGGANG - UJUNG (5,1 km) kini di Oktober, November 0.
