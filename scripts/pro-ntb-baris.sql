-- ═══════════════════════════════════════════════════════════════════════════
-- PRO NTB — baris kiriman per ULP & bulan: WO + realisasi (9 Nov 2026).
--
-- Keputusan user 9 Nov: PRO NTB ikut punya capaian seperti SMART, bukan
-- selalu 100 %.
--   • Tiap item WO bulan itu (lampiran WO = wo_surat_objek, TUNGGAKAN bulan
--     lalu sudah termasuk) = satu baris:
--       belum dikerjakan → tanggal 1 bulan itu, WO terisi, REALISASI kosong;
--       sudah dikirim regu (termasuk belum disetujui) → tanggal realisasi,
--       WO + REALISASI. Dikembalikan → kembali ke tanggal 1 tanpa realisasi.
--   • Realisasi tanpa item WO (di luar WO) = baris sendiri, WO KOSONG.
--   • Jenis yang bulan itu TIDAK punya WO berobjek dan tidak bermode SLA →
--     WO = realisasi.
--   • Jenis bermode "Sesuai SLA" (wo_surat_mode — WO Rekap Kinerja = SLA):
--     ditambah baris PENYESUAIAN SLA di tanggal 1 tanpa realisasi, supaya
--     jumlah WO = SLA (pilihan A user 9 Nov). Tab kms/jumlah ketik: satu baris,
--     WO = SLA − WO item. Tab bersatuan gardu (WO = rumus 1 per baris): sebanyak
--     SLA − jumlah baris lain. Selisih ≤ 0 → tidak ada baris penyesuaian.
--   • Tugas manual Pemeliharaan Jaringan = WO (keputusan user 9 Nov).
--   • Tunggakan: baris WO bulan lalu tetap di bulan lalu (tanpa realisasi);
--     bulan ini item itu muncul lagi sebagai WO bulan ini (tunggakan) dan
--     realisasinya tercatat di sini.
--
-- Pasangan WO ↔ realisasi: jenis + kode objek (gardu / nama segmen) yang
-- dirapikan, berurutan bila objek sama muncul lebih dari sekali. Pemeliharaan
-- Jaringan lewat tugas manualnya (pemeliharaan_jaringan.inspeksi_id).
--
-- kode_sumber → kode SMART-xxxxxxxx di KETERANGAN (di-hash di web):
--   baris WO     : 'wo|<jenis>|<objek>|<ke>|<YYYY-MM>' — TETAP walau berubah
--                  dari WO menjadi realisasi dan sebaliknya.
--   di luar WO   : '<sumber>|<id>|<bagian>|<tgl>' — sama dengan kode lama.
--
-- Hanya MEMBACA fungsi yang sudah ada. Aman dijalankan ulang.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.pro_ntb_baris(p_ulp TEXT, p_tahun INT, p_bulan INT)
RETURNS TABLE (tgl DATE, kunci TEXT, bagian TEXT, ulp TEXT, objek TEXT, rincian TEXT, petugas TEXT,
               waktu TIME, km NUMERIC, disetujui BOOLEAN, sumber TEXT, sumber_id TEXT,
               wo NUMERIC, realisasi NUMERIC, kode_sumber TEXT, jalur TEXT)
LANGUAGE sql STABLE SET search_path = public AS $fn$
  WITH b AS (
    SELECT make_date(p_tahun, p_bulan, 1) AS awal,
           ((make_date(p_tahun, p_bulan, 1) + INTERVAL '1 month')::date - 1) AS akhir,
           to_char(make_date(p_tahun, p_bulan, 1), 'YYYY-MM') AS bln,
           upper(btrim(p_ulp)) AS u
  ),
  km_jenis AS (SELECT unnest(ARRAY['perabasan', 'jtm', 'jtm2', 'jtr']) AS k),
  -- Tab PRO NTB yang kolom WO-nya RUMUS (1 per baris bertanggal).
  gardu_jenis AS (SELECT unnest(ARRAY['hargardu', 'igardu1', 'igardu2', 'pengukuran', 'penyeimbangan', 'optimasi']) AS k),
  sla AS MATERIALIZED (
    SELECT m.kunci, public.sla_rekap(b.u, m.kunci, p_tahun, p_bulan) AS sla
    FROM b JOIN public.wo_surat_mode m ON m.ulp = b.u AND m.tahun = p_tahun AND m.bulan = p_bulan
  ),
  w AS MATERIALIZED (
    SELECT o.kunci, o.objek, o.km, o.keterangan, o.pelaksana, o.penyulang,
           upper(btrim(o.objek)) AS ko,
           row_number() OVER (PARTITION BY o.kunci, upper(btrim(o.objek)) ORDER BY o.urutan) AS ke
    FROM b, public.wo_surat_objek(b.u, p_tahun, p_bulan) o
    WHERE btrim(COALESCE(o.objek, '')) <> ''
  ),
  r AS MATERIALIZED (
    SELECT x.*,
      CASE WHEN x.kunci = 'harjtm' THEN
             COALESCE((SELECT upper(btrim(t.lokasi)) FROM public.pemeliharaan_jaringan j
                        JOIN public.inspeksi t ON t.id = j.inspeksi_id
                       WHERE j.id::text = x.sumber_id AND t.source = 'tugas_manual'),
                      '#' || x.sumber_id)          -- bukan tugas manual = di luar WO
           ELSE upper(btrim(x.objek)) END AS ko
    FROM b, public.realisasi_rentang(b.u, b.awal, b.akhir) x
    WHERE x.bagian IS DISTINCT FROM 'ujung'          -- tegangan ujung bukan baris PRO NTB
  ),
  rn AS (
    SELECT r.*, row_number() OVER (PARTITION BY r.kunci, r.ko ORDER BY r.tgl, r.waktu NULLS LAST, r.sumber_id) AS ke
    FROM r
  ),
  p AS (
    SELECT w.kunci AS w_kunci, w.objek AS w_objek, w.km AS w_km, w.keterangan AS w_ket,
           w.pelaksana AS w_pelaksana, w.penyulang AS w_penyulang, w.ko AS w_ko, w.ke AS w_ke,
           rn.tgl AS r_tgl, rn.kunci AS r_kunci, rn.bagian AS r_bagian, rn.ulp AS r_ulp, rn.objek AS r_objek,
           rn.rincian AS r_rincian, rn.petugas AS r_petugas, rn.waktu AS r_waktu, rn.km AS r_km,
           rn.disetujui AS r_disetujui, rn.sumber AS r_sumber, rn.sumber_id AS r_sumber_id
    FROM w FULL JOIN rn ON rn.kunci = w.kunci AND rn.ko = w.ko AND rn.ke = w.ke
  ),
  hasil AS (
  SELECT
    COALESCE(p.r_tgl, b.awal) AS tgl,
    COALESCE(p.r_kunci, p.w_kunci) AS kunci,
    p.r_bagian AS bagian,
    COALESCE(p.r_ulp, b.u) AS ulp,
    COALESCE(p.r_objek, p.w_objek) AS objek,
    COALESCE(p.r_rincian, concat_ws(' · ', p.w_penyulang, NULLIF(btrim(COALESCE(p.w_ket, '')), ''), 'belum dikerjakan')) AS rincian,
    COALESCE(p.r_petugas, p.w_pelaksana) AS petugas,
    p.r_waktu AS waktu,
    COALESCE(p.r_km, p.w_km) AS km,
    COALESCE(p.r_disetujui, false) AS disetujui,
    COALESCE(p.r_sumber, 'wo') AS sumber,
    p.r_sumber_id AS sumber_id,
    -- WO
    CASE
      WHEN p.w_kunci IS NOT NULL THEN
        CASE WHEN p.w_kunci IN (SELECT k FROM km_jenis) THEN p.w_km ELSE 1 END
      -- Jenis tanpa WO berobjek & tanpa mode SLA → WO = realisasi (keputusan user 9 Nov).
      WHEN NOT EXISTS (SELECT 1 FROM w x WHERE x.kunci = p.r_kunci)
       AND NOT EXISTS (SELECT 1 FROM sla x WHERE x.kunci = p.r_kunci AND x.sla IS NOT NULL) THEN
        CASE WHEN p.r_kunci IN (SELECT k FROM km_jenis) THEN p.r_km ELSE 1 END
      ELSE NULL                                      -- di luar WO
    END AS wo,
    -- REALISASI
    CASE WHEN p.r_kunci IS NULL THEN NULL
         WHEN p.r_kunci IN (SELECT k FROM km_jenis) THEN p.r_km
         ELSE 1 END AS realisasi,
    CASE WHEN p.w_kunci IS NOT NULL THEN 'wo|' || p.w_kunci || '|' || p.w_ko || '|' || p.w_ke || '|' || b.bln
         ELSE p.r_sumber || '|' || p.r_sumber_id || '|' || COALESCE(p.r_bagian, '') || '|' || p.r_tgl::text END AS kode_sumber,
    CASE WHEN p.w_kunci IS NULL THEN 'luar' WHEN p.r_kunci IS NULL THEN 'wo' ELSE 'wo_jadi' END AS jalur
  FROM p, b
  ),
  -- Selisih SLA per jenis bermode SLA. Tab gardu: tiap baris = WO 1 (rumus),
  -- jadi yang dihitung JUMLAH BARIS; tab lain: jumlah kolom WO.
  selisih AS (
    SELECT s.kunci, s.sla,
      CASE WHEN s.kunci IN (SELECT k FROM gardu_jenis)
           THEN s.sla - (SELECT count(*) FROM hasil h WHERE h.kunci = s.kunci)
           ELSE round(s.sla - COALESCE((SELECT sum(h.wo) FROM hasil h WHERE h.kunci = s.kunci), 0), 3) END AS kurang
    FROM sla s WHERE s.sla IS NOT NULL
  ),
  penyesuaian AS (
    SELECT b.awal AS tgl, x.kunci, NULL::text AS bagian, b.u AS ulp, 'PENYESUAIAN SLA'::text AS objek,
      'WO sesuai SLA ' || x.sla || ' — selisih dengan item WO'::text AS rincian, NULL::text AS petugas,
      NULL::time AS waktu, NULL::numeric AS km, false AS disetujui, 'sla'::text AS sumber, NULL::text AS sumber_id,
      CASE WHEN x.kunci IN (SELECT k FROM gardu_jenis) THEN 1 ELSE x.kurang END AS wo,
      NULL::numeric AS realisasi,
      'sla|' || x.kunci || '|' || n.i || '|' || b.bln AS kode_sumber, 'sla'::text AS jalur
    FROM selisih x CROSS JOIN b
    CROSS JOIN LATERAL generate_series(1, CASE WHEN x.kurang <= 0 THEN 0
                                               WHEN x.kunci IN (SELECT k FROM gardu_jenis) THEN ceil(x.kurang)::int
                                               ELSE 1 END) n(i)
  )
  SELECT * FROM (SELECT * FROM hasil UNION ALL SELECT * FROM penyesuaian) z
  ORDER BY z.tgl, z.kunci, z.objek;
$fn$;

GRANT EXECUTE ON FUNCTION public.pro_ntb_baris(TEXT, INT, INT) TO authenticated;


-- ── Pemeriksaan: jumlah per jenis harus sama dengan Rekap Kinerja ───────────
--   SELECT kunci, jalur, count(*), round(sum(wo), 3) AS wo, round(sum(realisasi), 3) AS realisasi
--   FROM pro_ntb_baris('AMPENAN', 2026, 11) GROUP BY 1, 2 ORDER BY 1, 2;
