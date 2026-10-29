-- =============================================================================
-- Tambah penyulang menumpang dari PETA web (29 Okt 2026)
-- =============================================================================
-- Prasyarat: jtm-tumpang-dari.sql (tumpangi_tiang_jtm_dari), jtm-lepas-tumpang.sql.
-- Aman dijalankan berulang.
--
-- Kasus asal: LBS perbatasan MSR-183R135L006 (milik MVTIC SHERATON). MENINTING
-- di tiang itu dilepas ("Lepas MENINTING"), lalu MEN-211R089 tidak bisa lagi
-- disambung ke LBS — Ganti induk / Sambung hilir mensyaratkan kedua tiang
-- dilewati penyulang yang sama. Selama ini menumpang hanya bisa dari HP.
--
-- Admin memilih tiang yang ditumpangi, lalu mengklik tiang penyulang lain yang
-- menyambung ke situ (`dari`). Hasilnya sama persis dengan regu yang memilih
-- "tiang ini sudah ada" sambil menyusuri dari `dari`: tiang masuk segmen
-- penyulang itu, mendapat nama di penyulang itu, induk di penyulang itu = `dari`.
-- Batang, pemilik, dan nama pemiliknya tidak berubah.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.tumpang_jtm_dari_peta(
  p_tiang_id  UUID,
  p_dari_id   UUID,
  p_penyulang TEXT,
  p_oleh      TEXT DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  t     RECORD;
  dr    RECORD;
  kd    RECORD;
  seg   UUID;
  jarak DOUBLE PRECISION;
  hasil JSONB;
BEGIN
  SELECT * INTO t FROM public.tiang WHERE id = p_tiang_id FOR UPDATE;
  IF NOT FOUND OR t.status_hidup <> 'aktif' THEN RAISE EXCEPTION 'Tiang tidak ditemukan atau sudah dibatalkan'; END IF;
  PERFORM public.penyulang_wajib_boleh(t.ulp);

  IF p_dari_id = p_tiang_id THEN RAISE EXCEPTION 'Pilih tiang lain, bukan tiang ini sendiri'; END IF;
  SELECT * INTO dr FROM public.tiang WHERE id = p_dari_id;
  IF NOT FOUND OR dr.status_hidup <> 'aktif' THEN RAISE EXCEPTION 'Tiang asal tidak ditemukan atau sudah dibatalkan'; END IF;

  SELECT * INTO kd FROM public.tiang_kode_penyulang
   WHERE tiang_id = p_dari_id AND upper(penyulang) = upper(p_penyulang);
  IF NOT FOUND THEN RAISE EXCEPTION 'Tiang % tidak bernama di penyulang %', dr.kode, p_penyulang; END IF;

  IF EXISTS (SELECT 1 FROM public.tiang_kode_penyulang
              WHERE tiang_id = p_tiang_id AND upper(penyulang) = upper(p_penyulang)) THEN
    RAISE EXCEPTION '% sudah lewat tiang % — atur sambungannya lewat "Induk di %"', p_penyulang, t.kode, p_penyulang;
  END IF;

  -- Batas sama dengan gawang janggal di peta (300 m).
  jarak := public.jarak_meter(t.lat, t.lng, dr.lat, dr.lng);
  IF jarak IS NULL OR jarak > 300 THEN
    RAISE EXCEPTION '% berjarak % m dari tiang ini — terlalu jauh untuk satu gawang (batas 300 m)',
      kd.kode, COALESCE(round(jarak::numeric, 0)::text, '?');
  END IF;

  -- Segmen penyulang itu tempat `dari` berada (yang aktif didahulukan).
  SELECT st.segmen_id INTO seg
  FROM public.segmen_tiang st JOIN public.segmen s ON s.id = st.segmen_id
  WHERE st.tiang_id = p_dari_id AND upper(s.penyulang) = upper(p_penyulang)
  ORDER BY (s.status = 'aktif') DESC, s.nama
  LIMIT 1;
  IF seg IS NULL THEN RAISE EXCEPTION 'Tiang % belum masuk segmen % mana pun', kd.kode, p_penyulang; END IF;

  hasil := public.tumpangi_tiang_jtm_dari(seg, p_tiang_id, p_dari_id, p_oleh);
  IF NOT COALESCE((hasil->>'induk_diatur')::boolean, false) THEN
    RAISE EXCEPTION 'Sambungan % ke % di % ditolak (melingkar atau tidak sah)', kd.kode, t.kode, p_penyulang;
  END IF;

  -- tumpangi_tiang_jtm_dari mencatat aksi 'lapangan' — ini suntingan meja.
  UPDATE public.master_audit SET aksi = 'sunting_admin'
   WHERE entitas = 'tiang' AND field = 'induk_penyulang' AND aksi = 'lapangan'
     AND pada = now() AND entitas_kode = hasil->>'kode';

  INSERT INTO public.master_audit
    (entitas, entitas_kode, ulp, field, nilai_lama, nilai_baru, aksi, oleh_uid, oleh_nama)
  VALUES ('tiang', t.kode, COALESCE(t.ulp, '-'), 'tumpang_jtm', NULL,
          jsonb_build_object('penyulang', p_penyulang, 'kode', hasil->>'kode', 'dari', kd.kode,
                             'segmen', (SELECT nama FROM public.segmen WHERE id = seg),
                             'jarak_m', round(jarak::numeric, 1)),
          'sunting_admin', auth.uid(), p_oleh);

  RETURN jsonb_build_object('kode', hasil->>'kode', 'penyulang', p_penyulang, 'dari', kd.kode, 'tiang', t.kode);
END $fn$;

GRANT EXECUTE ON FUNCTION public.tumpang_jtm_dari_peta(UUID, UUID, TEXT, TEXT) TO authenticated;
