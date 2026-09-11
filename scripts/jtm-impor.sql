-- =============================================================================
-- Fase 4.2d — Inspeksi JTM: impor tiang & rawat segmen
-- Jalankan SESUDAH `jtm-view.sql`. Idempoten.
--
-- Impor lewat FUNGSI, bukan ratusan insert dari peramban. Dua alasan, dan
-- keduanya sudah pernah menggigit di modul lain:
--
--   1. Rantai induk harus dibangun BERURUTAN — induk lahir sebelum anaknya.
--      Insert satu per satu dari peramban bisa terganggu di tengah (sinyal
--      putus, halaman ditutup) dan meninggalkan separuh rantai tanpa induk.
--   2. 280 baris = 280 perjalanan bolak-balik. Di jaringan kantor itu menit,
--      bukan detik, dan orang akan menutup halamannya sebelum selesai.
-- =============================================================================

-- ── 1. Impor tiang ───────────────────────────────────────────────────────────
-- Induk TIDAK diambil dari urutan baris, melainkan dari TIANG TERDEKAT yang
-- sudah ada. Urutan baris terlihat menggoda — data survei biasanya berurut —
-- tapi begitu ada baris cabang di tengah (Sheet lama menuliskannya '1 L1'),
-- rantai urutan langsung salah dan panjangnya ikut salah tanpa ada yang tahu.
-- Tiang terdekat memberi jawaban yang sama untuk data lurus, DAN masih benar
-- saat datanya bercabang.
--
-- `PANJANG` di berkas sumber sengaja tidak dibaca sama sekali. Angka itu
-- turunan dari koordinat, dan menyalinnya berarti menyimpan dua kebenaran yang
-- akan berselisih begitu satu titik dikoreksi.

CREATE OR REPLACE FUNCTION public.impor_tiang_jtm(
  p_penyulang TEXT,
  p_ulp       TEXT,
  p_baris     JSONB,
  p_segmen_id UUID DEFAULT NULL,
  p_oleh      TEXT DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  amb        public.jtm_settings%ROWTYPE;
  r          JSONB;
  -- v_ di depan BUKAN gaya-gayaan: tanpa itu `lat` di dalam kueri bisa
  -- berarti variabel ini ATAU kolom tiang.lat, dan Postgres menolak menebak.
  v_lat      DOUBLE PRECISION;
  v_lng      DOUBLE PRECISION;
  dekat_id   UUID;
  dekat_m    DOUBLE PRECISION;
  prev_id    UUID;
  prev_lat   DOUBLE PRECISION;
  prev_lng   DOUBLE PRECISION;
  prev_m     DOUBLE PRECISION;
  id_baru    UUID;
  seg        RECORD;
  masuk      INT := 0;
  duplikat   INT := 0;
  tanpaTitik INT := 0;
  jauh       INT := 0;
  pangkal    INT := 0;
  maks_m     DOUBLE PRECISION := 0;
BEGIN
  IF btrim(COALESCE(p_penyulang, '')) = '' THEN
    RAISE EXCEPTION 'Penyulang harus diisi';
  END IF;
  IF btrim(COALESCE(p_ulp, '')) = '' THEN
    RAISE EXCEPTION 'ULP harus diisi';
  END IF;
  IF jsonb_array_length(COALESCE(p_baris, '[]'::jsonb)) = 0 THEN
    RAISE EXCEPTION 'Tidak ada baris untuk diimpor';
  END IF;
  IF jsonb_array_length(p_baris) > 5000 THEN
    RAISE EXCEPTION 'Terlalu banyak baris sekali jalan (%). Pecah per penyulang atau per seksi.',
      jsonb_array_length(p_baris);
  END IF;

  SELECT * INTO amb FROM public.jtm_ambang(p_ulp);

  IF p_segmen_id IS NOT NULL THEN
    SELECT * INTO seg FROM public.segmen WHERE id = p_segmen_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Segmen tujuan tidak ditemukan'; END IF;
    IF upper(seg.ulp) <> upper(p_ulp) THEN
      RAISE EXCEPTION 'Segmen % ada di ULP %, bukan %', seg.nama, seg.ulp, p_ulp;
    END IF;
  END IF;

  FOR r IN SELECT * FROM jsonb_array_elements(p_baris) LOOP
    v_lat := NULLIF(btrim(COALESCE(r->>'lat', '')), '')::double precision;
    v_lng := NULLIF(btrim(COALESCE(r->>'lng', '')), '')::double precision;

    -- Tiang tanpa koordinat dilewati, bukan dimasukkan dengan titik kosong.
    -- Tiang tak bertitik tidak bisa jadi induk siapa pun dan tidak menyumbang
    -- panjang apa pun — dia cuma akan jadi baris yang membingungkan di peta.
    IF v_lat IS NULL OR v_lng IS NULL THEN
      tanpaTitik := tanpaTitik + 1;
      CONTINUE;
    END IF;

    -- Tiang terdekat milik penyulang ini: dipakai DUA KALI — untuk mengenali
    -- baris yang sudah pernah diimpor, dan sebagai calon induk.
    SELECT t.id, public.jarak_meter(v_lat, v_lng, t.lat, t.lng) AS m
      INTO dekat_id, dekat_m
    FROM public.tiang t
    WHERE upper(COALESCE(t.penyulang, '')) = upper(p_penyulang)
      AND t.status_hidup = 'aktif'
      AND t.lat IS NOT NULL AND t.lng IS NOT NULL
    ORDER BY public.jarak_meter(v_lat, v_lng, t.lat, t.lng)
    LIMIT 1;

    -- BARIS SEBELUMNYA lebih dipercaya daripada yang terdekat, selama masih
    -- dalam bentang yang wajar.
    --
    -- Alasannya bukan selera: surveyor berjalan menyusuri jalur, jadi urutan
    -- baris ITU jalurnya. Selalu memilih yang terdekat membuat tiang menempel
    -- ke tetangga di seberang jalan yang kebetulan 3 m lebih dekat, dan setiap
    -- kali itu terjadi lahir satu percabangan palsu. Pada impor 250 tiang
    -- sungguhan akibatnya terukur: cuma 9 tiang tersisa di deret pokok, 241
    -- lainnya terlempar jadi cabang. Barisnya benar semua, tapi bentuk
    -- jaringannya jadi tidak mirip kenyataan.
    --
    -- Kalau baris sebelumnya ternyata jauh — data melompat ke seksi lain —
    -- yang terdekat tetap dipakai.
    IF prev_id IS NOT NULL THEN
      prev_m := public.jarak_meter(v_lat, v_lng, prev_lat, prev_lng);
      IF prev_m IS NOT NULL AND prev_m <= amb.bentang_maks_wajar_m THEN
        dekat_id := prev_id;
        dekat_m  := prev_m;
      END IF;
    END IF;

    -- Tiang terdekat yang JAUH bukan induk, dia tiang lain.
    --
    -- Ketahuan saat mengimpor 250 tiang sungguhan: satu tiang liar yang
    -- tertinggal di penyulang yang sama membuat seluruh impor menggantung
    -- padanya, dan bentang pertama tercatat 1.086 m. Bukan galat yang
    -- memunculkan pesan apa pun — cuma satu angka panjang yang salah, dan satu
    -- garis melintang di peta. Di atas tiga kali bentang wajar, tiang ini
    -- dimulai sebagai PANGKAL baru; rantainya boleh terpisah, panjangnya tidak
    -- boleh mengarang.
    IF dekat_m IS NOT NULL AND dekat_m > amb.bentang_maks_wajar_m * 3 THEN
      dekat_id := NULL;
      dekat_m  := NULL;
      pangkal  := pangkal + 1;
    END IF;

    IF dekat_id IS NOT NULL AND dekat_m <= amb.radius_tumpang_m THEN
      -- Sudah ada tiang di titik yang praktis sama. Menjalankan impor dua kali
      -- tidak boleh melahirkan jaringan kembar — tapi kalau impor kali ini
      -- menyebut segmen, tiang lamanya tetap disambungkan ke segmen itu.
      duplikat := duplikat + 1;
      -- Barisnya dilewati, tapi tiang yang sudah ada di titik itu tetap jadi
      -- acuan baris berikutnya — kalau tidak, rantai melompat melewatinya.
      prev_id  := dekat_id;
      prev_lat := v_lat;
      prev_lng := v_lng;
      IF p_segmen_id IS NOT NULL THEN
        INSERT INTO public.segmen_tiang (segmen_id, tiang_id, sumber)
        VALUES (p_segmen_id, dekat_id, 'impor')
        ON CONFLICT DO NOTHING;
      END IF;
      CONTINUE;
    END IF;

    INSERT INTO public.tiang
      (penyulang, ulp, lat, lng, jenis, konstruksi, nomor_lama,
       induk_id, sumber, status_hidup, catatan)
    VALUES (
      btrim(p_penyulang), upper(btrim(p_ulp)), v_lat, v_lng,
      NULLIF(btrim(COALESCE(r->>'jenis', '')), ''),
      NULLIF(btrim(COALESCE(r->>'konstruksi', '')), ''),
      NULLIF(btrim(COALESCE(r->>'nomor_lama', '')), ''),
      dekat_id,                       -- NULL pada tiang pertama = pangkal
      'impor', 'aktif',
      NULLIF(btrim(COALESCE(r->>'catatan', '')), ''))
    RETURNING id INTO id_baru;

    IF p_segmen_id IS NOT NULL THEN
      INSERT INTO public.segmen_tiang (segmen_id, tiang_id, sumber)
      VALUES (p_segmen_id, id_baru, 'impor')
      ON CONFLICT DO NOTHING;
    END IF;

    prev_id  := id_baru;
    prev_lat := v_lat;
    prev_lng := v_lng;

    masuk := masuk + 1;
    IF dekat_m IS NOT NULL THEN
      IF dekat_m > maks_m THEN maks_m := dekat_m; END IF;
      IF dekat_m > amb.bentang_maks_wajar_m THEN jauh := jauh + 1; END IF;
    END IF;
  END LOOP;

  -- Baris impor TIDAK menyalakan `dikonfirmasi_at`. Yang diimpor belum pernah
  -- dilihat orang yang berdiri di bawahnya, dan angka kelengkapan master harus
  -- tetap jujur soal itu.
  RETURN jsonb_build_object(
    'masuk', masuk,
    'duplikat', duplikat,
    'tanpa_titik', tanpaTitik,
    'bentang_maks_m', round(maks_m::numeric, 1),
    'bentang_di_atas_wajar', jauh,
    'pangkal_baru', pangkal,
    'ambang_wajar_m', amb.bentang_maks_wajar_m
  );
END $$;

COMMENT ON FUNCTION public.impor_tiang_jtm IS
  'Impor tiang JTM berurutan, induk = tiang terdekat yang sudah ada. Panjang TIDAK diimpor — dihitung dari koordinat.';

-- ── 2. Gabung segmen ─────────────────────────────────────────────────────────
-- Dua segmen yang ternyata ruas yang sama. Yang berpindah cuma KEANGGOTAAN
-- tiangnya; tiangnya sendiri tidak disentuh, karena yang salah memang bukan
-- tiangnya melainkan pembagian ruasnya.

CREATE OR REPLACE FUNCTION public.gabung_segmen(
  p_dari UUID,
  p_ke   UUID,
  p_oleh TEXT DEFAULT NULL
) RETURNS INT
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  a   RECORD;
  b   RECORD;
  jml INT;
BEGIN
  IF p_dari = p_ke THEN RAISE EXCEPTION 'Segmen asal dan tujuan sama'; END IF;

  SELECT * INTO a FROM public.segmen WHERE id = p_dari;
  IF NOT FOUND THEN RAISE EXCEPTION 'Segmen asal tidak ditemukan'; END IF;
  SELECT * INTO b FROM public.segmen WHERE id = p_ke;
  IF NOT FOUND THEN RAISE EXCEPTION 'Segmen tujuan tidak ditemukan'; END IF;

  -- Beda penyulang BUKAN penggabungan, itu pemindahan kepemilikan — dan itu
  -- punya jalurnya sendiri (koreksi massal), lengkap dengan penomoran ulang.
  IF upper(a.penyulang) <> upper(b.penyulang) OR upper(a.ulp) <> upper(b.ulp) THEN
    RAISE EXCEPTION
      'Tidak bisa menggabung segmen beda penyulang/ULP (% % → % %). Pakai koreksi massal kalau memang pindah kepemilikan.',
      a.penyulang, a.ulp, b.penyulang, b.ulp;
  END IF;

  INSERT INTO public.segmen_tiang (segmen_id, tiang_id, posisi, sumber)
  SELECT p_ke, tiang_id, posisi, sumber FROM public.segmen_tiang WHERE segmen_id = p_dari
  ON CONFLICT DO NOTHING;
  GET DIAGNOSTICS jml = ROW_COUNT;

  DELETE FROM public.segmen_tiang WHERE segmen_id = p_dari;

  -- Anak-anaknya ikut berpindah induk. Kalau tidak, segmen anak menunjuk
  -- segmen yang sudah tidak aktif dan pohonnya putus di tengah.
  UPDATE public.segmen SET induk_segmen_id = p_ke WHERE induk_segmen_id = p_dari;

  UPDATE public.segmen
  SET status = 'nonaktif',
      catatan = btrim(COALESCE(catatan, '') || ' [digabung ke ' || b.nama || ']'),
      updated_at = now()
  WHERE id = p_dari;

  INSERT INTO public.master_audit
    (entitas, entitas_kode, ulp, field, nilai_lama, nilai_baru, aksi, oleh_uid, oleh_nama)
  VALUES ('segmen', a.nama, a.ulp, 'gabung',
          to_jsonb(a.nama), to_jsonb(b.nama), 'sunting_admin', auth.uid(), p_oleh);

  RETURN jml;
END $$;

-- ── 3. Hak akses ─────────────────────────────────────────────────────────────

GRANT EXECUTE ON FUNCTION public.impor_tiang_jtm TO authenticated;
GRANT EXECUTE ON FUNCTION public.gabung_segmen   TO authenticated;

-- =============================================================================
-- Periksa hasilnya
-- =============================================================================
-- a. Impor tiga tiang percobaan:
--      SELECT impor_tiang_jtm('MATARAM', 'CAKRANEGARA', '[
--        {"nomor_lama":"1","lat":-8.5800,"lng":116.1100,"jenis":"BETON 13 M"},
--        {"nomor_lama":"2","lat":-8.5796,"lng":116.1100,"jenis":"BETON 13 M"}
--      ]'::jsonb);
--
-- b. Jalankan ULANG perintah yang sama — hasilnya harus 0 masuk, 2 duplikat.
-- =============================================================================
