-- =============================================================================
-- Realisasi pengukuran = SEMUA pengukuran gardu, sama di Rekap Kinerja dan
-- Excel/Realisasi Harian (3 Nov 2026). Jalankan manual di Supabase SQL Editor,
-- SESUDAH rekap-perabasan-tgl-mulai.sql. Idempoten.
--
-- Kasus: Tanjung Oktober — Rekap 176, Excel Realisasi Bulanan 241 baris.
-- Selisih = 53 gardu di luar WO (WO dulu belum muncul sesuai bulan, regu
-- mengukur di luar WO), 4 ukur ulang, 8 gardu WO menunggu tegangan ujung.
--
-- Keputusan user 3 Nov:
--   • Rekap Kinerja dan unduhan HARUS sama.
--   • Pengukuran di luar WO = realisasi, menurut tanggal ukur, semua bulan.
--   • Realisasi = gardu yang sudah diukur bebannya DAN tegangan ujungnya
--     disetujui (WO maupun di luar WO).
--   • Satu gardu dihitung sekali per bulan (ukur ulang tidak dihitung).
--   • Bulan realisasi = bulan TUNTAS (ukur beban / tegangan ujung yang paling
--     akhir); persetujuan admin tidak memindah bulan.
--
-- Isi:
--   1. _pengukuran_bulan — satu-satunya aturan hitung.
--   2. _rekap_kinerja_inti (salinan utuh rekap-perabasan-tgl-mulai.sql, ★★★★★★★).
--      ⚠ Definisi terbaru _rekap_kinerja_inti kini di SINI.
--   3. realisasi_rentang (salinan utuh, baris pengukuran beban): `disetujui` =
--      dihitung realisasi, keterangan jalur di rincian. Excel, Realisasi
--      Harian/Bulanan, PRO NTB, LM 4DX ikut fungsi ini.
--      ⚠ Definisi terbaru realisasi_rentang kini di SINI.
--   4. rekap_pengukuran_rincian + wo_dihitung, luar_dihitung, wo_bulan_ini,
--      wo_tunggakan (rincian di bawah angka). ⚠ Definisi terbaru kini di SINI.
--   + _wo_pengukuran_tunggakan: WO terbit = WO bulan ini + tunggakan bulan lalu
--     yang belum tuntas dan tidak terbit lagi (keputusan user 3 Nov 2026).
-- =============================================================================

-- ── 1. Satu aturan hitung pengukuran ────────────────────────────────────────
-- Tiap pengukuran beban gardu di rentang bulan [p_awal, p_akhir), dengan
-- jalurnya dan apakah DIHITUNG realisasi:
--   wo      = pengukuran gardu WO bulan itu        → ikut aturan WO (tegangan
--   susulan = tunggakan WO bulan lalu, diukur kini    ujung wajib, tertahan)
--   luar    = gardu di luar WO, pengukuran pertama gardu itu di bulan itu
--             → dihitung kecuali tertahan usulan titik/kVA
--   SEMUA jalur: dihitung hanya bila tegangan ujungnya sudah DISETUJUI
--             (keputusan user 3 Nov 2026).
--   ulang   = gardu yang sudah punya pengukuran lain di bulan yang sama → tidak dihitung
-- ULP = ULP WO-nya; di luar WO = unit petugas (sama dengan Excel lama).
CREATE OR REPLACE FUNCTION public._pengukuran_bulan(p_ulp TEXT, p_awal DATE, p_akhir DATE)
RETURNS TABLE (id TEXT, tgl DATE, ulp TEXT, kode TEXT, jalur TEXT, dihitung BOOLEAN, tahan BOOLEAN)
LANGUAGE sql STABLE SET search_path = public AS $fn$
-- `tgl` = TANGGAL TUNTAS = yang paling akhir dari ukur beban dan ukur tegangan
-- ujung (keputusan user 3 Nov 2026): beban Oktober + tegangan ujung November
-- = realisasi November, angka Oktober tidak berubah lagi. Persetujuan admin
-- TIDAK memindah bulan (diukur Oktober, disetujui November = Oktober).
-- Tiap sumber dibaca SEKALI lalu digabung dengan join (versi EXISTS per baris
-- 7,9 dtk → Rekap kena batas waktu server, 3 Nov).
-- tanggal_pengukuran TEXT 'YYYY-MM-DD' di seluruh baris (teknisaplikasi butir 11).
WITH u AS (SELECT NULLIF(NULLIF(upper(btrim(COALESCE(p_ulp, ''))), ''), 'SEMUA') AS v),
tuall AS MATERIALIZED (
  -- Tegangan ujung terkirim per pengukuran: tanggal ukur terakhir, dan apakah
  -- SEMUA jurusannya sudah disetujui.
  SELECT t.pengukuran_id::text AS id, max(t.tgl_ukur) AS tgl_tu, bool_and(t.verified_at IS NOT NULL) AS ok
  FROM public.pengukuran_tegangan_ujung t WHERE t.status = 'Terkirim'
  GROUP BY 1
),
pb AS MATERIALIZED (
  SELECT x.* FROM (
    SELECT p.id::text AS id,
           GREATEST(left(p.tanggal_pengukuran::text, 10)::date, tu.tgl_tu) AS tgl,
           upper(btrim(p.no_gardu)) AS kode, upper(p.petugas_unit) AS unit, p.created_at,
           (tu.id IS NOT NULL) AS tu_kirim, COALESCE(tu.ok, false) AS tu_ok
    FROM public.pengukuran_gardu p
    LEFT JOIN tuall tu ON tu.id = p.id::text
    WHERE p.hasil_penyeimbangan_id IS NULL AND p.dikembalikan_at IS NULL
      -- Beban paling lama 6 bulan sebelum jendela (tegangan ujung menyusul).
      AND p.tanggal_pengukuran >= to_char(p_awal - INTERVAL '6 months', 'YYYY-MM-DD')
      AND p.tanggal_pengukuran <  to_char(p_akhir, 'YYYY-MM-DD')
  ) x
  WHERE x.tgl >= p_awal AND x.tgl < p_akhir
),
th AS MATERIALIZED (SELECT DISTINCT t.pengukuran_id::text AS id FROM public.pengukuran_tertahan t),
wv AS MATERIALIZED (
  SELECT r.pengukuran_id::text AS pid, r.susulan_id::text AS sid, upper(r.ulp) AS ulp,
         r.terealisasi, r.tertahan, r.susulan_terealisasi, r.susulan_tertahan
  FROM public.wo_pengukuran_realisasi r
  WHERE r.pengukuran_id IS NOT NULL OR r.susulan_id IS NOT NULL
),
wo AS (
  SELECT DISTINCT ON (x.id) x.* FROM (
    SELECT w.pid AS id, w.ulp, 'wo'::text AS jalur, w.terealisasi AS sah, w.tertahan AS tahan, 1 AS urut
    FROM wv w JOIN pb ON pb.id = w.pid
    UNION ALL
    SELECT w.sid, w.ulp, 'susulan', w.susulan_terealisasi, w.susulan_tertahan, 2
    FROM wv w JOIN pb ON pb.id = w.sid
  ) x
  ORDER BY x.id, x.urut
),
urut AS (
  SELECT pb.*, wo.ulp AS wo_ulp, wo.jalur AS wo_jalur, wo.sah, wo.tahan AS wo_tahan, (th.id IS NOT NULL) AS tertahan,
         row_number() OVER (
           PARTITION BY pb.kode, date_trunc('month', pb.tgl)
           ORDER BY (wo.jalur IS NOT NULL) DESC, pb.tgl, pb.created_at, pb.id) AS ke
  FROM pb LEFT JOIN wo ON wo.id = pb.id LEFT JOIN th ON th.id = pb.id
)
-- ★ Realisasi WAJIB tegangan ujung yang sudah disetujui — WO maupun di luar WO.
SELECT x.id, x.tgl, COALESCE(x.wo_ulp, x.unit), x.kode,
  COALESCE(x.wo_jalur, CASE WHEN x.ke = 1 THEN 'luar' ELSE 'ulang' END),
  CASE WHEN x.wo_jalur IS NOT NULL THEN COALESCE(x.sah, false) AND x.tu_ok
       ELSE x.ke = 1 AND NOT x.tertahan AND x.tu_ok END,
  CASE WHEN x.wo_jalur IS NOT NULL THEN COALESCE(x.wo_tahan, false) OR (x.tu_kirim AND NOT x.tu_ok)
       ELSE x.ke = 1 AND (x.tertahan OR (x.tu_kirim AND NOT x.tu_ok)) END
FROM urut x, u
WHERE u.v IS NULL OR COALESCE(x.wo_ulp, x.unit) = u.v
$fn$;

GRANT EXECUTE ON FUNCTION public._pengukuran_bulan(TEXT, DATE, DATE) TO authenticated;

-- Tunggakan WO pengukuran untuk bulan (p_tahun, p_bulan): item WO bulan
-- sebelumnya yang belum terealisasi dan gardunya TIDAK ada di WO bulan ini.
CREATE OR REPLACE FUNCTION public._wo_pengukuran_tunggakan(p_ulp TEXT, p_tahun INT, p_bulan INT)
RETURNS INT
LANGUAGE sql STABLE SET search_path = public AS $fn$
  -- Belum tuntas = belum terealisasi, ATAU baru tuntas (tegangan ujung) di bulan
  -- ini atau sesudahnya — tanggal tuntas sama dengan _pengukuran_bulan.
  WITH u AS (SELECT NULLIF(NULLIF(upper(btrim(COALESCE(p_ulp, ''))), ''), 'SEMUA') AS v),
  awal AS (SELECT make_date(p_tahun, p_bulan, 1) AS d),
  lalu AS (SELECT (make_date(p_tahun, p_bulan, 1) - INTERVAL '1 month')::date AS d),
  kini AS MATERIALIZED (
    SELECT DISTINCT upper(n.ulp) AS ulp, upper(btrim(n.kode_gardu)) AS kode
    FROM public.wo_pengukuran_realisasi n WHERE n.tahun = p_tahun AND n.bulan = p_bulan
  ),
  tuall AS MATERIALIZED (
    SELECT t.pengukuran_id::text AS id, max(t.tgl_ukur) AS tgl_tu
    FROM public.pengukuran_tegangan_ujung t WHERE t.status = 'Terkirim' GROUP BY 1
  )
  SELECT count(*)::int
  FROM public.wo_pengukuran_realisasi r
  CROSS JOIN lalu CROSS JOIN awal CROSS JOIN u
  LEFT JOIN public.pengukuran_gardu p ON p.id::text = r.pengukuran_id::text
  LEFT JOIN tuall tu ON tu.id = r.pengukuran_id::text
  WHERE r.tahun = extract(year FROM lalu.d)::int AND r.bulan = extract(month FROM lalu.d)::int
    AND (u.v IS NULL OR upper(r.ulp) = u.v)
    AND NOT (COALESCE(r.terealisasi, false)
             AND GREATEST(left(p.tanggal_pengukuran::text, 10)::date, tu.tgl_tu) < awal.d)
    AND NOT EXISTS (SELECT 1 FROM kini WHERE kini.ulp = upper(r.ulp) AND kini.kode = upper(btrim(r.kode_gardu)))
$fn$;

GRANT EXECUTE ON FUNCTION public._wo_pengukuran_tunggakan(TEXT, INT, INT) TO authenticated;


-- ── 2. Rekap kinerja ─────────────────────────────────────────────────────────
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


-- ── 3. Realisasi harian / bulanan / lampiran ─────────────────────────────────
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

  UNION ALL  -- Pengukuran beban gardu — ★ disetujui = DIHITUNG realisasi, aturan yang
              -- sama dengan Rekap Kinerja (_pengukuran_bulan, 3 Nov 2026).
  SELECT k.tgl, 'pengukuran', NULL, k.ulp, p.no_gardu,
    concat_ws(' · ', p.penyulang, 'beban ' || round(p.persen_beban::numeric, 0) || '%',
      CASE k.jalur WHEN 'luar' THEN 'di luar WO' WHEN 'susulan' THEN 'tunggakan WO'
                   WHEN 'ulang' THEN 'ukur ulang (tidak dihitung)' END,
      CASE WHEN k.jalur <> 'ulang' AND NOT k.dihitung AND NOT k.tahan THEN 'menunggu tegangan ujung' END,
      CASE WHEN k.tahan THEN 'menunggu persetujuan' END),
    p.petugas_nama,
    CASE WHEN p.jam_pengukuran::text ~ '^\d{2}:\d{2}' THEN left(p.jam_pengukuran::text, 5)::time END,
    NULL, k.dihitung, 'pengukuran_gardu', p.id::text
  FROM public._pengukuran_bulan(p_ulp, date_trunc('month', p_dari)::date,
                                (date_trunc('month', p_sampai) + INTERVAL '1 month')::date) k
  JOIN public.pengukuran_gardu p ON p.id::text = k.id
  WHERE k.tgl BETWEEN p_dari AND p_sampai

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

-- ── 4. Rincian di bawah angka Rekap ─────────────────────────────────────────
-- Salinan rekap-pengukuran-rincian.sql + dua kolom baru di AKHIR: pembentuk
-- angka Realisasi (gardu WO/tunggakan + di luar WO) dari _pengukuran_bulan.
-- Bentuk hasil berubah → DROP dulu (web lama tetap jalan: kolom lama sama).
DROP FUNCTION IF EXISTS public.rekap_pengukuran_rincian(TEXT, INT, INT);
CREATE FUNCTION public.rekap_pengukuran_rincian(p_ulp TEXT, p_tahun INT, p_bulan INT)
RETURNS TABLE (diukur INT, tu_terkirim INT, tu_disetujui INT, tertahan_titik INT, tu_menunggu INT, tu_belum INT,
               wo_dihitung INT, luar_dihitung INT, wo_bulan_ini INT, wo_tunggakan INT)
LANGUAGE sql STABLE SET search_path = public AS $fn$
  WITH r AS (
    SELECT w.pengukuran_id, w.tertahan, w.tegangan_ujung_ada, w.menunggu_tegangan_ujung,
           EXISTS (SELECT 1 FROM public.pengukuran_tegangan_ujung x
                    WHERE x.pengukuran_id = w.pengukuran_id AND x.status = 'Terkirim') AS tu_kirim
    FROM public.wo_pengukuran_realisasi w
    WHERE w.tahun = p_tahun AND (p_bulan = 0 OR w.bulan = p_bulan)
      AND (NULLIF(NULLIF(upper(btrim(COALESCE(p_ulp, ''))), ''), 'SEMUA') IS NULL
           OR upper(w.ulp) = upper(btrim(p_ulp)))
  ), k AS (
    SELECT * FROM public._pengukuran_bulan(
      p_ulp,
      make_date(p_tahun, CASE WHEN p_bulan = 0 THEN 1 ELSE p_bulan END, 1),
      CASE WHEN p_bulan = 0 THEN make_date(p_tahun + 1, 1, 1)
           ELSE (make_date(p_tahun, p_bulan, 1) + INTERVAL '1 month')::date END)
  )
  SELECT count(*) FILTER (WHERE pengukuran_id IS NOT NULL)::int,
         count(*) FILTER (WHERE tu_kirim)::int,
         count(*) FILTER (WHERE tegangan_ujung_ada)::int,
         count(*) FILTER (WHERE tertahan)::int,
         count(*) FILTER (WHERE menunggu_tegangan_ujung AND tu_kirim)::int,
         count(*) FILTER (WHERE menunggu_tegangan_ujung AND NOT tu_kirim)::int,
         (SELECT count(*) FROM k WHERE k.dihitung AND k.jalur IN ('wo', 'susulan'))::int,
         (SELECT count(*) FROM k WHERE k.dihitung AND k.jalur = 'luar')::int,
         count(*)::int,
         CASE WHEN p_bulan = 0 THEN 0 ELSE public._wo_pengukuran_tunggakan(p_ulp, p_tahun, p_bulan) END
  FROM r;
$fn$;

GRANT EXECUTE ON FUNCTION public.rekap_pengukuran_rincian(TEXT, INT, INT) TO authenticated;


-- ── Periksa ──────────────────────────────────────────────────────────────────
--   SELECT realisasi, belum_disetujui FROM rekap_kinerja('TANJUNG', 2026, 10) WHERE kunci = 'pengukuran';
--   SELECT count(*) FILTER (WHERE disetujui) FROM realisasi_rentang('TANJUNG', '2026-10-01', '2026-10-31')
--    WHERE kunci = 'pengukuran' AND bagian IS NULL;   -- harus SAMA dengan realisasi di atas
--   SELECT jalur, dihitung, count(*) FROM _pengukuran_bulan('TANJUNG', '2026-10-01', '2026-11-01') GROUP BY 1, 2;
