-- =============================================================================
-- WO Pemerataan Beban: tunggakan ikut WO terbit + bulan WO efektif (4 Nov 2026).
-- Jalankan manual di Supabase SQL Editor, SESUDAH rekap-pengukuran-semua.sql.
-- Idempoten.
--
-- Keputusan user 4 Nov (sama dengan WO Pengukuran, 3 Nov):
--   • WO terbit bulan ini = WO bulan ini + tunggakan bulan lalu yang belum
--     dikerjakan dan tidak di-WO lagi. Ampenan November: 11 + 8 = 19.
--   • HP memberi keterangan "WO Oktober belum dikerjakan".
-- Temuan 4 Nov: Tanjung November WO 5 tapi HP hanya 3 — BY029 & BY074 ada di
-- tempelan Oktober DAN WO anomali November, padahal sudah dikerjakan Oktober.
-- Aturan: WO yang dikerjakan sebelum bulan WO-nya dihitung di bulan dikerjakan.
--
-- Isi:
--   1. v_wo_pemerataan_terbuka + kolom wo_bulan (akhir) untuk keterangan HP.
--      ⚠ Definisi terbaru view kini di SINI.
--   2. rekap_pemerataan_rincian — WO bulan ini & tunggakan (web: rincian).
--   3. _rekap_kinerja_inti (salinan utuh rekap-pengukuran-semua.sql, ★★★★★★★★★).
--      ⚠ Definisi terbaru _rekap_kinerja_inti kini di SINI.
-- =============================================================================

-- ── 1. Daftar WO terbuka (HP) ───────────────────────────────────────────────
CREATE OR REPLACE VIEW public.v_wo_pemerataan_terbuka
WITH (security_invoker = true) AS
SELECT
  pg.id                       AS pengukuran_id,
  pg.no_gardu,
  pg.alamat,
  pg.penyulang,
  pg.petugas_unit             AS ulp,
  pg.kva_trafo,
  pg.tanggal_pengukuran,
  pg.wo_sent_at,

  -- Kondisi SEBELUM: inilah yang harus diratakan petugas di lapangan
  pg.persen_beban,
  pg.beban_kva,
  pg.suhu_trafo,
  pg.total_arus_r,
  pg.total_arus_s,
  pg.total_arus_t,
  pg.total_arus_n,
  pg.total_teg_rn,
  pg.total_teg_sn,
  pg.total_teg_tn,
  pg.perjurusan,

  -- Status klaim (NULL = belum ada yang mengambil)
  ps.id                       AS penyeimbangan_id,
  ps.status                   AS status_penyeimbangan,
  ps.petugas_uid,
  ps.petugas_penyeimbang,
  ps.diklaim_at,

  -- ★ Bulan WO (wo-pemerataan-tunggakan.sql) — HP memberi keterangan
  --   "WO Oktober belum dikerjakan" untuk tunggakan. Kolom baru di AKHIR.
  pg.wo_bulan

FROM public.pengukuran_gardu pg

-- LATERAL + LIMIT 1, bukan LEFT JOIN biasa: di data nyata sudah ada 1 pengukuran
-- yang punya DUA baris penyeimbangan. LEFT JOIN biasa akan menggandakan WO itu
-- di daftar petugas. Diambil yang terbaru; tidak dipasang UNIQUE constraint
-- karena mengerjakan ulang satu gardu bukan hal terlarang.
LEFT JOIN LATERAL (
  SELECT p.id, p.status, p.petugas_uid, p.petugas_penyeimbang, p.diklaim_at
  FROM public.penyeimbangan_gardu p
  WHERE p.pengukuran_id = pg.id
  ORDER BY p.created_at DESC
  LIMIT 1
) ps ON true

WHERE pg.jenis_pemeliharaan = 'PEMERATAAN BEBAN'
  -- Baris hasil penyeimbangan tidak boleh ditawarkan balik sebagai WO baru.
  AND pg.hasil_penyeimbangan_id IS NULL
  AND (ps.id IS NULL OR ps.status = 'Dikerjakan');

GRANT SELECT ON public.v_wo_pemerataan_terbuka TO authenticated;


-- ── 2. Hitungan WO Pemerataan ───────────────────────────────────────────────
-- Bulan WO EFEKTIF = bulan WO, kecuali sudah dikerjakan SEBELUM bulan WO-nya →
-- bulan dikerjakan (Tanjung BY029/BY074: tempelan Oktober, dikerjakan Oktober,
-- tapi WO anomali-nya November). Gardu di tempelan bulan yang sama dihitung sekali.
--   wo_bulan_ini = gardu WO anomali dengan bulan efektif = bulan ini
--   wo_tunggakan = gardu WO anomali bulan lalu yang belum dikerjakan per awal
--                  bulan ini dan tidak di-WO lagi bulan ini (anomali/tempelan)
-- Setahun (p_bulan = 0): tanpa tunggakan.
CREATE OR REPLACE FUNCTION public.rekap_pemerataan_rincian(p_ulp TEXT, p_tahun INT, p_bulan INT)
RETURNS TABLE (wo_bulan_ini INT, wo_tunggakan INT)
LANGUAGE sql STABLE SET search_path = public AS $fn$
  WITH u AS (SELECT NULLIF(NULLIF(upper(btrim(COALESCE(p_ulp, ''))), ''), 'SEMUA') AS v),
  rentang AS (
    SELECT make_date(p_tahun, CASE WHEN p_bulan = 0 THEN 1 ELSE p_bulan END, 1) AS awal,
           CASE WHEN p_bulan = 0 THEN make_date(p_tahun + 1, 1, 1)
                ELSE (make_date(p_tahun, p_bulan, 1) + INTERVAL '1 month')::date END AS akhir
  ),
  wo AS MATERIALIZED (
    SELECT upper(pg.petugas_unit) AS ulp, upper(btrim(pg.no_gardu)) AS kode, pg.wo_bulan, d.tgl AS dikerjakan,
           CASE WHEN d.tgl < pg.wo_bulan THEN date_trunc('month', d.tgl)::date ELSE pg.wo_bulan END AS efektif
    FROM public.pengukuran_gardu pg
    LEFT JOIN LATERAL (
      SELECT min(left(p.tgl_penyeimbangan::text, 10)::date) AS tgl
      FROM public.penyeimbangan_gardu p
      WHERE p.pengukuran_id = pg.id AND p.status = 'Selesai'
        AND p.tgl_penyeimbangan::text ~ '^\d{4}-\d{2}-\d{2}'
    ) d ON true, u
    WHERE pg.jenis_pemeliharaan = 'PEMERATAAN BEBAN'
      AND pg.hasil_penyeimbangan_id IS NULL
      AND pg.wo_bulan IS NOT NULL
      AND (u.v IS NULL OR upper(pg.petugas_unit) = u.v)
  ),
  ini AS (
    SELECT DISTINCT w.efektif, w.ulp, w.kode FROM wo w, rentang r
    WHERE w.efektif >= r.awal AND w.efektif < r.akhir
      AND NOT public._gardu_di_tempelan('penyeimbangan', w.ulp, w.efektif, w.kode)
  ),
  tunggak AS (
    SELECT DISTINCT w.ulp, w.kode FROM wo w, rentang r
    WHERE p_bulan <> 0
      AND w.efektif = (r.awal - INTERVAL '1 month')::date
      AND (w.dikerjakan IS NULL OR w.dikerjakan >= r.awal)
      AND NOT EXISTS (SELECT 1 FROM wo x WHERE x.ulp = w.ulp AND x.kode = w.kode AND x.efektif = r.awal)
      AND NOT public._gardu_di_tempelan('penyeimbangan', w.ulp, r.awal, w.kode)
  )
  SELECT (SELECT count(*) FROM ini)::int, (SELECT count(*) FROM tunggak)::int
$fn$;

GRANT EXECUTE ON FUNCTION public.rekap_pemerataan_rincian(TEXT, INT, INT) TO authenticated;


-- ── 3. Rekap kinerja ─────────────────────────────────────────────────────────
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
  -- ★★★★★★★★★ WO anomali = WO bulan ini (yang sudah dikerjakan SEBELUM bulan
  --      WO-nya dihitung di bulan dikerjakan) + TUNGGAKAN bulan lalu yang belum
  --      dikerjakan per awal bulan ini (wo-pemerataan-tunggakan.sql, 4 Nov 2026).
  SELECT x.wo_bulan_ini + x.wo_tunggakan INTO anomali
    FROM public.rekap_pemerataan_rincian(u, p_tahun, p_bulan) x;

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

  -- ★★★★★★★ Realisasi = SEMUA pengukuran gardu bulan ini menurut tanggal
  --      ukur (WO, tunggakan susulan, DAN di luar WO), sekali per gardu per
  --      bulan — satu aturan dengan Excel/Realisasi Harian lewat
  --      _pengukuran_bulan (keputusan user 3 Nov 2026). Gardu WO yang wajib
  --      tegangan ujung tetap menunggu tegangan ujungnya.
  --      Belum disetujui = tertahan usulan titik/kVA + tegangan ujung terkirim
  --      belum disetujui (aturan 27 Okt tetap).
  RETURN QUERY
  -- ★★★★★★★★ WO terbit (per bulan) = gardu WO bulan ini + TUNGGAKAN WO bulan lalu
  --      yang belum tuntas dan tidak terbit lagi di WO bulan ini (keputusan
  --      user 3 Nov 2026): tunggakan dibawa ke HP dan bisa jadi realisasi bulan
  --      ini, jadi WO-nya ikut dihitung. Gardu di keduanya dihitung sekali.
  SELECT 'pengukuran'::text,
    ((SELECT count(*) FROM public.wo_pengukuran_realisasi r
       WHERE r.tahun = p_tahun AND (p_bulan = 0 OR r.bulan = p_bulan)
         AND (u IS NULL OR upper(r.ulp) = u))
     + CASE WHEN p_bulan = 0 THEN 0 ELSE public._wo_pengukuran_tunggakan(u, p_tahun, p_bulan) END)::numeric,
    k.dihitung, k.tahan, NULL::numeric
  FROM (SELECT count(*) FILTER (WHERE x.dihitung)::numeric AS dihitung,
               count(*) FILTER (WHERE x.tahan)::numeric AS tahan
        FROM public._pengukuran_bulan(u, d_awal, d_akhr) x) k;

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


-- ── Periksa ──────────────────────────────────────────────────────────────────
--   SELECT * FROM rekap_pemerataan_rincian('AMPENAN', 2026, 11);   -- 11, 8
--   SELECT * FROM rekap_pemerataan_rincian('TANJUNG', 2026, 11);   -- 3, 0
--   SELECT wo_terbit FROM rekap_kinerja('TANJUNG', 2026, 10) WHERE kunci = 'penyeimbangan';   -- 15 (tetap)
