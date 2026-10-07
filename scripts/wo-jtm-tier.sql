-- =============================================================================
-- WO Inspeksi JTM Tier 2 dari Susun WO — `rencana-wo-jtm-tier2.md` (7 Okt 2026)
-- Jalankan manual di Supabase SQL Editor, SESUDAH `jtm-kategori-temuan.sql`
-- (skrip JTM terakhir). Idempoten. SQL dulu, baru OTA HP, baru web.
--
-- Jalankan `cek-jtm-tier-salah-wo.sql` (hanya baca) LEBIH DULU dan simpan
-- hasilnya: sesudah skrip ini, inspeksi Tier 2 baru tidak lagi menempel ke WO
-- Tier 1, tetapi yang sudah menempel tetap seperti adanya sampai diputuskan.
--
--   1. Kolom tier di wo_inspeksi & wo_inspeksi_item (bawaan '1'); item
--      mewarisi tier WO-nya lewat pemicu. Unik: satu segmen PER TIER satu item
--      terbuka (keputusan 1).
--   2. jtm_sambung_wo — inspeksi hanya tersambung ke item WO bertier sama.
--   3. terbitkan_wo_inspeksi_jtm(..., p_tier) — bawaan '1'.
--   4. tempel_wo — bagian JTM hanya melihat WO/item Tier 1. Tempelan Tier 2
--      TIDAK berubah: tetap wo_manual + centang (keputusan 5).
--   5. wo_inspeksi_item_status membawa tier.
--   6. wo_surat_objek — item WO Tier 2 ke lampiran 'jtm2'.
--   7. _rekap_kinerja_inti — 'jtm' = WO Tier 1; 'jtm2' = WO susun Tier 2 +
--      tempelan, realisasi = inspeksi HP Tier 2 + centang (keputusan 2).
--
-- Fungsi 3, 4, 6, 7 DISALIN UTUH dari skrip terakhirnya (dirakit oleh skrip):
--   terbitkan_wo_inspeksi_jtm ← wo-inspeksi-jtm.sql
--   tempel_wo                 ← jtm-batal-segmen.sql
--   wo_surat_objek            ← wo-bulan-anomali.sql
--   _rekap_kinerja_inti       ← jtm-kirim-otomatis.sql
-- Yang berubah ditandai ★; tanda ★ lain ikut tersalin dari skrip asalnya.
-- =============================================================================


-- ── 1. Kolom tier ────────────────────────────────────────────────────────────
ALTER TABLE public.wo_inspeksi      ADD COLUMN IF NOT EXISTS tier TEXT NOT NULL DEFAULT '1';
ALTER TABLE public.wo_inspeksi_item ADD COLUMN IF NOT EXISTS tier TEXT NOT NULL DEFAULT '1';
ALTER TABLE public.wo_inspeksi DROP CONSTRAINT IF EXISTS wo_inspeksi_tier_valid;
ALTER TABLE public.wo_inspeksi ADD CONSTRAINT wo_inspeksi_tier_valid CHECK (tier IN ('1', '2'));
ALTER TABLE public.wo_inspeksi_item DROP CONSTRAINT IF EXISTS wo_inspeksi_item_tier_valid;
ALTER TABLE public.wo_inspeksi_item ADD CONSTRAINT wo_inspeksi_item_tier_valid CHECK (tier IN ('1', '2'));

COMMENT ON COLUMN public.wo_inspeksi.tier IS
  'Tier inspeksi JTM yang diminta WO ini (1 rutin / 2 detail). JTR selalu 1.';
COMMENT ON COLUMN public.wo_inspeksi_item.tier IS
  'Salinan tier WO-nya (pemicu trg_wo_item_ikut_tier) — dipakai indeks unik & penyambung inspeksi.';

-- Item selalu bertier sama dengan WO-nya — fungsi mana pun yang menyisipkan,
-- termasuk yang tidak menyebut tier (tempel_wo, versi lama).
CREATE OR REPLACE FUNCTION public.wo_item_ikut_tier()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $fn$
BEGIN
  SELECT w.tier INTO NEW.tier FROM public.wo_inspeksi w WHERE w.id = NEW.wo_id;
  NEW.tier := COALESCE(NEW.tier, '1');
  RETURN NEW;
END $fn$;
DROP TRIGGER IF EXISTS trg_wo_item_ikut_tier ON public.wo_inspeksi_item;
CREATE TRIGGER trg_wo_item_ikut_tier BEFORE INSERT ON public.wo_inspeksi_item
  FOR EACH ROW EXECUTE FUNCTION public.wo_item_ikut_tier();

-- Satu segmen PER TIER satu item terbuka (dulu: satu segmen).
DROP INDEX IF EXISTS public.wo_inspeksi_item_segmen_terbuka;
CREATE UNIQUE INDEX IF NOT EXISTS wo_inspeksi_item_segmen_tier_terbuka
  ON public.wo_inspeksi_item (segmen_id, tier) WHERE status = 'Terbuka' AND segmen_id IS NOT NULL;


-- ── 2. Penyambung inspeksi ↔ WO: tier yang sama ──────────────────────────────
-- Disalin dari `wo-inspeksi-jtm.sql`; yang berubah ditandai ★.
CREATE OR REPLACE FUNCTION public.jtm_sambung_wo()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
BEGIN
  IF NEW.wo_item_id IS NULL THEN
    SELECT i.id INTO NEW.wo_item_id FROM public.wo_inspeksi_item i
    WHERE i.segmen_id = NEW.segmen_id AND i.status = 'Terbuka'
      AND i.tier = COALESCE(NEW.tier, '1')   -- ★ Tier 2 tidak lagi menempel ke WO Tier 1
    LIMIT 1;
  END IF;
  RETURN NEW;
END $fn$;


-- ── 3. Terbitkan WO JTM bertier ──────────────────────────────────────────────
-- Parameter baru → tanda tangan lama dibuang dulu, supaya panggilan tanpa
-- p_tier tidak bingung memilih antara dua versi. Panggilan lama (tanpa
-- p_tier) tetap jalan: bawaannya Tier 1.
DROP FUNCTION IF EXISTS public.terbitkan_wo_inspeksi_jtm(TEXT, TEXT, NUMERIC, UUID[], DATE, JSONB, TEXT);
CREATE OR REPLACE FUNCTION public.terbitkan_wo_inspeksi_jtm(
  p_ulp       TEXT,
  p_nama      TEXT,
  p_target_km NUMERIC,
  p_segmen    UUID[],
  p_tgl_wo    DATE  DEFAULT CURRENT_DATE,
  p_regu      JSONB DEFAULT '{}'::jsonb,
  p_oleh      TEXT  DEFAULT NULL,
  p_tier      TEXT  DEFAULT '1'          -- ★ Tier WO
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
  v_tier   TEXT := btrim(COALESCE(p_tier, '1'));   -- ★
BEGIN
  IF v_tier NOT IN ('1', '2') THEN RAISE EXCEPTION 'Tier WO harus 1 atau 2'; END IF;   -- ★
  IF unit = '' THEN RAISE EXCEPTION 'ULP belum dipilih'; END IF;
  IF judul = '' THEN RAISE EXCEPTION 'Nama WO belum diisi'; END IF;
  IF COALESCE(array_length(p_segmen, 1), 0) = 0 THEN RAISE EXCEPTION 'Belum ada segmen yang dipilih'; END IF;
  PERFORM public.wajib_boleh_ulp(unit);

  INSERT INTO public.wo_inspeksi (jenis, ulp, nama, tgl_wo, target_km, created_by, tier)   -- ★ tier
  VALUES ('JTM', unit, judul, COALESCE(p_tgl_wo, CURRENT_DATE), p_target_km, auth.uid(), v_tier)
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
    -- ★ Hanya WO dengan TIER YANG SAMA yang mengikat segmen (keputusan 1).
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

    -- Inspeksi yang sudah berjalan di segmen ini ikut tersambung: WO datang
    -- belakangan tidak boleh membuat pekerjaan yang sedang jalan terhitung
    -- "di luar WO".
    UPDATE public.inspeksi_jtm SET wo_item_id = item, updated_at = now()
    WHERE segmen_id = s.segmen_id AND wo_item_id IS NULL
      AND COALESCE(tier, '1') = v_tier   -- ★ tier yang sama
      AND status IN ('Dijadwalkan', 'Dalam Proses', 'Selesai', 'Ditolak');
  END LOOP;

  IF n = 0 THEN
    RAISE EXCEPTION 'Tidak ada satu pun segmen yang bisa dimasukkan. %',
      COALESCE((SELECT string_agg(d ->> 'segmen' || ': ' || (d ->> 'sebab'), ' | ') FROM jsonb_array_elements(dilewati) d), '');
  END IF;

  INSERT INTO public.master_audit
    (entitas, entitas_kode, ulp, field, nilai_lama, nilai_baru, aksi, oleh_uid, oleh_nama)
  VALUES ('wo_inspeksi', judul, unit, 'terbit', NULL,
          jsonb_build_object('wo_id', wo, 'jenis', 'JTM', 'tier', v_tier, 'item', n, 'target_km', p_target_km),   -- ★ tier
          'sunting_admin', auth.uid(), p_oleh);

  RETURN jsonb_build_object('wo_id', wo, 'nama', judul, 'ulp', unit, 'tier', v_tier, 'item', n, 'dilewati', dilewati,
    'rencana_km', (SELECT round(COALESCE(sum(panjang_km), 0), 2) FROM public.wo_inspeksi_item WHERE wo_id = wo));
END $fn$;
GRANT EXECUTE ON FUNCTION public.terbitkan_wo_inspeksi_jtm(TEXT, TEXT, NUMERIC, UUID[], DATE, JSONB, TEXT, TEXT) TO authenticated;


-- ── 4. Tempel WO: bagian JTM = Tier 1 ────────────────────────────────────────
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
    WHERE jenis = 'JTM' AND ulp = unit AND tgl_wo = awal AND catatan = 'tempelan' AND status = 'Terbit'
      AND tier = '1'   -- ★ tempelan modul = Tier 1 (Tier 2 tetap wo_manual, keputusan 5)
    LIMIT 1;
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
      -- ★ WO Inspeksi JTM tidak memakai segmen tempelan (lahir dari WO lain,
      -- tanpa tiang) — yang tak cocok segmen sungguhan ke wo_manual.
      AND (p_jenis <> 'jtm' OR ms.sumber IS DISTINCT FROM 'tempelan')
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
      IF EXISTS (SELECT 1 FROM public.wo_inspeksi_item i
                 WHERE i.segmen_id = s.segmen_id AND i.status = 'Terbuka' AND i.tier = '1') THEN   -- ★ Tier 1 saja
        dilewati := dilewati || jsonb_build_object('objek', s.nama, 'sebab', 'Masih terbuka di WO inspeksi JTM Tier 1 lain.');
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
        AND COALESCE(tier, '1') = '1'   -- ★ Tier 1 saja
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


-- ── 5. Status item WO membawa tier ───────────────────────────────────────────
-- `i.*` di view dibekukan saat dibuat, jadi kolom tier baru hanya ikut kalau
-- view dibuat ulang (OR REPLACE menolak kolom yang bergeser posisi).
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


-- ── 6. Lampiran surat ────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.wo_surat_objek(p_ulp TEXT, p_tahun INT, p_bulan INT)
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
  -- ★ WO JTM Tier 2 masuk lampiran 'jtm2' (dulu semua WO JTM = 'jtm').
  RETURN QUERY
  SELECT CASE WHEN w.jenis = 'JTM' AND w.tier = '2' THEN 'jtm2' ELSE lower(w.jenis) END,
         row_number() OVER (PARTITION BY w.jenis, w.tier ORDER BY i.penyulang, i.urutan)::int,
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


-- ── 7. Rekap Kinerja ─────────────────────────────────────────────────────────
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
  centang NUMERIC;   -- ★ realisasi tempelan JTM Tier 2 (dicentang di web)
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
     AND w.tier = '1'   -- ★ WO Tier 2 punya barisnya sendiri
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
  -- ★ Bulan realisasi = bulan DIKIRIM (tgl_selesai), bukan bulan dimulai
  -- (keputusan user 2 Okt 2026). Yang belum dikirim memang tidak dihitung.
  WHERE COALESCE(m.tgl_selesai, m.created_at) >= t_awal
    AND COALESCE(m.tgl_selesai, m.created_at) < t_akhr
    AND m.tier = '1'
    AND (u IS NULL OR upper(m.ulp) = u);

  -- ★ Inspeksi JTM Tier 2 (rencana-wo-jtm-tier2.md): dua jalur WO.
  --   WO        = WO susun Tier 2 (segmen master, dikerjakan di HP)
  --             + tempelan Tier 2 (wo_manual, dicentang di web).
  --   Realisasi = inspeksi HP Tier 2 (tersambung WO maupun di luar WO)
  --             + centang tempelan. Hitungan ganda (tempelan dicentang DAN
  --             segmennya diinspeksi di HP) dibiarkan — web merinci keduanya.
  --   NULL di WO = belum ada WO apa pun (keadaan "belum ber-WO" di web).
  SELECT round(sum(i.panjang_km), 3) INTO sistem
    FROM public.wo_inspeksi_item i JOIN public.wo_inspeksi w ON w.id = i.wo_id
   WHERE w.jenis = 'JTM' AND w.tier = '2' AND i.status <> 'Dibatalkan'
     AND w.tgl_wo >= d_awal AND w.tgl_wo < d_akhr
     AND (u IS NULL OR upper(i.ulp) = u);
  tempel  := public._wo_manual_total(u, p_tahun, p_bulan, 'jtm2', true, false);
  centang := public._wo_manual_total(u, p_tahun, p_bulan, 'jtm2', true, true);

  RETURN QUERY
  SELECT 'jtm2'::text,
    CASE WHEN sistem IS NULL AND tempel IS NULL THEN NULL::numeric ELSE COALESCE(sistem, 0) + COALESCE(tempel, 0) END,
    round(COALESCE(sum(sp.panjang_pakai_km) FILTER (WHERE m.status IN ('Selesai', 'Diverifikasi')), 0)
          + COALESCE(centang, 0), 3),
    round(COALESCE(sum(sp.panjang_pakai_km) FILTER (WHERE m.status = 'Selesai'), 0), 3),
    round(COALESCE(sum(sp.panjang_pakai_km) FILTER (
      WHERE m.status IN ('Selesai', 'Diverifikasi') AND m.wo_item_id IS NULL), 0), 3)
  FROM public.inspeksi_jtm m
  LEFT JOIN public.segmen_panjang sp ON sp.segmen_id = m.segmen_id
  -- Bulan realisasi = bulan DIKIRIM, sama dengan Tier 1.
  WHERE COALESCE(m.tgl_selesai, m.created_at) >= t_awal
    AND COALESCE(m.tgl_selesai, m.created_at) < t_akhr
    AND m.tier = '2'
    AND (u IS NULL OR upper(m.ulp) = u);

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


-- ── Periksa ──────────────────────────────────────────────────────────────────
--   SELECT tier, count(*) FROM wo_inspeksi WHERE jenis = 'JTM' GROUP BY tier;      -- semua '1'
--   SELECT * FROM _rekap_kinerja_inti('AMPENAN', 2026, 10) WHERE kunci IN ('jtm', 'jtm2');
--   SELECT * FROM wo_inspeksi_item_status LIMIT 1;                                 -- ada kolom tier
