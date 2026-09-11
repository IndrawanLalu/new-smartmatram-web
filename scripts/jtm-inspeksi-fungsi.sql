-- =============================================================================
-- Fase 4.2f — Inspeksi JTM: fungsi penyapuan
-- Jalankan SESUDAH `jtm-inspeksi-schema.sql`. Idempoten.
--
-- Semua penulisan dari lapangan lewat fungsi SECURITY DEFINER. Bukan soal hak
-- akses — RLS masih longgar sampai Fase 0.4 — melainkan supaya PENJAGA dan
-- JEJAKNYA tidak bisa dilewati. Kalau aplikasi boleh menulis langsung ke tabel
-- jawaban, "temuan tidak boleh hilang tanpa sebab" cuma berlaku selama HP-nya
-- memakai versi yang mengingat aturan itu.
-- =============================================================================

-- ── 1. Mulai atau lanjutkan penyapuan ────────────────────────────────────────
-- Penyapuan BOLEH BERHENTI DI TENGAH, jadi "mulai" hampir selalu berarti
-- MELANJUTKAN. Membuat baris baru tiap kali layar dibuka akan memecah satu
-- pekerjaan jadi belasan penyapuan setengah jadi, dan cakupannya jadi omong
-- kosong.

CREATE OR REPLACE FUNCTION public.mulai_penyapuan_jtm(
  p_segmen_id UUID,
  p_tier      TEXT DEFAULT '1',
  p_nama      TEXT DEFAULT NULL
) RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  s  RECORD;
  id_ada UUID;
  id_baru UUID;
BEGIN
  SELECT * INTO s FROM public.segmen WHERE id = p_segmen_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Segmen tidak ditemukan'; END IF;
  IF s.status <> 'aktif' THEN
    RAISE EXCEPTION 'Segmen % sudah tidak aktif', s.nama;
  END IF;

  SELECT id INTO id_ada FROM public.inspeksi_jtm
  WHERE segmen_id = p_segmen_id AND tier = p_tier
    AND status IN ('Dijadwalkan', 'Dalam Proses')
  LIMIT 1;

  IF id_ada IS NOT NULL THEN
    UPDATE public.inspeksi_jtm
    SET status = 'Dalam Proses',
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

-- ── 2. Menilai satu tiang ────────────────────────────────────────────────────
-- INTI MODUL INI. Di sinilah ketiga aturan itu dijaga sekaligus.

CREATE OR REPLACE FUNCTION public.nilai_tiang_jtm(
  p_inspeksi_id UUID,
  p_tiang_id    UUID,
  p_lat         DOUBLE PRECISION,
  p_lng         DOUBLE PRECISION,
  p_akurasi     DOUBLE PRECISION,
  p_daftar      JSONB,
  p_catatan     TEXT DEFAULT NULL,
  p_nama        TEXT DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  m        RECORD;
  t        RECORD;
  amb      public.jtm_settings%ROWTYPE;
  v_titik  UUID;
  v_jarak  DOUBLE PRECISION;
  r        JSONB;
  it       RECORD;
  lama     RECORD;
  v_bagian TEXT;
  v_sirkit UUID;
  v_nilai  TEXT;
  normal_baru BOOLEAN;
  sebab    TEXT;
  jml      INT := 0;
  temuan   INT := 0;
BEGIN
  SELECT * INTO m FROM public.inspeksi_jtm WHERE id = p_inspeksi_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Penyapuan tidak ditemukan'; END IF;
  IF m.status NOT IN ('Dijadwalkan', 'Dalam Proses') THEN
    RAISE EXCEPTION 'Penyapuan ini sudah berstatus % dan tidak bisa diisi lagi', m.status;
  END IF;

  SELECT * INTO t FROM public.tiang WHERE id = p_tiang_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Tiang tidak ditemukan'; END IF;

  SELECT * INTO amb FROM public.jtm_ambang(m.ulp);

  -- DUA KEADAAN YANG TERLIHAT SAMA DI LAYAR TAPI SEBABNYA BERBEDA, dan pesannya
  -- tidak boleh disamakan. Menuduh orang yang sebenarnya sudah berdiri di bawah
  -- tiang adalah cara tercepat membuat dia berhenti memakai aplikasi.
  IF p_akurasi IS NOT NULL AND p_akurasi > amb.akurasi_minimum_m THEN
    RAISE EXCEPTION
      'Sinyal GPS belum cukup baik (±% m, batas ±% m). Tunggu sebentar sampai kuncian membaik.',
      round(p_akurasi::numeric, 0), amb.akurasi_minimum_m;
  END IF;

  v_jarak := public.jarak_meter(p_lat, p_lng, t.lat, t.lng);

  IF t.lat IS NULL OR t.lng IS NULL THEN
    RAISE EXCEPTION 'Tiang % belum punya titik. Perbaiki titiknya dulu sambil berdiri di bawahnya.',
      t.kode;
  END IF;
  IF v_jarak IS NULL OR v_jarak > amb.jarak_maks_nilai_m THEN
    RAISE EXCEPTION
      'Anda % m dari % (batas % m). Dekati tiangnya — atau perbaiki titik tiang kalau titiknya yang salah.',
      round(COALESCE(v_jarak, 0)::numeric, 0), t.kode, amb.jarak_maks_nilai_m;
  END IF;

  INSERT INTO public.inspeksi_jtm_titik
    (inspeksi_id, tiang_id, petugas_lat, petugas_lng, jarak_m, akurasi_m, catatan)
  VALUES (p_inspeksi_id, p_tiang_id, p_lat, p_lng,
          round(v_jarak::numeric, 1), round(COALESCE(p_akurasi, 0)::numeric, 1), p_catatan)
  ON CONFLICT (inspeksi_id, tiang_id) DO UPDATE
    SET dinilai_at = now(),
        petugas_lat = EXCLUDED.petugas_lat,
        petugas_lng = EXCLUDED.petugas_lng,
        jarak_m = EXCLUDED.jarak_m,
        akurasi_m = EXCLUDED.akurasi_m,
        catatan = COALESCE(EXCLUDED.catatan, public.inspeksi_jtm_titik.catatan)
  RETURNING id INTO v_titik;

  FOR r IN SELECT * FROM jsonb_array_elements(COALESCE(p_daftar, '[]'::jsonb)) LOOP
    SELECT * INTO it FROM public.jtm_item_ref WHERE kode = r->>'item_kode';
    IF NOT FOUND THEN RAISE EXCEPTION 'Item % tidak dikenal', r->>'item_kode'; END IF;

    v_bagian := COALESCE(NULLIF(r->>'bagian', ''), '-');
    v_sirkit := NULLIF(r->>'sirkit_segmen_id', '')::uuid;
    v_nilai  := NULLIF(r->>'nilai', '');
    sebab    := NULLIF(r->>'sebab_tutup', '');

    -- Nilainya normal atau tidak. Untuk item angka dan teks tidak ada
    -- penilaiannya, jadi dianggap normal — bukan tebakan, memang tidak ada
    -- daftar pilihan yang bisa menyatakan sebaliknya.
    normal_baru := true;
    IF it.tipe = 'pilihan' AND v_nilai IS NOT NULL THEN
      SELECT o.normal INTO normal_baru FROM public.jtm_opsi_ref o
      WHERE o.item_kode = it.kode AND o.kode = v_nilai;
      normal_baru := COALESCE(normal_baru, true);
    END IF;

    -- Keadaan yang BERLAKU sekarang untuk item ini.
    SELECT k.* INTO lama
    FROM public.tiang_kondisi_terakhir k
    WHERE k.tiang_id = p_tiang_id
      AND k.item_kode = it.kode
      AND k.bagian = v_bagian
      AND COALESCE(k.sirkit_segmen_id, '00000000-0000-0000-0000-000000000000'::uuid)
          = COALESCE(v_sirkit, '00000000-0000-0000-0000-000000000000'::uuid)
    LIMIT 1;

    -- MENUTUP TEMUAN HARUS PUNYA SEBAB.
    IF FOUND AND NOT lama.normal AND normal_baru AND v_nilai IS NOT NULL THEN
      IF sebab IS NULL THEN
        RAISE EXCEPTION
          'Temuan "%: %" (tercatat %) akan tertutup oleh jawaban ini. Sebutkan sebabnya: sudah diperbaiki, ternyata tidak ada, atau tidak diperiksa.',
          lama.item_nama, COALESCE(lama.nilai_label, lama.nilai),
          to_char(lama.tgl, 'DD Mon YYYY');
      END IF;

      IF sebab = 'diperbaiki'
         AND COALESCE(btrim(r->>'foto_tutup_url'), '') = '' THEN
        RAISE EXCEPTION
          'Klaim "sudah diperbaiki" pada % wajib disertai foto — tanpa itu perbaikannya tidak bisa diperiksa siapa pun dari belakang meja.',
          lama.item_nama;
      END IF;

      -- "Tidak saya periksa" membatalkan penimpaan: barisnya TETAP disimpan
      -- sebagai bukti regu ditanya dan memilih tidak menilai, tapi tanpa nilai
      -- — jadi keadaan lama yang tetap berlaku.
      IF sebab = 'tidak_diperiksa' THEN
        v_nilai := NULL;
      END IF;
    END IF;

    INSERT INTO public.inspeksi_jtm_periksa
      (titik_id, item_kode, bagian, sirkit_segmen_id, nilai, nilai_angka, catatan,
       sebab_tutup, foto_tutup_url)
    VALUES (
      v_titik, it.kode, v_bagian, v_sirkit, v_nilai,
      NULLIF(r->>'nilai_angka', '')::numeric,
      NULLIF(r->>'catatan', ''),
      sebab,
      NULLIF(btrim(COALESCE(r->>'foto_tutup_url', '')), ''))
    ON CONFLICT (titik_id, item_kode, bagian,
                 COALESCE(sirkit_segmen_id, '00000000-0000-0000-0000-000000000000'::uuid))
    DO UPDATE SET
      nilai = EXCLUDED.nilai,
      nilai_angka = EXCLUDED.nilai_angka,
      catatan = EXCLUDED.catatan,
      sebab_tutup = EXCLUDED.sebab_tutup,
      foto_tutup_url = EXCLUDED.foto_tutup_url,
      updated_at = now();

    jml := jml + 1;
    IF NOT normal_baru AND v_nilai IS NOT NULL THEN temuan := temuan + 1; END IF;
  END LOOP;

  UPDATE public.inspeksi_jtm
  SET status = CASE WHEN status = 'Dijadwalkan' THEN 'Dalam Proses' ELSE status END,
      petugas_nama = COALESCE(p_nama, petugas_nama),
      updated_at = now()
  WHERE id = p_inspeksi_id;

  RETURN jsonb_build_object(
    'titik_id', v_titik,
    'tiang', t.kode,
    'jarak_m', round(v_jarak::numeric, 1),
    'jawaban', jml,
    'temuan', temuan
  );
END $$;

-- ── 3. Tiang baru dari lapangan ──────────────────────────────────────────────
-- Titik dari GPS, bukan ketukan peta. Petugas berdiri di bawah tiang —
-- menaruh titik dengan jari menghasilkan panjang jaringan yang kira-kira, dan
-- panjang yang kira-kira tidak ada gunanya.

CREATE OR REPLACE FUNCTION public.tambah_tiang_jtm(
  p_segmen_id  UUID,
  p_lat        DOUBLE PRECISION,
  p_lng        DOUBLE PRECISION,
  p_akurasi    DOUBLE PRECISION DEFAULT NULL,
  p_induk_id   UUID DEFAULT NULL,
  p_jenis      TEXT DEFAULT NULL,
  p_konstruksi TEXT DEFAULT NULL,
  p_nomor_lama TEXT DEFAULT NULL,
  p_nama       TEXT DEFAULT NULL
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

  IF dekat.id IS NOT NULL AND dekat.m <= amb.radius_tumpang_m THEN
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
     sumber, status_hidup, dikonfirmasi_at, dikonfirmasi_oleh)
  VALUES (s.penyulang, s.ulp, p_lat, p_lng,
          NULLIF(btrim(COALESCE(p_jenis, '')), ''),
          NULLIF(btrim(COALESCE(p_konstruksi, '')), ''),
          NULLIF(btrim(COALESCE(p_nomor_lama, '')), ''),
          induk, 'lapangan', 'aktif', now(), p_nama)
  RETURNING id, kode INTO id_baru, kode_baru;

  INSERT INTO public.segmen_tiang (segmen_id, tiang_id, posisi, sumber)
  VALUES (p_segmen_id, id_baru, 'atas', 'lapangan')
  ON CONFLICT DO NOTHING;

  RETURN jsonb_build_object('id', id_baru, 'kode', kode_baru, 'induk_id', induk);
END $$;

-- ── 3b. Tiang di sekitar saya ────────────────────────────────────────────────
-- Dipakai SEBELUM menambah tiang. Tanpa ini, satu-satunya cara petugas tahu
-- bahwa di titik itu sudah ada tiang adalah ditolak setelah menekan simpan —
-- dan penolakan yang datang belakangan selalu terbaca sebagai aplikasi rewel,
-- bukan sebagai pertolongan.

CREATE OR REPLACE FUNCTION public.tiang_terdekat_jtm(
  p_ulp    TEXT,
  p_lat    DOUBLE PRECISION,
  p_lng    DOUBLE PRECISION,
  p_radius DOUBLE PRECISION DEFAULT 30
) RETURNS TABLE (
  id UUID, kode TEXT, penyulang TEXT, jarak_m NUMERIC, dipikul TEXT[]
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT t.id, t.kode, t.penyulang,
         round(public.jarak_meter(p_lat, p_lng, t.lat, t.lng)::numeric, 1) AS jarak_m,
         ARRAY(
           SELECT DISTINCT s.penyulang
           FROM public.segmen_tiang st
           JOIN public.segmen s ON s.id = st.segmen_id AND s.status = 'aktif'
           WHERE st.tiang_id = t.id
         ) AS dipikul
  FROM public.tiang t
  WHERE t.status_hidup = 'aktif'
    AND t.penyulang IS NOT NULL
    AND t.lat IS NOT NULL AND t.lng IS NOT NULL
    AND upper(COALESCE(t.ulp, '')) = upper(COALESCE(p_ulp, ''))
    AND public.jarak_meter(p_lat, p_lng, t.lat, t.lng) <= p_radius
  ORDER BY public.jarak_meter(p_lat, p_lng, t.lat, t.lng)
  LIMIT 10
$$;

-- ── 4. Menumpang tiang yang sudah ada ────────────────────────────────────────
-- Underbuild: kabel penyulang ini lewat di tiang milik penyulang lain.

CREATE OR REPLACE FUNCTION public.tumpangi_tiang_jtm(
  p_segmen_id UUID,
  p_tiang_id  UUID,
  p_posisi    TEXT DEFAULT 'bawah',
  p_nama      TEXT DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE s RECORD; t RECORD;
BEGIN
  SELECT * INTO s FROM public.segmen WHERE id = p_segmen_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Segmen tidak ditemukan'; END IF;
  SELECT * INTO t FROM public.tiang WHERE id = p_tiang_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Tiang tidak ditemukan'; END IF;

  INSERT INTO public.segmen_tiang (segmen_id, tiang_id, posisi, sumber)
  VALUES (p_segmen_id, p_tiang_id, p_posisi, 'lapangan')
  ON CONFLICT (segmen_id, tiang_id) DO UPDATE SET posisi = EXCLUDED.posisi;

  -- Kepemilikan TIDAK berpindah di sini. Pemilik = penyulang yang konduktornya
  -- paling atas, dan itu keputusan yang dilihat di lapangan — bukan akibat
  -- sampingan dari siapa yang kebetulan menyapu belakangan.
  RETURN jsonb_build_object(
    'kode', t.kode,
    'pemilik', t.penyulang,
    'menumpang', s.penyulang
  );
END $$;

-- ── 5. Koreksi titik tiang ───────────────────────────────────────────────────
-- Dilakukan SAMBIL BERDIRI DI BAWAHNYA, jadi ini konfirmasi lapangan yang sah —
-- berbeda dari menggeser titik di peta web, yang tidak pernah menyalakan
-- penanda terkonfirmasi.

CREATE OR REPLACE FUNCTION public.koreksi_titik_tiang_jtm(
  p_tiang_id UUID,
  p_lat      DOUBLE PRECISION,
  p_lng      DOUBLE PRECISION,
  p_akurasi  DOUBLE PRECISION DEFAULT NULL,
  p_nama     TEXT DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  t    RECORD;
  amb  public.jtm_settings%ROWTYPE;
  geser DOUBLE PRECISION;
BEGIN
  SELECT * INTO t FROM public.tiang WHERE id = p_tiang_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Tiang tidak ditemukan'; END IF;
  IF p_lat IS NULL OR p_lng IS NULL THEN RAISE EXCEPTION 'Titik baru belum terbaca'; END IF;

  SELECT * INTO amb FROM public.jtm_ambang(t.ulp);
  IF p_akurasi IS NOT NULL AND p_akurasi > amb.akurasi_minimum_m THEN
    RAISE EXCEPTION 'Sinyal GPS belum cukup baik (±% m) untuk mengoreksi titik.',
      round(p_akurasi::numeric, 0);
  END IF;

  geser := public.jarak_meter(t.lat, t.lng, p_lat, p_lng);

  INSERT INTO public.master_audit
    (entitas, entitas_kode, ulp, field, nilai_lama, nilai_baru, aksi, oleh_uid, oleh_nama)
  VALUES ('tiang', t.kode, COALESCE(t.ulp, '-'), 'koordinat',
          jsonb_build_object('lat', t.lat, 'lng', t.lng),
          jsonb_build_object('lat', p_lat, 'lng', p_lng),
          'koreksi_lapangan', auth.uid(), p_nama);

  UPDATE public.tiang
  SET lat = p_lat, lng = p_lng,
      dikonfirmasi_at = now(),
      dikonfirmasi_oleh = COALESCE(p_nama, dikonfirmasi_oleh),
      updated_at = now()
  WHERE id = p_tiang_id;

  RETURN jsonb_build_object('kode', t.kode, 'geser_m', round(COALESCE(geser, 0)::numeric, 1));
END $$;

-- ── 6. Menyatakan selesai ────────────────────────────────────────────────────
-- TIDAK menuntut cakupan penuh. Penyapuan boleh berhenti di tengah, dan
-- memaksa lengkap cuma akan melahirkan isian asal-asalan supaya tombolnya mau
-- ditekan. Cakupannya dikembalikan apa adanya supaya regu tahu apa yang
-- ditinggalkan, dan admin melihat angka yang sama saat memutuskan.

CREATE OR REPLACE FUNCTION public.selesaikan_penyapuan_jtm(
  p_id      UUID,
  p_nama    TEXT DEFAULT NULL,
  p_catatan TEXT DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  m      RECORD;
  jml_t  INT;
  jml_d  INT;
BEGIN
  SELECT * INTO m FROM public.inspeksi_jtm WHERE id = p_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Penyapuan tidak ditemukan'; END IF;
  IF m.status NOT IN ('Dijadwalkan', 'Dalam Proses') THEN
    RAISE EXCEPTION 'Penyapuan sudah berstatus %', m.status;
  END IF;

  SELECT count(*) INTO jml_t FROM public.segmen_tiang WHERE segmen_id = m.segmen_id;
  SELECT count(*) INTO jml_d FROM public.inspeksi_jtm_titik WHERE inspeksi_id = p_id;

  IF jml_d = 0 THEN
    RAISE EXCEPTION 'Belum ada satu pun tiang yang dinilai — tidak ada yang bisa dinyatakan selesai.';
  END IF;

  UPDATE public.inspeksi_jtm
  SET status = 'Selesai',
      tgl_selesai = now(),
      petugas_nama = COALESCE(p_nama, petugas_nama),
      catatan = COALESCE(p_catatan, catatan),
      updated_at = now()
  WHERE id = p_id;

  RETURN jsonb_build_object(
    'tiang_segmen', jml_t,
    'tiang_dinilai', jml_d,
    'persen', CASE WHEN jml_t > 0 THEN round(100.0 * jml_d / jml_t, 1) ELSE NULL END
  );
END $$;

-- ── 7. Keputusan admin ───────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.putuskan_penyapuan_jtm(
  p_id      UUID,
  p_setuju  BOOLEAN,
  p_nama    TEXT DEFAULT NULL,
  p_catatan TEXT DEFAULT NULL
) RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE m RECORD;
BEGIN
  SELECT * INTO m FROM public.inspeksi_jtm WHERE id = p_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Penyapuan tidak ditemukan'; END IF;
  IF m.status NOT IN ('Selesai', 'Ditolak') THEN
    RAISE EXCEPTION 'Penyapuan % masih berstatus %. Hanya yang sudah dinyatakan selesai yang bisa diputuskan.',
      m.id, m.status;
  END IF;

  -- Penolakan WAJIB beralasan. Ditolak tanpa alasan berarti regu mengulang
  -- seluruh penyusuran sambil menebak apa yang salah.
  IF NOT p_setuju AND COALESCE(btrim(p_catatan), '') = '' THEN
    RAISE EXCEPTION 'Penolakan harus disertai alasan';
  END IF;

  UPDATE public.inspeksi_jtm
  SET status = CASE WHEN p_setuju THEN 'Diverifikasi' ELSE 'Ditolak' END,
      verified_at = now(),
      verified_by = p_nama,
      verified_note = p_catatan,
      updated_at = now()
  WHERE id = p_id;

  -- Tiang yang benar-benar didatangi ditandai terkonfirmasi lapangan. Inilah
  -- yang menggerakkan angka kelengkapan master — dan sebabnya penandanya baru
  -- menyala SESUDAH disetujui, bukan saat regu menekan simpan.
  IF p_setuju THEN
    UPDATE public.tiang t
    SET dikonfirmasi_at = now(),
        dikonfirmasi_oleh = COALESCE(m.petugas_nama, t.dikonfirmasi_oleh),
        updated_at = now()
    FROM public.inspeksi_jtm_titik tk
    WHERE tk.inspeksi_id = p_id AND t.id = tk.tiang_id;
  END IF;
END $$;

-- ── 8. Hak akses ─────────────────────────────────────────────────────────────

GRANT EXECUTE ON FUNCTION public.mulai_penyapuan_jtm      TO authenticated;
GRANT EXECUTE ON FUNCTION public.nilai_tiang_jtm          TO authenticated;
GRANT EXECUTE ON FUNCTION public.tambah_tiang_jtm         TO authenticated;
GRANT EXECUTE ON FUNCTION public.tiang_terdekat_jtm       TO authenticated;
GRANT EXECUTE ON FUNCTION public.tumpangi_tiang_jtm       TO authenticated;
GRANT EXECUTE ON FUNCTION public.koreksi_titik_tiang_jtm  TO authenticated;
GRANT EXECUTE ON FUNCTION public.selesaikan_penyapuan_jtm TO authenticated;
GRANT EXECUTE ON FUNCTION public.putuskan_penyapuan_jtm   TO authenticated;
