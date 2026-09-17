-- scripts/jtm-tumpang.sql
--
-- MENUMPANG YANG DINYATAKAN REGU, DAN INDUK LINTAS PENYULANG.
--
-- Dua hal dari uji penyulang AMPENAN, dan keduanya berpangkal pada satu
-- kekeliruan yang sama: menganggap "penyulang tiang ini" = penyulang PEMILIK
-- batangnya, padahal yang berlaku adalah penyulang yang KABELNYA LEWAT di situ.
--
--   1. `ubah_induk_tiang_jtm` menolak induk yang tidak dilewati penyulang
--      PEMILIK anaknya. Di AMPENAN, batang GNN-001 (milik GUNUNG SARI) harus
--      menginduk ke MPN-001 (milik AMPENAN). Keduanya sama-sama dilewati
--      AMPENAN — tapi penjaganya memeriksa GUNUNG SARI, dan menolak.
--
--      Akibatnya rute AMPENAN putus tepat di tiang keduanya, dan tidak ada satu
--      pun cara membetulkannya dari mana pun.
--
--   2. Menumpang hanya bisa terjadi kalau sistem KEBETULAN menemukan tiang lain
--      dalam 10 m. Di lapangan regu melihat sendiri kabelnya menumpang, tapi
--      kalau tiangnya terbaca 14 m karena GPS meleset, satu-satunya jalan yang
--      tersisa adalah melahirkan batang beton kedua di tiang yang sama.
--
--      10 m itu benar untuk PENJAGA — dia mencegah tiang kembar lahir tanpa
--      sengaja. Tapi dia salah dipakai sebagai batas PENCARIAN, karena yang
--      mencari sudah tahu apa yang dia cari.
--
-- Prasyarat: jtm-lanjut.sql · jtm-nama.sql
-- Aman dijalankan berulang.


-- ── 1. Radius pencarian saat regu menyatakan menumpang ───────────────────────

ALTER TABLE public.jtm_settings
  ADD COLUMN IF NOT EXISTS radius_cari_tumpang_m DOUBLE PRECISION NOT NULL DEFAULT 25;

COMMENT ON COLUMN public.jtm_settings.radius_cari_tumpang_m IS
  'Radius pencarian saat regu MENYATAKAN tiangnya menumpang. Lebih longgar dari radius_tumpang_m, karena yang satu itu penjaga terhadap kelalaian sementara yang ini melayani niat yang sudah pasti.';


-- ── 2. Tiang di sekitar, apa pun penyulangnya ────────────────────────────────
-- `tiang_terdekat_jtm` sudah ada dan sudah menerima radius. Yang kurang cuma
-- keterangan supaya regu bisa memilih dengan yakin: nama tiang itu di penyulang
-- YANG SEDANG DISAPU, dan apakah dia sudah jadi anggota segmennya.

CREATE OR REPLACE FUNCTION public.tiang_sekitar_jtm(
  p_segmen_id UUID,
  p_lat       DOUBLE PRECISION,
  p_lng       DOUBLE PRECISION,
  p_radius    DOUBLE PRECISION DEFAULT NULL
) RETURNS TABLE (
  id UUID,
  kode TEXT,
  kode_di_sini TEXT,
  penyulang TEXT,
  jarak_m NUMERIC,
  sudah_anggota BOOLEAN,
  dipikul TEXT[]
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  s   RECORD;
  amb public.jtm_settings%ROWTYPE;
  r   DOUBLE PRECISION;
BEGIN
  -- Tabelnya diberi alias: nama kolom di RETURNS TABLE ikut jadi variabel
  -- plpgsql, jadi `id` tanpa awalan menunjuk dua hal sekaligus.
  SELECT sg.* INTO s FROM public.segmen sg WHERE sg.id = p_segmen_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Segmen tidak ditemukan'; END IF;

  SELECT * INTO amb FROM public.jtm_ambang(s.ulp);
  r := COALESCE(p_radius, amb.radius_cari_tumpang_m, 25);

  RETURN QUERY
  SELECT
    t.id,
    t.kode,
    k.kode,
    t.penyulang,
    round(public.jarak_meter(p_lat, p_lng, t.lat, t.lng)::numeric, 1),
    EXISTS (SELECT 1 FROM public.segmen_tiang st
             WHERE st.segmen_id = p_segmen_id AND st.tiang_id = t.id),
    ARRAY(
      SELECT DISTINCT sg.penyulang
      FROM public.segmen_tiang st2
      JOIN public.segmen sg ON sg.id = st2.segmen_id AND sg.status = 'aktif'
      WHERE st2.tiang_id = t.id
    )
  FROM public.tiang t
  LEFT JOIN public.tiang_kode_penyulang k
    ON k.tiang_id = t.id AND upper(k.penyulang) = upper(s.penyulang)
  WHERE t.status_hidup = 'aktif'
    AND t.gardu_kode IS NULL
    AND t.lat IS NOT NULL AND t.lng IS NOT NULL
    AND upper(COALESCE(t.ulp, '')) = upper(s.ulp)
    AND public.jarak_meter(p_lat, p_lng, t.lat, t.lng) <= r
  ORDER BY public.jarak_meter(p_lat, p_lng, t.lat, t.lng)
  LIMIT 12;
END $$;

COMMENT ON FUNCTION public.tiang_sekitar_jtm IS
  'Tiang di sekitar sebuah titik, untuk regu yang MENYATAKAN tiangnya menumpang. Menyebut nama tiang di penyulang segmen ini supaya bisa dipilih dengan yakin.';


-- ── 3. Induk boleh lintas penyulang, asal jalurnya sama ──────────────────────
-- Menggantikan yang di `jtm-lanjut.sql`. Syaratnya diubah dari "dilewati
-- penyulang PEMILIK anaknya" jadi "anak dan induk sama-sama dilewati setidaknya
-- satu penyulang yang sama" — karena itulah arti sebuah bentang: dua tiang yang
-- memikul kabel yang sama.

CREATE OR REPLACE FUNCTION public.ubah_induk_tiang_jtm(
  p_tiang_id UUID,
  p_induk_id UUID,
  p_oleh     TEXT DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  t     RECORD;
  induk RECORD;
  v_induk_kode TEXT;
  naik  UUID;
  n     INT := 0;
BEGIN
  SELECT * INTO t FROM public.tiang WHERE id = p_tiang_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Tiang tidak ditemukan'; END IF;

  IF p_induk_id IS NOT NULL THEN
    IF p_induk_id = p_tiang_id THEN
      RAISE EXCEPTION 'Tiang tidak bisa jadi induk bagi dirinya sendiri';
    END IF;

    SELECT * INTO induk FROM public.tiang WHERE id = p_induk_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Tiang induk tidak ditemukan'; END IF;
    v_induk_kode := induk.kode;

    IF upper(COALESCE(induk.ulp, '')) <> upper(COALESCE(t.ulp, '')) THEN
      RAISE EXCEPTION 'Tiang % ada di ULP lain (%)', induk.kode, induk.ulp;
    END IF;

    -- SATU PENYULANG YANG SAMA SUDAH CUKUP. Sebuah bentang adalah dua tiang
    -- yang memikul kabel yang sama; siapa pemilik batangnya tidak menentukan
    -- apa pun di sini. Tanpa kelonggaran ini, penyulang yang berjalan di atas
    -- tiang milik orang tidak pernah bisa disambungkan ke tiangnya sendiri.
    IF NOT EXISTS (
      SELECT 1
      FROM public.tiang_kode_penyulang a
      JOIN public.tiang_kode_penyulang b
        ON upper(b.penyulang) = upper(a.penyulang)
      WHERE a.tiang_id = p_tiang_id AND b.tiang_id = p_induk_id
    ) THEN
      RAISE EXCEPTION
        'Tiang % dan % tidak dilewati satu penyulang pun yang sama. Masukkan dulu salah satunya ke segmen penyulang yang sama.',
        t.kode, induk.kode;
    END IF;

    -- Lingkaran membuat setiap penelusuran pohon berputar selamanya.
    naik := induk.induk_id;
    WHILE naik IS NOT NULL AND n < 500 LOOP
      IF naik = p_tiang_id THEN
        RAISE EXCEPTION 'Tidak bisa: % sudah berada di bawah %', induk.kode, t.kode;
      END IF;
      SELECT induk_id INTO naik FROM public.tiang WHERE id = naik;
      n := n + 1;
    END LOOP;
  END IF;

  INSERT INTO public.master_audit
    (entitas, entitas_kode, ulp, field, nilai_lama, nilai_baru, aksi, oleh_uid, oleh_nama)
  VALUES ('tiang', t.kode, COALESCE(t.ulp, '-'), 'induk_id',
          to_jsonb((SELECT kode FROM public.tiang WHERE id = t.induk_id)),
          to_jsonb(v_induk_kode),
          'koreksi_meja', auth.uid(), p_oleh);

  UPDATE public.tiang SET induk_id = p_induk_id, updated_at = now()
  WHERE id = p_tiang_id;

  RETURN jsonb_build_object('kode', t.kode, 'induk', v_induk_kode);
END $$;


GRANT EXECUTE ON FUNCTION public.tiang_sekitar_jtm    TO authenticated;
GRANT EXECUTE ON FUNCTION public.ubah_induk_tiang_jtm TO authenticated;
