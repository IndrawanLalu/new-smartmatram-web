-- ════════════════════════════════════════════════════════════════════════════
-- Penyulang menumpang yang mengalir BERLAWANAN arah batang (26 Okt 2026)
-- ════════════════════════════════════════════════════════════════════════════
-- Kasus MENINTING: regu menyusuri MENINTING di tiang AMPENAN dari L023 ke
-- L003, berlawanan arah batang AMPENAN. Asal regu ditolak ("di hilir
-- batang"), induk MENINTING tiap tiang naik lewat batang sampai MEN-055 →
-- MEN-055RRRR001 … MEN-055 + 18 R + 001, dan Ganti nama (hilir ikut) hanya
-- kena satu-dua tiang. Data MENINTING dibetulkan perbaiki-meninting-arah.sql.
--
-- Keputusan user 26 Okt ("kerjakan keduanya"):
--   1. tumpangi_tiang_jtm_dari — tiang yang BARU ditumpangi: asal regu jadi
--      induk di penyulang yang menumpang (selama tidak melingkar), juga bila
--      asal itu di hilir batang. Tiang yang sudah bernama tetap seperti dulu.
--      Disalin dari jtm-tumpang-dari.sql; yang baru bertanda ★.
--   2. Balik arah di penyulang yang menumpang — rantai induk PER PENYULANG
--      (tiang_kode_penyulang.induk_id) yang dibalik; batang pemilik, nama,
--      dan penyulang lain tidak disentuh. Untuk regu yang mulai dari ujung
--      yang salah. Hulu WAJIB: tanpa induk khusus, tiang menumpang kembali
--      ikut batang — yang justru arah terbalik itu.
--      pratinjau_balik_arah_jtm / balik_arah_jtm mendapat p_penyulang
--      (NULL / pemilik batang = Balik arah batang seperti sebelumnya).
--
-- Jalankan SESUDAH jtm-balik-arah.sql & jtm-tumpang-dari.sql. Idempoten.
-- SQL dulu, baru web (tombol "Balik arah di <penyulang>").
-- ════════════════════════════════════════════════════════════════════════════


-- ── 1. Menumpang dari tiang asal regu ────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.tumpangi_tiang_jtm_dari(
  p_segmen_id UUID,
  p_tiang_id  UUID,
  p_dari_id   UUID,
  p_nama      TEXT DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  d     JSONB;
  s     RECORD;
  t     RECORD;
  kp    RECORD;
  naik  UUID;
  n     INT := 0;
  boleh BOOLEAN := p_dari_id IS NOT NULL AND p_dari_id <> p_tiang_id;
  kode_baru TEXT;
BEGIN
  d := public.tumpangi_tiang_jtm(p_segmen_id, p_tiang_id, 'bawah', p_nama);

  SELECT * INTO s FROM public.segmen WHERE id = p_segmen_id;
  SELECT * INTO t FROM public.tiang WHERE id = p_tiang_id;
  SELECT * INTO kp FROM public.tiang_kode_penyulang
   WHERE tiang_id = p_tiang_id AND upper(penyulang) = upper(s.penyulang);
  IF NOT FOUND OR kp.utama THEN boleh := false; END IF;

  IF boleh AND NOT EXISTS (
    SELECT 1 FROM public.tiang_kode_penyulang k2 JOIN public.tiang t2 ON t2.id = k2.tiang_id
    WHERE k2.tiang_id = p_dari_id AND upper(k2.penyulang) = upper(s.penyulang) AND t2.status_hidup = 'aktif'
  ) THEN boleh := false; END IF;

  -- `dari` di hilir batang tiang ini? ★ (26 Okt) Hanya untuk tiang yang SUDAH
  -- bernama di penyulang ini sebelum kiriman ini (inspeksi ulang yang disusuri
  -- dari arah lain tidak boleh membalik jaringan yang sudah benar). Tiang yang
  -- BARU ditumpangi mengikuti urutan jalan regu, juga bila berlawanan arah
  -- batang pemiliknya (MENINTING di batang AMPENAN) — sama seperti tiang milik
  -- sendiri; regu yang mulai dari ujung yang salah dibetulkan dengan
  -- "Balik arah di <penyulang>" dari peta.
  IF boleh AND kp.created_at < now() THEN
    naik := p_dari_id;
    WHILE naik IS NOT NULL AND n < 5000 LOOP
      IF naik = p_tiang_id THEN boleh := false; EXIT; END IF;
      SELECT induk_id INTO naik FROM public.tiang WHERE id = naik;
      n := n + 1;
    END LOOP;
  END IF;

  IF boleh AND p_dari_id IS NOT DISTINCT FROM public.jtm_induk_di_penyulang(p_tiang_id, s.penyulang) THEN
    boleh := false;
  END IF;

  -- Melingkar di penyulang ini?
  IF boleh THEN
    naik := p_dari_id; n := 0;
    WHILE naik IS NOT NULL AND n < 5000 LOOP
      IF naik = p_tiang_id THEN boleh := false; EXIT; END IF;
      naik := public.jtm_induk_di_penyulang(naik, s.penyulang);
      n := n + 1;
    END LOOP;
  END IF;

  IF boleh THEN
    UPDATE public.tiang_kode_penyulang SET induk_id = p_dari_id, updated_at = now()
    WHERE tiang_id = p_tiang_id AND upper(penyulang) = upper(s.penyulang);

    -- Nama yang baru lahir di permintaan ini (now() = awal transaksi).
    IF kp.created_at >= now() THEN
      -- Nama sementara ("pangkal" dari pemicu) dilepas dulu, kalau tidak dia
      -- dianggap terpakai dan nama barunya meloncat satu nomor.
      UPDATE public.tiang_kode_penyulang SET kode = '~' || left(p_tiang_id::text, 8) || '~'
      WHERE tiang_id = p_tiang_id AND upper(penyulang) = upper(s.penyulang);
      SELECT h.kode INTO kode_baru
      FROM public.jtm_nama_baru(p_dari_id, t.lat, t.lng, false, s.penyulang, COALESCE(s.ulp, t.ulp, '-'), t.id) h;
      IF kode_baru IS NOT NULL AND NOT EXISTS (
        SELECT 1 FROM public.tiang_kode_penyulang x
        WHERE upper(x.ulp) = upper(kp.ulp) AND upper(x.penyulang) = upper(kp.penyulang)
          AND upper(x.kode) = upper(kode_baru) AND x.tiang_id <> p_tiang_id
      ) THEN
        UPDATE public.tiang_kode_penyulang SET kode = kode_baru, updated_at = now()
        WHERE tiang_id = p_tiang_id AND upper(penyulang) = upper(s.penyulang);
      ELSE
        UPDATE public.tiang_kode_penyulang SET kode = kp.kode
        WHERE tiang_id = p_tiang_id AND upper(penyulang) = upper(s.penyulang);
      END IF;
    END IF;

    INSERT INTO public.master_audit
      (entitas, entitas_kode, ulp, field, nilai_lama, nilai_baru, aksi, oleh_uid, oleh_nama)
    VALUES ('tiang', COALESCE(kode_baru, kp.kode), COALESCE(t.ulp, '-'), 'induk_penyulang',
            jsonb_build_object('penyulang', s.penyulang, 'induk', NULL),
            jsonb_build_object('penyulang', s.penyulang,
              'induk', (SELECT kode FROM public.tiang_kode_penyulang
                        WHERE tiang_id = p_dari_id AND upper(penyulang) = upper(s.penyulang)),
              'lewat', 'menumpang'),
            'lapangan', auth.uid(), p_nama);
  END IF;

  RETURN d || jsonb_build_object(
    'kode', (SELECT kode FROM public.tiang_kode_penyulang
             WHERE tiang_id = p_tiang_id AND upper(penyulang) = upper(s.penyulang)),
    'induk_diatur', boleh);
END $fn$;

GRANT EXECUTE ON FUNCTION public.tumpangi_tiang_jtm_dari(UUID, UUID, UUID, TEXT) TO authenticated;


-- ── 2. Balik arah di penyulang yang menumpang ────────────────────────────────

-- Rantai dari B naik ke A lewat induk DI PENYULANG ITU: [B, …, A]. NULL = B bukan hilir A.
CREATE OR REPLACE FUNCTION public._jtm_jalur_balik_penyulang(p_dari UUID, p_ke UUID, p_penyulang TEXT)
RETURNS UUID[]
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  jalur UUID[] := ARRAY[p_ke];
  naik  UUID := p_ke;
  n     INT := 0;
BEGIN
  LOOP
    naik := public.jtm_induk_di_penyulang(naik, p_penyulang);
    EXIT WHEN naik IS NULL OR n > 5000 OR naik = ANY(jalur);
    jalur := jalur || naik;
    IF naik = p_dari THEN RETURN jalur; END IF;
    n := n + 1;
  END LOOP;
  RETURN NULL;
END $fn$;

-- Nama tiang di penyulang itu (cadangan: kode batang).
CREATE OR REPLACE FUNCTION public._jtm_nama_di(p_tiang UUID, p_penyulang TEXT)
RETURNS TEXT LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $fn$
  SELECT COALESCE(
    (SELECT kp.kode FROM public.tiang_kode_penyulang kp
      WHERE kp.tiang_id = p_tiang AND upper(kp.penyulang) = upper(p_penyulang)),
    (SELECT t.kode FROM public.tiang t WHERE t.id = p_tiang))
$fn$;

-- Inti pratinjau & terapkan untuk penyulang yang menumpang. Bentuk hasilnya
-- sama dengan _jtm_balik_arah (layar pratinjau yang sama).
CREATE OR REPLACE FUNCTION public._jtm_balik_arah_penyulang(
  p_penyulang TEXT,
  p_dari      UUID,
  p_ke        UUID,
  p_hulu      UUID,
  p_terapkan  BOOLEAN,
  p_alasan    TEXT DEFAULT NULL,
  p_oleh      TEXT DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  a RECORD; ka RECORD; s RECORD;
  v_p     TEXT;
  jalur   UUID[];
  k       INT;
  i       INT;
  naik    UUID;
  n       INT := 0;
  salah   TEXT;
  induk_a UUID;
  tiang_j JSONB := '[]'::jsonb;
  seg_j   JSONB := '[]'::jsonb;
  sebagian JSONB := '[]'::jsonb;
  nama_baru TEXT;
  awal_baru UUID;
  akhir_baru UUID;
  pos     INT;
  hulu_kode TEXT;
BEGIN
  IF p_dari = p_ke THEN
    RAISE EXCEPTION 'Pilih tiang lain — pangkal sebenarnya tidak boleh tiang yang sama.';
  END IF;

  SELECT * INTO a FROM public.tiang WHERE id = p_dari;
  IF NOT FOUND OR a.status_hidup <> 'aktif' THEN
    RAISE EXCEPTION 'Tiang awal bukan tiang JTM yang aktif.';
  END IF;
  SELECT * INTO ka FROM public.tiang_kode_penyulang
   WHERE tiang_id = p_dari AND upper(penyulang) = upper(p_penyulang);
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Tiang % tidak bernama di penyulang %.', a.kode, p_penyulang;
  END IF;
  v_p := ka.penyulang;
  IF NOT EXISTS (SELECT 1 FROM public.tiang WHERE id = p_ke AND status_hidup = 'aktif') THEN
    RAISE EXCEPTION 'Tiang pangkal sebenarnya tidak ditemukan atau tidak aktif.';
  END IF;

  jalur := public._jtm_jalur_balik_penyulang(p_dari, p_ke, v_p);
  IF jalur IS NULL THEN
    RAISE EXCEPTION 'Tiang % tidak berada di hilir % di penyulang % — klik tiang di ujung lain rantai yang terbalik.',
      public._jtm_nama_di(p_ke, v_p), ka.kode, v_p;
  END IF;
  k := array_length(jalur, 1);   -- jalur[1] = B … jalur[k] = A

  -- Hanya tiang yang MENUMPANG: tiang milik batang penyulang ini dibalik
  -- lewat Balik arah biasa (induk batangnya yang berubah).
  SELECT COALESCE(kp.kode, t.kode) INTO salah
  FROM unnest(jalur) j(id)
  JOIN public.tiang t ON t.id = j.id
  LEFT JOIN public.tiang_kode_penyulang kp ON kp.tiang_id = j.id AND upper(kp.penyulang) = upper(v_p)
  WHERE kp.tiang_id IS NULL OR kp.utama OR t.status_hidup <> 'aktif'
  LIMIT 1;
  IF salah IS NOT NULL THEN
    RAISE EXCEPTION 'Tiang % milik batang % — rantai ini bercampur. Balik dulu bagian milik % dengan tombol Balik arah biasa.',
      salah, v_p, v_p;
  END IF;

  IF p_hulu IS NULL THEN
    RAISE EXCEPTION 'Klik tiang hulu — ruas % yang menumpang harus menyambung ke tiang % lain.', v_p, v_p;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.tiang t JOIN public.tiang_kode_penyulang kp ON kp.tiang_id = t.id
                 WHERE t.id = p_hulu AND t.status_hidup = 'aktif' AND upper(kp.penyulang) = upper(v_p)) THEN
    RAISE EXCEPTION 'Tiang hulu tidak aktif atau tidak dilewati penyulang %.', v_p;
  END IF;
  hulu_kode := public._jtm_nama_di(p_hulu, v_p);
  naik := p_hulu;
  WHILE naik IS NOT NULL AND n < 5000 LOOP
    IF naik = ANY(jalur) THEN
      RAISE EXCEPTION 'Tiang hulu % ada di dalam rantai yang dibalik — pilih tiang di luar rantai ini.', hulu_kode;
    END IF;
    naik := public.jtm_induk_di_penyulang(naik, v_p);
    n := n + 1;
  END LOOP;

  induk_a := public.jtm_induk_di_penyulang(p_dari, v_p);

  SELECT s2.nama INTO salah
  FROM public.segmen s2
  WHERE s2.status = 'aktif' AND upper(s2.penyulang) = upper(v_p)
    AND s2.titik_akhir_jenis = 'UJUNG'
    AND EXISTS (SELECT 1 FROM public.segmen_tiang st WHERE st.segmen_id = s2.id AND st.tiang_id = ANY(jalur))
  LIMIT 1;
  IF salah IS NOT NULL THEN
    RAISE EXCEPTION 'Segmen "%" masih dirintis (ujungnya belum ditutup). Tutup dulu dari HP, baru balik arah.', salah;
  END IF;

  -- ── Tiang ──
  FOR i IN 1..k LOOP
    tiang_j := tiang_j || jsonb_build_object(
      'kode', public._jtm_nama_di(jalur[i], v_p),
      'induk_lama', public._jtm_nama_di(CASE WHEN i = k THEN induk_a ELSE jalur[i + 1] END, v_p),
      'induk_baru', public._jtm_nama_di(CASE WHEN i = 1 THEN p_hulu ELSE jalur[i - 1] END, v_p));
  END LOOP;

  -- ── Segmen penyulang ini yang menyentuh rantai (aturan = _jtm_balik_arah) ──
  FOR s IN
    SELECT s2.* FROM public.segmen s2
    WHERE s2.status = 'aktif' AND upper(s2.penyulang) = upper(v_p)
      AND EXISTS (SELECT 1 FROM public.segmen_tiang st WHERE st.segmen_id = s2.id AND st.tiang_id = ANY(jalur))
    ORDER BY s2.created_at
  LOOP
    IF (s.titik_awal_tiang_id IS NULL OR s.titik_awal_tiang_id = ANY(jalur) OR s.titik_awal_tiang_id = induk_a)
       AND (s.titik_akhir_tiang_id IS NULL OR s.titik_akhir_tiang_id = ANY(jalur)) THEN

      pos := position(' - ' IN COALESCE(s.nama, ''));
      IF s.sumber IN ('tempelan', 'impor') AND COALESCE(btrim(s.nama), '') <> '' THEN
        nama_baru := CASE WHEN pos > 0 AND position(' - ' IN substr(s.nama, pos + 3)) = 0
                          THEN substr(s.nama, pos + 3) || ' - ' || left(s.nama, pos - 1)
                          ELSE s.nama END;
      ELSE
        nama_baru := public.segmen_label_titik(s.titik_akhir_jenis, s.titik_akhir_nama)
                     || ' - ' || public.segmen_label_titik(s.titik_awal_jenis, s.titik_awal_nama);
      END IF;

      IF EXISTS (SELECT 1 FROM public.segmen x
                 WHERE x.status = 'aktif' AND x.id <> s.id
                   AND upper(x.ulp) = upper(s.ulp) AND upper(x.penyulang) = upper(s.penyulang)
                   AND upper(x.nama) = upper(nama_baru)) THEN
        RAISE EXCEPTION 'Segmen "%" sudah ada di penyulang ini — membalik "%" akan membuat nama kembar.', nama_baru, s.nama;
      END IF;

      seg_j := seg_j || jsonb_build_object('lama', s.nama, 'baru', nama_baru);

      IF p_terapkan THEN
        awal_baru  := CASE WHEN s.titik_akhir_tiang_id = p_ke THEN p_hulu ELSE s.titik_akhir_tiang_id END;
        akhir_baru := CASE WHEN s.titik_awal_tiang_id IS NOT NULL AND s.titik_awal_tiang_id = induk_a
                           THEN p_dari ELSE s.titik_awal_tiang_id END;
        UPDATE public.segmen SET
          titik_awal_jenis = s.titik_akhir_jenis, titik_awal_nama = s.titik_akhir_nama, titik_awal_tiang_id = awal_baru,
          titik_akhir_jenis = s.titik_awal_jenis, titik_akhir_nama = s.titik_awal_nama, titik_akhir_tiang_id = akhir_baru,
          nama = nama_baru
        WHERE id = s.id;

        INSERT INTO public.master_audit
          (entitas, entitas_kode, ulp, field, nilai_lama, nilai_baru, aksi, oleh_uid, oleh_nama)
        VALUES ('segmen', s.nama, COALESCE(s.ulp, '-'), 'balik_arah',
                to_jsonb(s.nama), jsonb_build_object('nama', nama_baru, 'alasan', btrim(p_alasan)),
                'koreksi_meja', auth.uid(), p_oleh);
      END IF;
    ELSE
      sebagian := sebagian || to_jsonb(s.nama);
    END IF;
  END LOOP;

  IF p_terapkan THEN
    -- Induk khusus penyulang ini saja. Tanda cabang dikosongkan ke "lurus":
    -- penamaan sendiri menamai cabang bila induknya sudah punya lanjutan utama.
    UPDATE public.tiang_kode_penyulang SET induk_id = p_hulu, cabang = false, updated_at = now()
    WHERE tiang_id = p_ke AND upper(penyulang) = upper(v_p);
    FOR i IN 2..k LOOP
      UPDATE public.tiang_kode_penyulang SET induk_id = jalur[i - 1], cabang = false, updated_at = now()
      WHERE tiang_id = jalur[i] AND upper(penyulang) = upper(v_p);
    END LOOP;

    -- Penjaga: dari A naik sampai pangkal tanpa melingkar.
    naik := p_dari; n := 0;
    WHILE naik IS NOT NULL LOOP
      n := n + 1;
      IF n > 5000 THEN RAISE EXCEPTION 'Jaringan % jadi melingkar — dibatalkan.', v_p; END IF;
      naik := public.jtm_induk_di_penyulang(naik, v_p);
    END LOOP;

    INSERT INTO public.master_audit
      (entitas, entitas_kode, ulp, field, nilai_lama, nilai_baru, aksi, oleh_uid, oleh_nama)
    SELECT 'tiang', x->>'kode', COALESCE(a.ulp, '-'), 'induk_penyulang',
           jsonb_build_object('penyulang', v_p, 'induk', x->>'induk_lama'),
           jsonb_build_object('penyulang', v_p, 'induk', x->>'induk_baru', 'lewat', 'balik arah'),
           'koreksi_meja', auth.uid(), p_oleh
    FROM jsonb_array_elements(tiang_j) x;

    INSERT INTO public.master_audit
      (entitas, entitas_kode, ulp, field, nilai_lama, nilai_baru, aksi, oleh_uid, oleh_nama)
    VALUES ('tiang', ka.kode, COALESCE(a.ulp, '-'), 'balik_arah_jtm', NULL,
            jsonb_build_object('alasan', btrim(p_alasan), 'penyulang', v_p,
                               'pangkal_baru', public._jtm_nama_di(p_ke, v_p), 'hulu', hulu_kode,
                               'jumlah_tiang', k, 'segmen', seg_j),
            'koreksi_meja', auth.uid(), p_oleh);
  END IF;

  RETURN jsonb_build_object(
    'penyulang', v_p,
    'ulp', ka.ulp,
    'dari', ka.kode,
    'ke', public._jtm_nama_di(p_ke, v_p),
    'hulu', hulu_kode,
    'lepas_dari', public._jtm_nama_di(induk_a, v_p),
    'tiang', tiang_j,
    'segmen', seg_j,
    'segmen_sebagian', sebagian,
    'ikut_terbalik', '[]'::jsonb);
END $fn$;

-- Penyulang tidak disebut / pemilik batang tiang itu → Balik arah batang
-- seperti sebelumnya.
CREATE OR REPLACE FUNCTION public._jtm_balik_lewat_penyulang(p_dari UUID, p_penyulang TEXT)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $fn$
  SELECT p_penyulang IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.tiang_kode_penyulang
     WHERE tiang_id = p_dari AND upper(penyulang) = upper(p_penyulang) AND utama)
$fn$;

DROP FUNCTION IF EXISTS public.pratinjau_balik_arah_jtm(UUID, UUID, UUID);
CREATE OR REPLACE FUNCTION public.pratinjau_balik_arah_jtm(
  p_dari UUID, p_ke UUID, p_hulu UUID DEFAULT NULL, p_penyulang TEXT DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
BEGIN
  IF public._jtm_balik_lewat_penyulang(p_dari, p_penyulang) THEN
    RETURN public._jtm_balik_arah_penyulang(p_penyulang, p_dari, p_ke, p_hulu, false);
  END IF;
  RETURN public._jtm_balik_arah(p_dari, p_ke, p_hulu, false);
END $fn$;

DROP FUNCTION IF EXISTS public.balik_arah_jtm(UUID, UUID, UUID, TEXT, TEXT);
CREATE OR REPLACE FUNCTION public.balik_arah_jtm(
  p_dari      UUID,
  p_ke        UUID,
  p_hulu      UUID,
  p_alasan    TEXT,
  p_oleh      TEXT DEFAULT NULL,
  p_penyulang TEXT DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
BEGIN
  PERFORM public.wajib_boleh_ulp((SELECT ulp FROM public.tiang WHERE id = p_dari));
  IF COALESCE(btrim(p_alasan), '') = '' THEN
    RAISE EXCEPTION 'Alasan wajib diisi.';
  END IF;
  IF public._jtm_balik_lewat_penyulang(p_dari, p_penyulang) THEN
    RETURN public._jtm_balik_arah_penyulang(p_penyulang, p_dari, p_ke, p_hulu, true, p_alasan, p_oleh);
  END IF;
  RETURN public._jtm_balik_arah(p_dari, p_ke, p_hulu, true, p_alasan, p_oleh);
END $fn$;

REVOKE EXECUTE ON FUNCTION public._jtm_balik_arah_penyulang(TEXT, UUID, UUID, UUID, BOOLEAN, TEXT, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.pratinjau_balik_arah_jtm(UUID, UUID, UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.balik_arah_jtm(UUID, UUID, UUID, TEXT, TEXT, TEXT) TO authenticated;

NOTIFY pgrst, 'reload schema';
