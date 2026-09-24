-- =============================================================================
-- R1 `rencana-mobile-perabasan.md` (25 Sep 2026)
-- Jalankan manual di Supabase SQL Editor, SESUDAH `wo-perabasan.sql` dan
-- `optimasi-kembalikan.sql`. Idempoten.
--
--   1. simpan_pohon_perabasan  — kiriman pohon dari HP (boleh berkali-kali)
--   2. hapus_pohon_perabasan   — buang pohon salah catat selama segmen terbuka
--   3. perabasan_luar_wo       — rabas di luar WO (tanpa segmen, tanpa km)
--      + kirim / putuskan / batalkan
--   4. rekap_kinerja           — baris Perabasan menyebut pohon di luar WO
-- =============================================================================


-- ── 1. Kirim pohon dari HP ───────────────────────────────────────────────────
-- Dulu tiap pohon disisipkan langsung dari HP saat dicatat (butuh sinyal di
-- bawah pohon). Sekarang pohon dicatat di HP lalu dikirim — sementara atau
-- saat selesai disisir (keputusan user). Satu panggilan = satu transaksi;
-- id pohon dari HP, jadi kiriman ulang sesudah putus MEMPERBARUI, bukan
-- menggandakan.
--
-- p_pohon: [{id, tiang_id, jenis_pohon, lat, lng, foto_sebelum_url,
--            foto_sesudah_url, dikerjakan_at, catatan}]

CREATE OR REPLACE FUNCTION public.simpan_pohon_perabasan(
  p_item_id UUID,
  p_pohon   JSONB,
  p_petugas TEXT DEFAULT NULL
) RETURNS INT
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  it     RECORD;
  v_role TEXT;
  v_unit TEXT;
  r      JSONB;
  n      INT := 0;
BEGIN
  SELECT * INTO it FROM public.wo_perabasan_item WHERE id = p_item_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Segmen WO tidak ditemukan.'; END IF;

  SELECT role, unit INTO v_role, v_unit FROM public.user_roles WHERE user_id = auth.uid();
  IF v_role IS NULL THEN
    RAISE EXCEPTION 'Sesi tidak dikenali server. Keluar lalu masuk lagi, kemudian kirim ulang — isian tetap tersimpan di HP.';
  END IF;
  IF v_role <> 'UP3' AND upper(COALESCE(v_unit, '')) <> upper(it.ulp) THEN
    RAISE EXCEPTION 'Akun ini untuk ULP %, segmen ini milik ULP %.', COALESCE(v_unit, '-'), it.ulp;
  END IF;

  IF it.status NOT IN ('Dijadwalkan', 'Dalam Proses', 'Ditolak') THEN
    RAISE EXCEPTION 'Segmen % sudah dilaporkan selesai (%). Pohon tambahan tidak bisa dikirim lagi — minta admin mengembalikannya bila perlu.',
      it.segmen_nama, it.status;
  END IF;

  FOR r IN SELECT * FROM jsonb_array_elements(COALESCE(p_pohon, '[]'::jsonb)) LOOP
    IF NULLIF(r->>'id', '') IS NULL THEN
      RAISE EXCEPTION 'Pohon tanpa id — perbarui aplikasi lalu kirim ulang.';
    END IF;
    IF COALESCE(r->>'foto_sebelum_url', '') NOT LIKE 'http%' OR COALESCE(r->>'foto_sesudah_url', '') NOT LIKE 'http%' THEN
      RAISE EXCEPTION 'Foto pohon belum terunggah. Kirim ulang saat sinyal lebih baik.';
    END IF;

    INSERT INTO public.perabasan_realisasi AS pr (
      id, item_id, tiang_id, jenis_pohon, lat, lng,
      foto_sebelum_url, foto_sesudah_url, petugas_nama, petugas_uid, dikerjakan_at, catatan
    ) VALUES (
      (r->>'id')::uuid, p_item_id, NULLIF(r->>'tiang_id', '')::uuid,
      NULLIF(btrim(r->>'jenis_pohon'), ''),
      NULLIF(r->>'lat', '')::numeric, NULLIF(r->>'lng', '')::numeric,
      r->>'foto_sebelum_url', r->>'foto_sesudah_url',
      p_petugas, auth.uid(),
      LEAST(COALESCE(NULLIF(r->>'dikerjakan_at', '')::timestamptz, now()), now()),
      NULLIF(btrim(r->>'catatan'), '')
    )
    ON CONFLICT (id) DO UPDATE SET
      tiang_id = EXCLUDED.tiang_id,
      jenis_pohon = EXCLUDED.jenis_pohon,
      lat = EXCLUDED.lat,
      lng = EXCLUDED.lng,
      foto_sebelum_url = EXCLUDED.foto_sebelum_url,
      foto_sesudah_url = EXCLUDED.foto_sesudah_url,
      catatan = EXCLUDED.catatan
    -- Id milik segmen LAIN tidak boleh ditimpa lewat segmen ini.
    WHERE pr.item_id = p_item_id;
    n := n + 1;
  END LOOP;

  -- Pohon pertama terkirim = segmen sedang dikerjakan (kalau "Mulai" belum
  -- sempat terkirim karena tanpa sinyal).
  UPDATE public.wo_perabasan_item
  SET status = CASE WHEN status = 'Dijadwalkan' THEN 'Dalam Proses' ELSE status END,
      tgl_mulai = COALESCE(tgl_mulai, CURRENT_DATE),
      petugas_nama = COALESCE(p_petugas, petugas_nama),
      petugas_uid = COALESCE(auth.uid(), petugas_uid),
      updated_at = now()
  WHERE id = p_item_id;

  RETURN n;
END $fn$;

GRANT EXECUTE ON FUNCTION public.simpan_pohon_perabasan(UUID, JSONB, TEXT) TO authenticated;


-- ── 2. Buang pohon salah catat ───────────────────────────────────────────────
-- Hanya selama segmennya masih terbuka (termasuk yang dikembalikan admin).
-- Yang sudah dilaporkan selesai = sudah di meja admin; koreksinya lewat
-- "Kembalikan ke regu" (teknisaplikasi.md butir 2).

CREATE OR REPLACE FUNCTION public.hapus_pohon_perabasan(p_pohon_id UUID)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  it     RECORD;
  v_role TEXT;
  v_unit TEXT;
BEGIN
  SELECT i.* INTO it
  FROM public.perabasan_realisasi p
  JOIN public.wo_perabasan_item i ON i.id = p.item_id
  WHERE p.id = p_pohon_id;
  IF NOT FOUND THEN RETURN; END IF; -- sudah tidak ada = tujuan tercapai

  SELECT role, unit INTO v_role, v_unit FROM public.user_roles WHERE user_id = auth.uid();
  IF v_role IS NULL OR (v_role <> 'UP3' AND upper(COALESCE(v_unit, '')) <> upper(it.ulp)) THEN
    RAISE EXCEPTION 'Tidak berhak menghapus pohon di segmen ULP %.', it.ulp;
  END IF;
  IF it.status NOT IN ('Dijadwalkan', 'Dalam Proses', 'Ditolak') THEN
    RAISE EXCEPTION 'Segmen % sudah dilaporkan selesai — pohonnya tidak bisa dihapus dari HP.', it.segmen_nama;
  END IF;

  DELETE FROM public.perabasan_realisasi WHERE id = p_pohon_id;
END $fn$;

GRANT EXECUTE ON FUNCTION public.hapus_pohon_perabasan(UUID) TO authenticated;


-- ── 3. Rabas di luar WO ──────────────────────────────────────────────────────
-- Keputusan user 25 Sep 2026: realisasi harian TANPA segmen — km-nya tidak
-- dihitung, "jatuhnya seperti pemeliharaan jaringan". Termasuk bantuan lintas
-- ULP yang darurat (regu Ampenan membantu Cakra): ULP LOKASI dan ULP REGU
-- dicatat terpisah.
--   • dihitung di rekap untuk ULP REGU (yang bekerja)
--   • diverifikasi admin ULP LOKASI (yang mengenal jaringannya) atau UP3

CREATE TABLE IF NOT EXISTS public.perabasan_luar_wo (
  id               UUID PRIMARY KEY,             -- dari HP (butir 17)
  ulp              TEXT NOT NULL,                -- ULP LOKASI pekerjaan
  penyulang        TEXT NOT NULL,
  regu             TEXT,                         -- tim login
  ulp_regu         TEXT NOT NULL,                -- ULP regu yang mengerjakan
  jenis_pohon      TEXT,
  lokasi           TEXT,
  lat              NUMERIC(10,7),
  lng              NUMERIC(10,7),
  akurasi          NUMERIC,
  foto_sebelum_url TEXT NOT NULL,
  foto_sesudah_url TEXT NOT NULL,
  tgl              DATE NOT NULL,
  catatan          TEXT,
  status           TEXT NOT NULL DEFAULT 'Selesai',
  petugas_uid      UUID,
  verified_at      TIMESTAMPTZ,
  verified_by      TEXT,
  verified_note    TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.perabasan_luar_wo DROP CONSTRAINT IF EXISTS perabasan_luar_wo_status_valid;
ALTER TABLE public.perabasan_luar_wo ADD CONSTRAINT perabasan_luar_wo_status_valid
  CHECK (status IN ('Selesai', 'Diverifikasi', 'Ditolak', 'Dibatalkan'));

CREATE INDEX IF NOT EXISTS perabasan_luar_wo_ulp_idx      ON public.perabasan_luar_wo (ulp, tgl DESC);
CREATE INDEX IF NOT EXISTS perabasan_luar_wo_ulp_regu_idx ON public.perabasan_luar_wo (ulp_regu, tgl DESC);

COMMENT ON TABLE public.perabasan_luar_wo IS
  'Pohon dirabas DI LUAR WO (tanpa segmen, tanpa km). ulp = lokasi pekerjaan, ulp_regu = regu yang mengerjakan (bisa beda saat bantuan darurat lintas ULP).';

ALTER TABLE public.perabasan_luar_wo ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS perabasan_luar_wo_baca ON public.perabasan_luar_wo;
CREATE POLICY perabasan_luar_wo_baca ON public.perabasan_luar_wo FOR SELECT TO authenticated USING (true);
GRANT SELECT ON public.perabasan_luar_wo TO authenticated;
-- Penulisan HANYA lewat fungsi di bawah.


-- p_isi: {id, ulp, penyulang, jenis_pohon, lokasi, lat, lng, akurasi,
--         foto_sebelum_url, foto_sesudah_url, tgl, catatan, regu}
CREATE OR REPLACE FUNCTION public.kirim_perabasan_luar_wo(p_isi JSONB)
RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  v_id   UUID := NULLIF(p_isi->>'id', '')::uuid;
  v_tgl  DATE := COALESCE(NULLIF(p_isi->>'tgl', '')::date, (now() AT TIME ZONE 'Asia/Makassar')::date);
  v_role TEXT;
  v_unit TEXT;
  ada    RECORD;
BEGIN
  IF v_id IS NULL THEN RAISE EXCEPTION 'Catatan tanpa id — perbarui aplikasi lalu kirim ulang.'; END IF;

  SELECT role, unit INTO v_role, v_unit FROM public.user_roles WHERE user_id = auth.uid();
  IF v_role IS NULL THEN
    RAISE EXCEPTION 'Sesi tidak dikenali server. Keluar lalu masuk lagi, kemudian kirim ulang — isian tetap tersimpan di HP.';
  END IF;
  IF v_role <> 'UP3' AND btrim(COALESCE(v_unit, '')) = '' THEN
    RAISE EXCEPTION 'Akun ini belum punya ULP. Minta admin mengisinya di Manajemen Pengguna.';
  END IF;

  IF btrim(COALESCE(p_isi->>'ulp', '')) = '' OR btrim(COALESCE(p_isi->>'penyulang', '')) = '' THEN
    RAISE EXCEPTION 'ULP lokasi dan penyulang wajib diisi.';
  END IF;
  IF COALESCE(p_isi->>'foto_sebelum_url', '') NOT LIKE 'http%' OR COALESCE(p_isi->>'foto_sesudah_url', '') NOT LIKE 'http%' THEN
    RAISE EXCEPTION 'Dua foto (sebelum & sesudah) wajib dan harus sudah terunggah.';
  END IF;
  IF v_tgl > (now() AT TIME ZONE 'Asia/Makassar')::date THEN
    RAISE EXCEPTION 'Tanggal pekerjaan tidak boleh di masa depan.';
  END IF;

  SELECT * INTO ada FROM public.perabasan_luar_wo WHERE id = v_id FOR UPDATE;
  IF FOUND AND ada.status <> 'Ditolak' THEN
    -- Kiriman ulang setelah jawaban server hilang di jalan: sudah ada = selesai.
    RETURN v_id;
  END IF;

  INSERT INTO public.perabasan_luar_wo (
    id, ulp, penyulang, regu, ulp_regu, jenis_pohon, lokasi, lat, lng, akurasi,
    foto_sebelum_url, foto_sesudah_url, tgl, catatan, status, petugas_uid
  ) VALUES (
    v_id, upper(btrim(p_isi->>'ulp')), btrim(p_isi->>'penyulang'),
    NULLIF(btrim(p_isi->>'regu'), ''),
    CASE WHEN v_role = 'UP3' THEN upper(btrim(COALESCE(NULLIF(p_isi->>'ulp_regu', ''), p_isi->>'ulp'))) ELSE upper(v_unit) END,
    NULLIF(btrim(p_isi->>'jenis_pohon'), ''), NULLIF(btrim(p_isi->>'lokasi'), ''),
    NULLIF(p_isi->>'lat', '')::numeric, NULLIF(p_isi->>'lng', '')::numeric, NULLIF(p_isi->>'akurasi', '')::numeric,
    p_isi->>'foto_sebelum_url', p_isi->>'foto_sesudah_url', v_tgl,
    NULLIF(btrim(p_isi->>'catatan'), ''), 'Selesai', auth.uid()
  )
  ON CONFLICT (id) DO UPDATE SET
    ulp = EXCLUDED.ulp, penyulang = EXCLUDED.penyulang, jenis_pohon = EXCLUDED.jenis_pohon,
    lokasi = EXCLUDED.lokasi, lat = EXCLUDED.lat, lng = EXCLUDED.lng, akurasi = EXCLUDED.akurasi,
    foto_sebelum_url = EXCLUDED.foto_sebelum_url, foto_sesudah_url = EXCLUDED.foto_sesudah_url,
    tgl = EXCLUDED.tgl, catatan = EXCLUDED.catatan,
    status = 'Selesai', verified_at = NULL, verified_by = NULL, verified_note = NULL,
    updated_at = now();

  RETURN v_id;
END $fn$;

GRANT EXECUTE ON FUNCTION public.kirim_perabasan_luar_wo(JSONB) TO authenticated;


-- Terima / kembalikan — admin ULP LOKASI atau UP3. Kembali = Ditolak (+ alasan
-- wajib), muncul lagi di HP regu sebagai draf.
CREATE OR REPLACE FUNCTION public.putuskan_perabasan_luar_wo(
  p_id      UUID,
  p_terima  BOOLEAN,
  p_catatan TEXT DEFAULT NULL,
  p_oleh    TEXT DEFAULT NULL
) RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  r RECORD;
BEGIN
  SELECT * INTO r FROM public.perabasan_luar_wo WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Catatan tidak ditemukan.'; END IF;
  PERFORM public.wajib_boleh_ulp(r.ulp);
  IF r.status <> 'Selesai' THEN
    RAISE EXCEPTION 'Hanya catatan yang menunggu diperiksa yang bisa diputuskan (status sekarang: %).', r.status;
  END IF;
  IF NOT p_terima AND btrim(COALESCE(p_catatan, '')) = '' THEN
    RAISE EXCEPTION 'Alasan pengembalian wajib diisi.';
  END IF;

  UPDATE public.perabasan_luar_wo
  SET status = CASE WHEN p_terima THEN 'Diverifikasi' ELSE 'Ditolak' END,
      verified_at = now(), verified_by = p_oleh,
      verified_note = NULLIF(btrim(COALESCE(p_catatan, '')), ''),
      updated_at = now()
  WHERE id = p_id;
END $fn$;

CREATE OR REPLACE FUNCTION public.batalkan_perabasan_luar_wo(
  p_id     UUID,
  p_alasan TEXT,
  p_oleh   TEXT DEFAULT NULL
) RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  r RECORD;
BEGIN
  IF btrim(COALESCE(p_alasan, '')) = '' THEN RAISE EXCEPTION 'Alasan pembatalan wajib diisi.'; END IF;
  SELECT * INTO r FROM public.perabasan_luar_wo WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Catatan tidak ditemukan.'; END IF;
  PERFORM public.wajib_boleh_ulp(r.ulp);
  IF r.status = 'Diverifikasi' THEN
    RAISE EXCEPTION 'Catatan yang sudah diterima tidak bisa dibatalkan.';
  END IF;

  UPDATE public.perabasan_luar_wo
  SET status = 'Dibatalkan', verified_at = now(), verified_by = p_oleh,
      verified_note = btrim(p_alasan), updated_at = now()
  WHERE id = p_id;
END $fn$;

GRANT EXECUTE ON FUNCTION public.putuskan_perabasan_luar_wo(UUID, BOOLEAN, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.batalkan_perabasan_luar_wo(UUID, TEXT, TEXT) TO authenticated;


-- ── 4. rekap_kinerja (disalin dari versi terpasang; hanya baris Perabasan) ──
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
  -- `luar_wo` = pohon dirabas DI LUAR WO (tanpa segmen, tanpa km), dihitung
  -- untuk ULP REGU yang mengerjakan (keputusan user 25 Sep 2026).
  RETURN QUERY
  SELECT 'perabasan'::text, round(COALESCE(sum(c.target_km), 0), 3), round(COALESCE(sum(c.capaian_km), 0), 3), 0::numeric,
    (SELECT count(*)::int FROM public.perabasan_luar_wo l
      WHERE l.status IN ('Selesai', 'Diverifikasi')
        AND l.tgl >= d_awal AND l.tgl < d_akhr
        AND (u IS NULL OR upper(l.ulp_regu) = u))
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
--   SELECT * FROM rekap_kinerja(NULL, 2026, 9) WHERE kunci = 'perabasan';
--   SELECT status, count(*) FROM perabasan_luar_wo GROUP BY 1;
