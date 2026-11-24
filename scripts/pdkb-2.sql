-- =============================================================================
-- PDKB tahap 2 (24 Nov 2026): koreksi catatan + audit. Jalankan SESUDAH
-- pdkb.sql dan pdkb-pindah-data-lama.sql. Idempoten. Fungsi & view di sini
-- MENGGANTIKAN versi di pdkb.sql.
-- =============================================================================
-- Arahan user: kategori = pilihan; catatan masih bisa DIKOREKSI seperti
-- Pemeliharaan Jaringan; audit fungsi; selesai di PDKB = selesai di semua
-- halaman terkait.
--
-- Temuan audit yang diperbaiki di sini:
--   A. Temuan ROW (pohon) JTM yang ditugaskan ke PDKB tersimpan di
--      `inspeksi_pohon` (tugaskan_temuan_jtm) — dulu TIDAK PERNAH tampil di
--      halaman PDKB. pdkb_tugas kini membaca kedua tabel (kolom `tabel`), dan
--      catatan PDKB menyimpan tabel tugasnya (`tugas_tabel`).
--   B. Kategori, penyulang, dan gardu tidak diperiksa ke master saat simpan.
--   C. Tanggal di masa depan / tugas milik regu lain sudah dijaga; ditambah:
--      koreksi hanya untuk catatan Tercatat, ULP tidak bisa dipindah, jejak
--      koreksi (dikoreksi_at/oleh) tersimpan.
--   D. Tautan catatan → tugas memakai `id::text` (tipe id inspeksi berbeda
--      antar-lingkungan) — diberi indeks ekspresi supaya tidak menyapu tabel.
--
-- Selesai di semua halaman: menyimpan hasil menutup baris tugas (Selesai +
-- foto sesudah + tgl_eksekusi). Halaman lain MENURUNKAN statusnya dari baris
-- itu: Monitoring Inspeksi (status), Temuan JTM/JTR (jtm_temuan / jtr temuan:
-- status tugas dari baris inspeksi), Perlu Perbaikan gardu (pemicu
-- _tugas_temuan_gardu_ikut → tindak_lanjut_gardu Dikerjakan). Membatalkan
-- catatan membuka tugasnya lagi di semua halaman itu.
-- =============================================================================


-- ── 1. Kolom baru ────────────────────────────────────────────────────────────
ALTER TABLE public.pdkb_pekerjaan
  ADD COLUMN IF NOT EXISTS tugas_tabel   TEXT,
  ADD COLUMN IF NOT EXISTS dikoreksi_at  TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS dikoreksi_oleh TEXT;
UPDATE public.pdkb_pekerjaan SET tugas_tabel = 'inspeksi' WHERE inspeksi_id IS NOT NULL AND tugas_tabel IS NULL;
ALTER TABLE public.pdkb_pekerjaan DROP CONSTRAINT IF EXISTS pdkb_pekerjaan_tugas_tabel_valid;
ALTER TABLE public.pdkb_pekerjaan ADD CONSTRAINT pdkb_pekerjaan_tugas_tabel_valid
  CHECK ((inspeksi_id IS NULL) = (tugas_tabel IS NULL) AND (tugas_tabel IS NULL OR tugas_tabel IN ('inspeksi', 'inspeksi_pohon')));

DROP INDEX IF EXISTS public.pdkb_pekerjaan_tugas_uniq;
CREATE UNIQUE INDEX IF NOT EXISTS pdkb_pekerjaan_tugas_uniq2
  ON public.pdkb_pekerjaan (tugas_tabel, inspeksi_id) WHERE inspeksi_id IS NOT NULL AND status <> 'Dibatalkan';

-- D. Tautan lewat id::text.
CREATE INDEX IF NOT EXISTS inspeksi_id_teks_idx ON public.inspeksi ((id::text));
CREATE INDEX IF NOT EXISTS inspeksi_pohon_id_teks_idx ON public.inspeksi_pohon ((id::text));
CREATE INDEX IF NOT EXISTS inspeksi_eksekutor_upper_idx ON public.inspeksi ((upper(COALESCE(eksekutor, ''))));
CREATE INDEX IF NOT EXISTS inspeksi_pohon_eksekutor_upper_idx ON public.inspeksi_pohon ((upper(COALESCE(eksekutor, ''))));


-- ── 2. Tugas PDKB: inspeksi + inspeksi_pohon ─────────────────────────────────
-- Kolom yang mungkin tidak ada di inspeksi_pohon dibaca lewat to_jsonb (tidak
-- gagal bila kolomnya belum ada).
DROP VIEW IF EXISTS public.pdkb_tugas;
CREATE VIEW public.pdkb_tugas AS
SELECT
  i.id::text AS id, i.source, i.jenis_jaringan, i.temuan, i.deskripsi, i.lokasi,
  upper(i.ulp) AS ulp, i.penyulang, i.koordinat, i.category AS prioritas, i.status,
  i.assigned_at, i.nama_inspektor, i.team_name, i.foto_sebelum_url, i.foto_sesudah_url,
  i.tgl_eksekusi::text AS tgl_eksekusi, i.dibatalkan_at, i.dibatalkan_alasan, i.dibatalkan_oleh,
  p.id AS catatan_id, p.tgl AS catatan_tgl, p.pelaksana AS catatan_pelaksana,
  i.tgl_inspeksi::text AS tgl_inspeksi, i.created_at,
  'inspeksi'::text AS tabel
FROM public.inspeksi i
LEFT JOIN LATERAL (
  SELECT j.id, j.tgl, j.pelaksana FROM public.pdkb_pekerjaan j
  WHERE j.tugas_tabel = 'inspeksi' AND j.inspeksi_id = i.id::text AND j.status <> 'Dibatalkan'
  ORDER BY j.created_at DESC LIMIT 1
) p ON true
WHERE upper(COALESCE(i.eksekutor, '')) = 'PDKB'
UNION ALL
SELECT
  x.id::text, x.source, 'JTM'::text, 'Pohon / ROW'::text,
  x.deskripsi, x.lokasi, upper(x.ulp), x.penyulang, x.koordinat, x.category, x.status,
  x.assigned_at, x.nama_inspektor, x.team_name, x.foto_sebelum_url, x.foto_sesudah_url,
  x.tgl_eksekusi::text,
  NULLIF(to_jsonb(x)->>'dibatalkan_at', '')::timestamptz,
  to_jsonb(x)->>'dibatalkan_alasan', to_jsonb(x)->>'dibatalkan_oleh',
  p.id, p.tgl, p.pelaksana,
  x.tgl_inspeksi::text, x.created_at,
  'inspeksi_pohon'::text
FROM public.inspeksi_pohon x
LEFT JOIN LATERAL (
  SELECT j.id, j.tgl, j.pelaksana FROM public.pdkb_pekerjaan j
  WHERE j.tugas_tabel = 'inspeksi_pohon' AND j.inspeksi_id = x.id::text AND j.status <> 'Dibatalkan'
  ORDER BY j.created_at DESC LIMIT 1
) p ON true
WHERE upper(COALESCE(x.eksekutor, '')) = 'PDKB';
GRANT SELECT ON public.pdkb_tugas TO authenticated;

-- Daftar pekerjaan + label tugas asal (kolom WO / Tgl WO).
DROP VIEW IF EXISTS public.pdkb_pekerjaan_daftar;
CREATE VIEW public.pdkb_pekerjaan_daftar AS
SELECT p.*, r.label AS kategori_label,
       COALESCE(i.temuan, CASE WHEN x.id IS NOT NULL THEN 'Pohon / ROW' END) AS tugas_temuan,
       COALESCE(i.assigned_at, x.assigned_at) AS tugas_ditugaskan,
       COALESCE(i.source, x.source) AS tugas_sumber
FROM public.pdkb_pekerjaan p
LEFT JOIN public.pemeliharaan_jaringan_ref r ON r.kode = p.kategori
LEFT JOIN public.inspeksi i       ON p.tugas_tabel = 'inspeksi'       AND i.id::text = p.inspeksi_id
LEFT JOIN public.inspeksi_pohon x ON p.tugas_tabel = 'inspeksi_pohon' AND x.id::text = p.inspeksi_id;
GRANT SELECT ON public.pdkb_pekerjaan_daftar TO authenticated;


-- ── 3. Pemeriksaan isian bersama (simpan & koreksi) ──────────────────────────
-- Satu aturan, satu tempat (teknisaplikasi.md 23.9).
CREATE OR REPLACE FUNCTION public._periksa_isian_pdkb(
  p_jenis TEXT, p_peny TEXT, p_gardu TEXT, p_kategori TEXT, p_kerja TEXT, p_tgl DATE, p_pelaksana TEXT
) RETURNS VOID
LANGUAGE plpgsql STABLE SET search_path = public AS $fn$
BEGIN
  IF p_jenis NOT IN ('JTM', 'JTR', 'GARDU') THEN RAISE EXCEPTION 'Jenis harus JTM, JTR, atau GARDU.'; END IF;
  IF p_jenis = 'GARDU' THEN
    IF p_gardu IS NULL THEN RAISE EXCEPTION 'Kode gardu wajib diisi.'; END IF;
    IF NOT EXISTS (SELECT 1 FROM public.gardu g WHERE upper(btrim(g.kode)) = upper(p_gardu)) THEN
      RAISE EXCEPTION 'Gardu % tidak ada di master gardu.', p_gardu;
    END IF;
  ELSE
    IF p_peny IS NULL THEN RAISE EXCEPTION 'Penyulang wajib dipilih.'; END IF;
    IF NOT EXISTS (SELECT 1 FROM public.penyulang_ref r WHERE upper(r.penyulang) = upper(p_peny)) THEN
      RAISE EXCEPTION 'Penyulang % tidak ada di master penyulang.', p_peny;
    END IF;
  END IF;
  IF p_kategori IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.pemeliharaan_jaringan_ref r
    WHERE r.kode = p_kategori AND r.aktif AND (r.jenis = 'SEMUA' OR r.jenis = p_jenis)
  ) THEN
    RAISE EXCEPTION 'Kategori % tidak berlaku untuk %.', p_kategori, p_jenis;
  END IF;
  IF COALESCE(btrim(p_kerja), '') = '' THEN RAISE EXCEPTION 'Uraian pekerjaan wajib diisi.'; END IF;
  IF COALESCE(btrim(p_pelaksana), '') = '' THEN RAISE EXCEPTION 'Tim pelaksana wajib diisi.'; END IF;
  IF p_tgl IS NULL THEN RAISE EXCEPTION 'Tanggal pekerjaan wajib diisi.'; END IF;
  IF p_tgl > (now() AT TIME ZONE 'Asia/Makassar')::date THEN RAISE EXCEPTION 'Tanggal pekerjaan tidak boleh di masa depan.'; END IF;
END $fn$;
REVOKE ALL ON FUNCTION public._periksa_isian_pdkb(TEXT, TEXT, TEXT, TEXT, TEXT, DATE, TEXT) FROM PUBLIC, anon, authenticated;


-- ── 4. Catat pekerjaan (menggantikan pdkb.sql) ───────────────────────────────
-- p_isi: {id, ulp, jenis, penyulang?, gardu_kode?, kategori?, pekerjaan, alamat?,
--         lat?, lng?, tgl, pelaksana?, foto_sebelum_url?, foto_sesudah_url,
--         foto_proses_url?, catatan?, inspeksi_id?, tugas_tabel?, oleh}
CREATE OR REPLACE FUNCTION public.simpan_pekerjaan_pdkb(p_isi JSONB)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  v_id    UUID := NULLIF(p_isi->>'id', '')::uuid;
  v_insp  TEXT := NULLIF(btrim(COALESCE(p_isi->>'inspeksi_id', '')), '');
  v_tabel TEXT := CASE WHEN p_isi->>'tugas_tabel' = 'inspeksi_pohon' THEN 'inspeksi_pohon' ELSE 'inspeksi' END;
  v_ulp   TEXT := upper(btrim(COALESCE(p_isi->>'ulp', '')));
  v_jenis TEXT := upper(btrim(COALESCE(p_isi->>'jenis', '')));
  v_peny  TEXT := NULLIF(upper(btrim(COALESCE(p_isi->>'penyulang', ''))), '');
  v_gardu TEXT := NULLIF(upper(btrim(COALESCE(p_isi->>'gardu_kode', ''))), '');
  v_kat   TEXT := NULLIF(btrim(COALESCE(p_isi->>'kategori', '')), '');
  v_kerja TEXT := btrim(COALESCE(p_isi->>'pekerjaan', ''));
  v_pel   TEXT := COALESCE(NULLIF(btrim(COALESCE(p_isi->>'pelaksana', '')), ''), 'PDKB');
  v_fs    TEXT := NULLIF(btrim(COALESCE(p_isi->>'foto_sebelum_url', '')), '');
  v_fd    TEXT := NULLIF(btrim(COALESCE(p_isi->>'foto_sesudah_url', '')), '');
  v_tgl   DATE := NULLIF(p_isi->>'tgl', '')::date;
  v_oleh  TEXT := NULLIF(btrim(COALESCE(p_isi->>'oleh', '')), '');
  t       JSONB;
BEGIN
  IF v_id IS NULL THEN RAISE EXCEPTION 'id wajib.'; END IF;
  IF EXISTS (SELECT 1 FROM public.pdkb_pekerjaan WHERE id = v_id) THEN
    RETURN jsonb_build_object('id', v_id, 'sudah_ada', true);
  END IF;

  IF v_insp IS NOT NULL THEN
    -- Kunci baris tugas: dua admin mencatat tugas yang sama → yang kedua ditolak.
    IF v_tabel = 'inspeksi' THEN
      SELECT to_jsonb(i) INTO t FROM public.inspeksi i WHERE i.id::text = v_insp FOR UPDATE;
    ELSE
      SELECT to_jsonb(i) INTO t FROM public.inspeksi_pohon i WHERE i.id::text = v_insp FOR UPDATE;
    END IF;
    IF t IS NULL THEN RAISE EXCEPTION 'Tugas tidak ditemukan.'; END IF;
    IF upper(COALESCE(t->>'eksekutor', '')) <> 'PDKB' THEN RAISE EXCEPTION 'Tugas ini bukan tugas PDKB.'; END IF;
    IF t->>'status' IN ('Selesai', 'Dibatalkan', 'Batal') THEN
      RAISE EXCEPTION 'Tugas ini sudah %, tidak bisa dicatat lagi.', lower(t->>'status');
    END IF;
    IF EXISTS (SELECT 1 FROM public.pdkb_pekerjaan
               WHERE tugas_tabel = v_tabel AND inspeksi_id = v_insp AND status <> 'Dibatalkan') THEN
      RAISE EXCEPTION 'Hasil tugas ini sudah dicatat.';
    END IF;
    v_ulp := upper(t->>'ulp');
    v_peny := COALESCE(v_peny, NULLIF(upper(btrim(COALESCE(t->>'penyulang', ''))), ''));
    v_fs := COALESCE(v_fs, NULLIF(t->>'foto_sebelum_url', ''));
  ELSE
    v_tabel := NULL;
  END IF;

  PERFORM public.wajib_boleh_ulp(v_ulp);
  PERFORM public._periksa_isian_pdkb(v_jenis, v_peny, v_gardu, v_kat, v_kerja, v_tgl, v_pel);
  IF COALESCE(v_fs, '') NOT LIKE 'http%' OR COALESCE(v_fd, '') NOT LIKE 'http%' THEN
    RAISE EXCEPTION 'Foto sebelum dan sesudah dua-duanya wajib.';
  END IF;

  INSERT INTO public.pdkb_pekerjaan
    (id, ulp, jenis, penyulang, gardu_kode, kategori, pekerjaan, alamat, lat, lng, tgl, pelaksana,
     foto_sebelum_url, foto_sesudah_url, foto_proses_url, catatan, inspeksi_id, tugas_tabel, diinput_oleh, created_by)
  VALUES
    (v_id, v_ulp, v_jenis,
     v_peny,  -- gardu: penyulang tugasnya (bila ada) tetap disimpan sebagai keterangan
     CASE WHEN v_jenis = 'GARDU' THEN v_gardu END,
     v_kat, v_kerja,
     NULLIF(btrim(COALESCE(p_isi->>'alamat', '')), ''),
     NULLIF(p_isi->>'lat', '')::double precision, NULLIF(p_isi->>'lng', '')::double precision,
     v_tgl, v_pel, v_fs, v_fd, NULLIF(btrim(COALESCE(p_isi->>'foto_proses_url', '')), ''),
     NULLIF(btrim(COALESCE(p_isi->>'catatan', '')), ''), v_insp, v_tabel, v_oleh, auth.uid());

  -- Tugas ditutup → semua halaman yang menurunkan status dari baris ini ikut Selesai.
  IF v_insp IS NOT NULL THEN
    IF v_tabel = 'inspeksi' THEN
      UPDATE public.inspeksi
      SET status = 'Selesai', foto_sesudah_url = v_fd, tgl_eksekusi = v_tgl,
          updated_by = COALESCE(v_oleh, updated_by), updated_at = now()
      WHERE id::text = v_insp;
    ELSE
      UPDATE public.inspeksi_pohon
      SET status = 'Selesai', foto_sesudah_url = v_fd, tgl_eksekusi = v_tgl,
          updated_by = COALESCE(v_oleh, updated_by), updated_at = now()
      WHERE id::text = v_insp;
    END IF;
  END IF;

  RETURN jsonb_build_object('id', v_id, 'sudah_ada', false);
END $fn$;
REVOKE ALL ON FUNCTION public.simpan_pekerjaan_pdkb(JSONB) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.simpan_pekerjaan_pdkb(JSONB) TO authenticated;


-- ── 5. Koreksi catatan (seperti Pemeliharaan Jaringan) ───────────────────────
-- Yang bisa dikoreksi: jenis, penyulang/gardu, kategori, uraian, alamat,
-- tanggal, tim, catatan. Foto & titik TIDAK (bukti). ULP tidak bisa pindah.
-- Catatan ber-tugas: tanggal ikut ke tgl_eksekusi tugasnya.
CREATE OR REPLACE FUNCTION public.koreksi_pekerjaan_pdkb(p_id UUID, p_isi JSONB, p_oleh TEXT DEFAULT NULL)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  j       public.pdkb_pekerjaan;
  v_jenis TEXT := upper(btrim(COALESCE(p_isi->>'jenis', '')));
  v_peny  TEXT := NULLIF(upper(btrim(COALESCE(p_isi->>'penyulang', ''))), '');
  v_gardu TEXT := NULLIF(upper(btrim(COALESCE(p_isi->>'gardu_kode', ''))), '');
  v_kat   TEXT := NULLIF(btrim(COALESCE(p_isi->>'kategori', '')), '');
  v_kerja TEXT := btrim(COALESCE(p_isi->>'pekerjaan', ''));
  v_pel   TEXT := btrim(COALESCE(p_isi->>'pelaksana', ''));
  v_tgl   DATE := NULLIF(p_isi->>'tgl', '')::date;
BEGIN
  SELECT * INTO j FROM public.pdkb_pekerjaan WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Catatan tidak ditemukan.'; END IF;
  PERFORM public.wajib_boleh_ulp(j.ulp);
  IF j.status <> 'Tercatat' THEN RAISE EXCEPTION 'Catatan yang dibatalkan tidak bisa dikoreksi.'; END IF;
  PERFORM public._periksa_isian_pdkb(v_jenis, v_peny, v_gardu, v_kat, v_kerja, v_tgl, v_pel);

  UPDATE public.pdkb_pekerjaan
  SET jenis = v_jenis,
      penyulang = v_peny,
      gardu_kode = CASE WHEN v_jenis = 'GARDU' THEN v_gardu END,
      kategori = v_kat, pekerjaan = v_kerja, pelaksana = v_pel, tgl = v_tgl,
      alamat = NULLIF(btrim(COALESCE(p_isi->>'alamat', '')), ''),
      catatan = NULLIF(btrim(COALESCE(p_isi->>'catatan', '')), ''),
      dikoreksi_at = now(), dikoreksi_oleh = p_oleh, updated_at = now()
  WHERE id = p_id;

  IF j.inspeksi_id IS NOT NULL AND v_tgl IS DISTINCT FROM j.tgl THEN
    IF j.tugas_tabel = 'inspeksi_pohon' THEN
      UPDATE public.inspeksi_pohon SET tgl_eksekusi = v_tgl, updated_at = now()
      WHERE id::text = j.inspeksi_id AND status = 'Selesai';
    ELSE
      UPDATE public.inspeksi SET tgl_eksekusi = v_tgl, updated_at = now()
      WHERE id::text = j.inspeksi_id AND status = 'Selesai';
    END IF;
  END IF;
END $fn$;
REVOKE ALL ON FUNCTION public.koreksi_pekerjaan_pdkb(UUID, JSONB, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.koreksi_pekerjaan_pdkb(UUID, JSONB, TEXT) TO authenticated;


-- ── 6. Batalkan catatan (menggantikan pdkb.sql: kedua tabel tugas) ───────────
CREATE OR REPLACE FUNCTION public.batalkan_pekerjaan_pdkb(p_id UUID, p_alasan TEXT, p_oleh TEXT DEFAULT NULL)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  j public.pdkb_pekerjaan;
BEGIN
  SELECT * INTO j FROM public.pdkb_pekerjaan WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Catatan tidak ditemukan.'; END IF;
  PERFORM public.wajib_boleh_ulp(j.ulp);
  IF j.status = 'Dibatalkan' THEN RAISE EXCEPTION 'Catatan ini sudah dibatalkan.'; END IF;
  IF NULLIF(btrim(COALESCE(p_alasan, '')), '') IS NULL THEN RAISE EXCEPTION 'Tulis alasan pembatalan.'; END IF;

  UPDATE public.pdkb_pekerjaan
  SET status = 'Dibatalkan', dibatalkan_at = now(), dibatalkan_oleh = p_oleh,
      dibatalkan_alasan = btrim(p_alasan), updated_at = now()
  WHERE id = p_id;

  -- Tugasnya dibuka lagi di semua halaman (pemicu gardu ikut kembali Di-WO).
  IF j.inspeksi_id IS NOT NULL THEN
    IF j.tugas_tabel = 'inspeksi_pohon' THEN
      UPDATE public.inspeksi_pohon
      SET status = 'Ditugaskan', foto_sesudah_url = NULL, tgl_eksekusi = NULL,
          updated_by = COALESCE(p_oleh, updated_by), updated_at = now()
      WHERE id::text = j.inspeksi_id AND status = 'Selesai';
    ELSE
      UPDATE public.inspeksi
      SET status = 'Ditugaskan', foto_sesudah_url = NULL, tgl_eksekusi = NULL,
          updated_by = COALESCE(p_oleh, updated_by), updated_at = now()
      WHERE id::text = j.inspeksi_id AND status = 'Selesai';
    END IF;
  END IF;
END $fn$;
REVOKE ALL ON FUNCTION public.batalkan_pekerjaan_pdkb(UUID, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.batalkan_pekerjaan_pdkb(UUID, TEXT, TEXT) TO authenticated;

NOTIFY pgrst, 'reload schema';


-- ── Periksa (hanya baca) ──────────────────────────────────────────────────────
--   SELECT tabel, status, count(*) FROM pdkb_tugas GROUP BY 1, 2 ORDER BY 1, 2;
--   SELECT count(*) FROM pdkb_pekerjaan WHERE inspeksi_id IS NOT NULL AND tugas_tabel IS NULL;  -- harus 0
