-- =============================================================================
-- P3 (28 Sep 2026) — WO Pemeliharaan disusun dari Rencana Pemeliharaan
-- Jalankan manual di Supabase SQL Editor, SESUDAH `rencana-hargardu.sql`.
-- Idempoten.
--
-- Keputusan user:
--   • WO bulan yang ada rencananya = rencana bulan itu ("Sesuai rencana ULP")
--     + sisa WO bulan lalu yang belum dikerjakan ("Sisa bulan lalu") — gardu
--     yang tertinggal tidak tercecer, berantai sampai dikerjakan. Kuota tidak
--     memotong isinya.
--   • Terbit OTOMATIS tanggal 1, 00.05 WITA (pg_cron) untuk ULP yang punya
--     rencana bulan itu. Tombol Terbitkan tetap ada sebagai cadangan dan memakai
--     fungsi yang SAMA, jadi hasilnya selalu sama.
--   • Bulan tanpa rencana: tidak berubah — rekomendasi sistem, manual.
-- =============================================================================


-- ── 1. Alasan baru ───────────────────────────────────────────────────────────
ALTER TABLE public.wo_hargardu_item DROP CONSTRAINT IF EXISTS wo_hargardu_item_alasan_check;
ALTER TABLE public.wo_hargardu_item ADD CONSTRAINT wo_hargardu_item_alasan_check
  CHECK (alasan IN ('belum_pernah', 'jatuh_tempo', 'rencana', 'sisa'));


-- ── 2. Penyusun (bagian dalam, TANPA penjaga hak) ────────────────────────────
-- Dipanggil pembungkus bertombol (dijaga hak ULP) dan penjadwal. Tidak boleh
-- dipanggil langsung dari aplikasi — hak eksekusinya dicabut di bawah.
CREATE OR REPLACE FUNCTION public._susun_wo_hargardu_rencana(p_ulp TEXT, p_tahun INT, p_bulan INT, p_oleh UUID)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_tgl     DATE := make_date(p_tahun, p_bulan, 1);
  v_lalu    DATE := (make_date(p_tahun, p_bulan, 1) - interval '1 month')::date;
  v_id      UUID := gen_random_uuid();
  v_rencana INT;
  v_sisa    INT;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('wo-hargardu|' || p_ulp || '|' || v_tgl));

  IF EXISTS (SELECT 1 FROM public.wo_hargardu WHERE ulp = p_ulp AND tahun = p_tahun AND bulan = p_bulan) THEN
    RAISE EXCEPTION 'WO Pemeliharaan % %-% sudah terbit.', p_ulp, lpad(p_bulan::text, 2, '0'), p_tahun;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.rencana_hargardu WHERE ulp = p_ulp AND tahun = p_tahun AND bulan = p_bulan) THEN
    RAISE EXCEPTION 'Tidak ada Rencana Pemeliharaan % untuk %-%.', p_ulp, lpad(p_bulan::text, 2, '0'), p_tahun;
  END IF;

  -- Header dulu (kuota diperbarui setelah baris tersusun).
  INSERT INTO public.wo_hargardu (id, ulp, bulan, tahun, tgl_wo, kuota, kriteria, created_by)
  VALUES (v_id, p_ulp, p_bulan, p_tahun, v_tgl, 0, '{}'::jsonb, p_oleh);

  WITH rencana AS (
    SELECT DISTINCT upper(r.gardu_kode) AS k
    FROM public.rencana_hargardu r
    WHERE r.ulp = p_ulp AND r.tahun = p_tahun AND r.bulan = p_bulan
  ),
  -- Sisa = baris WO bulan lalu yang belum Selesai/Diverifikasi di jendelanya.
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
         -- Sama dengan umurBulan() di web: selisih bulan, dikurangi satu bila
         -- tanggalnya belum sampai.
         CASE WHEN t.t IS NOT NULL THEN greatest(0,
           (extract(year FROM v_tgl) - extract(year FROM t.t))::int * 12
           + (extract(month FROM v_tgl) - extract(month FROM t.t))::int
           - CASE WHEN extract(day FROM v_tgl) < extract(day FROM t.t) THEN 1 ELSE 0 END) END,
         row_number() OVER (ORDER BY p.grup, m.penyulang NULLS LAST, m.kode)
  FROM pilih p
  JOIN master m ON m.k = p.k            -- gardu yang sudah dihapus dari master tidak ikut
  LEFT JOIN terakhir t ON t.k = p.k;

  SELECT count(*) FILTER (WHERE alasan = 'rencana'), count(*) FILTER (WHERE alasan = 'sisa')
  INTO v_rencana, v_sisa
  FROM public.wo_hargardu_item WHERE wo_id = v_id;

  UPDATE public.wo_hargardu
  SET kuota = v_rencana + v_sisa,
      kriteria = jsonb_build_object('sumber', 'rencana', 'rencana', v_rencana, 'sisa', v_sisa,
                                    'otomatis', p_oleh IS NULL)
  WHERE id = v_id;

  RETURN jsonb_build_object('wo_id', v_id, 'rencana', v_rencana, 'sisa', v_sisa);
END $$;
REVOKE ALL ON FUNCTION public._susun_wo_hargardu_rencana(TEXT, INT, INT, UUID) FROM PUBLIC, anon, authenticated;


-- ── 3. Tombol "Terbitkan WO" (dijaga hak ULP) ────────────────────────────────
CREATE OR REPLACE FUNCTION public.terbitkan_wo_hargardu_rencana(p_ulp TEXT, p_tahun INT, p_bulan INT)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_ulp TEXT := upper(btrim(COALESCE(p_ulp, '')));
BEGIN
  PERFORM public.wajib_boleh_ulp(v_ulp);
  RETURN public._susun_wo_hargardu_rencana(v_ulp, p_tahun, p_bulan, auth.uid());
END $$;
GRANT EXECUTE ON FUNCTION public.terbitkan_wo_hargardu_rencana(TEXT, INT, INT) TO authenticated;


-- ── 4. Penerbitan otomatis ───────────────────────────────────────────────────
-- Semua ULP yang punya rencana di bulan berjalan (WITA) dan WO-nya belum
-- terbit. Satu ULP gagal tidak menggagalkan yang lain; hasilnya dikembalikan
-- sebagai teks (terbaca di cron.job_run_details).
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
      AND NOT EXISTS (SELECT 1 FROM public.wo_hargardu w WHERE w.ulp = r.ulp AND w.tahun = v_th AND w.bulan = v_bl)
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


-- ── 5. Jadwal: tanggal 1, 00.05 WITA ─────────────────────────────────────────
-- pg_cron memakai UTC dan tidak bisa menyatakan "tanggal 1 WITA" (= 16.05 UTC
-- hari terakhir bulan sebelumnya). Jadi jalan tiap hari 16.05 UTC dan hanya
-- bertindak saat tanggal WITA = 1. Gagal karena apa pun: tombol Terbitkan WO.
-- Kalau baris ini ditolak: aktifkan pg_cron sekali di Dashboard → Database →
-- Extensions, lalu jalankan ulang skrip ini.
CREATE EXTENSION IF NOT EXISTS pg_cron;

SELECT cron.unschedule(jobid) FROM cron.job WHERE jobname = 'wo-hargardu-rencana';
SELECT cron.schedule(
  'wo-hargardu-rencana',
  '5 16 * * *',
  $$SELECT CASE WHEN extract(day FROM (now() AT TIME ZONE 'Asia/Makassar')) = 1
               THEN public.terbitkan_wo_hargardu_otomatis() END$$
);


-- ── Periksa ──────────────────────────────────────────────────────────────────
--   SELECT jobname, schedule, active FROM cron.job WHERE jobname = 'wo-hargardu-rencana';
--   SELECT status, return_message, start_time FROM cron.job_run_details
--     WHERE jobid = (SELECT jobid FROM cron.job WHERE jobname = 'wo-hargardu-rencana')
--     ORDER BY start_time DESC LIMIT 5;
