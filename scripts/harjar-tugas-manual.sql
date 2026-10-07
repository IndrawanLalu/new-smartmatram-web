-- ════════════════════════════════════════════════════════════════════════════
-- Tugas manual Pemeliharaan Jaringan (6 Okt 2026)
-- ════════════════════════════════════════════════════════════════════════════
-- Keputusan user: admin bisa membuat tugas Pemeliharaan Jaringan dari web,
-- selain tugas yang lahir dari temuan inspeksi. Tab "Tugas" + tombol
-- "Buat Tugas" di /admin/pemeliharaan-jaringan. Eksekutor selalu HARJAR.
-- Tugas manual DIHITUNG sebagai WO terbit di Rekap Kinerja & surat WO Yantek
-- (baris Pemeliharaan Jaringan), pada bulan tugas itu dibuat.
--
-- Bentuknya SAMA dengan tugas temuan: satu baris `inspeksi` Ditugaskan,
-- eksekutor HARJAR, source = 'tugas_manual'. HP sudah membaca baris seperti ini
-- (harjarKerja.ts) dan menutupnya saat regu mengirim catatan pekerjaan — HP
-- tidak perlu diubah. Bukti kerja (foto sebelum-sesudah + titik) tetap HANYA
-- dari HP; yang dibuat di web cuma perintah kerjanya.
--
--   0. Penjaga: CHECK lama pada inspeksi.status (kalau ada) harus kenal 'Dibatalkan'
--   1. Kolom inspeksi: jenis_jaringan, jejak pembatalan
--   2. buat_tugas_harjar      — tombol "Buat Tugas"
--   3. batalkan_tugas_harjar  — tugas manual yang belum dikerjakan (butir 12)
--   4. kirim_pemeliharaan_jaringan — ★ tugas yang telanjur dibatalkan: kiriman
--      regu DITERIMA sebagai pekerjaan di luar tugas (butir 12, "pekerjaan tidak
--      boleh hilang"). Disalin dari versi hidup: scripts/foto-temuan-banyak.sql.
--   5. View harjar_tugas      — tab "Tugas"
--   6. _wo_manual_total       — ★ harjtm: tempelan + tugas manual
--   7. wo_surat_objek         — ★ lampiran surat ikut memuat tugas manual.
--      Disalin dari versi hidup: scripts/wo-bulan-anomali.sql.
--
-- Idempoten. Jalankan di Supabase SQL Editor. Tidak butuh OTA.
-- ════════════════════════════════════════════════════════════════════════════


-- ── 0. Penjaga ───────────────────────────────────────────────────────────────
-- `inspeksi` warisan Firestore; kalau ternyata ada CHECK status yang tidak kenal
-- 'Dibatalkan', berhenti di sini dengan pesan jelas daripada gagal di tengah.
DO $$
DECLARE d TEXT;
BEGIN
  SELECT string_agg(pg_get_constraintdef(c.oid), ' ; ') INTO d
  FROM pg_constraint c
  WHERE c.conrelid = 'public.inspeksi'::regclass AND c.contype = 'c'
    AND pg_get_constraintdef(c.oid) ILIKE '%status%';
  IF d IS NOT NULL AND d NOT ILIKE '%Dibatalkan%' THEN
    RAISE EXCEPTION 'inspeksi.status punya CHECK yang belum kenal Dibatalkan: %. Kirim pesan ini ke pengembang — skrip dihentikan, belum ada yang berubah.', d;
  END IF;
END $$;


-- ── 1. Kolom ─────────────────────────────────────────────────────────────────
ALTER TABLE public.inspeksi
  ADD COLUMN IF NOT EXISTS jenis_jaringan    TEXT,
  ADD COLUMN IF NOT EXISTS dibatalkan_at     TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS dibatalkan_alasan TEXT,
  ADD COLUMN IF NOT EXISTS dibatalkan_oleh   TEXT;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'inspeksi_jenis_jaringan_valid') THEN
    ALTER TABLE public.inspeksi ADD CONSTRAINT inspeksi_jenis_jaringan_valid
      CHECK (jenis_jaringan IS NULL OR jenis_jaringan IN ('JTM', 'JTR'));
  END IF;
END $$;
COMMENT ON COLUMN public.inspeksi.jenis_jaringan IS
  'JTM/JTR untuk tugas manual Pemeliharaan Jaringan (source=tugas_manual). NULL untuk baris lain.';


-- ── 2. Buat tugas ────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.buat_tugas_harjar(
  p_jenis     TEXT,
  p_penyulang TEXT,
  p_uraian    TEXT,
  p_lokasi    TEXT,
  p_koordinat TEXT DEFAULT NULL,
  p_prioritas TEXT DEFAULT 'Normal',
  p_catatan   TEXT DEFAULT NULL,
  p_nama      TEXT DEFAULT NULL
) RETURNS TEXT
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  v_jenis TEXT := upper(btrim(COALESCE(p_jenis, '')));
  v_peny  TEXT := upper(btrim(COALESCE(p_penyulang, '')));
  v_ulp   TEXT;
  v_titik TEXT;
  m       TEXT[];
  baru    TEXT;
BEGIN
  IF v_jenis NOT IN ('JTM', 'JTR') THEN RAISE EXCEPTION 'Jenis jaringan harus JTM atau JTR.'; END IF;
  IF btrim(COALESCE(p_uraian, '')) = '' THEN RAISE EXCEPTION 'Uraian pekerjaan wajib diisi.'; END IF;
  IF btrim(COALESCE(p_lokasi, '')) = '' THEN
    RAISE EXCEPTION 'Lokasi wajib diisi — segmen, gardu, atau alamat yang bisa dicari regu.';
  END IF;
  IF p_prioritas NOT IN ('Normal', 'Scheduled', 'Urgent', 'Emergency') THEN
    RAISE EXCEPTION 'Prioritas % tidak dikenal.', COALESCE(p_prioritas, '-');
  END IF;

  SELECT upper(pr.ulp) INTO v_ulp FROM public.penyulang_ref pr WHERE upper(pr.penyulang) = v_peny LIMIT 1;
  IF v_ulp IS NULL THEN RAISE EXCEPTION 'Penyulang % tidak ada di master penyulang.', COALESCE(NULLIF(v_peny, ''), '-'); END IF;
  PERFORM public.wajib_boleh_ulp(v_ulp);

  -- Titik tidak wajib; kalau diisi harus "lintang, bujur" (tempel dari Google Maps).
  IF btrim(COALESCE(p_koordinat, '')) <> '' THEN
    m := regexp_match(p_koordinat, '^\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*$');
    IF m IS NULL OR abs(m[1]::numeric) > 90 OR abs(m[2]::numeric) > 180 THEN
      RAISE EXCEPTION 'Titik harus berbentuk "lintang, bujur", mis. -8.5833, 116.1167 (tempel dari Google Maps).';
    END IF;
    v_titik := m[1] || ', ' || m[2];
  END IF;

  INSERT INTO public.inspeksi (
    category, temuan, deskripsi, lokasi, ulp, penyulang,
    inspektor, nama_inspektor, inspektor_or_petugas,
    koordinat, status, eksekutor, assigned_at, tgl_inspeksi,
    keterangan, source, updated_by, jenis_jaringan
  ) VALUES (
    p_prioritas, btrim(p_uraian), NULLIF(btrim(COALESCE(p_catatan, '')), ''), btrim(p_lokasi), v_ulp, v_peny,
    p_nama, p_nama, p_nama,
    v_titik,
    -- Eksekutor diisi lewat UPDATE di bawah: pemicu push notifikasi HP
    -- (`trg_notify_wo_assignment`) hanya menyala saat UPDATE yang mengisinya.
    'Ditugaskan', '', now(), (now() AT TIME ZONE 'Asia/Makassar')::date,
    NULLIF(btrim(COALESCE(p_catatan, '')), ''), 'tugas_manual', p_nama, v_jenis
  )
  RETURNING id INTO baru;

  UPDATE public.inspeksi SET eksekutor = 'HARJAR' WHERE id::text = baru;
  RETURN baru;
END $fn$;
GRANT EXECUTE ON FUNCTION public.buat_tugas_harjar(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT) TO authenticated;


-- ── 3. Batalkan tugas manual ─────────────────────────────────────────────────
-- Hanya selama belum dikerjakan. Yang sudah dikerjakan dibatalkan CATATANNYA di
-- tab Daftar. Tugas dari temuan tidak dibatalkan di sini — asalnya temuan.
CREATE OR REPLACE FUNCTION public.batalkan_tugas_harjar(
  p_id     TEXT,
  p_alasan TEXT,
  p_nama   TEXT DEFAULT NULL
) RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  t public.inspeksi;
BEGIN
  IF btrim(COALESCE(p_alasan, '')) = '' THEN RAISE EXCEPTION 'Alasan pembatalan wajib diisi.'; END IF;

  PERFORM pg_advisory_xact_lock(hashtext('tugas-harjar|' || p_id));
  SELECT * INTO t FROM public.inspeksi WHERE id::text = p_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Tugas tidak ditemukan. Muat ulang daftar.'; END IF;
  PERFORM public.wajib_boleh_ulp(upper(t.ulp));

  IF t.source IS DISTINCT FROM 'tugas_manual' THEN
    RAISE EXCEPTION 'Tugas ini lahir dari temuan inspeksi — yang bisa dibatalkan di sini hanya tugas yang dibuat manual.';
  END IF;
  IF t.status = 'Dibatalkan' THEN RAISE EXCEPTION 'Tugas ini sudah dibatalkan sebelumnya.'; END IF;
  IF t.status NOT IN ('Ditugaskan', 'Dalam Proses') THEN
    RAISE EXCEPTION 'Tugas ini sudah dikerjakan (%). Batalkan catatan pekerjaannya di tab Daftar Pemeliharaan.', t.status;
  END IF;

  UPDATE public.inspeksi
  SET status = 'Dibatalkan', dibatalkan_at = now(), dibatalkan_alasan = btrim(p_alasan),
      dibatalkan_oleh = p_nama, updated_by = COALESCE(p_nama, updated_by), updated_at = now()
  WHERE id = t.id;
END $fn$;
GRANT EXECUTE ON FUNCTION public.batalkan_tugas_harjar(TEXT, TEXT, TEXT) TO authenticated;


-- ── 4. Kirim catatan pekerjaan (HP) ──────────────────────────────────────────
-- Disalin dari scripts/foto-temuan-banyak.sql; yang berubah ditandai ★.
CREATE OR REPLACE FUNCTION public.kirim_pemeliharaan_jaringan(p_isi JSONB)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  v_id    UUID := NULLIF(p_isi->>'id', '')::uuid;
  v_insp  TEXT := NULLIF(btrim(COALESCE(p_isi->>'inspeksi_id', '')), '');
  v_jenis TEXT := upper(btrim(COALESCE(p_isi->>'jenis', '')));
  v_peny  TEXT := upper(btrim(COALESCE(p_isi->>'penyulang', '')));
  v_kat   TEXT := p_isi->>'kategori';
  v_kerja TEXT := btrim(COALESCE(p_isi->>'pekerjaan', ''));
  v_fs    TEXT := COALESCE(p_isi->>'foto_sebelum_url', '');
  v_fd    TEXT := COALESCE(p_isi->>'foto_sesudah_url', '');
  -- foto tambahan (paling banyak 2 per sisi)
  v_fs2   TEXT[] := ARRAY(SELECT jsonb_array_elements_text(CASE WHEN jsonb_typeof(p_isi->'foto_sebelum_lain') = 'array' THEN p_isi->'foto_sebelum_lain' ELSE '[]'::jsonb END));
  v_fd2   TEXT[] := ARRAY(SELECT jsonb_array_elements_text(CASE WHEN jsonb_typeof(p_isi->'foto_sesudah_lain') = 'array' THEN p_isi->'foto_sesudah_lain' ELSE '[]'::jsonb END));
  v_hari  DATE := (now() AT TIME ZONE 'Asia/Makassar')::date;
  v_tgl   DATE := COALESCE(NULLIF(p_isi->>'tgl', '')::date, (now() AT TIME ZONE 'Asia/Makassar')::date);
  v_nama  TEXT := NULLIF(btrim(COALESCE(p_isi->>'nama', '')), '');
  v_ulp   TEXT;
  ada     public.pemeliharaan_jaringan;
  t       public.inspeksi;
  lain    public.pemeliharaan_jaringan;
BEGIN
  IF v_id IS NULL THEN RAISE EXCEPTION 'Catatan tanpa id — perbarui aplikasi lalu kirim ulang.'; END IF;

  SELECT * INTO ada FROM public.pemeliharaan_jaringan WHERE id = v_id FOR UPDATE;
  IF FOUND AND ada.status <> 'Dikembalikan' THEN
    -- Kiriman ulang setelah jawaban server hilang di jalan.
    RETURN jsonb_build_object('id', v_id, 'ulp', ada.ulp, 'sudah_ada', true);
  END IF;

  -- ── isian (sama dengan simpan_pemeliharaan_jaringan) ──
  IF v_jenis NOT IN ('JTM', 'JTR') THEN RAISE EXCEPTION 'Jenis jaringan harus JTM atau JTR'; END IF;
  IF v_peny = '' THEN RAISE EXCEPTION 'Penyulang wajib dipilih'; END IF;
  IF v_kerja = '' THEN RAISE EXCEPTION 'Pekerjaan wajib diisi'; END IF;
  IF v_fs NOT LIKE 'http%' OR v_fd NOT LIKE 'http%' THEN
    RAISE EXCEPTION 'Foto sebelum dan sesudah dua-duanya wajib dan harus sudah terunggah.';
  END IF;
  IF cardinality(v_fs2) > 2 OR cardinality(v_fd2) > 2 THEN
    RAISE EXCEPTION 'Paling banyak 3 foto sebelum dan 3 foto sesudah.';
  END IF;
  IF EXISTS (SELECT 1 FROM unnest(v_fs2 || v_fd2) f WHERE f NOT LIKE 'http%') THEN
    RAISE EXCEPTION 'Foto tambahan belum terunggah. Kirim ulang saat sinyal lebih baik.';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.pemeliharaan_jaringan_ref r WHERE r.kode = v_kat AND r.aktif) THEN
    RAISE EXCEPTION 'Kategori "%" tidak ada di daftar yang aktif', v_kat;
  END IF;
  IF v_tgl > v_hari THEN RAISE EXCEPTION 'Tanggal pekerjaan tidak boleh di masa depan.'; END IF;

  SELECT upper(pr.ulp) INTO v_ulp FROM public.penyulang_ref pr WHERE upper(pr.penyulang) = v_peny LIMIT 1;
  v_ulp := COALESCE(v_ulp, NULLIF(upper(btrim(COALESCE(p_isi->>'ulp', ''))), ''));
  IF v_ulp IS NULL THEN RAISE EXCEPTION 'ULP tidak diketahui untuk penyulang %', v_peny; END IF;

  -- ── tugas ──
  IF v_insp IS NOT NULL THEN
    PERFORM pg_advisory_xact_lock(hashtext('tugas-harjar|' || v_insp));
    SELECT * INTO t FROM public.inspeksi WHERE id::text = v_insp FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Tugas tidak ditemukan — mungkin sudah dihapus admin. Hapus kaitannya lalu kirim sebagai pekerjaan di luar tugas.'; END IF;
    PERFORM public._harjar_boleh_tugas(t);

    IF t.status = 'Dibatalkan' THEN
      -- ★ Tugas dibatalkan admin setelah regu telanjur mengerjakannya: pekerjaan
      -- tidak boleh hilang — diterima sebagai pekerjaan di luar tugas.
      t := NULL;
    ELSE
      SELECT * INTO lain FROM public.pemeliharaan_jaringan
      WHERE inspeksi_id::text = v_insp AND status <> 'Dibatalkan' AND id <> v_id;
      IF FOUND THEN
        RAISE EXCEPTION 'Tugas ini sudah dikirim % pada %. Satu tugas satu catatan.',
          COALESCE(lain.petugas_nama, 'regu lain'), lain.tgl;
      END IF;
      IF t.status NOT IN ('Ditugaskan', 'Dalam Proses') THEN
        RAISE EXCEPTION 'Tugas ini sudah berstatus % — tidak bisa dikirim lagi.', t.status;
      END IF;
    END IF;
  END IF;

  IF ada.id IS NULL THEN
    INSERT INTO public.pemeliharaan_jaringan
      (id, inspeksi_id, jenis, penyulang, ulp, kategori, pekerjaan, alamat,
       lat, lng, akurasi, foto_sebelum_url, foto_sesudah_url,
       petugas_uid, petugas_nama, catatan, tgl, foto_sebelum_lain, foto_sesudah_lain)
    VALUES
      (v_id, t.id, v_jenis, v_peny, v_ulp, v_kat, v_kerja,
       NULLIF(btrim(COALESCE(p_isi->>'alamat', '')), ''),
       NULLIF(p_isi->>'lat', '')::double precision, NULLIF(p_isi->>'lng', '')::double precision,
       NULLIF(p_isi->>'akurasi', '')::double precision,
       v_fs, v_fd, auth.uid(), v_nama, NULLIF(btrim(COALESCE(p_isi->>'catatan', '')), ''), v_tgl, v_fs2, v_fd2);
  ELSE
    -- Kiriman ulang yang dikembalikan: baris yang sama diperbarui.
    UPDATE public.pemeliharaan_jaringan SET
      inspeksi_id = t.id, jenis = v_jenis, penyulang = v_peny, ulp = v_ulp, kategori = v_kat,
      pekerjaan = v_kerja, alamat = NULLIF(btrim(COALESCE(p_isi->>'alamat', '')), ''),
      lat = NULLIF(p_isi->>'lat', '')::double precision, lng = NULLIF(p_isi->>'lng', '')::double precision,
      akurasi = NULLIF(p_isi->>'akurasi', '')::double precision,
      foto_sebelum_url = v_fs, foto_sesudah_url = v_fd,
      foto_sebelum_lain = v_fs2, foto_sesudah_lain = v_fd2,
      petugas_uid = auth.uid(), petugas_nama = COALESCE(v_nama, petugas_nama),
      catatan = NULLIF(btrim(COALESCE(p_isi->>'catatan', '')), ''), tgl = v_tgl,
      status = 'Selesai', verified_at = NULL, verified_by = NULL, updated_at = now()
    WHERE id = v_id;
  END IF;

  IF t.id IS NOT NULL THEN
    UPDATE public.inspeksi
    SET status = 'Selesai', foto_sesudah_url = v_fd, tgl_eksekusi = v_tgl,
        updated_by = COALESCE(v_nama, updated_by), updated_at = now()
    WHERE id = t.id;
  END IF;

  RETURN jsonb_build_object('id', v_id, 'ulp', v_ulp, 'sudah_ada', false);
END $fn$;
GRANT EXECUTE ON FUNCTION public.kirim_pemeliharaan_jaringan(JSONB) TO authenticated;


-- ── 5. View tab "Tugas" ──────────────────────────────────────────────────────
-- Semua tugas HARJAR (temuan & manual) + catatan pekerjaan yang menutupnya.
CREATE OR REPLACE VIEW public.harjar_tugas AS
SELECT
  i.id::text           AS id,
  i.source,
  i.jenis_jaringan,
  i.temuan,
  i.deskripsi,
  i.lokasi,
  upper(i.ulp)         AS ulp,
  i.penyulang,
  i.koordinat,
  i.category           AS prioritas,
  i.status,
  i.assigned_at,
  i.nama_inspektor,
  i.team_name,
  i.foto_sebelum_url,
  i.foto_sesudah_url,
  i.tgl_eksekusi,
  i.updated_by,
  i.dibatalkan_at,
  i.dibatalkan_alasan,
  i.dibatalkan_oleh,
  p.id                 AS catatan_id,
  p.status             AS catatan_status,
  p.petugas_nama       AS catatan_petugas,
  p.tgl                AS catatan_tgl
FROM public.inspeksi i
LEFT JOIN LATERAL (
  SELECT j.id, j.status, j.petugas_nama, j.tgl
  FROM public.pemeliharaan_jaringan j
  WHERE j.inspeksi_id = i.id AND j.status <> 'Dibatalkan'
  ORDER BY j.created_at DESC
  LIMIT 1
) p ON true
WHERE upper(COALESCE(i.eksekutor, '')) = 'HARJAR';
GRANT SELECT ON public.harjar_tugas TO authenticated;


-- ── 6. Rekap: WO terbit Pemeliharaan Jaringan = tempelan + tugas manual ──────
-- Disalin dari scripts/wo-surat-yantek.sql; ★ bagian tugas manual. Bentuk
-- jawaban tidak berubah: NULL = tidak ada WO sama sekali (bukan nol).
CREATE OR REPLACE FUNCTION public._wo_manual_total(u TEXT, p_tahun INT, p_bulan INT, p_jenis TEXT, p_km BOOLEAN, p_selesai BOOLEAN)
RETURNS NUMERIC
LANGUAGE sql STABLE SET search_path = public AS $fn$
  SELECT CASE WHEN t.ada = 0 AND g.n = 0 THEN NULL ELSE COALESCE(t.total, 0) + g.n END
  FROM (
    SELECT count(DISTINCT m.id) AS ada,
      round(COALESCE(sum(CASE WHEN p_km THEN COALESCE(i.km, 0) ELSE 1 END)
        FILTER (WHERE i.id IS NOT NULL AND (NOT p_selesai OR i.selesai_tgl IS NOT NULL)), 0), 3) AS total
    FROM public.wo_manual m
    LEFT JOIN public.wo_manual_item i ON i.wo_id = m.id
    WHERE m.jenis = p_jenis AND m.tahun = p_tahun AND (p_bulan = 0 OR m.bulan = p_bulan)
      AND (u IS NULL OR m.ulp = u)
  ) t,
  (
    -- ★ Tugas manual (dihitung per pekerjaan, pada bulan tugas dibuat, WITA).
    SELECT count(*)::numeric AS n
    FROM public.inspeksi x
    WHERE p_jenis = 'harjtm' AND NOT p_km
      AND x.source = 'tugas_manual' AND x.status <> 'Dibatalkan'
      AND (NOT p_selesai OR x.status = 'Selesai')
      AND upper(COALESCE(x.eksekutor, '')) = 'HARJAR'
      AND (x.assigned_at AT TIME ZONE 'Asia/Makassar')::date >= make_date(p_tahun, GREATEST(p_bulan, 1), 1)
      AND (x.assigned_at AT TIME ZONE 'Asia/Makassar')::date <
          CASE WHEN p_bulan = 0 THEN make_date(p_tahun + 1, 1, 1)
               ELSE (make_date(p_tahun, p_bulan, 1) + INTERVAL '1 month')::date END
      AND (u IS NULL OR upper(x.ulp) = u)
  ) g;
$fn$;


-- ── 7. Lampiran surat ────────────────────────────────────────────────────────
-- Disalin dari scripts/wo-bulan-anomali.sql; ★ bagian tugas manual di akhir.
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

  -- Penyeimbangan dari anomali pengukuran — gardu yang sudah ada di tempelan
  -- bulan itu tidak diulang (tempelan yang tampil, dengan pelaksananya).
  RETURN QUERY
  SELECT 'penyeimbangan'::text, row_number() OVER (ORDER BY a.penyulang, a.no_gardu)::int,
         a.no_gardu, a.alamat, NULL::numeric, NULL::text, NULL::text, NULL::date,
         a.penyulang, a.daya, NULL::text
  FROM (
    SELECT DISTINCT ON (upper(pg.no_gardu)) pg.no_gardu, pg.alamat, pg.penyulang, gd.daya::numeric AS daya
    FROM public.pengukuran_gardu pg
    LEFT JOIN public.gardu gd ON upper(gd.kode) = upper(pg.no_gardu) AND upper(gd.ulp) = upper(pg.petugas_unit)
    WHERE pg.jenis_pemeliharaan = 'PEMERATAAN BEBAN'
      AND pg.hasil_penyeimbangan_id IS NULL
      AND pg.wo_bulan = d_awal
      AND upper(pg.petugas_unit) = u
      AND NOT public._gardu_di_tempelan('penyeimbangan', u, pg.wo_bulan, pg.no_gardu)
    ORDER BY upper(pg.no_gardu), pg.wo_sent_at DESC
  ) a;

  RETURN QUERY
  SELECT 'pengukuran'::text, row_number() OVER (ORDER BY r.penyulang, r.urutan)::int,
         r.kode_gardu, r.alamat, NULL::numeric, it.keterangan, it.pelaksana, NULL::date,
         r.penyulang, r.kva_master, NULL::text
  FROM public.wo_pengukuran_realisasi r
  JOIN public.wo_pengukuran_item it ON it.id = r.id
  WHERE r.tahun = p_tahun AND r.bulan = p_bulan AND upper(r.ulp) = u;

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
--   SELECT status, count(*) FROM harjar_tugas GROUP BY 1;
--   SELECT * FROM rekap_kinerja(NULL, 2026, 10) WHERE kunci = 'harjtm';
