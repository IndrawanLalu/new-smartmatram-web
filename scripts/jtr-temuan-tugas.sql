-- =============================================================================
-- J5c `rencana-mobile-jtm-jtr.md` (26 Sep 2026) — web Inspeksi JTR
-- Jalankan manual di Supabase SQL Editor, SESUDAH `wo-inspeksi-jtr.sql` (J5a)
-- dan `jtm-temuan-tugas.sql`. Idempoten.
--
--   1. jtr_tiang_lengkap   — anggota JTR per gardu (milik + PINJAMAN) lengkap
--                            dengan atribut & kabel MILIK GARDU ITU dalam kolom
--                            `tiang_konduktor` — halaman web cukup ganti sumber,
--                            bentuk datanya tetap
--   2. jtr_temuan          — temuan inspeksi JTR terakhir yang DISETUJUI per
--                            gardu + status penugasannya (diturunkan)
--   3. tugaskan_temuan_jtr — "cara A" sepola JTM: satu temuan = satu baris
--                            `inspeksi` Ditugaskan (source 'inspeksi_jtr') →
--                            Monitoring Inspeksi & tugas HP eksekutor (HARJAR)
-- =============================================================================


-- ── 1. Tiang JTR lengkap ─────────────────────────────────────────────────────
CREATE OR REPLACE VIEW public.jtr_tiang_lengkap AS
SELECT
  j.id, j.kode, j.gardu_kode, j.ulp, j.jurusan, j.induk_id, j.lat, j.lng,
  j.status_hidup, j.created_at,
  j.jenis, j.tinggi, j.kondisi, j.jamperan, j.andongan, j.tarikan_sr,
  j.arde_kondisi, j.arde_nilai_ohm, j.stay_jenis, j.stay_kondisi, j.rawan_row,
  j.underbuild_tm, j.catatan_perbaikan, j.foto_temuan, j.dikonfirmasi_at,
  t.dikonfirmasi_oleh, t.aktif_sampai,
  j.menumpang, j.tumpang_id,
  COALESCE((
    SELECT jsonb_agg(jsonb_build_object(
             'nomor', k.nomor, 'jenis', k.jenis, 'ukuran', k.ukuran, 'kondisi', k.kondisi,
             'induk_tiang_id', k.induk_tiang_id, 'aks_suspension', k.aks_suspension,
             'aks_large_angle', k.aks_large_angle, 'aks_dead_end', k.aks_dead_end,
             'foto_temuan', k.foto_temuan) ORDER BY k.nomor)
    FROM public.jtr_kabel k
    WHERE k.tiang_id = j.id AND k.gardu = upper(j.gardu_kode)
  ), '[]'::jsonb) AS tiang_konduktor
FROM public.jtr_tiang j
JOIN public.tiang t ON t.id = j.id;

COMMENT ON VIEW public.jtr_tiang_lengkap IS
  'Tiang JTR per gardu (milik + pinjaman) dengan kabel milik gardu itu sebagai JSON `tiang_konduktor`. Bacaan halaman web JTR.';
GRANT SELECT ON public.jtr_tiang_lengkap TO authenticated;


-- ── 2. Temuan JTR + status penugasan ─────────────────────────────────────────
-- Keadaan TERKINI: temuan dari inspeksi terakhir yang disetujui per gardu.
-- Isian JTR menulis master tiang langsung, jadi `inspeksi_jtr_temuan` untuk
-- inspeksi itu = keadaan batang sekarang.
--
-- Alamat temuan di baris `inspeksi`: sumber_tiang_id = batang, sumber_item =
-- 'jtr:' || temuan (tidak bisa bentrok dengan kode item JTM pada batang yang
-- dipikul bersama), sumber_bagian = label tiang/kabel ("AM001-A3.2").
CREATE OR REPLACE VIEW public.jtr_temuan AS
WITH terakhir AS (
  SELECT DISTINCT ON (upper(gardu_kode), upper(ulp))
    id, inspektor_nama, tgl_mulai
  FROM public.inspeksi_jtr
  WHERE status = 'Diverifikasi'
  ORDER BY upper(gardu_kode), upper(ulp), tgl_selesai DESC NULLS LAST, created_at DESC
)
SELECT
  x.tiang_id,
  x.tiang_kode,
  upper(x.gardu_kode)                    AS gardu_kode,
  upper(x.ulp)                           AS ulp,
  COALESCE(x.penyulang, g.feeder)        AS penyulang,
  g.nama                                 AS gardu_nama,
  x.jurusan,
  x.temuan,
  x.urgensi,
  x.foto_url,
  x.inspeksi_id                          AS inspeksi_jtr_id,
  r.tgl_mulai                            AS ditemukan_pada,
  r.inspektor_nama                       AS penemu,
  t.lat,
  t.lng,
  tg.id                                  AS tugas_id,
  tg.status                              AS tugas_status,
  tg.eksekutor,
  tg.category                            AS prioritas,
  tg.assigned_at,
  tg.team_name,
  tg.foto_sesudah_url,
  CASE
    WHEN tg.id IS NULL OR tg.status = 'Batal' THEN 'Belum ditugaskan'
    -- Inspeksi yang lebih baru dari penyelesaian tugas masih menemukannya.
    WHEN tg.status = 'Selesai' AND (r.tgl_mulai::timestamp AT TIME ZONE 'Asia/Makassar') > tg.updated_at THEN 'Belum ditugaskan'
    WHEN tg.status = 'Selesai' THEN 'Selesai'
    ELSE 'Ditugaskan'
  END                                    AS status_tugas
FROM public.inspeksi_jtr_temuan x
JOIN terakhir r ON r.id = x.inspeksi_id
JOIN public.tiang t ON t.id = x.tiang_id
LEFT JOIN public.gardu g ON upper(g.kode) = upper(x.gardu_kode) AND upper(g.ulp) = upper(x.ulp)
LEFT JOIN LATERAL (
  SELECT i.id, i.status, i.eksekutor, i.category, i.assigned_at, i.team_name, i.foto_sesudah_url, i.updated_at
  FROM public.inspeksi i
  WHERE i.sumber_tiang_id = x.tiang_id
    AND i.sumber_item = 'jtr:' || x.temuan
    AND i.sumber_bagian IS NOT DISTINCT FROM x.tiang_kode
  ORDER BY i.created_at DESC
  LIMIT 1
) tg ON true;

COMMENT ON VIEW public.jtr_temuan IS
  'Temuan inspeksi JTR (inspeksi terakhir yang disetujui per gardu) + status penugasannya yang DITURUNKAN dari baris inspeksi bersumber batang itu.';
GRANT SELECT ON public.jtr_temuan TO authenticated;


-- ── 3. Menugaskan satu temuan ────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.tugaskan_temuan_jtr(
  p_tiang_id   UUID,
  p_tiang_kode TEXT,
  p_temuan     TEXT,
  p_eksekutor  TEXT,
  p_prioritas  TEXT DEFAULT 'Normal',
  p_catatan    TEXT DEFAULT NULL,
  p_nama       TEXT DEFAULT NULL
) RETURNS TEXT
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  k    RECORD;
  baru TEXT;
BEGIN
  -- Dua admin menekan bersamaan tidak boleh melahirkan dua tugas.
  PERFORM pg_advisory_xact_lock(hashtext(concat_ws('|', 'tugas-jtr', p_tiang_id, p_tiang_kode, p_temuan)));

  SELECT * INTO k FROM public.jtr_temuan
  WHERE tiang_id = p_tiang_id AND tiang_kode = p_tiang_kode AND temuan = p_temuan
  LIMIT 1;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Temuan ini tidak ada lagi — mungkin inspeksi terakhir sudah mencatatnya normal. Muat ulang daftar.';
  END IF;

  PERFORM public.wajib_boleh_ulp(k.ulp);

  IF k.status_tugas = 'Ditugaskan' THEN
    RAISE EXCEPTION 'Temuan % (%) sudah ditugaskan ke % — satu temuan satu tugas.', k.tiang_kode, k.temuan, k.eksekutor;
  END IF;
  IF k.status_tugas = 'Selesai' THEN
    RAISE EXCEPTION 'Temuan % (%) sudah dikerjakan % — tunggu inspeksi berikutnya memastikannya normal.',
      k.tiang_kode, k.temuan, k.eksekutor;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.roles WHERE code = p_eksekutor AND is_eksekutor) THEN
    RAISE EXCEPTION 'Eksekutor % tidak dikenal atau bukan regu pelaksana.', COALESCE(p_eksekutor, '-');
  END IF;
  IF p_prioritas NOT IN ('Normal', 'Scheduled', 'Urgent', 'Emergency') THEN
    RAISE EXCEPTION 'Prioritas % tidak dikenal.', COALESCE(p_prioritas, '-');
  END IF;

  INSERT INTO public.inspeksi (
    category, deskripsi, temuan, lokasi, ulp, penyulang,
    inspektor, nama_inspektor, inspektor_or_petugas,
    koordinat, foto_sebelum_url, image_url,
    status, eksekutor, assigned_at, tgl_inspeksi,
    keterangan, source, updated_by,
    sumber_tiang_id, sumber_item, sumber_bagian
  ) VALUES (
    p_prioritas,
    concat_ws(' — ', 'JTR ' || k.temuan, 'urgensi ' || lower(k.urgensi)),
    k.temuan,
    concat_ws(' · ', 'Tiang ' || k.tiang_kode, 'Gardu ' || k.gardu_kode || COALESCE(' ' || k.gardu_nama, '')),
    k.ulp,
    k.penyulang,
    k.penemu, k.penemu, k.penemu,
    CASE WHEN k.lat IS NOT NULL AND k.lng IS NOT NULL THEN k.lat || ', ' || k.lng END,
    k.foto_url, k.foto_url,
    -- Eksekutor lewat UPDATE di bawah: pemicu push notifikasi HP hanya menyala
    -- saat UPDATE yang mengisi eksekutor dari kosong (sepola tugaskan_temuan_jtm).
    'Ditugaskan', '', now(),
    k.ditemukan_pada,
    NULLIF(btrim(p_catatan), ''), 'inspeksi_jtr', p_nama,
    k.tiang_id, 'jtr:' || k.temuan, k.tiang_kode
  )
  RETURNING id INTO baru;

  UPDATE public.inspeksi SET eksekutor = p_eksekutor WHERE id = baru;
  RETURN baru;
END $$;

COMMENT ON FUNCTION public.tugaskan_temuan_jtr IS
  'Membuat tugas (baris inspeksi Ditugaskan, source inspeksi_jtr) dari satu temuan inspeksi JTR. Menolak kalau temuan itu sudah punya tugas terbuka.';
GRANT EXECUTE ON FUNCTION public.tugaskan_temuan_jtr(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT) TO authenticated;


-- ── Periksa ──────────────────────────────────────────────────────────────────
--   SELECT count(*), count(*) FILTER (WHERE menumpang) FROM jtr_tiang_lengkap WHERE status_hidup = 'aktif';
--   SELECT status_tugas, count(*) FROM jtr_temuan GROUP BY 1;
