-- ════════════════════════════════════════════════════════════════════════════
-- Realisasi harian Rekap Kinerja (6 Okt 2026)
-- ⚠ DIGANTIKAN scripts/realisasi-rentang.sql (7 Okt 2026): aturan yang sama kini
--   tinggal di realisasi_rentang, dan realisasi_harian jadi pembungkusnya.
--   Berkas ini disimpan sebagai sejarah — jangan dijalankan lagi.
-- ════════════════════════════════════════════════════════════════════════════
-- Tab "Realisasi Harian" di /admin/kinerja-yantek + teks WA. Satu baris = satu
-- pekerjaan yang DIKIRIM regu pada tanggal itu, dipetakan ke kunci baris Rekap
-- Kinerja (urutan surat WO). Yang belum disetujui IKUT dihitung (keputusan
-- user), dengan penanda `disetujui`.
--
-- Tidak dihitung: dibatalkan, dikembalikan, masih dikerjakan (belum dikirim).
-- Modul tanpa tahap persetujuan (penyeimbangan, centang Tier 2 / Inspeksi
-- Gardu) = disetujui. Pengukuran = disetujui kecuali tertahan menunggu
-- persetujuan usulan titik/kVA.
--
-- Tanggal mengikuti `riwayat_pekerjaan` (WITA), kecuali dua yang KMS-nya akan
-- terhitung ganda kalau diikuti per hari kerja:
--   perabasan  KMS segmen dihitung pada `tgl_selesai` itemnya (bukan tiap hari
--              menebang); jumlah pohonnya ikut sebagai rincian.
--   jtr        KMS = panjang penghantar gardu (sama dengan Rekap Kinerja).
-- `bagian`: NULL = pekerjaan utama baris itu; 'luar' = perabasan di luar WO;
-- 'ujung' = tegangan ujung (baris Pengukuran) — dihitung terpisah di layar.
--
-- Hanya-baca, security invoker (RLS tabel asal berlaku). Idempoten.
-- ════════════════════════════════════════════════════════════════════════════

DROP FUNCTION IF EXISTS public.realisasi_harian(TEXT, DATE);
CREATE FUNCTION public.realisasi_harian(p_ulp TEXT, p_tgl DATE)
RETURNS TABLE (kunci TEXT, bagian TEXT, ulp TEXT, objek TEXT, rincian TEXT, petugas TEXT,
               waktu TIME, km NUMERIC, disetujui BOOLEAN)
LANGUAGE sql STABLE SET search_path = public AS $fn$
WITH u AS (SELECT NULLIF(NULLIF(upper(btrim(COALESCE(p_ulp, ''))), ''), 'SEMUA') AS v),
semua AS (
  -- Perabasan (WO): segmen yang SELESAI dirabas hari itu.
  SELECT 'perabasan'::text AS kunci, NULL::text AS bagian, upper(w.ulp) AS ulp,
    i.segmen_nama::text AS objek,
    concat_ws(' · ', i.penyulang,
      (SELECT count(*) FROM public.perabasan_realisasi r WHERE r.item_id = i.id) || ' pohon')::text AS rincian,
    COALESCE(i.regu, i.pelaksana)::text AS petugas, NULL::time AS waktu,
    i.panjang_km::numeric AS km, (i.status = 'Diverifikasi') AS disetujui
  FROM public.wo_perabasan_item i JOIN public.wo_perabasan w ON w.id = i.wo_id
  WHERE i.tgl_selesai = p_tgl AND i.status IN ('Selesai', 'Diverifikasi') AND w.status <> 'Dibatalkan'

  UNION ALL  -- Perabasan di luar WO (dihitung ke ULP regu, sama dengan Rekap Kinerja)
  SELECT 'perabasan', 'luar', upper(COALESCE(l.ulp_regu, l.ulp)),
    concat_ws(' · ', l.penyulang, NULLIF(l.lokasi, '')), concat_ws(' · ', 'Di luar WO', l.jenis_pohon),
    l.regu, (l.created_at AT TIME ZONE 'Asia/Makassar')::time, NULL, (l.status = 'Diverifikasi')
  FROM public.perabasan_luar_wo l
  WHERE l.tgl = p_tgl AND l.status IN ('Selesai', 'Diverifikasi')

  UNION ALL  -- Pemeliharaan Jaringan
  SELECT 'harjtm', NULL, upper(j.ulp), concat_ws(' · ', j.jenis, j.penyulang), j.pekerjaan,
    j.petugas_nama, (j.created_at AT TIME ZONE 'Asia/Makassar')::time, NULL, (j.status = 'Diverifikasi')
  FROM public.pemeliharaan_jaringan j
  WHERE j.tgl::date = p_tgl AND j.status IN ('Selesai', 'Diverifikasi')

  UNION ALL  -- Pemeliharaan Gardu
  SELECT 'hargardu', NULL, upper(g.ulp), g.gardu_kode, g.penyulang, g.petugas_nama,
    (COALESCE(g.tgl_selesai, g.tgl_padam, g.created_at) AT TIME ZONE 'Asia/Makassar')::time, NULL,
    (g.status = 'Diverifikasi')
  FROM public.pemeliharaan_gardu g
  WHERE (COALESCE(g.tgl_selesai, g.tgl_padam, g.created_at) AT TIME ZONE 'Asia/Makassar')::date = p_tgl
    AND g.status IN ('Selesai', 'Diverifikasi')

  UNION ALL  -- Penyeimbangan Beban (tanpa tahap persetujuan; 'Dikerjakan' = belum selesai)
  SELECT 'penyeimbangan', NULL, upper(s.ulp), s.no_gardu,
    concat_ws(' · ', s.penyulang,
      CASE WHEN s.beban_pct_after IS NOT NULL
           THEN 'beban ' || round(s.beban_pct_before::numeric, 0) || '% → ' || round(s.beban_pct_after::numeric, 0) || '%' END),
    s.petugas_penyeimbang, (s.created_at AT TIME ZONE 'Asia/Makassar')::time, NULL, true
  FROM public.penyeimbangan_gardu s
  WHERE CASE WHEN s.tgl_penyeimbangan::text ~ '^\d{4}-\d{2}-\d{2}' THEN left(s.tgl_penyeimbangan::text, 10)::date
             ELSE (s.created_at AT TIME ZONE 'Asia/Makassar')::date END = p_tgl
    AND s.status IS DISTINCT FROM 'Dikerjakan'

  UNION ALL  -- Optimasi Trafo
  SELECT 'optimasi', NULL, upper(o.ulp), o.kode_gardu,
    concat_ws(' · ', o.penyulang, o.kva_lama || ' → ' || o.kva_baru || ' kVA'),
    o.petugas_nama, NULL, NULL, (o.status = 'Diverifikasi')
  FROM public.optimasi_trafo o
  WHERE o.tgl_operasi::date = p_tgl AND o.status IN ('Selesai', 'Diverifikasi') AND o.dikembalikan_at IS NULL

  UNION ALL  -- Pengukuran beban gardu
  SELECT 'pengukuran', NULL, upper(p.petugas_unit), p.no_gardu,
    concat_ws(' · ', p.penyulang, 'beban ' || round(p.persen_beban::numeric, 0) || '%'),
    p.petugas_nama,
    CASE WHEN p.jam_pengukuran::text ~ '^\d{2}:\d{2}' THEN left(p.jam_pengukuran::text, 5)::time END,
    NULL, NOT EXISTS (SELECT 1 FROM public.pengukuran_tertahan t WHERE t.pengukuran_id = p.id)
  FROM public.pengukuran_gardu p
  WHERE p.hasil_penyeimbangan_id IS NULL AND p.dikembalikan_at IS NULL
    AND CASE WHEN p.tanggal_pengukuran::text ~ '^\d{4}-\d{2}-\d{2}' THEN left(p.tanggal_pengukuran::text, 10)::date
             ELSE (p.created_at AT TIME ZONE 'Asia/Makassar')::date END = p_tgl

  UNION ALL  -- Tegangan ujung (baris Pengukuran)
  SELECT 'pengukuran', 'ujung', upper(t.ulp), t.gardu_kode, 'Jurusan ' || t.jurusan,
    t.petugas_nama, t.jam_ukur, NULL, (t.verified_at IS NOT NULL)
  FROM public.pengukuran_tegangan_ujung t
  WHERE t.tgl_ukur = p_tgl AND t.status = 'Terkirim'

  UNION ALL  -- Inspeksi JTM (tanggal = dikirim, sama dengan Rekap Kinerja)
  SELECT CASE WHEN m.tier = '2' THEN 'jtm2' ELSE 'jtm' END, NULL, upper(m.ulp),
    COALESCE(sg.nama, 'segmen'), m.penyulang, m.petugas_nama,
    (COALESCE(m.tgl_selesai, m.created_at) AT TIME ZONE 'Asia/Makassar')::time,
    sp.panjang_pakai_km, (m.status = 'Diverifikasi')
  FROM public.inspeksi_jtm m
  LEFT JOIN public.segmen sg ON sg.id = m.segmen_id
  LEFT JOIN public.segmen_panjang sp ON sp.segmen_id = m.segmen_id
  WHERE (COALESCE(m.tgl_selesai, m.created_at) AT TIME ZONE 'Asia/Makassar')::date = p_tgl
    AND m.status IN ('Selesai', 'Diverifikasi')

  UNION ALL  -- Inspeksi JTR
  SELECT 'jtr', NULL, upper(r.ulp), upper(r.gardu_kode), r.penyulang, r.inspektor_nama,
    (COALESCE(r.updated_at, r.created_at) AT TIME ZONE 'Asia/Makassar')::time,
    (SELECT round(sum(g.panjang_km)::numeric, 3) FROM public.gardu_jtr_penghantar g
      WHERE g.gardu_kode = r.gardu_kode AND g.ulp = r.ulp),
    (r.status = 'Diverifikasi')
  FROM public.inspeksi_jtr r
  WHERE COALESCE(r.tgl_selesai, r.tgl_mulai, (r.created_at AT TIME ZONE 'Asia/Makassar')::date) = p_tgl
    AND r.status IN ('Selesai', 'Diverifikasi')

  UNION ALL  -- Dicentang di web: JTM Tier 2 & Inspeksi Gardu (tempelan WO)
  SELECT m.jenis, NULL, upper(m.ulp), i.objek, COALESCE(i.uraian, i.alamat),
    i.selesai_oleh, NULL, CASE WHEN m.jenis = 'jtm2' THEN i.km END, true
  FROM public.wo_manual_item i JOIN public.wo_manual m ON m.id = i.wo_id
  WHERE i.selesai_tgl = p_tgl AND m.jenis IN ('jtm2', 'igardu1', 'igardu2')
)
SELECT s.* FROM semua s, u
WHERE u.v IS NULL OR s.ulp = u.v
ORDER BY s.ulp, s.kunci, s.bagian NULLS FIRST, s.waktu NULLS LAST, s.objek;
$fn$;

COMMENT ON FUNCTION public.realisasi_harian(TEXT, DATE) IS
  'Pekerjaan yang dikirim regu pada satu tanggal (WITA), per kunci baris Rekap Kinerja, termasuk yang belum disetujui. Dibaca tab Realisasi Harian.';
GRANT EXECUTE ON FUNCTION public.realisasi_harian(TEXT, DATE) TO authenticated;

-- ── Periksa ──────────────────────────────────────────────────────────────────
--   SELECT kunci, bagian, count(*), sum(km), count(*) FILTER (WHERE disetujui)
--   FROM realisasi_harian('AMPENAN', current_date) GROUP BY 1, 2 ORDER BY 1, 2;
