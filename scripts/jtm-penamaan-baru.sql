-- =============================================================================
-- Penamaan tiang JTM yang baru + ganti nama mengalir (pratinjau → terapkan)
-- Keputusan user 5 Okt 2026 — rencana-pulau-dan-penamaan.md (bagian B & C).
--
-- ⚠ JALANKAN MALAM HARI (di luar jam kerja lapangan): sejak skrip ini jalan,
--   tiang JTM yang BARU lahir dinamai dengan aturan baru. Nama tiang lama TIDAK
--   disentuh sampai admin menjalankan "Generate ulang" di web.
-- Jalankan manual di Supabase SQL Editor, SESUDAH `jtr-asal-kabel.sql`.
-- Idempoten. SQL dulu, baru push web & OTA HP.
--
-- Aturan (tiang C, induknya J bernama K di penyulang ini):
--   • J tanpa induk         → SINGKAT-001, -002, …
--   • C jalur UTAMA         → lanjut garis K: PRM-015 → PRM-016,
--                             PRM-015L007 → PRM-015L008 (belokan TIDAK memberi huruf)
--   • C CABANG (lewat FCO)  → K + R/L + 001 — sisi diukur terhadap arah jalur
--                             UTAMA yang keluar dari J; sisi sama dipakai → RR/LL
--   • C di antara J dan anak utamanya → sisipan lama: PRM-015a
--   • C dikirim sebagai utama padahal J sudah punya lanjutan utama → TIDAK
--     ditolak: dinamai cabang, dan kiriman membawa catatan untuk regu.
--
--   1. tiang.arah_utama_dari_sini — jawaban regu "jalur utama ke arah mana"
--   2. inti: _jtm_sisi, jtm_nama_baru
--   3. pemicu tiang_buat_kode_jtm & jtm_kode_penyulang_baru memakai inti
--   4. kirim_tiang_jtm: meneruskan arah_utama, mengembalikan catatan cabang
--   5. susun_nama_jtm (pratinjau) & terapkan_nama_jtm (tulis + audit)
-- =============================================================================


-- ── 1. Kolom ─────────────────────────────────────────────────────────────────

ALTER TABLE public.tiang
  ADD COLUMN IF NOT EXISTS arah_utama_dari_sini TEXT;
ALTER TABLE public.tiang DROP CONSTRAINT IF EXISTS tiang_arah_utama_valid;
ALTER TABLE public.tiang ADD CONSTRAINT tiang_arah_utama_valid
  CHECK (arah_utama_dari_sini IS NULL OR arah_utama_dari_sini IN ('kanan', 'lurus', 'kiri'));
COMMENT ON COLUMN public.tiang.arah_utama_dari_sini IS
  'Di tiang percabangan: arah jalur UTAMA yang keluar dari sini, dilihat dari arah datang (jawaban regu saat cabang dititik lebih dulu). Dipakai menentukan R/L cabang.';


-- ── 2. Inti penamaan ─────────────────────────────────────────────────────────

-- Sisi cabang terhadap arah jalur utama: kanan = searah jarum jam.
CREATE OR REPLACE FUNCTION public._jtm_sisi(p_arah_utama DOUBLE PRECISION, p_arah_cabang DOUBLE PRECISION)
RETURNS TEXT LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE
    WHEN p_arah_utama IS NULL OR p_arah_cabang IS NULL THEN 'R'
    WHEN ((p_arah_cabang - p_arah_utama + 360)::numeric % 360) > 0
     AND ((p_arah_cabang - p_arah_utama + 360)::numeric % 360) <= 180 THEN 'R'
    ELSE 'L'
  END
$$;

-- Arah jalur utama yang keluar dari tiang J (di penyulang ini):
--   anak utama yang sudah ada → arah J→anak; jawaban regu → arah datang ± 90°;
--   selain itu arah datang (dari leluhur J ke J). NULL = tidak diketahui.
CREATE OR REPLACE FUNCTION public._jtm_arah_utama(p_j UUID, p_penyulang TEXT, p_kecuali UUID DEFAULT NULL)
RETURNS DOUBLE PRECISION LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  j     RECORD;
  u     RECORD;
  h     RECORD;
  masuk DOUBLE PRECISION;
BEGIN
  SELECT id, lat, lng, induk_id, arah_utama_dari_sini INTO j FROM public.tiang WHERE id = p_j;
  IF NOT FOUND THEN RETURN NULL; END IF;

  SELECT a.lat, a.lng INTO u
  FROM public.tiang a
  JOIN public.tiang_kode_penyulang k ON k.tiang_id = a.id AND upper(k.penyulang) = upper(p_penyulang)
  WHERE a.induk_id = p_j AND a.status_hidup = 'aktif' AND NOT COALESCE(a.cabang_baru, false)
    AND a.id IS DISTINCT FROM p_kecuali
  ORDER BY a.created_at LIMIT 1;
  IF FOUND THEN RETURN public.arah_derajat(j.lat, j.lng, u.lat, u.lng); END IF;

  SELECT lat, lng INTO h FROM public.tiang
  WHERE id = public.jtm_leluhur_di_penyulang(j.induk_id, p_penyulang);
  masuk := public.arah_derajat(h.lat, h.lng, j.lat, j.lng);
  IF masuk IS NULL THEN RETURN NULL; END IF;
  RETURN (masuk + CASE j.arah_utama_dari_sini WHEN 'kanan' THEN 90 WHEN 'kiri' THEN 270 ELSE 0 END)::numeric % 360;
END $$;

-- Nama untuk tiang baru (atau tiang yang baru ditumpangi penyulang ini).
-- Mengembalikan nama + apakah tiang ini (akhirnya) cabang.
CREATE OR REPLACE FUNCTION public.jtm_nama_baru(
  p_induk_id  UUID,
  p_lat       DOUBLE PRECISION,
  p_lng       DOUBLE PRECISION,
  p_cabang    BOOLEAN,
  p_penyulang TEXT,
  p_ulp       TEXT,
  p_kecuali   UUID DEFAULT NULL
) RETURNS TABLE (kode TEXT, cabang BOOLEAN, dipaksa_cabang BOOLEAN, utama_kode TEXT)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  singkat TEXT;
  l_id    UUID;
  l_kode  TEXT;
  l_lat   DOUBLE PRECISION;
  l_lng   DOUBLE PRECISION;
  u       RECORD;
  awalan  TEXT;
  angka   TEXT;
  calon   TEXT;
  n       INT;
  sisi    TEXT;
  s       TEXT;
  selisih DOUBLE PRECISION;
  huruf   TEXT;
  jadi_cabang BOOLEAN := COALESCE(p_cabang, false);
  dipaksa BOOLEAN := false;
BEGIN
  singkat := public.kode_singkat_penyulang(p_penyulang, p_ulp);
  IF singkat IS NULL THEN
    RAISE EXCEPTION 'Penyulang "%" belum punya kode singkat — atur di Pengaturan penyulang', p_penyulang;
  END IF;

  l_id := public.jtm_leluhur_di_penyulang(p_induk_id, p_penyulang);

  -- Pangkal penyulang.
  IF l_id IS NULL THEN
    SELECT COALESCE(max((regexp_match(x.kode, '([0-9]+)$'))[1]::int), 0) INTO n
    FROM public.tiang_kode_penyulang x
    WHERE upper(x.penyulang) = upper(p_penyulang) AND upper(x.ulp) = upper(p_ulp)
      AND x.kode ~ ('^' || singkat || '-[0-9]+$');
    RETURN QUERY SELECT singkat || '-' || lpad((n + 1)::text, 3, '0'), false, false, NULL::text;
    RETURN;
  END IF;

  SELECT k.kode, t.lat, t.lng INTO l_kode, l_lat, l_lng
  FROM public.tiang t JOIN public.tiang_kode_penyulang k
    ON k.tiang_id = t.id AND upper(k.penyulang) = upper(p_penyulang)
  WHERE t.id = l_id;

  -- Anak UTAMA J yang sudah ada (bukan cabang).
  SELECT a.id, a.lat, a.lng, k.kode AS kode INTO u
  FROM public.tiang a
  JOIN public.tiang_kode_penyulang k ON k.tiang_id = a.id AND upper(k.penyulang) = upper(p_penyulang)
  WHERE a.induk_id = l_id AND a.status_hidup = 'aktif' AND NOT COALESCE(a.cabang_baru, false)
    AND a.id IS DISTINCT FROM p_kecuali
  ORDER BY a.created_at LIMIT 1;

  IF NOT jadi_cabang AND u.id IS NOT NULL THEN
    -- Sisipan: berdiri DI ANTARA J dan anak utamanya (searah ±45°, lebih dekat).
    selisih := abs(public.arah_derajat(l_lat, l_lng, p_lat, p_lng) - public.arah_derajat(l_lat, l_lng, u.lat, u.lng));
    IF selisih > 180 THEN selisih := 360 - selisih; END IF;
    IF selisih <= 45 AND public.jarak_meter(l_lat, l_lng, p_lat, p_lng) < public.jarak_meter(l_lat, l_lng, u.lat, u.lng) THEN
      SELECT COALESCE(max(substring(x.kode from '([a-z])$')), '') INTO huruf
      FROM public.tiang_kode_penyulang x
      WHERE upper(x.penyulang) = upper(p_penyulang) AND upper(x.ulp) = upper(p_ulp)
        AND x.kode ~ ('^' || l_kode || '[a-z]$');
      RETURN QUERY SELECT l_kode || CASE WHEN huruf = '' THEN 'a' ELSE chr(ascii(huruf) + 1) END, false, false, NULL::text;
      RETURN;
    END IF;
    -- Satu tiang hanya punya satu lanjutan utama: yang kedua dinamai cabang.
    jadi_cabang := true;
    dipaksa := true;
  END IF;

  IF NOT jadi_cabang THEN
    -- Lanjut garis K. Lebar angka garis lama dipertahankan (A17 → A18).
    awalan := regexp_replace(l_kode, '[0-9]+[a-z]?$', '');
    angka  := (regexp_match(l_kode, '([0-9]+)[a-z]?$'))[1];
    IF angka IS NULL THEN
      awalan := l_kode;   -- nama tanpa angka di ujung: mulai deret baru
      angka := '000';
    END IF;
    calon := awalan || lpad((angka::int + 1)::text, greatest(length(angka), 3), '0');
    IF EXISTS (SELECT 1 FROM public.tiang_kode_penyulang x
               WHERE upper(x.penyulang) = upper(p_penyulang) AND upper(x.ulp) = upper(p_ulp) AND x.kode = calon) THEN
      SELECT COALESCE(max((regexp_match(x.kode, '([0-9]+)$'))[1]::int), 0) INTO n
      FROM public.tiang_kode_penyulang x
      WHERE upper(x.penyulang) = upper(p_penyulang) AND upper(x.ulp) = upper(p_ulp)
        AND x.kode ~ ('^' || awalan || '[0-9]+$');
      calon := awalan || lpad((n + 1)::text, greatest(length(angka), 3), '0');
    END IF;
    RETURN QUERY SELECT calon, false, false, NULL::text;
    RETURN;
  END IF;

  -- Cabang: R/L terhadap arah jalur utama yang keluar dari J.
  sisi := public._jtm_sisi(public._jtm_arah_utama(l_id, p_penyulang, p_kecuali),
                           public.arah_derajat(l_lat, l_lng, p_lat, p_lng));
  s := sisi;
  WHILE EXISTS (SELECT 1 FROM public.tiang_kode_penyulang x
                WHERE upper(x.penyulang) = upper(p_penyulang) AND upper(x.ulp) = upper(p_ulp)
                  AND x.kode = l_kode || s || '001') LOOP
    s := s || sisi;
  END LOOP;
  RETURN QUERY SELECT l_kode || s || '001', true, dipaksa, u.kode;
END $$;

GRANT EXECUTE ON FUNCTION public.jtm_nama_baru(UUID, DOUBLE PRECISION, DOUBLE PRECISION, BOOLEAN, TEXT, TEXT, UUID) TO authenticated;


-- ── 3. Pemicu tiang lahir & nama saat menumpang ──────────────────────────────

CREATE OR REPLACE FUNCTION public.tiang_buat_kode_jtm()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE h RECORD;
BEGIN
  IF NEW.kode IS NOT NULL AND btrim(NEW.kode) <> '' THEN RETURN NEW; END IF;
  IF NEW.penyulang IS NULL OR NEW.gardu_kode IS NOT NULL THEN RETURN NEW; END IF;
  IF NEW.feeder IS NULL THEN NEW.feeder := NEW.penyulang; END IF;

  SELECT * INTO h FROM public.jtm_nama_baru(
    NEW.induk_id, NEW.lat, NEW.lng, COALESCE(NEW.cabang_baru, false), NEW.penyulang, COALESCE(NEW.ulp, '-'), NULL);
  NEW.kode := h.kode;
  -- Dinamai cabang (diminta, atau dipaksa karena J sudah punya lanjutan
  -- utama): ditandai, supaya induknya ikut ditandai percabangan dan
  -- penamaan anak-anaknya konsisten.
  IF h.cabang THEN NEW.cabang_baru := true; END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_tiang_buat_kode_jtm ON public.tiang;
CREATE TRIGGER trg_tiang_buat_kode_jtm
  BEFORE INSERT ON public.tiang
  FOR EACH ROW EXECUTE FUNCTION public.tiang_buat_kode_jtm();

CREATE OR REPLACE FUNCTION public.jtm_kode_penyulang_baru(
  p_tiang_id  UUID,
  p_penyulang TEXT,
  p_ulp       TEXT
) RETURNS TEXT
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE t RECORD; h RECORD;
BEGIN
  IF public.kode_singkat_penyulang(p_penyulang, p_ulp) IS NULL THEN RETURN NULL; END IF;
  SELECT * INTO t FROM public.tiang WHERE id = p_tiang_id;
  IF NOT FOUND THEN RETURN NULL; END IF;
  SELECT * INTO h FROM public.jtm_nama_baru(
    t.induk_id, t.lat, t.lng, COALESCE(t.cabang_baru, false), p_penyulang, p_ulp, t.id);
  RETURN h.kode;
END $$;


-- ── 4. kirim_tiang_jtm: arah jalur utama + catatan cabang ─────────────────────
-- Disalin utuh dari jtm-hak-akses-portal.sql; yang baru bertanda ★ (dua blok).

CREATE OR REPLACE FUNCTION public.kirim_tiang_jtm(p_isi JSONB)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  v_role   TEXT;
  v_unit   TEXT;
  v_id     UUID := NULLIF(p_isi->>'inspeksi_id', '')::uuid;
  v_seg    UUID := NULLIF(p_isi->>'segmen_id', '')::uuid;
  v_tier   TEXT := COALESCE(NULLIF(p_isi->>'tier', ''), '1');
  v_nama   TEXT := NULLIF(btrim(COALESCE(p_isi->>'nama', '')), '');
  v_status TEXT;
  s_ulp    TEXT;
  peta     JSONB := '{}'::jsonb;   -- id_lokal → tiang_id
  hasil    JSONB := '[]'::jsonb;
  r        JSONB;
  b        JSONB;
  v_tiang  UUID;
  v_induk  UUID;
  v_kode   TEXT;
  d        JSONB;
  sisa     INT := 0;
  selesai  JSONB;
  v_ok     BOOLEAN;
  ditolak  JSONB := '[]'::jsonb;
  sebagian BOOLEAN := COALESCE((p_isi->>'boleh_sebagian')::boolean, false);
  v_catatan TEXT;
BEGIN
  SELECT role, unit INTO v_role, v_unit FROM public.user_roles WHERE user_id = auth.uid();
  IF v_role IS NULL THEN
    RAISE EXCEPTION 'Sesi tidak dikenali server. Keluar lalu masuk lagi, kemudian kirim ulang — isian tetap tersimpan di HP.';
  END IF;

  -- ── inspeksi mana ──
  IF v_id IS NOT NULL THEN
    SELECT status, segmen_id INTO v_status, v_seg FROM public.inspeksi_jtm WHERE id = v_id;
    IF NOT FOUND THEN v_seg := NULLIF(p_isi->>'segmen_id', '')::uuid; END IF;
    -- Dibatalkan admin (atau hilang): pekerjaan di HP tetap sah — dikirim ke
    -- inspeksi yang berjalan / yang baru di segmen yang sama.
    IF NOT FOUND OR v_status = 'Dibatalkan' THEN v_id := NULL; v_status := NULL; END IF;
  END IF;
  IF v_seg IS NULL THEN RAISE EXCEPTION 'Segmen tidak disebut — perbarui aplikasi lalu kirim ulang.'; END IF;
  SELECT ulp INTO s_ulp FROM public.segmen WHERE id = v_seg;
  IF v_role <> 'UP3' AND upper(COALESCE(v_unit, '')) <> upper(COALESCE(s_ulp, '')) THEN
    RAISE EXCEPTION 'Segmen ini milik ULP %, akun ini ULP %.', COALESCE(s_ulp, '-'), COALESCE(v_unit, '-');
  END IF;

  -- Dua tim yang mengirim segmen yang sama bersamaan: yang kedua menunggu,
  -- lalu menemukan inspeksi yang dibuat yang pertama.
  PERFORM pg_advisory_xact_lock(hashtext('inspeksi-jtm|' || v_seg::text || '|' || v_tier));

  IF v_id IS NULL THEN
    -- Dimulai dari HP tanpa sinyal: cari yang sedang berjalan di segmen ini
    -- (tim lain boleh sudah memulainya — keputusan d), baru buat bila tidak ada.
    -- Yang sudah DIKIRIM (Selesai) tidak dibuka lagi dari HP (butir 2).
    SELECT id, status INTO v_id, v_status FROM public.inspeksi_jtm
    WHERE segmen_id = v_seg AND tier = v_tier AND status IN ('Dijadwalkan', 'Dalam Proses', 'Ditolak', 'Selesai')
    ORDER BY created_at DESC LIMIT 1;
  END IF;

  IF v_status = 'Selesai' THEN
    -- Kiriman "selesai" yang jawabannya hilang di jalan: semua tiangnya sudah
    -- ada → anggap berhasil. Selain itu tolak dengan jalan keluarnya.
    FOR r IN SELECT * FROM jsonb_array_elements(COALESCE(p_isi->'tiang', '[]'::jsonb)) LOOP
      v_tiang := COALESCE(NULLIF(r->>'tiang_id', '')::uuid,
                          (SELECT id FROM public.tiang WHERE id_hp = NULLIF(r->>'id_lokal', '')::uuid));
      IF v_tiang IS NULL OR (r->'daftar' IS NOT NULL AND jsonb_typeof(r->'daftar') = 'array' AND
         NOT EXISTS (SELECT 1 FROM public.inspeksi_jtm_titik WHERE inspeksi_id = v_id AND tiang_id = v_tiang)) THEN
        sisa := sisa + 1;
      END IF;
    END LOOP;
    IF sisa = 0 AND COALESCE((p_isi->>'selesai')::boolean, false) THEN
      RETURN jsonb_build_object('inspeksi_id', v_id, 'sudah_ada', true, 'tiang', '[]'::jsonb);
    END IF;
    RAISE EXCEPTION 'Inspeksi segmen ini sudah dikirim dan menunggu persetujuan — tiang tambahan tidak bisa dikirim. Minta admin mengembalikannya bila perlu.';
  END IF;
  IF v_status = 'Diverifikasi' THEN
    RAISE EXCEPTION 'Inspeksi segmen ini sudah disetujui admin — tidak bisa ditambah lagi.';
  END IF;

  IF v_id IS NULL OR v_status = 'Ditolak' THEN
    -- Baru, atau dikembalikan admin: dibuka lewat fungsi yang sudah ada.
    v_id := public.mulai_inspeksi_jtm(v_seg, v_tier, v_nama);
  END IF;

  -- ── tiang ──
  FOR r IN SELECT * FROM jsonb_array_elements(COALESCE(p_isi->'tiang', '[]'::jsonb)) LOOP
    v_tiang := NULLIF(r->>'tiang_id', '')::uuid;
    v_catatan := NULL;
    b := r->'baru';

    IF v_tiang IS NULL AND b IS NOT NULL AND jsonb_typeof(b) = 'object' THEN
      SELECT id INTO v_tiang FROM public.tiang WHERE id_hp = NULLIF(r->>'id_lokal', '')::uuid;
      IF v_tiang IS NULL THEN
        v_induk := COALESCE(NULLIF(b->>'induk_id', '')::uuid,
                            NULLIF(peta->>(b->>'induk_lokal'), '')::uuid,
                            (SELECT id FROM public.tiang WHERE id_hp = NULLIF(b->>'induk_lokal', '')::uuid AND status_hidup = 'aktif'));
        -- ★ Jawaban regu "jalur utama dari induk ke arah mana" — cabang yang
        -- dititik sebelum jalur utamanya (penentu R/L, jtm-penamaan-baru.sql).
        IF NULLIF(b->>'arah_utama', '') IN ('kanan', 'lurus', 'kiri') AND v_induk IS NOT NULL THEN
          UPDATE public.tiang SET arah_utama_dari_sini = b->>'arah_utama', updated_at = now() WHERE id = v_induk;
        END IF;
        d := public.tambah_tiang_jtm(
          v_seg,
          NULLIF(b->>'lat', '')::double precision,
          NULLIF(b->>'lng', '')::double precision,
          NULLIF(b->>'akurasi', '')::double precision,
          v_induk,
          NULLIF(b->>'jenis', ''),
          NULLIF(b->>'konstruksi', ''),
          NULLIF(b->>'nomor_lama', ''),
          v_nama,
          COALESCE((b->>'cabang')::boolean, false),
          COALESCE((b->>'batang_beda')::boolean, false));
        v_tiang := (d->>'id')::uuid;
        -- ★ Dikirim sebagai jalur utama tapi dinamai cabang (induknya sudah
        -- punya lanjutan utama): regu diberi tahu, bukan ditolak.
        IF NOT COALESCE((b->>'cabang')::boolean, false)
           AND (SELECT cabang_baru FROM public.tiang WHERE id = v_tiang) THEN
          SELECT 'Dinamai cabang ' || t.kode || ' — ' || COALESCE(i.kode, 'induknya')
                 || ' sudah punya lanjutan jalur utama'
                 || COALESCE(' (' || (SELECT a.kode FROM public.tiang a
                                      WHERE a.induk_id = t.induk_id AND a.id <> t.id AND a.status_hidup = 'aktif'
                                        AND NOT COALESCE(a.cabang_baru, false) ORDER BY a.created_at LIMIT 1) || ')', '')
                 || '. Kalau terbalik, admin bisa menukarnya di web.'
            INTO v_catatan
          FROM public.tiang t LEFT JOIN public.tiang i ON i.id = t.induk_id
          WHERE t.id = v_tiang;
        END IF;
        UPDATE public.tiang SET id_hp = NULLIF(r->>'id_lokal', '')::uuid WHERE id = v_tiang;
        -- ★ Tiang kedua gardu portal (dibuat HP saat penilaian tiang gardunya
        -- disimpan). Tiang gardunya selalu dikirim lebih dulu.
        IF COALESCE(NULLIF(b->>'pasangan_dari', ''), NULLIF(b->>'pasangan_lokal', '')) IS NOT NULL THEN
          UPDATE public.tiang
          SET pasangan_portal_dari = COALESCE(
                NULLIF(b->>'pasangan_dari', '')::uuid,
                NULLIF(peta->>(b->>'pasangan_lokal'), '')::uuid,
                (SELECT id FROM public.tiang WHERE id_hp = NULLIF(b->>'pasangan_lokal', '')::uuid AND status_hidup = 'aktif'))
          WHERE id = v_tiang;
        END IF;
      END IF;
    END IF;
    IF v_tiang IS NULL THEN
      RAISE EXCEPTION 'Satu tiang di kiriman ini tidak punya id — perbarui aplikasi lalu kirim ulang.';
    END IF;

    -- ★ Tiang yang sudah DIBATALKAN (salah titik) tidak punya tempat untuk
    -- penilaiannya. Dilewati dan dilaporkan — bukan menolak seluruh kiriman,
    -- karena regu tidak punya jalan keluar dari penolakan itu.
    IF EXISTS (SELECT 1 FROM public.tiang WHERE id = v_tiang AND status_hidup = 'batal') THEN
      hasil := hasil || jsonb_build_object('id_lokal', r->>'id_lokal', 'tiang_id', v_tiang,
        'kode', (SELECT kode FROM public.tiang WHERE id = v_tiang), 'dilewati', 'dibatalkan');
      CONTINUE;
    END IF;
    IF r->>'id_lokal' IS NOT NULL THEN peta := peta || jsonb_build_object(r->>'id_lokal', v_tiang); END IF;

    IF r->'daftar' IS NOT NULL AND jsonb_typeof(r->'daftar') = 'array' THEN
      IF EXISTS (
        SELECT 1 FROM jsonb_array_elements(r->'daftar') x
        WHERE COALESCE(x->>'foto_url', '') NOT IN ('') AND x->>'foto_url' NOT LIKE 'http%'
           OR COALESCE(x->>'foto_tutup_url', '') NOT IN ('') AND x->>'foto_tutup_url' NOT LIKE 'http%'
      ) THEN
        RAISE EXCEPTION 'Foto temuan belum terunggah. Kirim ulang saat sinyal lebih baik.';
      END IF;
      -- ★ Penolakan satu penilaian (jarak, GPS, temuan tanpa foto, …) tidak
      -- menggagalkan seluruh kiriman: tiangnya dilaporkan, sisanya diterima.
      v_ok := true;
      BEGIN
        PERFORM public.nilai_tiang_jtm(
          v_id, v_tiang,
          NULLIF(r->>'lat', '')::double precision,
          NULLIF(r->>'lng', '')::double precision,
          NULLIF(r->>'akurasi', '')::double precision,
          r->'daftar',
          NULLIF(btrim(COALESCE(r->>'catatan', '')), ''),
          v_nama);
      EXCEPTION WHEN raise_exception THEN
        IF NOT sebagian THEN RAISE; END IF;
        v_ok := false;
        ditolak := ditolak || jsonb_build_object(
          'id_lokal', r->>'id_lokal', 'tiang_id', v_tiang,
          'kode', (SELECT kode FROM public.tiang WHERE id = v_tiang), 'pesan', SQLERRM);
      END;
    END IF;
    IF v_ok IS TRUE AND r->'daftar' IS NOT NULL AND jsonb_typeof(r->'daftar') = 'array' THEN
      -- ★ Kiriman = isian LENGKAP tiang ini. Jawaban dari kiriman sebelumnya
      -- yang tidak ada lagi (item bersyarat yang kini tidak berlaku, mis.
      -- jumperan diubah jadi "tidak ada") dibuang — kalau tidak, ikut jadi
      -- keadaan terakhir & temuan sesudah disetujui.
      DELETE FROM public.inspeksi_jtm_periksa p
      USING public.inspeksi_jtm_titik tk
      WHERE p.titik_id = tk.id AND tk.inspeksi_id = v_id AND tk.tiang_id = v_tiang
        AND NOT EXISTS (
          SELECT 1 FROM jsonb_array_elements(r->'daftar') x
          WHERE x->>'item_kode' = p.item_kode
            AND COALESCE(NULLIF(x->>'bagian', ''), '-') = p.bagian
            AND COALESCE(NULLIF(x->>'sirkit_segmen_id', '')::uuid, '00000000-0000-0000-0000-000000000000'::uuid)
              = COALESCE(p.sirkit_segmen_id, '00000000-0000-0000-0000-000000000000'::uuid));

      -- Waktu menilai = saat di HP (butir 17), dipotong ke sekarang bila jam HP maju.
      -- ★ Catatan ikut kiriman terakhir — mengosongkannya juga sah.
      UPDATE public.inspeksi_jtm_titik
      SET dinilai_at = LEAST(COALESCE(NULLIF(r->>'dinilai_at', '')::timestamptz, now()), now()),
          catatan = NULLIF(btrim(COALESCE(r->>'catatan', '')), '')
      WHERE inspeksi_id = v_id AND tiang_id = v_tiang;
    END IF;

    -- ★ induk_id ikut: HP menambal garis induk tiang baru tanpa memuat ulang segmen.
    SELECT kode, induk_id INTO v_kode, v_induk FROM public.tiang WHERE id = v_tiang;
    hasil := hasil || jsonb_build_object('id_lokal', r->>'id_lokal', 'tiang_id', v_tiang, 'kode', v_kode, 'induk_id', v_induk,
                                         'catatan', v_catatan);
  END LOOP;

  -- ── tutup ──
  -- ★ Ada penilaian yang ditolak = belum bisa dinyatakan selesai.
  IF COALESCE((p_isi->>'selesai')::boolean, false) AND jsonb_array_length(ditolak) = 0 THEN
    selesai := public.selesaikan_inspeksi_jtm(v_id, v_nama, NULLIF(btrim(COALESCE(p_isi->>'catatan_selesai', '')), ''));
  END IF;

  RETURN jsonb_build_object('inspeksi_id', v_id, 'sudah_ada', false, 'tiang', hasil, 'selesai', selesai,
                            'ditolak', ditolak);
END $fn$;

GRANT EXECUTE ON FUNCTION public.kirim_tiang_jtm(JSONB) TO authenticated;


-- ── 5. Susun nama (pratinjau) & terapkan ─────────────────────────────────────
-- Satu mesin untuk tiga pintu di web:
--   • Generate ulang seluruh penyulang  (p_mulai NULL)
--   • Ganti nama di satu tiang, hilir ikut (p_mulai + p_nama_mulai)
--   • Tukar jalur utama/cabang          (p_utama_paksa = anak yang dijadikan utama)
-- Pohon ditelusuri dari pangkal: jalur utama lanjut nomornya, cabang mendapat
-- R/L (RR/LL bila sisinya sudah dipakai), semua angka tiga digit. Sisipan lama
-- (PRM-012a) ikut dirapikan jadi berurutan (keputusan G1).

CREATE OR REPLACE FUNCTION public.susun_nama_jtm(
  p_penyulang   TEXT,
  p_ulp         TEXT,
  p_mulai       UUID DEFAULT NULL,
  p_nama_mulai  TEXT DEFAULT NULL,
  p_utama_paksa UUID DEFAULT NULL
) RETURNS TABLE (tiang_id UUID, lama TEXT, baru TEXT, induk_id UUID, cabang BOOLEAN, catatan TEXT)
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS $$
#variable_conflict use_column
DECLARE
  singkat  TEXT;
  v_ulp    TEXT := upper(btrim(COALESCE(p_ulp, '')));
  akar     RECORD;
  n        UUID;
  k        TEXT;
  s_id     UUID[];
  s_kode   TEXT[];
  urut     INT := 0;
  pokok    INT := 0;
  m        RECORD;
  ch       RECORD;
  u_id     UUID;
  arah_u   DOUBLE PRECISION;
  h        RECORD;
  masuk    DOUBLE PRECISION;
  sisi     TEXT;
  nama_akar TEXT;
  anak_id  UUID[];
  anak_kd  TEXT[];
  jml_r    INT;
  jml_l    INT;
  awalan   TEXT;
  angka    INT;
BEGIN
  singkat := public.kode_singkat_penyulang(p_penyulang, p_ulp);
  IF singkat IS NULL THEN
    RAISE EXCEPTION 'Penyulang "%" belum punya kode singkat — atur di Pengaturan penyulang', p_penyulang;
  END IF;
  IF p_nama_mulai IS NOT NULL AND upper(btrim(p_nama_mulai)) !~ '[0-9]{3}$' THEN
    RAISE EXCEPTION 'Nama harus diakhiri tiga angka — contoh: PRM-020 atau PRM-015R001';
  END IF;

  DROP TABLE IF EXISTS _sn_simpul;
  CREATE TEMP TABLE _sn_simpul (
    id UUID PRIMARY KEY, induk UUID, lat DOUBLE PRECISION, lng DOUBLE PRECISION,
    cabang BOOLEAN, dibuat TIMESTAMPTZ, lama TEXT, arah_utama TEXT, pindah BOOLEAN DEFAULT false
  ) ON COMMIT DROP;
  DROP TABLE IF EXISTS _sn_hasil;
  CREATE TEMP TABLE _sn_hasil (
    id UUID, lama TEXT, baru TEXT, induk UUID, cabang BOOLEAN, catatan TEXT, urut INT
  ) ON COMMIT DROP;

  INSERT INTO _sn_simpul
  SELECT t.id, public.jtm_leluhur_di_penyulang(t.induk_id, p_penyulang), t.lat, t.lng,
         COALESCE(t.cabang_baru, false), t.created_at, kp.kode, t.arah_utama_dari_sini
  FROM public.tiang_kode_penyulang kp
  JOIN public.tiang t ON t.id = kp.tiang_id
  WHERE upper(kp.penyulang) = upper(p_penyulang) AND upper(kp.ulp) = v_ulp AND t.status_hidup = 'aktif';
  UPDATE _sn_simpul s SET induk = NULL
  WHERE s.induk IS NOT NULL AND NOT EXISTS (SELECT 1 FROM _sn_simpul x WHERE x.id = s.induk);

  -- Sisipan lama: tiang yang dititik DI ANTARA J dan anak utamanya tercatat
  -- sebagai saudara (induk keduanya J). Urutan jalurnya dipulihkan: anak yang
  -- lebih jauh (searah ±45°) dipindah menjadi anak tiang yang lebih dekat —
  -- tercatat di pratinjau sebagai "induk dipindah", diterapkan bersama nama.
  FOR ch IN SELECT x.id, x.induk, x.lat, x.lng FROM _sn_simpul x WHERE x.induk IS NOT NULL AND NOT x.cabang LOOP
    UPDATE _sn_simpul c SET induk = pilih.id, pindah = true
    FROM (
      SELECT a.id FROM _sn_simpul a, _sn_simpul j
      WHERE j.id = ch.induk AND a.induk = ch.induk AND a.id <> ch.id AND NOT a.cabang
        AND public.jarak_meter(j.lat, j.lng, a.lat, a.lng) < public.jarak_meter(j.lat, j.lng, ch.lat, ch.lng)
        AND least(abs(public.arah_derajat(j.lat, j.lng, a.lat, a.lng) - public.arah_derajat(j.lat, j.lng, ch.lat, ch.lng)),
                  360 - abs(public.arah_derajat(j.lat, j.lng, a.lat, a.lng) - public.arah_derajat(j.lat, j.lng, ch.lat, ch.lng))) <= 45
      ORDER BY public.jarak_meter(a.lat, a.lng, ch.lat, ch.lng) LIMIT 1
    ) pilih
    WHERE c.id = ch.id;
  END LOOP;

  IF p_utama_paksa IS NOT NULL THEN
    IF NOT EXISTS (SELECT 1 FROM _sn_simpul WHERE id = p_utama_paksa AND induk IS NOT NULL) THEN
      RAISE EXCEPTION 'Tiang yang dijadikan jalur utama bukan anak tiang lain di penyulang ini';
    END IF;
    UPDATE _sn_simpul SET cabang = (id <> p_utama_paksa)
    WHERE induk = (SELECT induk FROM _sn_simpul WHERE id = p_utama_paksa);
  END IF;

  IF p_mulai IS NOT NULL AND NOT EXISTS (SELECT 1 FROM _sn_simpul WHERE id = p_mulai) THEN
    RAISE EXCEPTION 'Tiang itu belum punya nama di penyulang %', p_penyulang;
  END IF;

  FOR akar IN
    SELECT s.id, s.lama FROM _sn_simpul s
    WHERE (p_mulai IS NULL AND s.induk IS NULL) OR s.id = p_mulai
    ORDER BY s.dibuat, s.id
  LOOP
    IF p_mulai IS NOT NULL THEN
      nama_akar := upper(btrim(COALESCE(p_nama_mulai, akar.lama)));
    ELSE
      nama_akar := singkat || '-' || lpad((pokok + 1)::text, 3, '0');
    END IF;
    s_id := ARRAY[akar.id];
    s_kode := ARRAY[nama_akar];

    WHILE cardinality(s_id) > 0 LOOP
      n := s_id[cardinality(s_id)];
      k := s_kode[cardinality(s_kode)];
      s_id := s_id[1:cardinality(s_id) - 1];
      s_kode := s_kode[1:cardinality(s_kode) - 1];
      SELECT * INTO m FROM _sn_simpul WHERE id = n;
      urut := urut + 1;
      INSERT INTO _sn_hasil VALUES (n, m.lama, k, m.induk, m.cabang, NULL, urut);
      IF k ~ ('^' || singkat || '-[0-9]+$') THEN
        pokok := greatest(pokok, (regexp_match(k, '([0-9]+)$'))[1]::int);
      END IF;

      -- Anak jalur utama: yang bukan cabang, tertua dulu. Anak bukan-cabang
      -- lainnya dianggap cabang (satu tiang, satu lanjutan utama).
      SELECT id INTO u_id FROM _sn_simpul WHERE induk = n AND NOT cabang ORDER BY dibuat, id LIMIT 1;

      -- Arah jalur utama yang keluar dari n (untuk sisi R/L cabang).
      arah_u := NULL;
      IF u_id IS NOT NULL THEN
        SELECT public.arah_derajat(m.lat, m.lng, x.lat, x.lng) INTO arah_u FROM _sn_simpul x WHERE x.id = u_id;
      ELSE
        SELECT lat, lng INTO h FROM _sn_simpul WHERE id = m.induk;
        masuk := public.arah_derajat(h.lat, h.lng, m.lat, m.lng);
        IF masuk IS NOT NULL THEN
          arah_u := (masuk + CASE m.arah_utama WHEN 'kanan' THEN 90 WHEN 'kiri' THEN 270 ELSE 0 END)::numeric % 360;
        END IF;
      END IF;

      -- Cabang: R sebelum L, lalu tertua. Disusun dulu, didorong ke tumpukan
      -- terbalik supaya keluar berurutan sesudah jalur utama.
      anak_id := '{}'; anak_kd := '{}'; jml_r := 0; jml_l := 0;
      FOR ch IN
        SELECT x.id, x.cabang, public._jtm_sisi(arah_u, public.arah_derajat(m.lat, m.lng, x.lat, x.lng)) AS sisi
        FROM _sn_simpul x
        WHERE x.induk = n AND x.id IS DISTINCT FROM u_id
        ORDER BY 3 DESC, x.dibuat, x.id     -- 'R' > 'L'
      LOOP
        IF ch.sisi = 'R' THEN jml_r := jml_r + 1; sisi := repeat('R', jml_r);
        ELSE jml_l := jml_l + 1; sisi := repeat('L', jml_l); END IF;
        anak_id := anak_id || ch.id;
        anak_kd := anak_kd || (k || sisi || '001');
        IF NOT ch.cabang THEN
          INSERT INTO _sn_hasil VALUES (ch.id, NULL, NULL, NULL, NULL,
            'dianggap cabang — ' || k || ' sudah punya lanjutan utama', -1);
        END IF;
      END LOOP;
      FOR i IN REVERSE cardinality(anak_id)..1 LOOP
        s_id := s_id || anak_id[i];
        s_kode := s_kode || anak_kd[i];
      END LOOP;

      IF u_id IS NOT NULL THEN
        awalan := regexp_replace(k, '[0-9]+[a-z]?$', '');
        angka  := COALESCE((regexp_match(k, '([0-9]+)[a-z]?$'))[1]::int, 0);
        s_id := s_id || u_id;
        s_kode := s_kode || (awalan || lpad((angka + 1)::text, 3, '0'));
      END IF;
    END LOOP;
  END LOOP;

  -- Induk yang dipindah (sisipan) dicatat di baris tiangnya.
  UPDATE _sn_hasil r
  SET catatan = 'induk dipindah ke ' || COALESCE((SELECT y.baru FROM _sn_hasil y WHERE y.id = r.induk AND y.urut > 0 LIMIT 1), 'tiang sisipan')
                || ' (tiang sisipan di antaranya)'
  FROM _sn_simpul x WHERE x.id = r.id AND x.pindah AND r.urut > 0;

  -- Catatan "dianggap cabang" dipindah ke baris tiangnya.
  UPDATE _sn_hasil r SET catatan = c.catatan, cabang = true
  FROM _sn_hasil c WHERE c.urut = -1 AND c.id = r.id AND r.urut > 0;
  DELETE FROM _sn_hasil WHERE urut = -1;

  -- Ganti nama sebagian pohon: nama baru tidak boleh dipakai tiang di luarnya.
  IF p_mulai IS NOT NULL THEN
    UPDATE _sn_hasil r
    SET catatan = 'bentrok — ' || r.baru || ' sudah dipakai ' || COALESCE(x.lama, 'tiang lain') || ' di luar bagian ini'
    FROM _sn_simpul x
    WHERE upper(x.lama) = upper(r.baru)
      AND NOT EXISTS (SELECT 1 FROM _sn_hasil y WHERE y.id = x.id);
  END IF;

  RETURN QUERY SELECT r.id, r.lama, r.baru, r.induk, r.cabang, r.catatan FROM _sn_hasil r ORDER BY r.urut;
END $$;

GRANT EXECUTE ON FUNCTION public.susun_nama_jtm(TEXT, TEXT, UUID, TEXT, UUID) TO authenticated;


CREATE OR REPLACE FUNCTION public.terapkan_nama_jtm(
  p_penyulang   TEXT,
  p_ulp         TEXT,
  p_mulai       UUID DEFAULT NULL,
  p_nama_mulai  TEXT DEFAULT NULL,
  p_utama_paksa UUID DEFAULT NULL,
  p_jumlah      INT DEFAULT NULL,
  p_oleh        TEXT DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
#variable_conflict use_column
DECLARE
  v_ulp   TEXT := upper(btrim(COALESCE(p_ulp, '')));
  total   INT;
  berubah INT;
  b       RECORD;
  induk_paksa UUID;
BEGIN
  PERFORM public.wajib_boleh_ulp(p_ulp);

  DROP TABLE IF EXISTS _sn_terap;
  CREATE TEMP TABLE _sn_terap ON COMMIT DROP AS
  SELECT * FROM public.susun_nama_jtm(p_penyulang, p_ulp, p_mulai, p_nama_mulai, p_utama_paksa);

  SELECT count(*), count(*) FILTER (WHERE lama IS DISTINCT FROM baru) INTO total, berubah FROM _sn_terap;
  IF p_jumlah IS NOT NULL AND total <> p_jumlah THEN
    RAISE EXCEPTION 'Jaringan berubah sejak pratinjau dibuat (% tiang, kini %). Pratinjau dimuat ulang — periksa lalu Terapkan lagi.', p_jumlah, total;
  END IF;
  SELECT * INTO b FROM _sn_terap WHERE catatan LIKE 'bentrok%' LIMIT 1;
  IF FOUND THEN
    RAISE EXCEPTION 'Nama % sudah dipakai tiang lain di penyulang % — pilih nama lain, atau ganti dulu tiang itu.', b.baru, p_penyulang;
  END IF;

  -- Tukar utama/cabang: penandanya ikut disimpan.
  IF p_utama_paksa IS NOT NULL THEN
    SELECT induk_id INTO induk_paksa FROM _sn_terap WHERE tiang_id = p_utama_paksa;
    UPDATE public.tiang t SET cabang_baru = (t.id <> p_utama_paksa), updated_at = now()
    FROM _sn_terap r WHERE r.tiang_id = t.id AND r.induk_id = induk_paksa;
  END IF;
  -- Sisipan lama: induk tiang sesudahnya dipindah ke tiang sisipan (jalur lewat situ).
  INSERT INTO public.master_audit
    (entitas, entitas_kode, ulp, field, nilai_lama, nilai_baru, aksi, oleh_uid, oleh_nama)
  SELECT 'tiang', r.baru, v_ulp, 'induk',
         to_jsonb((SELECT kode FROM public.tiang WHERE id = t.induk_id)), to_jsonb((SELECT y.baru FROM _sn_terap y WHERE y.tiang_id = r.induk_id)),
         'generate_nama', auth.uid(), p_oleh
  FROM _sn_terap r JOIN public.tiang t ON t.id = r.tiang_id
  WHERE r.catatan LIKE 'induk dipindah%' AND t.induk_id IS DISTINCT FROM r.induk_id;
  UPDATE public.tiang t SET induk_id = r.induk_id, updated_at = now()
  FROM _sn_terap r WHERE r.tiang_id = t.id AND r.catatan LIKE 'induk dipindah%' AND t.induk_id IS DISTINCT FROM r.induk_id;

  -- Anak yang "dianggap cabang" ditandai cabang supaya penamaan berikutnya konsisten.
  UPDATE public.tiang t SET cabang_baru = true, updated_at = now()
  FROM _sn_terap r WHERE r.tiang_id = t.id AND r.catatan LIKE 'dianggap cabang%' AND NOT COALESCE(t.cabang_baru, false);

  IF berubah = 0 THEN
    RETURN jsonb_build_object('total', total, 'berubah', 0);
  END IF;

  -- Nama sementara dulu: dua indeks unik (per penyulang & tiang aktif) tidak
  -- boleh bertabrakan di tengah penggantian.
  UPDATE public.tiang t SET kode = '~' || left(t.id::text, 8) || '~'
  FROM _sn_terap r, public.tiang_kode_penyulang kp
  WHERE r.tiang_id = t.id AND r.lama IS DISTINCT FROM r.baru
    AND kp.tiang_id = t.id AND upper(kp.penyulang) = upper(p_penyulang) AND kp.utama;
  UPDATE public.tiang_kode_penyulang kp SET kode = '~' || left(kp.tiang_id::text, 8) || '~'
  FROM _sn_terap r
  WHERE r.tiang_id = kp.tiang_id AND upper(kp.penyulang) = upper(p_penyulang) AND upper(kp.ulp) = v_ulp
    AND r.lama IS DISTINCT FROM r.baru;

  UPDATE public.tiang_kode_penyulang kp SET kode = r.baru, updated_at = now()
  FROM _sn_terap r
  WHERE r.tiang_id = kp.tiang_id AND upper(kp.penyulang) = upper(p_penyulang) AND upper(kp.ulp) = v_ulp
    AND r.lama IS DISTINCT FROM r.baru;
  UPDATE public.tiang t SET kode = r.baru, updated_at = now()
  FROM _sn_terap r, public.tiang_kode_penyulang kp
  WHERE r.tiang_id = t.id AND r.lama IS DISTINCT FROM r.baru
    AND kp.tiang_id = t.id AND upper(kp.penyulang) = upper(p_penyulang) AND kp.utama;

  -- Label segmen yang menyebut nama tiang (titik bertipe TIANG) ikut.
  UPDATE public.segmen s SET titik_awal_nama = r.baru || substr(s.titik_awal_nama, length(r.lama) + 1), updated_at = now()
  FROM _sn_terap r
  WHERE s.titik_awal_tiang_id = r.tiang_id AND s.titik_awal_jenis = 'TIANG'
    AND r.lama IS DISTINCT FROM r.baru AND upper(s.titik_awal_nama) LIKE upper(r.lama) || '%';
  UPDATE public.segmen s SET titik_akhir_nama = r.baru || substr(s.titik_akhir_nama, length(r.lama) + 1), updated_at = now()
  FROM _sn_terap r
  WHERE s.titik_akhir_tiang_id = r.tiang_id AND s.titik_akhir_jenis = 'TIANG'
    AND r.lama IS DISTINCT FROM r.baru AND upper(s.titik_akhir_nama) LIKE upper(r.lama) || '%';

  INSERT INTO public.master_audit
    (entitas, entitas_kode, ulp, field, nilai_lama, nilai_baru, aksi, oleh_uid, oleh_nama)
  SELECT 'tiang', r.baru, v_ulp, 'kode/' || upper(p_penyulang), to_jsonb(r.lama), to_jsonb(r.baru),
         CASE WHEN p_mulai IS NULL AND p_utama_paksa IS NULL THEN 'generate_nama' ELSE 'ganti_nama_hilir' END,
         auth.uid(), p_oleh
  FROM _sn_terap r WHERE r.lama IS DISTINCT FROM r.baru;

  RETURN jsonb_build_object('total', total, 'berubah', berubah);
END $$;

GRANT EXECUTE ON FUNCTION public.terapkan_nama_jtm(TEXT, TEXT, UUID, TEXT, UUID, INT, TEXT) TO authenticated;


-- ── Periksa ──────────────────────────────────────────────────────────────────
--   SELECT * FROM susun_nama_jtm('PERUMNAS', 'AMPENAN') LIMIT 50;   -- pratinjau, tidak menulis
--   SELECT max(length(baru)), max(length(lama)) FROM susun_nama_jtm('SANDUBAYA', 'CAKRANEGARA');
