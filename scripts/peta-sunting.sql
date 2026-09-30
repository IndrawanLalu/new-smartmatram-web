-- =============================================================================
-- Peta Jaringan — Tahap 2: geser titik & ubah atribut tiang dari peta
-- Jalankan SESUDAH peta-jaringan-hidup.sql, ganti-nama-penyulang.sql
-- (penyulang_wajib_boleh), pengukuran-kunci-titik.sql. Aman diulang.
--
-- Fungsi yang sudah ada (`koreksi_titik_tiang_jtm`, `koreksi_titik_gardu`, …)
-- dirancang untuk REGU DI LAPANGAN: menjaga akurasi GPS, bukan hak ULP. Yang
-- di sini untuk ADMIN di depan peta, jadi penjaganya berbeda:
--   • hak: UP3 semua ULP, admin hanya ULP-nya sendiri (`penyulang_wajib_boleh`);
--   • alasan WAJIB — pergeseran tanpa alasan tidak bisa dipertanggungjawabkan;
--   • tercatat di master_audit, nilai lama & baru.
-- Panjang gawang, segmen, KMS, dan rute peta dihitung ulang sendiri: semuanya
-- diturunkan dari koordinat, dan rute ditandai kotor oleh pemicu Tahap 1.
-- =============================================================================


-- ── 1. Geser titik tiang ─────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.geser_titik_tiang(
  p_id     UUID,
  p_lat    DOUBLE PRECISION,
  p_lng    DOUBLE PRECISION,
  p_alasan TEXT,
  p_oleh   TEXT DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  t     RECORD;
  jarak DOUBLE PRECISION;
BEGIN
  IF btrim(COALESCE(p_alasan, '')) = '' THEN RAISE EXCEPTION 'Alasan menggeser titik wajib diisi'; END IF;
  IF p_lat IS NULL OR p_lng IS NULL OR p_lat NOT BETWEEN -90 AND 90 OR p_lng NOT BETWEEN -180 AND 180 THEN
    RAISE EXCEPTION 'Titik baru tidak sah';
  END IF;

  SELECT * INTO t FROM public.tiang WHERE id = p_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Tiang tidak ditemukan'; END IF;
  IF t.status_hidup <> 'aktif' THEN RAISE EXCEPTION 'Tiang % sudah %', t.kode, t.status_hidup; END IF;
  PERFORM public.penyulang_wajib_boleh(t.ulp);

  jarak := public.jarak_meter(t.lat, t.lng, p_lat, p_lng);

  UPDATE public.tiang SET lat = p_lat, lng = p_lng, updated_at = now() WHERE id = p_id;

  INSERT INTO public.master_audit
    (entitas, entitas_kode, ulp, field, nilai_lama, nilai_baru, aksi, oleh_uid, oleh_nama)
  VALUES ('tiang', COALESCE(t.kode, p_id::text), COALESCE(t.ulp, '-'), 'koordinat',
          jsonb_build_object('lat', t.lat, 'lng', t.lng),
          jsonb_build_object('lat', p_lat, 'lng', p_lng, 'geser_m', round(jarak::numeric, 1),
                             'alasan', btrim(p_alasan), 'lewat', 'peta'),
          'sunting_admin', auth.uid(), p_oleh);

  RETURN jsonb_build_object('kode', t.kode, 'geser_m', round(jarak::numeric, 1));
END $$;


-- ── 2. Geser titik gardu ─────────────────────────────────────────────────────
-- Ditolak selama gardu itu masih punya usulan titik yang MENUNGGU. Usulan
-- titik dari pengukuran sudah diterapkan ke master; menolaknya kelak akan
-- MENGEMBALIKAN titik lama — dan menimpa geseran admin tanpa ada yang sadar.

CREATE OR REPLACE FUNCTION public.geser_titik_gardu(
  p_kode   TEXT,
  p_ulp    TEXT,
  p_lat    DOUBLE PRECISION,
  p_lng    DOUBLE PRECISION,
  p_alasan TEXT,
  p_oleh   TEXT DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  g     RECORD;
  jarak DOUBLE PRECISION;
BEGIN
  IF btrim(COALESCE(p_alasan, '')) = '' THEN RAISE EXCEPTION 'Alasan menggeser titik wajib diisi'; END IF;
  IF p_lat IS NULL OR p_lng IS NULL OR p_lat NOT BETWEEN -90 AND 90 OR p_lng NOT BETWEEN -180 AND 180 THEN
    RAISE EXCEPTION 'Titik baru tidak sah';
  END IF;

  SELECT * INTO g FROM public.gardu
  WHERE upper(kode) = upper(btrim(p_kode)) AND upper(ulp) = upper(btrim(p_ulp));
  IF NOT FOUND THEN RAISE EXCEPTION 'Gardu % tidak ditemukan', p_kode; END IF;
  PERFORM public.penyulang_wajib_boleh(g.ulp);

  IF EXISTS (
    SELECT 1 FROM public.master_usulan
    WHERE entitas = 'gardu' AND upper(entitas_kode) = upper(g.kode) AND upper(ulp) = upper(g.ulp)
      AND field = 'koordinat' AND status = 'menunggu'
  ) THEN
    RAISE EXCEPTION 'Gardu % masih punya usulan titik yang menunggu persetujuan. Putuskan dulu di Pengukuran Gardu → Persetujuan.', g.kode;
  END IF;

  jarak := CASE WHEN g.lat IS NULL OR g.lng IS NULL THEN NULL
                ELSE public.jarak_meter(g.lat::double precision, g.lng::double precision, p_lat, p_lng) END;

  UPDATE public.gardu SET lat = p_lat, lng = p_lng
  WHERE upper(kode) = upper(g.kode) AND upper(ulp) = upper(g.ulp);

  INSERT INTO public.master_audit
    (entitas, entitas_kode, ulp, field, nilai_lama, nilai_baru, aksi, oleh_uid, oleh_nama)
  VALUES ('gardu', upper(g.kode), upper(g.ulp), 'koordinat',
          CASE WHEN g.lat IS NULL THEN NULL ELSE jsonb_build_object('lat', g.lat, 'lng', g.lng) END,
          jsonb_build_object('lat', p_lat, 'lng', p_lng, 'geser_m', round(jarak::numeric, 1),
                             'alasan', btrim(p_alasan), 'lewat', 'peta'),
          'sunting_admin', auth.uid(), p_oleh);

  RETURN jsonb_build_object('kode', g.kode, 'geser_m', round(jarak::numeric, 1));
END $$;


-- ── 3. Ubah atribut tiang ────────────────────────────────────────────────────
-- Hanya medan MASTER yang boleh disunting dari meja. Keadaan (kondisi, temuan)
-- sengaja tidak — itu hasil pemeriksaan di lapangan, bukan data yang diketik.
--   JTM : jenis, konstruksi, nomor_lama, penanda
--   JTR : jenis, tinggi
-- Satu baris audit per medan yang benar-benar berubah.

CREATE OR REPLACE FUNCTION public.ubah_atribut_tiang(
  p_id    UUID,
  p_isi   JSONB,
  p_oleh  TEXT DEFAULT NULL
) RETURNS INT
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  t      RECORD;
  boleh  TEXT[];
  f      TEXT;
  lama   TEXT;
  baru   TEXT;
  n      INT := 0;
BEGIN
  SELECT * INTO t FROM public.tiang WHERE id = p_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Tiang tidak ditemukan'; END IF;
  IF t.status_hidup <> 'aktif' THEN RAISE EXCEPTION 'Tiang % sudah %', t.kode, t.status_hidup; END IF;
  PERFORM public.penyulang_wajib_boleh(t.ulp);

  boleh := CASE WHEN t.gardu_kode IS NULL
                THEN ARRAY['jenis', 'konstruksi', 'nomor_lama', 'penanda']
                ELSE ARRAY['jenis', 'tinggi'] END;

  FOR f IN SELECT jsonb_object_keys(COALESCE(p_isi, '{}'::jsonb)) LOOP
    IF NOT (f = ANY (boleh)) THEN
      RAISE EXCEPTION 'Isian "%" tidak bisa diubah dari peta', f;
    END IF;
    baru := NULLIF(btrim(COALESCE(p_isi->>f, '')), '');

    IF f = 'penanda' AND baru IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM public.jtm_ref WHERE kategori = 'penanda' AND kode = baru AND aktif) THEN
      RAISE EXCEPTION 'Penanda "%" tidak dikenal', baru;
    END IF;
    IF f = 'tinggi' AND baru IS NOT NULL AND baru !~ '^[0-9]+([.,][0-9]+)?$' THEN
      RAISE EXCEPTION 'Tinggi tiang harus angka meter';
    END IF;

    EXECUTE format('SELECT (%I)::text FROM public.tiang WHERE id = $1', f) INTO lama USING p_id;
    IF lama IS NOT DISTINCT FROM baru
       OR (f = 'tinggi' AND lama IS NOT NULL AND baru IS NOT NULL
           AND lama::numeric = replace(baru, ',', '.')::numeric) THEN
      CONTINUE;
    END IF;

    IF f = 'tinggi' THEN
      UPDATE public.tiang SET tinggi = replace(baru, ',', '.')::numeric, updated_at = now() WHERE id = p_id;
    ELSE
      EXECUTE format('UPDATE public.tiang SET %I = $1, updated_at = now() WHERE id = $2', f) USING baru, p_id;
    END IF;

    INSERT INTO public.master_audit
      (entitas, entitas_kode, ulp, field, nilai_lama, nilai_baru, aksi, oleh_uid, oleh_nama)
    VALUES ('tiang', COALESCE(t.kode, p_id::text), COALESCE(t.ulp, '-'), f,
            to_jsonb(lama), jsonb_build_object('nilai', baru, 'lewat', 'peta'),
            'sunting_admin', auth.uid(), p_oleh);
    n := n + 1;
  END LOOP;

  RETURN n;
END $$;


GRANT EXECUTE ON FUNCTION public.geser_titik_tiang(UUID, DOUBLE PRECISION, DOUBLE PRECISION, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.geser_titik_gardu(TEXT, TEXT, DOUBLE PRECISION, DOUBLE PRECISION, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.ubah_atribut_tiang(UUID, JSONB, TEXT) TO authenticated;


-- =============================================================================
-- Periksa (fungsi plpgsql wajib diuji dengan DIPANGGIL):
--   SELECT proname FROM pg_proc WHERE proname IN
--     ('geser_titik_tiang', 'geser_titik_gardu', 'ubah_atribut_tiang');   -- 3 baris
--   Uji sungguhan dari peta: geser satu gardu, lalu
--   SELECT * FROM master_audit WHERE field = 'koordinat' ORDER BY pada DESC LIMIT 1;
-- =============================================================================
