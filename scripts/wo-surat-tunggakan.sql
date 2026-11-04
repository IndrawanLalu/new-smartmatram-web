-- =============================================================================
-- Lampiran surat WO memuat TUNGGAKAN (WO hutang bulan lalu) — 4 Nov 2026.
-- Jalankan manual di Supabase SQL Editor, SESUDAH wo-surat-sla.sql. Idempoten.
--
-- Koreksi user 4 Nov: angka halaman 1 (= WO terbit Rekap) sudah memasukkan
-- tunggakan Pengukuran & Pemerataan Beban, tetapi tabel lampirannya belum.
-- Juga: lampiran Pemerataan masih memuat gardu yang sudah dikerjakan sebelum
-- bulan WO-nya (Tanjung BY029/BY074).
-- Sekarang daftar dan angka lahir dari fungsi yang SAMA:
--   _wo_pengukuran_tunggakan_daftar → _wo_pengukuran_tunggakan (angka) & lampiran
--   _wo_pemerataan_daftar           → rekap_pemerataan_rincian (angka) & lampiran
-- Baris tunggakan di lampiran berketerangan "Tunggakan WO Oktober".
--
-- ⚠ Definisi terbaru wo_surat_objek, _wo_pengukuran_tunggakan dan
--   rekap_pemerataan_rincian kini di SINI.
-- =============================================================================

CREATE OR REPLACE FUNCTION public._nama_bulan(p_tgl DATE)
RETURNS TEXT LANGUAGE sql IMMUTABLE AS $fn$
  SELECT (ARRAY['Januari','Februari','Maret','April','Mei','Juni','Juli','Agustus',
                'September','Oktober','November','Desember'])[extract(month FROM p_tgl)::int]
$fn$;


-- ── 1. Tunggakan WO Pengukuran ──────────────────────────────────────────────
-- Item WO bulan lalu yang belum tuntas per awal bulan ini (tanggal tuntas sama
-- dengan _pengukuran_bulan) dan gardunya TIDAK ada di WO bulan ini.
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
    AND NOT (COALESCE(r.terealisasi, false)
             AND GREATEST(left(p.tanggal_pengukuran::text, 10)::date, tu.tgl_tu) < awal.d)
    AND NOT EXISTS (SELECT 1 FROM kini WHERE kini.ulp = upper(r.ulp) AND kini.kode = upper(btrim(r.kode_gardu)))
$fn$;

CREATE OR REPLACE FUNCTION public._wo_pengukuran_tunggakan(p_ulp TEXT, p_tahun INT, p_bulan INT)
RETURNS INT LANGUAGE sql STABLE SET search_path = public AS $fn$
  SELECT count(*)::int FROM public._wo_pengukuran_tunggakan_daftar(p_ulp, p_tahun, p_bulan)
$fn$;

GRANT EXECUTE ON FUNCTION public._wo_pengukuran_tunggakan_daftar(TEXT, INT, INT) TO authenticated;


-- ── 2. WO Pemerataan Beban: bulan ini + tunggakan ───────────────────────────
-- Bulan WO EFEKTIF = bulan WO, kecuali sudah dikerjakan SEBELUM bulan WO-nya →
-- bulan dikerjakan. Gardu di tempelan bulan yang sama tidak ikut (tempelan yang
-- tampil). Satu baris per gardu (pengukuran WO terbaru).
--   jalur 'ini'     = bulan efektif dalam rentang
--   jalur 'tunggak' = bulan efektif = bulan lalu, belum dikerjakan per awal
--                     bulan ini, tidak di-WO lagi bulan ini (per bulan saja)
CREATE OR REPLACE FUNCTION public._wo_pemerataan_daftar(p_ulp TEXT, p_tahun INT, p_bulan INT)
RETURNS TABLE (jalur TEXT, ulp TEXT, kode TEXT, pengukuran_id TEXT, efektif DATE)
LANGUAGE sql STABLE SET search_path = public AS $fn$
  WITH u AS (SELECT NULLIF(NULLIF(upper(btrim(COALESCE(p_ulp, ''))), ''), 'SEMUA') AS v),
  rentang AS (
    SELECT make_date(p_tahun, CASE WHEN p_bulan = 0 THEN 1 ELSE p_bulan END, 1) AS awal,
           CASE WHEN p_bulan = 0 THEN make_date(p_tahun + 1, 1, 1)
                ELSE (make_date(p_tahun, p_bulan, 1) + INTERVAL '1 month')::date END AS akhir
  ),
  wo AS MATERIALIZED (
    SELECT pg.id::text AS id, upper(pg.petugas_unit) AS ulp, upper(btrim(pg.no_gardu)) AS kode,
           pg.wo_bulan, pg.wo_sent_at, d.tgl AS dikerjakan,
           CASE WHEN d.tgl < pg.wo_bulan THEN date_trunc('month', d.tgl)::date ELSE pg.wo_bulan END AS efektif
    FROM public.pengukuran_gardu pg
    LEFT JOIN LATERAL (
      SELECT min(left(p.tgl_penyeimbangan::text, 10)::date) AS tgl
      FROM public.penyeimbangan_gardu p
      WHERE p.pengukuran_id = pg.id AND p.status = 'Selesai'
        AND p.tgl_penyeimbangan::text ~ '^\d{4}-\d{2}-\d{2}'
    ) d ON true
    CROSS JOIN u
    WHERE pg.jenis_pemeliharaan = 'PEMERATAAN BEBAN'
      AND pg.hasil_penyeimbangan_id IS NULL
      AND pg.wo_bulan IS NOT NULL
      AND (u.v IS NULL OR upper(pg.petugas_unit) = u.v)
  ),
  ini AS (
    SELECT DISTINCT ON (w.efektif, w.ulp, w.kode) 'ini'::text AS jalur, w.ulp, w.kode, w.id, w.efektif
    FROM wo w, rentang r
    WHERE w.efektif >= r.awal AND w.efektif < r.akhir
      AND NOT public._gardu_di_tempelan('penyeimbangan', w.ulp, w.efektif, w.kode)
    ORDER BY w.efektif, w.ulp, w.kode, w.wo_sent_at DESC NULLS LAST
  ),
  tunggak AS (
    SELECT DISTINCT ON (w.ulp, w.kode) 'tunggak'::text AS jalur, w.ulp, w.kode, w.id, w.efektif
    FROM wo w, rentang r
    WHERE p_bulan <> 0
      AND w.efektif = (r.awal - INTERVAL '1 month')::date
      AND (w.dikerjakan IS NULL OR w.dikerjakan >= r.awal)
      AND NOT EXISTS (SELECT 1 FROM wo x WHERE x.ulp = w.ulp AND x.kode = w.kode AND x.efektif = r.awal)
      AND NOT public._gardu_di_tempelan('penyeimbangan', w.ulp, r.awal, w.kode)
    ORDER BY w.ulp, w.kode, w.wo_sent_at DESC NULLS LAST
  )
  SELECT * FROM ini UNION ALL SELECT * FROM tunggak
$fn$;

GRANT EXECUTE ON FUNCTION public._wo_pemerataan_daftar(TEXT, INT, INT) TO authenticated;

CREATE OR REPLACE FUNCTION public.rekap_pemerataan_rincian(p_ulp TEXT, p_tahun INT, p_bulan INT)
RETURNS TABLE (wo_bulan_ini INT, wo_tunggakan INT)
LANGUAGE sql STABLE SET search_path = public AS $fn$
  SELECT count(*) FILTER (WHERE d.jalur = 'ini')::int, count(*) FILTER (WHERE d.jalur = 'tunggak')::int
  FROM public._wo_pemerataan_daftar(p_ulp, p_tahun, p_bulan) d
$fn$;


-- ── 3. Objek lampiran surat ──────────────────────────────────────────────────
-- Salinan utuh harjar-tugas-manual.sql; ★ = penyeimbangan & pengukuran.
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
  SELECT lower(w.jenis), row_number() OVER (PARTITION BY w.jenis ORDER BY i.penyulang, i.urutan)::int,
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
END $$;
GRANT EXECUTE ON FUNCTION public.wo_surat_objek(TEXT, INT, INT) TO authenticated;


-- ── Periksa ──────────────────────────────────────────────────────────────────
--   SELECT * FROM rekap_pemerataan_rincian('AMPENAN', 2026, 11);       -- 11, 9 (sama dengan sebelumnya)
--   SELECT kunci, count(*) FROM wo_surat_objek('AMPENAN', 2026, 11) GROUP BY 1;   -- penyeimbangan 20
--   SELECT objek, keterangan FROM wo_surat_objek('TANJUNG', 2026, 11) WHERE kunci = 'penyeimbangan';   -- 3, tanpa BY029/BY074
