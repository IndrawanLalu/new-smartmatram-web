-- =============================================================================
-- Inspeksi JTM Tier 1 + drone — tahap 2 (9 Nov 2026, rencana-jtm-tier1-drone.md)
-- Jalankan SESUDAH jtm-tier1-drone.sql. Idempoten.
--
-- 1. Segmen yang SUDAH di WO Tier 1 bisa dijadikan drone / dikembalikan ke
--    Tier 1 biasa per item (dulu hanya per WO saat Susun WO).
--    Syarat drone: segmen pernah diinspeksi Tier 1 & DISETUJUI (P1); item
--    belum punya inspeksi terkirim (P5).
-- 2. Setelan: jarak menilai drone bawaan 500 m; target drone % SLA Tier 1
--    (bawaan 20).
-- 3. Mode drone tidak boleh menitik tiang baru (P3) — ditolak di kirim_tiang_jtm.
-- 4. Rekap drone: WO drone dihitung dari ITEM (dulu dari WO).
--
-- Kinerja: semua pemeriksaan memakai indeks yang ada
--   inspeksi_jtm (segmen_id, status) · inspeksi_jtm (wo_item_id)
-- dan menghitung LANGSUNG dari tabel (bukan simpanan/view berat).
-- =============================================================================


-- ── 1. Setelan ───────────────────────────────────────────────────────────────
ALTER TABLE public.jtm_settings ALTER COLUMN jarak_maks_drone_m SET DEFAULT 500;
-- Yang masih bawaan lama (300, belum pernah diubah) ikut 500.
UPDATE public.jtm_settings SET jarak_maks_drone_m = 500 WHERE jarak_maks_drone_m = 300;

ALTER TABLE public.jtm_settings ADD COLUMN IF NOT EXISTS target_drone_persen NUMERIC(5,1) NOT NULL DEFAULT 20;
ALTER TABLE public.jtm_settings DROP CONSTRAINT IF EXISTS jtm_settings_target_drone_batas;
ALTER TABLE public.jtm_settings ADD CONSTRAINT jtm_settings_target_drone_batas CHECK (target_drone_persen BETWEEN 0 AND 100);
COMMENT ON COLUMN public.jtm_settings.target_drone_persen IS
  'Target KMS Tier 1 + drone sebagai % SLA Tier 1 bulanan (sisanya Tier 1 biasa). Hanya panduan di WO Inspeksi.';


-- ── 2. Segmen sudah dititik = pernah Tier 1 & disetujui ─────────────────────
-- Satu sumber untuk view daftar item DAN RPC — supaya layar dan penolakan
-- server tidak pernah berbeda pendapat.
CREATE OR REPLACE FUNCTION public.jtm_segmen_sudah_dititik(p_segmen UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SET search_path = public AS $fn$
  SELECT EXISTS (SELECT 1 FROM public.inspeksi_jtm d
                 WHERE d.segmen_id = p_segmen AND d.status = 'Diverifikasi' AND COALESCE(d.tier, '1') = '1');
$fn$;
GRANT EXECUTE ON FUNCTION public.jtm_segmen_sudah_dititik(UUID) TO authenticated;

-- View daftar item WO: kolom `sudah_dititik` di AKHIR. Ditambal pada definisi
-- HIDUP (i.* sudah terurai jadi daftar kolom) — bukan ditulis ulang dari berkas.
DO $do$
DECLARE
  def  TEXT := replace(pg_get_viewdef('public.wo_inspeksi_item_status'::regclass, true), E'\r\n', E'\n');
  lama TEXT := E'AS inspeksi_catatan_admin\n   FROM';
BEGIN
  IF position('sudah_dititik' IN def) > 0 THEN
    RAISE NOTICE 'wo_inspeksi_item_status sudah memuat sudah_dititik — dilewati.'; RETURN;
  END IF;
  IF (length(def) - length(replace(def, lama, ''))) / length(lama) <> 1 THEN
    RAISE EXCEPTION 'Tambalan wo_inspeksi_item_status: penanda tidak ditemukan tepat sekali — tidak ada yang berubah.';
  END IF;
  EXECUTE 'CREATE OR REPLACE VIEW public.wo_inspeksi_item_status AS ' || replace(def, lama,
    E'AS inspeksi_catatan_admin,\n    public.jtm_segmen_sudah_dititik(i.segmen_id) AS sudah_dititik\n   FROM');
  RAISE NOTICE 'wo_inspeksi_item_status + sudah_dititik.';
END $do$;


-- ── 3. Jadikan / kembalikan drone per item ──────────────────────────────────
-- Satu panggilan untuk banyak item; yang tidak memenuhi syarat DILAPORKAN
-- (bukan menggagalkan semuanya). Inspeksi yang sedang berjalan (belum
-- terkirim) ikut berubah mode-nya.
CREATE OR REPLACE FUNCTION public.atur_drone_wo_item(p_item UUID[], p_drone BOOLEAN, p_oleh TEXT DEFAULT NULL)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  r       RECORD;
  ok      UUID[] := '{}';
  ditolak JSONB := '[]'::jsonb;
  v_ulp   TEXT;
BEGIN
  IF COALESCE(array_length(p_item, 1), 0) = 0 THEN RAISE EXCEPTION 'Belum ada segmen yang dipilih.'; END IF;
  IF array_length(p_item, 1) > 500 THEN RAISE EXCEPTION 'Paling banyak 500 segmen sekali ubah.'; END IF;

  FOR r IN
    SELECT i.id, i.ulp, i.tier, i.status, i.jenis, i.drone, i.segmen_id, i.objek_nama
    FROM public.wo_inspeksi_item i
    WHERE i.id = ANY (p_item)
    FOR UPDATE
  LOOP
    PERFORM public.wajib_boleh_ulp(r.ulp);
    v_ulp := r.ulp;
    IF r.jenis <> 'JTM' OR COALESCE(r.tier, '1') <> '1' THEN
      ditolak := ditolak || jsonb_build_object('id', r.id, 'nama', r.objek_nama, 'alasan', 'bukan WO Tier 1');
    ELSIF r.status <> 'Terbuka' THEN
      ditolak := ditolak || jsonb_build_object('id', r.id, 'nama', r.objek_nama, 'alasan', 'item sudah ' || lower(r.status));
    ELSIF EXISTS (SELECT 1 FROM public.inspeksi_jtm m
                  WHERE m.wo_item_id = r.id AND m.status IN ('Selesai', 'Diverifikasi')) THEN
      ditolak := ditolak || jsonb_build_object('id', r.id, 'nama', r.objek_nama, 'alasan', 'inspeksinya sudah dikirim');
    ELSIF p_drone AND NOT public.jtm_segmen_sudah_dititik(r.segmen_id) THEN
      ditolak := ditolak || jsonb_build_object('id', r.id, 'nama', r.objek_nama,
        'alasan', 'belum pernah dititik Tier 1 & disetujui');
    ELSIF r.drone IS DISTINCT FROM p_drone THEN
      ok := ok || r.id;
    END IF;
  END LOOP;

  IF array_length(ok, 1) > 0 THEN
    UPDATE public.wo_inspeksi_item SET drone = p_drone, updated_at = now() WHERE id = ANY (ok);
    -- Inspeksi yang sedang berjalan (draf/proses, belum terkirim) ikut modenya.
    UPDATE public.inspeksi_jtm SET drone = p_drone, updated_at = now()
    WHERE wo_item_id = ANY (ok) AND status NOT IN ('Selesai', 'Diverifikasi', 'Dibatalkan') AND drone IS DISTINCT FROM p_drone;

    INSERT INTO public.master_audit
      (entitas, entitas_kode, ulp, field, nilai_lama, nilai_baru, aksi, oleh_uid, oleh_nama)
    VALUES ('wo_inspeksi_item', array_length(ok, 1) || ' segmen', v_ulp, 'drone', to_jsonb(NOT p_drone),
            jsonb_build_object('drone', p_drone, 'item', to_jsonb(ok)), 'sunting_admin', auth.uid(), p_oleh);
  END IF;

  RETURN jsonb_build_object('diubah', COALESCE(array_length(ok, 1), 0), 'ditolak', ditolak);
END $fn$;
REVOKE ALL ON FUNCTION public.atur_drone_wo_item(UUID[], BOOLEAN, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.atur_drone_wo_item(UUID[], BOOLEAN, TEXT) TO authenticated;


-- ── 4. Drone tidak menitik tiang baru (P3) ──────────────────────────────────
-- Ditambal pada definisi HIDUP kirim_tiang_jtm; berhenti bila penanda tidak
-- ketemu tepat sekali. v_drone sudah dihitung sebelum loop tiang
-- (jtm-tier1-drone.sql).
DO $tambal$
DECLARE
  def  TEXT;
  lama TEXT := E'    b := r->''baru'';\n';
BEGIN
  SELECT replace(pg_get_functiondef('public.kirim_tiang_jtm(jsonb)'::regprocedure), E'\r\n', E'\n') INTO def;
  IF position('drone tidak menitik' IN def) > 0 THEN
    RAISE NOTICE 'kirim_tiang_jtm sudah menolak tiang baru drone — dilewati.'; RETURN;
  END IF;
  IF position('v_drone' IN def) = 0 THEN
    RAISE EXCEPTION 'kirim_tiang_jtm belum bertambalan drone — jalankan jtm-tier1-drone.sql dulu.';
  END IF;
  IF (length(def) - length(replace(def, lama, ''))) / length(lama) <> 1 THEN
    RAISE EXCEPTION 'Tambalan kirim_tiang_jtm (tiang baru drone): penanda tidak ditemukan tepat sekali — tidak ada yang berubah.';
  END IF;
  EXECUTE replace(def, lama, lama
    || E'    -- ★ Tier 1 + drone tidak menitik tiang baru (jtm-drone-segmen.sql):\n'
    || E'    -- segmennya sudah dititik; drone hanya menilai tiang yang ada.\n'
    || E'    IF v_drone AND v_tiang IS NULL AND b IS NOT NULL AND jsonb_typeof(b) = ''object''\n'
    || E'       AND NOT EXISTS (SELECT 1 FROM public.tiang WHERE id_hp = NULLIF(r->>''id_lokal'', '''')::uuid) THEN\n'
    || E'      RAISE EXCEPTION ''Tier 1 + drone tidak menitik tiang baru — hapus tiang baru dari draf, atau minta admin mengembalikan segmen ini ke Tier 1 biasa.'';\n'
    || E'    END IF;\n');
  RAISE NOTICE 'kirim_tiang_jtm: drone tidak menitik tiang baru.';
END $tambal$;


-- ── 5. Rekap drone: WO dari item ────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.rekap_jtm_drone(p_ulp TEXT, p_tahun INT, p_bulan INT)
RETURNS TABLE (wo_km NUMERIC, realisasi_km NUMERIC, disetujui_km NUMERIC)
LANGUAGE sql STABLE SET search_path = public AS $fn$
  WITH p AS (
    SELECT NULLIF(NULLIF(upper(btrim(COALESCE(p_ulp, ''))), ''), 'SEMUA') AS u,
           make_date(p_tahun, CASE WHEN p_bulan = 0 THEN 1 ELSE p_bulan END, 1) AS d_awal,
           CASE WHEN p_bulan = 0 THEN make_date(p_tahun + 1, 1, 1)
                ELSE (make_date(p_tahun, p_bulan, 1) + INTERVAL '1 month')::date END AS d_akhr
  )
  SELECT
    -- ★ per ITEM (jtm-drone-segmen.sql): segmen bisa dijadikan drone sesudah WO terbit.
    (SELECT round(COALESCE(sum(i.panjang_km), 0), 3)
       FROM public.wo_inspeksi_item i JOIN public.wo_inspeksi w ON w.id = i.wo_id, p
      WHERE w.jenis = 'JTM' AND COALESCE(i.tier, '1') = '1' AND i.drone AND i.status <> 'Dibatalkan'
        AND w.status <> 'Dibatalkan'
        AND w.tgl_wo >= p.d_awal AND w.tgl_wo < p.d_akhr
        AND (p.u IS NULL OR upper(i.ulp) = p.u)),
    round(COALESCE(sum(COALESCE(kd.km, sp.panjang_pakai_km)) FILTER (WHERE m.status IN ('Selesai', 'Diverifikasi')), 0), 3),
    round(COALESCE(sum(COALESCE(kd.km, sp.panjang_pakai_km)) FILTER (WHERE m.status = 'Diverifikasi'), 0), 3)
  FROM p, public.inspeksi_jtm m
  LEFT JOIN public.segmen_panjang sp ON sp.segmen_id = m.segmen_id
  LEFT JOIN public.inspeksi_jtm_km kd ON kd.inspeksi_id = m.id
  WHERE m.drone AND COALESCE(m.tier, '1') = '1'
    AND COALESCE(m.tgl_selesai, m.created_at) >= (p.d_awal::timestamp AT TIME ZONE 'Asia/Makassar')
    AND COALESCE(m.tgl_selesai, m.created_at) <  (p.d_akhr::timestamp AT TIME ZONE 'Asia/Makassar')
    AND (p.u IS NULL OR upper(m.ulp) = p.u)
$fn$;
GRANT EXECUTE ON FUNCTION public.rekap_jtm_drone(TEXT, INT, INT) TO authenticated;

NOTIFY pgrst, 'reload schema';


-- ── Periksa ──────────────────────────────────────────────────────────────────
--   SELECT ulp, jarak_maks_drone_m, target_drone_persen FROM jtm_settings;
--   SELECT objek_nama, tier, drone, sudah_dititik FROM wo_inspeksi_item_status
--    WHERE ulp = 'AMPENAN' AND status = 'Terbuka' AND tier = '1' LIMIT 10;
--   SELECT position('drone tidak menitik' IN pg_get_functiondef('public.kirim_tiang_jtm(jsonb)'::regprocedure)) > 0;
