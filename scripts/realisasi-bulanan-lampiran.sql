-- ════════════════════════════════════════════════════════════════════════════
-- Realisasi Bulanan — lampiran tagihan (16 Okt 2026)
-- ════════════════════════════════════════════════════════════════════════════
-- `realisasi_rentang` diberi kolom `sumber` (nama tabel) + `sumber_id` (id baris: wo_perabasan_item,
-- perabasan_luar_wo, pemeliharaan_jaringan, pemeliharaan_gardu,
-- penyeimbangan_gardu, optimasi_trafo, pengukuran_gardu,
-- pengukuran_tegangan_ujung, inspeksi_jtm, inspeksi_jtr, wo_manual_item).
-- JTM Tier 2 datang dari DUA tabel (inspeksi_jtm & wo_manual_item), karena itu
-- id saja tidak cukup. Realisasi Bulanan membaca rincian tiap modul BERDASARKAN id ini, supaya isi
-- lampiran = himpunan yang dihitung (rencana-lampiran-tagihan.md).
--
-- Aturan hitung TIDAK berubah — salinan realisasi-rentang.sql (7 Okt) + satu
-- dua kolom di belakang. realisasi_harian / realisasi_bulanan memanggil kolom
-- bernama, jadi tidak perlu dibuat ulang. Hanya-baca. Idempoten.
-- Jalankan manual di Supabase SQL Editor.
-- ════════════════════════════════════════════════════════════════════════════

DROP FUNCTION IF EXISTS public.realisasi_rentang(TEXT, DATE, DATE);
CREATE FUNCTION public.realisasi_rentang(p_ulp TEXT, p_dari DATE, p_sampai DATE)
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
    sp.panjang_pakai_km, (m.status = 'Diverifikasi'), 'inspeksi_jtm', m.id::text
  FROM public.inspeksi_jtm m
  LEFT JOIN public.segmen sg ON sg.id = m.segmen_id
  LEFT JOIN public.segmen_panjang sp ON sp.segmen_id = m.segmen_id
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

-- ── Periksa ──────────────────────────────────────────────────────────────────
-- Tidak ada baris tanpa sumber_id (harus 0):
--   SELECT kunci, count(*) FROM realisasi_rentang('SEMUA', '2026-10-01', '2026-10-31')
--   WHERE sumber_id IS NULL GROUP BY 1;
-- Harian tetap sama (harus 0 baris):
--   (SELECT * FROM realisasi_harian('SEMUA', current_date))
--   EXCEPT ALL
--   (SELECT kunci, bagian, ulp, objek, rincian, petugas, waktu, km, disetujui
--      FROM realisasi_rentang('SEMUA', current_date, current_date));
