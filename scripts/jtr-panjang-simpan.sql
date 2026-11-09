-- =============================================================================
-- Angka JTR per gardu DISIMPAN, bukan dihitung ulang tiap dibaca (9 Nov 2026).
--
-- Gejala: timeout (57014) di menu JTR, Rekap Kinerja, Susun WO, HP Inspeksi
-- JTR — paling sering akun UP3 (tanpa saringan ULP). pg_stat_statements:
-- rekap_kinerja 13.047× rata 532 ms (beban terbesar), master_gardu_jtr 1,5 dtk,
-- jtr_inspeksi 1,6–2,9 dtk untuk 418 baris.
--
-- Akarnya: gardu_jtr_panjang & gardu_jtr_penghantar dibangun dari tiang_gawang
-- + tiang_gawang_kabel (jarak per tiang, DISTINCT ON, EXISTS bertingkat ke
-- jtr_kabel, join upper()). Satu kali hitung 1,3–9 dtk, DAN saringan gardu/ulp
-- tidak bisa didorong masuk (CTE dipakai dua kali → dimaterialkan), jadi
-- `gardu_kode=eq.AM104` pun 1,8–8,8 dtk. Lalu view lain memanggilnya PER BARIS
-- (jtr_inspeksi.panjang_km, LATERAL di _rekap_kinerja_inti/realisasi_*) →
-- jtr_inspeksi?select=panjang_km = 10,8 dtk.
--
-- Perbaikan: angka itu hanya berubah kalau data tiang/kabel/gardu berubah.
--   • Hitungan asli dipindah ke _gardu_jtr_panjang_hitung / _gardu_jtr_penghantar_hitung
--     (definisi DISALIN dari database, bukan dari berkas — pasti sama).
--   • Hasilnya disimpan di *_simpan; gardu_jtr_panjang & gardu_jtr_penghantar
--     kini membaca simpanan. Nama, kolom, tipe SAMA → web, HP, view & fungsi
--     turunan tidak diubah.
--   • Tiap perubahan tiang/kabel/tumpang/jurusan/gardu menulis satu baris
--     "kotor"; pg_cron tiap menit menyegarkan simpanan kalau ada yang kotor.
--     Angka di layar paling lambat ±1 menit tertinggal.
--   • Yang MEMBEKUKAN km (setuju, KMS WO saat dikirim) tetap memakai hitungan
--     langsung lewat _jtr_km_gardu — tidak boleh tertinggal 1 menit pun.
--
-- ⚠ Menjalankan ulang skrip lama yang `CREATE OR REPLACE VIEW gardu_jtr_panjang`
--   / `gardu_jtr_penghantar` dengan hitungan asli = kembali lambat (tanpa galat).
--   Sesudahnya jalankan ulang skrip ini: hitungan baru disalin ke *_hitung.
-- Idempoten (aman diulang). Jalankan utuh di SQL Editor (satu transaksi).
-- =============================================================================


-- ── 1. Hitungan asli → *_hitung ─────────────────────────────────────────────
-- Disalin dari definisi yang sedang berlaku. Kalau view publiknya sudah
-- membaca simpanan (skrip ini pernah jalan), salinan lama dibiarkan.
DO $$
DECLARE
  v TEXT;
  def TEXT;
BEGIN
  FOREACH v IN ARRAY ARRAY['gardu_jtr_panjang', 'gardu_jtr_penghantar'] LOOP
    def := pg_get_viewdef(('public.' || v)::regclass, true);
    IF def NOT LIKE '%' || v || '_simpan%' THEN
      EXECUTE format('CREATE OR REPLACE VIEW public.%I AS %s',
                     '_' || v || '_hitung', regexp_replace(def, ';\s*$', ''));
    END IF;
  END LOOP;
END $$;

REVOKE ALL ON public._gardu_jtr_panjang_hitung    FROM anon, authenticated;
REVOKE ALL ON public._gardu_jtr_penghantar_hitung FROM anon, authenticated;


-- ── 2. Tabel simpanan ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.gardu_jtr_panjang_simpan AS
  SELECT * FROM public._gardu_jtr_panjang_hitung WITH NO DATA;
CREATE TABLE IF NOT EXISTS public.gardu_jtr_penghantar_simpan AS
  SELECT * FROM public._gardu_jtr_penghantar_hitung WITH NO DATA;
-- Jumlah tiang JTR aktif per gardu (termasuk batang pinjaman) — dulu dihitung
-- per baris di master_gardu_jtr & inspeksi_jtr_kelengkapan.
CREATE TABLE IF NOT EXISTS public.gardu_jtr_tiang_simpan (
  gardu_kode TEXT,
  ulp        TEXT,
  jumlah     BIGINT NOT NULL
);

CREATE INDEX IF NOT EXISTS gardu_jtr_panjang_simpan_kunci
  ON public.gardu_jtr_panjang_simpan (gardu_kode, ulp);
CREATE INDEX IF NOT EXISTS gardu_jtr_panjang_simpan_kunci_upper
  ON public.gardu_jtr_panjang_simpan (upper(gardu_kode), upper(ulp));
CREATE INDEX IF NOT EXISTS gardu_jtr_penghantar_simpan_kunci
  ON public.gardu_jtr_penghantar_simpan (gardu_kode, ulp);
CREATE INDEX IF NOT EXISTS gardu_jtr_penghantar_simpan_kunci_upper
  ON public.gardu_jtr_penghantar_simpan (upper(gardu_kode), upper(ulp));
CREATE INDEX IF NOT EXISTS gardu_jtr_tiang_simpan_kunci
  ON public.gardu_jtr_tiang_simpan (gardu_kode, ulp);

-- Hanya dibaca lewat view; isinya sama terbukanya dengan view lama.
DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['gardu_jtr_panjang_simpan', 'gardu_jtr_penghantar_simpan', 'gardu_jtr_tiang_simpan'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('REVOKE ALL ON public.%I FROM anon, authenticated', t);
    EXECUTE format('GRANT SELECT ON public.%I TO authenticated', t);
    EXECUTE format('DROP POLICY IF EXISTS baca ON public.%I', t);
    EXECUTE format('CREATE POLICY baca ON public.%I FOR SELECT TO authenticated USING (true)', t);
  END LOOP;
END $$;


-- ── 3. Tanda "kotor" ────────────────────────────────────────────────────────
-- Satu baris per pernyataan yang mengubah data dasar. SELALU INSERT (bukan
-- "kalau belum ada"): perubahan yang masuk saat penyegaran berjalan tetap
-- meninggalkan barisnya sendiri untuk putaran berikutnya.
CREATE TABLE IF NOT EXISTS public.jtr_panjang_kotor (
  id   BIGSERIAL PRIMARY KEY,
  pada TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.jtr_panjang_kotor ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.jtr_panjang_kotor FROM anon, authenticated;

CREATE OR REPLACE FUNCTION public.tandai_jtr_panjang_kotor()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
BEGIN
  INSERT INTO public.jtr_panjang_kotor DEFAULT VALUES;
  RETURN NULL;
END $fn$;

-- Kolom tiang yang memengaruhi kode, keanggotaan, dan panjang gawang.
DROP TRIGGER IF EXISTS trg_jtr_panjang_kotor ON public.tiang;
CREATE TRIGGER trg_jtr_panjang_kotor
  AFTER INSERT OR DELETE OR UPDATE OF kode, gardu_kode, ulp, jurusan, induk_id, induk_jtr_id, lat, lng, status_hidup
  ON public.tiang FOR EACH STATEMENT EXECUTE FUNCTION public.tandai_jtr_panjang_kotor();

DROP TRIGGER IF EXISTS trg_jtr_panjang_kotor ON public.gardu;
CREATE TRIGGER trg_jtr_panjang_kotor
  AFTER INSERT OR DELETE OR UPDATE OF kode, ulp, lat, lng
  ON public.gardu FOR EACH STATEMENT EXECUTE FUNCTION public.tandai_jtr_panjang_kotor();

DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['tiang_konduktor', 'tiang_jtr_tumpang', 'tiang_kode_jurusan', 'jurusan_ref'] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS trg_jtr_panjang_kotor ON public.%I', t);
    EXECUTE format('CREATE TRIGGER trg_jtr_panjang_kotor AFTER INSERT OR UPDATE OR DELETE ON public.%I '
                   'FOR EACH STATEMENT EXECUTE FUNCTION public.tandai_jtr_panjang_kotor()', t);
  END LOOP;
END $$;


-- ── 4. Penyegaran ───────────────────────────────────────────────────────────
-- Urutan penting: ambil id kotor DULU, baru menghitung. Hitungan memakai
-- potret yang lebih baru (READ COMMITTED), jadi semua perubahan milik id itu
-- pasti ikut. Pembaca lain tetap melihat isi lama sampai selesai (MVCC) —
-- tidak pernah kosong.
CREATE OR REPLACE FUNCTION public.segarkan_jtr_panjang(p_paksa BOOLEAN DEFAULT false)
RETURNS INT LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  v_ids BIGINT[];
BEGIN
  IF NOT pg_try_advisory_xact_lock(hashtext('segarkan_jtr_panjang')) THEN
    RETURN -1;                                   -- putaran sebelumnya masih jalan
  END IF;
  SELECT array_agg(id) INTO v_ids FROM public.jtr_panjang_kotor;
  IF v_ids IS NULL AND NOT p_paksa THEN RETURN 0; END IF;

  DELETE FROM public.gardu_jtr_panjang_simpan WHERE true;
  INSERT INTO public.gardu_jtr_panjang_simpan SELECT * FROM public._gardu_jtr_panjang_hitung;

  DELETE FROM public.gardu_jtr_penghantar_simpan WHERE true;
  INSERT INTO public.gardu_jtr_penghantar_simpan SELECT * FROM public._gardu_jtr_penghantar_hitung;

  DELETE FROM public.gardu_jtr_tiang_simpan WHERE true;
  INSERT INTO public.gardu_jtr_tiang_simpan (gardu_kode, ulp, jumlah)
  SELECT upper(t.gardu_kode), upper(t.ulp), count(*)
  FROM public.jtr_tiang t
  WHERE t.status_hidup = 'aktif'
  GROUP BY 1, 2;

  IF v_ids IS NOT NULL THEN
    DELETE FROM public.jtr_panjang_kotor WHERE id = ANY (v_ids);
  END IF;
  RETURN COALESCE(array_length(v_ids, 1), 0);
END $fn$;

REVOKE ALL ON FUNCTION public.segarkan_jtr_panjang(BOOLEAN) FROM PUBLIC, anon, authenticated;

-- Isi pertama SEBELUM view publik dialihkan, supaya tidak pernah terbaca kosong.
SELECT public.segarkan_jtr_panjang(true);


-- ── 5. View publik membaca simpanan ─────────────────────────────────────────
-- CREATE OR REPLACE mempertahankan OID → view turunan (ulp_jtr_panjang,
-- jtr_inspeksi, master_gardu_jtr, tiang_label, jtr_gawang_terputus, …) dan
-- hak akses ikut tanpa disentuh.
CREATE OR REPLACE VIEW public.gardu_jtr_panjang AS
  SELECT * FROM public.gardu_jtr_panjang_simpan;
CREATE OR REPLACE VIEW public.gardu_jtr_penghantar AS
  SELECT * FROM public.gardu_jtr_penghantar_simpan;

-- Jumlah tiang dari simpanan; selebihnya sama persis dengan master-gardu-jtr-cepat.sql.
CREATE OR REPLACE VIEW public.master_gardu_jtr AS
WITH pj AS MATERIALIZED (
  SELECT upper(p.gardu_kode) AS kode, upper(p.ulp) AS ulp, sum(p.panjang_km) AS km
  FROM public.gardu_jtr_penghantar p
  GROUP BY 1, 2
), ins AS MATERIALIZED (
  SELECT upper(i.gardu_kode) AS kode, upper(i.ulp) AS ulp, max(i.tgl_selesai) AS terakhir
  FROM public.inspeksi_jtr i
  WHERE i.status = 'Diverifikasi'
  GROUP BY 1, 2
)
SELECT
  upper(g.kode) AS gardu_kode,
  upper(g.ulp)  AS ulp,
  g.nama,
  g.feeder AS penyulang,
  COALESCE(pj.km, 0::numeric)::numeric(10,3) AS panjang_km,
  COALESCE(tg.jumlah, 0::bigint)             AS jumlah_tiang,
  ins.terakhir                               AS terakhir_inspeksi,
  CASE WHEN ins.terakhir IS NULL THEN NULL::integer
       ELSE floor((CURRENT_DATE - ins.terakhir)::numeric / 30.0)::integer
  END AS umur_inspeksi_bulan
FROM public.gardu g
LEFT JOIN pj ON pj.kode = upper(g.kode) AND pj.ulp = upper(g.ulp)
LEFT JOIN public.gardu_jtr_tiang_simpan tg ON tg.gardu_kode = upper(g.kode) AND tg.ulp = upper(g.ulp)
LEFT JOIN ins ON ins.kode = upper(g.kode) AND ins.ulp = upper(g.ulp);

-- tiang_aktif dari simpanan (dulu count per inspeksi ke jtr_tiang lewat upper()).
CREATE OR REPLACE VIEW public.inspeksi_jtr_kelengkapan AS
SELECT i.id AS inspeksi_id,
  i.gardu_kode,
  i.ulp,
  COALESCE(( SELECT s.jumlah FROM public.gardu_jtr_tiang_simpan s
              WHERE s.gardu_kode = upper(i.gardu_kode) AND s.ulp = upper(i.ulp)), 0::bigint) AS tiang_aktif,
  ( SELECT count(*) FROM public.inspeksi_jtr_titik x
     WHERE x.inspeksi_id = i.id AND x.tiang_id IS NOT NULL) AS sudah_diperiksa,
  ( SELECT count(*) FROM public.inspeksi_jtr_titik x
     WHERE x.inspeksi_id = i.id AND x.hasil_periksa = 'baru'::text) AS tiang_baru
FROM public.inspeksi_jtr i;

CREATE INDEX IF NOT EXISTS inspeksi_jtr_titik_inspeksi ON public.inspeksi_jtr_titik (inspeksi_id);


-- ── 6. Km yang DIBEKUKAN tetap dihitung langsung ────────────────────────────
-- Dipakai jtr_bekukan_km (saat disetujui) & jtr_isi_km_wo (KMS WO saat
-- dikirim) — keduanya berjalan sesaat sesudah HP mengirim titik, ketika
-- simpanan bisa belum disegarkan.
CREATE OR REPLACE FUNCTION public._jtr_km_gardu(p_gardu TEXT, p_ulp TEXT)
RETURNS NUMERIC LANGUAGE sql STABLE SET search_path = public AS $fn$
  SELECT round(sum(g.panjang_km)::numeric, 3) FROM public._gardu_jtr_penghantar_hitung g
  WHERE g.gardu_kode = p_gardu AND g.ulp = p_ulp;
$fn$;


-- ── 7. Jadwal ───────────────────────────────────────────────────────────────
-- Tiap menit kalau ada yang kotor; tiap jam dipaksa (jaring pengaman bila ada
-- jalur perubahan yang tidak terjaga pemicu, mis. TRUNCATE).
CREATE EXTENSION IF NOT EXISTS pg_cron;
SELECT cron.unschedule(jobid) FROM cron.job WHERE jobname IN ('jtr-panjang-segarkan', 'jtr-panjang-paksa');
SELECT cron.schedule('jtr-panjang-segarkan', '* * * * *', $$SELECT public.segarkan_jtr_panjang()$$);
SELECT cron.schedule('jtr-panjang-paksa',   '17 * * * *', $$SELECT public.segarkan_jtr_panjang(true)$$);


-- ── Pemeriksaan (jalankan terpisah sesudahnya) ──────────────────────────────
-- 1) Isi simpanan = hitungan langsung (harus 0 baris dua-duanya):
--      SELECT * FROM _gardu_jtr_panjang_hitung EXCEPT SELECT * FROM gardu_jtr_panjang;
--      SELECT * FROM gardu_jtr_panjang EXCEPT SELECT * FROM _gardu_jtr_panjang_hitung;
-- 2) Jadwal berjalan:
--      SELECT status, return_message, start_time FROM cron.job_run_details
--      WHERE jobid IN (SELECT jobid FROM cron.job WHERE jobname LIKE 'jtr-panjang%')
--      ORDER BY start_time DESC LIMIT 5;
-- 3) Kotor menumpuk? (harus kecil / 0):
--      SELECT count(*), min(pada) FROM jtr_panjang_kotor;
