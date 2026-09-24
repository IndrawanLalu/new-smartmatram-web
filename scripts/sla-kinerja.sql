-- =============================================================================
-- SLA Rekap Kinerja (permintaan user 25 Sep 2026)
-- Jalankan manual di Supabase SQL Editor, SESUDAH `wo-inspeksi-jtm.sql`.
-- Idempoten.
--
-- SLA = target bulanan per ULP per jenis pekerjaan — pembanding untuk
-- pekerjaan yang belum (atau tidak) ber-WO. Keputusan user:
--   • angka BULANAN, berlaku mulai bulan X sampai diubah — mengubahnya tidak
--     menulis ulang bulan-bulan sebelumnya
--   • berlaku untuk KEDELAPAN jenis pekerjaan
--   • diisi UP3 (semua ULP) atau admin ULP itu sendiri
--   • Capaian SLA = SEMUA realisasi (WO + di luar WO) ÷ SLA
--
--   1. tabel sla_kinerja + simpan_sla_kinerja
--   2. sla_rekap — SLA sebuah periode (jumlah per bulan, per ULP)
--   3. rekap_kinerja mendapat kolom `sla`; isi lamanya dipindah utuh ke
--      `_rekap_kinerja_inti` (perubahan rekap berikutnya cukup di sana)
-- =============================================================================


-- ── 1. Tabel & penyimpan ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.sla_kinerja (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ulp           TEXT NOT NULL,
  kunci         TEXT NOT NULL,          -- sama dengan kunci baris rekap_kinerja
  berlaku_mulai DATE NOT NULL,          -- selalu tanggal 1
  target        NUMERIC(10,3),          -- NULL = tanpa SLA mulai bulan ini
  oleh          TEXT,
  oleh_uid      UUID,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (ulp, kunci, berlaku_mulai)
);
ALTER TABLE public.sla_kinerja DROP CONSTRAINT IF EXISTS sla_kinerja_kunci_valid;
ALTER TABLE public.sla_kinerja ADD CONSTRAINT sla_kinerja_kunci_valid
  CHECK (kunci IN ('perabasan', 'harjtm', 'hargardu', 'penyeimbangan', 'optimasi', 'pengukuran', 'jtm', 'jtr'));
ALTER TABLE public.sla_kinerja DROP CONSTRAINT IF EXISTS sla_kinerja_awal_bulan;
ALTER TABLE public.sla_kinerja ADD CONSTRAINT sla_kinerja_awal_bulan
  CHECK (extract(day FROM berlaku_mulai) = 1);
ALTER TABLE public.sla_kinerja DROP CONSTRAINT IF EXISTS sla_kinerja_target_valid;
ALTER TABLE public.sla_kinerja ADD CONSTRAINT sla_kinerja_target_valid
  CHECK (target IS NULL OR target >= 0);

COMMENT ON TABLE public.sla_kinerja IS
  'SLA bulanan per ULP per jenis pekerjaan, berlaku mulai bulan tertentu sampai diganti baris yang lebih baru. Riwayatnya tidak ditimpa.';

ALTER TABLE public.sla_kinerja ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS sla_kinerja_baca ON public.sla_kinerja;
CREATE POLICY sla_kinerja_baca ON public.sla_kinerja FOR SELECT TO authenticated USING (true);
GRANT SELECT ON public.sla_kinerja TO authenticated;
-- Penulisan HANYA lewat simpan_sla_kinerja.

-- p_isi: {"harjtm": 20, "jtm": 12.5, "jtr": null, ...} — hanya kunci yang
-- disebut yang disimpan; null = "tanpa SLA mulai bulan ini".
CREATE OR REPLACE FUNCTION public.simpan_sla_kinerja(
  p_ulp           TEXT,
  p_berlaku_mulai DATE,
  p_isi           JSONB,
  p_oleh          TEXT DEFAULT NULL
) RETURNS INT
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  unit  TEXT := upper(btrim(COALESCE(p_ulp, '')));
  awal  DATE := date_trunc('month', p_berlaku_mulai)::date;
  k     TEXT;
  v     JSONB;
  n     INT := 0;
BEGIN
  IF unit = '' THEN RAISE EXCEPTION 'ULP belum dipilih'; END IF;
  IF p_berlaku_mulai IS NULL THEN RAISE EXCEPTION 'Bulan berlaku belum dipilih'; END IF;
  PERFORM public.wajib_boleh_ulp(unit);

  FOR k, v IN SELECT * FROM jsonb_each(COALESCE(p_isi, '{}'::jsonb)) LOOP
    IF jsonb_typeof(v) NOT IN ('number', 'null') THEN
      RAISE EXCEPTION 'SLA % harus angka.', k;
    END IF;
    INSERT INTO public.sla_kinerja (ulp, kunci, berlaku_mulai, target, oleh, oleh_uid)
    VALUES (unit, k, awal, CASE WHEN jsonb_typeof(v) = 'null' THEN NULL ELSE (v #>> '{}')::numeric END,
            p_oleh, auth.uid())
    ON CONFLICT (ulp, kunci, berlaku_mulai) DO UPDATE
      SET target = EXCLUDED.target, oleh = EXCLUDED.oleh, oleh_uid = EXCLUDED.oleh_uid, updated_at = now();
    n := n + 1;
  END LOOP;

  INSERT INTO public.master_audit
    (entitas, entitas_kode, ulp, field, nilai_lama, nilai_baru, aksi, oleh_uid, oleh_nama)
  VALUES ('sla_kinerja', to_char(awal, 'YYYY-MM'), unit, 'sla', NULL, p_isi, 'sunting_admin', auth.uid(), p_oleh);

  RETURN n;
END $fn$;

GRANT EXECUTE ON FUNCTION public.simpan_sla_kinerja(TEXT, DATE, JSONB, TEXT) TO authenticated;


-- ── 2. SLA sebuah periode ────────────────────────────────────────────────────
-- Per ULP per bulan diambil baris yang berlaku (berlaku_mulai terakhir ≤ awal
-- bulan), lalu dijumlah. "Seluruh tahun" = jumlah bulanannya; untuk tahun
-- berjalan hanya sampai bulan ini, supaya capaian pertengahan tahun tidak
-- dibandingkan dengan target dua belas bulan. NULL = belum ada SLA sama sekali.
CREATE OR REPLACE FUNCTION public.sla_rekap(p_ulp TEXT, p_kunci TEXT, p_tahun INT, p_bulan INT)
RETURNS NUMERIC
LANGUAGE sql STABLE SET search_path = public AS $fn$
  WITH kini AS (
    SELECT (now() AT TIME ZONE 'Asia/Makassar')::date AS hari
  ), bln AS (
    SELECT make_date(p_tahun, m, 1) AS awal
    FROM kini, generate_series(
      CASE WHEN p_bulan = 0 THEN 1 ELSE p_bulan END,
      CASE WHEN p_bulan <> 0 THEN p_bulan
           WHEN p_tahun = extract(year FROM kini.hari)::int THEN extract(month FROM kini.hari)::int
           ELSE 12 END) m
  ), unit AS (
    SELECT DISTINCT ulp FROM public.sla_kinerja
    WHERE kunci = p_kunci AND (p_ulp IS NULL OR ulp = p_ulp)
  )
  SELECT sum((
    SELECT s.target FROM public.sla_kinerja s
    WHERE s.ulp = u.ulp AND s.kunci = p_kunci AND s.berlaku_mulai <= b.awal
    ORDER BY s.berlaku_mulai DESC LIMIT 1))
  FROM unit u CROSS JOIN bln b;
$fn$;

GRANT EXECUTE ON FUNCTION public.sla_rekap(TEXT, TEXT, INT, INT) TO authenticated;


-- ── 3. rekap_kinerja + kolom sla ─────────────────────────────────────────────
-- Isi lama DIPINDAH utuh (disalin dari `wo-inspeksi-jtm.sql`) ke
-- `_rekap_kinerja_inti`; `rekap_kinerja` tinggal membungkus dan menambah SLA.
-- Kolom baru di BELAKANG — web & HP versi lama tetap membaca kolom lamanya.
DROP FUNCTION IF EXISTS public.rekap_kinerja(TEXT, INT, INT);
DROP FUNCTION IF EXISTS public._rekap_kinerja_inti(TEXT, INT, INT);

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
  -- `luar_wo` = pohon dirabas DI LUAR WO (tanpa segmen, tanpa km), dihitung
  -- untuk ULP REGU yang mengerjakan (keputusan user 25 Sep 2026).
  RETURN QUERY
  SELECT 'perabasan'::text, round(COALESCE(sum(c.target_km), 0), 3), round(COALESCE(sum(c.capaian_km), 0), 3), 0::numeric,
    (SELECT count(*)::numeric FROM public.perabasan_luar_wo l
      WHERE l.status IN ('Selesai', 'Diverifikasi')
        AND l.tgl >= d_awal AND l.tgl < d_akhr
        AND (u IS NULL OR upper(l.ulp_regu) = u))
  FROM public.wo_perabasan_capaian c
  WHERE c.tgl_wo::date >= d_awal AND c.tgl_wo::date < d_akhr
    AND (u IS NULL OR upper(c.ulp) = u);

  -- Pemeliharaan Jaringan — tanpa WO (keputusan user 25 Sep 2026).
  -- `luar_wo` di baris INI = berapa dari realisasi itu yang berasal dari
  -- TUGAS temuan (bukan "di luar WO") — layar menuliskannya tersendiri.
  -- Yang dikembalikan ke petugas tidak dihitung sampai dikirim ulang.
  RETURN QUERY
  SELECT 'harjtm'::text, NULL::numeric, count(*)::numeric, count(*) FILTER (WHERE j.status = 'Selesai')::numeric,
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

  -- Penyeimbangan — tanpa WO, tanpa persetujuan.
  RETURN QUERY
  SELECT 'penyeimbangan'::text, NULL::numeric, count(*)::numeric, NULL::numeric, NULL::numeric
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
  -- Dikembalikan ke petugas = belum realisasi sampai dikirim ulang.
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

  -- Inspeksi JTM — km segmen yang inspeksinya selesai.
  -- WO terbit = km segmen dalam WO inspeksi JTM yang terbit di periode ini
  -- (keputusan a, `rencana-mobile-jtm-jtr.md`). `luar_wo` = km yang selesai
  -- TANPA WO — disebut terpisah (keputusan e), karena selama master tiang
  -- dibangun justru bagian inilah yang terbesar.
  RETURN QUERY
  SELECT 'jtm'::text,
    (SELECT round(COALESCE(sum(i.panjang_km), 0), 3)
       FROM public.wo_inspeksi_item i
       JOIN public.wo_inspeksi w ON w.id = i.wo_id
      WHERE w.jenis = 'JTM' AND i.status <> 'Dibatalkan'
        AND w.tgl_wo >= d_awal AND w.tgl_wo < d_akhr
        AND (u IS NULL OR upper(i.ulp) = u)),
    round(COALESCE(sum(sp.panjang_pakai_km) FILTER (WHERE m.status IN ('Selesai', 'Diverifikasi')), 0), 3),
    round(COALESCE(sum(sp.panjang_pakai_km) FILTER (WHERE m.status = 'Selesai'), 0), 3),
    round(COALESCE(sum(sp.panjang_pakai_km) FILTER (
      WHERE m.status IN ('Selesai', 'Diverifikasi') AND m.wo_item_id IS NULL), 0), 3)
  FROM public.inspeksi_jtm m
  LEFT JOIN public.segmen_panjang sp ON sp.segmen_id = m.segmen_id
  WHERE m.created_at >= t_awal AND m.created_at < t_akhr
    AND (u IS NULL OR upper(m.ulp) = u);

  -- Inspeksi JTR — km penghantar gardu (termasuk underbuild), kode + ULP.
  RETURN QUERY
  SELECT 'jtr'::text, NULL::numeric,
    round(COALESCE(sum(pj.km) FILTER (WHERE r.status IN ('Selesai', 'Diverifikasi')), 0), 3),
    round(COALESCE(sum(pj.km) FILTER (WHERE r.status = 'Selesai'), 0), 3),
    NULL::numeric
  FROM public.inspeksi_jtr r
  LEFT JOIN LATERAL (
    SELECT sum(g.panjang_km) AS km FROM public.gardu_jtr_penghantar g
    WHERE g.gardu_kode = r.gardu_kode AND g.ulp = r.ulp
  ) pj ON true
  WHERE r.created_at >= t_awal AND r.created_at < t_akhr
    AND (u IS NULL OR upper(r.ulp) = u);
END $$;

CREATE OR REPLACE FUNCTION public.rekap_kinerja(p_ulp TEXT, p_tahun INT, p_bulan INT)
RETURNS TABLE (kunci TEXT, wo_terbit NUMERIC, realisasi NUMERIC, belum_disetujui NUMERIC, luar_wo NUMERIC, sla NUMERIC)
LANGUAGE sql STABLE SET search_path = public AS $fn$
  SELECT r.kunci, r.wo_terbit, r.realisasi, r.belum_disetujui, r.luar_wo,
         public.sla_rekap(NULLIF(NULLIF(upper(btrim(COALESCE(p_ulp, ''))), ''), 'SEMUA'), r.kunci, p_tahun, p_bulan)
  FROM public._rekap_kinerja_inti(p_ulp, p_tahun, p_bulan) r;
$fn$;

GRANT EXECUTE ON FUNCTION public._rekap_kinerja_inti(TEXT, INT, INT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rekap_kinerja(TEXT, INT, INT) TO authenticated;


-- ── Periksa ──────────────────────────────────────────────────────────────────
--   SELECT * FROM rekap_kinerja(NULL, 2026, 9);
--   SELECT * FROM sla_kinerja ORDER BY ulp, kunci, berlaku_mulai;
