-- ════════════════════════════════════════════════════════════════════════════
-- Balik arah JTM — rantai induk yang terbalik karena salah pilih pangkal (22 Okt 2026)
-- ════════════════════════════════════════════════════════════════════════════
-- Kasus: regu memulai rintisan di UJUNG jaringan lalu berjalan ke arah sumber.
-- Yang tercatat:   A (pangkal) → … → B
-- Yang sebenarnya: [hulu] → B → … → A (ujung)
-- "Ganti induk" satu per satu tidak bisa membereskannya — tiap langkahnya
-- melingkar dan ditolak.
--
-- Keputusan user:
--   • tombol "Balik arah" di panel tiang /peta;
--   • A = tiang yang salah jadi pangkal, B = pangkal sebenarnya (harus hilir A
--     lewat tiang.induk_id), hulu = tiang tempat B menyambung (boleh kosong);
--   • pangkal ↔ ujung segmen yang seluruhnya di rantai ini ikut ditukar;
--   • arah_utama_dari_sini di tiang yang dibalik DIKOSONGKAN — jawaban
--     "kanan/lurus/kiri" diberikan dari arah datang yang salah;
--   • nama tiang TIDAK diubah di sini — web langsung menawarkan Generate ulang
--     nama (pratinjau yang sama dengan tab Tiang JTM).
--
-- Yang ikut: cabang yang keluar dari tengah rantai tetap menempel di tiangnya.
-- Penyulang lain yang menumpang dan masih "ikut induk batang" ikut terbalik —
-- disebut di pratinjau.
--
-- Ditolak: tiang di rantai milik penyulang lain / tidak aktif, segmen di rantai
-- yang masih dirintis (ujung 'UJUNG'), hulu yang berada di dalam rantai yang
-- dibalik, nama segmen baru yang bentrok.
--
-- Sesudah jtm-induk-per-penyulang.sql (tiang_kode_penyulang.induk_id) dan
-- jtm-hak-akses-portal.sql (wajib_boleh_ulp).
-- ════════════════════════════════════════════════════════════════════════════

-- Rantai dari B naik ke A: [B, …, A]. NULL = B bukan hilir A.
CREATE OR REPLACE FUNCTION public._jtm_jalur_balik(p_dari UUID, p_ke UUID)
RETURNS UUID[]
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  jalur UUID[] := ARRAY[p_ke];
  naik  UUID := p_ke;
  n     INT := 0;
BEGIN
  LOOP
    SELECT induk_id INTO naik FROM public.tiang WHERE id = naik;
    EXIT WHEN naik IS NULL OR n > 5000;
    jalur := jalur || naik;
    IF naik = p_dari THEN RETURN jalur; END IF;
    n := n + 1;
  END LOOP;
  RETURN NULL;
END $fn$;

-- Inti bersama pratinjau & terapkan. `p_terapkan = false` tidak menulis apa pun.
CREATE OR REPLACE FUNCTION public._jtm_balik_arah(
  p_dari     UUID,
  p_ke       UUID,
  p_hulu     UUID,
  p_terapkan BOOLEAN,
  p_alasan   TEXT DEFAULT NULL,
  p_oleh     TEXT DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  a RECORD; b RECORD; h RECORD; s RECORD;
  jalur   UUID[];
  k       INT;
  i       INT;
  naik    UUID;
  n       INT := 0;
  salah   TEXT;
  tiang_j JSONB := '[]'::jsonb;
  seg_j   JSONB := '[]'::jsonb;
  sebagian JSONB := '[]'::jsonb;
  ikut    JSONB;
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
  IF NOT FOUND OR a.status_hidup <> 'aktif' OR a.penyulang IS NULL THEN
    RAISE EXCEPTION 'Tiang awal bukan tiang JTM yang aktif.';
  END IF;
  SELECT * INTO b FROM public.tiang WHERE id = p_ke;
  IF NOT FOUND OR b.status_hidup <> 'aktif' THEN
    RAISE EXCEPTION 'Tiang pangkal sebenarnya tidak ditemukan atau tidak aktif.';
  END IF;

  jalur := public._jtm_jalur_balik(p_dari, p_ke);
  IF jalur IS NULL THEN
    RAISE EXCEPTION 'Tiang % tidak berada di hilir % — klik tiang di ujung lain rantai yang terbalik.', b.kode, a.kode;
  END IF;
  k := array_length(jalur, 1);   -- jalur[1] = B … jalur[k] = A

  SELECT t.kode INTO salah
  FROM unnest(jalur) j(id) JOIN public.tiang t ON t.id = j.id
  WHERE upper(COALESCE(t.penyulang, '')) <> upper(a.penyulang) OR t.status_hidup <> 'aktif'
  LIMIT 1;
  IF salah IS NOT NULL THEN
    RAISE EXCEPTION 'Tiang % di rantai ini bukan milik % — Balik arah hanya untuk tiang milik satu penyulang.', salah, a.penyulang;
  END IF;

  IF p_hulu IS NOT NULL THEN
    SELECT * INTO h FROM public.tiang WHERE id = p_hulu;
    IF NOT FOUND OR h.status_hidup <> 'aktif' THEN
      RAISE EXCEPTION 'Tiang hulu tidak ditemukan atau tidak aktif.';
    END IF;
    hulu_kode := h.kode;
    IF upper(COALESCE(h.ulp, '')) <> upper(COALESCE(a.ulp, '')) THEN
      RAISE EXCEPTION 'Tiang hulu % ada di ULP lain (%).', h.kode, h.ulp;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM public.tiang_kode_penyulang
                   WHERE tiang_id = p_hulu AND upper(penyulang) = upper(a.penyulang)) THEN
      RAISE EXCEPTION 'Tiang hulu % tidak dilewati penyulang %.', h.kode, a.penyulang;
    END IF;
    -- Seluruh hilir A ikut berpindah di bawah B; hulu di dalamnya = melingkar.
    naik := p_hulu;
    WHILE naik IS NOT NULL AND n < 5000 LOOP
      IF naik = p_dari THEN
        RAISE EXCEPTION 'Tiang hulu % ada di dalam rantai yang dibalik — pilih tiang di luar rantai ini.', h.kode;
      END IF;
      SELECT induk_id INTO naik FROM public.tiang WHERE id = naik;
      n := n + 1;
    END LOOP;
  END IF;

  SELECT s2.nama INTO salah
  FROM public.segmen s2
  WHERE s2.status = 'aktif' AND upper(s2.penyulang) = upper(a.penyulang)
    AND s2.titik_akhir_jenis = 'UJUNG'
    AND EXISTS (SELECT 1 FROM public.segmen_tiang st WHERE st.segmen_id = s2.id AND st.tiang_id = ANY(jalur))
  LIMIT 1;
  IF salah IS NOT NULL THEN
    RAISE EXCEPTION 'Segmen "%" masih dirintis (ujungnya belum ditutup). Tutup dulu dari HP, baru balik arah.', salah;
  END IF;

  -- ── Tiang ──
  FOR i IN 1..k LOOP
    tiang_j := tiang_j || jsonb_build_object(
      'kode', (SELECT kode FROM public.tiang WHERE id = jalur[i]),
      'induk_lama', (SELECT kode FROM public.tiang WHERE id = CASE WHEN i = k THEN a.induk_id ELSE jalur[i + 1] END),
      'induk_baru', (SELECT kode FROM public.tiang WHERE id = CASE WHEN i = 1 THEN p_hulu ELSE jalur[i - 1] END));
  END LOOP;

  SELECT COALESCE(jsonb_agg(DISTINCT kp.penyulang), '[]'::jsonb) INTO ikut
  FROM public.tiang_kode_penyulang kp
  WHERE kp.tiang_id = ANY(jalur) AND NOT kp.utama AND kp.induk_id IS NULL
    AND upper(kp.penyulang) <> upper(a.penyulang);

  -- ── Segmen yang menyentuh rantai ──
  -- Ditukar bila kedua ujungnya yang bertiang ada di rantai (atau pangkalnya
  -- = induk lama A). Yang lain hanya disebut: rantai lewat sebagian saja.
  FOR s IN
    SELECT s2.* FROM public.segmen s2
    WHERE s2.status = 'aktif' AND upper(s2.penyulang) = upper(a.penyulang)
      AND EXISTS (SELECT 1 FROM public.segmen_tiang st WHERE st.segmen_id = s2.id AND st.tiang_id = ANY(jalur))
    ORDER BY s2.created_at
  LOOP
    IF (s.titik_awal_tiang_id IS NULL OR s.titik_awal_tiang_id = ANY(jalur) OR s.titik_awal_tiang_id = a.induk_id)
       AND (s.titik_akhir_tiang_id IS NULL OR s.titik_akhir_tiang_id = ANY(jalur)) THEN

      pos := position(' - ' IN COALESCE(s.nama, ''));
      IF s.sumber IN ('tempelan', 'impor') AND COALESCE(btrim(s.nama), '') <> '' THEN
        -- Nama tulisan orang: dibalik apa adanya kalau bentuknya "X - Y".
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
        -- Pangkal baru di hulu (kebiasaan rintis: pangkal = tiang yang sudah ada);
        -- ujung baru di A bila pangkal lamanya induk lama A, yang kini terlepas.
        awal_baru  := CASE WHEN s.titik_akhir_tiang_id = p_ke AND p_hulu IS NOT NULL
                           THEN p_hulu ELSE s.titik_akhir_tiang_id END;
        akhir_baru := CASE WHEN s.titik_awal_tiang_id IS NOT NULL AND s.titik_awal_tiang_id = a.induk_id
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
    -- B dulu: memutus rantai lama dari bawah, supaya tiap langkah berikutnya
    -- tidak pernah melingkar (trg_tiang_cegah_lingkaran memeriksa per baris).
    -- cabang_baru ikut di UPDATE yang sama — pemicu percabangan membacanya.
    UPDATE public.tiang SET induk_id = p_hulu, arah_utama_dari_sini = NULL,
           cabang_baru = (p_hulu IS NOT NULL AND COALESCE(a.cabang_baru, false)), updated_at = now()
    WHERE id = p_ke;
    FOR i IN 2..k LOOP
      UPDATE public.tiang SET induk_id = jalur[i - 1], arah_utama_dari_sini = NULL,
             cabang_baru = false, updated_at = now()
      WHERE id = jalur[i];
    END LOOP;

    INSERT INTO public.master_audit
      (entitas, entitas_kode, ulp, field, nilai_lama, nilai_baru, aksi, oleh_uid, oleh_nama)
    SELECT 'tiang', x->>'kode', COALESCE(a.ulp, '-'), 'induk_id',
           to_jsonb(x->>'induk_lama'), to_jsonb(x->>'induk_baru'), 'koreksi_meja', auth.uid(), p_oleh
    FROM jsonb_array_elements(tiang_j) x;

    INSERT INTO public.master_audit
      (entitas, entitas_kode, ulp, field, nilai_lama, nilai_baru, aksi, oleh_uid, oleh_nama)
    VALUES ('tiang', a.kode, COALESCE(a.ulp, '-'), 'balik_arah_jtm', NULL,
            jsonb_build_object('alasan', btrim(p_alasan), 'pangkal_baru', b.kode,
                               'hulu', hulu_kode,
                               'jumlah_tiang', k, 'segmen', seg_j),
            'koreksi_meja', auth.uid(), p_oleh);
  END IF;

  RETURN jsonb_build_object(
    'penyulang', a.penyulang,
    'ulp', a.ulp,
    'dari', a.kode,
    'ke', b.kode,
    'hulu', hulu_kode,
    'lepas_dari', (SELECT kode FROM public.tiang WHERE id = a.induk_id),
    'tiang', tiang_j,
    'segmen', seg_j,
    'segmen_sebagian', sebagian,
    'ikut_terbalik', ikut);
END $fn$;

CREATE OR REPLACE FUNCTION public.pratinjau_balik_arah_jtm(p_dari UUID, p_ke UUID, p_hulu UUID DEFAULT NULL)
RETURNS JSONB
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $fn$
  SELECT public._jtm_balik_arah(p_dari, p_ke, p_hulu, false);
$fn$;

CREATE OR REPLACE FUNCTION public.balik_arah_jtm(
  p_dari   UUID,
  p_ke     UUID,
  p_hulu   UUID,
  p_alasan TEXT,
  p_oleh   TEXT DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
BEGIN
  PERFORM public.wajib_boleh_ulp((SELECT ulp FROM public.tiang WHERE id = p_dari));
  IF COALESCE(btrim(p_alasan), '') = '' THEN
    RAISE EXCEPTION 'Alasan wajib diisi.';
  END IF;
  RETURN public._jtm_balik_arah(p_dari, p_ke, p_hulu, true, p_alasan, p_oleh);
END $fn$;

REVOKE EXECUTE ON FUNCTION public._jtm_balik_arah(UUID, UUID, UUID, BOOLEAN, TEXT, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.pratinjau_balik_arah_jtm(UUID, UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.balik_arah_jtm(UUID, UUID, UUID, TEXT, TEXT) TO authenticated;
