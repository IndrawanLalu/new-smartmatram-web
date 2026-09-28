-- =============================================================================
-- R1 `rencana-mobile-kerja-lapangan.md` §10 (28 Sep 2026) — Riwayat pekerjaan
-- Jalankan manual di Supabase SQL Editor, SESUDAH `tegangan-ujung.sql`.
-- Idempoten. Hanya-baca: tidak mengubah tabel mana pun.
--
--   1. riwayat_pekerjaan          — satu view, 13 cabang UNION ALL, kolom seragam
--   2. riwayat_pekerjaan_saya(...) — yang dibaca HP: cakupan dari sesi (b),
--                                   rentang ≤ 3 bulan (d), jenis menurut menu
--                                   role, keyset 20 baris + jumlah total
--
-- Status seragam enam label (c + f): Belum dikirim (HANYA di HP — draf) ·
-- Sedang dikerjakan · Menunggu verifikasi · Diterima · Dikembalikan · Dibatalkan.
-- `status_asli` ikut, supaya lembar rincian bisa menyebut status modulnya.
--
-- Kode `jenis` (label layar di HP):
--   hargardu Pemeliharaan Gardu · pengukuran Pengukuran Gardu · ujung Tegangan
--   Ujung · optimasi Optimasi Trafo · perabasan Perabasan · rabas_luar Perabasan
--   (luar WO) · harjar Pemeliharaan Jaringan · penyeimbangan Penyeimbangan Beban ·
--   jtm Inspeksi JTM · jtr Inspeksi JTR · laporan Laporan Temuan · tugas Tugas Temuan
-- =============================================================================


-- ── 1. View gabungan ─────────────────────────────────────────────────────────
-- Tanggal & jam dalam WITA. Yang tersimpan sebagai cap waktu dipotong ke
-- tanggal WITA; yang tersimpan sebagai teks diambil 10 huruf pertamanya (data
-- asli diperiksa 28 Sep 2026: 0 nilai janggal) — tetap dijaga pola supaya satu
-- nilai rusak kelak tidak menjatuhkan seluruh view.
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
  m.status, m.verified_note, m.petugas_nama, NULL, sp.panjang_pakai_km, NULL, NULL, NULL
FROM public.inspeksi_jtm m
LEFT JOIN public.segmen sg ON sg.id = m.segmen_id
LEFT JOIN public.segmen_panjang sp ON sp.segmen_id = m.segmen_id

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
WHERE i.assigned_at IS NOT NULL;

COMMENT ON VIEW public.riwayat_pekerjaan IS
  'Riwayat pekerjaan lintas modul, kolom & status seragam (rencana-mobile-kerja-lapangan.md §10). Dibaca HP lewat riwayat_pekerjaan_saya.';
GRANT SELECT ON public.riwayat_pekerjaan TO authenticated;


-- ── 2. Bacaan HP ─────────────────────────────────────────────────────────────
-- Cakupan dibaca dari sesi, bukan dipercaya dari HP (b):
--   regu (roles.is_eksekutor)  → tim login (p_tim) di ULP akun
--   admin / inspektor / lainnya → se-ULP akun
--   UP3 (roles.sees_all_units)  → semua ULP, atau p_ulp
-- Nama tim tidak diketahui server (dipilih saat login), jadi p_tim WAJIB untuk
-- regu — tanpanya fungsi menolak, bukan memulangkan se-ULP.
--
-- Jenis mengikuti `roles.menus` (sama dengan gerbang menu HP); Tugas Temuan
-- untuk regu eksekutor, admin, dan UP3.
--
-- Paginasi KEYSET (tgl, waktu, jenis, sumber_id) turun: p_setelah = baris
-- terakhir halaman sebelumnya {tgl, waktu, jenis, sumber_id}. Tidak bergeser
-- walau ada kiriman baru di tengah menggulir. `total` = seluruh baris saringan.
CREATE OR REPLACE FUNCTION public.riwayat_pekerjaan_saya(
  p_dari     DATE,
  p_sampai   DATE,
  p_tim      TEXT    DEFAULT NULL,
  p_jenis    TEXT[]  DEFAULT NULL,
  p_status   TEXT[]  DEFAULT NULL,
  p_ulp      TEXT    DEFAULT NULL,
  p_setelah  JSONB   DEFAULT NULL,
  p_batas    INT     DEFAULT 20
) RETURNS TABLE (
  jenis TEXT, sumber_id TEXT, ulp TEXT, tgl DATE, waktu TIME, objek TEXT, keterangan TEXT,
  status TEXT, status_asli TEXT, alasan TEXT, petugas TEXT, petugas_lain TEXT, km NUMERIC,
  foto_url TEXT, lat DOUBLE PRECISION, lng DOUBLE PRECISION, total BIGINT
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_role   TEXT;
  v_unit   TEXT;
  r        RECORD;
  boleh    TEXT[];
  v_ulp    TEXT;
  v_tim    TEXT := NULLIF(upper(btrim(COALESCE(p_tim, ''))), '');
  s_tgl    DATE := NULLIF(p_setelah->>'tgl', '')::date;
  s_waktu  TIME := COALESCE(NULLIF(p_setelah->>'waktu', '')::time, '00:00');
  s_jenis  TEXT := COALESCE(p_setelah->>'jenis', '');
  s_id     TEXT := COALESCE(p_setelah->>'sumber_id', '');
BEGIN
  SELECT ur.role, ur.unit INTO v_role, v_unit FROM public.user_roles ur WHERE ur.user_id = auth.uid();
  IF v_role IS NULL THEN
    RAISE EXCEPTION 'Sesi tidak dikenali server. Keluar lalu masuk lagi.';
  END IF;
  IF p_dari IS NULL OR p_sampai IS NULL OR p_sampai < p_dari THEN
    RAISE EXCEPTION 'Rentang tanggal tidak sah.';
  END IF;
  IF p_sampai > (p_dari + INTERVAL '3 months')::date THEN
    RAISE EXCEPTION 'Rentang paling lama 3 bulan — persempit tanggalnya.';
  END IF;

  -- roles.menus = TEXT[] (roles-schema.sql), BUKAN jsonb — perbaikan 28 Sep 2026.
  SELECT rl.is_eksekutor, rl.sees_all_units, COALESCE(rl.menus, '{}'::text[]) AS menus
    INTO r FROM public.roles rl WHERE rl.code = v_role;

  -- Jenis yang boleh: dari menu role.
  SELECT array_agg(DISTINCT j) INTO boleh FROM (
    SELECT unnest(CASE m
      WHEN 'hargardu'        THEN ARRAY['hargardu']
      WHEN 'pengukuranGardu' THEN ARRAY['pengukuran', 'ujung']
      WHEN 'optimasiTrafo'   THEN ARRAY['optimasi']
      WHEN 'perabasan'       THEN ARRAY['perabasan', 'rabas_luar']
      WHEN 'harjar'          THEN ARRAY['harjar']
      WHEN 'penyeimbangan'   THEN ARRAY['penyeimbangan']
      WHEN 'jtm'             THEN ARRAY['jtm']
      WHEN 'jtr'             THEN ARRAY['jtr']
      WHEN 'inspeksi'        THEN ARRAY['laporan']
    END) AS j
    FROM unnest(COALESCE(r.menus, '{}'::text[])) m
    UNION ALL
    SELECT 'tugas' WHERE COALESCE(r.is_eksekutor, false) OR v_role IN ('UP3', 'admin')
  ) x WHERE j IS NOT NULL;
  IF p_jenis IS NOT NULL THEN
    boleh := ARRAY(SELECT unnest(boleh) INTERSECT SELECT unnest(p_jenis));
  END IF;

  IF COALESCE(r.sees_all_units, false) OR v_role = 'UP3' THEN
    v_ulp := NULLIF(upper(btrim(COALESCE(p_ulp, ''))), '');
  ELSE
    v_ulp := upper(COALESCE(v_unit, ''));
  END IF;

  IF COALESCE(r.is_eksekutor, false) AND v_tim IS NULL THEN
    RAISE EXCEPTION 'Nama tim belum diketahui — keluar lalu masuk lagi dan pilih tim.';
  END IF;

  RETURN QUERY
  WITH f AS (
    SELECT v.* FROM public.riwayat_pekerjaan v
    WHERE v.tgl BETWEEN p_dari AND p_sampai
      AND v.jenis = ANY (COALESCE(boleh, '{}'))
      AND (v_ulp IS NULL OR v.ulp = v_ulp)
      AND (NOT COALESCE(r.is_eksekutor, false)
           OR upper(btrim(COALESCE(v.petugas, ''))) = v_tim
           OR upper(btrim(COALESCE(v.petugas_lain, ''))) = v_tim)
      AND (p_status IS NULL OR v.status = ANY (p_status))
  ), n AS (SELECT count(*) AS total FROM f)
  SELECT f.jenis, f.sumber_id, f.ulp, f.tgl, f.waktu, f.objek, f.keterangan, f.status, f.status_asli,
         f.alasan, f.petugas, f.petugas_lain, f.km, f.foto_url, f.lat, f.lng, n.total
  FROM f CROSS JOIN n
  WHERE s_tgl IS NULL
     OR (f.tgl, COALESCE(f.waktu, '00:00'::time), f.jenis, f.sumber_id) < (s_tgl, s_waktu, s_jenis, s_id)
  ORDER BY f.tgl DESC, COALESCE(f.waktu, '00:00'::time) DESC, f.jenis DESC, f.sumber_id DESC
  LIMIT LEAST(GREATEST(COALESCE(p_batas, 20), 1), 100);
END $$;

GRANT EXECUTE ON FUNCTION public.riwayat_pekerjaan_saya(DATE, DATE, TEXT, TEXT[], TEXT[], TEXT, JSONB, INT) TO authenticated;


-- ── Periksa ──────────────────────────────────────────────────────────────────
--   SELECT jenis, status, count(*) FROM riwayat_pekerjaan
--   WHERE tgl >= CURRENT_DATE - 30 GROUP BY 1, 2 ORDER BY 1, 2;
