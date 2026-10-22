-- =============================================================================
-- Tambah & Pulihkan tiang JTM dari peta (22 Okt 2026, rencana-tambah-tiang-peta.md).
-- Jalankan SESUDAH jtm-cabang-per-penyulang.sql. Idempoten (aman diulang).
--
--   T1  pulihkan_tiang_jtm   — tiang yang SALAH DIBATALKAN dihidupkan lagi:
--                              id, riwayat inspeksi & foto tetap; nama
--                              penyulang dikembalikan dari audit pembatalan
--                              (`nama_dibuang`); masuk lagi ke segmen induknya.
--   T2  tambah_tiang_meja_jtm — tiang yang LOLOS dititik ditambahkan admin:
--                              • sisipan di antara A → B: nama = nama A + huruf
--                                (GNS-018a, keputusan user), semua penyulang
--                                yang lewat A dan B ikut menamainya; B pindah
--                                menyambung dari tiang baru;
--                              • lanjutan / cabang dari A: nama dari mesin yang
--                                sama dengan HP (`jtm_nama_baru`).
--                              Langsung sah (keputusan user) — asalnya tercatat:
--                              tiang.sumber = 'meja' + master_audit.
--
-- "Sambung hilir" di peta tidak butuh SQL baru: ubah_induk_tiang_jtm dengan
-- tiang yang diklik sebagai anak.
-- =============================================================================


-- ── Bantu: segmen induk (di penyulang itu) yang ikut memuat tiang ini ───────
-- p_anak NULL = semua segmen induk; ada = hanya segmen yang memuat keduanya
-- (sisipan berada di antara induk & anak, jadi di segmen yang sama).
CREATE OR REPLACE FUNCTION public._jtm_masuk_segmen_induk(
  p_tiang UUID, p_induk UUID, p_anak UUID, p_penyulang TEXT, p_sumber TEXT
) RETURNS TEXT[]
LANGUAGE plpgsql SET search_path = public AS $$
DECLARE nama TEXT[];
BEGIN
  WITH masuk AS (
    INSERT INTO public.segmen_tiang (segmen_id, tiang_id, posisi, sumber)
    SELECT st.segmen_id, p_tiang, st.posisi, p_sumber
    FROM public.segmen_tiang st
    JOIN public.segmen s ON s.id = st.segmen_id AND s.status = 'aktif' AND upper(s.penyulang) = upper(p_penyulang)
    WHERE st.tiang_id = p_induk
      AND (p_anak IS NULL OR EXISTS (SELECT 1 FROM public.segmen_tiang s2
                                      WHERE s2.segmen_id = st.segmen_id AND s2.tiang_id = p_anak))
    ON CONFLICT DO NOTHING
    RETURNING segmen_id
  )
  SELECT array_agg(s.nama ORDER BY s.nama) INTO nama FROM masuk m JOIN public.segmen s ON s.id = m.segmen_id;
  RETURN COALESCE(nama, '{}');
END $$;
REVOKE ALL ON FUNCTION public._jtm_masuk_segmen_induk(UUID, UUID, UUID, TEXT, TEXT) FROM PUBLIC;


-- ── T1. Pulihkan ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.pulihkan_tiang_jtm(
  p_id       UUID,
  p_induk_id UUID DEFAULT NULL,   -- NULL = induk sebelum dibatalkan
  p_alasan   TEXT DEFAULT NULL,
  p_oleh     TEXT DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  t        RECORD;
  v_induk  UUID;
  v_ulp    TEXT;
  dibuang  JSONB;
  x        TEXT;
  p        TEXT;
  k        TEXT;
  utama_p  TEXT;
  utama_k  TEXT;
  nama     JSONB := '[]'::jsonb;
  diganti  JSONB := '[]'::jsonb;
  segmen   TEXT[] := '{}';
  r        RECORD;
BEGIN
  SELECT * INTO t FROM public.tiang WHERE id = p_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Tiang tidak ditemukan'; END IF;
  IF t.gardu_kode IS NOT NULL THEN RAISE EXCEPTION 'Pulihkan dari peta baru untuk tiang JTM'; END IF;
  IF t.status_hidup <> 'batal' THEN RAISE EXCEPTION 'Tiang % tidak berstatus dibatalkan', t.kode; END IF;
  PERFORM public.wajib_boleh_ulp(t.ulp);
  IF btrim(COALESCE(p_alasan, '')) = '' THEN RAISE EXCEPTION 'Alasan wajib diisi'; END IF;
  v_ulp := COALESCE(t.ulp, '-');

  v_induk := COALESCE(p_induk_id, t.induk_id);
  IF v_induk IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.tiang WHERE id = v_induk AND status_hidup = 'aktif') THEN
    RAISE EXCEPTION 'Induk lama % tidak aktif lagi — pilih induk lain di peta',
      (SELECT kode FROM public.tiang WHERE id = v_induk);
  END IF;

  -- Nama per penyulang dari audit pembatalan terakhir (batalkan_tiang
  -- menghapusnya dan mencatat 'PENYULANG=KODE').
  SELECT a.nilai_baru->'nama_dibuang' INTO dibuang
  FROM public.master_audit a
  WHERE a.entitas = 'tiang' AND a.aksi = 'batal_salah_input' AND a.field = 'status_hidup'
    AND a.entitas_kode = t.kode AND upper(a.ulp) = upper(v_ulp)
  ORDER BY a.pada DESC LIMIT 1;
  IF dibuang IS NULL OR jsonb_array_length(dibuang) = 0 THEN
    dibuang := jsonb_build_array(COALESCE(t.penyulang, '') || '=' || t.kode);
  END IF;

  -- Nama yang sudah dipakai tiang lain sejak dibatalkan → nama dari aturan
  -- induknya (mesin yang sama dengan HP).
  FOR x IN SELECT jsonb_array_elements_text(dibuang) LOOP
    p := split_part(x, '=', 1);
    k := substr(x, length(p) + 2);
    CONTINUE WHEN btrim(p) = '' OR btrim(k) = '';
    IF EXISTS (SELECT 1 FROM public.tiang_kode_penyulang kp
               WHERE upper(kp.penyulang) = upper(p) AND upper(kp.ulp) = upper(v_ulp)
                 AND upper(kp.kode) = upper(k) AND kp.tiang_id <> p_id) THEN
      SELECT h.kode INTO k FROM public.jtm_nama_baru(v_induk, t.lat, t.lng, false, p, v_ulp, p_id) h;
      diganti := diganti || jsonb_build_object('penyulang', p, 'lama', substr(x, length(p) + 2), 'baru', k);
    END IF;
    nama := nama || jsonb_build_object('penyulang', p, 'kode', k);
    IF utama_p IS NULL OR upper(p) = upper(COALESCE(t.penyulang, '')) THEN
      utama_p := p; utama_k := k;
    END IF;
  END LOOP;
  IF utama_p IS NULL THEN RAISE EXCEPTION 'Nama tiang ini sebelum dibatalkan tidak ditemukan'; END IF;

  -- Hidup lagi. `kode`/`penyulang` di SET → pemicu cermin menulis nama utama.
  UPDATE public.tiang
  SET status_hidup = 'aktif', aktif_sampai = NULL, catatan = NULL,
      induk_id = v_induk, penyulang = utama_p, kode = utama_k, updated_at = now()
  WHERE id = p_id;

  FOR r IN SELECT e->>'penyulang' AS p, e->>'kode' AS k FROM jsonb_array_elements(nama) e LOOP
    INSERT INTO public.tiang_kode_penyulang (tiang_id, penyulang, ulp, kode, utama)
    VALUES (p_id, r.p, v_ulp, r.k, upper(r.p) = upper(utama_p))
    ON CONFLICT (tiang_id, penyulang) DO NOTHING;
    IF v_induk IS NOT NULL THEN
      segmen := segmen || public._jtm_masuk_segmen_induk(p_id, v_induk, NULL, r.p, 'meja');
    END IF;
  END LOOP;

  INSERT INTO public.master_audit
    (entitas, entitas_kode, ulp, field, nilai_lama, nilai_baru, aksi, oleh_uid, oleh_nama)
  VALUES ('tiang', utama_k, v_ulp, 'status_hidup', to_jsonb('batal'::text),
          jsonb_build_object('status', 'aktif', 'alasan', p_alasan, 'nama', nama, 'nama_diganti', diganti,
                             'induk', (SELECT kode FROM public.tiang WHERE id = v_induk), 'segmen', to_jsonb(segmen)),
          'pulihkan_tiang', auth.uid(), p_oleh);

  RETURN jsonb_build_object('id', p_id, 'kode', utama_k, 'nama', nama, 'nama_diganti', diganti,
                            'segmen', to_jsonb(segmen), 'lat', t.lat, 'lng', t.lng);
END $$;
GRANT EXECUTE ON FUNCTION public.pulihkan_tiang_jtm(UUID, UUID, TEXT, TEXT) TO authenticated;


-- ── T2. Tambah dari meja ─────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.tambah_tiang_meja_jtm(
  p_induk_id    UUID,
  p_lat         DOUBLE PRECISION,
  p_lng         DOUBLE PRECISION,
  p_anak_id     UUID DEFAULT NULL,   -- ada = SISIPAN di antara induk & anak ini
  p_penyulang   TEXT DEFAULT NULL,   -- lapisan yang sedang disunting (lanjutan/cabang)
  p_batang_beda BOOLEAN DEFAULT false,
  p_alasan      TEXT DEFAULT NULL,
  p_oleh        TEXT DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  i        RECORD;
  a        RECORD;
  amb      public.jtm_settings%ROWTYPE;
  dekat    RECORD;
  v_ulp    TEXT;
  r        RECORD;
  huruf    TEXT;
  nama     JSONB := '[]'::jsonb;
  utama_p  TEXT;
  utama_k  TEXT;
  id_baru  UUID;
  segmen   TEXT[] := '{}';
BEGIN
  SELECT * INTO i FROM public.tiang WHERE id = p_induk_id;
  IF NOT FOUND OR i.status_hidup <> 'aktif' THEN RAISE EXCEPTION 'Tiang induk tidak ditemukan / tidak aktif'; END IF;
  IF i.gardu_kode IS NOT NULL THEN RAISE EXCEPTION 'Tambah tiang dari peta baru untuk JTM'; END IF;
  PERFORM public.wajib_boleh_ulp(i.ulp);
  IF btrim(COALESCE(p_alasan, '')) = '' THEN RAISE EXCEPTION 'Alasan wajib diisi'; END IF;
  IF p_lat IS NULL OR p_lng IS NULL THEN RAISE EXCEPTION 'Letak tiang belum ditentukan'; END IF;
  v_ulp := COALESCE(i.ulp, '-');

  -- Penjaga batang ganda — sama dengan HP (tambah_tiang_jtm): pertanyaan,
  -- bukan larangan.
  SELECT * INTO amb FROM public.jtm_ambang(i.ulp);
  SELECT t.id, t.kode, t.penyulang, public.jarak_meter(p_lat, p_lng, t.lat, t.lng) AS m INTO dekat
  FROM public.tiang t
  WHERE t.status_hidup = 'aktif' AND t.lat IS NOT NULL AND upper(COALESCE(t.ulp, '')) = upper(v_ulp)
  ORDER BY public.jarak_meter(p_lat, p_lng, t.lat, t.lng) LIMIT 1;
  IF dekat.kode IS NOT NULL AND dekat.m <= amb.radius_tumpang_m AND NOT COALESCE(p_batang_beda, false) THEN
    RAISE EXCEPTION 'Tiang % (penyulang %) sudah berdiri % m dari titik ini. Centang "batang berbeda" kalau memang dua batang.',
      dekat.kode, dekat.penyulang, round(dekat.m::numeric, 1);
  END IF;

  IF p_anak_id IS NOT NULL THEN
    -- ── Sisipan A → (baru) → B ──
    SELECT * INTO a FROM public.tiang WHERE id = p_anak_id AND status_hidup = 'aktif';
    IF NOT FOUND THEN RAISE EXCEPTION 'Tiang sesudahnya tidak ditemukan / tidak aktif'; END IF;
    IF NOT (a.induk_id = p_induk_id
            OR EXISTS (SELECT 1 FROM public.tiang_kode_penyulang WHERE tiang_id = p_anak_id AND induk_id = p_induk_id)) THEN
      RAISE EXCEPTION '% tidak menyambung dari % — sisipan hanya di antara tiang dan tiang sesudahnya', a.kode, i.kode;
    END IF;

    -- Semua penyulang yang lewat A dan B: nama A + huruf berikutnya.
    FOR r IN
      SELECT ki.penyulang AS p, ki.kode AS k
      FROM public.tiang_kode_penyulang ki
      JOIN public.tiang_kode_penyulang ka ON ka.tiang_id = p_anak_id AND upper(ka.penyulang) = upper(ki.penyulang)
      WHERE ki.tiang_id = p_induk_id
      ORDER BY ki.utama DESC, ki.penyulang
    LOOP
      SELECT COALESCE(max(right(x.kode, 1)), '') INTO huruf
      FROM public.tiang_kode_penyulang x
      WHERE upper(x.penyulang) = upper(r.p) AND upper(x.ulp) = upper(v_ulp)
        AND length(x.kode) = length(r.k) + 1 AND left(upper(x.kode), length(r.k)) = upper(r.k)
        AND right(x.kode, 1) ~ '^[a-z]$';
      IF huruf = 'z' THEN RAISE EXCEPTION 'Sisipan sesudah % sudah sampai huruf z — rapikan nama dulu', r.k; END IF;
      nama := nama || jsonb_build_object('penyulang', r.p,
                                         'kode', r.k || CASE WHEN huruf = '' THEN 'a' ELSE chr(ascii(huruf) + 1) END);
    END LOOP;
    IF jsonb_array_length(nama) = 0 THEN
      RAISE EXCEPTION '% dan % tidak dilewati penyulang yang sama', i.kode, a.kode;
    END IF;
    SELECT e->>'penyulang', e->>'kode' INTO utama_p, utama_k
    FROM jsonb_array_elements(nama) e
    ORDER BY (upper(e->>'penyulang') = upper(COALESCE(p_penyulang, ''))) DESC,
             (upper(e->>'penyulang') = upper(COALESCE(i.penyulang, ''))) DESC
    LIMIT 1;
  ELSE
    -- ── Lanjutan / cabang dari A: penyulang lapisan yang disunting ──
    utama_p := COALESCE(NULLIF(btrim(COALESCE(p_penyulang, '')), ''), i.penyulang);
    IF NOT EXISTS (SELECT 1 FROM public.tiang_kode_penyulang
                   WHERE tiang_id = p_induk_id AND upper(penyulang) = upper(utama_p)) THEN
      RAISE EXCEPTION '% tidak dilewati penyulang %', i.kode, utama_p;
    END IF;
  END IF;

  -- kode NULL → pemicu tiang_buat_kode_jtm memberi nama lewat jtm_nama_baru.
  INSERT INTO public.tiang
    (penyulang, feeder, ulp, lat, lng, induk_id, kode, cabang_baru, sumber, status_hidup, dikonfirmasi_at, dikonfirmasi_oleh,
     beda_dari_tiang_id, beda_dari_jarak_m)
  VALUES (utama_p, utama_p, v_ulp, p_lat, p_lng, p_induk_id, utama_k, false, 'meja', 'aktif', now(), p_oleh,
          CASE WHEN COALESCE(p_batang_beda, false) AND dekat.m <= amb.radius_tumpang_m THEN dekat.id END,
          CASE WHEN COALESCE(p_batang_beda, false) AND dekat.m <= amb.radius_tumpang_m THEN round(dekat.m::numeric, 1) END)
  RETURNING id, kode INTO id_baru, utama_k;
  IF jsonb_array_length(nama) = 0 THEN
    nama := jsonb_build_array(jsonb_build_object('penyulang', utama_p, 'kode', utama_k));
  END IF;

  -- Nama penyulang penumpang (sisipan) — yang utama ditulis pemicu cermin.
  FOR r IN SELECT e->>'penyulang' AS p, e->>'kode' AS k FROM jsonb_array_elements(nama) e LOOP
    INSERT INTO public.tiang_kode_penyulang (tiang_id, penyulang, ulp, kode, utama)
    VALUES (id_baru, r.p, v_ulp, r.k, upper(r.p) = upper(utama_p))
    ON CONFLICT (tiang_id, penyulang) DO NOTHING;
  END LOOP;

  IF p_anak_id IS NOT NULL THEN
    -- B menyambung dari tiang baru — di batang, dan di penyulang yang induknya
    -- diatur khusus ke A.
    UPDATE public.tiang SET induk_id = id_baru, updated_at = now()
    WHERE id = p_anak_id AND induk_id = p_induk_id;
    UPDATE public.tiang_kode_penyulang kp SET induk_id = id_baru, updated_at = now()
    WHERE kp.tiang_id = p_anak_id AND kp.induk_id = p_induk_id
      AND EXISTS (SELECT 1 FROM jsonb_array_elements(nama) e WHERE upper(e->>'penyulang') = upper(kp.penyulang));
    -- Sesaat sebelum B dipindah, A punya dua anak → pemicu
    -- jtm_tandai_induk_percabangan menandainya percabangan. Sisipan tidak
    -- membuat A bercabang: tandanya dikembalikan.
    IF NOT COALESCE(i.percabangan, false) THEN
      UPDATE public.tiang SET percabangan = false
      WHERE id = p_induk_id AND percabangan
        AND (SELECT count(*) FROM public.tiang c WHERE c.induk_id = p_induk_id AND c.status_hidup = 'aktif') < 2;
    END IF;
  END IF;

  FOR r IN SELECT e->>'penyulang' AS p FROM jsonb_array_elements(nama) e LOOP
    segmen := segmen || public._jtm_masuk_segmen_induk(id_baru, p_induk_id, p_anak_id, r.p, 'meja');
  END LOOP;

  INSERT INTO public.master_audit
    (entitas, entitas_kode, ulp, field, nilai_lama, nilai_baru, aksi, oleh_uid, oleh_nama)
  VALUES ('tiang', utama_k, v_ulp, 'status_hidup', NULL,
          jsonb_build_object('status', 'aktif', 'alasan', p_alasan, 'induk', i.kode,
                             'sisip_sebelum', (SELECT kode FROM public.tiang WHERE id = p_anak_id),
                             'nama', nama, 'lat', p_lat, 'lng', p_lng, 'segmen', to_jsonb(segmen)),
          'tambah_meja', auth.uid(), p_oleh);

  RETURN jsonb_build_object('id', id_baru, 'kode', utama_k, 'nama', nama, 'segmen', to_jsonb(segmen));
END $$;
GRANT EXECUTE ON FUNCTION public.tambah_tiang_meja_jtm(UUID, DOUBLE PRECISION, DOUBLE PRECISION, UUID, TEXT, BOOLEAN, TEXT, TEXT) TO authenticated;
