-- =============================================================================
-- Bulan WO untuk WO dari anomali pengukuran (Optimasi Trafo & Pemerataan Beban)
-- Keputusan user 1 Okt 2026. Jalankan manual di Supabase SQL Editor, SESUDAH
-- `wo-tempel-semua.sql`. Idempoten.
--
-- Dulu bulan WO = bulan tombol "WO" ditekan (`wo_sent_at`), tanpa bisa
-- diubah: WO September yang belum dikerjakan tidak bisa dijadikan WO Oktober,
-- dan Rekap Kinerja Oktober tidak membacanya. Sekarang:
--
--   1. `pengukuran_gardu.wo_bulan` = tanggal 1 BULAN WO (pola `tgl_wo` WO
--      Inspeksi & Perabasan). WO lama diisi dari bulan `wo_sent_at`-nya,
--      jadi angka September yang sudah ada tidak berubah.
--   2. `pindah_bulan_wo_anomali` — pindahkan WO yang BELUM dikerjakan ke
--      bulan lain, dipilih admin. Tidak terbawa otomatis: WO yang tidak
--      selesai tetap tercatat di bulannya sampai admin sendiri memindahkannya.
--   3. Rekap Kinerja & lampiran surat membaca `wo_bulan`. Penyeimbangan kini
--      menghitung WO dari anomali (dulu hanya tempelan) — gardu yang ada di
--      tempelan bulan yang sama dihitung sekali.
--
-- HP tidak berubah: daftar WO terbuka di HP memang tidak dibatasi bulan.
-- =============================================================================


-- ── 1. Kolom Bulan WO + penjaga ──────────────────────────────────────────────
ALTER TABLE public.pengukuran_gardu ADD COLUMN IF NOT EXISTS wo_bulan DATE;

COMMENT ON COLUMN public.pengukuran_gardu.wo_bulan IS
  'Tanggal 1 bulan WO. NULL bila belum di-WO. Bawaan: bulan wo_sent_at (WITA); '
  'dipindah lewat pindah_bulan_wo_anomali().';

-- Penanda WO (wo_sent_at) diisi tanpa bulan → bulan penandaan. Bulan dikirim
-- → dibulatkan ke tanggal 1. Penanda dihapus → bulan ikut hilang.
CREATE OR REPLACE FUNCTION public.pengukuran_wo_bulan()
RETURNS TRIGGER LANGUAGE plpgsql AS $fn$
BEGIN
  IF NEW.wo_sent_at IS NULL THEN
    NEW.wo_bulan := NULL;
  ELSIF NEW.wo_bulan IS NULL THEN
    NEW.wo_bulan := date_trunc('month', NEW.wo_sent_at AT TIME ZONE 'Asia/Makassar')::date;
  ELSE
    NEW.wo_bulan := date_trunc('month', NEW.wo_bulan)::date;
  END IF;
  RETURN NEW;
END $fn$;

DROP TRIGGER IF EXISTS trg_pengukuran_wo_bulan ON public.pengukuran_gardu;
CREATE TRIGGER trg_pengukuran_wo_bulan
  BEFORE INSERT OR UPDATE OF wo_sent_at, wo_bulan ON public.pengukuran_gardu
  FOR EACH ROW EXECUTE FUNCTION public.pengukuran_wo_bulan();

-- WO lama: bulan penandaannya.
UPDATE public.pengukuran_gardu
   SET wo_bulan = date_trunc('month', wo_sent_at AT TIME ZONE 'Asia/Makassar')::date
 WHERE wo_sent_at IS NOT NULL AND wo_bulan IS NULL;

CREATE INDEX IF NOT EXISTS pengukuran_gardu_wo_bulan_idx
  ON public.pengukuran_gardu (wo_bulan) WHERE wo_bulan IS NOT NULL;


-- ── 2. Gardu sudah ada di tempelan bulan itu? ────────────────────────────────
CREATE OR REPLACE FUNCTION public._gardu_di_tempelan(p_jenis TEXT, p_ulp TEXT, p_bulan DATE, p_gardu TEXT)
RETURNS BOOLEAN
LANGUAGE sql STABLE SET search_path = public AS $fn$
  SELECT EXISTS (
    SELECT 1 FROM public.wo_manual m JOIN public.wo_manual_item i ON i.wo_id = m.id
     WHERE m.jenis = p_jenis AND m.ulp = upper(p_ulp)
       AND m.tahun = extract(year FROM p_bulan)::int AND m.bulan = extract(month FROM p_bulan)::int
       AND upper(i.objek) = upper(p_gardu));
$fn$;


-- ── 3. Pindah bulan WO ───────────────────────────────────────────────────────
-- Hanya WO yang BELUM dikerjakan: optimasinya belum terkirim dari HP, dan
-- pemerataannya belum dicatat (klaim yang masih "Dikerjakan" boleh — regu
-- sedang di jalan, bulannya saja yang digeser). WO yang dibatalkan tidak.
CREATE OR REPLACE FUNCTION public.pindah_bulan_wo_anomali(p_id TEXT[], p_tahun INT, p_bulan INT)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  tujuan   DATE;
  r        RECORD;
  pindah   TEXT[] := '{}';
  dilewati JSONB := '[]'::jsonb;
BEGIN
  IF p_bulan NOT BETWEEN 1 AND 12 THEN RAISE EXCEPTION 'Bulan tidak sah'; END IF;
  tujuan := make_date(p_tahun, p_bulan, 1);

  FOR r IN SELECT pg.id, pg.no_gardu, pg.petugas_unit, pg.wo_sent_at, pg.wo_bulan, pg.jenis_pemeliharaan
             FROM public.pengukuran_gardu pg WHERE pg.id = ANY(p_id) LOOP
    PERFORM public.wajib_boleh_ulp(r.petugas_unit);

    IF r.wo_sent_at IS NULL THEN
      dilewati := dilewati || jsonb_build_object('gardu', r.no_gardu, 'sebab', 'Belum di-WO.');
    ELSIF EXISTS (SELECT 1 FROM public.optimasi_wo_batal b WHERE b.pengukuran_id = r.id) THEN
      dilewati := dilewati || jsonb_build_object('gardu', r.no_gardu, 'sebab', 'WO-nya sudah dibatalkan.');
    ELSIF EXISTS (SELECT 1 FROM public.optimasi_trafo o WHERE o.pengukuran_id = r.id AND o.status <> 'Dibatalkan')
       OR EXISTS (SELECT 1 FROM public.penyeimbangan_gardu p WHERE p.pengukuran_id = r.id AND p.status IS DISTINCT FROM 'Dikerjakan') THEN
      dilewati := dilewati || jsonb_build_object('gardu', r.no_gardu, 'sebab', 'Sudah dikerjakan — bulannya dikunci.');
    ELSIF r.wo_bulan = tujuan THEN
      dilewati := dilewati || jsonb_build_object('gardu', r.no_gardu, 'sebab', 'Sudah di bulan itu.');
    ELSE
      UPDATE public.pengukuran_gardu SET wo_bulan = tujuan WHERE id = r.id;
      pindah := pindah || r.id;
    END IF;
  END LOOP;

  RETURN jsonb_build_object('dipindah', to_jsonb(pindah), 'dilewati', dilewati);
END $fn$;

GRANT EXECUTE ON FUNCTION public.pindah_bulan_wo_anomali(TEXT[], INT, INT) TO authenticated;


-- ── 4. Lampiran surat ────────────────────────────────────────────────────────
-- Disalin dari `wo-tempel-semua.sql`; yang berubah ditandai ★.
DROP FUNCTION IF EXISTS public.wo_surat_objek(TEXT, INT, INT);
CREATE FUNCTION public.wo_surat_objek(p_ulp TEXT, p_tahun INT, p_bulan INT)
RETURNS TABLE (kunci TEXT, urutan INT, objek TEXT, alamat TEXT, km NUMERIC, keterangan TEXT, pelaksana TEXT,
               tgl_rencana DATE, penyulang TEXT, kva NUMERIC, uraian TEXT)
LANGUAGE plpgsql STABLE SET search_path = public AS $$
DECLARE
  u      TEXT := upper(btrim(COALESCE(p_ulp, '')));
  d_awal DATE := make_date(p_tahun, p_bulan, 1);
  d_akhr DATE := (make_date(p_tahun, p_bulan, 1) + INTERVAL '1 month')::date;
  t_awal TIMESTAMPTZ := make_date(p_tahun, p_bulan, 1)::timestamp AT TIME ZONE 'Asia/Makassar';
  t_akhr TIMESTAMPTZ := (make_date(p_tahun, p_bulan, 1) + INTERVAL '1 month')::timestamp AT TIME ZONE 'Asia/Makassar';
BEGIN
  RETURN QUERY
  SELECT 'perabasan'::text, row_number() OVER (ORDER BY i.penyulang, w.tgl_wo, i.urutan)::int,
         i.segmen_nama, NULL::text, i.panjang_km, i.keterangan, COALESCE(i.pelaksana, i.regu), NULL::date,
         i.penyulang, NULL::numeric, NULL::text
  FROM public.wo_perabasan_item i JOIN public.wo_perabasan w ON w.id = i.wo_id
  WHERE w.status <> 'Dibatalkan' AND i.status <> 'Dibatalkan'
    AND w.tgl_wo >= d_awal AND w.tgl_wo < d_akhr AND upper(w.ulp) = u;

  RETURN QUERY
  SELECT 'hargardu'::text, row_number() OVER (ORDER BY r.penyulang, r.urutan)::int,
         r.gardu_kode, r.alamat, NULL::numeric, it.keterangan, it.pelaksana, NULL::date,
         r.penyulang, gd.daya::numeric, NULL::text
  FROM public.wo_hargardu_realisasi r
  JOIN public.wo_hargardu_item it ON it.id = r.id
  LEFT JOIN public.gardu gd ON upper(gd.kode) = upper(r.gardu_kode) AND upper(gd.ulp) = upper(r.ulp)
  WHERE r.tahun = p_tahun AND r.bulan = p_bulan AND upper(r.ulp) = u;

  RETURN QUERY
  SELECT 'optimasi'::text, row_number() OVER (ORDER BY pg.wo_sent_at)::int,
         pg.no_gardu, pg.alamat, NULL::numeric, NULL::text, NULL::text, NULL::date,
         pg.penyulang, gd.daya::numeric, NULL::text
  FROM public.pengukuran_gardu pg
  LEFT JOIN public.gardu gd ON upper(gd.kode) = upper(pg.no_gardu) AND upper(gd.ulp) = upper(pg.petugas_unit)
  WHERE pg.jenis_pemeliharaan = 'OPTIMASI TRAFO'
    AND pg.wo_bulan = d_awal   -- ★ Bulan WO, bukan tanggal tombol ditekan
    AND upper(pg.petugas_unit) = u
    AND NOT EXISTS (SELECT 1 FROM public.optimasi_wo_batal b WHERE b.pengukuran_id::text = pg.id::text);

  -- ★ Penyeimbangan dari anomali pengukuran — gardu yang sudah ada di tempelan
  -- bulan itu tidak diulang (tempelan yang tampil, dengan pelaksananya).
  RETURN QUERY
  SELECT 'penyeimbangan'::text, row_number() OVER (ORDER BY a.penyulang, a.no_gardu)::int,
         a.no_gardu, a.alamat, NULL::numeric, NULL::text, NULL::text, NULL::date,
         a.penyulang, a.daya, NULL::text
  FROM (
    SELECT DISTINCT ON (upper(pg.no_gardu)) pg.no_gardu, pg.alamat, pg.penyulang, gd.daya::numeric AS daya
    FROM public.pengukuran_gardu pg
    LEFT JOIN public.gardu gd ON upper(gd.kode) = upper(pg.no_gardu) AND upper(gd.ulp) = upper(pg.petugas_unit)
    WHERE pg.jenis_pemeliharaan = 'PEMERATAAN BEBAN'
      AND pg.hasil_penyeimbangan_id IS NULL
      AND pg.wo_bulan = d_awal
      AND upper(pg.petugas_unit) = u
      AND NOT public._gardu_di_tempelan('penyeimbangan', u, pg.wo_bulan, pg.no_gardu)
    ORDER BY upper(pg.no_gardu), pg.wo_sent_at DESC
  ) a;

  RETURN QUERY
  SELECT 'pengukuran'::text, row_number() OVER (ORDER BY r.penyulang, r.urutan)::int,
         r.kode_gardu, r.alamat, NULL::numeric, it.keterangan, it.pelaksana, NULL::date,
         r.penyulang, r.kva_master, NULL::text
  FROM public.wo_pengukuran_realisasi r
  JOIN public.wo_pengukuran_item it ON it.id = r.id
  WHERE r.tahun = p_tahun AND r.bulan = p_bulan AND upper(r.ulp) = u;

  -- Inspeksi JTM (WO sistem, lalu tempelan yang belum di master) & JTR.
  RETURN QUERY
  SELECT lower(w.jenis), row_number() OVER (PARTITION BY w.jenis ORDER BY i.penyulang, i.urutan)::int,
         COALESCE(i.gardu_kode, i.objek_nama), NULL::text,
         i.panjang_km, i.keterangan, COALESCE(i.pelaksana, i.regu), NULL::date,
         i.penyulang, NULL::numeric, NULL::text
  FROM public.wo_inspeksi_item i JOIN public.wo_inspeksi w ON w.id = i.wo_id
  WHERE i.status <> 'Dibatalkan'
    AND w.tgl_wo >= d_awal AND w.tgl_wo < d_akhr AND upper(i.ulp) = u;

  RETURN QUERY
  SELECT m.jenis, 100000 + i.urutan, i.objek, i.alamat, i.km, i.keterangan, i.pelaksana, i.tgl_rencana,
         i.penyulang, i.kva, i.uraian
  FROM public.wo_manual_item i JOIN public.wo_manual m ON m.id = i.wo_id
  WHERE m.ulp = u AND m.tahun = p_tahun AND m.bulan = p_bulan;
END $$;
GRANT EXECUTE ON FUNCTION public.wo_surat_objek(TEXT, INT, INT) TO authenticated;


-- ── 5. Rekap Kinerja ─────────────────────────────────────────────────────────
-- Disalin dari `wo-tempel-semua.sql`; yang berubah ditandai ★.
CREATE OR REPLACE FUNCTION public._rekap_kinerja_inti(p_ulp TEXT, p_tahun INT, p_bulan INT)
RETURNS TABLE (kunci TEXT, wo_terbit NUMERIC, realisasi NUMERIC, belum_disetujui NUMERIC, luar_wo NUMERIC)
LANGUAGE plpgsql STABLE SET search_path = public AS $$
DECLARE
  u      TEXT := NULLIF(NULLIF(upper(btrim(COALESCE(p_ulp, ''))), ''), 'SEMUA');
  d_awal DATE := make_date(p_tahun, CASE WHEN p_bulan = 0 THEN 1 ELSE p_bulan END, 1);
  d_akhr DATE;
  t_awal TIMESTAMPTZ;
  t_akhr TIMESTAMPTZ;
  jadi   NUMERIC;
  sistem NUMERIC;
  tempel NUMERIC;
  anomali NUMERIC;
BEGIN
  d_akhr := CASE WHEN p_bulan = 0 THEN make_date(p_tahun + 1, 1, 1)
                 ELSE (d_awal + INTERVAL '1 month')::date END;
  t_awal := d_awal::timestamp AT TIME ZONE 'Asia/Makassar';
  t_akhr := d_akhr::timestamp AT TIME ZONE 'Asia/Makassar';

  RETURN QUERY
  SELECT 'perabasan'::text, round(COALESCE(sum(c.target_km), 0), 3), round(COALESCE(sum(c.capaian_km), 0), 3), 0::numeric,
    (SELECT count(*)::numeric FROM public.perabasan_luar_wo l
      WHERE l.status IN ('Selesai', 'Diverifikasi')
        AND l.tgl >= d_awal AND l.tgl < d_akhr
        AND (u IS NULL OR upper(l.ulp_regu) = u))
  FROM public.wo_perabasan_capaian c
  WHERE c.tgl_wo::date >= d_awal AND c.tgl_wo::date < d_akhr
    AND c.status <> 'Dibatalkan'   -- ★ WO yang dibatalkan tidak dihitung terbit
    AND (u IS NULL OR upper(c.ulp) = u);

  RETURN QUERY
  SELECT 'harjtm'::text, public._wo_manual_total(u, p_tahun, p_bulan, 'harjtm', false, false),
    count(*)::numeric, count(*) FILTER (WHERE j.status = 'Selesai')::numeric,
    count(*) FILTER (WHERE j.inspeksi_id IS NOT NULL)::numeric
  FROM public.pemeliharaan_jaringan j
  WHERE j.status NOT IN ('Dibatalkan', 'Dikembalikan')
    AND j.tgl::date >= d_awal AND j.tgl::date < d_akhr
    AND (u IS NULL OR upper(j.ulp) = u);

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

  -- ★ WO Penyeimbangan = tempelan + WO dari anomali pengukuran (Bulan WO).
  -- Gardu yang ada di keduanya pada bulan yang sama dihitung sekali; gardu
  -- yang di-WO dua kali dari anomali dalam sebulan juga sekali.
  tempel := public._wo_manual_total(u, p_tahun, p_bulan, 'penyeimbangan', false, false);
  SELECT count(DISTINCT (pg.wo_bulan, upper(pg.petugas_unit), upper(pg.no_gardu))) INTO anomali
    FROM public.pengukuran_gardu pg
   WHERE pg.jenis_pemeliharaan = 'PEMERATAAN BEBAN'
     AND pg.hasil_penyeimbangan_id IS NULL
     AND pg.wo_bulan >= d_awal AND pg.wo_bulan < d_akhr
     AND (u IS NULL OR upper(pg.petugas_unit) = u)
     AND NOT public._gardu_di_tempelan('penyeimbangan', upper(pg.petugas_unit), pg.wo_bulan, pg.no_gardu);

  RETURN QUERY
  SELECT 'penyeimbangan'::text,
    CASE WHEN tempel IS NULL AND anomali = 0 THEN NULL ELSE COALESCE(tempel, 0) + anomali END,
    count(*)::numeric, NULL::numeric, NULL::numeric
  FROM public.penyeimbangan_gardu p
  WHERE p.created_at >= t_awal AND p.created_at < t_akhr
    AND (u IS NULL OR upper(p.ulp) = u);

  RETURN QUERY
  SELECT 'optimasi'::text,
    (SELECT count(*)::numeric FROM public.pengukuran_gardu pg
      WHERE pg.jenis_pemeliharaan = 'OPTIMASI TRAFO'
        AND pg.wo_bulan >= d_awal AND pg.wo_bulan < d_akhr   -- ★ Bulan WO
        AND (u IS NULL OR upper(pg.petugas_unit) = u)
        AND NOT EXISTS (SELECT 1 FROM public.optimasi_wo_batal b WHERE b.pengukuran_id::text = pg.id::text)),
    count(*)::numeric,
    count(*) FILTER (WHERE o.status = 'Selesai')::numeric,
    NULL::numeric
  FROM public.optimasi_trafo o
  WHERE o.status NOT IN ('Dibatalkan', 'Dikembalikan')
    AND o.tgl_operasi::date >= d_awal AND o.tgl_operasi::date < d_akhr
    AND (u IS NULL OR upper(o.ulp) = u);

  RETURN QUERY
  SELECT 'pengukuran'::text, count(*)::numeric,
    count(*) FILTER (WHERE r.terealisasi)::numeric,
    count(*) FILTER (WHERE r.tertahan)::numeric, NULL::numeric
  FROM public.wo_pengukuran_realisasi r
  WHERE r.tahun = p_tahun AND (p_bulan = 0 OR r.bulan = p_bulan)
    AND (u IS NULL OR upper(r.ulp) = u);

  -- ★ Inspeksi JTM Tier 1: WO sistem (termasuk tempelan yang cocok master)
  -- DITAMBAH tempelan yang segmennya belum di master. NULL kalau dua-duanya tidak ada.
  SELECT round(sum(i.panjang_km), 3) INTO sistem
    FROM public.wo_inspeksi_item i JOIN public.wo_inspeksi w ON w.id = i.wo_id
   WHERE w.jenis = 'JTM' AND i.status <> 'Dibatalkan'
     AND w.tgl_wo >= d_awal AND w.tgl_wo < d_akhr
     AND (u IS NULL OR upper(i.ulp) = u);
  tempel := public._wo_manual_total(u, p_tahun, p_bulan, 'jtm', true, false);

  RETURN QUERY
  SELECT 'jtm'::text,
    CASE WHEN sistem IS NULL AND tempel IS NULL THEN 0::numeric ELSE COALESCE(sistem, 0) + COALESCE(tempel, 0) END,
    round(COALESCE(sum(sp.panjang_pakai_km) FILTER (WHERE m.status IN ('Selesai', 'Diverifikasi')), 0), 3),
    round(COALESCE(sum(sp.panjang_pakai_km) FILTER (WHERE m.status = 'Selesai'), 0), 3),
    round(COALESCE(sum(sp.panjang_pakai_km) FILTER (
      WHERE m.status IN ('Selesai', 'Diverifikasi') AND m.wo_item_id IS NULL), 0), 3)
  FROM public.inspeksi_jtm m
  LEFT JOIN public.segmen_panjang sp ON sp.segmen_id = m.segmen_id
  WHERE m.created_at >= t_awal AND m.created_at < t_akhr
    AND m.tier = '1'
    AND (u IS NULL OR upper(m.ulp) = u);

  RETURN QUERY
  SELECT 'jtm2'::text,
    public._wo_manual_total(u, p_tahun, p_bulan, 'jtm2', true, false),
    public._wo_manual_total(u, p_tahun, p_bulan, 'jtm2', true, true),
    NULL::numeric, NULL::numeric;

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


-- ── Periksa ──────────────────────────────────────────────────────────────────
--   SELECT jenis_pemeliharaan, wo_bulan, count(*) FROM pengukuran_gardu
--    WHERE wo_sent_at IS NOT NULL GROUP BY 1, 2 ORDER BY 2, 1;
--   SELECT * FROM rekap_kinerja('AMPENAN', 2026, 9);
--   SELECT * FROM rekap_kinerja('AMPENAN', 2026, 10);
