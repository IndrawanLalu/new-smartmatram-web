-- scripts/jtm-rintis.sql
--
-- MERINTIS SEGMEN DARI LAPANGAN: petugas memilih penyulang, berjalan menyusuri
-- jaringan sambil menitik tiang, lalu menutup segmennya di ujung.
--
-- Bedanya dengan alur yang sudah ada: di sana segmen dipilih lebih dulu lalu
-- tiangnya disapu. Itu mensyaratkan segmen dan tiangnya sudah tercatat — benar
-- untuk penyulang yang sudah diimpor, mustahil untuk jaringan yang belum punya
-- satu baris pun. Di sinilah segmen justru LAHIR dari berjalan kaki.
--
-- TIDAK ADA STATUS BARU, dan itu disengaja. Segmen yang sedang dirintis adalah
-- segmen yang titik akhirnya masih 'UJUNG' — keadaannya sudah terbaca dari
-- datanya sendiri. Bendera terpisah berarti dua sumber kebenaran yang bisa
-- berselisih, dan yang berselisih diam-diam selalu yang dipercaya keliru.
--
-- Nama segmen tetap TIDAK PERNAH DIKETIK UTUH. Petugas hanya memberi nama
-- ujungnya; `segmen_susun_nama()` yang merangkainya. Itulah yang membuat dua
-- orang menyebut ruas yang sama dengan nama yang sama.
--
-- Prasyarat: jtm-schema.sql · jtm-acuan.sql · jtm-inspeksi-schema.sql ·
--            jtm-inspeksi-fungsi.sql · jtm-pengaturan.sql
--
-- Aman dijalankan berulang.

DO $$
BEGIN
  IF to_regclass('public.jtm_ref') IS NULL THEN
    RAISE EXCEPTION
      'Tabel jtm_ref belum ada. Jalankan scripts/jtm-pengaturan.sql lebih dulu — penanda gardu/LBS/recloser dibaca dari sana.';
  END IF;
END $$;

-- Jenis titik yang boleh jadi UJUNG SEBUAH SEGMEN yang sudah ditutup.
-- 'UJUNG' sengaja tidak masuk: dia justru penanda bahwa segmennya BELUM
-- ditutup, jadi memakainya untuk menutup adalah kontradiksi.
CREATE OR REPLACE FUNCTION public.jtm_jenis_titik_sah(p_jenis TEXT)
RETURNS BOOLEAN
LANGUAGE sql IMMUTABLE AS $$
  SELECT COALESCE(
    upper(btrim(p_jenis)) IN ('GI','PMT','PLTD','REC','LBS','PENG','TIANG','GARDU'),
    false)
$$;

COMMENT ON FUNCTION public.jtm_jenis_titik_sah IS
  'Jenis titik yang sah untuk pangkal maupun ujung segmen yang sudah ditutup. UJUNG tidak termasuk — itu keadaan "masih dirintis", bukan sebuah tempat.';


-- ── 1. Usulan pangkal segmen berikutnya ──────────────────────────────────────
-- Dipanggil SEBELUM merintis. Dua hal yang dijawabnya sekaligus:
--
--   (a) Apakah penyulang ini sudah punya rintisan yang belum ditutup? Kalau ya,
--       yang benar MELANJUTKAN, bukan memulai yang kedua — dua rintisan terbuka
--       di satu penyulang berarti dua orang menitik ruas yang sama tanpa saling
--       tahu, dan itu baru ketahuan berbulan-bulan kemudian sebagai tiang ganda.
--
--   (b) Kalau tidak, di mana segmen terakhir berhenti? Ujungnya itulah pangkal
--       segmen berikutnya. Petugas tinggal mengiyakan, tidak mengetik ulang —
--       dan karena tidak mengetik, rantainya tidak bisa putus karena salah tik.

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
  ORDER BY s.created_at DESC
  LIMIT 1;

  SELECT count(*) INTO v_selesai
  FROM public.segmen s
  WHERE upper(s.penyulang) = v_penyulang
    AND upper(s.ulp) = v_ulp
    AND s.status = 'aktif'
    AND s.titik_akhir_jenis <> 'UJUNG';

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

COMMENT ON FUNCTION public.usul_awal_jtm IS
  'Pangkal segmen berikutnya = ujung segmen terakhir penyulang itu. Sekaligus melaporkan rintisan yang masih terbuka supaya dilanjutkan, bukan diduplikasi.';


-- ── 2. Mulai merintis ────────────────────────────────────────────────────────
-- Melahirkan segmen yang ujungnya masih terbuka, lalu langsung membuka
-- penyapuannya. Keduanya sekali jalan: rintisan tanpa penyapuan tidak punya
-- tempat menyimpan penilaian, dan petugas yang harus menekan dua tombol untuk
-- satu maksud akan lupa menekan yang kedua.

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
    ORDER BY s.created_at DESC
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

COMMENT ON FUNCTION public.rintis_segmen_jtm IS
  'Melahirkan segmen berujung terbuka + membuka penyapuannya. Rintisan yang masih terbuka dilanjutkan, tidak diduplikasi.';


-- ── 3. Menutup segmen ────────────────────────────────────────────────────────
-- Di sinilah segmen mendapat namanya. Petugas hanya menyebut UJUNGNYA — dan
-- bentuk penyebutan itu berbeda menurut apa yang berdiri di sana:
--
--   tiang biasa   → 'TIANG'  + 'GNN-B14_A5 PERCABANGAN PASAR'
--   gardu         → 'GARDU'  + 'MTR-0123'
--   keypoint      → 'LBS'    + 'PERPUSTAKAAN'   (jadi 'LBS. PERPUSTAKAAN')
--
-- Kalau ujungnya sebuah keypoint, penandanya sekalian ditulis ke tiang yang
-- memikulnya. Satu pekerjaan, dua hasil: batas segmen tercatat, dan ikonnya di
-- peta langsung berbeda tanpa ada yang perlu menandainya lagi dari belakang meja.

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
      PERFORM public.selesaikan_penyapuan_jtm(v_inspeksi, p_oleh, p_catatan);
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

COMMENT ON FUNCTION public.tutup_segmen_jtm IS
  'Memberi ujung pada segmen yang dirintis — namanya disusun trigger, penandanya ditulis ke tiang penutup, penyapuannya ditutup kalau ada yang dinilai.';


GRANT EXECUTE ON FUNCTION public.jtm_jenis_titik_sah TO authenticated;
GRANT EXECUTE ON FUNCTION public.usul_awal_jtm       TO authenticated;
GRANT EXECUTE ON FUNCTION public.rintis_segmen_jtm   TO authenticated;
GRANT EXECUTE ON FUNCTION public.tutup_segmen_jtm    TO authenticated;
