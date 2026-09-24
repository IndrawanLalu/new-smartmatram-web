-- =============================================================================
-- P1 `rencana-mobile-pengukuran.md` (25 Sep 2026)
-- Jalankan manual di Supabase SQL Editor, SESUDAH `pengukuran-kunci-titik.sql`
-- dan `hp-kirim-rekap.sql`. Idempoten.
--
--   1. Kolom "dikembalikan" di pengukuran_gardu
--   2. kembalikan_pengukuran(id, alasan)  — tombol web "Kembalikan ke petugas"
--   3. kirim_pengukuran_gardu(p_isi)      — satu kiriman HP = satu transaksi
--   4. Yang dikembalikan keluar dari keadaan terkini gardu & realisasi WO
-- =============================================================================


-- ── 1. Penanda dikembalikan ──────────────────────────────────────────────────
-- Pengukuran tidak punya status, dan tidak perlu punya: satu-satunya keadaan
-- baru adalah "dikembalikan ke petugas". NULL = normal.
ALTER TABLE public.pengukuran_gardu
  ADD COLUMN IF NOT EXISTS dikembalikan_at     TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS dikembalikan_alasan TEXT,
  ADD COLUMN IF NOT EXISTS dikembalikan_oleh   TEXT;

COMMENT ON COLUMN public.pengukuran_gardu.dikembalikan_at IS
  'Diisi = admin mengembalikan pengukuran ini ke petugas untuk diperbaiki. Selama terisi, pengukuran ini TIDAK dihitung sebagai keadaan terkini gardu maupun realisasi WO. Dikosongkan lagi saat petugas mengirim ulang.';

-- Penunjang pencarian "pengukuran saya yang dikembalikan" dari HP.
CREATE INDEX IF NOT EXISTS pengukuran_gardu_dikembalikan_idx
  ON public.pengukuran_gardu (petugas_unit, petugas_nama)
  WHERE dikembalikan_at IS NOT NULL;


-- ── 2. Kembalikan ke petugas ─────────────────────────────────────────────────
-- Edit langsung oleh admin di web TETAP ada untuk salah ketik kecil
-- (keputusan user 25 Sep 2026). Ini untuk yang harus diukur/diisi ulang
-- oleh petugasnya sendiri.

CREATE OR REPLACE FUNCTION public.kembalikan_pengukuran(
  p_id     TEXT,
  p_alasan TEXT,
  p_nama   TEXT DEFAULT NULL
) RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  m RECORD;
BEGIN
  IF p_alasan IS NULL OR btrim(p_alasan) = '' THEN
    RAISE EXCEPTION 'Alasan wajib diisi — petugas harus tahu apa yang diperbaiki.';
  END IF;

  SELECT * INTO m FROM public.pengukuran_gardu WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Pengukuran tidak ditemukan.'; END IF;

  PERFORM public.wajib_boleh_ulp(m.petugas_unit);

  IF m.hasil_penyeimbangan_id IS NOT NULL THEN
    RAISE EXCEPTION 'Ini baris hasil penyeimbangan untuk AMG, bukan pengukuran petugas — koreksinya lewat Penyeimbangan.';
  END IF;
  IF m.amg_sent_at IS NOT NULL OR m.amg_queued_at IS NOT NULL THEN
    RAISE EXCEPTION 'Pengukuran % sudah masuk antrean/terkirim ke AMG — tidak bisa dikembalikan. Koreksi lewat Edit.', m.no_gardu;
  END IF;
  IF m.dikembalikan_at IS NOT NULL THEN
    RAISE EXCEPTION 'Pengukuran % sudah dikembalikan dan menunggu diperbaiki petugas.', m.no_gardu;
  END IF;

  UPDATE public.pengukuran_gardu
  SET dikembalikan_at     = now(),
      dikembalikan_alasan = btrim(p_alasan),
      dikembalikan_oleh   = p_nama,
      updated_at          = now()
  WHERE id = p_id;
END $$;

COMMENT ON FUNCTION public.kembalikan_pengukuran IS
  'Mengembalikan pengukuran ke petugas (alasan wajib). Admin ULP-nya atau UP3. Menolak baris hasil penyeimbangan dan yang sudah ke AMG.';

GRANT EXECUTE ON FUNCTION public.kembalikan_pengukuran(TEXT, TEXT, TEXT) TO authenticated;


-- ── 3. Kirim pengukuran dari HP ──────────────────────────────────────────────
-- Dulu tiga panggilan terpisah (pengukuran → usulan titik → usulan kVA), dan
-- usulan yang gagal dilewati diam-diam. Sekarang satu transaksi. Fungsi usulan
-- yang sudah ada DIPAKAI ULANG: `koreksi_titik_gardu`, `usul_kva_gardu`.
--
-- Bentuk p_isi (dibangun HP dari draf):
--   id                 dibuat HP saat draf lahir, atau id lama bila dikembalikan
--   no_gardu, ulp, alamat, penyulang, petugas_nama
--   tanggal_pengukuran (YYYY-MM-DD, dipilih petugas), jam_pengukuran (HH:MM)
--   kva_trafo, suhu_trafo, beban_kva, persen_beban
--   total_arus_r/s/t/n, total_teg_rn/sn/tn/rs/rt/st, perjurusan (jsonb)
--   lokasi_lat, lokasi_lng, lokasi_akurasi
--   koreksi  {lat, lng, akurasi, catatan, foto[]} | null  — usulan titik gardu

CREATE OR REPLACE FUNCTION public.kirim_pengukuran_gardu(p_isi JSONB)
RETURNS TEXT
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_id    TEXT := NULLIF(btrim(p_isi->>'id'), '');
  v_kode  TEXT := upper(btrim(p_isi->>'no_gardu'));
  v_ulp   TEXT := upper(btrim(p_isi->>'ulp'));
  v_nama  TEXT := NULLIF(btrim(p_isi->>'petugas_nama'), '');
  v_tgl   DATE := NULLIF(p_isi->>'tanggal_pengukuran', '')::date;
  v_kva   NUMERIC := NULLIF(p_isi->>'kva_trafo', '')::numeric;
  v_role  TEXT;
  v_unit  TEXT;
  hari    DATE := (now() AT TIME ZONE 'Asia/Makassar')::date;
  g       RECORD;
  m       RECORD;
  dobel   RECORD;
  kor     JSONB := p_isi->'koreksi';
  v_sumber UUID;
BEGIN
  IF v_id IS NULL OR v_kode IS NULL OR v_ulp IS NULL OR v_tgl IS NULL THEN
    RAISE EXCEPTION 'Kiriman tidak lengkap: id, gardu, ULP, dan tanggal wajib ada.';
  END IF;

  SELECT role, unit INTO v_role, v_unit FROM public.user_roles WHERE user_id = auth.uid();
  IF v_role IS NULL THEN
    RAISE EXCEPTION 'Sesi tidak dikenali server. Keluar lalu masuk lagi, kemudian kirim ulang — isian tetap tersimpan di HP.';
  END IF;
  IF v_role <> 'UP3' AND upper(COALESCE(v_unit, '')) <> v_ulp THEN
    RAISE EXCEPTION 'Akun ini untuk ULP %, bukan %.', COALESCE(v_unit, '-'), v_ulp;
  END IF;

  -- Tanggal dipilih petugas (keputusan user), tapi dijaga.
  IF v_tgl > hari THEN
    RAISE EXCEPTION 'Tanggal ukur % ada di masa depan. Periksa tanggal di formulir.', to_char(v_tgl, 'DD-MM-YYYY');
  END IF;
  IF v_tgl < hari - 7 THEN
    RAISE EXCEPTION 'Tanggal ukur % lebih dari 7 hari lalu. Minta admin mencatatnya dari web.', to_char(v_tgl, 'DD-MM-YYYY');
  END IF;

  IF v_kva IS NULL OR v_kva <= 0 THEN
    RAISE EXCEPTION 'kVA trafo wajib diisi dan lebih dari nol.';
  END IF;

  SELECT kode, ulp INTO g FROM public.gardu WHERE upper(kode) = v_kode AND upper(ulp) = v_ulp;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Gardu % di ULP % tidak ada di master.', v_kode, v_ulp;
  END IF;

  -- Dua regu mengirim gardu yang sama di tanggal yang sama tidak boleh lolos berdua.
  PERFORM pg_advisory_xact_lock(hashtext('kirim-ukur|' || v_kode || '|' || v_ulp || '|' || v_tgl));

  SELECT petugas_nama INTO dobel
  FROM public.pengukuran_gardu
  WHERE upper(no_gardu) = v_kode AND upper(petugas_unit) = v_ulp
    AND tanggal_pengukuran = to_char(v_tgl, 'YYYY-MM-DD')
    AND hasil_penyeimbangan_id IS NULL
    AND dikembalikan_at IS NULL
    AND id <> v_id
  LIMIT 1;
  IF FOUND THEN
    RAISE EXCEPTION 'Gardu % sudah diukur % pada % — tidak dikirim dua kali. Buang draf ini atau ubah tanggalnya bila memang pengukuran lain.',
      v_kode, COALESCE(dobel.petugas_nama, 'regu lain'), to_char(v_tgl, 'DD-MM-YYYY');
  END IF;

  SELECT * INTO m FROM public.pengukuran_gardu WHERE id = v_id FOR UPDATE;
  IF FOUND THEN
    -- Baris yang sudah ada hanya boleh diperbarui kalau DIKEMBALIKAN admin,
    -- dan oleh tim pemiliknya (atau admin/UP3).
    IF m.dikembalikan_at IS NULL THEN
      RAISE EXCEPTION 'Pengukuran % sudah dikirim — koreksinya lewat admin "Kembalikan ke petugas".', m.no_gardu;
    END IF;
    IF upper(m.no_gardu) <> v_kode OR upper(m.petugas_unit) <> v_ulp THEN
      RAISE EXCEPTION 'Id pengukuran ini milik gardu %, bukan %.', m.no_gardu, v_kode;
    END IF;
    IF v_role NOT IN ('UP3', 'admin') AND COALESCE(m.petugas_nama, '') <> COALESCE(v_nama, '') THEN
      RAISE EXCEPTION 'Pengukuran ini milik %, hanya tim itu yang bisa mengirim ulang.', COALESCE(m.petugas_nama, 'tim lain');
    END IF;
  END IF;

  -- Baris baru ATAU baris yang dikembalikan: satu pernyataan, seluruh kolom.
  -- Penanda dikembalikan dikosongkan — kiriman ulang = pengukuran sah lagi.
  INSERT INTO public.pengukuran_gardu (
    id, no_gardu, petugas_unit, alamat, penyulang, kva_trafo,
    tanggal_pengukuran, jam_pengukuran,
    total_arus_r, total_arus_s, total_arus_t, total_arus_n,
    total_teg_rn, total_teg_sn, total_teg_tn, total_teg_rs, total_teg_rt, total_teg_st,
    perjurusan, beban_kva, persen_beban, suhu_trafo,
    petugas_nama, petugas_uid, lokasi_lat, lokasi_lng, lokasi_akurasi,
    dikembalikan_at, dikembalikan_alasan, dikembalikan_oleh
  ) VALUES (
    v_id, g.kode, g.ulp, NULLIF(p_isi->>'alamat', ''), NULLIF(p_isi->>'penyulang', ''), v_kva,
    to_char(v_tgl, 'YYYY-MM-DD'), NULLIF(p_isi->>'jam_pengukuran', '')::time,
    NULLIF(p_isi->>'total_arus_r', '')::numeric, NULLIF(p_isi->>'total_arus_s', '')::numeric,
    NULLIF(p_isi->>'total_arus_t', '')::numeric, NULLIF(p_isi->>'total_arus_n', '')::numeric,
    NULLIF(p_isi->>'total_teg_rn', '')::numeric, NULLIF(p_isi->>'total_teg_sn', '')::numeric,
    NULLIF(p_isi->>'total_teg_tn', '')::numeric, NULLIF(p_isi->>'total_teg_rs', '')::numeric,
    NULLIF(p_isi->>'total_teg_rt', '')::numeric, NULLIF(p_isi->>'total_teg_st', '')::numeric,
    COALESCE(p_isi->'perjurusan', '{}'::jsonb),
    NULLIF(p_isi->>'beban_kva', '')::numeric, NULLIF(p_isi->>'persen_beban', '')::numeric,
    NULLIF(p_isi->>'suhu_trafo', '')::numeric,
    v_nama, auth.uid(),
    NULLIF(p_isi->>'lokasi_lat', '')::double precision, NULLIF(p_isi->>'lokasi_lng', '')::double precision,
    NULLIF(p_isi->>'lokasi_akurasi', '')::numeric,
    NULL, NULL, NULL
  )
  ON CONFLICT (id) DO UPDATE SET
    alamat = EXCLUDED.alamat, penyulang = EXCLUDED.penyulang, kva_trafo = EXCLUDED.kva_trafo,
    tanggal_pengukuran = EXCLUDED.tanggal_pengukuran, jam_pengukuran = EXCLUDED.jam_pengukuran,
    total_arus_r = EXCLUDED.total_arus_r, total_arus_s = EXCLUDED.total_arus_s,
    total_arus_t = EXCLUDED.total_arus_t, total_arus_n = EXCLUDED.total_arus_n,
    total_teg_rn = EXCLUDED.total_teg_rn, total_teg_sn = EXCLUDED.total_teg_sn,
    total_teg_tn = EXCLUDED.total_teg_tn, total_teg_rs = EXCLUDED.total_teg_rs,
    total_teg_rt = EXCLUDED.total_teg_rt, total_teg_st = EXCLUDED.total_teg_st,
    perjurusan = EXCLUDED.perjurusan, beban_kva = EXCLUDED.beban_kva,
    persen_beban = EXCLUDED.persen_beban, suhu_trafo = EXCLUDED.suhu_trafo,
    petugas_nama = COALESCE(EXCLUDED.petugas_nama, public.pengukuran_gardu.petugas_nama),
    petugas_uid = EXCLUDED.petugas_uid,
    lokasi_lat = EXCLUDED.lokasi_lat, lokasi_lng = EXCLUDED.lokasi_lng,
    lokasi_akurasi = EXCLUDED.lokasi_akurasi,
    dikembalikan_at = NULL, dikembalikan_alasan = NULL, dikembalikan_oleh = NULL,
    updated_at = now();

  -- Sumber usulan bertipe UUID; id pengukuran era Firebase bukan UUID →
  -- usulannya tetap dibuat, hanya tanpa penunjuk sumber.
  v_sumber := CASE WHEN v_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
                   THEN v_id::uuid END;

  -- Usulan titik gardu (petugas menyatakan titik master salah / kosong).
  IF jsonb_typeof(kor) = 'object' AND NULLIF(kor->>'lat', '') IS NOT NULL THEN
    PERFORM public.koreksi_titik_gardu(
      g.kode, g.ulp,
      (kor->>'lat')::double precision, (kor->>'lng')::double precision,
      NULLIF(kor->>'akurasi', '')::numeric,
      v_nama,
      NULLIF(btrim(kor->>'catatan'), ''),
      'pengukuran',
      v_sumber,
      COALESCE(ARRAY(SELECT jsonb_array_elements_text(kor->'foto')), '{}')
    );
  END IF;

  -- Usulan kVA: fungsinya sendiri yang memutuskan berbeda atau tidak, dan
  -- tidak menggandakan usulan yang sama yang masih menunggu.
  PERFORM public.usul_kva_gardu(g.kode, g.ulp, v_kva, v_nama, NULL, v_sumber, '{}');

  RETURN v_id;
END $$;

COMMENT ON FUNCTION public.kirim_pengukuran_gardu IS
  'Satu kiriman Pengukuran Gardu dari HP dalam satu transaksi (pengukuran + usulan titik + usulan kVA). Dipakai HP sejak rencana-mobile-pengukuran P1.';

GRANT EXECUTE ON FUNCTION public.kirim_pengukuran_gardu(JSONB) TO authenticated;


-- ── 4a. Keadaan terkini gardu tidak memakai yang dikembalikan ────────────────
-- Satu saringan saja; kolom dan urutannya tidak berubah (CREATE OR REPLACE
-- VIEW menolak kolom yang bergeser). Angka yang sedang diragukan admin tidak
-- boleh memicu overload/anomali atau jadi dasar kandidat WO.

CREATE OR REPLACE VIEW public.gardu_latest_state AS
WITH all_events AS (
  SELECT
    pg.id::text       AS source_id,
    'pengukuran'      AS event_type,
    pg.no_gardu,
    pg.penyulang,
    pg.alamat,
    pg.kva_trafo,
    pg.petugas_unit,
    pg.petugas_nama,
    pg.tanggal_pengukuran::date AS event_date,
    pg.persen_beban,
    pg.beban_kva,
    pg.suhu_trafo,
    pg.total_arus_r,
    pg.total_arus_s,
    pg.total_arus_t,
    pg.total_arus_n,
    pg.total_teg_rn,
    pg.total_teg_sn,
    pg.total_teg_tn,
    pg.total_teg_rs,
    pg.total_teg_st,
    pg.total_teg_rt,
    pg.perjurusan,
    pg.jenis_pemeliharaan,
    pg.wo_sent_at
  FROM public.pengukuran_gardu pg
  WHERE pg.hasil_penyeimbangan_id IS NULL
    AND pg.dikembalikan_at IS NULL

  UNION ALL

  SELECT
    ps.id::text       AS source_id,
    'penyeimbangan'   AS event_type,
    ps.no_gardu,
    ps.penyulang,
    ps.alamat,
    ps.kva_trafo,
    ps.ulp            AS petugas_unit,
    ps.petugas_penyeimbang AS petugas_nama,
    ps.tgl_penyeimbangan::date AS event_date,
    ps.beban_pct_after  AS persen_beban,
    ps.beban_kva_after  AS beban_kva,
    pg.suhu_trafo,
    ps.arus_r_after   AS total_arus_r,
    ps.arus_s_after   AS total_arus_s,
    ps.arus_t_after   AS total_arus_t,
    ps.arus_n_after   AS total_arus_n,
    pg.total_teg_rn,
    pg.total_teg_sn,
    pg.total_teg_tn,
    pg.total_teg_rs,
    pg.total_teg_st,
    pg.total_teg_rt,
    ps.perjurusan_after AS perjurusan,
    ps.jenis_pemeliharaan,
    NULL::timestamptz AS wo_sent_at
  FROM public.penyeimbangan_gardu ps
  JOIN public.pengukuran_gardu pg ON pg.id = ps.pengukuran_id
)
SELECT DISTINCT ON (no_gardu) *
FROM all_events
ORDER BY no_gardu, event_date DESC, source_id DESC;

GRANT SELECT ON public.gardu_latest_state TO authenticated;


-- ── 4b. Realisasi WO tidak menghitung yang dikembalikan ──────────────────────
-- Berangkat dari definisi HIDUP di `pengukuran-kunci-titik.sql` (kolom &
-- urutan persis sama); yang ditambah hanya saringan dikembalikan_at. Gardu
-- yang pengukurannya dikembalikan kembali berstatus "belum" sampai dikirim ulang.

CREATE OR REPLACE VIEW public.wo_pengukuran_realisasi AS
SELECT
  i.id,
  i.wo_id,
  i.kode_gardu,
  i.ulp,
  i.nama,
  i.alamat,
  i.penyulang,
  i.kva_master,
  i.lat,
  i.lng,
  i.alasan,
  i.tgl_ukur_terakhir,
  i.umur_bulan,
  i.urutan,

  w.bulan,
  w.tahun,
  w.tgl_wo,

  p.id                  AS pengukuran_id,
  p.tanggal_pengukuran  AS tgl_realisasi,
  p.petugas_nama,
  p.persen_beban,
  p.beban_kva,
  p.kva_trafo           AS kva_pengukuran,

  (p.id IS NOT NULL AND t.pengukuran_id IS NULL) AS terealisasi,

  (t.pengukuran_id IS NOT NULL)          AS tertahan,
  COALESCE(t.titik_diperbarui, false)    AS tertahan_titik,
  COALESCE(t.beda_kva, false)            AS tertahan_kva
FROM public.wo_pengukuran_item i
JOIN public.wo_pengukuran w ON w.id = i.wo_id
LEFT JOIN LATERAL (
  SELECT pg.id, pg.tanggal_pengukuran, pg.petugas_nama,
         pg.persen_beban, pg.beban_kva, pg.kva_trafo
  FROM public.pengukuran_gardu pg
  WHERE upper(pg.no_gardu)     = upper(i.kode_gardu)
    AND upper(pg.petugas_unit) = upper(i.ulp)
    AND pg.tanggal_pengukuran >= to_char(w.tgl_wo, 'YYYY-MM-DD')
    AND pg.tanggal_pengukuran <  to_char(w.tgl_wo + INTERVAL '1 month', 'YYYY-MM-DD')
    AND pg.hasil_penyeimbangan_id IS NULL
    AND pg.dikembalikan_at IS NULL
  ORDER BY pg.tanggal_pengukuran
  LIMIT 1
) p ON TRUE
LEFT JOIN public.pengukuran_tertahan t ON t.pengukuran_id = p.id;

COMMENT ON VIEW public.wo_pengukuran_realisasi IS
  'Baris WO Pengukuran + realisasinya. terealisasi = sudah diukur DAN tidak tertahan usulan master. Pengukuran yang DIKEMBALIKAN ke petugas tidak dihitung sampai dikirim ulang.';


-- ── Periksa (selama belum ada yang dikembalikan, angkanya harus sama) ────────
--   SELECT count(*) FROM gardu_latest_state;                              -- 1590 (25 Sep)
--   SELECT count(*) FROM wo_pengukuran_realisasi WHERE terealisasi;       -- 176  (25 Sep)
