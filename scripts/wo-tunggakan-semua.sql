-- =============================================================================
-- Tunggakan WO untuk SEMUA pekerjaan (4 Nov 2026). Jalankan manual di Supabase
-- SQL Editor, SESUDAH wo-surat-tunggakan.sql. Idempoten.
--
-- Keputusan user 4 Nov: WO terbit bulan ini = WO bulan ini + tunggakan WO bulan
-- lalu yang belum selesai per awal bulan ini dan tidak terbit lagi bulan ini —
-- untuk semua pekerjaan (Pengukuran & Pemerataan Beban sudah lebih dulu).
-- Audit 4 Nov (tunggakan Oktober → November): Pemeliharaan Gardu Ampenan 4;
-- Perabasan Cakranegara 2 seg / Tanjung 96 seg (84 km); JTM Tier 1 Tanjung 55;
-- JTM Tier 2 Ampenan 11 / Gerung 16 / Tanjung 26; JTR Ampenan 8 / Tanjung 9;
-- Optimasi Ampenan 4 / Tanjung 4.
--
-- Isi:
--   1. _wo_tunggakan_daftar — daftar tunggakan Pemeliharaan Gardu, Perabasan,
--      Optimasi, Inspeksi JTM Tier 1/2, JTR, Inspeksi Gardu Tier 1/2
--      (Pengukuran & Pemerataan punya fungsinya sendiri).
--   2. rekap_wo_tunggakan — jumlah tunggakan per pekerjaan (semua, termasuk
--      Pengukuran & Pemerataan) untuk rincian "WO bulan ini · tunggakan" di web.
--   3. rekap_kinerja: WO terbit + tunggakan (kecuali yang bersakelar SLA).
--      ⚠ Definisi terbaru rekap_kinerja kini di SINI.
--   4. wo_surat_objek: baris tunggakan di lampiran ("Tunggakan WO Oktober");
--      WO JTM Tier 2 sistem masuk lampiran Tier 2 (dulu Tier 1); WO Inspeksi
--      Gardu dari aplikasi (wo_igardu) ikut lampiran (dulu kosong).
--      ⚠ Definisi terbaru wo_surat_objek kini di SINI.
--   5. _wo_pengukuran_tunggakan_daftar: tunggakan = belum DIKERJAKAN (tegangan
--      ujung terkirim cukup), bukan belum disetujui.
-- Selesai = sudah dikerjakan SEBELUM awal bulan ini (yang selesai bulan ini
-- tetap tunggakan bulan ini — WO-nya ikut, realisasinya juga).
-- =============================================================================

-- ── 1. Daftar tunggakan ──────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public._wo_tunggakan_daftar(p_ulp TEXT, p_tahun INT, p_bulan INT)
RETURNS TABLE (kunci TEXT, ulp TEXT, objek TEXT, km NUMERIC, penyulang TEXT, alamat TEXT, kva NUMERIC,
               keterangan TEXT, pelaksana TEXT, tgl_wo DATE)
LANGUAGE sql STABLE SET search_path = public AS $fn$
  WITH u AS (SELECT NULLIF(NULLIF(upper(btrim(COALESCE(p_ulp, ''))), ''), 'SEMUA') AS v),
  b AS (
    SELECT make_date(p_tahun, p_bulan, 1) AS awal,
           (make_date(p_tahun, p_bulan, 1) + INTERVAL '1 month')::date AS akhir,
           (make_date(p_tahun, p_bulan, 1) - INTERVAL '1 month')::date AS lalu,
           make_date(p_tahun, p_bulan, 1)::timestamp AT TIME ZONE 'Asia/Makassar' AS t_awal
  ),

  -- Pemeliharaan Gardu: item WO bulan lalu yang belum terealisasi di bulan WO-nya.
  hargardu AS (
    SELECT 'hargardu'::text AS kunci, upper(r.ulp) AS ulp, r.gardu_kode AS objek, NULL::numeric AS km,
           r.penyulang, r.alamat, gd.daya::numeric AS kva, it.keterangan, it.pelaksana, b.lalu AS tgl_wo
    FROM public.wo_hargardu_realisasi r
    JOIN public.wo_hargardu_item it ON it.id = r.id
    LEFT JOIN public.gardu gd ON upper(gd.kode) = upper(r.gardu_kode) AND upper(gd.ulp) = upper(r.ulp)
    CROSS JOIN b CROSS JOIN u
    WHERE r.tahun = extract(year FROM b.lalu)::int AND r.bulan = extract(month FROM b.lalu)::int
      AND (u.v IS NULL OR upper(r.ulp) = u.v)
      AND NOT COALESCE(r.terealisasi, false)
      AND NOT EXISTS (SELECT 1 FROM public.wo_hargardu_realisasi n
                      WHERE n.tahun = p_tahun AND n.bulan = p_bulan
                        AND upper(n.ulp) = upper(r.ulp) AND upper(n.gardu_kode) = upper(r.gardu_kode))
  ),

  -- Perabasan: segmen WO bulan lalu yang belum selesai dirabas sebelum bulan ini
  -- (bulan realisasi perabasan = bulan MULAI dirabas).
  perabasan AS (
    SELECT 'perabasan'::text, upper(w.ulp), i.segmen_nama, i.panjang_km,
           i.penyulang, NULL::text, NULL::numeric, i.keterangan, COALESCE(i.pelaksana, i.regu), w.tgl_wo::date
    FROM public.wo_perabasan_item i JOIN public.wo_perabasan w ON w.id = i.wo_id
    CROSS JOIN b CROSS JOIN u
    WHERE w.status <> 'Dibatalkan' AND i.status <> 'Dibatalkan'
      AND w.tgl_wo >= b.lalu AND w.tgl_wo < b.awal
      AND (u.v IS NULL OR upper(w.ulp) = u.v)
      AND NOT (i.status IN ('Selesai', 'Diverifikasi') AND COALESCE(i.tgl_mulai, i.tgl_selesai) < b.awal)
      AND NOT EXISTS (SELECT 1 FROM public.wo_perabasan_item n JOIN public.wo_perabasan nw ON nw.id = n.wo_id
                      WHERE nw.status <> 'Dibatalkan' AND n.status <> 'Dibatalkan'
                        AND nw.tgl_wo >= b.awal AND nw.tgl_wo < b.akhir
                        AND upper(nw.ulp) = upper(w.ulp) AND n.segmen_id = i.segmen_id)
  ),

  -- Optimasi Trafo: WO anomali bulan lalu yang belum dioperasikan sebelum bulan ini.
  optimasi AS (
    SELECT 'optimasi'::text, upper(pg.petugas_unit), pg.no_gardu, NULL::numeric,
           pg.penyulang, pg.alamat, gd.daya::numeric, NULL::text, NULL::text, b.lalu
    FROM public.pengukuran_gardu pg
    LEFT JOIN public.gardu gd ON upper(gd.kode) = upper(pg.no_gardu) AND upper(gd.ulp) = upper(pg.petugas_unit)
    CROSS JOIN b CROSS JOIN u
    WHERE pg.jenis_pemeliharaan = 'OPTIMASI TRAFO' AND pg.wo_bulan = b.lalu
      AND (u.v IS NULL OR upper(pg.petugas_unit) = u.v)
      AND NOT EXISTS (SELECT 1 FROM public.optimasi_wo_batal x WHERE x.pengukuran_id::text = pg.id::text)
      AND NOT EXISTS (SELECT 1 FROM public.optimasi_trafo o
                      WHERE o.pengukuran_id = pg.id AND o.status NOT IN ('Dibatalkan', 'Dikembalikan')
                        AND o.tgl_operasi::date < b.awal)
      AND NOT EXISTS (SELECT 1 FROM public.pengukuran_gardu n
                      WHERE n.jenis_pemeliharaan = 'OPTIMASI TRAFO' AND n.wo_bulan = b.awal
                        AND upper(n.petugas_unit) = upper(pg.petugas_unit) AND upper(n.no_gardu) = upper(pg.no_gardu))
  ),

  -- Inspeksi JTM Tier 1/2 & JTR: item WO bulan lalu tanpa inspeksi selesai sebelum bulan ini.
  inspeksi AS (
    SELECT CASE WHEN w.jenis = 'JTR' THEN 'jtr' WHEN w.tier = '2' THEN 'jtm2' ELSE 'jtm' END,
           upper(i.ulp), COALESCE(i.gardu_kode, i.objek_nama), i.panjang_km,
           i.penyulang, NULL::text, NULL::numeric, i.keterangan, COALESCE(i.pelaksana, i.regu), w.tgl_wo::date
    FROM public.wo_inspeksi_item i JOIN public.wo_inspeksi w ON w.id = i.wo_id
    CROSS JOIN b CROSS JOIN u
    WHERE i.status <> 'Dibatalkan' AND COALESCE(w.status, '') <> 'Dibatalkan'
      AND w.tgl_wo >= b.lalu AND w.tgl_wo < b.awal
      AND (u.v IS NULL OR upper(i.ulp) = u.v)
      AND NOT EXISTS (SELECT 1 FROM public.inspeksi_jtm m
                      WHERE m.wo_item_id = i.id AND m.status IN ('Selesai', 'Diverifikasi')
                        AND COALESCE(m.tgl_selesai, m.created_at) < b.t_awal)
      AND NOT EXISTS (SELECT 1 FROM public.inspeksi_jtr j
                      WHERE j.wo_item_id = i.id AND j.status IN ('Selesai', 'Diverifikasi')
                        AND COALESCE(j.tgl_selesai, j.created_at) < b.t_awal)
      AND NOT EXISTS (SELECT 1 FROM public.wo_inspeksi_item n JOIN public.wo_inspeksi nw ON nw.id = n.wo_id
                      WHERE n.status <> 'Dibatalkan' AND nw.jenis = w.jenis AND COALESCE(nw.tier, '1') = COALESCE(w.tier, '1')
                        AND nw.tgl_wo >= b.awal AND nw.tgl_wo < b.akhir AND upper(n.ulp) = upper(i.ulp)
                        AND ((i.segmen_id IS NOT NULL AND n.segmen_id = i.segmen_id)
                          OR (i.gardu_kode IS NOT NULL AND upper(n.gardu_kode) = upper(i.gardu_kode))))
  ),

  -- Inspeksi Gardu Tier 1/2.
  igardu AS (
    SELECT 'igardu' || i.tier, upper(i.ulp), i.gardu_kode, NULL::numeric,
           i.penyulang, NULL::text, gd.daya::numeric, i.catatan, i.regu, w.tgl_wo::date
    FROM public.wo_igardu_item i JOIN public.wo_igardu w ON w.id = i.wo_id
    LEFT JOIN public.gardu gd ON upper(gd.kode) = upper(i.gardu_kode) AND upper(gd.ulp) = upper(i.ulp)
    CROSS JOIN b CROSS JOIN u
    WHERE COALESCE(w.status, '') <> 'Dibatalkan' AND COALESCE(i.status, '') <> 'Dibatalkan'
      AND w.tgl_wo >= b.lalu AND w.tgl_wo < b.awal
      AND (u.v IS NULL OR upper(i.ulp) = u.v)
      AND NOT EXISTS (SELECT 1 FROM public.inspeksi_gardu g
                      WHERE g.wo_item_id = i.id AND g.status IN ('Selesai', 'Diverifikasi') AND g.tgl < b.t_awal)
      AND NOT EXISTS (SELECT 1 FROM public.wo_igardu_item n JOIN public.wo_igardu nw ON nw.id = n.wo_id
                      WHERE COALESCE(nw.status, '') <> 'Dibatalkan' AND n.tier = i.tier
                        AND nw.tgl_wo >= b.awal AND nw.tgl_wo < b.akhir
                        AND upper(n.ulp) = upper(i.ulp) AND upper(n.gardu_kode) = upper(i.gardu_kode))
  )
  SELECT * FROM hargardu UNION ALL SELECT * FROM perabasan UNION ALL SELECT * FROM optimasi
  UNION ALL SELECT * FROM inspeksi UNION ALL SELECT * FROM igardu
$fn$;

GRANT EXECUTE ON FUNCTION public._wo_tunggakan_daftar(TEXT, INT, INT) TO authenticated;


-- ── 2. Jumlah tunggakan per pekerjaan (rincian web) ─────────────────────────
-- KMS untuk Perabasan / JTM / JTR, jumlah objek untuk yang lain.
CREATE OR REPLACE FUNCTION public.rekap_wo_tunggakan(p_ulp TEXT, p_tahun INT, p_bulan INT)
RETURNS TABLE (kunci TEXT, jumlah NUMERIC)
LANGUAGE sql STABLE SET search_path = public AS $fn$
  -- Pasangan (ULP, pekerjaan) bersakelar SLA tidak ikut: WO-nya SLA, bukan WO + tunggakan.
  WITH semua AS (
    SELECT d.kunci, d.ulp, d.km FROM public._wo_tunggakan_daftar(p_ulp, p_tahun, p_bulan) d
    UNION ALL
    SELECT 'pengukuran', t.ulp, NULL FROM public._wo_pengukuran_tunggakan_daftar(p_ulp, p_tahun, p_bulan) t
    UNION ALL
    SELECT 'penyeimbangan', d.ulp, NULL FROM public._wo_pemerataan_daftar(p_ulp, p_tahun, p_bulan) d WHERE d.jalur = 'tunggak'
  )
  SELECT x.kunci,
         CASE WHEN x.kunci IN ('perabasan', 'jtm', 'jtm2', 'jtr') THEN round(COALESCE(sum(x.km), 0), 3)
              ELSE count(*)::numeric END
  FROM semua x
  WHERE p_bulan <> 0
    AND NOT EXISTS (SELECT 1 FROM public.wo_surat_mode m
                    WHERE m.ulp = x.ulp AND m.tahun = p_tahun AND m.bulan = p_bulan AND m.kunci = x.kunci)
  GROUP BY x.kunci
$fn$;

GRANT EXECUTE ON FUNCTION public.rekap_wo_tunggakan(TEXT, INT, INT) TO authenticated;


-- ── 3. Rekap kinerja ─────────────────────────────────────────────────────────
-- Salinan wo-surat-sla.sql; ★ = tunggakan pekerjaan lain ditambahkan ke WO terbit
-- (Pengukuran & Pemerataan sudah di dalam _rekap_kinerja_inti). Pasangan
-- (ULP, pekerjaan) yang bersakelar SLA tidak ditambah — WO-nya SLA.
CREATE OR REPLACE FUNCTION public.rekap_kinerja(p_ulp TEXT, p_tahun INT, p_bulan INT)
RETURNS TABLE (kunci TEXT, wo_terbit NUMERIC, realisasi NUMERIC, belum_disetujui NUMERIC, luar_wo NUMERIC, sla NUMERIC)
LANGUAGE plpgsql STABLE SET search_path = public AS $fn$
DECLARE
  u       TEXT := NULLIF(NULLIF(upper(btrim(COALESCE(p_ulp, ''))), ''), 'SEMUA');
  g       RECORD;
  tambah  JSONB := '{}'::jsonb;
  hutang  JSONB := '{}'::jsonb;
  selisih NUMERIC;
  k       TEXT;
BEGIN
  IF u IS NULL OR p_bulan = 0 THEN
    FOR g IN
      SELECT m.ulp, m.tahun, m.bulan, array_agg(m.kunci) AS kunci
      FROM public.wo_surat_mode m
      WHERE m.tahun = p_tahun AND (p_bulan = 0 OR m.bulan = p_bulan) AND (u IS NULL OR m.ulp = u)
      GROUP BY 1, 2, 3
    LOOP
      FOREACH k IN ARRAY g.kunci LOOP
        SELECT COALESCE(public.sla_rekap(g.ulp, k, g.tahun, g.bulan), 0) - COALESCE(x.wo_terbit, 0)
          INTO selisih
        FROM public._rekap_kinerja_inti(g.ulp, g.tahun, g.bulan) x WHERE x.kunci = k;
        IF public.sla_rekap(g.ulp, k, g.tahun, g.bulan) IS NOT NULL THEN
          tambah := jsonb_set(tambah, ARRAY[k], to_jsonb(COALESCE((tambah->>k)::numeric, 0) + COALESCE(selisih, 0)));
        END IF;
      END LOOP;
    END LOOP;
  END IF;

  -- ★ Tunggakan (per bulan saja).
  IF p_bulan <> 0 THEN
    SELECT COALESCE(jsonb_object_agg(t.kunci, t.jumlah), '{}'::jsonb) INTO hutang
    FROM (
      SELECT d.kunci,
             CASE WHEN d.kunci IN ('perabasan', 'jtm', 'jtm2', 'jtr') THEN round(COALESCE(sum(d.km), 0), 3)
                  ELSE count(*)::numeric END AS jumlah
      FROM public._wo_tunggakan_daftar(u, p_tahun, p_bulan) d
      WHERE NOT EXISTS (SELECT 1 FROM public.wo_surat_mode m
                        WHERE m.ulp = d.ulp AND m.tahun = p_tahun AND m.bulan = p_bulan AND m.kunci = d.kunci)
      GROUP BY d.kunci
    ) t;
  END IF;

  RETURN QUERY
  SELECT r.kunci,
    CASE
      WHEN u IS NOT NULL AND p_bulan <> 0 AND s.sla IS NOT NULL AND EXISTS (
        SELECT 1 FROM public.wo_surat_mode m
        WHERE m.ulp = u AND m.tahun = p_tahun AND m.bulan = p_bulan AND m.kunci = r.kunci)
        THEN s.sla
      WHEN tambah ? r.kunci OR hutang ? r.kunci
        THEN COALESCE(r.wo_terbit, 0) + COALESCE((tambah->>r.kunci)::numeric, 0) + COALESCE((hutang->>r.kunci)::numeric, 0)
      ELSE r.wo_terbit
    END,
    r.realisasi, r.belum_disetujui, r.luar_wo, s.sla
  FROM public._rekap_kinerja_inti(p_ulp, p_tahun, p_bulan) r
  CROSS JOIN LATERAL (SELECT public.sla_rekap(u, r.kunci, p_tahun, p_bulan) AS sla) s;
END $fn$;

GRANT EXECUTE ON FUNCTION public.rekap_kinerja(TEXT, INT, INT) TO authenticated;


-- ── 4. Objek lampiran surat ──────────────────────────────────────────────────
-- Salinan wo-surat-tunggakan.sql; ★ = baris tunggakan pekerjaan lain di akhir.
CREATE OR REPLACE FUNCTION public.wo_surat_objek(p_ulp TEXT, p_tahun INT, p_bulan INT)
RETURNS TABLE (kunci TEXT, urutan INT, objek TEXT, alamat TEXT, km NUMERIC, keterangan TEXT, pelaksana TEXT,
               tgl_rencana DATE, penyulang TEXT, kva NUMERIC, uraian TEXT)
LANGUAGE plpgsql STABLE SET search_path = public AS $$
DECLARE
  u      TEXT := upper(btrim(COALESCE(p_ulp, '')));
  d_awal DATE := make_date(p_tahun, p_bulan, 1);
  d_akhr DATE := (make_date(p_tahun, p_bulan, 1) + INTERVAL '1 month')::date;
  t_awal TIMESTAMPTZ := make_date(p_tahun, p_bulan, 1)::timestamp AT TIME ZONE 'Asia/Makassar';
  t_akhr TIMESTAMPTZ := (make_date(p_tahun, p_bulan, 1) + INTERVAL '1 month')::timestamp AT TIME ZONE 'Asia/Makassar';
BEGIN
  RETURN QUERY
  SELECT 'perabasan'::text, row_number() OVER (ORDER BY i.penyulang, w.tgl_wo, i.urutan)::int,
         i.segmen_nama, NULL::text, i.panjang_km, i.keterangan, COALESCE(i.pelaksana, i.regu), NULL::date,
         i.penyulang, NULL::numeric, NULL::text
  FROM public.wo_perabasan_item i JOIN public.wo_perabasan w ON w.id = i.wo_id
  WHERE w.status <> 'Dibatalkan' AND i.status <> 'Dibatalkan'
    AND w.tgl_wo >= d_awal AND w.tgl_wo < d_akhr AND upper(w.ulp) = u;

  RETURN QUERY
  SELECT 'hargardu'::text, row_number() OVER (ORDER BY r.penyulang, r.urutan)::int,
         r.gardu_kode, r.alamat, NULL::numeric, it.keterangan, it.pelaksana, NULL::date,
         r.penyulang, gd.daya::numeric, NULL::text
  FROM public.wo_hargardu_realisasi r
  JOIN public.wo_hargardu_item it ON it.id = r.id
  LEFT JOIN public.gardu gd ON upper(gd.kode) = upper(r.gardu_kode) AND upper(gd.ulp) = upper(r.ulp)
  WHERE r.tahun = p_tahun AND r.bulan = p_bulan AND upper(r.ulp) = u;

  RETURN QUERY
  SELECT 'optimasi'::text, row_number() OVER (ORDER BY pg.wo_sent_at)::int,
         pg.no_gardu, pg.alamat, NULL::numeric, NULL::text, NULL::text, NULL::date,
         pg.penyulang, gd.daya::numeric, NULL::text
  FROM public.pengukuran_gardu pg
  LEFT JOIN public.gardu gd ON upper(gd.kode) = upper(pg.no_gardu) AND upper(gd.ulp) = upper(pg.petugas_unit)
  WHERE pg.jenis_pemeliharaan = 'OPTIMASI TRAFO'
    AND pg.wo_bulan = d_awal   -- Bulan WO, bukan tanggal tombol ditekan
    AND upper(pg.petugas_unit) = u
    AND NOT EXISTS (SELECT 1 FROM public.optimasi_wo_batal b WHERE b.pengukuran_id::text = pg.id::text);

  -- ★ Penyeimbangan: daftar yang SAMA dengan angka Rekap (_wo_pemerataan_daftar):
  --   WO bulan ini (bulan efektif) lalu TUNGGAKAN bulan lalu — wo-surat-tunggakan.sql.
  --   Gardu yang sudah ada di tempelan bulan itu tidak diulang.
  RETURN QUERY
  SELECT 'penyeimbangan'::text,
         row_number() OVER (ORDER BY (d.jalur = 'tunggak'), pg.penyulang, d.kode)::int,
         pg.no_gardu, pg.alamat, NULL::numeric,
         CASE WHEN d.jalur = 'tunggak' THEN 'Tunggakan WO ' || public._nama_bulan(d.efektif) END,
         NULL::text, NULL::date, pg.penyulang, gd.daya::numeric, NULL::text
  FROM public._wo_pemerataan_daftar(u, p_tahun, p_bulan) d
  JOIN public.pengukuran_gardu pg ON pg.id::text = d.pengukuran_id
  LEFT JOIN public.gardu gd ON upper(gd.kode) = upper(pg.no_gardu) AND upper(gd.ulp) = upper(pg.petugas_unit);

  -- ★ Pengukuran: WO bulan ini, lalu TUNGGAKAN WO bulan lalu yang belum tuntas
  --   dan tidak terbit lagi (_wo_pengukuran_tunggakan_daftar = angka Rekap).
  RETURN QUERY
  SELECT 'pengukuran'::text,
         row_number() OVER (ORDER BY x.tunggak, x.penyulang, x.urutan)::int,
         x.kode_gardu, x.alamat, NULL::numeric, x.keterangan, x.pelaksana, NULL::date,
         x.penyulang, x.kva_master, NULL::text
  FROM (
    SELECT false AS tunggak, r.penyulang, r.urutan, r.kode_gardu, r.alamat, it.keterangan, it.pelaksana, r.kva_master
    FROM public.wo_pengukuran_realisasi r
    JOIN public.wo_pengukuran_item it ON it.id = r.id
    WHERE r.tahun = p_tahun AND r.bulan = p_bulan AND upper(r.ulp) = u
    UNION ALL
    SELECT true, r.penyulang, r.urutan, r.kode_gardu, r.alamat,
           concat_ws(' · ', 'Tunggakan WO ' || public._nama_bulan(t.tgl_wo), NULLIF(btrim(COALESCE(it.keterangan, '')), '')),
           it.pelaksana, r.kva_master
    FROM public._wo_pengukuran_tunggakan_daftar(u, p_tahun, p_bulan) t
    JOIN public.wo_pengukuran_realisasi r ON r.id::text = t.id
    JOIN public.wo_pengukuran_item it ON it.id = r.id
  ) x;

  -- Inspeksi JTM (WO sistem, lalu tempelan yang belum di master) & JTR.
  RETURN QUERY
  -- ★ (4 Nov) Kunci per TIER: WO JTM Tier 2 dari sistem dulu masuk lampiran Tier 1.
  SELECT CASE WHEN w.jenis = 'JTR' THEN 'jtr' WHEN COALESCE(w.tier, '1') = '2' THEN 'jtm2' ELSE 'jtm' END,
         row_number() OVER (PARTITION BY w.jenis, COALESCE(w.tier, '1') ORDER BY i.penyulang, i.urutan)::int,
         COALESCE(i.gardu_kode, i.objek_nama), NULL::text,
         i.panjang_km, i.keterangan, COALESCE(i.pelaksana, i.regu), NULL::date,
         i.penyulang, NULL::numeric, NULL::text
  FROM public.wo_inspeksi_item i JOIN public.wo_inspeksi w ON w.id = i.wo_id
  WHERE i.status <> 'Dibatalkan'
    AND w.tgl_wo >= d_awal AND w.tgl_wo < d_akhr AND upper(i.ulp) = u;

  RETURN QUERY
  SELECT m.jenis, 100000 + i.urutan, i.objek, i.alamat, i.km, i.keterangan, i.pelaksana, i.tgl_rencana,
         i.penyulang, i.kva, i.uraian
  FROM public.wo_manual_item i JOIN public.wo_manual m ON m.id = i.wo_id
  WHERE m.ulp = u AND m.tahun = p_tahun AND m.bulan = p_bulan;

  -- ★ Tugas manual Pemeliharaan Jaringan, sesudah tempelan.
  RETURN QUERY
  SELECT 'harjtm'::text, 200000 + row_number() OVER (ORDER BY x.assigned_at, x.id::text)::int,
         x.lokasi, NULL::text, NULL::numeric,
         concat_ws(' — ', x.jenis_jaringan, NULLIF(btrim(COALESCE(x.keterangan, '')), '')),
         COALESCE(NULLIF(x.team_name, ''), 'HARJAR'), NULL::date,
         x.penyulang, NULL::numeric, x.temuan
  FROM public.inspeksi x
  WHERE x.source = 'tugas_manual' AND x.status <> 'Dibatalkan'
    AND upper(COALESCE(x.eksekutor, '')) = 'HARJAR'
    AND x.assigned_at >= t_awal AND x.assigned_at < t_akhr
    AND upper(x.ulp) = u;

  -- ★ (4 Nov) Inspeksi Gardu Tier 1/2 dari WO aplikasi (`wo_igardu`) — dulu
  --   lampirannya kosong (hanya tempelan yang terbaca). Sama dengan Rekap:
  --   bulan yang punya tempelan tier itu memakai tempelannya.
  RETURN QUERY
  SELECT 'igardu' || i.tier, row_number() OVER (PARTITION BY i.tier ORDER BY i.penyulang, i.urutan)::int,
         i.gardu_kode, gd.alamat, NULL::numeric, i.catatan, i.regu, NULL::date,
         i.penyulang, gd.daya::numeric, NULL::text
  FROM public.wo_igardu_item i
  JOIN public.wo_igardu w ON w.id = i.wo_id
  LEFT JOIN public.gardu gd ON upper(gd.kode) = upper(i.gardu_kode) AND upper(gd.ulp) = upper(i.ulp)
  WHERE i.status <> 'Dibatalkan' AND w.status <> 'Dibatalkan'
    AND w.tgl_wo >= d_awal AND w.tgl_wo < d_akhr
    AND upper(w.ulp) = u
    AND NOT EXISTS (SELECT 1 FROM public.wo_manual m
                     WHERE m.jenis = 'igardu' || i.tier AND m.tahun = p_tahun AND m.bulan = p_bulan AND m.ulp = u);

  -- ★ Tunggakan WO bulan lalu pekerjaan lain (wo-tunggakan-semua.sql) — sama
  --   dengan yang ditambahkan ke WO terbit Rekap Kinerja.
  RETURN QUERY
  SELECT t.kunci, 300000 + row_number() OVER (PARTITION BY t.kunci ORDER BY t.penyulang, t.objek)::int,
         t.objek, t.alamat, t.km,
         concat_ws(' · ', 'Tunggakan WO ' || public._nama_bulan(t.tgl_wo), NULLIF(btrim(COALESCE(t.keterangan, '')), '')),
         t.pelaksana, NULL::date, t.penyulang, t.kva, NULL::text
  FROM public._wo_tunggakan_daftar(u, p_tahun, p_bulan) t;
END $$;
GRANT EXECUTE ON FUNCTION public.wo_surat_objek(TEXT, INT, INT) TO authenticated;


-- ── 5. Tunggakan Pengukuran: "belum dikerjakan", bukan "belum disetujui" ────
-- Perbaikan 4 Nov: gardu yang sudah diukur bebannya DAN tegangan ujungnya sudah
-- DIKIRIM sebelum awal bulan ini adalah pekerjaan bulan lalu yang tinggal
-- menunggu persetujuan (aturan bulan tuntas) — bukan tunggakan. Cakranegara
-- November sempat bertunggakan 216 karena 148 tegangan ujung Oktober belum
-- disetujui. ⚠ Definisi terbaru _wo_pengukuran_tunggakan_daftar kini di SINI.
CREATE OR REPLACE FUNCTION public._wo_pengukuran_tunggakan_daftar(p_ulp TEXT, p_tahun INT, p_bulan INT)
RETURNS TABLE (id TEXT, ulp TEXT, kode TEXT, tgl_wo DATE)
LANGUAGE sql STABLE SET search_path = public AS $fn$
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
  SELECT r.id::text, upper(r.ulp), upper(btrim(r.kode_gardu)), lalu.d
  FROM public.wo_pengukuran_realisasi r
  CROSS JOIN lalu CROSS JOIN awal CROSS JOIN u
  LEFT JOIN public.pengukuran_gardu p ON p.id::text = r.pengukuran_id::text
  LEFT JOIN tuall tu ON tu.id = r.pengukuran_id::text
  WHERE p_bulan <> 0
    AND r.tahun = extract(year FROM lalu.d)::int AND r.bulan = extract(month FROM lalu.d)::int
    AND (u.v IS NULL OR upper(r.ulp) = u.v)
    -- Sudah dikerjakan = beban terukur, tegangan ujung terkirim bila wajib,
    -- dan tanggal tuntasnya sebelum awal bulan ini.
    AND NOT (p.id IS NOT NULL
             AND (NOT COALESCE(r.wajib_tegangan_ujung, false) OR tu.id IS NOT NULL)
             AND GREATEST(left(p.tanggal_pengukuran::text, 10)::date, tu.tgl_tu) < awal.d)
    AND NOT EXISTS (SELECT 1 FROM kini WHERE kini.ulp = upper(r.ulp) AND kini.kode = upper(btrim(r.kode_gardu)))
$fn$;


-- ── Periksa ──────────────────────────────────────────────────────────────────
--   SELECT * FROM rekap_wo_tunggakan('TANJUNG', 2026, 11);
--   SELECT kunci, wo_terbit FROM rekap_kinerja('TANJUNG', 2026, 11);
--   SELECT kunci, count(*) FROM wo_surat_objek('TANJUNG', 2026, 11) WHERE keterangan LIKE 'Tunggakan%' GROUP BY 1;
