-- ════════════════════════════════════════════════════════════════════════════
-- Pangkal/ujung segmen JTM dari "Penanda tiang" (6 Okt 2026)
-- ════════════════════════════════════════════════════════════════════════════
-- Koreksi user: pilihan pangkal/ujung segmen (GI, REC, LBS …) masih daftar di
-- kode, padahal Pengaturan JTM sudah punya "Penanda tiang" (Gardu, LBS
-- Motorized, LBS, Recloser, PMT, FCO Seksi, Pengambilan, …). Sekarang pilihan
-- itu DIAMBIL dari Penanda tiang, ditambah yang bukan peralatan: GI, PLTD,
-- Tiang percabangan, dan "Akhir segmen" (AKHIR — tiang ujung jaringan).
--
-- Kode titik di segmen tetap huruf besar seperti selama ini; penanda 'recloser'
-- tetap 'REC' supaya segmen lama tidak berubah nama. Penanda baru: kode
-- penandanya dibesarkan ('lbsm' → 'LBSM' → nama "LBSM. SAMPOERNA").
--
-- Semua penjaga lewat fungsi pusat yang SUDAH dipanggil fungsi lain
-- (rintis, tutup, ubah titik, impor), jadi pemanggilnya tidak perlu disalin:
--   1. jtm_kode_titik / jtm_penanda_dari_titik — pemetaan penanda ↔ kode titik
--   2. jtm_jenis_titik_sah  — sah bila tetap ATAU ada di Penanda tiang
--   3. CHECK segmen_titik_jenis_valid → pemicu (CHECK tidak bisa membaca tabel)
--   4. segmen_label_titik   — bertitik untuk peralatan, berspasi untuk
--                             GI/PLTD/TIANG/GARDU/AKHIR
--   5. segmen_memotong      — semua peralatan memotong, kecuali PENG/TIANG/
--                             GARDU/UJUNG/AKHIR
--   6. pisah_label_titik    — impor mengenali awalan penanda baru
--   7. ubah_titik_segmen    — penanda tiang dari daftar (disalin dari versi
--                             hidup scripts/segmen-ubah-titik.sql; ★)
--
-- Nama segmen yang sudah ada TIDAK berubah. Idempoten. Jalankan SEBELUM OTA HP.
-- ════════════════════════════════════════════════════════════════════════════


-- ── 1. Pemetaan penanda ↔ kode titik ─────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.jtm_kode_titik(p_penanda TEXT)
RETURNS TEXT
LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE lower(btrim(p_penanda)) WHEN 'recloser' THEN 'REC' ELSE upper(btrim(p_penanda)) END
$$;
COMMENT ON FUNCTION public.jtm_kode_titik IS
  'Kode titik segmen dari kode Penanda tiang: recloser → REC (nama lama), selebihnya dibesarkan (lbsm → LBSM).';

CREATE OR REPLACE FUNCTION public.jtm_penanda_dari_titik(p_jenis TEXT)
RETURNS TEXT
LANGUAGE sql STABLE SET search_path = public AS $$
  SELECT r.kode FROM public.jtm_ref r
  WHERE r.kategori = 'penanda' AND public.jtm_kode_titik(r.kode) = upper(btrim(p_jenis))
  ORDER BY r.aktif DESC, r.urutan
  LIMIT 1
$$;


-- ── 2. Jenis titik yang sah ──────────────────────────────────────────────────
-- 'UJUNG' tetap TIDAK termasuk: itu keadaan "masih dirintis", bukan tempat.
-- 'AKHIR' baru: segmen ditutup di tiang ujung jaringan.
CREATE OR REPLACE FUNCTION public.jtm_jenis_titik_sah(p_jenis TEXT)
RETURNS BOOLEAN
LANGUAGE sql STABLE SET search_path = public AS $$
  SELECT COALESCE(
    upper(btrim(p_jenis)) IN ('GI','PMT','PLTD','REC','LBS','PENG','TIANG','GARDU','AKHIR')
    OR EXISTS (SELECT 1 FROM public.jtm_ref r
                WHERE r.kategori = 'penanda' AND r.aktif
                  AND public.jtm_kode_titik(r.kode) = upper(btrim(p_jenis))),
    false)
$$;


-- ── 3. CHECK → pemicu ────────────────────────────────────────────────────────
-- Hanya nilai yang BERUBAH yang diperiksa: segmen lama tidak ikut ditolak
-- kalau suatu hari penandanya dinonaktifkan.
ALTER TABLE public.segmen DROP CONSTRAINT IF EXISTS segmen_titik_jenis_valid;

CREATE OR REPLACE FUNCTION public.segmen_cek_jenis_titik()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $fn$
BEGIN
  NEW.titik_awal_jenis  := upper(btrim(NEW.titik_awal_jenis));
  NEW.titik_akhir_jenis := upper(btrim(NEW.titik_akhir_jenis));
  IF (TG_OP = 'INSERT' OR NEW.titik_awal_jenis IS DISTINCT FROM OLD.titik_awal_jenis)
     AND NEW.titik_awal_jenis <> 'UJUNG' AND NOT public.jtm_jenis_titik_sah(NEW.titik_awal_jenis) THEN
    RAISE EXCEPTION 'Jenis titik pangkal "%" tidak ada di Penanda tiang', NEW.titik_awal_jenis;
  END IF;
  IF (TG_OP = 'INSERT' OR NEW.titik_akhir_jenis IS DISTINCT FROM OLD.titik_akhir_jenis)
     AND NEW.titik_akhir_jenis <> 'UJUNG' AND NOT public.jtm_jenis_titik_sah(NEW.titik_akhir_jenis) THEN
    RAISE EXCEPTION 'Jenis titik ujung "%" tidak ada di Penanda tiang', NEW.titik_akhir_jenis;
  END IF;
  RETURN NEW;
END $fn$;

-- Nama pemicu "cek" berurutan SEBELUM "susun_nama" (pemicu BEFORE berjalan
-- menurut abjad), jadi nama disusun dari kode yang sudah dirapikan.
DROP TRIGGER IF EXISTS trg_segmen_cek_jenis ON public.segmen;
CREATE TRIGGER trg_segmen_cek_jenis
  BEFORE INSERT OR UPDATE OF titik_awal_jenis, titik_akhir_jenis ON public.segmen
  FOR EACH ROW EXECUTE FUNCTION public.segmen_cek_jenis_titik();


-- ── 4. Label titik ───────────────────────────────────────────────────────────
-- Sebelumnya: REC/LBS/PENG/PMT bertitik, lainnya berspasi. Sekarang peralatan
-- apa pun bertitik (LBSM. SAMPOERNA, FCO. PASAR); GI/PLTD/TIANG/GARDU/AKHIR
-- tetap berspasi. Hasil untuk kode lama TIDAK berubah.
CREATE OR REPLACE FUNCTION public.segmen_label_titik(p_jenis TEXT, p_nama TEXT)
RETURNS TEXT
LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE
    WHEN p_jenis IN ('UJUNG', 'AKHIR') AND COALESCE(btrim(p_nama), '') = '' THEN p_jenis
    WHEN p_jenis IN ('GI', 'PLTD', 'TIANG', 'GARDU', 'UJUNG', 'AKHIR') THEN p_jenis || ' ' || upper(btrim(p_nama))
    ELSE p_jenis || '. ' || upper(btrim(p_nama))
  END
$$;


-- ── 5. Memotong jaringan ─────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.segmen_memotong(p_jenis TEXT)
RETURNS BOOLEAN
LANGUAGE sql IMMUTABLE AS $$
  SELECT COALESCE(p_jenis NOT IN ('PENG', 'TIANG', 'GARDU', 'UJUNG', 'AKHIR'), false)
$$;
COMMENT ON FUNCTION public.segmen_memotong IS
  'Peralatan (GI/PMT/PLTD/REC/LBS/LBSM/FCO … dari Penanda tiang) memotong jaringan. PENG, TIANG, GARDU, UJUNG, AKHIR tidak.';


-- ── 6. Impor: membaca label kembali jadi jenis + nama ────────────────────────
-- Disalin dari scripts/master-segmen.sql; ★ awalan dari Penanda tiang.
CREATE OR REPLACE FUNCTION public.pisah_label_titik(p_label TEXT)
RETURNS TABLE (jenis TEXT, nama TEXT)
LANGUAGE plpgsql STABLE SET search_path = public AS $fn$
DECLARE
  t TEXT := upper(btrim(regexp_replace(COALESCE(p_label, ''), '\s+', ' ', 'g')));
  k TEXT;
BEGIN
  IF t = '' OR t = 'UJUNG' THEN
    RETURN QUERY SELECT 'UJUNG'::TEXT, ''::TEXT;
    RETURN;
  END IF;

  -- Bertitik: 'REC. BRIMOB', 'LBSM PASAR', 'PENG. SEKOLAH', 'PMT 3' — ★ yang
  -- panjang dulu supaya 'LBSM' tidak terbaca 'LBS'.
  FOR k IN
    SELECT d.x FROM (
      SELECT unnest(ARRAY['REC', 'LBS', 'PENG', 'PMT']) AS x
      UNION
      SELECT public.jtm_kode_titik(r.kode) FROM public.jtm_ref r
       WHERE r.kategori = 'penanda' AND r.kode <> 'gardu'
    ) d
    ORDER BY length(d.x) DESC, d.x
  LOOP
    IF t ~ ('^' || k || '\.?\s') THEN
      RETURN QUERY SELECT k, btrim(regexp_replace(t, '^' || k || '\.?\s+', ''));
      RETURN;
    END IF;
  END LOOP;

  -- Berspasi: 'GI AMPENAN', 'PLTD TALIWANG'
  FOREACH k IN ARRAY ARRAY['GI', 'PLTD'] LOOP
    IF t ~ ('^' || k || '\s') THEN
      RETURN QUERY SELECT k, btrim(regexp_replace(t, '^' || k || '\s+', ''));
      RETURN;
    END IF;
  END LOOP;

  RETURN QUERY SELECT 'PENG'::TEXT, t;
END $fn$;


-- ── 7. Ubah titik dari web ───────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.ubah_titik_segmen(
  p_segmen_id UUID,
  p_ujung     TEXT,            -- 'awal' | 'akhir'
  p_jenis     TEXT,
  p_nama      TEXT,
  p_oleh      TEXT DEFAULT NULL
) RETURNS TEXT
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  s        RECORD;
  v_jenis  TEXT := upper(btrim(COALESCE(p_jenis, '')));
  v_nama   TEXT := upper(regexp_replace(btrim(COALESCE(p_nama, '')), '\s+', ' ', 'g'));
  v_tiang  UUID;
  v_penanda TEXT;
  lama     TEXT;
  baru     TEXT;
  o        RECORD;
BEGIN
  IF p_ujung NOT IN ('awal', 'akhir') THEN RAISE EXCEPTION 'Ujung harus awal atau akhir'; END IF;

  SELECT * INTO s FROM public.segmen WHERE id = p_segmen_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Segmen tidak ditemukan'; END IF;
  PERFORM public.penyulang_wajib_boleh(s.ulp);

  IF s.sumber NOT IN ('lapangan', 'manual') THEN
    RAISE EXCEPTION 'Segmen % bersumber %: namanya ditulis orang — ubah lewat nama segmennya.', s.nama, s.sumber;
  END IF;
  IF s.status <> 'aktif' THEN RAISE EXCEPTION 'Segmen % tidak aktif', s.nama; END IF;
  IF p_ujung = 'akhir' AND s.titik_akhir_jenis = 'UJUNG' THEN
    RAISE EXCEPTION 'Segmen % masih dirintis — ujungnya ditentukan regu saat menyimpan segmen.', s.nama;
  END IF;
  IF NOT public.jtm_jenis_titik_sah(v_jenis) THEN RAISE EXCEPTION 'Jenis titik "%" tidak dikenal', p_jenis; END IF;
  IF v_nama = '' THEN RAISE EXCEPTION 'Nama titik wajib diisi'; END IF;

  lama := s.nama;
  v_tiang := CASE WHEN p_ujung = 'awal' THEN s.titik_awal_tiang_id ELSE s.titik_akhir_tiang_id END;

  IF p_ujung = 'awal' THEN
    UPDATE public.segmen SET titik_awal_jenis = v_jenis, titik_awal_nama = v_nama WHERE id = s.id;
  ELSE
    UPDATE public.segmen SET titik_akhir_jenis = v_jenis, titik_akhir_nama = v_nama WHERE id = s.id;
  END IF;
  SELECT nama INTO baru FROM public.segmen WHERE id = s.id;

  INSERT INTO public.master_audit
    (entitas, entitas_kode, ulp, field, nilai_lama, nilai_baru, aksi, oleh_uid, oleh_nama)
  VALUES ('segmen', baru, COALESCE(s.ulp, '-'), 'titik_' || p_ujung,
          jsonb_build_object('nama', lama),
          jsonb_build_object('nama', baru, 'jenis', v_jenis, 'titik', v_nama),
          'sunting_admin', auth.uid(), p_oleh);

  -- Segmen yang bersambung di tiang yang sama: sisi seberangnya ikut.
  IF v_tiang IS NOT NULL THEN
    FOR o IN
      SELECT id, nama FROM public.segmen
       WHERE status = 'aktif' AND id <> s.id AND sumber IN ('lapangan', 'manual')
         AND CASE WHEN p_ujung = 'akhir' THEN titik_awal_tiang_id ELSE titik_akhir_tiang_id END = v_tiang
    LOOP
      IF p_ujung = 'akhir' THEN
        UPDATE public.segmen SET titik_awal_jenis = v_jenis, titik_awal_nama = v_nama WHERE id = o.id;
      ELSE
        UPDATE public.segmen SET titik_akhir_jenis = v_jenis, titik_akhir_nama = v_nama WHERE id = o.id;
      END IF;
      INSERT INTO public.master_audit
        (entitas, entitas_kode, ulp, field, nilai_lama, nilai_baru, aksi, oleh_uid, oleh_nama)
      SELECT 'segmen', sg.nama, COALESCE(sg.ulp, '-'),
             CASE WHEN p_ujung = 'akhir' THEN 'titik_awal' ELSE 'titik_akhir' END,
             jsonb_build_object('nama', o.nama),
             jsonb_build_object('nama', sg.nama, 'ikut', baru),
             'sunting_admin', auth.uid(), p_oleh
        FROM public.segmen sg WHERE sg.id = o.id;
    END LOOP;

    -- Penanda tiang mengikuti jenis keypoint/gardu.
    -- ★ Dari daftar Penanda tiang (Pengaturan JTM), bukan daftar di kode.
    v_penanda := public.jtm_penanda_dari_titik(v_jenis);
    IF v_penanda IS NOT NULL THEN
      UPDATE public.tiang SET penanda = v_penanda, updated_at = now()
       WHERE id = v_tiang AND penanda IS DISTINCT FROM v_penanda;
    END IF;
  END IF;

  RETURN baru;
END $fn$;

GRANT EXECUTE ON FUNCTION public.ubah_titik_segmen(UUID, TEXT, TEXT, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.jtm_penanda_dari_titik(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.jtm_kode_titik(TEXT) TO authenticated;


-- ── Periksa ──────────────────────────────────────────────────────────────────
--   SELECT kode, jtm_kode_titik(kode), segmen_label_titik(jtm_kode_titik(kode), 'X')
--   FROM jtm_ref WHERE kategori = 'penanda' ORDER BY urutan;
--   SELECT * FROM pisah_label_titik('LBSM. SAMPOERNA');
