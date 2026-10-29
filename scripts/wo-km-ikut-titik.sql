-- =============================================================================
-- KMS WO Inspeksi JTM & JTR ikut hasil penitikan (29 Okt 2026). Idempoten.
-- Jalankan manual di Supabase SQL Editor, SESUDAH wo-tunggakan.sql.
--
-- Masalah: KMS item WO disalin SEKALI saat WO terbit (umumnya angka impor
-- master), sedangkan realisasi = km hasil penitikan. HP menghitung "Sudah
-- dikirim" dengan km WO (Tanjung Tier 1 Okt: 211,9) dan Rekap Kinerja dengan
-- km penitikan (187,2) — dua angka untuk pekerjaan yang sama.
--
-- Keputusan user 29 Okt 2026:
--   1. KMS WO ikut hasil penitikan — JTM dan JTR, termasuk item tempelan yang
--      segmennya ada di master. Tempelan tanpa segmen master (wo_manual)
--      tetap angka ketikan admin.
--   2. Segmen/gardu yang BELUM dititik → KMS WO tetap angka WO.
--      JTM dititik = segmen_panjang.panjang_dari = 'hitungan'.
--      JTR dititik = panjang penghantar gardu > 0.
--   3. Diperbarui saat inspeksi DIKIRIM (Selesai), dikunci saat DISETUJUI
--      (= km realisasi yang dibekukan). WO bulan yang sudah lewat TIDAK
--      disentuh lagi (keputusan wo-tunggakan: angka bulan lalu tetap).
--   4. Realisasi JTR kini juga dibekukan saat disetujui (inspeksi_jtr_km),
--      sama dengan JTM (jtm-km-disetujui.sql).
--
-- Isi:
--   1. wo_inspeksi_item.panjang_km_terbit — KMS saat WO terbit (jejak saja).
--   2. inspeksi_jtr_km + pemicu bekukan (pola inspeksi_jtm_km).
--   3. _wo_inspeksi_km_ikut() + pemicu JTM baru + pemicu JTR (jtr_isi_km_wo
--      diganti; jtr-wo-km-realisasi.sql tidak berlaku lagi).
--   4. Rekap Kinerja & realisasi_rentang: km JTR = COALESCE(km beku, km
--      penghantar). DITAMBAL pada definisi hidup (berhenti bila penanda
--      tidak ketemu — tidak ada yang berubah).
--   5. Item WO bulan ini & sesudahnya yang sudah dikirim/disetujui
--      disamakan sekarang.
-- =============================================================================


-- ── 1. KMS saat WO terbit ────────────────────────────────────────────────────
ALTER TABLE public.wo_inspeksi_item ADD COLUMN IF NOT EXISTS panjang_km_terbit NUMERIC;
COMMENT ON COLUMN public.wo_inspeksi_item.panjang_km_terbit IS
  'KMS item saat WO terbit. panjang_km bisa berubah ikut hasil penitikan (wo-km-ikut-titik.sql); ini jejaknya.';

-- Item JTR 'realisasi' dulu terbit 'kosong' (0) — jtr-wo-km-realisasi.sql.
UPDATE public.wo_inspeksi_item
   SET panjang_km_terbit = CASE WHEN panjang_dari = 'realisasi' THEN 0 ELSE panjang_km END
 WHERE panjang_km_terbit IS NULL;

CREATE OR REPLACE FUNCTION public.wo_item_km_terbit()
RETURNS TRIGGER LANGUAGE plpgsql AS $fn$
BEGIN
  NEW.panjang_km_terbit := COALESCE(NEW.panjang_km_terbit, NEW.panjang_km);
  RETURN NEW;
END $fn$;

DROP TRIGGER IF EXISTS trg_wo_item_km_terbit ON public.wo_inspeksi_item;
CREATE TRIGGER trg_wo_item_km_terbit BEFORE INSERT ON public.wo_inspeksi_item
  FOR EACH ROW EXECUTE FUNCTION public.wo_item_km_terbit();


-- ── 2. Km realisasi JTR dibekukan saat disetujui ─────────────────────────────
CREATE TABLE IF NOT EXISTS public.inspeksi_jtr_km (
  inspeksi_id  UUID PRIMARY KEY REFERENCES public.inspeksi_jtr(id) ON DELETE CASCADE,
  km           NUMERIC,          -- NULL = gardu belum punya penghantar saat disetujui
  disetujui_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
COMMENT ON TABLE public.inspeksi_jtr_km IS
  'Km penghantar gardu saat inspeksi JTR disetujui. Dipakai realisasi supaya bulan yang sudah disetujui tidak berubah karena koreksi JTR sesudahnya.';

ALTER TABLE public.inspeksi_jtr_km ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS inspeksi_jtr_km_baca ON public.inspeksi_jtr_km;
CREATE POLICY inspeksi_jtr_km_baca ON public.inspeksi_jtr_km FOR SELECT TO authenticated USING (true);
GRANT SELECT ON public.inspeksi_jtr_km TO authenticated;

-- Km penghantar satu gardu — sumber yang sama dengan Rekap Kinerja.
CREATE OR REPLACE FUNCTION public._jtr_km_gardu(p_gardu TEXT, p_ulp TEXT)
RETURNS NUMERIC LANGUAGE sql STABLE SET search_path = public AS $fn$
  SELECT round(sum(g.panjang_km)::numeric, 3) FROM public.gardu_jtr_penghantar g
  WHERE g.gardu_kode = p_gardu AND g.ulp = p_ulp;
$fn$;

CREATE OR REPLACE FUNCTION public.jtr_bekukan_km()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
BEGIN
  IF NEW.status = 'Diverifikasi' THEN
    IF TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM 'Diverifikasi' THEN
      INSERT INTO public.inspeksi_jtr_km (inspeksi_id, km, disetujui_at)
      VALUES (NEW.id, public._jtr_km_gardu(NEW.gardu_kode, NEW.ulp), now())
      ON CONFLICT (inspeksi_id) DO UPDATE SET km = EXCLUDED.km, disetujui_at = EXCLUDED.disetujui_at;
    END IF;
  ELSIF TG_OP = 'UPDATE' AND OLD.status = 'Diverifikasi' THEN
    DELETE FROM public.inspeksi_jtr_km WHERE inspeksi_id = NEW.id;
  END IF;
  RETURN NULL;
END $fn$;

DROP TRIGGER IF EXISTS trg_jtr_bekukan_km ON public.inspeksi_jtr;
CREATE TRIGGER trg_jtr_bekukan_km AFTER INSERT OR UPDATE OF status ON public.inspeksi_jtr
  FOR EACH ROW EXECUTE FUNCTION public.jtr_bekukan_km();

-- Yang sudah disetujui: dibekukan dengan km hari ini (km saat disetujui dulu
-- tidak tercatat). Realisasi hari ini tidak berubah.
INSERT INTO public.inspeksi_jtr_km (inspeksi_id, km, disetujui_at)
SELECT r.id, public._jtr_km_gardu(r.gardu_kode, r.ulp), COALESCE(r.verified_at, now())
FROM public.inspeksi_jtr r
WHERE r.status = 'Diverifikasi'
ON CONFLICT (inspeksi_id) DO NOTHING;


-- ── 3. KMS WO ikut hasil kerja ───────────────────────────────────────────────
-- Satu-satunya tempat yang mengubah KMS item WO sesudah terbit. Tidak
-- menyentuh: km kosong/0 (belum dititik), item dibatalkan, WO bulan lalu.
CREATE OR REPLACE FUNCTION public._wo_inspeksi_km_ikut(p_item UUID, p_km NUMERIC)
RETURNS VOID LANGUAGE sql SECURITY DEFINER SET search_path = public AS $fn$
  UPDATE public.wo_inspeksi_item i
     SET panjang_km = round(p_km, 3), panjang_dari = 'realisasi', updated_at = now()
    FROM public.wo_inspeksi w
   WHERE i.id = p_item AND w.id = i.wo_id
     AND p_km > 0
     AND i.status <> 'Dibatalkan'
     AND w.tgl_wo >= date_trunc('month', now() AT TIME ZONE 'Asia/Makassar')::date
     AND i.panjang_km IS DISTINCT FROM round(p_km, 3);
$fn$;

-- JTM: dikirim → km segmen saat itu; disetujui → km yang dibekukan.
CREATE OR REPLACE FUNCTION public.jtm_km_ke_wo()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  v_km   NUMERIC;
  v_dari TEXT;
BEGIN
  IF NEW.wo_item_id IS NULL OR NEW.status NOT IN ('Selesai', 'Diverifikasi') THEN RETURN NULL; END IF;
  IF TG_OP = 'UPDATE' AND OLD.status IS NOT DISTINCT FROM NEW.status
     AND OLD.wo_item_id IS NOT DISTINCT FROM NEW.wo_item_id THEN RETURN NULL; END IF;

  SELECT sp.panjang_pakai_km, sp.panjang_dari INTO v_km, v_dari
    FROM public.segmen_panjang sp WHERE sp.segmen_id = NEW.segmen_id;
  IF v_dari IS DISTINCT FROM 'hitungan' THEN RETURN NULL; END IF;   -- belum dititik
  IF NEW.status = 'Diverifikasi' THEN
    v_km := COALESCE((SELECT kd.km FROM public.inspeksi_jtm_km kd WHERE kd.inspeksi_id = NEW.id), v_km);
  END IF;
  PERFORM public._wo_inspeksi_km_ikut(NEW.wo_item_id, v_km);
  RETURN NULL;
END $fn$;

-- Nama sesudah trg_jtm_bekukan_km (pemicu AFTER berjalan urut nama).
DROP TRIGGER IF EXISTS trg_jtm_km_ke_wo ON public.inspeksi_jtm;
CREATE TRIGGER trg_jtm_km_ke_wo AFTER INSERT OR UPDATE OF status, wo_item_id ON public.inspeksi_jtm
  FOR EACH ROW EXECUTE FUNCTION public.jtm_km_ke_wo();

-- JTR: menggantikan isi jtr_isi_km_wo (jtr-wo-km-realisasi.sql), pemicunya
-- trg_jtr_isi_km_wo tetap. Dulu hanya item 'kosong'; kini semua item.
CREATE OR REPLACE FUNCTION public.jtr_isi_km_wo()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  v_km NUMERIC;
BEGIN
  IF NEW.wo_item_id IS NULL OR NEW.status NOT IN ('Selesai', 'Diverifikasi') THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE' AND OLD.status IS NOT DISTINCT FROM NEW.status
     AND OLD.wo_item_id IS NOT DISTINCT FROM NEW.wo_item_id THEN RETURN NEW; END IF;

  v_km := public._jtr_km_gardu(NEW.gardu_kode, NEW.ulp);
  IF NEW.status = 'Diverifikasi' THEN
    v_km := COALESCE((SELECT kd.km FROM public.inspeksi_jtr_km kd WHERE kd.inspeksi_id = NEW.id), v_km);
  END IF;
  PERFORM public._wo_inspeksi_km_ikut(NEW.wo_item_id, v_km);   -- 0/NULL = belum disapu → tetap
  RETURN NEW;
END $fn$;

DROP TRIGGER IF EXISTS trg_jtr_isi_km_wo ON public.inspeksi_jtr;
CREATE TRIGGER trg_jtr_isi_km_wo AFTER INSERT OR UPDATE OF status, wo_item_id ON public.inspeksi_jtr
  FOR EACH ROW EXECUTE FUNCTION public.jtr_isi_km_wo();


-- ── 4. Realisasi JTR membaca km beku ─────────────────────────────────────────
-- Ditambal pada definisi HIDUP: satu baris penanda diganti. Penanda tidak
-- ketemu tepat sekali → berhenti dengan galat, tidak ada yang berubah.
DO $do$
DECLARE
  f      TEXT;
  def    TEXT;
  lama   TEXT;
  baru   TEXT;
  n      INT;
BEGIN
  FOR f, lama, baru IN VALUES
    ('public._rekap_kinerja_inti(text,integer,integer)',
     'SELECT sum(g.panjang_km) AS km FROM public.gardu_jtr_penghantar g',
     'SELECT COALESCE((SELECT kd.km FROM public.inspeksi_jtr_km kd WHERE kd.inspeksi_id = r.id), sum(g.panjang_km)) AS km FROM public.gardu_jtr_penghantar g'),
    ('public.realisasi_rentang(text,date,date)',
     '(SELECT round(sum(g.panjang_km)::numeric, 3) FROM public.gardu_jtr_penghantar g',
     '(SELECT COALESCE((SELECT kd.km FROM public.inspeksi_jtr_km kd WHERE kd.inspeksi_id = r.id), round(sum(g.panjang_km)::numeric, 3)) FROM public.gardu_jtr_penghantar g')
  LOOP
    def := pg_get_functiondef(f::regprocedure);
    IF strpos(def, baru) > 0 THEN
      RAISE NOTICE '% sudah ditambal', f;
      CONTINUE;
    END IF;
    n := (length(def) - length(replace(def, lama, ''))) / length(lama);
    IF n <> 1 THEN
      RAISE EXCEPTION '% : penanda km JTR ketemu % kali (harus 1) — tidak ada yang diubah', f, n;
    END IF;
    EXECUTE replace(def, lama, baru);
    RAISE NOTICE '% ditambal', f;
  END LOOP;
END $do$;


-- ── 5. Samakan item WO bulan ini & sesudahnya ────────────────────────────────
-- Inspeksi terkirim/disetujui yang tersambung ke item WO. Satu item satu
-- inspeksi (yang terakhir dikirim) supaya hasilnya pasti.
SELECT public._wo_inspeksi_km_ikut(x.wo_item_id, x.km)
FROM (
  SELECT DISTINCT ON (m.wo_item_id) m.wo_item_id,
         CASE WHEN m.status = 'Diverifikasi' THEN COALESCE(kd.km, sp.panjang_pakai_km) ELSE sp.panjang_pakai_km END AS km
  FROM public.inspeksi_jtm m
  JOIN public.segmen_panjang sp ON sp.segmen_id = m.segmen_id AND sp.panjang_dari = 'hitungan'
  LEFT JOIN public.inspeksi_jtm_km kd ON kd.inspeksi_id = m.id
  WHERE m.wo_item_id IS NOT NULL AND m.status IN ('Selesai', 'Diverifikasi')
  ORDER BY m.wo_item_id, m.tgl_selesai DESC NULLS LAST
) x;

SELECT public._wo_inspeksi_km_ikut(x.wo_item_id, x.km)
FROM (
  SELECT DISTINCT ON (r.wo_item_id) r.wo_item_id,
         CASE WHEN r.status = 'Diverifikasi' THEN COALESCE(kd.km, public._jtr_km_gardu(r.gardu_kode, r.ulp))
              ELSE public._jtr_km_gardu(r.gardu_kode, r.ulp) END AS km
  FROM public.inspeksi_jtr r
  LEFT JOIN public.inspeksi_jtr_km kd ON kd.inspeksi_id = r.id
  WHERE r.wo_item_id IS NOT NULL AND r.status IN ('Selesai', 'Diverifikasi')
  ORDER BY r.wo_item_id, r.tgl_selesai DESC NULLS LAST
) x;


-- ── Cek ──────────────────────────────────────────────────────────────────────
--   Tanjung Okt Tier 1: WO turun ±221,57 → ±198,79; realisasi TETAP 187,221.
--   SELECT kunci, wo_terbit, realisasi FROM rekap_kinerja('TANJUNG', 2026, 10) WHERE kunci IN ('jtm','jtm2','jtr');
--   SELECT i.jenis, w.tgl_wo, count(*) FILTER (WHERE i.panjang_km IS DISTINCT FROM i.panjang_km_terbit) AS berubah,
--          sum(i.panjang_km_terbit) AS km_terbit, sum(i.panjang_km) AS km_sekarang
--     FROM wo_inspeksi_item i JOIN wo_inspeksi w ON w.id = i.wo_id GROUP BY 1, 2 ORDER BY 1, 2;
