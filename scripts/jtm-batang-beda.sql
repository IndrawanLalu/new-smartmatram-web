-- =============================================================================
-- Penjaga tiang berdekatan = PERTANYAAN, bukan larangan (user 26 Sep 2026)
-- Jalankan manual di Supabase SQL Editor, SESUDAH `wo-inspeksi-jtm.sql`.
-- Idempoten.
--
-- User: "ada tiang JTR yang memang ada di sebelahnya tiang JTM, bahkan jaraknya
-- hanya 0.2 meter." GPS HP tidak bisa membedakan dua batang yang berdampingan,
-- jadi penolakan mutlak salah. HP sudah bertanya ("Tiang lain, bukan itu" →
-- "Ya, dua batang berbeda"), tapi `tambah_tiang_jtm` tetap menolak — sejak
-- kiriman J3 itu menahan SELURUH kiriman segmen.
--
--   1. tiang.beda_dari_tiang_id / beda_dari_jarak_m — jejak "regu menyatakan
--      batang lain di sebelah tiang X" untuk diperiksa admin
--   2. tambah_tiang_jtm(… , p_batang_beda) — tidak menolak bila dinyatakan
--   3. kirim_tiang_jtm meneruskan `baru.batang_beda` dari HP
-- =============================================================================

ALTER TABLE public.tiang
  ADD COLUMN IF NOT EXISTS beda_dari_tiang_id UUID REFERENCES public.tiang(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS beda_dari_jarak_m  NUMERIC(6,1);
COMMENT ON COLUMN public.tiang.beda_dari_tiang_id IS
  'Regu menyatakan batang ini BERBEDA dari tiang tsb meski berdekatan (dalam radius tumpang). Bahan pemeriksaan admin, bukan kesalahan.';

-- Parameter bertambah → DROP dulu (CREATE OR REPLACE tidak bisa mengubah
-- jumlah argumen, dan dua versi hidup membuat PostgREST memilih sendiri).
DROP FUNCTION IF EXISTS public.tambah_tiang_jtm(
  UUID, DOUBLE PRECISION, DOUBLE PRECISION, DOUBLE PRECISION,
  UUID, TEXT, TEXT, TEXT, TEXT, BOOLEAN);

CREATE OR REPLACE FUNCTION public.tambah_tiang_jtm(
  p_segmen_id  UUID,
  p_lat        DOUBLE PRECISION,
  p_lng        DOUBLE PRECISION,
  p_akurasi    DOUBLE PRECISION DEFAULT NULL,
  p_induk_id   UUID DEFAULT NULL,
  p_jenis      TEXT DEFAULT NULL,
  p_konstruksi TEXT DEFAULT NULL,
  p_nomor_lama TEXT DEFAULT NULL,
  p_nama       TEXT DEFAULT NULL,
  p_cabang     BOOLEAN DEFAULT false,
  -- Regu MENYATAKAN ini batang lain di sebelah tiang yang sudah ada (JTR di
  -- samping JTM bisa berjarak 0,2 m — GPS tidak bisa membedakannya).
  p_batang_beda BOOLEAN DEFAULT false
) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  s        RECORD;
  amb      public.jtm_settings%ROWTYPE;
  dekat    RECORD;
  induk    UUID := p_induk_id;
  id_baru  UUID;
  kode_baru TEXT;
BEGIN
  SELECT * INTO s FROM public.segmen WHERE id = p_segmen_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Segmen tidak ditemukan'; END IF;
  IF p_lat IS NULL OR p_lng IS NULL THEN RAISE EXCEPTION 'Titik tiang belum terbaca'; END IF;

  SELECT * INTO amb FROM public.jtm_ambang(s.ulp);
  IF p_akurasi IS NOT NULL AND p_akurasi > amb.akurasi_minimum_m THEN
    RAISE EXCEPTION 'Sinyal GPS belum cukup baik (±% m). Tunggu sebentar.',
      round(p_akurasi::numeric, 0);
  END IF;

  -- SATU BATANG BETON TIDAK BOLEH LAHIR DUA KALI. Kalau sudah ada tiang di
  -- titik ini — milik penyulang mana pun — yang benar bukan menambah, melainkan
  -- MENUMPANG. Kesalahan ini tidak akan pernah ketahuan dari belakang meja:
  -- dua tiang di koordinat yang sama terlihat seperti jaringan yang panjang.
  SELECT t.id, t.kode, t.penyulang,
         public.jarak_meter(p_lat, p_lng, t.lat, t.lng) AS m
    INTO dekat
  FROM public.tiang t
  WHERE t.status_hidup = 'aktif' AND t.lat IS NOT NULL AND t.lng IS NOT NULL
    AND upper(COALESCE(t.ulp, '')) = upper(s.ulp)
  ORDER BY public.jarak_meter(p_lat, p_lng, t.lat, t.lng)
  LIMIT 1;

  -- Penjaga = PERTANYAAN, bukan larangan (user 26 Sep 2026): regu yang sudah
  -- menjawab "batang lain" tidak ditolak — jawabannya dicatat untuk admin.
  IF dekat.id IS NOT NULL AND dekat.m <= amb.radius_tumpang_m AND NOT COALESCE(p_batang_beda, false) THEN
    RAISE EXCEPTION
      'Tiang % (penyulang %) sudah berdiri di titik ini, % m dari Anda. Pakai "tiang ini sudah ada" untuk menumpanginya — jangan menambah tiang kedua di batang yang sama.',
      dekat.kode, dekat.penyulang, round(dekat.m::numeric, 0);
  END IF;

  -- Induk otomatis = tiang terdekat MILIK PENYULANG INI, kecuali petugas
  -- menunjuk sendiri di peta (kasus bercabang).
  IF induk IS NULL THEN
    SELECT t.id INTO induk
    FROM public.tiang t
    WHERE upper(COALESCE(t.penyulang, '')) = upper(s.penyulang)
      AND t.status_hidup = 'aktif' AND t.lat IS NOT NULL
      AND public.jarak_meter(p_lat, p_lng, t.lat, t.lng) <= amb.bentang_maks_wajar_m * 3
    ORDER BY public.jarak_meter(p_lat, p_lng, t.lat, t.lng)
    LIMIT 1;
  END IF;

  INSERT INTO public.tiang
    (penyulang, ulp, lat, lng, jenis, konstruksi, nomor_lama, induk_id,
     cabang_baru, sumber, status_hidup, dikonfirmasi_at, dikonfirmasi_oleh)
  VALUES (s.penyulang, s.ulp, p_lat, p_lng,
          NULLIF(btrim(COALESCE(p_jenis, '')), ''),
          NULLIF(btrim(COALESCE(p_konstruksi, '')), ''),
          NULLIF(btrim(COALESCE(p_nomor_lama, '')), ''),
          induk, COALESCE(p_cabang, false), 'lapangan', 'aktif', now(), p_nama)
  RETURNING id, kode INTO id_baru, kode_baru;

  IF COALESCE(p_batang_beda, false) AND dekat.id IS NOT NULL AND dekat.m <= amb.radius_tumpang_m THEN
    UPDATE public.tiang SET beda_dari_tiang_id = dekat.id, beda_dari_jarak_m = round(dekat.m::numeric, 1)
    WHERE id = id_baru;
  END IF;

  INSERT INTO public.segmen_tiang (segmen_id, tiang_id, posisi, sumber)
  VALUES (p_segmen_id, id_baru, 'atas', 'lapangan')
  ON CONFLICT DO NOTHING;

  RETURN jsonb_build_object('id', id_baru, 'kode', kode_baru, 'induk_id', induk);
END $$;

GRANT EXECUTE ON FUNCTION public.tambah_tiang_jtm TO authenticated;


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
    b := r->'baru';

    IF v_tiang IS NULL AND b IS NOT NULL AND jsonb_typeof(b) = 'object' THEN
      SELECT id INTO v_tiang FROM public.tiang WHERE id_hp = NULLIF(r->>'id_lokal', '')::uuid;
      IF v_tiang IS NULL THEN
        v_induk := COALESCE(NULLIF(b->>'induk_id', '')::uuid,
                            NULLIF(peta->>(b->>'induk_lokal'), '')::uuid,
                            (SELECT id FROM public.tiang WHERE id_hp = NULLIF(b->>'induk_lokal', '')::uuid));
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
        UPDATE public.tiang SET id_hp = NULLIF(r->>'id_lokal', '')::uuid WHERE id = v_tiang;
      END IF;
    END IF;
    IF v_tiang IS NULL THEN
      RAISE EXCEPTION 'Satu tiang di kiriman ini tidak punya id — perbarui aplikasi lalu kirim ulang.';
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
      PERFORM public.nilai_tiang_jtm(
        v_id, v_tiang,
        NULLIF(r->>'lat', '')::double precision,
        NULLIF(r->>'lng', '')::double precision,
        NULLIF(r->>'akurasi', '')::double precision,
        r->'daftar',
        NULLIF(btrim(COALESCE(r->>'catatan', '')), ''),
        v_nama);
      -- Waktu menilai = saat di HP (butir 17), dipotong ke sekarang bila jam HP maju.
      UPDATE public.inspeksi_jtm_titik
      SET dinilai_at = LEAST(COALESCE(NULLIF(r->>'dinilai_at', '')::timestamptz, now()), now())
      WHERE inspeksi_id = v_id AND tiang_id = v_tiang;
    END IF;

    SELECT kode INTO v_kode FROM public.tiang WHERE id = v_tiang;
    hasil := hasil || jsonb_build_object('id_lokal', r->>'id_lokal', 'tiang_id', v_tiang, 'kode', v_kode);
  END LOOP;

  -- ── tutup ──
  IF COALESCE((p_isi->>'selesai')::boolean, false) THEN
    selesai := public.selesaikan_inspeksi_jtm(v_id, v_nama, NULLIF(btrim(COALESCE(p_isi->>'catatan_selesai', '')), ''));
  END IF;

  RETURN jsonb_build_object('inspeksi_id', v_id, 'sudah_ada', false, 'tiang', hasil, 'selesai', selesai);
END $fn$;

GRANT EXECUTE ON FUNCTION public.kirim_tiang_jtm(JSONB) TO authenticated;

-- Periksa:
--   SELECT kode, beda_dari_jarak_m, (SELECT kode FROM tiang x WHERE x.id = t.beda_dari_tiang_id)
--   FROM tiang t WHERE beda_dari_tiang_id IS NOT NULL;
