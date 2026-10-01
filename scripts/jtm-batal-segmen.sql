-- =============================================================================
-- Segmen tempelan keluar dari Inspeksi JTM + regu bisa membatalkan segmen
-- rintisan yang salah. Keputusan user 1 Okt 2026. Jalankan manual di Supabase
-- SQL Editor, SESUDAH `wo-tempel-semua.sql`. Idempoten.
--
-- Kejadian (GUNUNG SARI, 1 Okt pagi): penyulang itu punya 6 segmen dari
-- tempelan WO Perabasan, salah satunya "REC. KEKAIT - UJUNG". Rintis
-- penyulang baru di HP menganggapnya rintisan yang belum ditutup (ujungnya
-- "UJUNG") dan langsung melanjutkannya; tiang GNS-001 jadi ujung segmen
-- tempelan itu. Rintisan berikutnya berpangkal di REC. AHHAS — pilihan acak,
-- karena keenam segmen tempelan lahir pada detik yang sama — dan HP tidak
-- memberi jalan untuk mulai dari pangkal.
--
--   1. Rintisan terbuka = HANYA segmen 'lapangan'. Usulan pangkal tidak
--      memakai segmen tempelan, dan memilih yang paling akhir DITUTUP.
--   2. `jtm_cakupan` (daftar segmen Inspeksi JTM di HP & web) tanpa segmen
--      tempelan. Segmen impor tetap ikut.
--   3. Tempel WO Inspeksi JTM tidak mencocokkan segmen tempelan.
--   4. `batalkan_segmen_rintisan` — regu membatalkan segmen rintisan yang
--      salah dari HP, supaya bisa mulai lagi dari pangkal.
--   5. Bersihkan GUNUNG SARI.
-- =============================================================================


-- ── 1. Usulan pangkal & mulai merintis ─────────────────────────────────────
-- Disalin dari `jtm-rintis.sql`; yang berubah ditandai ★.
CREATE OR REPLACE FUNCTION public.usul_awal_jtm(
  p_penyulang TEXT,
  p_ulp       TEXT
) RETURNS JSONB
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_penyulang TEXT := upper(btrim(COALESCE(p_penyulang, '')));
  v_ulp       TEXT := upper(btrim(COALESCE(p_ulp, '')));
  rintis      RECORD;
  akhir       RECORD;
  v_tiang     INT := 0;
  v_selesai   INT := 0;
BEGIN
  IF v_penyulang = '' OR v_ulp = '' THEN
    RAISE EXCEPTION 'Penyulang dan ULP wajib diisi';
  END IF;

  SELECT s.id, s.nama
    INTO rintis
  FROM public.segmen s
  WHERE upper(s.penyulang) = v_penyulang
    AND upper(s.ulp) = v_ulp
    AND s.status = 'aktif'
    AND s.titik_akhir_jenis = 'UJUNG'
    AND s.sumber = 'lapangan'          -- ★ hanya rintisan sungguhan
  ORDER BY s.created_at DESC
  LIMIT 1;

  IF rintis.id IS NOT NULL THEN
    SELECT count(*) INTO v_tiang
    FROM public.segmen_tiang WHERE segmen_id = rintis.id;
  END IF;

  SELECT s.titik_akhir_jenis, s.titik_akhir_nama, s.titik_akhir_tiang_id, s.nama
    INTO akhir
  FROM public.segmen s
  WHERE upper(s.penyulang) = v_penyulang
    AND upper(s.ulp) = v_ulp
    AND s.status = 'aktif'
    AND s.titik_akhir_jenis <> 'UJUNG'
    AND s.sumber IS DISTINCT FROM 'tempelan'   -- ★
  -- ★ Yang paling akhir DITUTUP, bukan yang paling akhir dibuat: segmen impor
  -- dan tempelan lahir pada detik yang sama, dan urutan dibuat memilih acak.
  ORDER BY COALESCE(s.dikonfirmasi_at, s.created_at) DESC, s.created_at DESC, s.id
  LIMIT 1;

  SELECT count(*) INTO v_selesai
  FROM public.segmen s
  WHERE upper(s.penyulang) = v_penyulang
    AND upper(s.ulp) = v_ulp
    AND s.status = 'aktif'
    AND s.titik_akhir_jenis <> 'UJUNG'
    AND s.sumber IS DISTINCT FROM 'tempelan';   -- ★

  RETURN jsonb_build_object(
    'rintisan_id',    rintis.id,
    'rintisan_nama',  rintis.nama,
    'rintisan_tiang', v_tiang,
    -- NULL di ketiga kolom ini berarti penyulang ini belum punya segmen sama
    -- sekali. Di situ petugaslah yang menentukan pangkalnya — GI, PLTD, atau
    -- gardu induk tempat penyulangnya keluar.
    'awal_jenis',     akhir.titik_akhir_jenis,
    'awal_nama',      akhir.titik_akhir_nama,
    'awal_tiang_id',  akhir.titik_akhir_tiang_id,
    'dari_segmen',    akhir.nama,
    'segmen_selesai', v_selesai
  );
END $$;

CREATE OR REPLACE FUNCTION public.rintis_segmen_jtm(
  p_penyulang     TEXT,
  p_ulp           TEXT,
  p_jenis_awal    TEXT DEFAULT NULL,
  p_nama_awal     TEXT DEFAULT NULL,
  p_tiang_awal_id UUID DEFAULT NULL,
  p_tier          TEXT DEFAULT '1',
  p_nama          TEXT DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_penyulang TEXT := btrim(COALESCE(p_penyulang, ''));
  v_ulp       TEXT := btrim(COALESCE(p_ulp, ''));
  v_jenis     TEXT := upper(btrim(COALESCE(p_jenis_awal, '')));
  v_nama_awal TEXT := btrim(COALESCE(p_nama_awal, ''));
  v_tiang_id  UUID := p_tiang_awal_id;
  rintis      RECORD;
  akhir       RECORD;
  v_id        UUID;
  v_inspeksi  UUID;
  v_nama_jadi TEXT;
BEGIN
  IF v_penyulang = '' OR v_ulp = '' THEN
    RAISE EXCEPTION 'Penyulang dan ULP wajib diisi';
  END IF;

  -- (a) Rintisan yang masih terbuka DILANJUTKAN. Penyapuannya juga: fungsinya
  --     sendiri sudah tahu cara menyambung yang belum selesai.
  SELECT s.id, s.nama INTO rintis
  FROM public.segmen s
  WHERE upper(s.penyulang) = upper(v_penyulang)
    AND upper(s.ulp) = upper(v_ulp)
    AND s.status = 'aktif'
    AND s.titik_akhir_jenis = 'UJUNG'
    AND s.sumber = 'lapangan'          -- ★
  ORDER BY s.created_at DESC
  LIMIT 1;

  IF rintis.id IS NOT NULL THEN
    v_inspeksi := public.mulai_penyapuan_jtm(rintis.id, p_tier, p_nama);
    RETURN jsonb_build_object(
      'segmen_id',   rintis.id,
      'inspeksi_id', v_inspeksi,
      'nama',        rintis.nama,
      'dilanjutkan', true
    );
  END IF;

  -- (b) Pangkal. Kalau petugas tidak menyebutkannya, diambil dari ujung segmen
  --     terakhir penyulang ini.
  IF v_jenis = '' THEN
    SELECT s.titik_akhir_jenis, s.titik_akhir_nama, s.titik_akhir_tiang_id
      INTO akhir
    FROM public.segmen s
    WHERE upper(s.penyulang) = upper(v_penyulang)
      AND upper(s.ulp) = upper(v_ulp)
      AND s.status = 'aktif'
      AND s.titik_akhir_jenis <> 'UJUNG'
      AND s.sumber IS DISTINCT FROM 'tempelan'   -- ★
    ORDER BY COALESCE(s.dikonfirmasi_at, s.created_at) DESC, s.created_at DESC, s.id
    LIMIT 1;

    IF akhir.titik_akhir_jenis IS NULL THEN
      RAISE EXCEPTION
        'Penyulang % belum punya segmen satu pun. Isi dulu titik awalnya — dari GI, PLTD, atau gardu induk tempat penyulang ini keluar.',
        v_penyulang;
    END IF;

    v_jenis     := akhir.titik_akhir_jenis;
    v_nama_awal := akhir.titik_akhir_nama;
    v_tiang_id  := COALESCE(v_tiang_id, akhir.titik_akhir_tiang_id);
  END IF;

  IF NOT public.jtm_jenis_titik_sah(v_jenis) THEN
    RAISE EXCEPTION 'Jenis titik awal "%" tidak dikenal', v_jenis;
  END IF;
  IF v_nama_awal = '' THEN
    RAISE EXCEPTION 'Nama titik awal wajib diisi (misal: GI AMPENAN, atau PLTD TALIWANG)';
  END IF;

  INSERT INTO public.segmen
    (penyulang, ulp,
     titik_awal_jenis,  titik_awal_nama,  titik_awal_tiang_id,
     -- Ujung sengaja dibiarkan terbuka. 'UJUNG' berlabel "UJUNG" selama
     -- namanya kosong, jadi segmennya terbaca `GI AMPENAN - UJUNG` sampai
     -- petugas benar-benar sampai di ujungnya.
     titik_akhir_jenis, titik_akhir_nama, titik_akhir_tiang_id,
     status, sumber)
  VALUES (upper(v_penyulang), upper(v_ulp),
          v_jenis, upper(v_nama_awal), v_tiang_id,
          'UJUNG', '', NULL,
          'aktif', 'lapangan')
  RETURNING id INTO v_id;

  v_inspeksi := public.mulai_penyapuan_jtm(v_id, p_tier, p_nama);

  SELECT nama INTO v_nama_jadi FROM public.segmen WHERE id = v_id;

  RETURN jsonb_build_object(
    'segmen_id',   v_id,
    'inspeksi_id', v_inspeksi,
    'nama',        v_nama_jadi,
    'dilanjutkan', false
  );
END $$;


-- ── 2. Daftar segmen inspeksi JTM tanpa segmen tempelan ─────────────────────
-- Disalin dari `istilah-inspeksi.sql`; yang berubah ditandai ★.
CREATE OR REPLACE VIEW public.jtm_cakupan AS
WITH per_segmen AS (
  SELECT
    s.id AS segmen_id, s.nama, s.penyulang, s.ulp,
    count(st.tiang_id)                                        AS tiang,
    count(*) FILTER (WHERE k.tiang_id IS NOT NULL)            AS tiang_dinilai
  FROM public.segmen s
  LEFT JOIN public.segmen_tiang st ON st.segmen_id = s.id
  LEFT JOIN LATERAL (
    SELECT DISTINCT tiang_id FROM public.tiang_kondisi_terakhir k2
    WHERE k2.tiang_id = st.tiang_id
  ) k ON true
  WHERE s.status = 'aktif'
    AND s.sumber IS DISTINCT FROM 'tempelan'   -- ★ segmen tempelan WO bukan segmen inspeksi JTM
  GROUP BY s.id, s.nama, s.penyulang, s.ulp
)
SELECT
  p.*,
  round(100.0 * p.tiang_dinilai / NULLIF(p.tiang, 0), 1) AS persen_dinilai,
  (SELECT max(COALESCE(m.tgl_selesai, m.tgl_mulai))
     FROM public.inspeksi_jtm m
    WHERE m.segmen_id = p.segmen_id AND m.status = 'Diverifikasi') AS terakhir_disapu,
  (SELECT max(COALESCE(m.tgl_selesai, m.tgl_mulai))
     FROM public.inspeksi_jtm m
    WHERE m.segmen_id = p.segmen_id AND m.status = 'Diverifikasi') AS terakhir_inspeksi
FROM per_segmen p;


-- ── 3. Tempel WO JTM tidak mencocokkan segmen tempelan ──────────────────────
-- Disalin dari `wo-tempel-semua.sql`; yang berubah ditandai ★.
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


-- ── 4. Batalkan segmen rintisan ──────────────────────────────────────────────
-- Untuk segmen yang TERLANJUR dirintis tapi salah — salah pilih penyulang,
-- salah pangkal — supaya regu bisa mulai lagi dari pangkal yang benar.
--
-- Hanya segmen 'lapangan' (hasil rintis). Segmen impor & tempelan tidak bisa
-- dibatalkan dari HP: itu master yang disusun di web.
--
-- Yang ikut:
--   • tiang yang HANYA milik segmen ini → dibatalkan (namanya dilepas, jadi
--     nomornya dipakai lagi waktu dititik ulang);
--   • tiang yang juga milik segmen lain (underbuild) → keanggotaannya saja
--     yang dilepas;
--   • penyapuannya → 'Dibatalkan'.
-- Ditolak bila sudah masuk WO, sudah diverifikasi admin, atau ada segmen /
-- tiang lain yang menyambung dari sini — membatalkannya akan memutus rantai.
CREATE OR REPLACE FUNCTION public.batalkan_segmen_rintisan(
  p_segmen_id UUID,
  p_alasan    TEXT,
  p_nama      TEXT DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  s        RECORD;
  v_role   TEXT;
  v_unit   TEXT;
  milik    UUID[];
  dilepas  INT;
  hal      TEXT;
  t        RECORD;
BEGIN
  IF btrim(COALESCE(p_alasan, '')) = '' THEN RAISE EXCEPTION 'Alasan pembatalan wajib diisi'; END IF;

  SELECT * INTO s FROM public.segmen WHERE id = p_segmen_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Segmen tidak ditemukan'; END IF;
  IF s.status <> 'aktif' THEN RAISE EXCEPTION 'Segmen % sudah tidak aktif', s.nama; END IF;
  IF s.sumber IS DISTINCT FROM 'lapangan' THEN
    RAISE EXCEPTION 'Segmen % bukan hasil rintis lapangan — perubahannya lewat Master Segmen di web.', s.nama;
  END IF;

  -- Regu ULP itu sendiri, admin ULP itu, atau UP3.
  SELECT role, unit INTO v_role, v_unit FROM public.user_roles WHERE user_id = auth.uid();
  IF v_role IS DISTINCT FROM 'UP3' AND upper(COALESCE(v_unit, '')) <> upper(s.ulp) THEN
    RAISE EXCEPTION 'Segmen ini milik ULP %', s.ulp;
  END IF;

  IF EXISTS (SELECT 1 FROM public.wo_inspeksi_item WHERE segmen_id = s.id AND status <> 'Dibatalkan')
     OR EXISTS (SELECT 1 FROM public.wo_perabasan_item WHERE segmen_id = s.id AND status <> 'Dibatalkan') THEN
    RAISE EXCEPTION 'Segmen % sudah masuk WO — minta admin mengeluarkannya dari WO dulu.', s.nama;
  END IF;
  IF EXISTS (SELECT 1 FROM public.inspeksi_jtm WHERE segmen_id = s.id AND status = 'Diverifikasi') THEN
    RAISE EXCEPTION 'Penyapuan segmen % sudah diverifikasi admin — tidak bisa dibatalkan dari HP.', s.nama;
  END IF;

  -- Tiang yang hanya milik segmen ini.
  SELECT array_agg(st.tiang_id) INTO milik
    FROM public.segmen_tiang st JOIN public.tiang tg ON tg.id = st.tiang_id
   WHERE st.segmen_id = s.id AND tg.status_hidup = 'aktif'
     AND NOT EXISTS (SELECT 1 FROM public.segmen_tiang o JOIN public.segmen so ON so.id = o.segmen_id
                      WHERE o.tiang_id = st.tiang_id AND o.segmen_id <> s.id AND so.status = 'aktif');
  milik := COALESCE(milik, '{}');

  -- Segmen lain yang berpangkal / berinduk di sini.
  SELECT string_agg(o.nama, ', ') INTO hal FROM public.segmen o
   WHERE o.status = 'aktif' AND o.id <> s.id
     AND (o.induk_segmen_id = s.id OR o.titik_awal_tiang_id = ANY(milik));
  IF hal IS NOT NULL THEN
    RAISE EXCEPTION 'Segmen % menyambung dari segmen ini — batalkan yang itu dulu.', hal;
  END IF;

  -- Tiang lain (JTR, tiang segmen lain) yang induknya tiang segmen ini.
  SELECT string_agg(DISTINCT a.kode, ', ') INTO hal FROM public.tiang a
   WHERE a.status_hidup = 'aktif' AND NOT (a.id = ANY(milik))
     AND (a.induk_id = ANY(milik) OR a.induk_jtr_id = ANY(milik));
  IF hal IS NULL THEN
    SELECT string_agg(DISTINCT tp.tiang_id::text, ', ') INTO hal FROM public.tiang_jtr_tumpang tp
     WHERE tp.status = 'aktif' AND tp.induk_id = ANY(milik);
  END IF;
  IF hal IS NOT NULL THEN
    RAISE EXCEPTION 'Tiang % menyambung dari tiang segmen ini — pindahkan sambungannya dulu.', hal;
  END IF;

  -- ── Jalankan ──
  FOR t IN SELECT * FROM public.tiang WHERE id = ANY(milik) LOOP
    INSERT INTO public.master_audit
      (entitas, entitas_kode, ulp, field, nilai_lama, nilai_baru, aksi, oleh_uid, oleh_nama)
    VALUES ('tiang', t.kode, COALESCE(t.ulp, '-'), 'status_hidup', to_jsonb(t.status_hidup),
            jsonb_build_object('status', 'batal', 'alasan', p_alasan, 'segmen', s.nama,
              'nama_dibuang', COALESCE((SELECT array_agg(penyulang || '=' || kode) FROM public.tiang_kode_penyulang
                                         WHERE tiang_id = t.id), '{}')),
            'batal_segmen_rintisan', auth.uid(), p_nama);
  END LOOP;
  DELETE FROM public.tiang_kode_penyulang WHERE tiang_id = ANY(milik);
  UPDATE public.tiang_jtr_tumpang SET status = 'lepas', catatan = 'segmennya dibatalkan: ' || p_alasan, updated_at = now()
   WHERE tiang_id = ANY(milik) AND status = 'aktif';
  UPDATE public.tiang SET status_hidup = 'batal', aktif_sampai = CURRENT_DATE, catatan = p_alasan, updated_at = now()
   WHERE id = ANY(milik);

  DELETE FROM public.segmen_tiang WHERE segmen_id = s.id;
  GET DIAGNOSTICS dilepas = ROW_COUNT;

  UPDATE public.inspeksi_jtm
     SET status = 'Dibatalkan', verified_at = now(), verified_by = p_nama, verified_note = p_alasan, updated_at = now()
   WHERE segmen_id = s.id AND status <> 'Dibatalkan';

  UPDATE public.segmen
     SET status = 'nonaktif', catatan = concat_ws(' · ', NULLIF(catatan, ''), 'Dibatalkan dari lapangan: ' || btrim(p_alasan)),
         updated_at = now()
   WHERE id = s.id;

  INSERT INTO public.master_audit
    (entitas, entitas_kode, ulp, field, nilai_lama, nilai_baru, aksi, oleh_uid, oleh_nama)
  VALUES ('segmen', s.nama, s.ulp, 'status', to_jsonb(s.status),
          jsonb_build_object('status', 'nonaktif', 'alasan', p_alasan, 'tiang_dibatalkan', cardinality(milik)),
          'batal_segmen_rintisan', auth.uid(), p_nama);

  RETURN jsonb_build_object('tiang_dibatalkan', cardinality(milik), 'tiang_dilepas', dilepas - cardinality(milik));
END $fn$;

GRANT EXECUTE ON FUNCTION public.batalkan_segmen_rintisan(UUID, TEXT, TEXT) TO authenticated;


-- ── 5. Bersihkan GUNUNG SARI (sekali) ────────────────────────────────────────
-- Hanya bila keadaannya masih seperti pagi tadi; sudah dibereskan → dilewati.
DO $$
DECLARE
  gns UUID := 'c12333d2-7477-4384-9400-056d28f662ac';   -- GNS-001
BEGIN
  -- Segmen tempelan "REC. KEKAIT - UJUNG" kembali seperti hasil tempelan.
  IF EXISTS (SELECT 1 FROM public.segmen WHERE id = '9ba5e6fc-c54c-4e63-90d2-6ad6687161b8' AND titik_akhir_tiang_id = gns) THEN
    DELETE FROM public.segmen_tiang WHERE segmen_id = '9ba5e6fc-c54c-4e63-90d2-6ad6687161b8';
    UPDATE public.segmen
       SET titik_akhir_jenis = 'UJUNG', titik_akhir_nama = '', titik_akhir_tiang_id = NULL,
           nama = 'REC. KEKAIT - UJUNG', dikonfirmasi_at = NULL, dikonfirmasi_oleh = NULL, updated_at = now()
     WHERE id = '9ba5e6fc-c54c-4e63-90d2-6ad6687161b8';
  END IF;

  -- GNS-001 dititik ke segmen tempelan karena kekeliruan di atas — dititik ulang.
  IF EXISTS (SELECT 1 FROM public.tiang WHERE id = gns AND status_hidup = 'aktif')
     AND NOT EXISTS (SELECT 1 FROM public.segmen_tiang WHERE tiang_id = gns) THEN
    PERFORM public.batalkan_tiang(gns, 'sistem',
      'Tertitik ke segmen tempelan REC. KEKAIT - UJUNG karena rintis salah menyambung (1 Okt 2026) — dititik ulang dari pangkal.');
  END IF;

  -- Rintisan kosong "REC. AHHAS - UJUNG" (tanpa tiang, tanpa penyapuan).
  UPDATE public.segmen
     SET status = 'nonaktif', catatan = 'Rintisan salah pangkal (1 Okt 2026) — dibatalkan.', updated_at = now()
   WHERE id = '47ef75bb-2981-4c40-85d3-fc1d8e2ea3a0' AND status = 'aktif'
     AND NOT EXISTS (SELECT 1 FROM public.segmen_tiang WHERE segmen_id = '47ef75bb-2981-4c40-85d3-fc1d8e2ea3a0')
     AND NOT EXISTS (SELECT 1 FROM public.inspeksi_jtm WHERE segmen_id = '47ef75bb-2981-4c40-85d3-fc1d8e2ea3a0' AND status <> 'Dibatalkan');
END $$;


-- ── Periksa ──────────────────────────────────────────────────────────────────
--   SELECT usul_awal_jtm('GUNUNG SARI', 'AMPENAN');   -- awal_jenis NULL = segmen pertama
--   SELECT nama, sumber, status, titik_akhir_jenis FROM segmen WHERE penyulang = 'GUNUNG SARI' ORDER BY created_at;
