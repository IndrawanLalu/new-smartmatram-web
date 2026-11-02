-- =============================================================================
-- Jam kerja Tier 2 — Inspeksi JTM & Inspeksi Gardu (3 Nov 2026).
-- Jalankan manual di Supabase SQL Editor, SESUDAH jtm-tier1-drone.sql dan
-- inspeksi-gardu.sql. Idempoten.
--
-- Keputusan user 3 Nov:
--   • Tier 2 hanya boleh dikerjakan pada jam tertentu (bawaan 18.00–21.00
--     WITA), diatur PER ULP di web, berlaku untuk JTM dan gardu.
--   • Toleransi 15 menit sesudah jam selesai (bisa diatur) — tiang terakhir
--     yang dinilai 21.05 tidak terbuang.
--   • Jam = JAM SERVER. HP mengambil jam server lalu menghitung sendiri
--     dengan pewaktu aplikasi (tidak ikut jam HP). Tanpa sinyal tetap boleh
--     dikerjakan, tetapi penilaiannya ditandai `jam_terverifikasi = false`
--     untuk diperiksa admin.
--
-- Isi:
--   1. jam_tier2 (satu baris per ULP) + simpan_jam_tier2 (UP3 semua ULP,
--      admin ULP-nya sendiri) + jam_tier2(p_ulp) untuk HP (jam server).
--   2. _cek_jam_tier2 — penjaga: waktu kerja di luar jam → ditolak.
--   3. Inspeksi JTM: kolom inspeksi_jtm_titik.jam_terverifikasi; kirim_tiang_jtm
--      DITAMBAL pada definisi HIDUP (cara jtm-tier1-drone.sql): tiang Tier 2
--      yang dinilai di luar jam ditolak SATU PER SATU (tiang lain tetap
--      terkirim), tanda terverifikasi ikut tersimpan.
--   4. Inspeksi Gardu: kolom inspeksi_gardu.jam_terverifikasi (+ view
--      inspeksi_gardu_daftar membawanya); penjaga lewat
--      PEMICU (Tier 2, tgl baru/berubah); kirim_inspeksi_gardu ditambal untuk
--      menyimpan tanda terverifikasi.
-- Waktu yang diperiksa = waktu menilai yang dikirim HP, dipotong ke jam
-- server bila lebih maju (kirim_tiang_jtm/kirim_inspeksi_gardu sudah begitu).
-- =============================================================================


-- ── 1. Pengaturan per ULP ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.jam_tier2 (
  ulp             TEXT PRIMARY KEY,
  mulai           TIME NOT NULL DEFAULT '18:00',
  selesai         TIME NOT NULL DEFAULT '21:00',
  toleransi_menit INTEGER NOT NULL DEFAULT 15,
  aktif           BOOLEAN NOT NULL DEFAULT true,
  diubah_oleh     TEXT,
  diubah_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT jam_tier2_toleransi CHECK (toleransi_menit BETWEEN 0 AND 120),
  CONSTRAINT jam_tier2_beda CHECK (mulai <> selesai)
);

INSERT INTO public.jam_tier2 (ulp) VALUES ('AMPENAN'), ('CAKRANEGARA'), ('GERUNG'), ('TANJUNG')
ON CONFLICT (ulp) DO NOTHING;

ALTER TABLE public.jam_tier2 ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS jam_tier2_baca ON public.jam_tier2;
CREATE POLICY jam_tier2_baca ON public.jam_tier2 FOR SELECT TO authenticated USING (true);

COMMENT ON TABLE public.jam_tier2 IS
  'Jam kerja Tier 2 (Inspeksi JTM & Gardu) per ULP, WITA. Diubah lewat simpan_jam_tier2.';

CREATE OR REPLACE FUNCTION public.simpan_jam_tier2(
  p_ulp TEXT, p_mulai TIME, p_selesai TIME, p_toleransi INTEGER, p_aktif BOOLEAN, p_oleh TEXT DEFAULT NULL
) RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  v_role TEXT;
  v_unit TEXT;
  u      TEXT := upper(btrim(COALESCE(p_ulp, '')));
BEGIN
  SELECT role, unit INTO v_role, v_unit FROM public.user_roles WHERE user_id = auth.uid();
  IF v_role IS NULL OR v_role NOT IN ('UP3', 'admin') THEN
    RAISE EXCEPTION 'Hanya UP3 dan admin yang boleh mengubah jam kerja Tier 2.';
  END IF;
  IF v_role = 'admin' AND upper(COALESCE(v_unit, '')) <> u THEN
    RAISE EXCEPTION 'Admin hanya boleh mengubah jam Tier 2 ULP %.', COALESCE(v_unit, '-');
  END IF;
  IF p_mulai IS NULL OR p_selesai IS NULL OR p_mulai = p_selesai THEN
    RAISE EXCEPTION 'Jam mulai dan jam selesai harus diisi dan tidak boleh sama.';
  END IF;
  IF COALESCE(p_toleransi, -1) NOT BETWEEN 0 AND 120 THEN
    RAISE EXCEPTION 'Toleransi harus 0–120 menit.';
  END IF;
  INSERT INTO public.jam_tier2 (ulp, mulai, selesai, toleransi_menit, aktif, diubah_oleh, diubah_at)
  VALUES (u, p_mulai, p_selesai, p_toleransi, COALESCE(p_aktif, true), p_oleh, now())
  ON CONFLICT (ulp) DO UPDATE SET
    mulai = EXCLUDED.mulai, selesai = EXCLUDED.selesai, toleransi_menit = EXCLUDED.toleransi_menit,
    aktif = EXCLUDED.aktif, diubah_oleh = EXCLUDED.diubah_oleh, diubah_at = now();
END $fn$;

REVOKE ALL ON FUNCTION public.simpan_jam_tier2(TEXT, TIME, TIME, INTEGER, BOOLEAN, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.simpan_jam_tier2(TEXT, TIME, TIME, INTEGER, BOOLEAN, TEXT) TO authenticated;

-- Untuk HP: jam server + aturan ULP. `sekarang` dipakai HP sebagai patokan
-- pewaktunya sendiri — jam HP tidak dipakai.
CREATE OR REPLACE FUNCTION public.jam_tier2(p_ulp TEXT)
RETURNS JSONB
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $fn$
  SELECT jsonb_build_object(
    'sekarang', now(),
    'ulp', upper(btrim(COALESCE(p_ulp, ''))),
    'mulai', to_char(j.mulai, 'HH24:MI'),
    'selesai', to_char(j.selesai, 'HH24:MI'),
    'toleransi', j.toleransi_menit,
    'aktif', COALESCE(j.aktif, false))
  FROM (SELECT 1) x
  LEFT JOIN public.jam_tier2 j ON j.ulp = upper(btrim(COALESCE(p_ulp, '')))
$fn$;

GRANT EXECUTE ON FUNCTION public.jam_tier2(TEXT) TO authenticated;


-- ── 2. Penjaga ───────────────────────────────────────────────────────────────
-- Jendela boleh melewati tengah malam (mis. 22.00–01.00).
CREATE OR REPLACE FUNCTION public._cek_jam_tier2(p_ulp TEXT, p_waktu TIMESTAMPTZ)
RETURNS VOID
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  j     RECORD;
  t     TIME := (COALESCE(p_waktu, now()) AT TIME ZONE 'Asia/Makassar')::time;
  akhir TIME;
BEGIN
  SELECT * INTO j FROM public.jam_tier2 WHERE ulp = upper(btrim(COALESCE(p_ulp, '')));
  IF NOT FOUND OR NOT j.aktif THEN RETURN; END IF;
  akhir := j.selesai + make_interval(mins => j.toleransi_menit);
  IF (j.mulai < akhir AND t BETWEEN j.mulai AND akhir)
     OR (j.mulai > akhir AND (t >= j.mulai OR t <= akhir)) THEN
    RETURN;
  END IF;
  RAISE EXCEPTION 'Dinilai pukul % WITA — di luar jam kerja Tier 2 ULP % (% – % WITA, toleransi % menit).',
    to_char(t, 'HH24.MI'), j.ulp, to_char(j.mulai, 'HH24.MI'), to_char(j.selesai, 'HH24.MI'), j.toleransi_menit;
END $fn$;

-- Tier 2 JTM: dipanggil per tiang di dalam blok penolakan kirim_tiang_jtm.
CREATE OR REPLACE FUNCTION public._jaga_jam_tier2_jtm(p_inspeksi UUID, p_waktu TIMESTAMPTZ)
RETURNS VOID
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  i RECORD;
BEGIN
  SELECT tier, ulp INTO i FROM public.inspeksi_jtm WHERE id = p_inspeksi;
  IF NOT FOUND OR COALESCE(i.tier, '1') <> '2' THEN RETURN; END IF;
  PERFORM public._cek_jam_tier2(i.ulp, LEAST(COALESCE(p_waktu, now()), now()));
END $fn$;


-- ── 3. Inspeksi JTM ──────────────────────────────────────────────────────────
ALTER TABLE public.inspeksi_jtm_titik ADD COLUMN IF NOT EXISTS jam_terverifikasi BOOLEAN;
COMMENT ON COLUMN public.inspeksi_jtm_titik.jam_terverifikasi IS
  'Tier 2: true = waktu menilai dihitung dari jam server; false = HP tanpa sinyal (jam HP, periksa); NULL = aplikasi lama / Tier 1.';

DO $do$
DECLARE
  def  TEXT;
  baru TEXT;
  pasang TEXT[][] := ARRAY[
    -- a. penjaga jam, di DALAM blok penolakan per tiang (sebelum nilai_tiang_jtm)
    ARRAY[E'        PERFORM public.nilai_tiang_jtm(',
          E'        -- ★ Jam kerja Tier 2 (jam-tier2.sql): di luar jam = tiang ini ditolak.\n'
          || E'        PERFORM public._jaga_jam_tier2_jtm(v_id, NULLIF(r->>''dinilai_at'', '''')::timestamptz);\n'
          || E'        PERFORM public.nilai_tiang_jtm('],
    -- b. tanda jam terverifikasi ikut tersimpan
    ARRAY[E'      SET dinilai_at = LEAST(COALESCE(NULLIF(r->>''dinilai_at'', '''')::timestamptz, now()), now()),',
          E'      SET dinilai_at = LEAST(COALESCE(NULLIF(r->>''dinilai_at'', '''')::timestamptz, now()), now()),\n'
          || E'          jam_terverifikasi = NULLIF(r->>''jam_terverifikasi'', '''')::boolean,  -- ★ jam-tier2.sql']
  ];
  i INT;
BEGIN
  SELECT replace(pg_get_functiondef('public.kirim_tiang_jtm(jsonb)'::regprocedure), E'\r\n', E'\n') INTO def;
  IF position('_jaga_jam_tier2_jtm' IN def) = 0 THEN
    baru := def;
    FOR i IN 1 .. array_length(pasang, 1) LOOP
      IF (length(baru) - length(replace(baru, pasang[i][1], ''))) / length(pasang[i][1]) <> 1 THEN
        RAISE EXCEPTION 'Tambalan kirim_tiang_jtm #%: penanda tidak ditemukan tepat sekali — skrip dihentikan, tidak ada yang berubah.', i;
      END IF;
      baru := replace(baru, pasang[i][1], pasang[i][2]);
    END LOOP;
    EXECUTE baru;
    RAISE NOTICE 'kirim_tiang_jtm ditambal (jam Tier 2).';
  ELSE
    RAISE NOTICE 'kirim_tiang_jtm sudah bertambalan jam Tier 2 — dilewati.';
  END IF;
END $do$;


-- ── 4. Inspeksi Gardu ────────────────────────────────────────────────────────
ALTER TABLE public.inspeksi_gardu ADD COLUMN IF NOT EXISTS jam_terverifikasi BOOLEAN;
COMMENT ON COLUMN public.inspeksi_gardu.jam_terverifikasi IS
  'Tier 2: true = waktu Simpan dihitung dari jam server; false = HP tanpa sinyal (jam HP, periksa); NULL = aplikasi lama / Tier 1.';

-- Daftar web ikut membawa tandanya (salinan inspeksi-gardu-pengaturan.sql,
-- kolom baru di akhir). ⚠ Definisi terbaru inspeksi_gardu_daftar kini di SINI.
CREATE OR REPLACE VIEW public.inspeksi_gardu_daftar AS
SELECT x.id, x.gardu_kode, x.ulp, x.penyulang, x.tier, x.wo_item_id, x.tgl, x.lat, x.lng, x.akurasi, x.jarak_m,
       x.foto_gardu_url, x.ada_temuan, x.status, x.petugas_nama, x.catatan,
       x.verified_at, x.verified_by, x.dikembalikan_at, x.dikembalikan_alasan, x.dikembalikan_oleh,
       x.batal_alasan, x.created_at,
       g.nama AS gardu_nama,
       w.nama AS wo_nama, w.tgl_wo,
       (SELECT count(*) FROM public.inspeksi_gardu_temuan t WHERE t.inspeksi_id = x.id)::int AS jumlah_temuan,
       (SELECT CASE WHEN bool_or(t.prioritas = 'Urgent') THEN 'Urgent'
                    WHEN bool_or(t.prioritas = 'Rawan') THEN 'Rawan'
                    WHEN count(*) > 0 THEN 'Biasa' END
        FROM public.inspeksi_gardu_temuan t WHERE t.inspeksi_id = x.id) AS prioritas_tertinggi,
       EXISTS (SELECT 1 FROM public.master_usulan u
               WHERE u.sumber_modul = 'inspeksi_gardu' AND u.sumber_id = x.id AND u.status = 'menunggu') AS tertahan,
       x.jam_terverifikasi   -- ★ jam-tier2.sql (kolom baru di AKHIR)
FROM public.inspeksi_gardu x
-- Kode & ULP disalin persis dari master: join biasa (hash join sekali),
-- bukan fungsi per baris yang memindai seluruh gardu dengan upper().
LEFT JOIN public.gardu g ON g.kode = x.gardu_kode AND g.ulp = x.ulp
LEFT JOIN public.wo_igardu_item i ON i.id = x.wo_item_id
LEFT JOIN public.wo_igardu w ON w.id = i.wo_id;

-- Penjaga lewat pemicu: hanya saat kunjungan Tier 2 baru, atau tanggalnya berubah
-- (verifikasi admin tidak mengubah tgl, jadi tidak ikut diperiksa).
CREATE OR REPLACE FUNCTION public.jaga_jam_tier2_gardu()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
BEGIN
  IF NEW.tier = '2' AND (TG_OP = 'INSERT' OR NEW.tgl IS DISTINCT FROM OLD.tgl OR NEW.tier IS DISTINCT FROM OLD.tier) THEN
    PERFORM public._cek_jam_tier2(NEW.ulp, NEW.tgl);
  END IF;
  RETURN NEW;
END $fn$;

DROP TRIGGER IF EXISTS jaga_jam_tier2_gardu ON public.inspeksi_gardu;
CREATE TRIGGER jaga_jam_tier2_gardu
  BEFORE INSERT OR UPDATE OF tgl, tier ON public.inspeksi_gardu
  FOR EACH ROW EXECUTE FUNCTION public.jaga_jam_tier2_gardu();

DO $do$
DECLARE
  def  TEXT;
  lama TEXT := E'    tgl            = v_tgl,';
BEGIN
  SELECT replace(pg_get_functiondef('public.kirim_inspeksi_gardu(jsonb)'::regprocedure), E'\r\n', E'\n') INTO def;
  IF position('jam_terverifikasi' IN def) = 0 THEN
    IF (length(def) - length(replace(def, lama, ''))) / length(lama) <> 1 THEN
      RAISE EXCEPTION 'Tambalan kirim_inspeksi_gardu: penanda tidak ditemukan tepat sekali — skrip dihentikan, tidak ada yang berubah.';
    END IF;
    EXECUTE replace(def, lama, lama || E'\n'
      || E'    jam_terverifikasi = NULLIF(p_isi->>''jam_terverifikasi'', '''')::boolean,  -- ★ jam-tier2.sql');
    RAISE NOTICE 'kirim_inspeksi_gardu ditambal (jam Tier 2).';
  ELSE
    RAISE NOTICE 'kirim_inspeksi_gardu sudah bertambalan jam Tier 2 — dilewati.';
  END IF;
END $do$;


-- ── Periksa ──────────────────────────────────────────────────────────────────
--   SELECT * FROM jam_tier2 ORDER BY ulp;
--   SELECT jam_tier2('AMPENAN');
--   SELECT position('_jaga_jam_tier2_jtm' IN pg_get_functiondef('public.kirim_tiang_jtm(jsonb)'::regprocedure)) > 0;      -- true
--   SELECT position('jam_terverifikasi' IN pg_get_functiondef('public.kirim_inspeksi_gardu(jsonb)'::regprocedure)) > 0;   -- true
