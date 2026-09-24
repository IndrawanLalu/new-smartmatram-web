-- =============================================================================
-- Temuan Inspeksi JTM → penugasan ke eksekutor ("cara A", disetujui 24 Sep 2026)
-- Jalankan SESUDAH `jtm-temuan.sql` dan `wo-perabasan.sql`. Idempoten.
--
-- ── MASALAHNYA ──────────────────────────────────────────────────────────────
-- Temuan penyapuan JTM hidup di `tiang_kondisi_terakhir` dan tidak pernah
-- sampai ke regu mana pun: tidak masuk Monitoring Inspeksi, tidak muncul di
-- tugas HP. Temuannya tercatat rapi lalu diam.
--
-- ── CARA A ──────────────────────────────────────────────────────────────────
-- Menugaskan sebuah temuan = membuat SATU baris `inspeksi` berstatus
-- Ditugaskan dengan eksekutor pilihan admin (bebas: HARJAR, PERABASAN, …,
-- termasuk temuan ROW). Baris itu lalu mengalir lewat jalur yang sudah ada:
-- Monitoring Inspeksi, tugas HP per eksekutor, notifikasi penugasan.
--
-- Baris `inspeksi` membawa ALAMAT temuannya (tiang, item, bagian, sirkit).
-- Dari situ status tiap temuan DITURUNKAN, tidak disimpan:
--
--   Belum ditugaskan  tidak ada tugas, tugasnya Batal, ATAU inspeksi yang lebih
--                     baru dari penyelesaian tugas masih menemukannya rusak
--   Ditugaskan        tugasnya masih terbuka (Ditugaskan/Dalam Proses/…)
--   Selesai           tugasnya Selesai; baris hilang sendiri begitu inspeksi
--                     berikutnya mencatat itemnya normal
-- =============================================================================


-- ── 1. Alamat temuan pada baris inspeksi ─────────────────────────────────────
-- Empat kolom = kunci partisi `tiang_kondisi_terakhir`. Kurang satu saja,
-- dua isolator di sirkit berbeda pada tiang yang sama jadi satu temuan.

ALTER TABLE public.inspeksi
  ADD COLUMN IF NOT EXISTS sumber_tiang_id  UUID,
  ADD COLUMN IF NOT EXISTS sumber_item      TEXT,
  ADD COLUMN IF NOT EXISTS sumber_bagian    TEXT,
  ADD COLUMN IF NOT EXISTS sumber_sirkit_id UUID;

COMMENT ON COLUMN public.inspeksi.sumber_tiang_id IS
  'Diisi = baris ini tugas dari temuan inspeksi JTM (tugaskan_temuan_jtm). NULL = laporan lepas dari HP.';

CREATE INDEX IF NOT EXISTS inspeksi_sumber_tiang_idx
  ON public.inspeksi (sumber_tiang_id, sumber_item)
  WHERE sumber_tiang_id IS NOT NULL;


-- ── 2. Daftar temuan beserta status penugasannya ─────────────────────────────

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
    WHEN tg.id IS NULL OR tg.status = 'Batal'            THEN 'Belum ditugaskan'
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
LEFT JOIN LATERAL (
  SELECT i.id, i.status, i.eksekutor, i.category, i.assigned_at, i.team_name, i.foto_sesudah_url, i.updated_at
  FROM public.inspeksi i
  WHERE i.sumber_tiang_id = k.tiang_id
    AND i.sumber_item = k.item_kode
    AND i.sumber_bagian IS NOT DISTINCT FROM k.bagian
    AND i.sumber_sirkit_id IS NOT DISTINCT FROM k.sirkit_segmen_id
  ORDER BY i.created_at DESC
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


-- ── 3. Perlu Perbaikan tidak menghitung tugas temuan dua kali ───────────────
-- Cabang 'laporan' mengambil semua baris inspeksi terbuka. Tugas yang lahir
-- dari temuan penyapuan SUDAH terwakili cabang 'penyapuan' — tanpa saringan
-- ini satu kerusakan muncul dua kali.

CREATE OR REPLACE VIEW public.jtm_perlu_perbaikan AS
SELECT
  'penyapuan'::text     AS asal,
  k.tiang_id::text      AS acuan_id,
  k.tiang_kode          AS lokasi,
  k.pemilik             AS penyulang,
  k.ulp,
  k.sirkit_nama         AS segmen,
  k.item_nama           AS temuan,
  k.nilai_label         AS keadaan,
  k.bagian,
  k.catatan,
  k.foto_url,
  k.tgl                 AS ditemukan_pada,
  t.lat, t.lng
FROM public.tiang_kondisi_terakhir k
JOIN public.tiang t ON t.id = k.tiang_id
WHERE NOT k.normal

UNION ALL

SELECT
  'laporan'::text       AS asal,
  i.id::text            AS acuan_id,
  COALESCE(NULLIF(btrim(i.lokasi), ''), '—') AS lokasi,
  i.penyulang,
  i.ulp,
  NULL::text            AS segmen,
  COALESCE(NULLIF(btrim(i.temuan), ''), 'Temuan') AS temuan,
  i.status              AS keadaan,
  '-'::text             AS bagian,
  i.deskripsi           AS catatan,
  i.foto_sebelum_url    AS foto_url,
  i.tgl_inspeksi::timestamptz AS ditemukan_pada,
  -- Koordinat laporan lama diketik bebas: "-8. 582863,+116.07", "-8,29, 116,62",
  -- "8.61S, 116.11E". Dulu dipecah mentah-mentah dan SATU baris rusak membuat
  -- seluruh view gagal dibaca. Kini hanya bentuk "angka,angka" yang dipakai;
  -- sisanya kosong — titiknya hilang dari peta, barisnya tidak.
  CASE WHEN kb.k ~ '^-?\d+(\.\d+)?,-?\d+(\.\d+)?$' THEN split_part(kb.k, ',', 1)::double precision END AS lat,
  CASE WHEN kb.k ~ '^-?\d+(\.\d+)?,-?\d+(\.\d+)?$' THEN split_part(kb.k, ',', 2)::double precision END AS lng
FROM public.inspeksi i
CROSS JOIN LATERAL (SELECT regexp_replace(COALESCE(i.koordinat, ''), '[\s+]', '', 'g') AS k) kb
WHERE COALESCE(i.status, '') NOT IN ('Selesai', 'Batal')
  AND i.sumber_tiang_id IS NULL;


-- ── 4. Menugaskan satu temuan ────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.tugaskan_temuan_jtm(
  p_tiang_id  UUID,
  p_item      TEXT,
  p_bagian    TEXT,
  p_sirkit    UUID,
  p_eksekutor TEXT,
  p_prioritas TEXT DEFAULT 'Normal',
  p_catatan   TEXT DEFAULT NULL,
  p_nama      TEXT DEFAULT NULL
) RETURNS TEXT
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  k    RECORD;
  baru TEXT;
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
      k.tiang_kode, k.item_nama, k.eksekutor;
  END IF;
  IF k.status_tugas = 'Selesai' THEN
    RAISE EXCEPTION 'Temuan tiang % (%) sudah dikerjakan % — tunggu inspeksi berikutnya memastikannya normal.',
      k.tiang_kode, k.item_nama, k.eksekutor;
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
    'Ditugaskan', p_eksekutor, now(),
    (k.ditemukan_pada AT TIME ZONE 'Asia/Makassar')::date,
    NULLIF(btrim(p_catatan), ''), 'inspeksi_jtm', p_nama,
    k.tiang_id, k.item_kode, k.bagian, k.sirkit_segmen_id
  )
  RETURNING id INTO baru;

  RETURN baru;
END $$;

COMMENT ON FUNCTION public.tugaskan_temuan_jtm IS
  'Membuat tugas (baris inspeksi Ditugaskan) dari satu temuan inspeksi JTM. Menolak kalau temuan itu sudah punya tugas terbuka.';

GRANT EXECUTE ON FUNCTION public.tugaskan_temuan_jtm TO authenticated;


-- ── Periksa ──────────────────────────────────────────────────────────────────
--   SELECT jenis, status_tugas, count(*) FROM jtm_temuan GROUP BY 1, 2;
--   SELECT asal, count(*) FROM jtm_perlu_perbaikan GROUP BY asal;
