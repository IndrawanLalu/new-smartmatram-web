-- =============================================================================
-- Pemeliharaan Jaringan — input admin untuk tim di luar aplikasi + foto proses
-- (26 Okt 2026). Jalankan SESUDAH harjar-tugas-manual.sql & foto-temuan-banyak.sql.
-- Idempoten. SQL dulu, baru web & HP (OTA).
--
-- Keputusan user 26 Okt:
--   • Admin bisa mencatat pekerjaan tim yang TIDAK memakai aplikasi (PDKB,
--     Yantek, kontraktor/vendor, lainnya). Foto sebelum + sesudah tetap WAJIB
--     (diunggah admin dari laporan tim); foto proses opsional.
--   • Ikut dihitung di realisasi Rekap Kinerja; nama tim pelaksana tampil
--     (petugas_nama = pelaksana, jadi muncul di tabel, Excel, dan lampiran).
--     Untuk penagihan, admin mengeluarkannya sendiri.
--   • Dicatat admin = langsung Diverifikasi (admin itulah pemeriksanya).
--   • HP: satu foto "Proses pekerjaan", opsional.
--
-- Ini MENGUBAH keputusan 22 Sep "tidak ada formulir di web" — hanya untuk tim
-- di luar aplikasi; ditandai sumber = 'web' supaya selalu bisa dipisahkan.
--
--   1. Kolom: foto_proses_url, pelaksana, sumber ('hp' | 'web'), diinput_oleh.
--   2. kirim_pemeliharaan_jaringan ★ — menerima foto_proses_url.
--   3. input_pemeliharaan_jaringan_admin(p_isi) — simpan dari web.
--   4. View pemeliharaan_jaringan_daftar — kolom baru di belakang.
-- =============================================================================


-- ── 1. Kolom ─────────────────────────────────────────────────────────────────
ALTER TABLE public.pemeliharaan_jaringan ADD COLUMN IF NOT EXISTS foto_proses_url TEXT;
ALTER TABLE public.pemeliharaan_jaringan ADD COLUMN IF NOT EXISTS pelaksana TEXT;
ALTER TABLE public.pemeliharaan_jaringan ADD COLUMN IF NOT EXISTS sumber TEXT NOT NULL DEFAULT 'hp';
ALTER TABLE public.pemeliharaan_jaringan ADD COLUMN IF NOT EXISTS diinput_oleh TEXT;
ALTER TABLE public.pemeliharaan_jaringan DROP CONSTRAINT IF EXISTS pemeliharaan_jaringan_sumber_valid;
ALTER TABLE public.pemeliharaan_jaringan ADD CONSTRAINT pemeliharaan_jaringan_sumber_valid
  CHECK (sumber IN ('hp', 'web'));
COMMENT ON COLUMN public.pemeliharaan_jaringan.pelaksana IS
  'Tim di luar aplikasi (PDKB, Yantek, kontraktor, …) — hanya untuk sumber = web. NULL = regu HP.';
COMMENT ON COLUMN public.pemeliharaan_jaringan.foto_proses_url IS 'Foto proses pekerjaan, opsional (26 Okt 2026).';


-- ── 2. Kirim dari HP — disalin dari harjar-tugas-manual.sql; yang berubah ★ ──
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
  -- ★ foto proses pekerjaan, opsional (26 Okt 2026)
  v_fp    TEXT := NULLIF(btrim(COALESCE(p_isi->>'foto_proses_url', '')), '');
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
  IF v_fp IS NOT NULL AND v_fp NOT LIKE 'http%' THEN  -- ★
    RAISE EXCEPTION 'Foto proses belum terunggah. Kirim ulang saat sinyal lebih baik.';
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
       petugas_uid, petugas_nama, catatan, tgl, foto_sebelum_lain, foto_sesudah_lain, foto_proses_url)
    VALUES
      (v_id, t.id, v_jenis, v_peny, v_ulp, v_kat, v_kerja,
       NULLIF(btrim(COALESCE(p_isi->>'alamat', '')), ''),
       NULLIF(p_isi->>'lat', '')::double precision, NULLIF(p_isi->>'lng', '')::double precision,
       NULLIF(p_isi->>'akurasi', '')::double precision,
       v_fs, v_fd, auth.uid(), v_nama, NULLIF(btrim(COALESCE(p_isi->>'catatan', '')), ''), v_tgl, v_fs2, v_fd2, v_fp);
  ELSE
    -- Kiriman ulang yang dikembalikan: baris yang sama diperbarui.
    UPDATE public.pemeliharaan_jaringan SET
      inspeksi_id = t.id, jenis = v_jenis, penyulang = v_peny, ulp = v_ulp, kategori = v_kat,
      pekerjaan = v_kerja, alamat = NULLIF(btrim(COALESCE(p_isi->>'alamat', '')), ''),
      lat = NULLIF(p_isi->>'lat', '')::double precision, lng = NULLIF(p_isi->>'lng', '')::double precision,
      akurasi = NULLIF(p_isi->>'akurasi', '')::double precision,
      foto_sebelum_url = v_fs, foto_sesudah_url = v_fd,
      foto_sebelum_lain = v_fs2, foto_sesudah_lain = v_fd2, foto_proses_url = v_fp,
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


-- ── 3. Input admin (web) ─────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.input_pemeliharaan_jaringan_admin(p_isi JSONB)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  v_jenis TEXT := upper(btrim(COALESCE(p_isi->>'jenis', '')));
  v_peny  TEXT := upper(btrim(COALESCE(p_isi->>'penyulang', '')));
  v_kat   TEXT := p_isi->>'kategori';
  v_kerja TEXT := btrim(COALESCE(p_isi->>'pekerjaan', ''));
  v_pel   TEXT := NULLIF(btrim(COALESCE(p_isi->>'pelaksana', '')), '');
  v_fs    TEXT := COALESCE(p_isi->>'foto_sebelum_url', '');
  v_fd    TEXT := COALESCE(p_isi->>'foto_sesudah_url', '');
  v_fp    TEXT := NULLIF(btrim(COALESCE(p_isi->>'foto_proses_url', '')), '');
  v_tgl   DATE := NULLIF(p_isi->>'tgl', '')::date;
  v_oleh  TEXT := NULLIF(btrim(COALESCE(p_isi->>'oleh', '')), '');
  v_hari  DATE := (now() AT TIME ZONE 'Asia/Makassar')::date;
  v_ulp   TEXT;
  v_id    UUID := COALESCE(NULLIF(p_isi->>'id', '')::uuid, gen_random_uuid());
BEGIN
  IF v_jenis NOT IN ('JTM', 'JTR') THEN RAISE EXCEPTION 'Jenis jaringan harus JTM atau JTR'; END IF;
  IF v_peny = '' THEN RAISE EXCEPTION 'Penyulang wajib dipilih'; END IF;
  IF v_kerja = '' THEN RAISE EXCEPTION 'Pekerjaan wajib diisi'; END IF;
  IF v_pel IS NULL THEN RAISE EXCEPTION 'Tim pelaksana wajib diisi'; END IF;
  IF v_tgl IS NULL THEN RAISE EXCEPTION 'Tanggal pekerjaan wajib diisi'; END IF;
  IF v_tgl > v_hari THEN RAISE EXCEPTION 'Tanggal pekerjaan tidak boleh di masa depan.'; END IF;
  IF v_fs NOT LIKE 'http%' OR v_fd NOT LIKE 'http%' THEN
    RAISE EXCEPTION 'Foto sebelum dan sesudah dua-duanya wajib.';
  END IF;
  IF v_fp IS NOT NULL AND v_fp NOT LIKE 'http%' THEN RAISE EXCEPTION 'Foto proses belum terunggah.'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.pemeliharaan_jaringan_ref r WHERE r.kode = v_kat AND r.aktif) THEN
    RAISE EXCEPTION 'Kategori "%" tidak ada di daftar yang aktif', v_kat;
  END IF;

  SELECT upper(pr.ulp) INTO v_ulp FROM public.penyulang_ref pr WHERE upper(pr.penyulang) = v_peny LIMIT 1;
  IF v_ulp IS NULL THEN RAISE EXCEPTION 'ULP tidak diketahui untuk penyulang %', v_peny; END IF;
  PERFORM public.wajib_boleh_ulp(v_ulp);

  IF EXISTS (SELECT 1 FROM public.pemeliharaan_jaringan WHERE id = v_id) THEN
    -- Simpan ganda (klik dua kali / jawaban hilang di jalan).
    RETURN jsonb_build_object('id', v_id, 'ulp', v_ulp, 'sudah_ada', true);
  END IF;

  INSERT INTO public.pemeliharaan_jaringan
    (id, jenis, penyulang, ulp, kategori, pekerjaan, alamat, lat, lng,
     foto_sebelum_url, foto_sesudah_url, foto_proses_url,
     status, petugas_uid, petugas_nama, catatan, tgl, verified_at, verified_by,
     pelaksana, sumber, diinput_oleh)
  VALUES
    (v_id, v_jenis, v_peny, v_ulp, v_kat, v_kerja,
     NULLIF(btrim(COALESCE(p_isi->>'alamat', '')), ''),
     NULLIF(p_isi->>'lat', '')::double precision, NULLIF(p_isi->>'lng', '')::double precision,
     v_fs, v_fd, v_fp,
     -- petugas_nama = pelaksana: nama tim tampil di tabel, Excel & lampiran.
     'Diverifikasi', auth.uid(), v_pel, NULLIF(btrim(COALESCE(p_isi->>'catatan', '')), ''), v_tgl, now(), v_oleh,
     v_pel, 'web', v_oleh);

  INSERT INTO public.master_audit
    (entitas, entitas_kode, ulp, field, nilai_lama, nilai_baru, aksi, oleh_uid, oleh_nama)
  VALUES ('pemeliharaan_jaringan', v_id::text, v_ulp, 'input_admin', NULL,
          jsonb_build_object('pelaksana', v_pel, 'penyulang', v_peny, 'tgl', v_tgl, 'pekerjaan', v_kerja),
          'sunting_admin', auth.uid(), v_oleh);

  RETURN jsonb_build_object('id', v_id, 'ulp', v_ulp, 'sudah_ada', false);
END $fn$;
GRANT EXECUTE ON FUNCTION public.input_pemeliharaan_jaringan_admin(JSONB) TO authenticated;


-- ── 4. View daftar — kolom baru di belakang ──────────────────────────────────
CREATE OR REPLACE VIEW public.pemeliharaan_jaringan_daftar AS
SELECT
  p.id,
  p.jenis,
  p.penyulang,
  p.ulp,
  p.kategori,
  r.label AS kategori_label,
  p.pekerjaan,
  p.alamat,
  p.lat,
  p.lng,
  p.foto_sebelum_url,
  p.foto_sesudah_url,
  p.status,
  p.petugas_nama,
  p.catatan,
  p.tgl,
  p.verified_at,
  p.verified_by,
  p.created_at,
  p.inspeksi_id,
  p.dikembalikan_at,
  p.dikembalikan_alasan,
  p.dikembalikan_oleh,
  i.temuan          AS tugas_temuan,
  i.deskripsi       AS tugas_deskripsi,
  i.assigned_at     AS tugas_ditugaskan,
  i.foto_sebelum_url AS tugas_foto,
  p.foto_sebelum_lain,
  p.foto_sesudah_lain,
  p.foto_proses_url,                   -- ★
  p.pelaksana,                         -- ★
  p.sumber,                            -- ★
  p.diinput_oleh                       -- ★
FROM public.pemeliharaan_jaringan p
LEFT JOIN public.pemeliharaan_jaringan_ref r ON r.kode = p.kategori
LEFT JOIN public.inspeksi i ON i.id = p.inspeksi_id;
GRANT SELECT ON public.pemeliharaan_jaringan_daftar TO authenticated;

NOTIFY pgrst, 'reload schema';
