-- =============================================================================
-- O1 `rencana-mobile-optimasi.md` (25 Sep 2026)
-- Jalankan manual di Supabase SQL Editor, SESUDAH `optimasi-trafo.sql` dan
-- `hp-kirim-rekap.sql`. Idempoten.
--
--   1. Status `Dikembalikan` + kolom penandanya
--   2. kembalikan_optimasi_trafo(id, alasan) — tombol web "Kembalikan ke petugas"
--   3. simpan_optimasi_trafo menerima id dari HP (kirim ulang tidak kembar)
--   4. ubah_optimasi_trafo menerima kiriman ulang yang dikembalikan
--   5. rekap_kinerja tidak menghitung yang dikembalikan
--
-- Badan fungsi 3–5 DISALIN dari versi yang terpasang (`optimasi-trafo.sql`,
-- `hp-kirim-rekap.sql`); yang berubah hanya bagian bertanda.
-- =============================================================================


-- ── 1. Status & kolom ────────────────────────────────────────────────────────
ALTER TABLE public.optimasi_trafo
  ADD COLUMN IF NOT EXISTS dikembalikan_at     TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS dikembalikan_alasan TEXT,
  ADD COLUMN IF NOT EXISTS dikembalikan_oleh   TEXT;

ALTER TABLE public.optimasi_trafo DROP CONSTRAINT IF EXISTS optimasi_trafo_status_valid;
ALTER TABLE public.optimasi_trafo ADD CONSTRAINT optimasi_trafo_status_valid
  CHECK (status IN ('Selesai', 'Diverifikasi', 'Dibatalkan', 'Dikembalikan'));


-- ── 2. Kembalikan ke petugas ─────────────────────────────────────────────────
-- Hanya dari `Selesai`. Usulan master yang menunggu TIDAK diputuskan di sini:
-- tetap menunggu, dan diputuskan saat verifikasi seperti biasa (kiriman ulang
-- menyusunnya kembali lewat `_optimasi_susun_usulan`).
CREATE OR REPLACE FUNCTION public.kembalikan_optimasi_trafo(
  p_id     UUID,
  p_alasan TEXT,
  p_nama   TEXT DEFAULT NULL
) RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  o RECORD;
BEGIN
  IF btrim(COALESCE(p_alasan, '')) = '' THEN
    RAISE EXCEPTION 'Alasan wajib diisi — petugas harus tahu apa yang diperbaiki.';
  END IF;

  SELECT * INTO o FROM public.optimasi_trafo WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Catatan tidak ditemukan.'; END IF;

  PERFORM public.wajib_boleh_ulp(o.ulp);

  IF o.status <> 'Selesai' THEN
    RAISE EXCEPTION 'Hanya catatan yang menunggu verifikasi yang bisa dikembalikan (status sekarang: %).', o.status;
  END IF;

  UPDATE public.optimasi_trafo
  SET status              = 'Dikembalikan',
      dikembalikan_at     = now(),
      dikembalikan_alasan = btrim(p_alasan),
      dikembalikan_oleh   = p_nama,
      updated_at          = now()
  WHERE id = p_id;
END $$;

GRANT EXECUTE ON FUNCTION public.kembalikan_optimasi_trafo(UUID, TEXT, TEXT) TO authenticated;


-- ── 3. simpan_optimasi_trafo + p_id ──────────────────────────────────────────
-- Tanda tangan lama DIBUANG dulu: menambah parameter lewat CREATE OR REPLACE
-- melahirkan fungsi kedua yang senama, lalu PostgREST menolak "not unique".
-- HP versi lama memanggil lewat nama parameter tanpa p_id → tetap mendarat di
-- sini (p_id berawalan NULL).
DROP FUNCTION IF EXISTS public.simpan_optimasi_trafo(
  TEXT, TEXT, NUMERIC, NUMERIC, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT,
  BOOLEAN, TEXT, TEXT, INT, TEXT, TEXT, TEXT, TEXT, DATE, DATE,
  DOUBLE PRECISION, DOUBLE PRECISION, DOUBLE PRECISION, TEXT, TEXT);

CREATE OR REPLACE FUNCTION public.simpan_optimasi_trafo(
  p_kode_gardu   TEXT,
  p_ulp          TEXT,
  p_kva_lama     NUMERIC,
  p_kva_baru     NUMERIC,
  p_no_seri_lama TEXT,
  p_no_seri_baru TEXT,
  p_asal         TEXT,
  p_tujuan       TEXT,
  p_alasan       TEXT,
  p_foto_lama    TEXT,
  p_foto_baru    TEXT,
  p_seri_lama_tak_terbaca BOOLEAN DEFAULT false,
  p_pengukuran_id TEXT DEFAULT NULL,
  p_merk_baru    TEXT DEFAULT NULL,
  p_tahun_baru   INT  DEFAULT NULL,
  p_asal_kode    TEXT DEFAULT NULL,
  p_asal_ulp     TEXT DEFAULT NULL,
  p_tujuan_kode  TEXT DEFAULT NULL,
  p_tujuan_ulp   TEXT DEFAULT NULL,
  p_tgl_mutasi   DATE DEFAULT NULL,
  p_tgl_operasi  DATE DEFAULT NULL,
  p_lat          DOUBLE PRECISION DEFAULT NULL,
  p_lng          DOUBLE PRECISION DEFAULT NULL,
  p_akurasi      DOUBLE PRECISION DEFAULT NULL,
  p_catatan      TEXT DEFAULT NULL,
  p_nama         TEXT DEFAULT NULL,
  -- Id dari HP (teknisaplikasi.md butir 17). Id yang sudah ada = kiriman
  -- ulang setelah jawaban server hilang di jalan → catatan itu dikembalikan,
  -- bukan dibuat kembarannya.
  p_id           UUID DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_asal   TEXT := upper(btrim(COALESCE(p_asal, '')));
  v_tujuan TEXT := upper(btrim(COALESCE(p_tujuan, 'GUDANG')));
  g        RECORD;
  v_id     UUID;
  v_usulan INT;
  v_ukur   TEXT := p_pengukuran_id;
  v_wo_batal BOOLEAN := false;
BEGIN
  IF p_id IS NOT NULL THEN
    SELECT o.pengukuran_id INTO v_ukur FROM public.optimasi_trafo o WHERE o.id = p_id;
    IF FOUND THEN
      RETURN jsonb_build_object('id', p_id, 'usulan', 0, 'pengukuran_id', v_ukur,
                                'wo_dibatalkan', false, 'sudah_ada', true);
    END IF;
    v_ukur := p_pengukuran_id;
  END IF;

  PERFORM public._optimasi_periksa(
    p_kode_gardu, p_ulp, p_kva_lama, p_kva_baru,
    p_no_seri_lama, p_seri_lama_tak_terbaca, p_no_seri_baru,
    v_asal, p_asal_kode, p_asal_ulp, v_tujuan, p_tujuan_kode, p_tujuan_ulp,
    p_alasan);

  IF btrim(COALESCE(p_foto_lama, '')) = '' OR btrim(COALESCE(p_foto_baru, '')) = '' THEN
    RAISE EXCEPTION 'Foto papan nama trafo lama dan baru dua-duanya wajib';
  END IF;

  -- WO-nya sudah dibatalkan admin sementara regu telanjur mengerjakannya dari
  -- draf. Pekerjaannya nyata — trafonya sudah diganti — jadi catatannya
  -- DITERIMA sebagai pekerjaan di luar WO, bukan ditolak dan hilang.
  IF v_ukur IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.optimasi_wo_batal WHERE pengukuran_id = v_ukur
  ) THEN
    v_ukur := NULL;
    v_wo_batal := true;
  END IF;

  -- WO yang sama tidak boleh terkirim dua kali. Ini terjadi kalau Kirim
  -- ditekan dua kali di sinyal yang lambat — respons pertama belum kembali,
  -- drafnya belum terhapus, dan regu menekan lagi.
  IF v_ukur IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.optimasi_trafo
    WHERE pengukuran_id = v_ukur AND status <> 'Dibatalkan'
  ) THEN
    RAISE EXCEPTION 'WO ini sudah punya catatan optimasi yang terkirim';
  END IF;

  -- Dicatat "di luar WO" padahal gardunya punya WO terbuka → kaitkan ke WO
  -- itu. Regu tidak selalu membuka lewat daftar WO, dan dari sisi pekerjaan
  -- itu tetap WO yang sama: satu gardu, satu penggantian trafo, satu baris.
  IF v_ukur IS NULL AND NOT v_wo_batal THEN
    SELECT pg.id INTO v_ukur
    FROM public.pengukuran_gardu pg
    WHERE pg.jenis_pemeliharaan = 'OPTIMASI TRAFO'
      AND pg.hasil_penyeimbangan_id IS NULL
      AND upper(pg.no_gardu) = upper(p_kode_gardu)
      AND upper(pg.petugas_unit) = upper(p_ulp)
      AND pg.tanggal_pengukuran <= to_char(COALESCE(p_tgl_operasi, CURRENT_DATE), 'YYYY-MM-DD')
      AND NOT EXISTS (SELECT 1 FROM public.optimasi_wo_batal b WHERE b.pengukuran_id = pg.id)
      AND NOT EXISTS (
        SELECT 1 FROM public.optimasi_trafo x
        WHERE x.pengukuran_id = pg.id AND x.status <> 'Dibatalkan'
      )
    ORDER BY pg.tanggal_pengukuran DESC
    LIMIT 1;
  END IF;

  -- Identitas gardu diambil dari MASTER, bukan dari kiriman HP.
  SELECT kode, ulp, feeder, alamat, daya, no_seri INTO g
  FROM public.gardu
  WHERE upper(kode) = upper(p_kode_gardu) AND upper(ulp) = upper(p_ulp);

  INSERT INTO public.optimasi_trafo (
    id, pengukuran_id, kode_gardu, ulp, penyulang, alamat,
    kva_lama, kva_baru, kva_lama_master,
    no_seri_lama, seri_lama_tak_terbaca, no_seri_lama_master, no_seri_baru,
    merk_baru, tahun_baru,
    asal_trafo, asal_kode_gardu, asal_ulp,
    tujuan_trafo_lama, tujuan_kode_gardu, tujuan_ulp,
    alasan, tgl_mutasi, tgl_operasi,
    foto_nameplate_lama_url, foto_nameplate_baru_url,
    lat, lng, akurasi, petugas_uid, petugas_nama, catatan
  ) VALUES (
    COALESCE(p_id, gen_random_uuid()), v_ukur, upper(g.kode), upper(g.ulp), g.feeder, g.alamat,
    p_kva_lama, p_kva_baru, g.daya::numeric,
    NULLIF(btrim(COALESCE(p_no_seri_lama, '')), ''),
    COALESCE(p_seri_lama_tak_terbaca, false) AND public.seri_norm(p_no_seri_lama) IS NULL,
    g.no_seri,
    btrim(p_no_seri_baru),
    NULLIF(btrim(COALESCE(p_merk_baru, '')), ''), p_tahun_baru,
    v_asal,
    CASE WHEN v_asal = 'GARDU' THEN upper(btrim(p_asal_kode)) END,
    CASE WHEN v_asal = 'GARDU' THEN upper(btrim(p_asal_ulp)) END,
    v_tujuan,
    CASE WHEN v_tujuan = 'GARDU' THEN upper(btrim(p_tujuan_kode)) END,
    CASE WHEN v_tujuan = 'GARDU' THEN upper(btrim(p_tujuan_ulp)) END,
    p_alasan,
    COALESCE(p_tgl_mutasi, CURRENT_DATE), COALESCE(p_tgl_operasi, CURRENT_DATE),
    p_foto_lama, p_foto_baru,
    p_lat, p_lng, p_akurasi, auth.uid(), p_nama,
    NULLIF(btrim(COALESCE(p_catatan, '')), '')
  )
  RETURNING id INTO v_id;

  v_usulan := public._optimasi_susun_usulan(v_id);

  RETURN jsonb_build_object('id', v_id, 'usulan', v_usulan, 'pengukuran_id', v_ukur,
                            'wo_dibatalkan', v_wo_batal);
END $$;

GRANT EXECUTE ON FUNCTION public.simpan_optimasi_trafo(
  TEXT, TEXT, NUMERIC, NUMERIC, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT,
  BOOLEAN, TEXT, TEXT, INT, TEXT, TEXT, TEXT, TEXT, DATE, DATE,
  DOUBLE PRECISION, DOUBLE PRECISION, DOUBLE PRECISION, TEXT, TEXT, UUID) TO authenticated;


-- ── 4. ubah_optimasi_trafo menerima Dikembalikan ─────────────────────────────
CREATE OR REPLACE FUNCTION public.ubah_optimasi_trafo(
  p_id           UUID,
  p_kva_lama     NUMERIC,
  p_kva_baru     NUMERIC,
  p_no_seri_lama TEXT,
  p_no_seri_baru TEXT,
  p_asal         TEXT,
  p_tujuan       TEXT,
  p_alasan       TEXT,
  p_seri_lama_tak_terbaca BOOLEAN DEFAULT false,
  p_merk_baru    TEXT DEFAULT NULL,
  p_tahun_baru   INT  DEFAULT NULL,
  p_asal_kode    TEXT DEFAULT NULL,
  p_asal_ulp     TEXT DEFAULT NULL,
  p_tujuan_kode  TEXT DEFAULT NULL,
  p_tujuan_ulp   TEXT DEFAULT NULL,
  p_tgl_mutasi   DATE DEFAULT NULL,
  p_tgl_operasi  DATE DEFAULT NULL,
  p_lat          DOUBLE PRECISION DEFAULT NULL,
  p_lng          DOUBLE PRECISION DEFAULT NULL,
  p_catatan      TEXT DEFAULT NULL,
  p_foto_lama    TEXT DEFAULT NULL,
  p_foto_baru    TEXT DEFAULT NULL
) RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  o        RECORD;
  v_asal   TEXT := upper(btrim(COALESCE(p_asal, '')));
  v_tujuan TEXT := upper(btrim(COALESCE(p_tujuan, 'GUDANG')));
BEGIN
  SELECT * INTO o FROM public.optimasi_trafo WHERE id = p_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Catatan tidak ditemukan'; END IF;
  -- Selesai = Edit admin di web; Dikembalikan = kiriman ulang regu dari HP.
  IF o.status NOT IN ('Selesai', 'Dikembalikan') THEN
    RAISE EXCEPTION 'Catatan ini sudah % — koreksinya lewat admin', lower(o.status);
  END IF;

  PERFORM public._optimasi_periksa(
    o.kode_gardu, o.ulp, p_kva_lama, p_kva_baru,
    p_no_seri_lama, p_seri_lama_tak_terbaca, p_no_seri_baru,
    v_asal, p_asal_kode, p_asal_ulp, v_tujuan, p_tujuan_kode, p_tujuan_ulp,
    p_alasan);

  UPDATE public.optimasi_trafo SET
    kva_lama   = p_kva_lama,
    kva_baru   = p_kva_baru,
    no_seri_lama = NULLIF(btrim(COALESCE(p_no_seri_lama, '')), ''),
    seri_lama_tak_terbaca = COALESCE(p_seri_lama_tak_terbaca, false) AND public.seri_norm(p_no_seri_lama) IS NULL,
    no_seri_baru = btrim(p_no_seri_baru),
    merk_baru  = NULLIF(btrim(COALESCE(p_merk_baru, '')), ''),
    tahun_baru = p_tahun_baru,
    asal_trafo = v_asal,
    asal_kode_gardu = CASE WHEN v_asal = 'GARDU' THEN upper(btrim(p_asal_kode)) END,
    asal_ulp        = CASE WHEN v_asal = 'GARDU' THEN upper(btrim(p_asal_ulp)) END,
    tujuan_trafo_lama = v_tujuan,
    tujuan_kode_gardu = CASE WHEN v_tujuan = 'GARDU' THEN upper(btrim(p_tujuan_kode)) END,
    tujuan_ulp        = CASE WHEN v_tujuan = 'GARDU' THEN upper(btrim(p_tujuan_ulp)) END,
    alasan     = p_alasan,
    tgl_mutasi = COALESCE(p_tgl_mutasi, tgl_mutasi),
    tgl_operasi = COALESCE(p_tgl_operasi, tgl_operasi),
    lat        = COALESCE(p_lat, lat),
    lng        = COALESCE(p_lng, lng),
    catatan    = NULLIF(btrim(COALESCE(p_catatan, '')), ''),
    foto_nameplate_lama_url = COALESCE(NULLIF(btrim(COALESCE(p_foto_lama, '')), ''), foto_nameplate_lama_url),
    foto_nameplate_baru_url = COALESCE(NULLIF(btrim(COALESCE(p_foto_baru, '')), ''), foto_nameplate_baru_url),
    -- Kiriman ulang yang dikembalikan = catatan sah lagi.
    status = 'Selesai',
    dikembalikan_at = NULL,
    dikembalikan_alasan = NULL,
    dikembalikan_oleh = NULL,
    updated_at = now()
  WHERE id = p_id;

  -- Usulan ikut isian terbaru — admin tidak boleh menyetujui angka yang sudah
  -- dikoreksi regunya sendiri.
  PERFORM public._optimasi_susun_usulan(p_id);
END $$;


-- ── 5. rekap_kinerja ─────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.rekap_kinerja(p_ulp TEXT, p_tahun INT, p_bulan INT)
RETURNS TABLE (kunci TEXT, wo_terbit NUMERIC, realisasi NUMERIC, belum_disetujui NUMERIC, luar_wo INT)
LANGUAGE plpgsql STABLE SET search_path = public AS $$
DECLARE
  u      TEXT := NULLIF(NULLIF(upper(btrim(COALESCE(p_ulp, ''))), ''), 'SEMUA');
  d_awal DATE := make_date(p_tahun, CASE WHEN p_bulan = 0 THEN 1 ELSE p_bulan END, 1);
  d_akhr DATE;  -- eksklusif
  t_awal TIMESTAMPTZ;
  t_akhr TIMESTAMPTZ;
  jadi   NUMERIC;
BEGIN
  d_akhr := CASE WHEN p_bulan = 0 THEN make_date(p_tahun + 1, 1, 1)
                 ELSE (d_awal + INTERVAL '1 month')::date END;
  t_awal := d_awal::timestamp AT TIME ZONE 'Asia/Makassar';
  t_akhr := d_akhr::timestamp AT TIME ZONE 'Asia/Makassar';

  -- Perabasan — km dari WO Perabasan. Belum punya tahap persetujuan.
  RETURN QUERY
  SELECT 'perabasan'::text, round(COALESCE(sum(c.target_km), 0), 3), round(COALESCE(sum(c.capaian_km), 0), 3), 0::numeric, NULL::int
  FROM public.wo_perabasan_capaian c
  WHERE c.tgl_wo::date >= d_awal AND c.tgl_wo::date < d_akhr
    AND (u IS NULL OR upper(c.ulp) = u);

  -- Pemeliharaan Jaringan — tanpa WO.
  RETURN QUERY
  SELECT 'harjtm'::text, NULL::numeric, count(*)::numeric, count(*) FILTER (WHERE j.status = 'Selesai')::numeric, NULL::int
  FROM public.pemeliharaan_jaringan j
  WHERE j.status <> 'Dibatalkan'
    AND j.tgl::date >= d_awal AND j.tgl::date < d_akhr
    AND (u IS NULL OR upper(j.ulp) = u);

  -- Pemeliharaan Gardu — WO bulanan, realisasi SAAT DIKIRIM.
  SELECT count(*) FILTER (WHERE r.terealisasi) INTO jadi
  FROM public.wo_hargardu_realisasi r
  WHERE r.tahun = p_tahun AND (p_bulan = 0 OR r.bulan = p_bulan)
    AND (u IS NULL OR upper(r.ulp) = u);

  RETURN QUERY
  SELECT 'hargardu'::text,
    (SELECT count(*)::numeric FROM public.wo_hargardu_realisasi r
      WHERE r.tahun = p_tahun AND (p_bulan = 0 OR r.bulan = p_bulan) AND (u IS NULL OR upper(r.ulp) = u)),
    jadi,
    (SELECT count(*) FILTER (WHERE r.terealisasi AND NOT r.disetujui)::numeric FROM public.wo_hargardu_realisasi r
      WHERE r.tahun = p_tahun AND (p_bulan = 0 OR r.bulan = p_bulan) AND (u IS NULL OR upper(r.ulp) = u)),
    GREATEST(0, (SELECT count(*) FROM public.pemeliharaan_gardu g
                  WHERE g.status IN ('Selesai', 'Diverifikasi')
                    AND g.created_at >= t_awal AND g.created_at < t_akhr
                    AND (u IS NULL OR upper(g.ulp) = u)) - jadi)::int;

  -- Penyeimbangan — tanpa WO, tanpa persetujuan.
  RETURN QUERY
  SELECT 'penyeimbangan'::text, NULL::numeric, count(*)::numeric, NULL::numeric, NULL::int
  FROM public.penyeimbangan_gardu p
  WHERE p.created_at >= t_awal AND p.created_at < t_akhr
    AND (u IS NULL OR upper(p.ulp) = u);

  -- Optimasi Trafo — WO = ditandai OPTIMASI TRAFO, tanpa yang dibatalkan.
  RETURN QUERY
  SELECT 'optimasi'::text,
    (SELECT count(*)::numeric FROM public.pengukuran_gardu pg
      WHERE pg.jenis_pemeliharaan = 'OPTIMASI TRAFO'
        AND pg.wo_sent_at >= t_awal AND pg.wo_sent_at < t_akhr
        AND (u IS NULL OR upper(pg.petugas_unit) = u)
        AND NOT EXISTS (SELECT 1 FROM public.optimasi_wo_batal b WHERE b.pengukuran_id::text = pg.id::text)),
    count(*)::numeric,
    count(*) FILTER (WHERE o.status = 'Selesai')::numeric,
    NULL::int
  FROM public.optimasi_trafo o
  -- Dikembalikan ke petugas = belum realisasi sampai dikirim ulang.
  WHERE o.status NOT IN ('Dibatalkan', 'Dikembalikan')
    AND o.tgl_operasi::date >= d_awal AND o.tgl_operasi::date < d_akhr
    AND (u IS NULL OR upper(o.ulp) = u);

  -- Pengukuran beban — WO Pengukuran.
  RETURN QUERY
  SELECT 'pengukuran'::text, count(*)::numeric,
    count(*) FILTER (WHERE r.terealisasi)::numeric,
    count(*) FILTER (WHERE r.tertahan)::numeric, NULL::int
  FROM public.wo_pengukuran_realisasi r
  WHERE r.tahun = p_tahun AND (p_bulan = 0 OR r.bulan = p_bulan)
    AND (u IS NULL OR upper(r.ulp) = u);

  -- Inspeksi JTM — km segmen yang penyapuannya selesai.
  RETURN QUERY
  SELECT 'jtm'::text, NULL::numeric,
    round(COALESCE(sum(sp.panjang_pakai_km) FILTER (WHERE m.status IN ('Selesai', 'Diverifikasi')), 0), 3),
    round(COALESCE(sum(sp.panjang_pakai_km) FILTER (WHERE m.status = 'Selesai'), 0), 3),
    NULL::int
  FROM public.inspeksi_jtm m
  LEFT JOIN public.segmen_panjang sp ON sp.segmen_id = m.segmen_id
  WHERE m.created_at >= t_awal AND m.created_at < t_akhr
    AND (u IS NULL OR upper(m.ulp) = u);

  -- Inspeksi JTR — km penghantar gardu (termasuk underbuild), kode + ULP.
  RETURN QUERY
  SELECT 'jtr'::text, NULL::numeric,
    round(COALESCE(sum(pj.km) FILTER (WHERE r.status IN ('Selesai', 'Diverifikasi')), 0), 3),
    round(COALESCE(sum(pj.km) FILTER (WHERE r.status = 'Selesai'), 0), 3),
    NULL::int
  FROM public.inspeksi_jtr r
  LEFT JOIN LATERAL (
    SELECT sum(g.panjang_km) AS km FROM public.gardu_jtr_penghantar g
    WHERE g.gardu_kode = r.gardu_kode AND g.ulp = r.ulp
  ) pj ON true
  WHERE r.created_at >= t_awal AND r.created_at < t_akhr
    AND (u IS NULL OR upper(r.ulp) = u);
END $$;

GRANT EXECUTE ON FUNCTION public.rekap_kinerja(TEXT, INT, INT) TO authenticated;


-- ── Periksa ──────────────────────────────────────────────────────────────────
--   SELECT status, count(*) FROM optimasi_trafo GROUP BY 1;
--   SELECT * FROM rekap_kinerja(NULL, 2026, 9) WHERE kunci = 'optimasi';
