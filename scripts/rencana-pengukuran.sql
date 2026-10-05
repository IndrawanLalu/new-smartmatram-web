-- =============================================================================
-- Rencana Pengukuran + WO Pengukuran otomatis/manual + pengingat "sudah masuk
-- waktu ukur" (5 Okt 2026, rancangan `rencana-pengukuran-terjadwal.md`).
-- Jalankan manual di Supabase SQL Editor. Idempoten. Tidak mengganggu
-- pekerjaan lapangan (HP tidak membaca apa pun yang diubah di sini).
--
-- Keputusan user:
--   • Rencana Pengukuran = salinan pola Rencana Pemeliharaan (Excel kisi 12
--     bulan per ULP), sebagai DASAR; aturan umur tetap jadi pengingat.
--   • WO bulan berencana = rencana + sisa bulan lalu; tanpa rencana = aturan
--     sistem (dipindah dari web ke sini — satu penyusun untuk tombol & jadwal).
--   • Gardu "sudah masuk waktu ukur" yang tidak ada di WO hanya DIINGATKAN
--     (terbit manual: tidak dicentang; terbit otomatis: pita + Tambahkan).
--   • Terbit WO per ULP: Manual (bawaan pengukuran) / Otomatis tanggal 1.
--     Pemeliharaan Gardu ikut mendapat pilihan ini (bawaan Otomatis = perilaku
--     sekarang).
--   • WO yang sudah ada karena TEMPELAN (sebelum tanggal 1) ditambah, bukan
--     ditolak — berlaku juga untuk WO Pemeliharaan dari rencana.
-- =============================================================================


-- ── 1. Tabel rencana: satu baris = satu gardu di satu bulan ──────────────────
CREATE UNIQUE INDEX IF NOT EXISTS gardu_kode_ulp_unik ON public.gardu (kode, ulp);

CREATE TABLE IF NOT EXISTS public.rencana_pengukuran (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ulp           TEXT NOT NULL,
  gardu_kode    TEXT NOT NULL,
  tahun         INT  NOT NULL CHECK (tahun BETWEEN 2020 AND 2100),
  bulan         INT  NOT NULL CHECK (bulan BETWEEN 1 AND 12),
  catatan       TEXT,
  diunggah_oleh TEXT,
  diunggah_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT rencana_pengukuran_gardu_fk FOREIGN KEY (gardu_kode, ulp)
    REFERENCES public.gardu (kode, ulp) ON UPDATE CASCADE ON DELETE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS rencana_pengukuran_unik
  ON public.rencana_pengukuran (ulp, tahun, bulan, gardu_kode);
COMMENT ON TABLE public.rencana_pengukuran IS
  'Rencana Pengukuran hasil unggah Excel ULP — dasar WO Pengukuran bulan itu.';

ALTER TABLE public.rencana_pengukuran ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS rencana_pengukuran_baca ON public.rencana_pengukuran;
CREATE POLICY rencana_pengukuran_baca ON public.rencana_pengukuran
  FOR SELECT TO authenticated USING (true);
-- Tulis HANYA lewat fungsi di bawah.
GRANT SELECT ON public.rencana_pengukuran TO authenticated;


-- ── 2. Pengaturan: terbit otomatis / manual ──────────────────────────────────
ALTER TABLE public.wo_pengukuran_settings
  ADD COLUMN IF NOT EXISTS terbit_otomatis BOOLEAN NOT NULL DEFAULT false;
-- Pemeliharaan: bawaan TRUE — selama ini WO dari rencana selalu terbit sendiri.
ALTER TABLE public.wo_hargardu_settings
  ADD COLUMN IF NOT EXISTS terbit_otomatis BOOLEAN NOT NULL DEFAULT true;


-- ── 3. Alasan baru di baris WO Pengukuran ────────────────────────────────────
ALTER TABLE public.wo_pengukuran_item DROP CONSTRAINT IF EXISTS wo_pengukuran_item_alasan_check;
ALTER TABLE public.wo_pengukuran_item ADD CONSTRAINT wo_pengukuran_item_alasan_check
  CHECK (alasan IN ('belum_pernah', 'kedaluwarsa', 'tempelan', 'rencana', 'sisa'));


-- ── 4. Simpan / hapus unggahan (pola simpan_rencana_hargardu) ────────────────
CREATE OR REPLACE FUNCTION public.simpan_rencana_pengukuran(
  p_ulp TEXT, p_dari DATE, p_baris JSONB, p_nama TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_ulp     TEXT := upper(btrim(COALESCE(p_ulp, '')));
  v_kini    DATE := date_trunc('month', (now() AT TIME ZONE 'Asia/Makassar'))::date;
  v_sampai  DATE;
  v_asing   TEXT[];
  v_luar    TEXT[];
  v_terbit  TEXT[];
  v_n       INT;
BEGIN
  PERFORM public.wajib_boleh_ulp(v_ulp);

  IF p_dari IS NULL OR extract(day FROM p_dari) <> 1 THEN
    RAISE EXCEPTION 'Awal periode templat tidak sah — unduh ulang templatnya.';
  END IF;
  IF p_dari < v_kini THEN
    RAISE EXCEPTION 'Templat ini mulai % — sudah lewat. Unduh templat terbaru.', to_char(p_dari, 'MM-YYYY');
  END IF;
  v_sampai := (p_dari + interval '12 months')::date;
  IF jsonb_typeof(COALESCE(p_baris, 'null'::jsonb)) <> 'array' THEN
    RAISE EXCEPTION 'Isi rencana tidak terbaca — unduh ulang templatnya.';
  END IF;

  DROP TABLE IF EXISTS _rp;
  CREATE TEMP TABLE _rp ON COMMIT DROP AS
  SELECT upper(btrim(b->>'kode')) AS kode_asli,
         g.kode                   AS kode,
         (b->>'tahun')::int       AS tahun,
         (b->>'bulan')::int       AS bulan,
         NULLIF(btrim(b->>'catatan'), '') AS catatan
  FROM jsonb_array_elements(p_baris) b
  LEFT JOIN public.gardu g ON upper(g.kode) = upper(btrim(b->>'kode')) AND upper(g.ulp) = v_ulp;

  SELECT array_agg(DISTINCT kode_asli ORDER BY kode_asli) INTO v_asing FROM _rp WHERE kode IS NULL;
  IF v_asing IS NOT NULL THEN
    RAISE EXCEPTION '% kode gardu tidak ada di Master Gardu ULP %: % — daftarkan di Master Gardu dulu, lalu unggah ulang.',
      cardinality(v_asing), v_ulp,
      array_to_string(v_asing[1:20], ', ') || CASE WHEN cardinality(v_asing) > 20 THEN ', …' ELSE '' END;
  END IF;

  SELECT array_agg(DISTINCT kode || ' (' || COALESCE(bulan::text, '?') || '/' || COALESCE(tahun::text, '?') || ')') INTO v_luar
  FROM _rp
  WHERE CASE WHEN bulan BETWEEN 1 AND 12 AND tahun BETWEEN 2020 AND 2100
             THEN make_date(tahun, bulan, 1) < p_dari OR make_date(tahun, bulan, 1) >= v_sampai
             ELSE true END;
  IF v_luar IS NOT NULL THEN
    RAISE EXCEPTION 'Bulan di luar periode templat: % — unduh ulang templatnya.', array_to_string(v_luar[1:10], ', ');
  END IF;

  -- Bulan jendela yang WO-nya sudah terbit (bukan sekadar tempelan): dikunci.
  SELECT array_agg(to_char(make_date(w.tahun, w.bulan, 1), 'MM-YYYY') ORDER BY w.tahun, w.bulan) INTO v_terbit
  FROM public.wo_pengukuran w
  WHERE w.ulp = v_ulp AND w.tgl_wo >= p_dari AND w.tgl_wo < v_sampai
    AND NOT public._wo_tempelan_belum_disusun(w.kriteria);

  DELETE FROM public.rencana_pengukuran r
  WHERE r.ulp = v_ulp
    AND make_date(r.tahun, r.bulan, 1) >= p_dari AND make_date(r.tahun, r.bulan, 1) < v_sampai
    AND NOT EXISTS (SELECT 1 FROM public.wo_pengukuran w
                    WHERE w.ulp = v_ulp AND w.tahun = r.tahun AND w.bulan = r.bulan
                      AND NOT public._wo_tempelan_belum_disusun(w.kriteria));

  INSERT INTO public.rencana_pengukuran (ulp, gardu_kode, tahun, bulan, catatan, diunggah_oleh)
  SELECT DISTINCT ON (x.kode, x.tahun, x.bulan) v_ulp, x.kode, x.tahun, x.bulan, x.catatan, p_nama
  FROM _rp x
  WHERE NOT EXISTS (SELECT 1 FROM public.wo_pengukuran w
                    WHERE w.ulp = v_ulp AND w.tahun = x.tahun AND w.bulan = x.bulan
                      AND NOT public._wo_tempelan_belum_disusun(w.kriteria))
  ORDER BY x.kode, x.tahun, x.bulan;
  GET DIAGNOSTICS v_n = ROW_COUNT;

  RETURN jsonb_build_object('tersimpan', v_n, 'bulan_terkunci', COALESCE(to_jsonb(v_terbit), '[]'::jsonb));
END $$;

CREATE OR REPLACE FUNCTION public.hapus_rencana_pengukuran(p_ulp TEXT)
RETURNS INT
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_ulp  TEXT := upper(btrim(COALESCE(p_ulp, '')));
  v_kini DATE := date_trunc('month', (now() AT TIME ZONE 'Asia/Makassar'))::date;
  v_n    INT;
BEGIN
  PERFORM public.wajib_boleh_ulp(v_ulp);
  DELETE FROM public.rencana_pengukuran r
  WHERE r.ulp = v_ulp
    AND make_date(r.tahun, r.bulan, 1) >= v_kini
    AND NOT EXISTS (SELECT 1 FROM public.wo_pengukuran w
                    WHERE w.ulp = v_ulp AND w.tahun = r.tahun AND w.bulan = r.bulan
                      AND NOT public._wo_tempelan_belum_disusun(w.kriteria));
  GET DIAGNOSTICS v_n = ROW_COUNT;
  RETURN v_n;
END $$;


-- ── 5. Pembantu ──────────────────────────────────────────────────────────────

-- WO yang lahir dari Tempel WO (Rekap Kinerja) dan belum pernah disusun boleh
-- DITAMBAH penyusun; WO lain = sudah terbit.
CREATE OR REPLACE FUNCTION public._wo_tempelan_belum_disusun(p_kriteria JSONB)
RETURNS BOOLEAN LANGUAGE sql IMMUTABLE AS $$
  SELECT COALESCE(p_kriteria->>'sumber', '') = 'tempelan' AND p_kriteria->>'disusun' IS NULL
$$;

-- Pengaturan yang berlaku untuk satu ULP: miliknya, lalu 'ALL', lalu bawaan
-- (sama dengan settingsUntuk() di web).
CREATE OR REPLACE FUNCTION public._setelan_wo_pengukuran(p_ulp TEXT)
RETURNS TABLE (ambang_beban_pct NUMERIC, bulan_beban_tinggi INT, bulan_beban_rendah INT, kuota_per_bulan INT,
               sertakan_belum_pernah BOOLEAN, hanya_gardu_aktif BOOLEAN, terbit_otomatis BOOLEAN)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT x.a, x.bt, x.br, x.k, x.sb, x.ha, x.ot
  FROM (
    SELECT s.ambang_beban_pct AS a, s.bulan_beban_tinggi AS bt, s.bulan_beban_rendah AS br, s.kuota_per_bulan AS k,
           s.sertakan_belum_pernah AS sb, s.hanya_gardu_aktif AS ha, s.terbit_otomatis AS ot,
           CASE WHEN s.ulp = 'ALL' THEN 2 ELSE 1 END AS urut
    FROM public.wo_pengukuran_settings s WHERE s.ulp IN (upper(btrim(p_ulp)), 'ALL')
    UNION ALL
    SELECT 80::numeric, 3, 5, 50, true, true, false, 3
  ) x
  ORDER BY x.urut
  LIMIT 1
$$;


-- ── 6. Hitung isi WO + pengingat (tanpa menulis) ─────────────────────────────
-- kelompok 'wo'        : yang akan masuk WO bila diterbitkan sekarang
--                        (kosong bila WO bulan itu sudah terbit);
-- kelompok 'pengingat' : gardu sudah masuk waktu ukur (aturan Pengaturan WO)
--                        yang tidak ada di WO / tidak akan masuk WO.
-- masuk_waktu          : gardu memenuhi aturan umur (dipakai kartu Tunggakan).
CREATE OR REPLACE FUNCTION public._hitung_wo_pengukuran(p_ulp TEXT, p_tahun INT, p_bulan INT)
RETURNS TABLE (
  kode_gardu TEXT, nama TEXT, alamat TEXT, penyulang TEXT, kva_master NUMERIC,
  lat DOUBLE PRECISION, lng DOUBLE PRECISION, alasan TEXT, tgl_ukur_terakhir DATE,
  umur_bulan INT, persen_beban NUMERIC, masuk_waktu BOOLEAN, kelompok TEXT, urutan INT
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_ulp     TEXT := upper(btrim(COALESCE(p_ulp, '')));
  v_tgl     DATE := make_date(p_tahun, p_bulan, 1);
  v_lalu    DATE := (make_date(p_tahun, p_bulan, 1) - interval '1 month')::date;
  s         RECORD;
  v_wo      UUID;
  v_susun   BOOLEAN;
  v_rencana BOOLEAN;
BEGIN
  SELECT * INTO s FROM public._setelan_wo_pengukuran(v_ulp);
  SELECT w.id, public._wo_tempelan_belum_disusun(w.kriteria) INTO v_wo, v_susun
  FROM public.wo_pengukuran w WHERE w.ulp = v_ulp AND w.tahun = p_tahun AND w.bulan = p_bulan;
  v_susun := COALESCE(v_susun, v_wo IS NULL);
  v_rencana := EXISTS (SELECT 1 FROM public.rencana_pengukuran r
                       WHERE r.ulp = v_ulp AND r.tahun = p_tahun AND r.bulan = p_bulan);

  RETURN QUERY
  WITH m AS (
    SELECT g.kode, upper(g.kode) AS k, g.nama, g.alamat, g.penyulang, g.kva_master::numeric AS kva,
           g.status, g.belum_diukur, g.event_date::date AS ev, g.persen_beban::numeric AS pb,
           CASE WHEN replace(g.lat::text, ',', '.') ~ '^-?[0-9]+(\.[0-9]+)?$'
                THEN NULLIF(replace(g.lat::text, ',', '.')::double precision, 0) END AS la,
           CASE WHEN replace(g.lng::text, ',', '.') ~ '^-?[0-9]+(\.[0-9]+)?$'
                THEN NULLIF(replace(g.lng::text, ',', '.')::double precision, 0) END AS lo
    FROM public.gardu_master_state g
    WHERE upper(g.ulp) = v_ulp
  ),
  u AS (
    SELECT m.*,
           -- Sama dengan umurBulan() di web: selisih bulan penuh terhadap TANGGAL WO.
           CASE WHEN m.belum_diukur OR m.ev IS NULL THEN NULL ELSE greatest(0,
             (extract(year FROM v_tgl) - extract(year FROM m.ev))::int * 12
             + (extract(month FROM v_tgl) - extract(month FROM m.ev))::int
             - CASE WHEN extract(day FROM v_tgl) < extract(day FROM m.ev) THEN 1 ELSE 0 END) END AS umur,
           (NOT s.hanya_gardu_aktif OR m.status IS NULL OR btrim(m.status) = '' OR upper(m.status) = 'AKTIF') AS aktif
    FROM m
  ),
  kandidat AS (
    SELECT u.*, CASE WHEN u.umur IS NULL THEN 'belum_pernah' ELSE 'kedaluwarsa' END AS als,
           row_number() OVER (ORDER BY (u.umur IS NULL) DESC, COALESCE(u.umur, 0) DESC,
                                       COALESCE(u.pb, 0) DESC, u.kode) AS n
    FROM u
    WHERE u.aktif AND (
      (u.umur IS NULL AND s.sertakan_belum_pernah)
      OR (u.umur IS NOT NULL AND u.umur >= CASE WHEN round(COALESCE(u.pb, 0)) >= s.ambang_beban_pct
                                                THEN s.bulan_beban_tinggi ELSE s.bulan_beban_rendah END))
  ),
  sudah AS (
    SELECT DISTINCT upper(i.kode_gardu) AS k FROM public.wo_pengukuran_item i WHERE i.wo_id = v_wo
  ),
  rencana AS (
    SELECT DISTINCT upper(r.gardu_kode) AS k FROM public.rencana_pengukuran r
    WHERE r.ulp = v_ulp AND r.tahun = p_tahun AND r.bulan = p_bulan
  ),
  sisa AS (
    SELECT DISTINCT upper(w.kode_gardu) AS k FROM public.wo_pengukuran_realisasi w
    WHERE upper(w.ulp) = v_ulp AND w.tgl_wo = v_lalu AND NOT w.terealisasi
      AND upper(w.kode_gardu) NOT IN (SELECT k FROM rencana)
  ),
  -- Aturan sistem: kandidat yang belum ada di WO, dipotong kuota (gardu
  -- tempelan yang sudah ada ikut menghabiskan kuota).
  sistem AS (
    SELECT c.k, c.als, row_number() OVER (ORDER BY c.n) AS n2
    FROM kandidat c WHERE c.k NOT IN (SELECT k FROM sudah)
  ),
  wo AS (
    SELECT r.k, 'rencana'::text AS als, 1 AS grup, 0::bigint AS n FROM rencana r
    WHERE v_susun AND v_rencana AND r.k NOT IN (SELECT k FROM sudah)
    UNION ALL
    SELECT x.k, 'sisa', 2, 0 FROM sisa x
    WHERE v_susun AND v_rencana AND x.k NOT IN (SELECT k FROM sudah)
    UNION ALL
    SELECT y.k, y.als, 3, y.n2 FROM sistem y
    WHERE v_susun AND NOT v_rencana AND y.n2 <= greatest(0, s.kuota_per_bulan - (SELECT count(*) FROM sudah))
  )
  SELECT uu.kode, uu.nama, uu.alamat, uu.penyulang, uu.kva, uu.la, uu.lo, w.als,
         CASE WHEN uu.belum_diukur THEN NULL ELSE uu.ev END, uu.umur, uu.pb,
         EXISTS (SELECT 1 FROM kandidat c WHERE c.k = w.k), 'wo'::text,
         (row_number() OVER (ORDER BY w.grup, w.n, uu.penyulang NULLS LAST, uu.kode))::int
  FROM wo w JOIN u uu ON uu.k = w.k
  UNION ALL
  SELECT c.kode, c.nama, c.alamat, c.penyulang, c.kva, c.la, c.lo, c.als,
         CASE WHEN c.belum_diukur THEN NULL ELSE c.ev END, c.umur, c.pb, true, 'pengingat'::text, c.n::int
  FROM kandidat c
  WHERE c.k NOT IN (SELECT k FROM sudah) AND c.k NOT IN (SELECT k FROM wo);
END $$;
REVOKE ALL ON FUNCTION public._hitung_wo_pengukuran(TEXT, INT, INT) FROM PUBLIC, anon, authenticated;

-- Pratinjau untuk web (hanya membaca).
CREATE OR REPLACE FUNCTION public.pratinjau_wo_pengukuran(p_ulp TEXT, p_tahun INT, p_bulan INT)
RETURNS TABLE (
  kode_gardu TEXT, nama TEXT, alamat TEXT, penyulang TEXT, kva_master NUMERIC,
  lat DOUBLE PRECISION, lng DOUBLE PRECISION, alasan TEXT, tgl_ukur_terakhir DATE,
  umur_bulan INT, persen_beban NUMERIC, masuk_waktu BOOLEAN, kelompok TEXT, urutan INT
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT * FROM public._hitung_wo_pengukuran(p_ulp, p_tahun, p_bulan)
$$;


-- ── 7. Penyusun (tanpa penjaga hak — dipanggil tombol & jadwal) ──────────────
-- p_tambahan: kode gardu "sudah masuk waktu ukur" yang dicentang admin ikut masuk.
CREATE OR REPLACE FUNCTION public._susun_wo_pengukuran(
  p_ulp TEXT, p_tahun INT, p_bulan INT, p_oleh UUID, p_tambahan TEXT[] DEFAULT '{}'
)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_ulp    TEXT := upper(btrim(COALESCE(p_ulp, '')));
  v_tgl    DATE := make_date(p_tahun, p_bulan, 1);
  v_id     UUID;
  v_krit   JSONB;
  v_baru   BOOLEAN := false;
  v_mulai  INT;
  v_tambah TEXT[] := ARRAY(SELECT upper(btrim(x)) FROM unnest(COALESCE(p_tambahan, '{}')) x);
  s        RECORD;
  n        JSONB;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('wo-pengukuran|' || v_ulp || '|' || v_tgl));

  SELECT id, kriteria INTO v_id, v_krit FROM public.wo_pengukuran
  WHERE ulp = v_ulp AND tahun = p_tahun AND bulan = p_bulan;
  IF v_id IS NOT NULL AND NOT public._wo_tempelan_belum_disusun(v_krit) THEN
    RAISE EXCEPTION 'WO Pengukuran % %-% sudah terbit.', v_ulp, lpad(p_bulan::text, 2, '0'), p_tahun;
  END IF;

  -- Dihitung SEBELUM header dibuat: header baru membuat bulan ini "sudah terbit".
  DROP TABLE IF EXISTS _swp;
  CREATE TEMP TABLE _swp ON COMMIT DROP AS
  SELECT * FROM public._hitung_wo_pengukuran(v_ulp, p_tahun, p_bulan) h
  WHERE h.kelompok = 'wo' OR (h.kelompok = 'pengingat' AND upper(h.kode_gardu) = ANY (v_tambah));

  IF NOT EXISTS (SELECT 1 FROM _swp) THEN
    RETURN jsonb_build_object('wo_id', v_id, 'jumlah', 0);
  END IF;

  SELECT * INTO s FROM public._setelan_wo_pengukuran(v_ulp);
  IF v_id IS NULL THEN
    v_id := gen_random_uuid();
    v_baru := true;
    INSERT INTO public.wo_pengukuran (id, ulp, bulan, tahun, tgl_wo, kuota, kriteria, created_by)
    VALUES (v_id, v_ulp, p_bulan, p_tahun, v_tgl, 0, '{}'::jsonb, p_oleh);
  END IF;
  SELECT COALESCE(max(urutan), 0) INTO v_mulai FROM public.wo_pengukuran_item WHERE wo_id = v_id;

  INSERT INTO public.wo_pengukuran_item
    (wo_id, kode_gardu, ulp, nama, alamat, penyulang, kva_master, lat, lng, alasan, tgl_ukur_terakhir, umur_bulan, urutan)
  SELECT v_id, h.kode_gardu, v_ulp, h.nama, h.alamat, h.penyulang, h.kva_master, h.lat, h.lng, h.alasan,
         h.tgl_ukur_terakhir, h.umur_bulan,
         v_mulai + (row_number() OVER (ORDER BY h.kelompok DESC, h.urutan))::int   -- 'wo' dulu, lalu tambahan
  FROM _swp h
  ON CONFLICT (wo_id, kode_gardu, ulp) DO NOTHING;

  SELECT jsonb_build_object(
           'rencana', count(*) FILTER (WHERE h.kelompok = 'wo' AND h.alasan = 'rencana'),
           'sisa',    count(*) FILTER (WHERE h.kelompok = 'wo' AND h.alasan = 'sisa'),
           'sistem',  count(*) FILTER (WHERE h.kelompok = 'wo' AND h.alasan IN ('belum_pernah', 'kedaluwarsa')),
           'tambahan', count(*) FILTER (WHERE h.kelompok = 'pengingat'))
  INTO n FROM _swp h;

  UPDATE public.wo_pengukuran
  SET kuota = (SELECT count(*) FROM public.wo_pengukuran_item WHERE wo_id = v_id),
      kriteria = COALESCE(v_krit, '{}'::jsonb) || n || jsonb_build_object(
        'sumber', CASE WHEN (n->>'rencana')::int + (n->>'sisa')::int > 0 THEN 'rencana' ELSE 'sistem' END,
        'tempelan', NOT v_baru,
        'disusun', now(),
        'otomatis', p_oleh IS NULL,
        'setelan', to_jsonb(s))
  WHERE id = v_id;

  RETURN jsonb_build_object('wo_id', v_id, 'jumlah', (SELECT count(*) FROM _swp)) || n;
END $$;
REVOKE ALL ON FUNCTION public._susun_wo_pengukuran(TEXT, INT, INT, UUID, TEXT[]) FROM PUBLIC, anon, authenticated;


-- ── 8. Tombol "Terbitkan WO" & "Tambahkan ke WO" (dijaga hak ULP) ────────────
CREATE OR REPLACE FUNCTION public.terbitkan_wo_pengukuran(
  p_ulp TEXT, p_tahun INT, p_bulan INT, p_tambahan TEXT[] DEFAULT '{}'
)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_ulp TEXT := upper(btrim(COALESCE(p_ulp, '')));
BEGIN
  PERFORM public.wajib_boleh_ulp(v_ulp);
  RETURN public._susun_wo_pengukuran(v_ulp, p_tahun, p_bulan, auth.uid(), p_tambahan);
END $$;

-- Gardu "sudah masuk waktu ukur" ditambahkan ke WO yang sudah terbit.
CREATE OR REPLACE FUNCTION public.tambah_pengingat_wo_pengukuran(
  p_ulp TEXT, p_tahun INT, p_bulan INT, p_kode TEXT[]
)
RETURNS INT
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_ulp   TEXT := upper(btrim(COALESCE(p_ulp, '')));
  v_id    UUID;
  v_mulai INT;
  v_kode  TEXT[] := ARRAY(SELECT upper(btrim(x)) FROM unnest(COALESCE(p_kode, '{}')) x);
  v_n     INT;
BEGIN
  PERFORM public.wajib_boleh_ulp(v_ulp);
  SELECT id INTO v_id FROM public.wo_pengukuran WHERE ulp = v_ulp AND tahun = p_tahun AND bulan = p_bulan;
  IF v_id IS NULL THEN
    RAISE EXCEPTION 'WO Pengukuran % %-% belum terbit — terbitkan dulu.', v_ulp, lpad(p_bulan::text, 2, '0'), p_tahun;
  END IF;
  SELECT COALESCE(max(urutan), 0) INTO v_mulai FROM public.wo_pengukuran_item WHERE wo_id = v_id;

  INSERT INTO public.wo_pengukuran_item
    (wo_id, kode_gardu, ulp, nama, alamat, penyulang, kva_master, lat, lng, alasan, tgl_ukur_terakhir, umur_bulan, urutan)
  SELECT v_id, h.kode_gardu, v_ulp, h.nama, h.alamat, h.penyulang, h.kva_master, h.lat, h.lng, h.alasan,
         h.tgl_ukur_terakhir, h.umur_bulan, v_mulai + (row_number() OVER (ORDER BY h.urutan))::int
  FROM public._hitung_wo_pengukuran(v_ulp, p_tahun, p_bulan) h
  WHERE h.kelompok = 'pengingat' AND upper(h.kode_gardu) = ANY (v_kode)
  ON CONFLICT (wo_id, kode_gardu, ulp) DO NOTHING;
  GET DIAGNOSTICS v_n = ROW_COUNT;

  UPDATE public.wo_pengukuran
  SET kuota = (SELECT count(*) FROM public.wo_pengukuran_item WHERE wo_id = v_id),
      kriteria = kriteria || jsonb_build_object('tambahan',
        COALESCE((kriteria->>'tambahan')::int, 0) + v_n)
  WHERE id = v_id;
  RETURN v_n;
END $$;


-- ── 9. Penerbitan otomatis tanggal 1 ─────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.terbitkan_wo_pengukuran_otomatis()
RETURNS TEXT
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_kini  DATE := date_trunc('month', (now() AT TIME ZONE 'Asia/Makassar'))::date;
  v_th    INT  := extract(year FROM v_kini)::int;
  v_bl    INT  := extract(month FROM v_kini)::int;
  u       TEXT;
  h       JSONB;
  hasil   TEXT[] := '{}';
BEGIN
  FOR u IN
    SELECT DISTINCT upper(btrim(g.ulp)) FROM public.gardu g
    WHERE NULLIF(btrim(g.ulp), '') IS NOT NULL
      AND (SELECT st.terbit_otomatis FROM public._setelan_wo_pengukuran(g.ulp) st)
      AND NOT EXISTS (SELECT 1 FROM public.wo_pengukuran w
                      WHERE w.ulp = upper(btrim(g.ulp)) AND w.tahun = v_th AND w.bulan = v_bl
                        AND NOT public._wo_tempelan_belum_disusun(w.kriteria))
    ORDER BY 1
  LOOP
    BEGIN
      h := public._susun_wo_pengukuran(u, v_th, v_bl, NULL, '{}');
      hasil := hasil || format('%s: %s gardu (%s rencana, %s sisa, %s sistem)', u,
                               h->>'jumlah', COALESCE(h->>'rencana', '0'), COALESCE(h->>'sisa', '0'), COALESCE(h->>'sistem', '0'));
    EXCEPTION WHEN OTHERS THEN
      hasil := hasil || format('%s: GAGAL %s', u, SQLERRM);
    END;
  END LOOP;
  RETURN CASE WHEN cardinality(hasil) = 0 THEN 'tidak ada ULP bertanda otomatis yang menunggu terbit'
              ELSE array_to_string(hasil, '; ') END;
END $$;
REVOKE ALL ON FUNCTION public.terbitkan_wo_pengukuran_otomatis() FROM PUBLIC, anon, authenticated;


-- ── 10. Pemeliharaan Gardu: pilihan otomatis + tempelan ditambah ─────────────
-- Salinan `_susun_wo_hargardu_rencana` (rencana-hargardu-terbit.sql); yang baru
-- bertanda ★: WO tempelan yang belum disusun DITAMBAH, bukan ditolak.
CREATE OR REPLACE FUNCTION public._susun_wo_hargardu_rencana(p_ulp TEXT, p_tahun INT, p_bulan INT, p_oleh UUID)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_tgl     DATE := make_date(p_tahun, p_bulan, 1);
  v_lalu    DATE := (make_date(p_tahun, p_bulan, 1) - interval '1 month')::date;
  v_id      UUID;
  v_krit    JSONB;
  v_mulai   INT := 0;
  v_rencana INT;
  v_sisa    INT;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('wo-hargardu|' || p_ulp || '|' || v_tgl));

  -- ★ WO tempelan yang belum disusun boleh ditambah.
  SELECT id, kriteria INTO v_id, v_krit FROM public.wo_hargardu WHERE ulp = p_ulp AND tahun = p_tahun AND bulan = p_bulan;
  IF v_id IS NOT NULL AND NOT public._wo_tempelan_belum_disusun(v_krit) THEN
    RAISE EXCEPTION 'WO Pemeliharaan % %-% sudah terbit.', p_ulp, lpad(p_bulan::text, 2, '0'), p_tahun;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.rencana_hargardu WHERE ulp = p_ulp AND tahun = p_tahun AND bulan = p_bulan) THEN
    RAISE EXCEPTION 'Tidak ada Rencana Pemeliharaan % untuk %-%.', p_ulp, lpad(p_bulan::text, 2, '0'), p_tahun;
  END IF;

  IF v_id IS NULL THEN
    v_id := gen_random_uuid();
    INSERT INTO public.wo_hargardu (id, ulp, bulan, tahun, tgl_wo, kuota, kriteria, created_by)
    VALUES (v_id, p_ulp, p_bulan, p_tahun, v_tgl, 0, '{}'::jsonb, p_oleh);
  ELSE
    SELECT COALESCE(max(urutan), 0) INTO v_mulai FROM public.wo_hargardu_item WHERE wo_id = v_id;
  END IF;

  WITH rencana AS (
    SELECT DISTINCT upper(r.gardu_kode) AS k
    FROM public.rencana_hargardu r
    WHERE r.ulp = p_ulp AND r.tahun = p_tahun AND r.bulan = p_bulan
  ),
  sisa AS (
    SELECT DISTINCT upper(w.gardu_kode) AS k
    FROM public.wo_hargardu_realisasi w
    WHERE w.ulp = p_ulp AND w.tgl_wo = v_lalu AND NOT w.terealisasi
      AND upper(w.gardu_kode) NOT IN (SELECT k FROM rencana)
  ),
  pilih AS (
    SELECT k, 'rencana'::text AS alasan, 1 AS grup FROM rencana
    UNION ALL
    SELECT k, 'sisa', 2 FROM sisa
  ),
  terakhir AS (
    SELECT upper(p.gardu_kode) AS k, max((p.tgl_selesai AT TIME ZONE 'Asia/Makassar')::date) AS t
    FROM public.pemeliharaan_gardu p
    WHERE upper(p.ulp) = p_ulp AND p.status IN ('Selesai', 'Diverifikasi') AND p.tgl_selesai IS NOT NULL
    GROUP BY 1
  ),
  master AS (
    SELECT upper(g.kode) AS k, g.kode, g.nama, g.alamat, g.penyulang,
           CASE WHEN replace(g.lat::text, ',', '.') ~ '^-?[0-9]+(\.[0-9]+)?$'
                THEN NULLIF(replace(g.lat::text, ',', '.')::double precision, 0) END AS lat,
           CASE WHEN replace(g.lng::text, ',', '.') ~ '^-?[0-9]+(\.[0-9]+)?$'
                THEN NULLIF(replace(g.lng::text, ',', '.')::double precision, 0) END AS lng
    FROM public.gardu_master_state g
    WHERE upper(g.ulp) = p_ulp
  )
  INSERT INTO public.wo_hargardu_item
    (wo_id, gardu_kode, ulp, nama, alamat, penyulang, lat, lng, alasan, tgl_pelihara_terakhir, umur_bulan, urutan)
  SELECT v_id, m.kode, p_ulp, m.nama, m.alamat, m.penyulang, m.lat, m.lng, p.alasan, t.t,
         CASE WHEN t.t IS NOT NULL THEN greatest(0,
           (extract(year FROM v_tgl) - extract(year FROM t.t))::int * 12
           + (extract(month FROM v_tgl) - extract(month FROM t.t))::int
           - CASE WHEN extract(day FROM v_tgl) < extract(day FROM t.t) THEN 1 ELSE 0 END) END,
         v_mulai + row_number() OVER (ORDER BY p.grup, m.penyulang NULLS LAST, m.kode)
  FROM pilih p
  JOIN master m ON m.k = p.k
  LEFT JOIN terakhir t ON t.k = p.k
  -- ★ gardu yang sudah ada di tempelan tidak digandakan
  WHERE NOT EXISTS (SELECT 1 FROM public.wo_hargardu_item i WHERE i.wo_id = v_id AND upper(i.gardu_kode) = p.k);

  SELECT count(*) FILTER (WHERE alasan = 'rencana'), count(*) FILTER (WHERE alasan = 'sisa')
  INTO v_rencana, v_sisa
  FROM public.wo_hargardu_item WHERE wo_id = v_id;

  UPDATE public.wo_hargardu
  SET kuota = (SELECT count(*) FROM public.wo_hargardu_item WHERE wo_id = v_id),
      kriteria = COALESCE(v_krit, '{}'::jsonb) || jsonb_build_object(
        'sumber', 'rencana', 'rencana', v_rencana, 'sisa', v_sisa,
        'otomatis', p_oleh IS NULL, 'tempelan', v_krit IS NOT NULL, 'disusun', now())
  WHERE id = v_id;

  RETURN jsonb_build_object('wo_id', v_id, 'rencana', v_rencana, 'sisa', v_sisa);
END $$;
REVOKE ALL ON FUNCTION public._susun_wo_hargardu_rencana(TEXT, INT, INT, UUID) FROM PUBLIC, anon, authenticated;

-- Salinan `terbitkan_wo_hargardu_otomatis`; ★ hanya ULP yang memilih Otomatis,
-- dan WO tempelan yang belum disusun ikut diproses.
CREATE OR REPLACE FUNCTION public.terbitkan_wo_hargardu_otomatis()
RETURNS TEXT
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_kini  DATE := date_trunc('month', (now() AT TIME ZONE 'Asia/Makassar'))::date;
  v_th    INT  := extract(year FROM v_kini)::int;
  v_bl    INT  := extract(month FROM v_kini)::int;
  u       TEXT;
  h       JSONB;
  hasil   TEXT[] := '{}';
BEGIN
  FOR u IN
    SELECT DISTINCT r.ulp FROM public.rencana_hargardu r
    WHERE r.tahun = v_th AND r.bulan = v_bl
      AND NOT EXISTS (SELECT 1 FROM public.wo_hargardu w WHERE w.ulp = r.ulp AND w.tahun = v_th AND w.bulan = v_bl
                        AND NOT public._wo_tempelan_belum_disusun(w.kriteria))
      -- ★ pilihan Terbit WO di Pengaturan: miliknya, lalu 'ALL', lalu Otomatis.
      AND COALESCE((SELECT s.terbit_otomatis FROM public.wo_hargardu_settings s WHERE s.ulp = r.ulp),
                   (SELECT s.terbit_otomatis FROM public.wo_hargardu_settings s WHERE s.ulp = 'ALL'),
                   true)
    ORDER BY 1
  LOOP
    BEGIN
      h := public._susun_wo_hargardu_rencana(u, v_th, v_bl, NULL);
      hasil := hasil || format('%s: %s rencana + %s sisa', u, h->>'rencana', h->>'sisa');
    EXCEPTION WHEN OTHERS THEN
      hasil := hasil || format('%s: GAGAL %s', u, SQLERRM);
    END;
  END LOOP;
  RETURN CASE WHEN cardinality(hasil) = 0 THEN 'tidak ada rencana yang menunggu terbit'
              ELSE array_to_string(hasil, '; ') END;
END $$;
REVOKE ALL ON FUNCTION public.terbitkan_wo_hargardu_otomatis() FROM PUBLIC, anon, authenticated;


-- ── 11. Hak eksekusi ─────────────────────────────────────────────────────────
GRANT EXECUTE ON FUNCTION public.simpan_rencana_pengukuran(TEXT, DATE, JSONB, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.hapus_rencana_pengukuran(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.pratinjau_wo_pengukuran(TEXT, INT, INT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.terbitkan_wo_pengukuran(TEXT, INT, INT, TEXT[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.tambah_pengingat_wo_pengukuran(TEXT, INT, INT, TEXT[]) TO authenticated;


-- ── 12. Jadwal: tanggal 1, 00.10 WITA (= 16.10 UTC hari sebelumnya) ──────────
CREATE EXTENSION IF NOT EXISTS pg_cron;
SELECT cron.unschedule(jobid) FROM cron.job WHERE jobname = 'wo-pengukuran-otomatis';
SELECT cron.schedule(
  'wo-pengukuran-otomatis',
  '10 16 * * *',
  $$SELECT CASE WHEN extract(day FROM (now() AT TIME ZONE 'Asia/Makassar')) = 1
               THEN public.terbitkan_wo_pengukuran_otomatis() END$$
);


-- ── Periksa ──────────────────────────────────────────────────────────────────
--   SELECT kelompok, alasan, count(*) FROM pratinjau_wo_pengukuran('TANJUNG', 2026, 11) GROUP BY 1, 2;
--   SELECT jobname, schedule, active FROM cron.job WHERE jobname LIKE 'wo-%';
