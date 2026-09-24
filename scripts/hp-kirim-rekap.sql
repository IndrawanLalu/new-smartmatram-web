-- =============================================================================
-- Fase 1 `rencana-mobile-kerja-lapangan.md` (25 Sep 2026)
-- Jalankan manual di Supabase SQL Editor, SESUDAH `hargardu-fungsi.sql` dan
-- `wo-hargardu.sql`. Idempoten.
--
--   1. kirim_pemeliharaan_gardu(p_isi)  — satu kiriman HP = satu transaksi
--   2. rekap_kinerja(ulp, tahun, bulan) — SATU sumber angka Rekap Kinerja
--                                         untuk web dan HP
-- =============================================================================


-- ── 1. Kirim pemeliharaan gardu ──────────────────────────────────────────────
-- Dulu HP mengirim dalam lima panggilan berurutan (kepala, jawaban, ukur,
-- foto, selesaikan). Sinyal putus di tengah meninggalkan baris "Dalam Proses"
-- setengah jadi di server. Sekarang satu panggilan, satu transaksi: jadi
-- seluruhnya, atau tidak sama sekali.
--
-- Fungsi yang sudah ada DIPAKAI ULANG, bukan disalin — aturan isian wajib,
-- koreksi master, dan penjaga "daftar kosong" tetap hidup di SATU tempat:
--   simpan_periksa_pemeliharaan · usulkan_spek_gardu · selesaikan_pemeliharaan
--
-- Bentuk p_isi (dibangun HP dari draf):
--   id            UUID dibuat HP saat draf lahir, atau id lama bila pekerjaan
--                 dikembalikan admin — sekaligus nama folder fotonya
--   gardu_kode, ulp, penyulang, petugas_nama
--   tgl_padam, tgl_selesai (saat regu menekan Simpan di HP)
--   lat, lng, akurasi
--   reting_fuse, spek (jsonb), catatan_perbaikan, pr_keterangan
--   periksa  [{item_kode, bagian, nilai, nilai_angka, catatan}]
--   ukur     {sebelum: {...}, sesudah: {...} | null}
--   foto     {slot: url}  — SUDAH terunggah (http…); URI lokal ditolak

CREATE OR REPLACE FUNCTION public.kirim_pemeliharaan_gardu(p_isi JSONB)
RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_id    UUID := (p_isi->>'id')::uuid;
  v_kode  TEXT := upper(btrim(p_isi->>'gardu_kode'));
  v_ulp   TEXT := upper(btrim(p_isi->>'ulp'));
  v_nama  TEXT := NULLIF(btrim(p_isi->>'petugas_nama'), '');
  v_role  TEXT;
  v_unit  TEXT;
  m       RECORD;
  dobel   RECORD;
  wita    DATE := (now() AT TIME ZONE 'Asia/Makassar')::date;
  awal    TIMESTAMPTZ;
  k       TEXT;
  v       TEXT;
  slot_ada TEXT[] := '{}';
BEGIN
  IF v_id IS NULL OR v_kode IS NULL OR v_ulp IS NULL THEN
    RAISE EXCEPTION 'Kiriman tidak lengkap: id, gardu, dan ULP wajib ada.';
  END IF;

  -- Hak kirim: UP3 semua ULP; selain itu hanya ULP sendiri.
  SELECT role, unit INTO v_role, v_unit FROM public.user_roles WHERE user_id = auth.uid();
  IF v_role IS NULL THEN
    RAISE EXCEPTION 'Sesi tidak dikenali server. Keluar lalu masuk lagi, kemudian kirim ulang — isian tetap tersimpan di HP.';
  END IF;
  IF v_role <> 'UP3' AND upper(COALESCE(v_unit, '')) <> v_ulp THEN
    RAISE EXCEPTION 'Akun ini untuk ULP %, bukan %.', COALESCE(v_unit, '-'), v_ulp;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.gardu WHERE upper(kode) = v_kode AND upper(ulp) = v_ulp) THEN
    RAISE EXCEPTION 'Gardu % di ULP % tidak ada di master.', v_kode, v_ulp;
  END IF;

  -- Dua regu mengirim gardu yang sama bersamaan tidak boleh lolos berdua.
  PERFORM pg_advisory_xact_lock(hashtext('kirim-hargardu|' || v_kode || '|' || v_ulp));

  -- Gardu yang sudah dikirim HP lain bulan ini ditolak — satu gardu satu
  -- pemeliharaan per bulan. Yang ditolak admin (Ditolak) tidak menghalangi.
  awal := make_date(extract(year FROM wita)::int, extract(month FROM wita)::int, 1)::timestamp AT TIME ZONE 'Asia/Makassar';
  SELECT petugas_nama, tgl_selesai INTO dobel
  FROM public.pemeliharaan_gardu
  WHERE upper(gardu_kode) = v_kode AND upper(ulp) = v_ulp
    AND id <> v_id
    AND status IN ('Selesai', 'Diverifikasi')
    AND tgl_selesai >= awal
  ORDER BY tgl_selesai DESC
  LIMIT 1;
  IF FOUND THEN
    RAISE EXCEPTION 'Gardu % sudah dikirim % pada % — tidak dikirim dua kali. Buang draf ini atau hubungi admin.',
      v_kode, COALESCE(dobel.petugas_nama, 'regu lain'),
      to_char(dobel.tgl_selesai AT TIME ZONE 'Asia/Makassar', 'DD-MM-YYYY');
  END IF;

  SELECT * INTO m FROM public.pemeliharaan_gardu WHERE id = v_id FOR UPDATE;
  IF FOUND THEN
    IF upper(m.gardu_kode) <> v_kode OR upper(m.ulp) <> v_ulp THEN
      RAISE EXCEPTION 'Id pekerjaan ini milik gardu %, bukan %.', m.gardu_kode, v_kode;
    END IF;
    IF m.status NOT IN ('Dijadwalkan', 'Dalam Proses', 'Ditolak') THEN
      RAISE EXCEPTION 'Pemeliharaan % sudah dikirim (status %) — koreksinya lewat admin "Kembalikan ke petugas".',
        v_kode, m.status;
    END IF;
  ELSE
    INSERT INTO public.pemeliharaan_gardu (id, gardu_kode, ulp, status, sumber, petugas_uid)
    SELECT v_id, g.kode, g.ulp, 'Dalam Proses', 'lapangan', auth.uid()
    FROM public.gardu g
    WHERE upper(g.kode) = v_kode AND upper(g.ulp) = v_ulp
    LIMIT 1;
  END IF;

  -- Kepala. Nama regu = tim login (dikunci di HP), disalin juga ke regu_1
  -- supaya layar web yang membaca kolom itu tetap menyebut orang yang benar.
  UPDATE public.pemeliharaan_gardu SET
    penyulang         = COALESCE(NULLIF(p_isi->>'penyulang', ''), penyulang),
    sumber            = CASE WHEN EXISTS (
                          SELECT 1 FROM public.wo_hargardu_item i
                          JOIN public.wo_hargardu w ON w.id = i.wo_id
                          WHERE upper(i.gardu_kode) = v_kode AND upper(i.ulp) = v_ulp
                            AND w.tahun = extract(year FROM wita) AND w.bulan = extract(month FROM wita))
                        THEN 'jadwal' ELSE sumber END,
    tgl_padam         = NULLIF(p_isi->>'tgl_padam', '')::timestamptz,
    petugas_nama      = COALESCE(v_nama, petugas_nama),
    regu_1            = CASE WHEN v_nama IS NULL THEN regu_1 ELSE string_to_array(v_nama, ' & ') END,
    regu_2            = CASE WHEN v_nama IS NULL THEN regu_2 ELSE '{}' END,
    lat               = COALESCE(NULLIF(p_isi->>'lat', '')::numeric, lat),
    lng               = COALESCE(NULLIF(p_isi->>'lng', '')::numeric, lng),
    akurasi           = COALESCE(NULLIF(p_isi->>'akurasi', '')::numeric, akurasi),
    reting_fuse       = COALESCE(p_isi->'reting_fuse', '{}'::jsonb),
    catatan_perbaikan = NULLIF(btrim(p_isi->>'catatan_perbaikan'), ''),
    pr_keterangan     = NULLIF(btrim(p_isi->>'pr_keterangan'), ''),
    -- Tanggal kerja = saat regu menekan Simpan di HP, bukan saat sinyal
    -- akhirnya ada. Tidak boleh di masa depan (jam HP yang salah).
    tgl_selesai       = LEAST(COALESCE(NULLIF(p_isi->>'tgl_selesai', '')::timestamptz, now()), now()),
    updated_at        = now()
  WHERE id = v_id;

  -- Jawaban pemeriksaan (penjaga daftar kosong ada di dalam fungsinya).
  PERFORM public.simpan_periksa_pemeliharaan(v_id, COALESCE(p_isi->'periksa', '[]'::jsonb), v_nama);

  -- Pengukuran sebelum & sesudah. Sesudah boleh kosong → yang lama dibuang.
  INSERT INTO public.pemeliharaan_gardu_ukur (
    pemeliharaan_id, tahap, putaran_phasa,
    arus_r, arus_s, arus_t, arus_n,
    teg_rn, teg_sn, teg_tn, teg_rs, teg_st, teg_tr,
    pertanahan_arrester, pertanahan_trafo, pertanahan_netral, perjurusan)
  SELECT v_id, t.tahap, NULLIF(t.u->>'putaran_phasa', ''),
    NULLIF(t.u->>'arus_r', '')::numeric, NULLIF(t.u->>'arus_s', '')::numeric,
    NULLIF(t.u->>'arus_t', '')::numeric, NULLIF(t.u->>'arus_n', '')::numeric,
    NULLIF(t.u->>'teg_rn', '')::numeric, NULLIF(t.u->>'teg_sn', '')::numeric,
    NULLIF(t.u->>'teg_tn', '')::numeric, NULLIF(t.u->>'teg_rs', '')::numeric,
    NULLIF(t.u->>'teg_st', '')::numeric, NULLIF(t.u->>'teg_tr', '')::numeric,
    NULLIF(t.u->>'pertanahan_arrester', '')::numeric,
    NULLIF(t.u->>'pertanahan_trafo', '')::numeric,
    NULLIF(t.u->>'pertanahan_netral', '')::numeric,
    COALESCE(t.u->'perjurusan', '{}'::jsonb)
  FROM (VALUES ('sebelum', p_isi->'ukur'->'sebelum'), ('sesudah', p_isi->'ukur'->'sesudah')) AS t(tahap, u)
  WHERE jsonb_typeof(t.u) = 'object'
  ON CONFLICT (pemeliharaan_id, tahap) DO UPDATE SET
    putaran_phasa = EXCLUDED.putaran_phasa,
    arus_r = EXCLUDED.arus_r, arus_s = EXCLUDED.arus_s, arus_t = EXCLUDED.arus_t, arus_n = EXCLUDED.arus_n,
    teg_rn = EXCLUDED.teg_rn, teg_sn = EXCLUDED.teg_sn, teg_tn = EXCLUDED.teg_tn,
    teg_rs = EXCLUDED.teg_rs, teg_st = EXCLUDED.teg_st, teg_tr = EXCLUDED.teg_tr,
    pertanahan_arrester = EXCLUDED.pertanahan_arrester,
    pertanahan_trafo    = EXCLUDED.pertanahan_trafo,
    pertanahan_netral   = EXCLUDED.pertanahan_netral,
    perjurusan = EXCLUDED.perjurusan,
    updated_at = now();

  IF jsonb_typeof(p_isi->'ukur'->'sesudah') IS DISTINCT FROM 'object' THEN
    DELETE FROM public.pemeliharaan_gardu_ukur WHERE pemeliharaan_id = v_id AND tahap = 'sesudah';
  END IF;

  -- Foto: hanya yang SUDAH terunggah. URI lokal berarti unggahannya gagal
  -- di HP — lebih baik ditolak di sini daripada tersimpan tautan mati.
  FOR k, v IN SELECT key, value #>> '{}' FROM jsonb_each(COALESCE(p_isi->'foto', '{}'::jsonb)) LOOP
    CONTINUE WHEN v IS NULL OR btrim(v) = '';
    IF v NOT LIKE 'http%' THEN
      RAISE EXCEPTION 'Foto % belum terunggah. Kirim ulang saat sinyal lebih baik.', k;
    END IF;
    INSERT INTO public.pemeliharaan_gardu_foto (pemeliharaan_id, slot, url)
    VALUES (v_id, k, v)
    ON CONFLICT (pemeliharaan_id, slot) DO UPDATE SET url = EXCLUDED.url, diambil_at = now();
    slot_ada := slot_ada || k;
  END LOOP;
  DELETE FROM public.pemeliharaan_gardu_foto f WHERE f.pemeliharaan_id = v_id AND NOT (f.slot = ANY (slot_ada));

  -- Spesifikasi → master (setelah foto: usulan kVA menempelkan foto nama plat).
  PERFORM * FROM public.usulkan_spek_gardu(v_id, COALESCE(p_isi->'spek', '{}'::jsonb), v_nama);

  -- Menolak yang belum lengkap dan menyebut apa yang kurang. Karena satu
  -- transaksi, penolakan di sini membatalkan SELURUH kiriman di atas.
  PERFORM public.selesaikan_pemeliharaan(v_id, v_nama);

  RETURN v_id;
END $$;

COMMENT ON FUNCTION public.kirim_pemeliharaan_gardu IS
  'Satu kiriman Pemeliharaan Gardu dari HP dalam satu transaksi (kepala, periksa, ukur, foto, spek, selesai). Dipakai HP sejak rencana-mobile-kerja-lapangan Fase 1.';

GRANT EXECUTE ON FUNCTION public.kirim_pemeliharaan_gardu(JSONB) TO authenticated;


-- ── 2. Rekap Kinerja — satu sumber angka untuk web dan HP ────────────────────
-- Dipindah dari `useKinerjaYantek` (web) yang menghitungnya di peramban dari
-- sebelas kueri. Menyalin logika itu ke HP berarti dua salinan yang pasti
-- melenceng; karena itu angkanya lahir di sini, dan label/keterangan tiap
-- baris tetap milik aplikasinya.
--
-- Batas hari WITA. p_bulan = 0 → seluruh tahun. p_ulp NULL/'SEMUA' → semua ULP.
-- `luar_wo` hanya diisi baris hargardu (pemeliharaan terkirim di luar WO).
--
-- Perbaikan sekalian: panjang JTR disambung lewat kode gardu DAN ULP — kode
-- gardu tidak unik lintas ULP, dan versi web menjumlah lintas ULP.

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
  WHERE o.status <> 'Dibatalkan'
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

COMMENT ON FUNCTION public.rekap_kinerja IS
  'Angka Rekap Kinerja Pelayanan Teknik (8 baris) untuk web dan HP. Batas hari WITA; p_bulan 0 = setahun; p_ulp NULL/SEMUA = semua ULP.';

GRANT EXECUTE ON FUNCTION public.rekap_kinerja(TEXT, INT, INT) TO authenticated;


-- ── Periksa ──────────────────────────────────────────────────────────────────
--   SELECT * FROM rekap_kinerja('AMPENAN', 2026, 9);
--   SELECT * FROM rekap_kinerja(NULL, 2026, 0);
