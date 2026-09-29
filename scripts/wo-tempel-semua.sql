-- =============================================================================
-- Tempel WO untuk SEMUA jenis + Bulan WO (keputusan user 29 Sep 2026)
-- Jalankan manual di Supabase SQL Editor, SESUDAH `wo-surat-yantek.sql`.
-- Idempoten.
--
-- Tidak semua ULP sudah menyusun WO di aplikasi. Tempelan Excel dari layar
-- Cetak / Kirim WO kini MENJADI WO modulnya — muncul di HP regu, dihitung
-- Rekap Kinerja, masuk lampiran surat — sama persis dengan WO yang disusun di
-- aplikasi. Yang modulnya belum ada tetap ke `wo_manual`.
--
--   Format GARDU : Gardu · Alamat · kVA · Keterangan · Pelaksana
--   Format KMS   : (Penyulang) · Segment/Gardu · KMS · Keterangan · Pelaksana
--   Harjar       : Uraian Pekerjaan · Segment/Gardu · KMS · Keterangan (JTM/JTR) · Pelaksana
--
-- Aturan (keputusan user):
--   • Objek yang sudah ada di WO bulan itu / masih terbuka di WO lain:
--     DILEWATI, disebut alasannya.
--   • Gardu yang tidak ada di master: TIDAK disimpan, disebut.
--   • Perabasan: segmen yang belum ada di master DIBUAT sebagai segmen
--     bersumber 'tempelan' (muncul di HP, dan di pemilih segmen bulan depan
--     dengan saringan Sistem/Tempelan). Penyulangnya wajib ada di master.
--   • Inspeksi JTM: segmen yang belum ada di master masuk `wo_manual` (surat &
--     rekap saja) — inspeksi JTM di HP berjalan per tiang, dan segmen
--     tempelan belum punya tiang.
--   • Optimasi Trafo TIDAK bisa ditempel: WO-nya lahir dari hasil pengukuran.
--
-- ── BULAN WO ────────────────────────────────────────────────────────────────
-- WO bulan depan disusun di akhir bulan ini, jadi tanggal pembuatan bukan
-- bulan WO-nya: "WO JTR OKTOBER" bertanggal 29 Sep terhitung September di
-- rekap dan surat. WO Inspeksi dan WO Perabasan kini mengikuti WO Pengukuran:
-- `tgl_wo` = tanggal 1 BULAN WO. Kapan dibuat tetap ada di `created_at`.
--
--   1. Bulan WO: pindahkan WO lama + penjaga tanggal 1
--   2. Kolom pelaksana & keterangan di item WO; kolom baru wo_manual_item
--   3. Alasan 'tempelan' di WO Pemeliharaan Gardu & Pengukuran
--   4. Segmen tempelan: nama disimpan apa adanya; pencocok nama
--   5. tempel_wo — satu pintu untuk semua jenis
--   6. wo_surat_objek — kolom lampiran per format
--   7. _rekap_kinerja_inti — JTM Tier 1 = WO sistem + tempelan
-- =============================================================================


-- ── 1. Bulan WO ──────────────────────────────────────────────────────────────
-- Nama bulan di nama WO menang ("WO JTR OKTOBER" → Oktober); tanpa nama bulan,
-- bulan tanggal WO-nya. Tahun ikut tanggal WO, kecuali nama bulannya jauh di
-- belakang (WO "JANUARI" dibuat Desember → tahun berikutnya).
CREATE OR REPLACE FUNCTION public._bulan_dari_nama(p_nama TEXT, p_tgl DATE)
RETURNS DATE
LANGUAGE plpgsql IMMUTABLE AS $fn$
DECLARE
  t   TEXT := upper(COALESCE(p_nama, ''));
  pol TEXT[] := ARRAY['JANUARI|JAN', 'FEBRUARI|FEB', 'MARET|MAR', 'APRIL|APR', 'MEI', 'JUNI|JUN', 'JULI|JUL',
                      'AGUSTUS|AGT|AGS|AGU', 'SEPTEMBER|SEPT|SEP', 'OKTOBER|OKT', 'NOVEMBER|NOV', 'DESEMBER|DES'];
  m   INT;
  y   INT := extract(year FROM p_tgl)::int;
BEGIN
  -- Kata utuh saja: "DESA" bukan Desember, "MARINA" bukan Maret.
  FOR i IN 1..12 LOOP
    IF t ~ ('\m(' || pol[i] || ')\M') THEN m := i; EXIT; END IF;
  END LOOP;
  IF m IS NULL THEN RETURN date_trunc('month', p_tgl)::date; END IF;
  IF m < extract(month FROM p_tgl)::int - 6 THEN y := y + 1; END IF;
  RETURN make_date(y, m, 1);
END $fn$;

-- Hanya WO yang tanggalnya belum tanggal 1 — menjalankan ulang tidak mengubah apa pun.
UPDATE public.wo_inspeksi  SET tgl_wo = public._bulan_dari_nama(nama, tgl_wo) WHERE extract(day FROM tgl_wo) <> 1 OR tgl_wo <> public._bulan_dari_nama(nama, tgl_wo);
UPDATE public.wo_perabasan SET tgl_wo = public._bulan_dari_nama(nama, tgl_wo) WHERE extract(day FROM tgl_wo) <> 1 OR tgl_wo <> public._bulan_dari_nama(nama, tgl_wo);

-- Penjaga: siapa pun yang menulis (layar lama, fungsi lama), tanggalnya jadi
-- tanggal 1 bulan itu.
CREATE OR REPLACE FUNCTION public.wo_tgl_awal_bulan()
RETURNS TRIGGER LANGUAGE plpgsql AS $fn$
BEGIN
  NEW.tgl_wo := date_trunc('month', NEW.tgl_wo)::date;
  RETURN NEW;
END $fn$;
DROP TRIGGER IF EXISTS trg_wo_inspeksi_awal_bulan ON public.wo_inspeksi;
CREATE TRIGGER trg_wo_inspeksi_awal_bulan BEFORE INSERT OR UPDATE OF tgl_wo ON public.wo_inspeksi
  FOR EACH ROW EXECUTE FUNCTION public.wo_tgl_awal_bulan();
DROP TRIGGER IF EXISTS trg_wo_perabasan_awal_bulan ON public.wo_perabasan;
CREATE TRIGGER trg_wo_perabasan_awal_bulan BEFORE INSERT OR UPDATE OF tgl_wo ON public.wo_perabasan
  FOR EACH ROW EXECUTE FUNCTION public.wo_tgl_awal_bulan();


-- ── 2. Kolom baru ────────────────────────────────────────────────────────────
-- `pelaksana` = teks dari Excel, untuk lampiran. Berbeda dari `regu` (yang
-- menentukan HP siapa) — "DIKA & IKRABUL" bukan nama regu terdaftar.
ALTER TABLE public.wo_perabasan_item  ADD COLUMN IF NOT EXISTS pelaksana TEXT, ADD COLUMN IF NOT EXISTS keterangan TEXT;
ALTER TABLE public.wo_inspeksi_item   ADD COLUMN IF NOT EXISTS pelaksana TEXT, ADD COLUMN IF NOT EXISTS keterangan TEXT;
ALTER TABLE public.wo_hargardu_item   ADD COLUMN IF NOT EXISTS pelaksana TEXT, ADD COLUMN IF NOT EXISTS keterangan TEXT;
ALTER TABLE public.wo_pengukuran_item ADD COLUMN IF NOT EXISTS pelaksana TEXT, ADD COLUMN IF NOT EXISTS keterangan TEXT;
ALTER TABLE public.wo_manual_item
  ADD COLUMN IF NOT EXISTS penyulang TEXT,
  ADD COLUMN IF NOT EXISTS kva NUMERIC(10,2),
  ADD COLUMN IF NOT EXISTS uraian TEXT;


-- ── 3. Alasan 'tempelan' ─────────────────────────────────────────────────────
ALTER TABLE public.wo_hargardu_item DROP CONSTRAINT IF EXISTS wo_hargardu_item_alasan_check;
ALTER TABLE public.wo_hargardu_item ADD CONSTRAINT wo_hargardu_item_alasan_check
  CHECK (alasan IN ('belum_pernah', 'jatuh_tempo', 'rencana', 'sisa', 'tempelan'));
ALTER TABLE public.wo_pengukuran_item DROP CONSTRAINT IF EXISTS wo_pengukuran_item_alasan_check;
ALTER TABLE public.wo_pengukuran_item ADD CONSTRAINT wo_pengukuran_item_alasan_check
  CHECK (alasan IN ('belum_pernah', 'kedaluwarsa', 'tempelan'));


-- ── 4. Segmen tempelan ───────────────────────────────────────────────────────
-- Disalin dari `jtm-schema.sql`; satu perubahan (★): segmen 'tempelan'
-- menyimpan namanya seperti ditulis di Excel, tidak disusun dari titik ujung.
CREATE OR REPLACE FUNCTION public.segmen_susun_nama()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  induk_id UUID;
BEGIN
  -- ★
  IF NOT (NEW.sumber = 'tempelan' AND COALESCE(btrim(NEW.nama), '') <> '') THEN
    NEW.nama := public.segmen_label_titik(NEW.titik_awal_jenis, NEW.titik_awal_nama)
                || ' - ' ||
                public.segmen_label_titik(NEW.titik_akhir_jenis, NEW.titik_akhir_nama);
  END IF;

  IF NEW.titik_awal_tiang_id IS NOT NULL THEN
    SELECT s.id INTO induk_id
    FROM public.segmen_tiang st
    JOIN public.segmen s ON s.id = st.segmen_id
    WHERE st.tiang_id = NEW.titik_awal_tiang_id
      AND s.status = 'aktif'
      AND upper(s.penyulang) = upper(NEW.penyulang)
      AND s.id IS DISTINCT FROM NEW.id
    ORDER BY s.created_at
    LIMIT 1;

    NEW.induk_segmen_id := induk_id;
  ELSE
    NEW.induk_segmen_id := NULL;
  END IF;

  NEW.updated_at := now();
  RETURN NEW;
END $$;

-- "REC. BRIMOB" dan "rec  brimob" dianggap nama yang sama.
CREATE OR REPLACE FUNCTION public._nama_segmen_baku(p TEXT)
RETURNS TEXT
LANGUAGE sql IMMUTABLE AS $fn$
  SELECT btrim(regexp_replace(upper(replace(COALESCE(p, ''), '.', ' ')), '\s+', ' ', 'g'));
$fn$;


-- ── 5a. Penyulang tempelan: semua atau tidak sama sekali ─────────────────────
-- Keputusan user 29 Sep 2026: satu saja penyulang yang kosong / tidak terdaftar
-- / milik ULP lain → SELURUH tempelan DITAHAN, tidak ada yang disimpan. ULP
-- membetulkan datanya dulu, supaya tidak ada kebingungan segmen mana yang
-- masuk dan mana yang tidak.
CREATE OR REPLACE FUNCTION public.cek_tempel_penyulang(p_ulp TEXT, p_item JSONB)
RETURNS JSONB
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $fn$
  SELECT COALESCE(jsonb_agg(jsonb_build_object('objek', btrim(x->>'objek'), 'sebab',
    CASE WHEN NULLIF(btrim(x->>'penyulang'), '') IS NULL THEN 'Kolom penyulang kosong.'
         WHEN EXISTS (SELECT 1 FROM public.penyulang_ref p WHERE upper(p.penyulang) = upper(btrim(x->>'penyulang')))
           THEN format('Penyulang "%s" milik ULP %s, bukan %s.', btrim(x->>'penyulang'),
                  (SELECT string_agg(DISTINCT p.ulp, '/') FROM public.penyulang_ref p WHERE upper(p.penyulang) = upper(btrim(x->>'penyulang'))),
                  upper(btrim(p_ulp)))
         ELSE format('Penyulang "%s" tidak ada di Master Penyulang.', btrim(x->>'penyulang')) END)), '[]'::jsonb)
  FROM jsonb_array_elements(COALESCE(p_item, '[]'::jsonb)) x
  WHERE NULLIF(btrim(x->>'objek'), '') IS NOT NULL
    AND NOT EXISTS (SELECT 1 FROM public.penyulang_ref p
                    WHERE upper(p.penyulang) = upper(btrim(COALESCE(x->>'penyulang', '')))
                      AND upper(p.ulp) = upper(btrim(p_ulp)));
$fn$;
GRANT EXECUTE ON FUNCTION public.cek_tempel_penyulang(TEXT, JSONB) TO authenticated;


-- ── 5. tempel_wo ─────────────────────────────────────────────────────────────
-- p_item: [{objek, alamat, penyulang, km, kva, uraian, keterangan, pelaksana}]
-- Hasil: {masuk, dilewati:[{objek,sebab}], ditolak:[{objek,sebab}],
--         manual, segmen_baru, tanpa_regu}
CREATE OR REPLACE FUNCTION public.tempel_wo(
  p_ulp TEXT, p_tahun INT, p_bulan INT, p_jenis TEXT, p_item JSONB, p_oleh TEXT DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  unit     TEXT := upper(btrim(COALESCE(p_ulp, '')));
  awal     DATE := make_date(p_tahun, p_bulan, 1);
  label    TEXT := (ARRAY['Januari','Februari','Maret','April','Mei','Juni','Juli','Agustus',
                          'September','Oktober','November','Desember'])[p_bulan] || ' ' || p_tahun;
  x        JSONB;
  v_obj    TEXT;
  ket      TEXT;
  plk      TEXT;
  v_km     NUMERIC;
  g        RECORD;
  s        RECORD;
  wo       UUID;
  item     UUID;
  urut     INT;
  sid      UUID;
  v_sumber TEXT;
  bagian   TEXT[];
  ta       RECORD;
  tk       RECORD;
  regu_ok  TEXT;
  masuk    INT := 0;
  baru     INT := 0;
  tanpa    INT := 0;
  n_manual INT := 0;
  dilewati JSONB := '[]'::jsonb;
  ditolak  JSONB := '[]'::jsonb;
  manual   JSONB := '[]'::jsonb;
BEGIN
  IF unit = '' THEN RAISE EXCEPTION 'ULP belum dipilih'; END IF;
  PERFORM public.wajib_boleh_ulp(unit);
  IF p_jenis = 'optimasi' THEN
    RAISE EXCEPTION 'WO Optimasi Trafo tidak bisa ditempel — WO-nya lahir dari hasil pengukuran.';
  END IF;
  IF jsonb_typeof(COALESCE(p_item, 'null'::jsonb)) <> 'array' THEN RAISE EXCEPTION 'Isi tempelan tidak terbaca'; END IF;

  -- Penyulang salah satu saja → ditahan seluruhnya (lihat 5a).
  IF p_jenis IN ('perabasan', 'jtm', 'jtm2') THEN
    ditolak := public.cek_tempel_penyulang(unit, p_item);
    IF jsonb_array_length(ditolak) > 0 THEN
      RETURN jsonb_build_object('ditahan', true, 'masuk', 0, 'manual', 0, 'segmen_baru', 0, 'tanpa_regu', 0,
                                'dilewati', '[]'::jsonb, 'ditolak', ditolak);
    END IF;
  END IF;

  -- ── Jenis tanpa modul: wo_manual (tempel ulang = mengganti) ──
  IF p_jenis IN ('harjtm', 'penyeimbangan', 'jtm2', 'igardu1', 'igardu2') THEN
    FOR x IN SELECT * FROM jsonb_array_elements(p_item) LOOP
      v_obj := btrim(COALESCE(x->>'objek', ''));
      CONTINUE WHEN v_obj = '';
      -- Bersatuan gardu: gardunya wajib ada di master.
      IF p_jenis IN ('penyeimbangan', 'igardu1', 'igardu2') THEN
        SELECT * INTO g FROM public.gardu gg WHERE upper(gg.kode) = upper(v_obj) AND upper(gg.ulp) = unit LIMIT 1;
        IF NOT FOUND THEN
          ditolak := ditolak || jsonb_build_object('objek', v_obj, 'sebab', format('Gardu tidak ada di Master Gardu %s.', unit));
          CONTINUE;
        END IF;
        x := x || jsonb_build_object('objek', g.kode, 'alamat', COALESCE(NULLIF(x->>'alamat', ''), g.alamat),
                                     'kva', COALESCE(NULLIF(x->>'kva', ''), g.daya::text), 'penyulang', g.feeder);
      END IF;
      manual := manual || x;
    END LOOP;
    n_manual := public._simpan_wo_manual_isi(unit, p_tahun, p_bulan, p_jenis, manual, p_oleh);
    RETURN jsonb_build_object('masuk', 0, 'manual', n_manual, 'segmen_baru', 0, 'tanpa_regu', 0,
                              'dilewati', dilewati, 'ditolak', ditolak);
  END IF;

  -- ── Pemeliharaan Gardu & Pengukuran: satu WO per ULP per bulan ──
  IF p_jenis IN ('hargardu', 'pengukuran') THEN
    IF p_jenis = 'hargardu' THEN
      SELECT id INTO wo FROM public.wo_hargardu WHERE ulp = unit AND tahun = p_tahun AND bulan = p_bulan;
      IF wo IS NULL THEN
        INSERT INTO public.wo_hargardu (ulp, bulan, tahun, tgl_wo, kuota, kriteria, created_by)
        VALUES (unit, p_bulan, p_tahun, awal, 0, jsonb_build_object('sumber', 'tempelan'), auth.uid())
        RETURNING id INTO wo;
      END IF;
      SELECT COALESCE(max(urutan), 0) INTO urut FROM public.wo_hargardu_item WHERE wo_id = wo;
    ELSE
      SELECT id INTO wo FROM public.wo_pengukuran WHERE ulp = unit AND tahun = p_tahun AND bulan = p_bulan;
      IF wo IS NULL THEN
        INSERT INTO public.wo_pengukuran (ulp, bulan, tahun, tgl_wo, kuota, kriteria, created_by)
        VALUES (unit, p_bulan, p_tahun, awal, 0, jsonb_build_object('sumber', 'tempelan'), auth.uid())
        RETURNING id INTO wo;
      END IF;
      SELECT COALESCE(max(urutan), 0) INTO urut FROM public.wo_pengukuran_item WHERE wo_id = wo;
    END IF;

    FOR x IN SELECT * FROM jsonb_array_elements(p_item) LOOP
      v_obj := btrim(COALESCE(x->>'objek', ''));
      CONTINUE WHEN v_obj = '';
      SELECT * INTO g FROM public.gardu gg WHERE upper(gg.kode) = upper(v_obj) AND upper(gg.ulp) = unit LIMIT 1;
      IF NOT FOUND THEN
        ditolak := ditolak || jsonb_build_object('objek', v_obj, 'sebab', format('Gardu tidak ada di Master Gardu %s.', unit));
        CONTINUE;
      END IF;
      ket := NULLIF(btrim(COALESCE(x->>'keterangan', '')), '');
      plk := NULLIF(btrim(COALESCE(x->>'pelaksana', '')), '');

      IF p_jenis = 'hargardu' THEN
        IF EXISTS (SELECT 1 FROM public.wo_hargardu_item WHERE wo_id = wo AND upper(gardu_kode) = upper(g.kode)) THEN
          dilewati := dilewati || jsonb_build_object('objek', g.kode, 'sebab', format('Sudah ada di WO Pemeliharaan %s.', label));
          CONTINUE;
        END IF;
        urut := urut + 1;
        INSERT INTO public.wo_hargardu_item (wo_id, gardu_kode, ulp, nama, alamat, penyulang, lat, lng, alasan, urutan, pelaksana, keterangan)
        VALUES (wo, g.kode, unit, g.nama, g.alamat, g.feeder, g.lat, g.lng, 'tempelan', urut, plk, ket);
      ELSE
        IF EXISTS (SELECT 1 FROM public.wo_pengukuran_item WHERE wo_id = wo AND upper(kode_gardu) = upper(g.kode)) THEN
          dilewati := dilewati || jsonb_build_object('objek', g.kode, 'sebab', format('Sudah ada di WO Pengukuran %s.', label));
          CONTINUE;
        END IF;
        urut := urut + 1;
        INSERT INTO public.wo_pengukuran_item (wo_id, kode_gardu, ulp, nama, alamat, penyulang, kva_master, lat, lng, alasan, urutan, pelaksana, keterangan)
        VALUES (wo, g.kode, unit, g.nama, g.alamat, g.feeder, g.daya, g.lat, g.lng, 'tempelan', urut, plk, ket);
      END IF;
      masuk := masuk + 1;
    END LOOP;

    -- Kuota = isi WO. Target yang lebih kecil dari isinya membuat capaian > 100%.
    IF p_jenis = 'hargardu' THEN
      UPDATE public.wo_hargardu SET kuota = (SELECT count(*) FROM public.wo_hargardu_item WHERE wo_id = wo) WHERE id = wo;
      DELETE FROM public.wo_hargardu h WHERE h.id = wo AND NOT EXISTS (SELECT 1 FROM public.wo_hargardu_item WHERE wo_id = wo);
    ELSE
      UPDATE public.wo_pengukuran SET kuota = (SELECT count(*) FROM public.wo_pengukuran_item WHERE wo_id = wo) WHERE id = wo;
      DELETE FROM public.wo_pengukuran h WHERE h.id = wo AND NOT EXISTS (SELECT 1 FROM public.wo_pengukuran_item WHERE wo_id = wo);
    END IF;

    RETURN jsonb_build_object('masuk', masuk, 'manual', 0, 'segmen_baru', 0, 'tanpa_regu', 0,
                              'dilewati', dilewati, 'ditolak', ditolak);
  END IF;

  -- ── Inspeksi JTR: kode gardu → WO inspeksi JTR tempelan bulan itu ──
  IF p_jenis = 'jtr' THEN
    SELECT id INTO wo FROM public.wo_inspeksi
    WHERE jenis = 'JTR' AND ulp = unit AND tgl_wo = awal AND catatan = 'tempelan' AND status = 'Terbit' LIMIT 1;
    IF wo IS NULL THEN
      INSERT INTO public.wo_inspeksi (jenis, ulp, nama, tgl_wo, target_km, catatan, created_by)
      VALUES ('JTR', unit, 'WO Inspeksi JTR ' || label || ' (tempelan)', awal, 0, 'tempelan', auth.uid())
      RETURNING id INTO wo;
    END IF;
    SELECT COALESCE(max(urutan), 0) INTO urut FROM public.wo_inspeksi_item WHERE wo_id = wo;

    FOR x IN SELECT * FROM jsonb_array_elements(p_item) LOOP
      v_obj := btrim(COALESCE(x->>'objek', ''));
      CONTINUE WHEN v_obj = '';
      SELECT * INTO g FROM public.master_gardu_jtr WHERE gardu_kode = upper(v_obj) AND ulp = unit LIMIT 1;
      IF NOT FOUND THEN
        ditolak := ditolak || jsonb_build_object('objek', v_obj, 'sebab', format('Gardu tidak ada di Master Gardu %s.', unit));
        CONTINUE;
      END IF;
      IF EXISTS (SELECT 1 FROM public.wo_inspeksi_item i WHERE i.jenis = 'JTR' AND upper(i.gardu_kode) = g.gardu_kode
                   AND upper(i.ulp) = unit AND i.status = 'Terbuka') THEN
        dilewati := dilewati || jsonb_build_object('objek', g.gardu_kode, 'sebab', 'Masih terbuka di WO inspeksi JTR lain.');
        CONTINUE;
      END IF;
      v_km := NULLIF(x->>'km', '')::numeric;
      plk := NULLIF(btrim(COALESCE(x->>'pelaksana', '')), '');
      SELECT r.regu INTO regu_ok FROM public.regu_inspeksi r
        WHERE upper(r.regu) = upper(plk) AND upper(r.ulp) = unit AND r.jtr LIMIT 1;
      urut := urut + 1;
      INSERT INTO public.wo_inspeksi_item
        (wo_id, jenis, urutan, ulp, penyulang, gardu_kode, objek_nama, panjang_km, panjang_dari, regu, pelaksana, keterangan)
      VALUES
        (wo, 'JTR', urut, g.ulp, g.penyulang, g.gardu_kode, concat_ws(' · ', g.gardu_kode, NULLIF(btrim(g.nama), '')),
         CASE WHEN g.panjang_km > 0 THEN g.panjang_km ELSE v_km END,
         CASE WHEN g.panjang_km > 0 THEN 'hitungan' WHEN v_km > 0 THEN 'ketikan' ELSE 'kosong' END,
         regu_ok, plk, NULLIF(btrim(COALESCE(x->>'keterangan', '')), ''))
      RETURNING id INTO item;
      UPDATE public.inspeksi_jtr SET wo_item_id = item, updated_at = now()
      WHERE upper(gardu_kode) = g.gardu_kode AND upper(ulp) = g.ulp AND wo_item_id IS NULL
        AND status IN ('Dijadwalkan', 'Dalam Proses', 'Selesai', 'Ditolak');
      masuk := masuk + 1;
    END LOOP;

    UPDATE public.wo_inspeksi SET target_km = (SELECT round(COALESCE(sum(panjang_km), 0), 2)
      FROM public.wo_inspeksi_item WHERE wo_id = wo AND status <> 'Dibatalkan') WHERE id = wo;
    DELETE FROM public.wo_inspeksi w WHERE w.id = wo AND NOT EXISTS (SELECT 1 FROM public.wo_inspeksi_item WHERE wo_id = wo);
    RETURN jsonb_build_object('masuk', masuk, 'manual', 0, 'segmen_baru', 0, 'tanpa_regu', 0,
                              'dilewati', dilewati, 'ditolak', ditolak);
  END IF;

  -- ── Inspeksi JTM Tier 1 & Perabasan: bersatuan segmen ──
  IF p_jenis NOT IN ('jtm', 'perabasan') THEN RAISE EXCEPTION 'Jenis WO % tidak dikenal', p_jenis; END IF;

  IF p_jenis = 'jtm' THEN
    SELECT id INTO wo FROM public.wo_inspeksi
    WHERE jenis = 'JTM' AND ulp = unit AND tgl_wo = awal AND catatan = 'tempelan' AND status = 'Terbit' LIMIT 1;
    IF wo IS NULL THEN
      INSERT INTO public.wo_inspeksi (jenis, ulp, nama, tgl_wo, target_km, catatan, created_by)
      VALUES ('JTM', unit, 'WO Inspeksi JTM ' || label || ' (tempelan)', awal, 0, 'tempelan', auth.uid())
      RETURNING id INTO wo;
    END IF;
    SELECT COALESCE(max(urutan), 0) INTO urut FROM public.wo_inspeksi_item WHERE wo_id = wo;
  ELSE
    SELECT id INTO wo FROM public.wo_perabasan
    WHERE ulp = unit AND tgl_wo = awal AND catatan = 'tempelan' AND status = 'Terbit' LIMIT 1;
    IF wo IS NULL THEN
      -- target_km wajib > 0; diganti isi WO di akhir.
      INSERT INTO public.wo_perabasan (ulp, nama, tgl_wo, target_km, catatan, created_by)
      VALUES (unit, 'WO Perabasan ' || label || ' (tempelan)', awal, 0.01, 'tempelan', auth.uid())
      RETURNING id INTO wo;
    END IF;
    SELECT COALESCE(max(urutan), 0) INTO urut FROM public.wo_perabasan_item WHERE wo_id = wo;
  END IF;

  FOR x IN SELECT * FROM jsonb_array_elements(p_item) LOOP
    v_obj := btrim(regexp_replace(COALESCE(x->>'objek', ''), '\s+', ' ', 'g'));
    CONTINUE WHEN v_obj = '';
    v_km := NULLIF(x->>'km', '')::numeric;
    ket := NULLIF(btrim(COALESCE(x->>'keterangan', '')), '');
    plk := NULLIF(btrim(COALESCE(x->>'pelaksana', '')), '');

    -- Cocokkan ke master: nama baku sama, di ULP ini, dan (kalau disebut) penyulang sama.
    SELECT ms.* INTO s FROM public.master_segmen ms
    WHERE upper(ms.ulp) = unit AND ms.status = 'aktif'
      AND public._nama_segmen_baku(ms.nama) = public._nama_segmen_baku(v_obj)
      AND (NULLIF(btrim(x->>'penyulang'), '') IS NULL OR upper(ms.penyulang) = upper(btrim(x->>'penyulang')))
    ORDER BY ms.sumber = 'tempelan'
    LIMIT 1;

    IF NOT FOUND THEN
      IF p_jenis = 'jtm' THEN
        manual := manual || x;  -- surat & rekap saja
        CONTINUE;
      END IF;
      -- Perabasan: buat segmen tempelan. Penyulangnya wajib terdaftar DI ULP INI
      -- — penyulang ULP lain tidak boleh jadi segmen ULP ini (dilaporkan user).
      IF NOT EXISTS (SELECT 1 FROM public.penyulang_ref p
                     WHERE upper(p.penyulang) = upper(btrim(COALESCE(x->>'penyulang', ''))) AND upper(p.ulp) = unit) THEN
        ditolak := ditolak || jsonb_build_object('objek', v_obj, 'sebab',
          CASE WHEN NULLIF(btrim(x->>'penyulang'), '') IS NULL THEN 'Kolom penyulang kosong — segmen baru wajib punya penyulang.'
               WHEN EXISTS (SELECT 1 FROM public.penyulang_ref p WHERE upper(p.penyulang) = upper(btrim(x->>'penyulang')))
                 THEN format('Penyulang "%s" milik ULP %s, bukan %s.', btrim(x->>'penyulang'),
                             (SELECT string_agg(DISTINCT p.ulp, '/') FROM public.penyulang_ref p WHERE upper(p.penyulang) = upper(btrim(x->>'penyulang'))), unit)
               ELSE format('Penyulang "%s" tidak ada di Master Penyulang %s.', btrim(x->>'penyulang'), unit) END);
        CONTINUE;
      END IF;
      -- Nama yang sama sudah ada tapi NONAKTIF: tempelan lama (WO-nya dibatalkan)
      -- dihidupkan lagi; segmen sistem yang dinonaktifkan tidak dihidupkan diam-diam.
      SELECT sg.id, sg.sumber INTO sid, v_sumber
      FROM public.segmen sg
      WHERE upper(sg.ulp) = unit AND sg.status = 'nonaktif'
        AND upper(sg.penyulang) = upper(btrim(x->>'penyulang'))
        AND public._nama_segmen_baku(sg.nama) = public._nama_segmen_baku(v_obj)
      LIMIT 1;
      IF sid IS NOT NULL AND v_sumber <> 'tempelan' THEN
        ditolak := ditolak || jsonb_build_object('objek', v_obj, 'sebab',
          'Segmen ini ada di Master Segmen tetapi berstatus nonaktif — aktifkan dulu di Master Segmen.');
        CONTINUE;
      END IF;
      IF sid IS NOT NULL THEN
        UPDATE public.segmen SET status = 'aktif', updated_at = now(),
          panjang_manual_km = COALESCE(CASE WHEN v_km > 0 AND v_km <= 200 THEN v_km END, panjang_manual_km)
        WHERE id = sid;
        SELECT ms.* INTO s FROM public.master_segmen ms WHERE ms.segmen_id = sid;
      ELSE
      bagian := regexp_split_to_array(v_obj, '\s+-\s+');
      SELECT * INTO ta FROM public.pisah_label_titik(bagian[1]);
      SELECT * INTO tk FROM public.pisah_label_titik(CASE WHEN array_length(bagian, 1) > 1 THEN array_to_string(bagian[2:], ' - ') ELSE '' END);
      INSERT INTO public.segmen (penyulang, ulp, titik_awal_jenis, titik_awal_nama, titik_akhir_jenis, titik_akhir_nama,
                                 nama, sumber, panjang_manual_km, catatan)
      VALUES ((SELECT p.penyulang FROM public.penyulang_ref p
               WHERE upper(p.penyulang) = upper(btrim(x->>'penyulang')) AND upper(p.ulp) = unit LIMIT 1),
              unit, ta.jenis, ta.nama, tk.jenis, tk.nama, upper(v_obj), 'tempelan',
              CASE WHEN v_km > 0 AND v_km <= 200 THEN v_km END,
              format('Dibuat dari tempelan WO %s oleh %s.', label, COALESCE(p_oleh, '-')))
      RETURNING id INTO sid;
      baru := baru + 1;
      SELECT ms.* INTO s FROM public.master_segmen ms WHERE ms.segmen_id = sid;
      END IF;
    END IF;

    IF p_jenis = 'jtm' THEN
      IF EXISTS (SELECT 1 FROM public.wo_inspeksi_item i WHERE i.segmen_id = s.segmen_id AND i.status = 'Terbuka') THEN
        dilewati := dilewati || jsonb_build_object('objek', s.nama, 'sebab', 'Masih terbuka di WO inspeksi JTM lain.');
        CONTINUE;
      END IF;
      SELECT r.regu INTO regu_ok FROM public.regu_inspeksi r
        WHERE upper(r.regu) = upper(plk) AND upper(r.ulp) = unit AND r.jtm LIMIT 1;
      urut := urut + 1;
      INSERT INTO public.wo_inspeksi_item
        (wo_id, jenis, urutan, ulp, penyulang, segmen_id, objek_nama, panjang_km, panjang_dari, regu, pelaksana, keterangan)
      VALUES (wo, 'JTM', urut, s.ulp, s.penyulang, s.segmen_id, s.nama,
              COALESCE(s.panjang_pakai_km, v_km), CASE WHEN s.panjang_pakai_km IS NULL AND v_km > 0 THEN 'ketikan' ELSE s.panjang_dari END,
              regu_ok, plk, ket)
      RETURNING id INTO item;
      UPDATE public.inspeksi_jtm SET wo_item_id = item, updated_at = now()
      WHERE segmen_id = s.segmen_id AND wo_item_id IS NULL
        AND status IN ('Dijadwalkan', 'Dalam Proses', 'Selesai', 'Ditolak');
    ELSE
      IF EXISTS (SELECT 1 FROM public.wo_perabasan_item i WHERE i.segmen_id = s.segmen_id
                   AND i.status IN ('Dijadwalkan', 'Dalam Proses', 'Selesai', 'Ditolak')) THEN
        dilewati := dilewati || jsonb_build_object('objek', s.nama, 'sebab', 'Masih berjalan di WO perabasan lain.');
        CONTINUE;
      END IF;
      -- Pelaksana = nama regu terdaftar → langsung muncul di HP regu itu.
      -- Selain itu segmen masuk WO tanpa regu (belum tampil di HP) dan
      -- dihitung sebagai "tanpa regu" untuk dibagi di WO Perabasan.
      SELECT r.regu INTO regu_ok FROM public.regu_perabasan r
        WHERE upper(r.regu) = upper(plk) AND upper(r.ulp) = unit LIMIT 1;
      IF regu_ok IS NULL THEN tanpa := tanpa + 1; END IF;
      urut := urut + 1;
      INSERT INTO public.wo_perabasan_item
        (wo_id, segmen_id, urutan, ulp, penyulang, segmen_nama, panjang_km, panjang_dari, regu, pelaksana, keterangan)
      VALUES (wo, s.segmen_id, urut, s.ulp, s.penyulang, s.nama,
              COALESCE(s.panjang_pakai_km, v_km), CASE WHEN s.panjang_pakai_km IS NULL AND v_km > 0 THEN 'ketikan' ELSE s.panjang_dari END,
              regu_ok, plk, ket);
    END IF;
    masuk := masuk + 1;
  END LOOP;

  IF p_jenis = 'jtm' THEN
    UPDATE public.wo_inspeksi SET target_km = (SELECT round(COALESCE(sum(panjang_km), 0), 2)
      FROM public.wo_inspeksi_item WHERE wo_id = wo AND status <> 'Dibatalkan') WHERE id = wo;
    DELETE FROM public.wo_inspeksi w WHERE w.id = wo AND NOT EXISTS (SELECT 1 FROM public.wo_inspeksi_item WHERE wo_id = wo);
    -- Sisa yang belum ada di master: mengganti tempelan manual JTM Tier 1.
    n_manual := public._simpan_wo_manual_isi(unit, p_tahun, p_bulan, 'jtm', manual, p_oleh);
  ELSE
    UPDATE public.wo_perabasan SET target_km = GREATEST(0.01, (SELECT round(COALESCE(sum(panjang_km), 0), 2)
      FROM public.wo_perabasan_item WHERE wo_id = wo AND status <> 'Dibatalkan')) WHERE id = wo;
    DELETE FROM public.wo_perabasan w WHERE w.id = wo AND NOT EXISTS (SELECT 1 FROM public.wo_perabasan_item WHERE wo_id = wo);
  END IF;

  RETURN jsonb_build_object('masuk', masuk, 'manual', n_manual, 'segmen_baru', baru, 'tanpa_regu', tanpa,
                            'dilewati', dilewati, 'ditolak', ditolak);
END $fn$;
GRANT EXECUTE ON FUNCTION public.tempel_wo(TEXT, INT, INT, TEXT, JSONB, TEXT) TO authenticated;


-- Isi wo_manual tanpa penjaga (penjaga sudah di tempel_wo / simpan_wo_manual).
-- Tempel ulang MENGGANTI daftar, centang realisasi objek yang sama dibawa.
CREATE OR REPLACE FUNCTION public._simpan_wo_manual_isi(
  unit TEXT, p_tahun INT, p_bulan INT, p_jenis TEXT, p_item JSONB, p_oleh TEXT
) RETURNS INT
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  wo   UUID;
  n    INT;
  lama JSONB;
BEGIN
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

  INSERT INTO public.wo_manual_item (wo_id, urutan, objek, alamat, km, keterangan, pelaksana, tgl_rencana,
                                     penyulang, kva, uraian, selesai_tgl, selesai_oleh)
  SELECT wo, x.ord::int, btrim(x.v->>'objek'), NULLIF(btrim(x.v->>'alamat'), ''),
         NULLIF(x.v->>'km', '')::numeric, NULLIF(btrim(x.v->>'keterangan'), ''),
         NULLIF(btrim(x.v->>'pelaksana'), ''), NULLIF(x.v->>'tgl_rencana', '')::date,
         NULLIF(btrim(x.v->>'penyulang'), ''), NULLIF(x.v->>'kva', '')::numeric, NULLIF(btrim(x.v->>'uraian'), ''),
         (lama -> upper(regexp_replace(x.v->>'objek', '\s', '', 'g')) ->> 'tgl')::date,
         lama -> upper(regexp_replace(x.v->>'objek', '\s', '', 'g')) ->> 'oleh'
  FROM jsonb_array_elements(p_item) WITH ORDINALITY AS x(v, ord)
  WHERE NULLIF(btrim(x.v->>'objek'), '') IS NOT NULL;

  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END $fn$;
REVOKE EXECUTE ON FUNCTION public._simpan_wo_manual_isi(TEXT, INT, INT, TEXT, JSONB, TEXT) FROM PUBLIC, authenticated;

-- simpan_wo_manual (dipakai tombol hapus tempelan) kini lewat isi yang sama.
CREATE OR REPLACE FUNCTION public.simpan_wo_manual(
  p_ulp TEXT, p_tahun INT, p_bulan INT, p_jenis TEXT, p_item JSONB, p_oleh TEXT DEFAULT NULL
) RETURNS INT
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE unit TEXT := upper(btrim(COALESCE(p_ulp, '')));
BEGIN
  IF unit = '' THEN RAISE EXCEPTION 'ULP belum dipilih'; END IF;
  PERFORM public.wajib_boleh_ulp(unit);
  RETURN public._simpan_wo_manual_isi(unit, p_tahun, p_bulan, p_jenis, p_item, p_oleh);
END $fn$;


-- ── 6. Isi lampiran ──────────────────────────────────────────────────────────
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
    AND pg.wo_sent_at >= t_awal AND pg.wo_sent_at < t_akhr
    AND upper(pg.petugas_unit) = u
    AND NOT EXISTS (SELECT 1 FROM public.optimasi_wo_batal b WHERE b.pengukuran_id::text = pg.id::text);

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


-- ── 7. Rekap: JTM Tier 1 = WO sistem + tempelan yang belum di master ─────────
-- Disalin dari `wo-surat-yantek.sql`; yang berubah (★): baris jtm, dan WO
-- perabasan yang dibatalkan tidak lagi dihitung terbit.
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

  RETURN QUERY
  SELECT 'penyeimbangan'::text, public._wo_manual_total(u, p_tahun, p_bulan, 'penyeimbangan', false, false),
    count(*)::numeric, NULL::numeric, NULL::numeric
  FROM public.penyeimbangan_gardu p
  WHERE p.created_at >= t_awal AND p.created_at < t_akhr
    AND (u IS NULL OR upper(p.ulp) = u);

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
--   SELECT jenis, ulp, nama, tgl_wo FROM wo_inspeksi ORDER BY created_at;   -- semua tanggal 1
--   SELECT ulp, nama, tgl_wo FROM wo_perabasan ORDER BY created_at;
--   SELECT * FROM rekap_kinerja('AMPENAN', 2026, 10);
--   SELECT nama, penyulang, sumber FROM segmen WHERE sumber = 'tempelan';
