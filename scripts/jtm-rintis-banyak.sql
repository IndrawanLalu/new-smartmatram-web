-- =============================================================================
-- Rintis: BEBERAPA rintisan terbuka dalam satu penyulang (26 Nov 2026)
-- Jalankan SESUDAH jtm-ujung-terbuka.sql & jtm-hak-akses-portal.sql. Idempoten.
--
-- Masalah: `rintis_segmen_jtm` selalu MELANJUTKAN rintisan terbuka terakhir di
-- penyulang itu. Regu kedua (HP lain, akun sama atau beda) yang mau merintis
-- cabang lain (REC. ATLANTIS) dipaksa masuk ke rintisan regu pertama (TEMPIT)
-- atau membatalkannya. Begitu pula "Lanjut segmen berikutnya" sesudah menutup
-- segmen: bisa masuk ke rintisan milik HP lain.
--
--   1. Tambalan bertanda pada definisi HIDUP rintis (inti di balik pembungkus
--      hak, atau rintis_segmen_jtm sendiri): langkah "(a) lanjutkan rintisan
--      terbuka" dilewati bila `smart.rintis_baru` = '1' (hanya diset oleh
--      fungsi 3 di bawah, lokal per transaksi). HP lama tidak berubah.
--   2. rintisan_terbuka_jtm(penyulang, ulp, nama) — SEMUA rintisan terbuka:
--      jumlah tiang, perintis, yang terakhir memegang, kapan terakhir menitik.
--   3. rintis_segmen_baru_jtm(...) — selalu segmen BARU. Dikunci per penyulang
--      (dua HP menekan bersamaan tidak lahir kembar). Pangkal yang sama persis
--      dengan rintisan terbuka yang BELUM bertiang = rintisan kembar → milik
--      orang yang sama dilanjutkan, milik orang lain ditolak.
--   4. lanjutkan_rintisan_jtm(segmen, tier, nama) — melanjutkan rintisan
--      TERTENTU yang dipilih regu (bukan "yang terakhir").
-- =============================================================================


-- ── 0. Prasyarat (fungsi yang dipakai di bawah harus sudah ada) ─────────────
DO $cek$
BEGIN
  IF to_regprocedure('public._jtm_orang_sama(uuid,text,text)') IS NULL THEN
    RAISE EXCEPTION 'Jalankan dulu scripts/jtm-batal-hp.sql (_jtm_orang_sama belum ada).';
  END IF;
  IF to_regprocedure('public.wajib_kerja_ulp(text)') IS NULL THEN
    RAISE EXCEPTION 'Jalankan dulu scripts/jtm-hak-akses-portal.sql (wajib_kerja_ulp belum ada).';
  END IF;
  IF to_regprocedure('public.segmen_label_titik(text,text)') IS NULL
     OR to_regprocedure('public.mulai_inspeksi_jtm(uuid,text,text)') IS NULL THEN
    RAISE EXCEPTION 'Fungsi JTM dasar (segmen_label_titik / mulai_inspeksi_jtm) belum ada.';
  END IF;
END $cek$;


-- ── 1. Tambalan definisi hidup ───────────────────────────────────────────────
DO $patch$
DECLARE
  f      RECORD;
  def    TEXT;
  lama   CONSTANT TEXT := 'IF rintis.id IS NOT NULL THEN';
  baru   CONSTANT TEXT := 'IF rintis.id IS NOT NULL AND COALESCE(current_setting(''smart.rintis_baru'', true), '''') = '''' THEN  -- jtm-rintis-banyak.sql';
  n      INT;
  kena   INT := 0;
BEGIN
  FOR f IN
    SELECT p.oid FROM pg_proc p JOIN pg_namespace s ON s.oid = p.pronamespace
     WHERE s.nspname = 'public' AND p.proname IN ('rintis_segmen_jtm', '_rintis_segmen_jtm_inti')
  LOOP
    def := pg_get_functiondef(f.oid);
    CONTINUE WHEN position('(a) Rintisan yang masih terbuka DILANJUTKAN' IN def) = 0;  -- pembungkus hak
    IF position('jtm-rintis-banyak.sql' IN def) > 0 THEN kena := kena + 1; CONTINUE; END IF;
    n := (length(def) - length(replace(def, lama, ''))) / length(lama);
    IF n <> 1 THEN
      RAISE EXCEPTION 'Tambalan rintis: "%" ditemukan % kali di %, harus tepat sekali.', lama, n, f.oid::regprocedure;
    END IF;
    EXECUTE replace(def, lama, baru);
    kena := kena + 1;
  END LOOP;
  IF kena = 0 THEN
    RAISE EXCEPTION 'Tambalan rintis: badan rintis_segmen_jtm (penanda "(a) Rintisan yang masih terbuka DILANJUTKAN") tidak ditemukan.';
  END IF;
END $patch$;


-- ── 2. Semua rintisan terbuka ────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.rintisan_terbuka_jtm(
  p_penyulang TEXT,
  p_ulp       TEXT,
  p_nama      TEXT DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  hasil JSONB;
BEGIN
  PERFORM public.wajib_kerja_ulp(p_ulp);
  SELECT COALESCE(jsonb_agg(x.isi ORDER BY x.terakhir DESC), '[]'::jsonb) INTO hasil
  FROM (
    SELECT jsonb_build_object(
             'id',        s.id,
             'nama',      s.nama,
             'pangkal',   public.segmen_label_titik(s.titik_awal_jenis, s.titik_awal_nama),
             'tiang',     (SELECT count(*) FROM public.segmen_tiang st WHERE st.segmen_id = s.id),
             'perintis',  awal.petugas_nama,
             'petugas',   kini.petugas_nama,
             'status',    kini.status,
             'terakhir',  GREATEST(s.created_at, kini.updated_at, titik.terakhir),
             'milik_saya', kini.id IS NOT NULL AND public._jtm_orang_sama(kini.petugas_uid, kini.petugas_nama, p_nama)
           ) AS isi,
           GREATEST(s.created_at, kini.updated_at, titik.terakhir) AS terakhir
    FROM public.segmen s
    LEFT JOIN LATERAL (
      SELECT i.petugas_nama FROM public.inspeksi_jtm i
       WHERE i.segmen_id = s.id ORDER BY i.created_at LIMIT 1) awal ON true
    LEFT JOIN LATERAL (
      SELECT i.id, i.petugas_nama, i.petugas_uid, i.status, i.updated_at FROM public.inspeksi_jtm i
       WHERE i.segmen_id = s.id AND i.tier = '1'
         AND i.status IN ('Dijadwalkan', 'Dalam Proses', 'Selesai', 'Ditolak')
       ORDER BY i.created_at DESC LIMIT 1) kini ON true
    LEFT JOIN LATERAL (
      SELECT max(t.dinilai_at) AS terakhir FROM public.inspeksi_jtm_titik t
       WHERE t.inspeksi_id = kini.id) titik ON true
    WHERE upper(s.penyulang) = upper(btrim(COALESCE(p_penyulang, '')))
      AND upper(s.ulp) = upper(btrim(COALESCE(p_ulp, '')))
      AND s.status = 'aktif'
      AND s.titik_akhir_jenis = 'UJUNG'
      AND s.sumber = 'lapangan'
  ) x;
  RETURN hasil;
END $fn$;
REVOKE ALL ON FUNCTION public.rintisan_terbuka_jtm(TEXT, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rintisan_terbuka_jtm(TEXT, TEXT, TEXT) TO authenticated;


-- ── 3. Rintis segmen BARU walau ada rintisan lain yang terbuka ───────────────
CREATE OR REPLACE FUNCTION public.rintis_segmen_baru_jtm(
  p_penyulang     TEXT,
  p_ulp           TEXT,
  p_jenis_awal    TEXT DEFAULT NULL,
  p_nama_awal     TEXT DEFAULT NULL,
  p_tiang_awal_id UUID DEFAULT NULL,
  p_tier          TEXT DEFAULT '1',
  p_nama          TEXT DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  v_penyulang TEXT := upper(btrim(COALESCE(p_penyulang, '')));
  v_ulp       TEXT := upper(btrim(COALESCE(p_ulp, '')));
  v_jenis     TEXT := upper(btrim(COALESCE(p_jenis_awal, '')));
  v_nama_awal TEXT := upper(btrim(COALESCE(p_nama_awal, '')));
  kembar      RECORD;
  awal        RECORD;
  hasil       JSONB;
BEGIN
  IF v_penyulang = '' OR v_ulp = '' THEN RAISE EXCEPTION 'Penyulang dan ULP wajib diisi'; END IF;
  PERFORM public.wajib_kerja_ulp(v_ulp);

  -- Dua HP menekan "Mulai" bersamaan di penyulang yang sama: yang kedua
  -- menunggu yang pertama selesai, lalu melihat rintisannya di bawah.
  PERFORM pg_advisory_xact_lock(hashtext('rintis_jtm|' || v_penyulang || '|' || v_ulp));

  -- Rintisan kembar = rintisan terbuka dari pangkal yang SAMA yang belum
  -- punya satu tiang pun. Yang sudah bertiang dari pangkal sama = cabang lain
  -- (percabangan di tiang itu), boleh.
  IF p_tiang_awal_id IS NOT NULL OR v_jenis <> '' THEN
    SELECT s.id, s.nama INTO kembar
      FROM public.segmen s
     WHERE upper(s.penyulang) = v_penyulang AND upper(s.ulp) = v_ulp
       AND s.status = 'aktif' AND s.titik_akhir_jenis = 'UJUNG' AND s.sumber = 'lapangan'
       AND CASE WHEN p_tiang_awal_id IS NOT NULL THEN s.titik_awal_tiang_id = p_tiang_awal_id
                ELSE s.titik_awal_tiang_id IS NULL
                     AND upper(s.titik_awal_jenis) = v_jenis
                     AND upper(btrim(COALESCE(s.titik_awal_nama, ''))) = v_nama_awal END
       AND NOT EXISTS (SELECT 1 FROM public.segmen_tiang st WHERE st.segmen_id = s.id)
     ORDER BY s.created_at DESC
     LIMIT 1;

    IF kembar.id IS NOT NULL THEN
      SELECT i.petugas_uid, i.petugas_nama INTO awal FROM public.inspeksi_jtm i
       WHERE i.segmen_id = kembar.id ORDER BY i.created_at LIMIT 1;
      IF public._jtm_orang_sama(awal.petugas_uid, awal.petugas_nama, p_nama) THEN
        -- Tekan ganda / buka ulang dari HP yang sama: pakai yang sudah ada.
        RETURN jsonb_build_object(
          'segmen_id',   kembar.id,
          'inspeksi_id', public.mulai_inspeksi_jtm(kembar.id, p_tier, p_nama),
          'nama',        kembar.nama,
          'dilanjutkan', true);
      END IF;
      RAISE EXCEPTION 'Dari pangkal ini baru saja dirintis % oleh % dan belum ada tiangnya. Pilih pangkal lain, atau lanjutkan rintisan itu dari daftar "Rintisan belum ditutup".',
        kembar.nama, COALESCE(awal.petugas_nama, 'petugas lain');
    END IF;
  END IF;

  PERFORM set_config('smart.rintis_baru', '1', true);
  hasil := public.rintis_segmen_jtm(
    p_penyulang     => p_penyulang,
    p_ulp           => p_ulp,
    p_jenis_awal    => p_jenis_awal,
    p_nama_awal     => p_nama_awal,
    p_tiang_awal_id => p_tiang_awal_id,
    p_tier          => p_tier,
    p_nama          => p_nama);
  PERFORM set_config('smart.rintis_baru', '', true);

  -- Penjaga: tambalan (1) hilang (definisi ditimpa skrip lain) → jangan diam-
  -- diam masuk ke rintisan orang lain.
  IF COALESCE((hasil->>'dilanjutkan')::boolean, false) THEN
    RAISE EXCEPTION 'Server belum mendukung beberapa rintisan dalam satu penyulang — jalankan ulang scripts/jtm-rintis-banyak.sql.';
  END IF;
  RETURN hasil;
END $fn$;
REVOKE ALL ON FUNCTION public.rintis_segmen_baru_jtm(TEXT, TEXT, TEXT, TEXT, UUID, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rintis_segmen_baru_jtm(TEXT, TEXT, TEXT, TEXT, UUID, TEXT, TEXT) TO authenticated;


-- ── 4. Lanjutkan rintisan yang DIPILIH ───────────────────────────────────────
CREATE OR REPLACE FUNCTION public.lanjutkan_rintisan_jtm(
  p_segmen_id UUID,
  p_tier      TEXT DEFAULT '1',
  p_nama      TEXT DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  s RECORD;
BEGIN
  SELECT id, nama, ulp, status, sumber, titik_akhir_jenis INTO s
    FROM public.segmen WHERE id = p_segmen_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Segmen tidak ditemukan'; END IF;
  PERFORM public.wajib_kerja_ulp(s.ulp);
  IF s.status <> 'aktif' THEN RAISE EXCEPTION 'Segmen % sudah dibatalkan.', s.nama; END IF;
  IF s.sumber IS DISTINCT FROM 'lapangan' OR s.titik_akhir_jenis IS DISTINCT FROM 'UJUNG' THEN
    RAISE EXCEPTION 'Segmen % sudah ditutup — bukan rintisan terbuka lagi. Muat ulang daftarnya.', s.nama;
  END IF;
  RETURN jsonb_build_object(
    'segmen_id',   s.id,
    'inspeksi_id', public.mulai_inspeksi_jtm(s.id, p_tier, p_nama),
    'nama',        s.nama,
    'dilanjutkan', true);
END $fn$;
REVOKE ALL ON FUNCTION public.lanjutkan_rintisan_jtm(UUID, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.lanjutkan_rintisan_jtm(UUID, TEXT, TEXT) TO authenticated;

NOTIFY pgrst, 'reload schema';


-- ── Periksa (semua harus true / berjalan) ────────────────────────────────────
--   SELECT bool_or(position('jtm-rintis-banyak.sql' IN pg_get_functiondef(p.oid)) > 0)
--     FROM pg_proc p JOIN pg_namespace s ON s.oid = p.pronamespace
--    WHERE s.nspname = 'public' AND p.proname IN ('rintis_segmen_jtm', '_rintis_segmen_jtm_inti');
--   SELECT public.rintisan_terbuka_jtm('TERONG TAWAH', 'CAKRANEGARA', NULL);  -- ganti penyulang/ULP
