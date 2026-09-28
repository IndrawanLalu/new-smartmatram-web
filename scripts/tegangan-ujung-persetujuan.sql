-- =============================================================================
-- TU-A (28 Sep 2026) — Persetujuan tegangan ujung
-- Jalankan manual di Supabase SQL Editor, SESUDAH `tegangan-ujung.sql`,
-- `tegangan-ujung-berbeban.sql`, dan `riwayat-pekerjaan.sql`. Idempoten.
--
-- Keputusan user: tegangan ujung DISETUJUI admin; sejak aturan ULP berlaku,
-- realisasi WO & tombol AMG menunggu yang DISETUJUI, bukan sekadar terkirim.
--
-- Persetujuan = kolom `verified_at`, status TETAP 'Terkirim'. Agen AMG (PC LAN
-- PLN), unduhan Excel, dan HP membaca status 'Terkirim' — status baru akan
-- membuat tegangan ujung yang sudah disetujui justru tak terbaca agen.
--
--   1. kolom verified_at / verified_by
--   2. setujui_tegangan_ujung · kembalikan_ mengosongkan persetujuan
--   3. tegangan_ujung_daftar — bahan tab web (gardu, titik ukur, tiang terjauh,
--      jarak, tegangan terendah, status tampil)
--   4. pengukuran_tanpa_ujung — beban terkirim yang belum punya tegangan ujung
--   5. realisasi WO, gerbang AMG, Riwayat: menunggu yang DISETUJUI
-- =============================================================================


-- ── 1. Kolom persetujuan ─────────────────────────────────────────────────────
ALTER TABLE public.pengukuran_tegangan_ujung
  ADD COLUMN IF NOT EXISTS verified_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS verified_by TEXT;
COMMENT ON COLUMN public.pengukuran_tegangan_ujung.verified_at IS
  'Disetujui admin. Status tetap Terkirim — yang membedakan menunggu vs disetujui adalah kolom ini.';


-- ── 2. Setujui / kembalikan ──────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.setujui_tegangan_ujung(p_id UUID, p_nama TEXT DEFAULT NULL)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  x RECORD;
BEGIN
  SELECT * INTO x FROM public.pengukuran_tegangan_ujung WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Tegangan ujung tidak ditemukan.'; END IF;
  PERFORM public.wajib_boleh_ulp(x.ulp);
  IF x.status <> 'Terkirim' THEN RAISE EXCEPTION 'Tegangan ujung ini sedang %, tidak bisa disetujui.', lower(x.status); END IF;
  IF x.verified_at IS NOT NULL THEN RAISE EXCEPTION 'Tegangan ujung ini sudah disetujui %.', COALESCE(x.verified_by, ''); END IF;
  UPDATE public.pengukuran_tegangan_ujung
  SET verified_at = now(), verified_by = p_nama, diubah_oleh = p_nama, updated_at = now()
  WHERE id = p_id;
END $$;
GRANT EXECUTE ON FUNCTION public.setujui_tegangan_ujung(UUID, TEXT) TO authenticated;

-- Dikembalikan = persetujuannya gugur; kiriman ulang menunggu persetujuan lagi.
CREATE OR REPLACE FUNCTION public.kembalikan_tegangan_ujung(p_id UUID, p_alasan TEXT, p_nama TEXT DEFAULT NULL)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  x RECORD;
  m RECORD;
BEGIN
  IF btrim(COALESCE(p_alasan, '')) = '' THEN
    RAISE EXCEPTION 'Alasan wajib diisi — petugas harus tahu apa yang diperbaiki.';
  END IF;
  SELECT * INTO x FROM public.pengukuran_tegangan_ujung WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Tegangan ujung tidak ditemukan.'; END IF;
  PERFORM public.wajib_boleh_ulp(x.ulp);
  IF x.status <> 'Terkirim' THEN RAISE EXCEPTION 'Tegangan ujung ini sudah %.', lower(x.status); END IF;
  SELECT amg_queued_at, amg_sent_at INTO m FROM public.pengukuran_gardu WHERE id = x.pengukuran_id;
  IF m.amg_sent_at IS NOT NULL OR m.amg_queued_at IS NOT NULL THEN
    RAISE EXCEPTION 'Pengukuran gardu % sudah masuk antrean/terkirim ke AMG — tegangan ujungnya tidak bisa dikembalikan.', x.gardu_kode;
  END IF;
  UPDATE public.pengukuran_tegangan_ujung
  SET status = 'Dikembalikan', alasan = btrim(p_alasan), verified_at = NULL, verified_by = NULL,
      diubah_oleh = p_nama, updated_at = now()
  WHERE id = p_id;
END $$;


-- ── 3. Bahan tab web ─────────────────────────────────────────────────────────
-- Tegangan terendah & "di bawah standar" (< 198 V = 220 V −10%) dihitung di
-- sini supaya tabel, saringan, dan ekspor memakai angka yang sama.
CREATE OR REPLACE VIEW public.tegangan_ujung_daftar
WITH (security_invoker = true) AS
SELECT
  u.id, u.pengukuran_id, u.gardu_kode, u.ulp, u.jurusan,
  u.v_rn, u.v_sn, u.v_tn, least(u.v_rn, u.v_sn, u.v_tn) AS v_min,
  least(u.v_rn, u.v_sn, u.v_tn) < 198 AS di_bawah_standar,
  u.lat, u.lng, u.akurasi_m, u.foto_url, u.tgl_ukur, u.jam_ukur, u.petugas_nama,
  u.status, u.alasan, u.verified_at, u.verified_by, u.created_at,
  CASE WHEN u.status = 'Terkirim' AND u.verified_at IS NOT NULL THEN 'Disetujui'
       WHEN u.status = 'Terkirim' THEN 'Menunggu verifikasi' ELSE u.status END AS status_tampil,
  g.nama AS gardu_nama, g.feeder AS penyulang,
  g.lat::double precision AS gardu_lat, g.lng::double precision AS gardu_lng,
  CASE WHEN g.lat IS NOT NULL AND g.lng IS NOT NULL
       THEN round(public.jarak_meter(u.lat, u.lng, g.lat::double precision, g.lng::double precision)::numeric, 0) END AS jarak_gardu_m,
  u.tiang_rekomendasi_id, t.kode AS tiang_rekomendasi_kode,
  t.lat::double precision AS tiang_lat, t.lng::double precision AS tiang_lng,
  u.jarak_rekomendasi_m, u.panjang_jaringan_m,
  p.tanggal_pengukuran AS tgl_beban, p.amg_sent_at, p.amg_queued_at
FROM public.pengukuran_tegangan_ujung u
LEFT JOIN public.gardu g ON upper(g.kode) = upper(u.gardu_kode) AND upper(g.ulp) = upper(u.ulp)
LEFT JOIN public.tiang t ON t.id = u.tiang_rekomendasi_id
LEFT JOIN public.pengukuran_gardu p ON p.id = u.pengukuran_id;
GRANT SELECT ON public.tegangan_ujung_daftar TO authenticated;


-- ── 4. Beban terkirim tanpa tegangan ujung ───────────────────────────────────
CREATE OR REPLACE VIEW public.pengukuran_tanpa_ujung
WITH (security_invoker = true) AS
SELECT p.id, p.no_gardu, upper(p.petugas_unit) AS ulp, p.penyulang, p.tanggal_pengukuran, p.petugas_nama,
       g.nama AS gardu_nama
FROM public.pengukuran_gardu p
LEFT JOIN public.gardu g ON upper(g.kode) = upper(p.no_gardu) AND upper(g.ulp) = upper(p.petugas_unit)
WHERE p.hasil_penyeimbangan_id IS NULL
  AND p.dikembalikan_at IS NULL
  AND NOT EXISTS (SELECT 1 FROM public.pengukuran_tegangan_ujung x
                  WHERE x.pengukuran_id = p.id AND x.status <> 'Dibatalkan');
GRANT SELECT ON public.pengukuran_tanpa_ujung TO authenticated;


-- ── 5. Realisasi WO · gerbang AMG · Riwayat ──────────────────────────────────
CREATE OR REPLACE VIEW public.wo_pengukuran_realisasi AS
SELECT i.id,
    i.wo_id,
    i.kode_gardu,
    i.ulp,
    i.nama,
    i.alamat,
    i.penyulang,
    i.kva_master,
    i.lat,
    i.lng,
    i.alasan,
    i.tgl_ukur_terakhir,
    i.umur_bulan,
    i.urutan,
    w.bulan,
    w.tahun,
    w.tgl_wo,
    p.id AS pengukuran_id,
    p.tanggal_pengukuran AS tgl_realisasi,
    p.petugas_nama,
    p.persen_beban,
    p.beban_kva,
    p.kva_trafo AS kva_pengukuran,
    p.id IS NOT NULL AND t.pengukuran_id IS NULL AND (NOT a.berlaku OR u.ada) AS terealisasi,
    t.pengukuran_id IS NOT NULL AS tertahan,
    COALESCE(t.titik_diperbarui, false) AS tertahan_titik,
    COALESCE(t.beda_kva, false) AS tertahan_kva,
    a.berlaku AS wajib_tegangan_ujung,
    COALESCE(u.ada, false) AS tegangan_ujung_ada,
    p.id IS NOT NULL AND t.pengukuran_id IS NULL AND a.berlaku AND NOT COALESCE(u.ada, false) AS menunggu_tegangan_ujung
   FROM wo_pengukuran_item i
     JOIN wo_pengukuran w ON w.id = i.wo_id
     CROSS JOIN LATERAL (SELECT public.tegangan_ujung_berlaku(i.ulp, w.tgl_wo::date) AS berlaku) a
     LEFT JOIN LATERAL ( SELECT pg.id,
            pg.tanggal_pengukuran,
            pg.petugas_nama,
            pg.persen_beban,
            pg.beban_kva,
            pg.kva_trafo
           FROM pengukuran_gardu pg
          WHERE upper(pg.no_gardu) = upper(i.kode_gardu) AND upper(pg.petugas_unit) = upper(i.ulp) AND pg.tanggal_pengukuran >= to_char(w.tgl_wo::timestamp with time zone, 'YYYY-MM-DD'::text) AND pg.tanggal_pengukuran < to_char(w.tgl_wo + '1 mon'::interval, 'YYYY-MM-DD'::text) AND pg.hasil_penyeimbangan_id IS NULL AND pg.dikembalikan_at IS NULL
          ORDER BY pg.tanggal_pengukuran
         LIMIT 1) p ON true
     LEFT JOIN LATERAL (SELECT EXISTS (
            SELECT 1 FROM public.pengukuran_tegangan_ujung x
            WHERE x.pengukuran_id = p.id AND x.status = 'Terkirim' AND x.verified_at IS NOT NULL) AS ada) u ON true
     LEFT JOIN pengukuran_tertahan t ON t.pengukuran_id = p.id;


CREATE OR REPLACE FUNCTION public.tahan_amg(p_ids TEXT[])
RETURNS TABLE (id TEXT, no_gardu TEXT, alasan TEXT)
LANGUAGE sql STABLE SET search_path = public AS $$
  SELECT m.id, m.no_gardu,
         CASE WHEN EXISTS (SELECT 1 FROM public.pengukuran_tegangan_ujung x
                           WHERE x.pengukuran_id = m.id AND x.status = 'Terkirim')
              THEN 'Tegangan ujung gardu ini belum disetujui — setujui dulu di tab Tegangan Ujung.'
              ELSE 'Tegangan ujung gardu ini belum dikirim petugas — AMG menunggu tegangan ujung.' END
  FROM public.pengukuran_gardu m
  WHERE m.id = ANY (p_ids)
    AND m.hasil_penyeimbangan_id IS NULL
    AND public.tegangan_ujung_berlaku(m.petugas_unit, m.tanggal_pengukuran::date)
    AND NOT EXISTS (SELECT 1 FROM public.pengukuran_tegangan_ujung x
                    WHERE x.pengukuran_id = m.id AND x.status = 'Terkirim' AND x.verified_at IS NOT NULL);
$$;


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
  CASE WHEN u.status = 'Terkirim' AND u.verified_at IS NOT NULL THEN 'Diterima'
       WHEN u.status = 'Terkirim' THEN 'Menunggu verifikasi' ELSE u.status END,
  CASE WHEN u.status = 'Terkirim' AND u.verified_at IS NOT NULL THEN 'Disetujui' ELSE u.status END, u.alasan, u.petugas_nama, NULL, NULL, u.foto_url, u.lat, u.lng
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

GRANT SELECT ON public.riwayat_pekerjaan TO authenticated;


-- ── Periksa ──────────────────────────────────────────────────────────────────
--   SELECT status_tampil, count(*) FROM tegangan_ujung_daftar GROUP BY 1;
--   SELECT count(*) FILTER (WHERE terealisasi) FROM wo_pengukuran_realisasi;  -- sama dengan sebelum skrip
