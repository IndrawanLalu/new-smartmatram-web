-- =============================================================================
-- Inspeksi JTM "Tier 1 + drone" (28 Okt 2026) — rencana-jtm-tier1-drone.md
-- Jalankan SESUDAH jtm-tier2-titik.sql, jtm-kategori-temuan.sql, jtm-cek-jarak.sql.
-- Idempoten. SQL dulu, baru web & HP (OTA).
--
-- Keputusan user 28 Okt:
--   • Tier 1 + drone TETAP tier '1' — WO & realisasi Tier 1 = Tier 1 + drone,
--     jadi semua hitungan Tier 1 yang ada (Rekap Kinerja, SLA, lampiran, PRO
--     NTB, LM 4DX) otomatis memasukkannya. Penandanya kolom `drone`.
--   • Isian sama dengan Tier 1, tapi tiap tiang yang dinilai WAJIB ≥1 foto
--     drone (inspeksi_jtm_foto, kode 'drone').
--   • Jarak menilai tiang punya angka sendiri untuk drone + sakelar
--     Aktif/Nonaktif (Pengaturan JTM → Ambang lapangan).
--   • Boleh dikerjakan di luar WO (regu memilih chip "Tier 1 + drone").
--   • Baris LM 4DX "Inspeksi dengan Drone" diisi otomatis (di web).
--
--   1. Kolom drone (WO, item WO, inspeksi) + ambang jarak drone.
--   2. Item mewarisi drone dari WO; inspeksi mewarisi dari item WO-nya.
--   3. terbitkan_wo_inspeksi_jtm(…, p_drone) — disalin dari jtm-tier2-titik.sql, ★.
--   4. kirim_tiang_jtm & _nilai_tiang_jtm_inti (isi nilai_tiang_jtm sejak hak akses JTM) DITAMBAL pada definisi HIDUP
--      (pg_get_functiondef + ganti teks berpenanda) — fungsi besar tidak disalin
--      ulang, jadi tidak ada versi lebih baru yang tertimpa.
--   5. View item & capaian WO membawa drone.
--   6. rekap_jtm_drone — rincian drone untuk Rekap Kinerja.
-- =============================================================================


-- ── 1. Kolom ─────────────────────────────────────────────────────────────────
ALTER TABLE public.wo_inspeksi      ADD COLUMN IF NOT EXISTS drone BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE public.wo_inspeksi_item ADD COLUMN IF NOT EXISTS drone BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE public.inspeksi_jtm     ADD COLUMN IF NOT EXISTS drone BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE public.wo_inspeksi DROP CONSTRAINT IF EXISTS wo_inspeksi_drone_tier1;
ALTER TABLE public.wo_inspeksi ADD CONSTRAINT wo_inspeksi_drone_tier1 CHECK (NOT drone OR (tier = '1' AND jenis = 'JTM'));
ALTER TABLE public.inspeksi_jtm DROP CONSTRAINT IF EXISTS inspeksi_jtm_drone_tier1;
ALTER TABLE public.inspeksi_jtm ADD CONSTRAINT inspeksi_jtm_drone_tier1 CHECK (NOT drone OR COALESCE(tier, '1') = '1');
COMMENT ON COLUMN public.wo_inspeksi.drone IS 'WO Tier 1 + drone: tiap tiang wajib ≥1 foto drone, jarak menilai pakai ambang drone (28 Okt 2026).';
COMMENT ON COLUMN public.wo_inspeksi_item.drone IS 'Salinan wo_inspeksi.drone (pemicu trg_wo_item_ikut_tier).';
COMMENT ON COLUMN public.inspeksi_jtm.drone IS 'Inspeksi Tier 1 + drone — dari item WO-nya atau pilihan regu di luar WO.';

ALTER TABLE public.jtm_settings ADD COLUMN IF NOT EXISTS jarak_maks_drone_m NUMERIC(6,1) NOT NULL DEFAULT 300;
ALTER TABLE public.jtm_settings ADD COLUMN IF NOT EXISTS cek_jarak_drone BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE public.jtm_settings DROP CONSTRAINT IF EXISTS jtm_settings_jarak_drone_batas;
ALTER TABLE public.jtm_settings ADD CONSTRAINT jtm_settings_jarak_drone_batas CHECK (jarak_maks_drone_m BETWEEN 5 AND 5000);
COMMENT ON COLUMN public.jtm_settings.jarak_maks_drone_m IS 'Jarak terjauh pilot drone dari tiang saat menilai (Tier 1 + drone).';
COMMENT ON COLUMN public.jtm_settings.cek_jarak_drone IS 'false = jarak tidak diperiksa untuk inspeksi Tier 1 + drone.';


-- ── 2. Pewarisan ─────────────────────────────────────────────────────────────
-- Item mewarisi tier, mode titik DAN drone WO-nya (disalin dari jtm-tier2-titik.sql; ★).
CREATE OR REPLACE FUNCTION public.wo_item_ikut_tier()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $fn$
BEGIN
  SELECT w.tier, w.titik, w.drone INTO NEW.tier, NEW.titik, NEW.drone   -- ★ drone
  FROM public.wo_inspeksi w WHERE w.id = NEW.wo_id;
  NEW.tier := COALESCE(NEW.tier, '1');
  NEW.titik := COALESCE(NEW.titik, false);
  NEW.drone := COALESCE(NEW.drone, false);   -- ★
  RETURN NEW;
END $fn$;

-- Inspeksi yang tersambung ke item WO drone ikut drone. Hanya MENYALAKAN —
-- pilihan drone regu di luar WO tidak dimatikan oleh penyambungan WO biasa.
CREATE OR REPLACE FUNCTION public.inspeksi_jtm_ikut_drone()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $fn$
BEGIN
  IF NEW.wo_item_id IS NOT NULL AND NOT NEW.drone
     AND EXISTS (SELECT 1 FROM public.wo_inspeksi_item i WHERE i.id = NEW.wo_item_id AND i.drone) THEN
    NEW.drone := true;
  END IF;
  RETURN NEW;
END $fn$;
DROP TRIGGER IF EXISTS trg_inspeksi_jtm_ikut_drone ON public.inspeksi_jtm;
CREATE TRIGGER trg_inspeksi_jtm_ikut_drone BEFORE INSERT OR UPDATE OF wo_item_id ON public.inspeksi_jtm
  FOR EACH ROW EXECUTE FUNCTION public.inspeksi_jtm_ikut_drone();


-- ── 3. Terbitkan WO JTM ──────────────────────────────────────────────────────
DROP FUNCTION IF EXISTS public.terbitkan_wo_inspeksi_jtm(TEXT, TEXT, NUMERIC, UUID[], DATE, JSONB, TEXT, TEXT, BOOLEAN);
CREATE OR REPLACE FUNCTION public.terbitkan_wo_inspeksi_jtm(
  p_ulp       TEXT,
  p_nama      TEXT,
  p_target_km NUMERIC,
  p_segmen    UUID[],
  p_tgl_wo    DATE    DEFAULT CURRENT_DATE,
  p_regu      JSONB   DEFAULT '{}'::jsonb,
  p_oleh      TEXT    DEFAULT NULL,
  p_tier      TEXT    DEFAULT '1',
  p_titik     BOOLEAN DEFAULT false,       -- Tier 2 + titik
  p_drone     BOOLEAN DEFAULT false        -- ★ Tier 1 + drone
) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  unit     TEXT := upper(btrim(COALESCE(p_ulp, '')));
  judul    TEXT := btrim(COALESCE(p_nama, ''));
  wo       UUID;
  s        RECORD;
  item     UUID;
  n        INT := 0;
  dilewati JSONB := '[]'::jsonb;
  v_tier   TEXT := btrim(COALESCE(p_tier, '1'));
  v_titik  BOOLEAN := COALESCE(p_titik, false);
  v_drone  BOOLEAN := COALESCE(p_drone, false);   -- ★
BEGIN
  IF v_tier NOT IN ('1', '2') THEN RAISE EXCEPTION 'Tier WO harus 1 atau 2'; END IF;
  IF v_titik AND v_tier <> '2' THEN RAISE EXCEPTION 'Mode "+ titik" hanya untuk WO Tier 2'; END IF;
  IF v_drone AND v_tier <> '1' THEN RAISE EXCEPTION 'Mode "+ drone" hanya untuk WO Tier 1'; END IF;   -- ★
  IF unit = '' THEN RAISE EXCEPTION 'ULP belum dipilih'; END IF;
  IF judul = '' THEN RAISE EXCEPTION 'Nama WO belum diisi'; END IF;
  IF COALESCE(array_length(p_segmen, 1), 0) = 0 THEN RAISE EXCEPTION 'Belum ada segmen yang dipilih'; END IF;
  PERFORM public.wajib_boleh_ulp(unit);

  INSERT INTO public.wo_inspeksi (jenis, ulp, nama, tgl_wo, target_km, created_by, tier, titik, drone)   -- ★ drone
  VALUES ('JTM', unit, judul, COALESCE(p_tgl_wo, CURRENT_DATE), p_target_km, auth.uid(), v_tier, v_titik, v_drone)
  RETURNING id INTO wo;

  FOR s IN SELECT * FROM public.master_segmen WHERE segmen_id = ANY(p_segmen) ORDER BY penyulang, nama LOOP
    IF upper(s.ulp) <> unit THEN
      dilewati := dilewati || jsonb_build_object('segmen', s.nama, 'sebab', format('Milik ULP %s, bukan %s.', s.ulp, unit));
      CONTINUE;
    END IF;
    IF s.status <> 'aktif' THEN
      dilewati := dilewati || jsonb_build_object('segmen', s.nama, 'sebab', 'Segmen tidak aktif.');
      CONTINUE;
    END IF;
    IF EXISTS (SELECT 1 FROM public.wo_inspeksi_item x
               WHERE x.segmen_id = s.segmen_id AND x.status = 'Terbuka' AND x.tier = v_tier) THEN
      dilewati := dilewati || jsonb_build_object('segmen', s.nama, 'sebab', format('Masih terbuka di WO inspeksi Tier %s lain.', v_tier));
      CONTINUE;
    END IF;

    n := n + 1;
    INSERT INTO public.wo_inspeksi_item
      (wo_id, jenis, urutan, ulp, penyulang, segmen_id, objek_nama, panjang_km, panjang_dari, regu)
    VALUES
      (wo, 'JTM', n, s.ulp, s.penyulang, s.segmen_id, s.nama, s.panjang_pakai_km, s.panjang_dari,
       NULLIF(btrim(COALESCE(p_regu ->> s.segmen_id::text, '')), ''))
    RETURNING id INTO item;

    -- Inspeksi yang sudah berjalan ikut drone lewat pemicu trg_inspeksi_jtm_ikut_drone.
    UPDATE public.inspeksi_jtm SET wo_item_id = item, updated_at = now()
    WHERE segmen_id = s.segmen_id AND wo_item_id IS NULL
      AND COALESCE(tier, '1') = v_tier
      AND status IN ('Dijadwalkan', 'Dalam Proses', 'Selesai', 'Ditolak');
  END LOOP;

  IF n = 0 THEN
    RAISE EXCEPTION 'Tidak ada satu pun segmen yang bisa dimasukkan. %',
      COALESCE((SELECT string_agg(d ->> 'segmen' || ': ' || (d ->> 'sebab'), ' | ') FROM jsonb_array_elements(dilewati) d), '');
  END IF;

  INSERT INTO public.master_audit
    (entitas, entitas_kode, ulp, field, nilai_lama, nilai_baru, aksi, oleh_uid, oleh_nama)
  VALUES ('wo_inspeksi', judul, unit, 'terbit', NULL,
          jsonb_build_object('wo_id', wo, 'jenis', 'JTM', 'tier', v_tier, 'titik', v_titik, 'drone', v_drone,   -- ★ drone
                             'item', n, 'target_km', p_target_km),
          'sunting_admin', auth.uid(), p_oleh);

  RETURN jsonb_build_object('wo_id', wo, 'nama', judul, 'ulp', unit, 'tier', v_tier, 'titik', v_titik, 'drone', v_drone,
    'item', n, 'dilewati', dilewati,
    'rencana_km', (SELECT round(COALESCE(sum(panjang_km), 0), 2) FROM public.wo_inspeksi_item WHERE wo_id = wo));
END $fn$;
GRANT EXECUTE ON FUNCTION public.terbitkan_wo_inspeksi_jtm(TEXT, TEXT, NUMERIC, UUID[], DATE, JSONB, TEXT, TEXT, BOOLEAN, BOOLEAN) TO authenticated;


-- ── 4. Tambalan pada definisi hidup ──────────────────────────────────────────
-- Tiap tambalan mencari teks penandanya; bila tidak ketemu, skrip BERHENTI
-- (lebih baik gagal jelas daripada fungsi setengah tertambal). Bila penanda
-- "drone" sudah ada, tambalan dilewati — aman dijalankan ulang.
DO $tambal$
DECLARE
  def  TEXT;
  baru TEXT;
  pasang TEXT[][] := ARRAY[
    -- a. variabel
    ARRAY[E'  v_catatan TEXT;\nBEGIN',
          E'  v_catatan TEXT;\n  v_drone  BOOLEAN := false;   -- ★ Tier 1 + drone\nBEGIN'],
    -- b. inspeksi ini drone? (pilihan regu di luar WO, atau warisan item WO)
    ARRAY[E'  -- ── tiang ──\n',
          E'  -- ★ Tier 1 + drone (jtm-tier1-drone.sql): pilihan regu di luar WO menyalakan\n'
          || E'  -- penanda; yang dari WO sudah menyala lewat pemicu item WO.\n'
          || E'  IF COALESCE((p_isi->>''drone'')::boolean, false) AND v_tier = ''1'' THEN\n'
          || E'    UPDATE public.inspeksi_jtm SET drone = true WHERE id = v_id AND NOT drone;\n'
          || E'  END IF;\n'
          || E'  SELECT COALESCE(drone, false) INTO v_drone FROM public.inspeksi_jtm WHERE id = v_id;\n\n'
          || E'  -- ── tiang ──\n'],
    -- c. tiap tiang drone wajib ≥1 foto — ditolak per tiang, bukan seluruh kiriman
    ARRAY[E'      BEGIN\n        PERFORM public.nilai_tiang_jtm(',
          E'      BEGIN\n'
          || E'        IF v_drone AND NOT EXISTS (\n'
          || E'          SELECT 1 FROM jsonb_array_elements_text(CASE WHEN jsonb_typeof(r->''foto_tiang'') = ''array''\n'
          || E'                                                       THEN r->''foto_tiang'' ELSE ''[]''::jsonb END) u\n'
          || E'          WHERE u LIKE ''http%'') THEN\n'
          || E'          RAISE EXCEPTION ''Tier 1 + drone: tiang % wajib punya minimal 1 foto drone.'',\n'
          || E'            COALESCE((SELECT kode FROM public.tiang WHERE id = v_tiang), ''ini'');\n'
          || E'        END IF;\n'
          || E'        PERFORM public.nilai_tiang_jtm('],
    -- d. simpan foto drone tiang (ikut kiriman terakhir)
    ARRAY[E'    -- ★ induk_id ikut:',
          E'    -- ★ Foto drone tiang (Tier 1 + drone) — ikut kiriman terakhir.\n'
          || E'    IF v_ok IS TRUE AND v_drone AND jsonb_typeof(r->''daftar'') = ''array''\n'
          || E'       AND jsonb_typeof(r->''foto_tiang'') = ''array'' THEN\n'
          || E'      DELETE FROM public.inspeksi_jtm_foto f\n'
          || E'      USING public.inspeksi_jtm_titik tk\n'
          || E'      WHERE f.titik_id = tk.id AND tk.inspeksi_id = v_id AND tk.tiang_id = v_tiang AND f.kode = ''drone'';\n'
          || E'      INSERT INTO public.inspeksi_jtm_foto (titik_id, kode, url, lat, lng)\n'
          || E'      SELECT tk.id, ''drone'', u, tk.petugas_lat, tk.petugas_lng\n'
          || E'      FROM public.inspeksi_jtm_titik tk, jsonb_array_elements_text(r->''foto_tiang'') u\n'
          || E'      WHERE tk.inspeksi_id = v_id AND tk.tiang_id = v_tiang AND u LIKE ''http%'';\n'
          || E'    END IF;\n\n'
          || E'    -- ★ induk_id ikut:']
  ];
  i INT;
BEGIN
  -- kirim_tiang_jtm
  -- Baris CRLF (skrip ditempel dari berkas Windows) disamakan dulu supaya penanda cocok.
  SELECT replace(pg_get_functiondef('public.kirim_tiang_jtm(jsonb)'::regprocedure), E'\r\n', E'\n') INTO def;
  IF position('v_drone' IN def) = 0 THEN
    baru := def;
    FOR i IN 1 .. array_length(pasang, 1) LOOP
      IF (length(baru) - length(replace(baru, pasang[i][1], ''))) / length(pasang[i][1]) <> 1 THEN
        RAISE EXCEPTION 'Tambalan kirim_tiang_jtm #%: penanda tidak ditemukan tepat sekali — skrip dihentikan, tidak ada yang berubah.', i;
      END IF;
      baru := replace(baru, pasang[i][1], pasang[i][2]);
    END LOOP;
    EXECUTE baru;
    RAISE NOTICE 'kirim_tiang_jtm ditambal (drone).';
  ELSE
    RAISE NOTICE 'kirim_tiang_jtm sudah bertambalan drone — dilewati.';
  END IF;

  -- _nilai_tiang_jtm_inti: jarak menilai memakai ambang drone bila inspeksinya drone.
  IF (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public' AND p.proname = '_nilai_tiang_jtm_inti') <> 1 THEN
    RAISE EXCEPTION '_nilai_tiang_jtm_inti tidak tepat satu versi — skrip dihentikan.';
  END IF;
  SELECT replace(pg_get_functiondef(p.oid), E'\r\n', E'\n') INTO def
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = '_nilai_tiang_jtm_inti';
  IF position('jarak_maks_drone_m' IN def) = 0 THEN
    IF (length(def) - length(replace(def, 'SELECT * INTO amb FROM public.jtm_ambang(m.ulp);', '')))
       / length('SELECT * INTO amb FROM public.jtm_ambang(m.ulp);') <> 1 THEN
      RAISE EXCEPTION 'Tambalan _nilai_tiang_jtm_inti: penanda ambang tidak ditemukan tepat sekali — skrip dihentikan.';
    END IF;
    baru := replace(def, 'SELECT * INTO amb FROM public.jtm_ambang(m.ulp);',
      E'SELECT * INTO amb FROM public.jtm_ambang(m.ulp);\n'
      || E'  -- ★ Tier 1 + drone (jtm-tier1-drone.sql): pilot tidak berdiri di tiap tiang.\n'
      || E'  IF COALESCE(m.drone, false) THEN\n'
      || E'    amb.jarak_maks_nilai_m := CASE WHEN amb.cek_jarak_drone THEN amb.jarak_maks_drone_m ELSE 99999 END;\n'
      || E'  END IF;');
    EXECUTE baru;
    RAISE NOTICE '_nilai_tiang_jtm_inti ditambal (jarak drone).';
  ELSE
    RAISE NOTICE '_nilai_tiang_jtm_inti sudah bertambalan drone — dilewati.';
  END IF;
END $tambal$;


-- ── 5. View membawa drone ────────────────────────────────────────────────────
-- `i.*` dibekukan saat view dibuat → dibuat ulang (disalin dari jtm-tier2-titik.sql).
DROP VIEW IF EXISTS public.wo_inspeksi_item_status;
CREATE VIEW public.wo_inspeksi_item_status AS
SELECT
  i.*,
  w.nama   AS wo_nama,
  w.tgl_wo,
  m.id     AS inspeksi_id,
  m.status AS inspeksi_status,
  m.petugas_nama AS inspeksi_petugas,
  m.tgl_mulai    AS inspeksi_mulai,
  m.tgl_selesai  AS inspeksi_selesai,
  m.verified_note AS inspeksi_catatan_admin
FROM public.wo_inspeksi_item i
JOIN public.wo_inspeksi w ON w.id = i.wo_id
LEFT JOIN LATERAL (
  SELECT x.* FROM public.inspeksi_jtm x
  WHERE x.wo_item_id = i.id AND x.status <> 'Dibatalkan'
  ORDER BY x.created_at DESC LIMIT 1
) m ON true
WHERE i.jenis = 'JTM';
GRANT SELECT ON public.wo_inspeksi_item_status TO authenticated;

-- Disalin dari jtm-tier2-titik.sql; ★ kolom drone di belakang.
CREATE OR REPLACE VIEW public.wo_inspeksi_capaian AS
SELECT w.id AS wo_id, w.jenis, w.tier, w.ulp, w.nama, w.tgl_wo, w.target_km, w.status, w.created_at,
       count(i.id) FILTER (WHERE i.status <> 'Dibatalkan')                                   AS item,
       count(i.id) FILTER (WHERE i.status = 'Selesai')                                       AS item_selesai,
       round(COALESCE(sum(i.panjang_km) FILTER (WHERE i.status <> 'Dibatalkan'), 0), 2)      AS rencana_km,
       round(COALESCE(sum(i.panjang_km) FILTER (WHERE i.status = 'Selesai'), 0), 2)          AS capaian_km,
       w.titik,
       w.drone                                                                               -- ★
FROM public.wo_inspeksi w
LEFT JOIN public.wo_inspeksi_item i ON i.wo_id = w.id
GROUP BY w.id;
GRANT SELECT ON public.wo_inspeksi_capaian TO authenticated;


-- ── 6. Rincian drone untuk Rekap Kinerja ─────────────────────────────────────
-- Bagian dari baris Inspeksi JTM Tier 1 (angka utama TIDAK berubah): WO =
-- item WO Tier 1 + drone; realisasi = inspeksi drone yang dikirim di bulan itu
-- (bulan DIKIRIM, km dibekukan saat disetujui — sama dengan _rekap_kinerja_inti).
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
    (SELECT round(COALESCE(sum(i.panjang_km), 0), 3)
       FROM public.wo_inspeksi_item i JOIN public.wo_inspeksi w ON w.id = i.wo_id, p
      WHERE w.jenis = 'JTM' AND w.tier = '1' AND w.drone AND i.status <> 'Dibatalkan'
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
--   SELECT position('v_drone' IN pg_get_functiondef('public.kirim_tiang_jtm(jsonb)'::regprocedure)) > 0;   -- true
--   SELECT jarak_maks_drone_m, cek_jarak_drone FROM jtm_ambang('AMPENAN');
--   SELECT * FROM rekap_jtm_drone('AMPENAN', 2026, 10);
--   SELECT tier, titik, drone, count(*) FROM wo_inspeksi WHERE jenis = 'JTM' GROUP BY 1, 2, 3;
