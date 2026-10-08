-- =============================================================================
-- Temuan JTM → langsung ke REGU (8 Okt 2026). Jalankan SESUDAH
-- jtm-temuan-tugas.sql, riwayat-pekerjaan.sql, notif-temuan-jtm.sql. Idempoten.
-- =============================================================================
-- Dulu "Tugaskan" di Temuan JTM selalu membuat baris `inspeksi` (Inspeksi
-- Jaringan) dengan PERAN saja. HP regu PERABASAN membaca tugas per NAMA TIM
-- (`team_name`), jadi temuan pohon tidak pernah sampai ke RABAS 1/2/… sampai
-- admin membuka Monitoring Inspeksi dan mengisi timnya — bolak-balik.
--
-- Sekarang (keputusan user 8 Okt 2026):
--   • Temuan ROW (vegetasi) → baris `inspeksi_pohon` (tab Inspeksi Pohon), sama
--     dengan alur inspeksi pohon biasa. Temuan lain → `inspeksi` seperti dulu.
--   • Peran yang menerima tugas per regu (PERABASAN, K3) WAJIB memilih regu;
--     `team_name` terisi saat ditugaskan → langsung muncul di HP regu itu.
--   • Tingkat risiko pohon dari kategori pilihan regu inspeksi:
--     Urgent → Sangat Tinggi, Rawan → Tinggi, Biasa → Sedang (HP lama tanpa
--     kategori: menyentuh → Sangat Tinggi, berpotensi → Tinggi).
--   • WA seketika TIDAK dikirim lagi (pekerja & /api/wa-notify melewati
--     source 'inspeksi_jtm'); pengingat 08/11/15/18 tetap memuatnya.
--
--   1. Alamat temuan di inspeksi_pohon (pola kolom sumber_* di inspeksi)
--   2. jtm_temuan — status penugasan dari inspeksi ATAU inspeksi_pohon
--   3. riwayat_pekerjaan — laporan pohon dari temuan JTM tidak dihitung dua kali
--   4. tugaskan_temuan_jtm(+ p_regu)
-- =============================================================================


-- ── 1. Alamat temuan di inspeksi_pohon ───────────────────────────────────────

ALTER TABLE public.inspeksi_pohon
  ADD COLUMN IF NOT EXISTS sumber_tiang_id  UUID,
  ADD COLUMN IF NOT EXISTS sumber_item      TEXT,
  ADD COLUMN IF NOT EXISTS sumber_bagian    TEXT,
  ADD COLUMN IF NOT EXISTS sumber_sirkit_id UUID;

COMMENT ON COLUMN public.inspeksi_pohon.sumber_tiang_id IS
  'Diisi = tugas pohon dari temuan inspeksi JTM (tugaskan_temuan_jtm). NULL = laporan lepas dari HP.';

CREATE INDEX IF NOT EXISTS inspeksi_pohon_sumber_tiang_idx
  ON public.inspeksi_pohon (sumber_tiang_id, sumber_item)
  WHERE sumber_tiang_id IS NOT NULL;


-- ── 2. Daftar temuan + status penugasan (disalin dari jtm-temuan-tugas.sql, ★) ─

CREATE OR REPLACE VIEW public.jtm_temuan AS
SELECT
  k.tiang_id,
  k.tiang_kode,
  k.pemilik               AS penyulang,
  k.ulp,
  k.item_kode,
  k.item_nama,
  k.kelompok,
  CASE WHEN k.kelompok = 'ROW' THEN 'ROW' ELSE 'Jaringan' END AS jenis,
  k.bagian,
  k.sirkit_segmen_id,
  k.sirkit_nama,
  k.nilai,
  k.nilai_label,
  k.catatan,
  k.foto_url,
  k.tgl                   AS ditemukan_pada,
  k.inspeksi_id           AS inspeksi_jtm_id,
  m.petugas_nama          AS penemu,
  seg.segmen_id,
  seg.segmen_nama,
  t.lat,
  t.lng,
  tg.id                   AS tugas_id,
  tg.status               AS tugas_status,
  tg.eksekutor,
  tg.category             AS prioritas,
  tg.assigned_at,
  tg.team_name,
  tg.foto_sesudah_url,
  tg.updated_at           AS tugas_diperbarui,
  CASE
    -- ★ 'Temuan' = penugasannya dicabut di Monitoring Inspeksi (eksekutor dikosongkan).
    WHEN tg.id IS NULL OR tg.status IN ('Batal', 'Temuan') THEN 'Belum ditugaskan'
    WHEN tg.status = 'Selesai' AND k.tgl > tg.updated_at THEN 'Belum ditugaskan'
    WHEN tg.status = 'Selesai'                           THEN 'Selesai'
    ELSE 'Ditugaskan'
  END                     AS status_tugas,
  wo.nama                 AS wo_perabasan_aktif
FROM public.tiang_kondisi_terakhir k
JOIN public.tiang t ON t.id = k.tiang_id
LEFT JOIN public.inspeksi_jtm m ON m.id = k.inspeksi_id
-- Tiang bisa milik beberapa segmen (percabangan, tiang bersama); yang
-- didahulukan segmen tempat temuan itu dicatat.
LEFT JOIN LATERAL (
  SELECT s.id AS segmen_id, s.nama AS segmen_nama
  FROM public.segmen_tiang st
  JOIN public.segmen s ON s.id = st.segmen_id
  WHERE st.tiang_id = k.tiang_id AND s.status = 'aktif'
  ORDER BY (s.id = m.segmen_id) DESC NULLS LAST, s.nama
  LIMIT 1
) seg ON true
-- ★ Tugas bisa di `inspeksi` (jaringan) ATAU `inspeksi_pohon` (ROW, sejak
--   8 Okt 2026) — yang terbaru dari keduanya.
LEFT JOIN LATERAL (
  SELECT x.id, x.status, x.eksekutor, x.category, x.assigned_at, x.team_name, x.foto_sesudah_url, x.updated_at
  FROM (
    SELECT i.id, i.status, i.eksekutor, i.category, i.assigned_at, i.team_name, i.foto_sesudah_url, i.updated_at, i.created_at
    FROM public.inspeksi i
    WHERE i.sumber_tiang_id = k.tiang_id
      AND i.sumber_item = k.item_kode
      AND i.sumber_bagian IS NOT DISTINCT FROM k.bagian
      AND i.sumber_sirkit_id IS NOT DISTINCT FROM k.sirkit_segmen_id
    UNION ALL
    SELECT p.id, p.status, p.eksekutor, p.category, p.assigned_at, p.team_name, p.foto_sesudah_url, p.updated_at, p.created_at
    FROM public.inspeksi_pohon p
    WHERE p.sumber_tiang_id = k.tiang_id
      AND p.sumber_item = k.item_kode
      AND p.sumber_bagian IS NOT DISTINCT FROM k.bagian
      AND p.sumber_sirkit_id IS NOT DISTINCT FROM k.sirkit_segmen_id
  ) x
  ORDER BY x.created_at DESC
  LIMIT 1
) tg ON true
-- Vegetasi juga dihitung WO Perabasan per segmen. Penugasan tetap bebas
-- (keputusan user), tapi layar perlu tahu supaya pohon tidak dirabas dua regu.
LEFT JOIN LATERAL (
  SELECT w.nama
  FROM public.wo_perabasan_item wi
  JOIN public.wo_perabasan w ON w.id = wi.wo_id
  WHERE k.kelompok = 'ROW'
    AND wi.segmen_id = seg.segmen_id
    AND w.status = 'Terbit'
    AND wi.status NOT IN ('Diverifikasi', 'Dibatalkan')
  LIMIT 1
) wo ON true
WHERE NOT k.normal;

COMMENT ON VIEW public.jtm_temuan IS
  'Temuan inspeksi JTM (keadaan terakhir yang disetujui, bukan normal) + status penugasannya yang DITURUNKAN dari baris inspeksi bersumber tiang itu.';

GRANT SELECT ON public.jtm_temuan TO authenticated;


-- ── 3. Riwayat pekerjaan (disalin dari riwayat-pekerjaan.sql, satu ★) ────────

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
WHERE i.assigned_at IS NOT NULL;

COMMENT ON VIEW public.riwayat_pekerjaan IS
  'Riwayat pekerjaan lintas modul, kolom & status seragam (rencana-mobile-kerja-lapangan.md §10). Dibaca HP lewat riwayat_pekerjaan_saya.';
GRANT SELECT ON public.riwayat_pekerjaan TO authenticated;


-- ── 4. Menugaskan satu temuan — kini dengan regu ─────────────────────────────
-- Tanda tangan bertambah satu parameter (p_regu, bawaan NULL) → versi lama
-- dibuang dulu supaya tidak ada dua fungsi bernama sama.

DROP FUNCTION IF EXISTS public.tugaskan_temuan_jtm(UUID, TEXT, TEXT, UUID, TEXT, TEXT, TEXT, TEXT);

CREATE OR REPLACE FUNCTION public.tugaskan_temuan_jtm(
  p_tiang_id  UUID,
  p_item      TEXT,
  p_bagian    TEXT,
  p_sirkit    UUID,
  p_eksekutor TEXT,
  p_prioritas TEXT DEFAULT 'Normal',
  p_catatan   TEXT DEFAULT NULL,
  p_nama      TEXT DEFAULT NULL,
  p_regu      TEXT DEFAULT NULL
) RETURNS TEXT
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  k       RECORD;
  baru    TEXT;
  v_regu  TEXT := NULLIF(btrim(COALESCE(p_regu, '')), '');
  v_kat   TEXT;
  v_jenis TEXT;
  v_tgl   TEXT;
BEGIN
  -- Dua admin menekan bersamaan tidak boleh melahirkan dua tugas.
  PERFORM pg_advisory_xact_lock(hashtext(concat_ws('|', 'tugas-jtm', p_tiang_id, p_item, p_bagian, p_sirkit)));

  SELECT * INTO k FROM public.jtm_temuan
  WHERE tiang_id = p_tiang_id
    AND item_kode = p_item
    AND bagian IS NOT DISTINCT FROM p_bagian
    AND sirkit_segmen_id IS NOT DISTINCT FROM p_sirkit;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Temuan ini tidak ada lagi — mungkin inspeksi terakhir sudah mencatatnya normal. Muat ulang daftar.';
  END IF;

  PERFORM public.wajib_boleh_ulp(k.ulp);

  IF k.status_tugas = 'Ditugaskan' THEN
    RAISE EXCEPTION 'Temuan tiang % (%) sudah ditugaskan ke % — satu temuan satu tugas.',
      k.tiang_kode, k.item_nama, concat_ws(' · ', NULLIF(k.eksekutor, ''), k.team_name);
  END IF;
  IF k.status_tugas = 'Selesai' THEN
    RAISE EXCEPTION 'Temuan tiang % (%) sudah dikerjakan % — tunggu inspeksi berikutnya memastikannya normal.',
      k.tiang_kode, k.item_nama, concat_ws(' · ', NULLIF(k.eksekutor, ''), k.team_name);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.roles WHERE code = p_eksekutor AND is_eksekutor) THEN
    RAISE EXCEPTION 'Eksekutor % tidak dikenal atau bukan regu pelaksana.', COALESCE(p_eksekutor, '-');
  END IF;
  IF p_prioritas NOT IN ('Normal', 'Scheduled', 'Urgent', 'Emergency') THEN
    RAISE EXCEPTION 'Prioritas % tidak dikenal.', COALESCE(p_prioritas, '-');
  END IF;

  -- ★ Peran yang tugasnya dibaca HP per NAMA TIM: regu wajib dan harus terdaftar
  --   di grup peran itu, di ULP temuannya (Manajemen Petugas).
  IF upper(p_eksekutor) IN ('PERABASAN', 'K3') THEN
    IF v_regu IS NULL THEN
      RAISE EXCEPTION 'Pilih regu %: tugasnya diterima HP per regu, bukan per peran.', p_eksekutor;
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM public.petugas pt
      WHERE upper(COALESCE(pt.group_name, '')) = upper(p_eksekutor)
        AND upper(COALESCE(pt.ulp, '')) = upper(k.ulp)
        AND pt.nama = v_regu
        AND lower(COALESCE(pt.status, 'aktif')) = 'aktif'
    ) THEN
      RAISE EXCEPTION 'Regu "%" tidak terdaftar aktif di grup % ULP %.', v_regu, p_eksekutor, k.ulp;
    END IF;
  ELSE
    v_regu := NULL;  -- peran lain menerima tugas per peran; regu tidak dipakai HP
  END IF;

  v_tgl := to_char((k.ditemukan_pada AT TIME ZONE 'Asia/Makassar')::date, 'YYYY-MM-DD');

  IF k.kelompok = 'ROW' THEN
    -- ★ Temuan pohon → inspeksi_pohon (tab Inspeksi Pohon, tugas HP regu).
    SELECT kt.kategori_temuan INTO v_kat
    FROM public.jtm_kategori_temuan kt
    WHERE kt.inspeksi_id = k.inspeksi_jtm_id
      AND kt.tiang_id = k.tiang_id
      AND kt.item_kode = k.item_kode
      AND kt.bagian IS NOT DISTINCT FROM k.bagian
      AND kt.sirkit_segmen_id IS NOT DISTINCT FROM k.sirkit_segmen_id
    LIMIT 1;

    SELECT pp.jenis_pohon INTO v_jenis
    FROM public.perabasan_pohon pp
    WHERE pp.tiang_id = k.tiang_id AND NULLIF(btrim(pp.jenis_pohon), '') IS NOT NULL
    LIMIT 1;

    INSERT INTO public.inspeksi_pohon (
      deskripsi, lokasi, ulp, penyulang,
      inspektor, nama_inspektor, inspektor_or_petugas,
      koordinat, foto_sebelum_url,
      status, eksekutor, assigned_at, tgl_inspeksi,
      jenis_pohon, tingkat_risiko, category,
      keterangan, source, updated_by,
      sumber_tiang_id, sumber_item, sumber_bagian, sumber_sirkit_id
    ) VALUES (
      concat_ws(' — ',
        k.item_nama || ': ' || COALESCE(k.nilai_label, k.nilai, '?') || COALESCE(' (kategori ' || v_kat || ')', ''),
        NULLIF(btrim(k.catatan), '')),
      concat_ws(' · ', 'Tiang ' || k.tiang_kode, k.segmen_nama),
      k.ulp,
      k.penyulang,
      k.penemu, k.penemu, k.penemu,
      CASE WHEN k.lat IS NOT NULL AND k.lng IS NOT NULL THEN k.lat || ', ' || k.lng END,
      k.foto_url,
      -- Eksekutor & regu diisi lewat UPDATE di bawah: pemicu notifikasi HP
      -- menyala saat UPDATE yang mengisinya, bukan saat INSERT.
      'Ditugaskan', '', now(), v_tgl,
      v_jenis,
      CASE v_kat WHEN 'Urgent' THEN 'Sangat Tinggi' WHEN 'Rawan' THEN 'Tinggi' WHEN 'Biasa' THEN 'Sedang'
        ELSE CASE WHEN k.nilai = 'menyentuh' THEN 'Sangat Tinggi' ELSE 'Tinggi' END END,
      p_prioritas,
      NULLIF(btrim(p_catatan), ''), 'inspeksi_jtm', p_nama,
      k.tiang_id, k.item_kode, k.bagian, k.sirkit_segmen_id
    )
    RETURNING id INTO baru;

    UPDATE public.inspeksi_pohon SET eksekutor = p_eksekutor, team_name = v_regu WHERE id = baru;
    RETURN baru;
  END IF;

  INSERT INTO public.inspeksi (
    category, deskripsi, temuan, lokasi, ulp, penyulang,
    inspektor, nama_inspektor, inspektor_or_petugas,
    koordinat, foto_sebelum_url, image_url,
    status, eksekutor, assigned_at, tgl_inspeksi,
    keterangan, source, updated_by,
    sumber_tiang_id, sumber_item, sumber_bagian, sumber_sirkit_id
  ) VALUES (
    p_prioritas,
    concat_ws(' — ',
      k.item_nama || COALESCE(' (' || NULLIF(k.bagian, '-') || ')', '') || ': ' || COALESCE(k.nilai_label, k.nilai, '?'),
      NULLIF(btrim(k.catatan), '')),
    k.item_nama,
    concat_ws(' · ', 'Tiang ' || k.tiang_kode, k.segmen_nama),
    k.ulp,
    k.penyulang,
    k.penemu, k.penemu, k.penemu,
    CASE WHEN k.lat IS NOT NULL AND k.lng IS NOT NULL THEN k.lat || ', ' || k.lng END,
    k.foto_url, k.foto_url,
    'Ditugaskan', '', now(), v_tgl,
    NULLIF(btrim(p_catatan), ''), 'inspeksi_jtm', p_nama,
    k.tiang_id, k.item_kode, k.bagian, k.sirkit_segmen_id
  )
  RETURNING id INTO baru;

  UPDATE public.inspeksi SET eksekutor = p_eksekutor, team_name = v_regu WHERE id = baru;
  RETURN baru;
END $$;

COMMENT ON FUNCTION public.tugaskan_temuan_jtm IS
  'Membuat tugas dari satu temuan inspeksi JTM: ROW → inspeksi_pohon, lainnya → inspeksi; PERABASAN/K3 wajib regu (team_name). Menolak kalau temuan itu sudah punya tugas terbuka.';

GRANT EXECUTE ON FUNCTION public.tugaskan_temuan_jtm TO authenticated;


-- ── Periksa ──────────────────────────────────────────────────────────────────
--   SELECT jenis, status_tugas, count(*) FROM jtm_temuan GROUP BY 1, 2;
--   SELECT id, eksekutor, team_name, tingkat_risiko FROM inspeksi_pohon
--   WHERE source = 'inspeksi_jtm' ORDER BY created_at DESC LIMIT 5;
