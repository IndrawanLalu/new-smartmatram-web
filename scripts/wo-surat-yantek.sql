-- =============================================================================
-- Cetak / Kirim WO bulanan Yantek (keputusan user 29 Sep 2026)
-- Jalankan manual di Supabase SQL Editor, SESUDAH `wo-inspeksi-jtr.sql` dan
-- `sla-kinerja.sql`. Idempoten.
--
-- Surat pengantar WO ke mitra + lampiran rencana kerja per jenis pekerjaan,
-- dicetak dari Rekap Kinerja. Angka di surat = kolom WO TERBIT Rekap Kinerja,
-- supaya surat dan rekap tidak pernah bercerita berbeda.
--
-- ── WO MANUAL ───────────────────────────────────────────────────────────────
-- Jenis yang belum punya WO di sistem (Pemeliharaan Jaringan, Penyeimbangan,
-- Inspeksi JTM Tier 1 & 2, Inspeksi Gardu Tier 1 & 2) diisi dengan MENEMPEL
-- tabel dari Excel rencana kerja. Tempelan itu:
--   • mengisi lampiran surat (daftar objek + kisi hariannya), dan
--   • menjadi WO TERBIT jenis itu di Rekap Kinerja.
-- Realisasi: Pemeliharaan Jaringan & Penyeimbangan tetap dari data HP; JTM
-- Tier 1 dari inspeksi JTM tier 1; JTM Tier 2 & Inspeksi Gardu DICENTANG di
-- web per objek (modulnya belum ada).
--
--   1. boleh_ubah_ulp — versi boolean dari wajib_boleh_ulp (untuk policy)
--   2. hari_libur
--   3. wo_surat_pengaturan + bucket privat `ttd` (tanda tangan)
--   4. wo_manual + wo_manual_item + simpan/centang
--   5. wo_surat — log surat yang diterbitkan
--   6. wo_surat_objek — isi lampiran
--   7. _rekap_kinerja_inti — baris jtm2, igardu1, igardu2; WO manual
--   8. sla_kinerja — kunci baru
-- =============================================================================


-- ── 1. Penjaga boolean ───────────────────────────────────────────────────────
-- Isi SAMA dengan wajib_boleh_ulp (wo-perabasan.sql), tapi mengembalikan
-- true/false — policy storage tidak bisa memakai fungsi yang melempar galat.
CREATE OR REPLACE FUNCTION public.boleh_ubah_ulp(p_ulp TEXT)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $fn$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = auth.uid()
      AND (role = 'UP3'
           OR (role = 'admin' AND upper(COALESCE(unit, '')) = upper(COALESCE(p_ulp, ''))))
  );
$fn$;
GRANT EXECUTE ON FUNCTION public.boleh_ubah_ulp(TEXT) TO authenticated;


-- ── 2. Hari libur ────────────────────────────────────────────────────────────
-- Untuk hari efektif lampiran (kisi merah) dan pembagian harian. Sabtu dan
-- Minggu TIDAK disimpan di sini — keduanya dihitung sendiri.
CREATE TABLE IF NOT EXISTS public.hari_libur (
  tanggal    DATE PRIMARY KEY,
  keterangan TEXT NOT NULL,
  oleh       TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.hari_libur ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS hari_libur_baca ON public.hari_libur;
CREATE POLICY hari_libur_baca ON public.hari_libur FOR SELECT TO authenticated USING (true);
-- Libur nasional berlaku untuk semua ULP: UP3 atau admin ULP mana pun.
DROP POLICY IF EXISTS hari_libur_tulis ON public.hari_libur;
CREATE POLICY hari_libur_tulis ON public.hari_libur FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role IN ('UP3', 'admin')))
  WITH CHECK (EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role IN ('UP3', 'admin')));
GRANT SELECT, INSERT, UPDATE, DELETE ON public.hari_libur TO authenticated;


-- ── 3. Pengaturan surat per ULP + tanda tangan ───────────────────────────────
CREATE TABLE IF NOT EXISTS public.wo_surat_pengaturan (
  ulp           TEXT PRIMARY KEY,
  kota          TEXT,                 -- "Tanjung" — di depan tanggal surat
  alamat        TEXT,
  telepon       TEXT,
  kotak_pos     TEXT,
  nama_manager  TEXT,
  nama_tl       TEXT,
  jabatan_tl    TEXT NOT NULL DEFAULT 'TL Teknik',
  mitra         TEXT,                 -- "PT. Bumi Sentosa"
  penerima      TEXT,                 -- "Direktur Bumi Sentosa"
  penerima_kota TEXT,                 -- "Mataram"
  cq            TEXT,                 -- "Supervisor Teknik"
  tembusan      TEXT,                 -- satu tembusan per baris
  ttd_manager   TEXT,                 -- path di bucket `ttd`
  ttd_tl        TEXT,
  oleh          TEXT,
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.wo_surat_pengaturan ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS wo_surat_pengaturan_baca ON public.wo_surat_pengaturan;
CREATE POLICY wo_surat_pengaturan_baca ON public.wo_surat_pengaturan FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS wo_surat_pengaturan_tulis ON public.wo_surat_pengaturan;
CREATE POLICY wo_surat_pengaturan_tulis ON public.wo_surat_pengaturan FOR ALL TO authenticated
  USING (public.boleh_ubah_ulp(ulp)) WITH CHECK (public.boleh_ubah_ulp(ulp));
GRANT SELECT, INSERT, UPDATE ON public.wo_surat_pengaturan TO authenticated;

-- Bucket PRIVAT: tanda tangan yang bisa diambil lewat tautan publik bisa
-- ditempel di surat mana pun. Path: {ULP}/manager.png, {ULP}/tl.png.
INSERT INTO storage.buckets (id, name, public)
VALUES ('ttd', 'ttd', false)
ON CONFLICT (id) DO UPDATE SET public = false;

DROP POLICY IF EXISTS ttd_baca ON storage.objects;
CREATE POLICY ttd_baca ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'ttd');
DROP POLICY IF EXISTS ttd_tambah ON storage.objects;
CREATE POLICY ttd_tambah ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'ttd' AND public.boleh_ubah_ulp((storage.foldername(name))[1]));
DROP POLICY IF EXISTS ttd_ubah ON storage.objects;
CREATE POLICY ttd_ubah ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'ttd' AND public.boleh_ubah_ulp((storage.foldername(name))[1]));
DROP POLICY IF EXISTS ttd_hapus ON storage.objects;
CREATE POLICY ttd_hapus ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'ttd' AND public.boleh_ubah_ulp((storage.foldername(name))[1]));


-- ── 4. WO manual (tempelan Excel) ────────────────────────────────────────────
-- `jenis` = kunci baris Rekap Kinerja. `jtm` = Inspeksi JTM Tier 1.
CREATE TABLE IF NOT EXISTS public.wo_manual (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ulp        TEXT NOT NULL,
  tahun      INT  NOT NULL CHECK (tahun BETWEEN 2020 AND 2100),
  bulan      INT  NOT NULL CHECK (bulan BETWEEN 1 AND 12),
  jenis      TEXT NOT NULL,
  oleh       TEXT,
  oleh_uid   UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (ulp, tahun, bulan, jenis)
);
ALTER TABLE public.wo_manual DROP CONSTRAINT IF EXISTS wo_manual_jenis_valid;
ALTER TABLE public.wo_manual ADD CONSTRAINT wo_manual_jenis_valid
  CHECK (jenis IN ('harjtm', 'penyeimbangan', 'jtm', 'jtm2', 'igardu1', 'igardu2'));

CREATE TABLE IF NOT EXISTS public.wo_manual_item (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  wo_id       UUID NOT NULL REFERENCES public.wo_manual(id) ON DELETE CASCADE,
  urutan      INT  NOT NULL DEFAULT 0,
  objek       TEXT NOT NULL,          -- no gardu / segmen / section
  alamat      TEXT,
  km          NUMERIC(10,3),
  keterangan  TEXT,
  pelaksana   TEXT,
  tgl_rencana DATE,
  -- Realisasi dicentang di web (JTM Tier 2, Inspeksi Gardu).
  selesai_tgl DATE,
  selesai_oleh TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS wo_manual_item_wo_idx ON public.wo_manual_item (wo_id, urutan);

ALTER TABLE public.wo_manual ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wo_manual_item ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS wo_manual_baca ON public.wo_manual;
CREATE POLICY wo_manual_baca ON public.wo_manual FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS wo_manual_item_baca ON public.wo_manual_item;
CREATE POLICY wo_manual_item_baca ON public.wo_manual_item FOR SELECT TO authenticated USING (true);
GRANT SELECT ON public.wo_manual, public.wo_manual_item TO authenticated;
-- Penulisan HANYA lewat simpan_wo_manual / centang_wo_manual.

-- p_item: [{objek, alamat, km, keterangan, pelaksana, tgl_rencana}, ...]
-- Menempel ulang MENGGANTI seluruh daftar jenis itu, tapi centang realisasi
-- objek yang sama (kode dibandingkan tanpa beda huruf/spasi) DIBAWA — menempel
-- ulang untuk membetulkan satu alamat tidak boleh menghapus realisasi.
-- Daftar kosong = hapus WO manual jenis itu.
CREATE OR REPLACE FUNCTION public.simpan_wo_manual(
  p_ulp TEXT, p_tahun INT, p_bulan INT, p_jenis TEXT, p_item JSONB, p_oleh TEXT DEFAULT NULL
) RETURNS INT
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  unit TEXT := upper(btrim(COALESCE(p_ulp, '')));
  wo   UUID;
  n    INT;
  lama JSONB;
BEGIN
  IF unit = '' THEN RAISE EXCEPTION 'ULP belum dipilih'; END IF;
  PERFORM public.wajib_boleh_ulp(unit);

  IF jsonb_array_length(COALESCE(p_item, '[]'::jsonb)) = 0 THEN
    DELETE FROM public.wo_manual WHERE ulp = unit AND tahun = p_tahun AND bulan = p_bulan AND jenis = p_jenis;
    RETURN 0;
  END IF;

  INSERT INTO public.wo_manual (ulp, tahun, bulan, jenis, oleh, oleh_uid)
  VALUES (unit, p_tahun, p_bulan, p_jenis, p_oleh, auth.uid())
  ON CONFLICT (ulp, tahun, bulan, jenis) DO UPDATE
    SET oleh = EXCLUDED.oleh, oleh_uid = EXCLUDED.oleh_uid, updated_at = now()
  RETURNING id INTO wo;

  SELECT jsonb_object_agg(upper(regexp_replace(objek, '\s', '', 'g')),
                          jsonb_build_object('tgl', selesai_tgl, 'oleh', selesai_oleh))
    INTO lama
    FROM public.wo_manual_item WHERE wo_id = wo AND selesai_tgl IS NOT NULL;
  lama := COALESCE(lama, '{}'::jsonb);

  DELETE FROM public.wo_manual_item WHERE wo_id = wo;

  INSERT INTO public.wo_manual_item (wo_id, urutan, objek, alamat, km, keterangan, pelaksana, tgl_rencana, selesai_tgl, selesai_oleh)
  SELECT wo, x.ord::int, btrim(x.v->>'objek'), NULLIF(btrim(x.v->>'alamat'), ''),
         NULLIF(x.v->>'km', '')::numeric, NULLIF(btrim(x.v->>'keterangan'), ''),
         NULLIF(btrim(x.v->>'pelaksana'), ''), NULLIF(x.v->>'tgl_rencana', '')::date,
         (lama -> upper(regexp_replace(x.v->>'objek', '\s', '', 'g')) ->> 'tgl')::date,
         lama -> upper(regexp_replace(x.v->>'objek', '\s', '', 'g')) ->> 'oleh'
  FROM jsonb_array_elements(p_item) WITH ORDINALITY AS x(v, ord)
  WHERE NULLIF(btrim(x.v->>'objek'), '') IS NOT NULL;

  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END $fn$;
GRANT EXECUTE ON FUNCTION public.simpan_wo_manual(TEXT, INT, INT, TEXT, JSONB, TEXT) TO authenticated;

-- p_tgl NULL = batalkan centang.
CREATE OR REPLACE FUNCTION public.centang_wo_manual(p_id UUID, p_tgl DATE, p_oleh TEXT DEFAULT NULL)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE unit TEXT;
BEGIN
  SELECT m.ulp INTO unit FROM public.wo_manual_item i JOIN public.wo_manual m ON m.id = i.wo_id WHERE i.id = p_id;
  IF unit IS NULL THEN RAISE EXCEPTION 'Objek WO tidak ditemukan'; END IF;
  PERFORM public.wajib_boleh_ulp(unit);
  UPDATE public.wo_manual_item
     SET selesai_tgl = p_tgl, selesai_oleh = CASE WHEN p_tgl IS NULL THEN NULL ELSE p_oleh END
   WHERE id = p_id;
END $fn$;
GRANT EXECUTE ON FUNCTION public.centang_wo_manual(UUID, DATE, TEXT) TO authenticated;


-- ── 5. Surat yang diterbitkan ────────────────────────────────────────────────
-- Satu surat per ULP per bulan WO; cetak ulang menimpa. `angka` = potret
-- sebelas baris saat dicetak, supaya yang terkirim bisa diterangkan lagi
-- walau WO-nya berubah sesudahnya.
CREATE TABLE IF NOT EXISTS public.wo_surat (
  ulp        TEXT NOT NULL,
  tahun      INT  NOT NULL,
  bulan      INT  NOT NULL CHECK (bulan BETWEEN 1 AND 12),
  nomor      TEXT NOT NULL,
  tgl_surat  DATE NOT NULL,
  angka      JSONB NOT NULL DEFAULT '{}'::jsonb,
  oleh       TEXT,
  oleh_uid   UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (ulp, tahun, bulan)
);
ALTER TABLE public.wo_surat ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS wo_surat_baca ON public.wo_surat;
CREATE POLICY wo_surat_baca ON public.wo_surat FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS wo_surat_tulis ON public.wo_surat;
CREATE POLICY wo_surat_tulis ON public.wo_surat FOR ALL TO authenticated
  USING (public.boleh_ubah_ulp(ulp)) WITH CHECK (public.boleh_ubah_ulp(ulp));
GRANT SELECT, INSERT, UPDATE ON public.wo_surat TO authenticated;


-- ── 6. Isi lampiran: objek per jenis ─────────────────────────────────────────
-- Satu ULP, satu bulan. Sumbernya sama dengan yang dihitung _rekap_kinerja_inti
-- sebagai WO terbit. JTM Tier 1: tempelan menang atas WO sistem.
CREATE OR REPLACE FUNCTION public.wo_surat_objek(p_ulp TEXT, p_tahun INT, p_bulan INT)
RETURNS TABLE (kunci TEXT, urutan INT, objek TEXT, alamat TEXT, km NUMERIC, keterangan TEXT, pelaksana TEXT, tgl_rencana DATE)
LANGUAGE plpgsql STABLE SET search_path = public AS $$
DECLARE
  u      TEXT := upper(btrim(COALESCE(p_ulp, '')));
  d_awal DATE := make_date(p_tahun, p_bulan, 1);
  d_akhr DATE := (make_date(p_tahun, p_bulan, 1) + INTERVAL '1 month')::date;
  t_awal TIMESTAMPTZ := make_date(p_tahun, p_bulan, 1)::timestamp AT TIME ZONE 'Asia/Makassar';
  t_akhr TIMESTAMPTZ := (make_date(p_tahun, p_bulan, 1) + INTERVAL '1 month')::timestamp AT TIME ZONE 'Asia/Makassar';
BEGIN
  RETURN QUERY
  SELECT 'perabasan'::text, row_number() OVER (ORDER BY w.tgl_wo, i.penyulang, i.urutan)::int,
         i.segmen_nama, i.penyulang, i.panjang_km, NULL::text, i.regu, NULL::date
  FROM public.wo_perabasan_item i JOIN public.wo_perabasan w ON w.id = i.wo_id
  WHERE w.status <> 'Dibatalkan' AND i.status <> 'Dibatalkan'
    AND w.tgl_wo >= d_awal AND w.tgl_wo < d_akhr AND upper(w.ulp) = u;

  RETURN QUERY
  SELECT 'hargardu'::text, row_number() OVER (ORDER BY r.penyulang, r.urutan)::int,
         r.gardu_kode, r.alamat, NULL::numeric, r.penyulang, NULL::text, NULL::date
  FROM public.wo_hargardu_realisasi r
  WHERE r.tahun = p_tahun AND r.bulan = p_bulan AND upper(r.ulp) = u;

  RETURN QUERY
  SELECT 'optimasi'::text, row_number() OVER (ORDER BY pg.wo_sent_at)::int,
         pg.no_gardu, pg.alamat, NULL::numeric, pg.penyulang, NULL::text, NULL::date
  FROM public.pengukuran_gardu pg
  WHERE pg.jenis_pemeliharaan = 'OPTIMASI TRAFO'
    AND pg.wo_sent_at >= t_awal AND pg.wo_sent_at < t_akhr
    AND upper(pg.petugas_unit) = u
    AND NOT EXISTS (SELECT 1 FROM public.optimasi_wo_batal b WHERE b.pengukuran_id::text = pg.id::text);

  RETURN QUERY
  SELECT 'pengukuran'::text, row_number() OVER (ORDER BY r.penyulang, r.urutan)::int,
         r.kode_gardu, r.alamat, NULL::numeric, r.penyulang, NULL::text, NULL::date
  FROM public.wo_pengukuran_realisasi r
  WHERE r.tahun = p_tahun AND r.bulan = p_bulan AND upper(r.ulp) = u;

  RETURN QUERY
  SELECT lower(w.jenis), row_number() OVER (PARTITION BY w.jenis ORDER BY i.penyulang, i.urutan)::int,
         COALESCE(i.gardu_kode, i.objek_nama), CASE WHEN i.gardu_kode IS NULL THEN i.penyulang ELSE i.objek_nama END,
         i.panjang_km, NULL::text, i.regu, NULL::date
  FROM public.wo_inspeksi_item i JOIN public.wo_inspeksi w ON w.id = i.wo_id
  WHERE i.status <> 'Dibatalkan'
    AND w.tgl_wo >= d_awal AND w.tgl_wo < d_akhr AND upper(i.ulp) = u
    AND (w.jenis = 'JTR' OR NOT EXISTS (
      SELECT 1 FROM public.wo_manual m
      WHERE m.ulp = u AND m.tahun = p_tahun AND m.bulan = p_bulan AND m.jenis = 'jtm'));

  RETURN QUERY
  SELECT m.jenis, i.urutan, i.objek, i.alamat, i.km, i.keterangan, i.pelaksana, i.tgl_rencana
  FROM public.wo_manual_item i JOIN public.wo_manual m ON m.id = i.wo_id
  WHERE m.ulp = u AND m.tahun = p_tahun AND m.bulan = p_bulan;
END $$;
GRANT EXECUTE ON FUNCTION public.wo_surat_objek(TEXT, INT, INT) TO authenticated;


-- ── 7. Rekap: WO manual ikut dihitung ────────────────────────────────────────
-- Total WO manual sebuah jenis dalam periode; NULL = tidak ada tempelan sama
-- sekali (bukan nol — "belum ber-WO" dan "WO nol" itu berbeda).
CREATE OR REPLACE FUNCTION public._wo_manual_total(u TEXT, p_tahun INT, p_bulan INT, p_jenis TEXT, p_km BOOLEAN, p_selesai BOOLEAN)
RETURNS NUMERIC
LANGUAGE sql STABLE SET search_path = public AS $fn$
  SELECT CASE WHEN count(DISTINCT m.id) = 0 THEN NULL ELSE
    round(COALESCE(sum(CASE WHEN p_km THEN COALESCE(i.km, 0) ELSE 1 END)
      FILTER (WHERE i.id IS NOT NULL AND (NOT p_selesai OR i.selesai_tgl IS NOT NULL)), 0), 3) END
  FROM public.wo_manual m
  LEFT JOIN public.wo_manual_item i ON i.wo_id = m.id
  WHERE m.jenis = p_jenis AND m.tahun = p_tahun AND (p_bulan = 0 OR m.bulan = p_bulan)
    AND (u IS NULL OR m.ulp = u);
$fn$;

-- Disalin dari `wo-inspeksi-jtr.sql`; yang berubah ditandai ★.
CREATE OR REPLACE FUNCTION public._rekap_kinerja_inti(p_ulp TEXT, p_tahun INT, p_bulan INT)
RETURNS TABLE (kunci TEXT, wo_terbit NUMERIC, realisasi NUMERIC, belum_disetujui NUMERIC, luar_wo NUMERIC)
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
  SELECT 'perabasan'::text, round(COALESCE(sum(c.target_km), 0), 3), round(COALESCE(sum(c.capaian_km), 0), 3), 0::numeric,
    (SELECT count(*)::numeric FROM public.perabasan_luar_wo l
      WHERE l.status IN ('Selesai', 'Diverifikasi')
        AND l.tgl >= d_awal AND l.tgl < d_akhr
        AND (u IS NULL OR upper(l.ulp_regu) = u))
  FROM public.wo_perabasan_capaian c
  WHERE c.tgl_wo::date >= d_awal AND c.tgl_wo::date < d_akhr
    AND (u IS NULL OR upper(c.ulp) = u);

  -- Pemeliharaan Jaringan. ★ WO terbit = tempelan WO manual (jumlah baris).
  RETURN QUERY
  SELECT 'harjtm'::text, public._wo_manual_total(u, p_tahun, p_bulan, 'harjtm', false, false),
    count(*)::numeric, count(*) FILTER (WHERE j.status = 'Selesai')::numeric,
    count(*) FILTER (WHERE j.inspeksi_id IS NOT NULL)::numeric
  FROM public.pemeliharaan_jaringan j
  WHERE j.status NOT IN ('Dibatalkan', 'Dikembalikan')
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
                    AND (u IS NULL OR upper(g.ulp) = u)) - jadi)::numeric;

  -- Penyeimbangan. ★ WO terbit = tempelan WO manual (jumlah gardu).
  RETURN QUERY
  SELECT 'penyeimbangan'::text, public._wo_manual_total(u, p_tahun, p_bulan, 'penyeimbangan', false, false),
    count(*)::numeric, NULL::numeric, NULL::numeric
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
    NULL::numeric
  FROM public.optimasi_trafo o
  WHERE o.status NOT IN ('Dibatalkan', 'Dikembalikan')
    AND o.tgl_operasi::date >= d_awal AND o.tgl_operasi::date < d_akhr
    AND (u IS NULL OR upper(o.ulp) = u);

  -- Pengukuran beban — WO Pengukuran.
  RETURN QUERY
  SELECT 'pengukuran'::text, count(*)::numeric,
    count(*) FILTER (WHERE r.terealisasi)::numeric,
    count(*) FILTER (WHERE r.tertahan)::numeric, NULL::numeric
  FROM public.wo_pengukuran_realisasi r
  WHERE r.tahun = p_tahun AND (p_bulan = 0 OR r.bulan = p_bulan)
    AND (u IS NULL OR upper(r.ulp) = u);

  -- Inspeksi JTM Tier 1. ★ WO terbit = tempelan WO manual kalau ada, selain
  -- itu WO inspeksi JTM sistem. ★ Realisasi hanya inspeksi tier 1.
  RETURN QUERY
  SELECT 'jtm'::text,
    COALESCE(public._wo_manual_total(u, p_tahun, p_bulan, 'jtm', true, false),
      (SELECT round(COALESCE(sum(i.panjang_km), 0), 3)
         FROM public.wo_inspeksi_item i
         JOIN public.wo_inspeksi w ON w.id = i.wo_id
        WHERE w.jenis = 'JTM' AND i.status <> 'Dibatalkan'
          AND w.tgl_wo >= d_awal AND w.tgl_wo < d_akhr
          AND (u IS NULL OR upper(i.ulp) = u))),
    round(COALESCE(sum(sp.panjang_pakai_km) FILTER (WHERE m.status IN ('Selesai', 'Diverifikasi')), 0), 3),
    round(COALESCE(sum(sp.panjang_pakai_km) FILTER (WHERE m.status = 'Selesai'), 0), 3),
    round(COALESCE(sum(sp.panjang_pakai_km) FILTER (
      WHERE m.status IN ('Selesai', 'Diverifikasi') AND m.wo_item_id IS NULL), 0), 3)
  FROM public.inspeksi_jtm m
  LEFT JOIN public.segmen_panjang sp ON sp.segmen_id = m.segmen_id
  WHERE m.created_at >= t_awal AND m.created_at < t_akhr
    AND m.tier = '1'
    AND (u IS NULL OR upper(m.ulp) = u);

  -- ★ Inspeksi JTM Tier 2 — WO & realisasi dari tempelan (dicentang di web).
  RETURN QUERY
  SELECT 'jtm2'::text,
    public._wo_manual_total(u, p_tahun, p_bulan, 'jtm2', true, false),
    public._wo_manual_total(u, p_tahun, p_bulan, 'jtm2', true, true),
    NULL::numeric, NULL::numeric;

  -- Inspeksi JTR — km penghantar gardu (termasuk underbuild), kode + ULP.
  RETURN QUERY
  SELECT 'jtr'::text,
    (SELECT round(COALESCE(sum(i.panjang_km), 0), 3)
       FROM public.wo_inspeksi_item i
       JOIN public.wo_inspeksi w ON w.id = i.wo_id
      WHERE w.jenis = 'JTR' AND i.status <> 'Dibatalkan'
        AND w.tgl_wo >= d_awal AND w.tgl_wo < d_akhr
        AND (u IS NULL OR upper(i.ulp) = u)),
    round(COALESCE(sum(pj.km) FILTER (WHERE r.status IN ('Selesai', 'Diverifikasi')), 0), 3),
    round(COALESCE(sum(pj.km) FILTER (WHERE r.status = 'Selesai'), 0), 3),
    round(COALESCE(sum(pj.km) FILTER (
      WHERE r.status IN ('Selesai', 'Diverifikasi') AND r.wo_item_id IS NULL), 0), 3)
  FROM public.inspeksi_jtr r
  LEFT JOIN LATERAL (
    SELECT sum(g.panjang_km) AS km FROM public.gardu_jtr_penghantar g
    WHERE g.gardu_kode = r.gardu_kode AND g.ulp = r.ulp
  ) pj ON true
  WHERE r.created_at >= t_awal AND r.created_at < t_akhr
    AND (u IS NULL OR upper(r.ulp) = u);

  -- ★ Inspeksi Gardu Tier 1 & 2 — WO & realisasi dari tempelan (dicentang).
  RETURN QUERY
  SELECT 'igardu1'::text,
    public._wo_manual_total(u, p_tahun, p_bulan, 'igardu1', false, false),
    public._wo_manual_total(u, p_tahun, p_bulan, 'igardu1', false, true),
    NULL::numeric, NULL::numeric;
  RETURN QUERY
  SELECT 'igardu2'::text,
    public._wo_manual_total(u, p_tahun, p_bulan, 'igardu2', false, false),
    public._wo_manual_total(u, p_tahun, p_bulan, 'igardu2', false, true),
    NULL::numeric, NULL::numeric;
END $$;

GRANT EXECUTE ON FUNCTION public._rekap_kinerja_inti(TEXT, INT, INT) TO authenticated;


-- ── 8. SLA boleh diisi untuk baris baru ──────────────────────────────────────
ALTER TABLE public.sla_kinerja DROP CONSTRAINT IF EXISTS sla_kinerja_kunci_valid;
ALTER TABLE public.sla_kinerja ADD CONSTRAINT sla_kinerja_kunci_valid
  CHECK (kunci IN ('perabasan', 'harjtm', 'hargardu', 'penyeimbangan', 'optimasi', 'pengukuran',
                   'jtm', 'jtm2', 'jtr', 'igardu1', 'igardu2'));


-- ── Periksa ──────────────────────────────────────────────────────────────────
--   SELECT * FROM rekap_kinerja('AMPENAN', 2026, 10);      -- 11 baris
--   SELECT kunci, count(*), sum(km) FROM wo_surat_objek('AMPENAN', 2026, 10) GROUP BY 1;
--   SELECT * FROM storage.buckets WHERE id = 'ttd';          -- public = false
