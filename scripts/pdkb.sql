-- =============================================================================
-- Halaman PDKB (24 Nov 2026) — web saja dulu. Jalankan SESUDAH
-- harjar-tugas-manual.sql dan hargardu-temuan-ke-regu.sql. Idempoten.
-- =============================================================================
-- Keputusan user 24 Nov 2026:
--   • Halaman baru "PDKB" di grup Kinerja Yantek: Daftar pekerjaan → Dashboard
--     → Temuan ditugaskan.
--   • Temuan yang ditugaskan ke PDKB (Temuan JTM/JTR → `inspeksi` eksekutor
--     PDKB; temuan gardu → teruskan_temuan_gardu) muncul di tab Temuan ditugaskan.
--   • Pekerjaan PDKB dicatat ADMIN (PDKB belum memakai aplikasi) di TABEL
--     SENDIRI `pdkb_pekerjaan` — tidak masuk pemeliharaan_jaringan dan TIDAK
--     dihitung realisasi Pemeliharaan Jaringan / Rekap Kinerja Yantek.
--   • Mencatat hasil sebuah tugas menutup tugasnya (inspeksi → Selesai) dalam
--     transaksi yang sama — temuan JTM/JTR/gardu asalnya ikut "Selesai".
--     Membatalkan catatan itu (alasan wajib) membuka tugasnya lagi.
--
--   1. pdkb_pekerjaan
--   2. pdkb_tugas (view)
--   3. simpan_pekerjaan_pdkb(p_isi)
--   4. batalkan_pekerjaan_pdkb(p_id, p_alasan, p_oleh)
-- =============================================================================


-- ── 1. Tabel pekerjaan PDKB ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.pdkb_pekerjaan (
  id                UUID PRIMARY KEY,
  ulp               TEXT NOT NULL,
  jenis             TEXT NOT NULL CHECK (jenis IN ('JTM', 'JTR', 'GARDU')),
  penyulang         TEXT,
  gardu_kode        TEXT,
  kategori          TEXT,
  pekerjaan         TEXT NOT NULL,
  alamat            TEXT,
  lat               DOUBLE PRECISION,
  lng               DOUBLE PRECISION,
  tgl               DATE NOT NULL,
  pelaksana         TEXT NOT NULL DEFAULT 'PDKB',
  foto_sebelum_url  TEXT NOT NULL,
  foto_sesudah_url  TEXT NOT NULL,
  foto_proses_url   TEXT,
  catatan           TEXT,
  -- Tugas asal (baris inspeksi eksekutor PDKB); NULL = pekerjaan di luar tugas.
  inspeksi_id       TEXT,
  status            TEXT NOT NULL DEFAULT 'Tercatat' CHECK (status IN ('Tercatat', 'Dibatalkan')),
  dibatalkan_at     TIMESTAMPTZ,
  dibatalkan_oleh   TEXT,
  dibatalkan_alasan TEXT,
  diinput_oleh      TEXT,
  created_by        UUID,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);
COMMENT ON TABLE public.pdkb_pekerjaan IS
  'Pekerjaan PDKB yang dicatat admin (pdkb.sql). Terpisah dari pemeliharaan_jaringan; tidak dihitung realisasi Yantek.';
CREATE INDEX IF NOT EXISTS pdkb_pekerjaan_tgl_idx ON public.pdkb_pekerjaan (ulp, tgl);
-- Satu tugas = satu catatan hidup.
CREATE UNIQUE INDEX IF NOT EXISTS pdkb_pekerjaan_tugas_uniq
  ON public.pdkb_pekerjaan (inspeksi_id) WHERE inspeksi_id IS NOT NULL AND status <> 'Dibatalkan';

ALTER TABLE public.pdkb_pekerjaan ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS pdkb_pekerjaan_baca ON public.pdkb_pekerjaan;
CREATE POLICY pdkb_pekerjaan_baca ON public.pdkb_pekerjaan FOR SELECT TO authenticated USING (true);
GRANT SELECT ON public.pdkb_pekerjaan TO authenticated;
-- Menulis hanya lewat fungsi di bawah.


-- ── 2. Tugas PDKB (pola harjar_tugas) ────────────────────────────────────────
CREATE OR REPLACE VIEW public.pdkb_tugas AS
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
  i.dibatalkan_at,
  i.dibatalkan_alasan,
  i.dibatalkan_oleh,
  p.id                 AS catatan_id,
  p.tgl                AS catatan_tgl,
  p.pelaksana          AS catatan_pelaksana,
  -- Ditambahkan di BELAKANG (24 Nov): tugas lama dari Monitoring Inspeksi
  -- sering tanpa assigned_at — tanggalnya jatuh ke tanggal temuan / dibuat.
  i.tgl_inspeksi,
  i.created_at
FROM public.inspeksi i
LEFT JOIN LATERAL (
  SELECT j.id, j.tgl, j.pelaksana
  FROM public.pdkb_pekerjaan j
  WHERE j.inspeksi_id = i.id::text AND j.status <> 'Dibatalkan'
  ORDER BY j.created_at DESC
  LIMIT 1
) p ON true
WHERE upper(COALESCE(i.eksekutor, '')) = 'PDKB';
GRANT SELECT ON public.pdkb_tugas TO authenticated;

-- Daftar pekerjaan + label tugas asalnya (kolom WO / Tgl WO, teknisaplikasi.md butir 7).
CREATE OR REPLACE VIEW public.pdkb_pekerjaan_daftar AS
SELECT p.*, r.label AS kategori_label,
       i.temuan AS tugas_temuan, i.assigned_at AS tugas_ditugaskan, i.source AS tugas_sumber
FROM public.pdkb_pekerjaan p
LEFT JOIN public.pemeliharaan_jaringan_ref r ON r.kode = p.kategori
LEFT JOIN public.inspeksi i ON i.id::text = p.inspeksi_id;
GRANT SELECT ON public.pdkb_pekerjaan_daftar TO authenticated;


-- ── 3. Catat pekerjaan ───────────────────────────────────────────────────────
-- p_isi: {id, ulp, jenis, penyulang?, gardu_kode?, kategori?, pekerjaan, alamat?,
--         lat?, lng?, tgl, pelaksana?, foto_sebelum_url?, foto_sesudah_url,
--         foto_proses_url?, catatan?, inspeksi_id?, oleh}
-- • id dari peramban → klik ganda / kirim ulang mengembalikan {sudah_ada:true}.
-- • Ber-tugas: ULP, jenis, penyulang ikut tugasnya; foto sebelum boleh kosong
--   (dipakai foto temuan); tugas ditutup Selesai dalam transaksi yang sama.
CREATE OR REPLACE FUNCTION public.simpan_pekerjaan_pdkb(p_isi JSONB)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  v_id    UUID := NULLIF(p_isi->>'id', '')::uuid;
  v_insp  TEXT := NULLIF(btrim(COALESCE(p_isi->>'inspeksi_id', '')), '');
  v_ulp   TEXT := upper(btrim(COALESCE(p_isi->>'ulp', '')));
  v_jenis TEXT := upper(btrim(COALESCE(p_isi->>'jenis', '')));
  v_peny  TEXT := NULLIF(upper(btrim(COALESCE(p_isi->>'penyulang', ''))), '');
  v_gardu TEXT := NULLIF(btrim(COALESCE(p_isi->>'gardu_kode', '')), '');
  v_kerja TEXT := btrim(COALESCE(p_isi->>'pekerjaan', ''));
  v_fs    TEXT := NULLIF(btrim(COALESCE(p_isi->>'foto_sebelum_url', '')), '');
  v_fd    TEXT := NULLIF(btrim(COALESCE(p_isi->>'foto_sesudah_url', '')), '');
  v_tgl   DATE := NULLIF(p_isi->>'tgl', '')::date;
  v_oleh  TEXT := NULLIF(btrim(COALESCE(p_isi->>'oleh', '')), '');
  v_hari  DATE := (now() AT TIME ZONE 'Asia/Makassar')::date;
  t       public.inspeksi;
BEGIN
  IF v_id IS NULL THEN RAISE EXCEPTION 'id wajib.'; END IF;
  IF EXISTS (SELECT 1 FROM public.pdkb_pekerjaan WHERE id = v_id) THEN
    RETURN jsonb_build_object('id', v_id, 'sudah_ada', true);
  END IF;

  IF v_insp IS NOT NULL THEN
    SELECT * INTO t FROM public.inspeksi WHERE id::text = v_insp FOR UPDATE;
    IF t.id IS NULL THEN RAISE EXCEPTION 'Tugas tidak ditemukan.'; END IF;
    IF upper(COALESCE(t.eksekutor, '')) <> 'PDKB' THEN RAISE EXCEPTION 'Tugas ini bukan tugas PDKB.'; END IF;
    -- Belum selesai = apa pun selain status penutup (tugas lama dari Monitoring
    -- Inspeksi bisa berstatus Temuan / Perlu Tindakan).
    IF t.status IN ('Selesai', 'Dibatalkan', 'Batal') THEN
      RAISE EXCEPTION 'Tugas ini sudah %, tidak bisa dicatat lagi.', lower(t.status);
    END IF;
    v_ulp := upper(t.ulp);
    v_peny := COALESCE(v_peny, NULLIF(upper(btrim(COALESCE(t.penyulang, ''))), ''));
    v_fs := COALESCE(v_fs, NULLIF(t.foto_sebelum_url, ''));
  END IF;

  PERFORM public.wajib_boleh_ulp(v_ulp);
  IF v_jenis NOT IN ('JTM', 'JTR', 'GARDU') THEN RAISE EXCEPTION 'Jenis harus JTM, JTR, atau GARDU.'; END IF;
  IF v_jenis = 'GARDU' AND v_gardu IS NULL THEN RAISE EXCEPTION 'Kode gardu wajib diisi.'; END IF;
  IF v_jenis <> 'GARDU' AND v_peny IS NULL THEN RAISE EXCEPTION 'Penyulang wajib dipilih.'; END IF;
  IF v_kerja = '' THEN RAISE EXCEPTION 'Uraian pekerjaan wajib diisi.'; END IF;
  IF v_tgl IS NULL THEN RAISE EXCEPTION 'Tanggal pekerjaan wajib diisi.'; END IF;
  IF v_tgl > v_hari THEN RAISE EXCEPTION 'Tanggal pekerjaan tidak boleh di masa depan.'; END IF;
  IF COALESCE(v_fs, '') NOT LIKE 'http%' OR COALESCE(v_fd, '') NOT LIKE 'http%' THEN
    RAISE EXCEPTION 'Foto sebelum dan sesudah dua-duanya wajib.';
  END IF;

  INSERT INTO public.pdkb_pekerjaan
    (id, ulp, jenis, penyulang, gardu_kode, kategori, pekerjaan, alamat, lat, lng, tgl, pelaksana,
     foto_sebelum_url, foto_sesudah_url, foto_proses_url, catatan, inspeksi_id, diinput_oleh, created_by)
  VALUES
    (v_id, v_ulp, v_jenis, v_peny, v_gardu, NULLIF(p_isi->>'kategori', ''), v_kerja,
     NULLIF(btrim(COALESCE(p_isi->>'alamat', '')), ''),
     NULLIF(p_isi->>'lat', '')::double precision, NULLIF(p_isi->>'lng', '')::double precision,
     v_tgl, COALESCE(NULLIF(btrim(COALESCE(p_isi->>'pelaksana', '')), ''), 'PDKB'),
     v_fs, v_fd, NULLIF(btrim(COALESCE(p_isi->>'foto_proses_url', '')), ''),
     NULLIF(btrim(COALESCE(p_isi->>'catatan', '')), ''), v_insp, v_oleh, auth.uid());

  IF t.id IS NOT NULL THEN
    UPDATE public.inspeksi
    SET status = 'Selesai', foto_sesudah_url = v_fd, tgl_eksekusi = v_tgl,
        updated_by = COALESCE(v_oleh, updated_by), updated_at = now()
    WHERE id = t.id;
  END IF;

  RETURN jsonb_build_object('id', v_id, 'sudah_ada', false);
END $fn$;
REVOKE ALL ON FUNCTION public.simpan_pekerjaan_pdkb(JSONB) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.simpan_pekerjaan_pdkb(JSONB) TO authenticated;


-- ── 4. Batalkan catatan (salah input) — alasan wajib ─────────────────────────
CREATE OR REPLACE FUNCTION public.batalkan_pekerjaan_pdkb(p_id UUID, p_alasan TEXT, p_oleh TEXT DEFAULT NULL)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  j public.pdkb_pekerjaan;
BEGIN
  SELECT * INTO j FROM public.pdkb_pekerjaan WHERE id = p_id FOR UPDATE;
  IF j.id IS NULL THEN RAISE EXCEPTION 'Catatan tidak ditemukan.'; END IF;
  PERFORM public.wajib_boleh_ulp(j.ulp);
  IF j.status = 'Dibatalkan' THEN RAISE EXCEPTION 'Catatan ini sudah dibatalkan.'; END IF;
  IF NULLIF(btrim(COALESCE(p_alasan, '')), '') IS NULL THEN RAISE EXCEPTION 'Tulis alasan pembatalan.'; END IF;

  UPDATE public.pdkb_pekerjaan
  SET status = 'Dibatalkan', dibatalkan_at = now(), dibatalkan_oleh = p_oleh,
      dibatalkan_alasan = btrim(p_alasan), updated_at = now()
  WHERE id = p_id;

  -- Tugasnya dibuka lagi: belum ada pekerjaan yang sah untuknya.
  IF j.inspeksi_id IS NOT NULL THEN
    UPDATE public.inspeksi
    SET status = 'Ditugaskan', foto_sesudah_url = NULL, tgl_eksekusi = NULL,
        updated_by = COALESCE(p_oleh, updated_by), updated_at = now()
    WHERE id::text = j.inspeksi_id AND status = 'Selesai';
  END IF;
END $fn$;
REVOKE ALL ON FUNCTION public.batalkan_pekerjaan_pdkb(UUID, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.batalkan_pekerjaan_pdkb(UUID, TEXT, TEXT) TO authenticated;

NOTIFY pgrst, 'reload schema';


-- ── Periksa (hanya baca) ──────────────────────────────────────────────────────
--   SELECT count(*) FROM pdkb_tugas;                 -- tugas PDKB yang sudah ada
--   SELECT status, count(*) FROM pdkb_tugas GROUP BY 1;
