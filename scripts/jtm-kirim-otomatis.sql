-- =============================================================================
-- Inspeksi JTM: titik tiang terkirim otomatis + perbaikan hasil audit
-- Keputusan user 2 Okt 2026 (rencana-kirim-otomatis-jtm.md, C1–C5 disetujui).
-- Jalankan manual di Supabase SQL Editor, SESUDAH `jtm-batang-beda.sql`,
-- `jtm-pangkal-tiang.sql`, dan `wo-bulan-anomali.sql`. Idempoten.
-- SQL dijalankan DULU, baru OTA HP — HP baru membaca `induk_id` & HINT.
--
--   1. tambah_tiang_jtm — penolakan "sudah ada tiang di titik ini" membawa
--      HINT `tumpuk:<id>`; tiang JTR disebut sebagai tiang JTR + gardunya
--      (dulu "penyulang <NULL>").                                       (A2)
--   2. kirim_tiang_jtm — (a) jawaban basi dari kiriman sebelumnya dibuang,
--      catatan bisa dikosongkan (A4); (b) penilaian untuk tiang yang sudah
--      DIBATALKAN dilewati, tidak menolak seluruh kiriman (A10); (c) hasil per
--      tiang membawa `induk_id` untuk tambalan di HP.
--   3. tiang_jtr_terdekat_jtm — penjaga HP kini juga melihat tiang JTR, sama
--      dengan penjaga server (A2). `tiang_terdekat_jtm` TIDAK diubah: HP versi
--      lama akan menawarkan "Tumpangi" untuk tiang JTR kalau ikut muncul di sana.
--   4. mulai_inspeksi_jtm — tidak lagi membuka kembali inspeksi yang sudah
--      DIKIRIM (menunggu persetujuan); ditolak dengan kalimat (A9).
--   5. tutup_segmen_jtm & rintis_segmen_jtm memanggil nama fungsi baru, bukan
--      pembungkus SEMENTARA (A8).
--   6. Rekap Kinerja: realisasi KMS JTM dihitung di bulan DIKIRIM (A5).
--
-- Fungsi 1, 2, 5, 6 DISALIN UTUH dari skrip terakhirnya (dirakit oleh skrip,
-- bukan diketik ulang); yang berubah hanya yang disebut di daftar di atas.
-- Tanda ★ lain di bagian 5–6 ikut tersalin dari skrip asalnya.
-- =============================================================================


-- ── 1. tambah_tiang_jtm — penolakan tiang berdekatan membawa HINT ─────────────

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
  SELECT t.id, t.kode, t.penyulang, t.gardu_kode,
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
    -- ★ HINT = id tiang penghalang: HP menawarkan pilihan tepat di tiang itu
    -- (Tumpangi / Dua batang berbeda / Hapus), bukan menebak dari kalimat.
    IF dekat.penyulang IS NULL THEN
      RAISE EXCEPTION
        'Tiang JTR % (gardu %) berdiri % m dari titik ini. Kalau batangnya memang berbeda, pilih "Dua batang berbeda".',
        dekat.kode, COALESCE(dekat.gardu_kode, '-'), round(dekat.m::numeric, 0)
        USING HINT = 'tumpuk:' || dekat.id::text;
    END IF;
    RAISE EXCEPTION
      'Tiang % (penyulang %) sudah berdiri di titik ini, % m dari Anda. Pakai "tiang ini sudah ada" untuk menumpanginya — jangan menambah tiang kedua di batang yang sama.',
      dekat.kode, dekat.penyulang, round(dekat.m::numeric, 0)
      USING HINT = 'tumpuk:' || dekat.id::text;
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


-- ── 2. kirim_tiang_jtm — jawaban basi, catatan, tiang batal, induk_id ────────

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
                            (SELECT id FROM public.tiang WHERE id_hp = NULLIF(b->>'induk_lokal', '')::uuid AND status_hidup = 'aktif'));
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
      PERFORM public.nilai_tiang_jtm(
        v_id, v_tiang,
        NULLIF(r->>'lat', '')::double precision,
        NULLIF(r->>'lng', '')::double precision,
        NULLIF(r->>'akurasi', '')::double precision,
        r->'daftar',
        NULLIF(btrim(COALESCE(r->>'catatan', '')), ''),
        v_nama);
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
    hasil := hasil || jsonb_build_object('id_lokal', r->>'id_lokal', 'tiang_id', v_tiang, 'kode', v_kode, 'induk_id', v_induk);
  END LOOP;

  -- ── tutup ──
  IF COALESCE((p_isi->>'selesai')::boolean, false) THEN
    selesai := public.selesaikan_inspeksi_jtm(v_id, v_nama, NULLIF(btrim(COALESCE(p_isi->>'catatan_selesai', '')), ''));
  END IF;

  RETURN jsonb_build_object('inspeksi_id', v_id, 'sudah_ada', false, 'tiang', hasil, 'selesai', selesai);
END $fn$;


-- ── 3. tiang_jtr_terdekat_jtm — tiang JTR di dekat titik baru ─────────────────
-- Pelengkap `tiang_terdekat_jtm` (yang hanya melihat tiang berpenyulang).
-- Gabungan keduanya = himpunan yang diperiksa `tambah_tiang_jtm`, jadi HP
-- bertanya tepat pada keadaan yang akan ditolak server.

CREATE OR REPLACE FUNCTION public.tiang_jtr_terdekat_jtm(
  p_ulp    TEXT,
  p_lat    DOUBLE PRECISION,
  p_lng    DOUBLE PRECISION,
  p_radius DOUBLE PRECISION DEFAULT 10
) RETURNS TABLE (id UUID, kode TEXT, gardu_kode TEXT, jarak_m NUMERIC)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT t.id, t.kode, t.gardu_kode,
         round(public.jarak_meter(p_lat, p_lng, t.lat, t.lng)::numeric, 1) AS jarak_m
  FROM public.tiang t
  WHERE t.status_hidup = 'aktif'
    AND t.penyulang IS NULL
    AND t.lat IS NOT NULL AND t.lng IS NOT NULL
    AND upper(COALESCE(t.ulp, '')) = upper(COALESCE(p_ulp, ''))
    AND public.jarak_meter(p_lat, p_lng, t.lat, t.lng) <= p_radius
  ORDER BY public.jarak_meter(p_lat, p_lng, t.lat, t.lng)
  LIMIT 5
$$;

GRANT EXECUTE ON FUNCTION public.tiang_jtr_terdekat_jtm(TEXT, DOUBLE PRECISION, DOUBLE PRECISION, DOUBLE PRECISION) TO authenticated;


-- ── 4. mulai_inspeksi_jtm — yang sudah dikirim tidak dibuka lagi ─────────────
-- Dulu 'Selesai' ikut disambung lalu dijadikan 'Dalam Proses' lagi: "Rintis"
-- yang melanjutkan rintisan bisa menarik inspeksi keluar dari antrean
-- persetujuan admin. Sekarang sama dengan `kirim_tiang_jtm`: ditolak dengan
-- jalan keluarnya (admin menyetujui / mengembalikan, atau menutup segmennya
-- dari Master Segmen).

CREATE OR REPLACE FUNCTION public.mulai_inspeksi_jtm(
  p_segmen_id UUID,
  p_tier      TEXT DEFAULT '1',
  p_nama      TEXT DEFAULT NULL
) RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  s       RECORD;
  id_ada  UUID;
  st_ada  TEXT;
  id_baru UUID;
BEGIN
  SELECT * INTO s FROM public.segmen WHERE id = p_segmen_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Segmen tidak ditemukan'; END IF;
  IF s.status <> 'aktif' THEN
    RAISE EXCEPTION 'Segmen % sudah tidak aktif', s.nama;
  END IF;

  SELECT id, status INTO id_ada, st_ada FROM public.inspeksi_jtm
  WHERE segmen_id = p_segmen_id AND tier = p_tier
    AND status IN ('Dijadwalkan', 'Dalam Proses', 'Selesai', 'Ditolak')
  ORDER BY created_at DESC
  LIMIT 1;

  IF st_ada = 'Selesai' THEN
    RAISE EXCEPTION
      'Inspeksi segmen % sudah dikirim dan menunggu persetujuan admin — belum bisa dilanjutkan. Minta admin menyetujui atau mengembalikannya dulu.',
      s.nama;
  END IF;

  IF id_ada IS NOT NULL THEN
    UPDATE public.inspeksi_jtm
    SET status = 'Dalam Proses',
        tgl_selesai = NULL,
        petugas_nama = COALESCE(p_nama, petugas_nama),
        updated_at = now()
    WHERE id = id_ada;
    RETURN id_ada;
  END IF;

  INSERT INTO public.inspeksi_jtm
    (segmen_id, penyulang, ulp, tier, status, petugas_nama, petugas_uid)
  VALUES (p_segmen_id, s.penyulang, s.ulp, p_tier, 'Dalam Proses', p_nama, auth.uid())
  RETURNING id INTO id_baru;

  RETURN id_baru;
END $$;


-- ── 5. tutup_segmen_jtm & rintis_segmen_jtm — nama fungsi baru ────────────────
-- Badan disalin utuh dari jtm-rintis.sql / jtm-pangkal-tiang.sql; yang berubah
-- hanya nama fungsi yang dipanggil (pembungkus SEMENTARA tidak lagi dipakai).

CREATE OR REPLACE FUNCTION public.tutup_segmen_jtm(
  p_segmen_id UUID,
  p_jenis     TEXT,
  p_nama      TEXT,
  p_tiang_id  UUID DEFAULT NULL,
  p_penanda   TEXT DEFAULT NULL,
  p_oleh      TEXT DEFAULT NULL,
  p_catatan   TEXT DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  s           RECORD;
  t           RECORD;
  v_jenis     TEXT := upper(btrim(COALESCE(p_jenis, '')));
  v_nama      TEXT := upper(btrim(COALESCE(p_nama, '')));
  v_penanda   TEXT := NULLIF(lower(btrim(COALESCE(p_penanda, ''))), '');
  v_nama_baru TEXT;
  v_tiang     INT;
  v_dinilai   INT := 0;
  v_inspeksi  UUID;
  v_tutup     BOOLEAN := false;
  v_nama_jadi TEXT;
BEGIN
  SELECT * INTO s FROM public.segmen WHERE id = p_segmen_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Segmen tidak ditemukan'; END IF;

  IF s.titik_akhir_jenis <> 'UJUNG' THEN
    RAISE EXCEPTION 'Segmen "%" sudah ditutup sebelumnya', s.nama;
  END IF;

  IF NOT public.jtm_jenis_titik_sah(v_jenis) THEN
    RAISE EXCEPTION 'Jenis titik ujung "%" tidak dikenal', p_jenis;
  END IF;
  IF v_nama = '' THEN
    RAISE EXCEPTION
      'Nama ujung segmen wajib diisi. Kalau ujungnya tiang biasa, sebutkan tempatnya (misal: GNN-B14_A5 PERCABANGAN PASAR); kalau gardu atau keypoint, sebutkan nomor atau namanya.';
  END IF;

  -- Segmen tanpa tiang bukan ruas, cuma sebuah nama. Menutupnya berarti
  -- melahirkan baris yang panjangnya nol dan selamanya terlihat seperti
  -- pekerjaan yang belum dikerjakan.
  SELECT count(*) INTO v_tiang FROM public.segmen_tiang WHERE segmen_id = p_segmen_id;
  IF v_tiang = 0 THEN
    RAISE EXCEPTION 'Segmen ini belum punya satu tiang pun — belum ada yang bisa ditutup.';
  END IF;

  -- Tiang penutup harus benar-benar tiang segmen ini. Kalau tidak, ujung segmen
  -- menunjuk tiang milik ruas lain, dan `induk_segmen_id` segmen berikutnya
  -- ikut salah berakar.
  IF p_tiang_id IS NOT NULL THEN
    SELECT t2.* INTO t FROM public.tiang t2
    JOIN public.segmen_tiang st ON st.tiang_id = t2.id AND st.segmen_id = p_segmen_id
    WHERE t2.id = p_tiang_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Tiang penutup bukan bagian dari segmen ini';
    END IF;

    IF v_penanda IS NOT NULL THEN
      IF NOT EXISTS (
        SELECT 1 FROM public.jtm_ref
        WHERE kategori = 'penanda' AND kode = v_penanda AND aktif
      ) THEN
        RAISE EXCEPTION 'Penanda "%" tidak ada di daftar penanda yang aktif', v_penanda;
      END IF;

      INSERT INTO public.master_audit
        (entitas, entitas_kode, ulp, field, nilai_lama, nilai_baru, aksi, oleh_uid, oleh_nama)
      VALUES ('tiang', t.kode, COALESCE(t.ulp, '-'), 'penanda',
              to_jsonb(t.penanda), to_jsonb(v_penanda),
              'tutup_segmen', auth.uid(), p_oleh);

      UPDATE public.tiang SET penanda = v_penanda, updated_at = now()
      WHERE id = p_tiang_id;
    END IF;
  END IF;

  -- Nama diperiksa SEBELUM disimpan supaya bentrokan terbaca sebagai kalimat,
  -- bukan sebagai pelanggaran indeks unik yang tidak bisa dibaca siapa pun.
  v_nama_baru := public.segmen_label_titik(s.titik_awal_jenis, s.titik_awal_nama)
                 || ' - ' || public.segmen_label_titik(v_jenis, v_nama);

  IF EXISTS (
    SELECT 1 FROM public.segmen x
    WHERE upper(x.ulp) = upper(s.ulp)
      AND upper(x.penyulang) = upper(s.penyulang)
      AND upper(x.nama) = upper(v_nama_baru)
      AND x.status = 'aktif'
      AND x.id <> p_segmen_id
  ) THEN
    RAISE EXCEPTION 'Segmen "%" sudah ada di penyulang ini. Beri nama ujung yang membedakannya.', v_nama_baru;
  END IF;

  UPDATE public.segmen
  SET titik_akhir_jenis    = v_jenis,
      titik_akhir_nama     = v_nama,
      titik_akhir_tiang_id = p_tiang_id,
      catatan              = COALESCE(p_catatan, catatan),
      dikonfirmasi_at      = now(),
      dikonfirmasi_oleh    = p_oleh,
      updated_at           = now()
  WHERE id = p_segmen_id;

  -- Penyapuannya ikut ditutup, tapi hanya kalau memang ada yang dinilai.
  -- Merintis tanpa menilai itu sah — memetakan dulu, memeriksa belakangan — dan
  -- memaksanya selesai akan melahirkan laporan inspeksi yang isinya nol.
  SELECT id INTO v_inspeksi FROM public.inspeksi_jtm
  WHERE segmen_id = p_segmen_id AND status IN ('Dijadwalkan', 'Dalam Proses')
  ORDER BY created_at DESC LIMIT 1;

  IF v_inspeksi IS NOT NULL THEN
    SELECT count(*) INTO v_dinilai
    FROM public.inspeksi_jtm_titik WHERE inspeksi_id = v_inspeksi;

    IF v_dinilai > 0 THEN
      PERFORM public.selesaikan_inspeksi_jtm(v_inspeksi, p_oleh, p_catatan);
      v_tutup := true;
    END IF;
  END IF;

  -- Dibaca ulang, bukan disusun ulang di sini: yang berhak menamai segmen cuma
  -- triggernya, dan menyalin rumusnya ke sini berarti dua rumus yang harus
  -- selalu sama.
  SELECT nama INTO v_nama_jadi FROM public.segmen WHERE id = p_segmen_id;

  RETURN jsonb_build_object(
    'segmen_id',        p_segmen_id,
    'nama',             v_nama_jadi,
    'tiang',            v_tiang,
    'dinilai',          v_dinilai,
    'penyapuan_selesai', v_tutup
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
    v_inspeksi := public.mulai_inspeksi_jtm(rintis.id, p_tier, p_nama);
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
      -- ★ Ujung yang sudah jadi pangkal segmen lain tidak diusulkan lagi.
      AND NOT EXISTS (SELECT 1 FROM public.segmen o
                       WHERE o.status = 'aktif' AND o.id <> s.id AND s.titik_akhir_tiang_id IS NOT NULL
                         AND o.titik_awal_tiang_id = s.titik_akhir_tiang_id)
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

  -- ★ Pangkal = tiang yang DIPILIH regu (simpang, percabangan). Harus tiang
  -- aktif yang punya nama di penyulang ini. Kalau tiang itu ujung segmen,
  -- labelnya ikut ujung itu — satu tempat, satu nama.
  IF p_tiang_awal_id IS NOT NULL THEN
    IF NOT EXISTS (SELECT 1 FROM public.tiang t JOIN public.tiang_kode_penyulang k ON k.tiang_id = t.id
                    WHERE t.id = p_tiang_awal_id AND t.status_hidup = 'aktif'
                      AND upper(k.penyulang) = upper(v_penyulang)) THEN
      RAISE EXCEPTION 'Tiang pangkal bukan tiang aktif penyulang %', v_penyulang;
    END IF;
    SELECT s.titik_akhir_jenis, s.titik_akhir_nama INTO akhir
      FROM public.segmen s
     WHERE s.titik_akhir_tiang_id = p_tiang_awal_id AND s.status = 'aktif'
       AND upper(s.penyulang) = upper(v_penyulang) AND s.titik_akhir_jenis <> 'UJUNG'
     ORDER BY COALESCE(s.dikonfirmasi_at, s.created_at) DESC
     LIMIT 1;
    IF akhir.titik_akhir_jenis IS NOT NULL THEN
      v_jenis := akhir.titik_akhir_jenis;
      v_nama_awal := akhir.titik_akhir_nama;
    ELSE
      -- Tiang di tengah segmen yang jadi pangkal = titik percabangan.
      UPDATE public.tiang SET percabangan = true, updated_at = now()
       WHERE id = p_tiang_awal_id AND NOT COALESCE(percabangan, false);
      IF FOUND THEN
        INSERT INTO public.master_audit
          (entitas, entitas_kode, ulp, field, nilai_lama, nilai_baru, aksi, oleh_uid, oleh_nama)
        SELECT 'tiang', t.kode, COALESCE(t.ulp, '-'), 'percabangan', 'false'::jsonb, 'true'::jsonb,
               'koreksi_lapangan', auth.uid(), p_nama
          FROM public.tiang t WHERE t.id = p_tiang_awal_id;
      END IF;
    END IF;
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

  v_inspeksi := public.mulai_inspeksi_jtm(v_id, p_tier, p_nama);

  SELECT nama INTO v_nama_jadi FROM public.segmen WHERE id = v_id;

  RETURN jsonb_build_object(
    'segmen_id',   v_id,
    'inspeksi_id', v_inspeksi,
    'nama',        v_nama_jadi,
    'dilanjutkan', false
  );
END $$;


-- ── 6. Rekap Kinerja — realisasi KMS JTM di bulan DIKIRIM ─────────────────────
-- Badan disalin utuh dari wo-bulan-anomali.sql; yang berubah hanya saringan
-- bulan inspeksi JTM. Tidak mengubah angka yang ada (semua inspeksi Oktober).

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


-- ── Periksa ──────────────────────────────────────────────────────────────────
--   SELECT * FROM tiang_jtr_terdekat_jtm('AMPENAN', -8.58, 116.09, 10);
--   SELECT * FROM _rekap_kinerja_inti('AMPENAN', 2026, 10) WHERE kunci = 'jtm';
--   SELECT pg_get_functiondef('public.tutup_segmen_jtm'::regproc) LIKE '%selesaikan_inspeksi_jtm%';
