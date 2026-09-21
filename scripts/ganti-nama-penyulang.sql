-- =============================================================================
-- Ganti nama penyulang — SELALU dilingkupi satu ULP
-- Jalankan SESUDAH `master-penyulang.sql`. Idempoten.
--
-- ── KENAPA ──────────────────────────────────────────────────────────────────
-- Nama penyulang salah sejak awal di beberapa tempat, dan sampai sekarang tidak
-- ada satu pun cara membetulkannya selain UPDATE tangan di SQL Editor pada
-- belasan tabel. Yang dikerjakan dengan tangan pada belasan tabel akan
-- melewatkan satu — dan yang terlewat tidak menimbulkan galat apa pun, cuma
-- satu penyulang yang riwayatnya terputus separuh.
--
-- ── ⚠ HILBERON DI TANJUNG BUKAN HILBERON DI AMPENAN ─────────────────────────
-- Dikoreksi Bapak 21 Sep 2026: nama yang sama di dua ULP adalah DUA penyulang
-- berbeda yang kebetulan senama, bukan satu penyulang yang melintas batas.
-- Karena itu tindakannya selalu berbunyi "ganti nama X DI ULP Y", dan TANJUNG
-- yang menggantinya tidak boleh menyentuh punya AMPENAN.
--
-- ── ⚠ TIGA TEMUAN YANG MENGUBAH RANCANGAN (diperiksa 21 Sep 2026) ───────────
--
--   1. YANG SILANG ULP ADA 11, BUKAN 4. Empat yang disebut di rencana
--      (HILBERON, TANJUNG, PRAYA, KOPANG) ternyata BELUM TERDAFTAR di master
--      sama sekali; tujuh sisanya (PAGUTAN, BUNG KARNO, MATARAM, CEMARA,
--      CAKRA KOTA, GERUNG, LEMBAR) sudah terdaftar dan belum pernah terlihat.
--
--   2. NAMA PENYULANG HIDUP DI 19 KOLOM PADA 18 TABEL, bukan 3 seperti tertulis
--      di rencana. Enam di antaranya sengaja TIDAK ikut berganti — alasannya
--      ditulis satu per satu di `penyulang_ikut()`, bukan disembunyikan di
--      badan fungsi.
--
--   3. NAMA YANG BELUM TERDAFTAR TIDAK BISA DIDAFTARKAN DUA KALI.
--      `penyulang_ref.penyulang` itu primary key, jadi TANJUNG dan AMPENAN
--      tidak mungkin sama-sama punya baris 'HILBERON'. Salah satunya HARUS
--      ganti nama lebih dulu. Karena itu fungsi ini juga menerima nama yang
--      belum ada di master — kalau tidak, keempat kasus itu buntu.
-- =============================================================================


-- ── 1. Di mana saja nama penyulang hidup ─────────────────────────────────────
-- Daftar ini SATU-SATUNYA sumber jawaban "apa saja yang ikut berganti", dibaca
-- oleh pratinjau maupun pelaksananya. Disendirikan justru supaya bisa dibaca
-- orang: daftar yang tertanam di badan fungsi tidak pernah ditinjau ulang, dan
-- tabel ke-19 yang lahir tahun depan akan diam-diam tertinggal.

CREATE OR REPLACE FUNCTION public.penyulang_ikut()
RETURNS TABLE (tabel TEXT, kolom TEXT, kolom_ulp TEXT, ikut BOOLEAN, alasan TEXT)
LANGUAGE sql IMMUTABLE AS $fn$
  SELECT * FROM (VALUES
    -- ── IKUT: kunci hidup. Tanpa ini penggantian namanya tidak berarti apa-apa ──
    ('gardu',                'feeder',    'ulp',      true,  'Induk aset. Inilah yang paling banyak memikul nama penyulang.'),
    ('tiang',                'penyulang', 'ulp',      true,  'Kepemilikan tiang JTM.'),
    ('tiang',                'feeder',    'ulp',      true,  'Salinan lama nama penyulang di tabel tiang; harus sepakat dengan kolom penyulang, kalau tidak dua layar menyebut nama berbeda untuk batang yang sama.'),
    ('tiang_kode_penyulang', 'penyulang', 'ulp',      true,  'Nama tiang menurut TIAP penyulang yang melewatinya.'),
    ('segmen',               'penyulang', 'ulp',      true,  'Ruas jaringan — induk WO inspeksi dan perabasan.'),
    ('penyulang_rute',       'penyulang', 'ulp',      true,  'Rute penyulang di peta jaringan.'),

    -- ── IKUT: catatan kerja SMART sendiri ──
    -- Penyulangnya tidak berganti identitas; namanya yang keliru. Meninggalkan
    -- catatan ini memakai nama lama membuat riwayat sebuah penyulang terputus
    -- tepat di tanggal penggantian — dan tidak ada layar yang bisa menyambungnya.
    ('inspeksi_jtm',         'penyulang', 'ulp',      true,  'Hasil inspeksi JTM.'),
    ('inspeksi_jtr',         'penyulang', 'ulp',      true,  'Hasil inspeksi JTR.'),
    ('inspeksi',             'penyulang', 'ulp',      true,  'Inspeksi jaringan (warisan).'),
    ('pemeliharaan_gardu',   'penyulang', 'ulp',      true,  'Catatan pemeliharaan gardu.'),
    ('penyeimbangan_gardu',  'penyulang', 'ulp',      true,  'Catatan penyeimbangan beban.'),
    ('wo_pengukuran_item',   'penyulang', 'ulp',      true,  'Potret WO pengukuran.'),
    ('pengukuran_gardu',     'penyulang', NULL::TEXT, true,  'Riwayat pengukuran beban. ⚠ Tabel ini TIDAK punya kolom ulp, jadi pada pemisahan barisnya tidak bisa dilingkupi dan sengaja tidak disentuh — tetap memakai nama lama.'),

    -- ── TIDAK IKUT ──
    ('inspeksi_pohon',       'penyulang', 'ulp',      false, 'Di luar cakupan (disepakati 21 Sep 2026). Lagipula 3.224 dari 5.691 barisnya memuat nama KEYPOINT, bukan nama penyulang — mengganti sebagian berarti merusak satu-satunya petunjuk ruas yang dimiliki baris-baris itu.'),
    ('padam_apkt',           'penyulang', 'ulp',      false, 'Dokumen dari APKT, bukan catatan SMART. Menggantinya memalsukan isi dokumen, dan impor berikutnya menuliskan nama lama lagi.'),
    ('ml_outage_events',     'penyulang', 'ulp',      false, 'Bersumber dari Sheets/APKT, dan dedup_key-nya memuat nama penyulang. Mengganti kolomnya saja membuat keduanya tidak sepakat; mengganti keduanya memutus pencocokan dengan sumbernya.'),
    ('daily_feeder_risk',    'penyulang', 'ulp',      false, 'Keluaran model, ditulis ulang pipeline tiap malam. Menggantinya kerja sia-sia.'),
    ('gangguan_realtime',    'penyulang', 'ulp',      false, 'Salinan pesan dispatcher apa adanya.'),
    ('jalur',                'feeder',    NULL::TEXT, false, 'Gambar peta warisan, tanpa ULP; sudah digantikan penyulang_rute.')
  ) AS t(tabel, kolom, kolom_ulp, ikut, alasan);
$fn$;

COMMENT ON FUNCTION public.penyulang_ikut IS
  'Tempat nama penyulang hidup, dan mana yang ikut berganti saat namanya diganti. Satu-satunya sumber jawaban itu — dibaca pratinjau maupun pelaksananya.';


-- ── 2. Siapa yang boleh ──────────────────────────────────────────────────────
-- UP3 semua ULP, admin hanya unitnya sendiri. Disepakati 21 Sep 2026.

CREATE OR REPLACE FUNCTION public.penyulang_wajib_boleh(p_ulp TEXT)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  r TEXT;
  u TEXT;
BEGIN
  SELECT role, unit INTO r, u FROM public.user_roles WHERE user_id = auth.uid();

  IF r = 'UP3' THEN RETURN; END IF;
  IF r = 'admin' AND upper(COALESCE(u, '')) = upper(COALESCE(p_ulp, '')) THEN RETURN; END IF;

  RAISE EXCEPTION
    'Anda tidak berhak mengganti nama penyulang di ULP %. Yang boleh: UP3 (semua ULP) dan admin ULP itu sendiri.',
    COALESCE(p_ulp, '-');
END $fn$;


-- ── 3. Menghitung akibatnya ──────────────────────────────────────────────────
-- Dipakai pratinjau DAN pelaksananya, supaya angka di layar dan angka yang
-- benar-benar berubah datang dari hitungan yang sama persis. Kalau layar
-- menghitung sendiri, selisihnya baru ketahuan sesudah tombolnya ditekan.
--
-- Tabel yang tidak ada dilewati, tidak dianggap galat: berkas ini dijalankan di
-- basis data yang belum tentu punya seluruh modul, dan gagal di tengah karena
-- satu tabel tidak ada akan meninggalkan penggantian setengah jadi.

CREATE OR REPLACE FUNCTION public.hitung_pakai_penyulang(
  p_nama TEXT,
  p_ulp  TEXT DEFAULT NULL   -- NULL = seluruh ULP
) RETURNS TABLE (tabel TEXT, kolom TEXT, ikut BOOLEAN, terlingkup BOOLEAN, baris BIGINT, alasan TEXT)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  m    RECORD;
  n    BIGINT;
  unit TEXT := NULLIF(upper(btrim(COALESCE(p_ulp, ''))), '');
  nama TEXT := upper(btrim(COALESCE(p_nama, '')));
BEGIN
  FOR m IN SELECT * FROM public.penyulang_ikut() LOOP
    CONTINUE WHEN NOT EXISTS (
      SELECT 1 FROM information_schema.columns c
      WHERE c.table_schema = 'public' AND c.table_name = m.tabel AND c.column_name = m.kolom
    );

    IF unit IS NOT NULL AND m.kolom_ulp IS NOT NULL THEN
      EXECUTE format(
        $q$SELECT count(*) FROM public.%I WHERE upper(btrim(coalesce(%I,''))) = $1 AND upper(coalesce(%I,'')) = $2$q$,
        m.tabel, m.kolom, m.kolom_ulp) INTO n USING nama, unit;
      terlingkup := true;
    ELSE
      EXECUTE format(
        $q$SELECT count(*) FROM public.%I WHERE upper(btrim(coalesce(%I,''))) = $1$q$,
        m.tabel, m.kolom) INTO n USING nama;
      terlingkup := (unit IS NULL);
    END IF;

    tabel := m.tabel; kolom := m.kolom; ikut := m.ikut; baris := n; alasan := m.alasan;
    RETURN NEXT;
  END LOOP;
END $fn$;


-- ── 4. Sebaran per ULP ───────────────────────────────────────────────────────
-- Inilah yang menentukan tindakannya GANTI atau PISAH — dan yang mengisi baris
-- "TIDAK berubah" di pratinjau. Baris itu yang paling penting di layar: tanpanya
-- admin TANJUNG mengira sudah membetulkan seluruh kekeliruan, padahal separuhnya
-- masih berdiri di ULP sebelah.

CREATE OR REPLACE FUNCTION public.sebaran_penyulang(p_nama TEXT)
RETURNS TABLE (ulp TEXT, baris BIGINT)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  m    RECORD;
  nama TEXT := upper(btrim(COALESCE(p_nama, '')));
  hit  JSONB := '{}'::jsonb;
  satu RECORD;
BEGIN
  FOR m IN SELECT * FROM public.penyulang_ikut() WHERE ikut AND kolom_ulp IS NOT NULL LOOP
    CONTINUE WHEN NOT EXISTS (
      SELECT 1 FROM information_schema.columns c
      WHERE c.table_schema = 'public' AND c.table_name = m.tabel AND c.column_name = m.kolom
    );

    FOR satu IN EXECUTE format(
      $q$SELECT upper(coalesce(%I,'-')) AS u, count(*) AS n FROM public.%I
         WHERE upper(btrim(coalesce(%I,''))) = $1 GROUP BY 1$q$,
      m.kolom_ulp, m.tabel, m.kolom) USING nama
    LOOP
      hit := jsonb_set(hit, ARRAY[satu.u],
                       to_jsonb(COALESCE((hit ->> satu.u)::BIGINT, 0) + satu.n));
    END LOOP;
  END LOOP;

  RETURN QUERY
    SELECT k.key, (k.value #>> '{}')::BIGINT
    FROM jsonb_each(hit) k
    ORDER BY 2 DESC;
END $fn$;


-- ── 5. Pratinjau ─────────────────────────────────────────────────────────────
-- Tidak mengubah apa pun. Bentuk hasilnya sama persis dengan pelaksananya,
-- supaya layar cukup punya satu cara membacanya.

CREATE OR REPLACE FUNCTION public.pratinjau_ganti_nama_penyulang(
  p_lama TEXT,
  p_ulp  TEXT,
  p_baru TEXT DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  lama       TEXT := regexp_replace(upper(btrim(COALESCE(p_lama, ''))), '\s+', ' ', 'g');
  baru       TEXT := regexp_replace(upper(btrim(COALESCE(p_baru, ''))), '\s+', ' ', 'g');
  unit       TEXT := upper(btrim(COALESCE(p_ulp, '')));
  terdaftar  BOOLEAN;
  ulp_master TEXT;
  lain       BIGINT;
  tindakan   TEXT;
  lingkup    TEXT;
  peringatan TEXT[] := ARRAY[]::TEXT[];
  n_bernama  BIGINT;
BEGIN
  IF lama = '' THEN RAISE EXCEPTION 'Nama penyulang yang mau diganti belum diisi'; END IF;
  IF unit = '' THEN RAISE EXCEPTION 'ULP belum dipilih. Penggantian nama selalu dilingkupi satu ULP.'; END IF;

  SELECT true, ulp INTO terdaftar, ulp_master
  FROM public.penyulang_ref WHERE upper(penyulang) = lama;
  terdaftar := COALESCE(terdaftar, false);

  SELECT COALESCE(sum(baris), 0) INTO lain
  FROM public.sebaran_penyulang(lama) WHERE ulp <> unit;

  -- Tiga keadaan, ditentukan DATA — bukan dipilih pemakai. Pemakai yang boleh
  -- memilih "pisah atau ganti" akan memilih yang salah persis di saat yang
  -- paling merugikan, karena yang tahu bedanya cuma angka di basis data.
  tindakan := CASE
    WHEN lain > 0  THEN 'pisah'        -- namanya dipakai ULP lain juga
    WHEN terdaftar THEN 'ganti'        -- namanya milik ULP ini sendirian
    ELSE                'daftar_baru'  -- belum ada di master sama sekali
  END;
  lingkup := CASE WHEN tindakan = 'ganti' THEN NULL ELSE unit END;

  -- Nama tiang TIDAK ikut berubah, dan itu wajib disebut. Prefiksnya turunan
  -- `kode_singkat`, bukan turunan nama — jadi tiang di penyulang yang baru
  -- berganti nama masih bernama MTR-014 sampai ada yang menomori ulangnya.
  SELECT COALESCE(sum(baris), 0) INTO n_bernama
  FROM public.hitung_pakai_penyulang(lama, lingkup)
  WHERE tabel = 'tiang_kode_penyulang';

  IF n_bernama > 0 THEN
    peringatan := peringatan || format(
      '%s nama tiang TIDAK ikut berubah — prefiks nama tiang turunan kode singkat, bukan turunan nama penyulang. Nomori ulang lewat kolom Prefiks kalau memang perlu.', n_bernama);
  END IF;

  IF tindakan <> 'ganti' AND EXISTS (
    SELECT 1 FROM public.hitung_pakai_penyulang(lama, unit)
    WHERE ikut AND NOT terlingkup AND baris > 0
  ) THEN
    -- Cast-nya bukan hiasan: `array || 'teks'` membuat PostgreSQL menebak
    -- teksnya sebagai literal ARRAY, dan tebakan itu gagal dengan pesan
    -- "malformed array literal" yang tidak menyebut baris mana penyebabnya.
    peringatan := peringatan ||
      'Ada tabel yang tidak menyimpan ULP, jadi barisnya tidak bisa dipisah dan tetap memakai nama lama. Rinciannya di daftar "tidak terlingkup".'::TEXT;
  END IF;

  IF baru <> '' THEN
    IF baru = lama THEN
      peringatan := peringatan || 'Nama barunya sama dengan nama lama.'::TEXT;
    ELSIF EXISTS (SELECT 1 FROM public.penyulang_ref WHERE upper(penyulang) = baru) THEN
      peringatan := peringatan || format(
        'Nama "%s" SUDAH ADA di master. Pilih nama lain — menggabungkan dua penyulang bukan penggantian nama.', baru);
    ELSIF EXISTS (SELECT 1 FROM public.sebaran_penyulang(baru)) THEN
      peringatan := peringatan || format(
        'Nama "%s" sudah dipakai baris lain meski belum terdaftar. Pilih nama lain.', baru);
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'nama_lama',  lama,
    'nama_baru',  NULLIF(baru, ''),
    'ulp',        unit,
    'terdaftar',  terdaftar,
    'ulp_master', ulp_master,
    'tindakan',   tindakan,

    -- Yang BERUBAH.
    'berubah', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object('tabel', tabel, 'kolom', kolom, 'baris', baris)
                                ORDER BY baris DESC), '[]'::jsonb)
      FROM public.hitung_pakai_penyulang(lama, lingkup)
      WHERE ikut AND terlingkup AND baris > 0),

    -- Yang seharusnya ikut tapi tabelnya tidak menyimpan ULP.
    'tidak_terlingkup', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object('tabel', tabel, 'baris', baris, 'alasan', alasan)
                                ORDER BY baris DESC), '[]'::jsonb)
      FROM public.hitung_pakai_penyulang(lama, lingkup)
      WHERE ikut AND NOT terlingkup AND baris > 0),

    -- Yang sengaja dibiarkan memakai nama lama, beserta alasannya.
    'tidak_ikut', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object('tabel', tabel, 'baris', baris, 'alasan', alasan)
                                ORDER BY baris DESC), '[]'::jsonb)
      FROM public.hitung_pakai_penyulang(lama, NULL)
      WHERE NOT ikut AND baris > 0),

    -- ULP lain yang tetap memakai nama lama. INI yang paling penting di layar.
    'tetap_ulp_lain', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object('ulp', ulp, 'baris', baris) ORDER BY baris DESC), '[]'::jsonb)
      FROM public.sebaran_penyulang(lama) WHERE ulp <> unit),

    'peringatan', to_jsonb(peringatan)
  );
END $fn$;


-- ── 6. Pelaksananya ──────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.ganti_nama_penyulang(
  p_lama TEXT,
  p_ulp  TEXT,
  p_baru TEXT,
  p_oleh TEXT DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  lama     TEXT := regexp_replace(upper(btrim(COALESCE(p_lama, ''))), '\s+', ' ', 'g');
  baru     TEXT := regexp_replace(upper(btrim(COALESCE(p_baru, ''))), '\s+', ' ', 'g');
  unit     TEXT := upper(btrim(COALESCE(p_ulp, '')));
  awal     JSONB;
  tindakan TEXT;
  m        RECORD;
  sisa_ulp TEXT;
  prefiks  TEXT;
BEGIN
  IF baru = '' THEN RAISE EXCEPTION 'Nama baru tidak boleh kosong'; END IF;
  IF baru = lama THEN RAISE EXCEPTION 'Nama baru sama dengan nama lama'; END IF;
  IF baru !~ '^[A-Z0-9][A-Z0-9 ./-]*$' THEN
    RAISE EXCEPTION 'Nama "%" tidak sah. Huruf, angka, spasi, titik, strip, dan garis miring saja.', p_baru;
  END IF;

  PERFORM public.penyulang_wajib_boleh(unit);

  -- Pratinjau dipanggil dari SINI, bukan dipercayakan pada layar. Angka yang
  -- dilaporkan harus dihitung di transaksi yang sama dengan yang mengubahnya;
  -- angka yang dikirim layar sudah berumur beberapa detik, dan beberapa detik
  -- cukup untuk satu impor gardu berjalan.
  awal := public.pratinjau_ganti_nama_penyulang(lama, unit, baru);
  tindakan := awal ->> 'tindakan';

  IF EXISTS (SELECT 1 FROM public.penyulang_ref WHERE upper(penyulang) = baru) THEN
    RAISE EXCEPTION
      'Nama "%" sudah ada di master. Menggabungkan dua penyulang bukan penggantian nama — dan kalau memang harus digabung, itu tindakan tersendiri yang tidak bisa dibatalkan.', baru;
  END IF;

  IF (SELECT count(*) FROM public.sebaran_penyulang(baru)) > 0 THEN
    RAISE EXCEPTION
      'Nama "%" sudah dipakai baris lain meski belum terdaftar di master. Pilih nama lain, kalau tidak dua penyulang berbeda melebur jadi satu tanpa jejak.', baru;
  END IF;

  IF tindakan = 'ganti' THEN
    -- Nama itu cuma dipakai ULP ini. Baris masternya berganti nama, identitas
    -- dan riwayatnya utuh. Begitu kunci asing ON UPDATE CASCADE terpasang
    -- (fase berikutnya), baris ini yang merambat sendiri ke anak-anaknya —
    -- dan UPDATE per tabel di bawah lalu tidak menemukan apa-apa lagi. Itu
    -- tidak apa: angkanya sudah dihitung SEBELUM baris ini dijalankan.
    UPDATE public.penyulang_ref SET penyulang = baru WHERE upper(penyulang) = lama;
  ELSE
    -- PISAH (atau daftar baru). Induk harus ada LEBIH DULU, kalau tidak kunci
    -- asingnya — nanti — menolak anak yang menunjuk nama yang belum lahir.
    -- `kode_singkat_penyulang` sekalian membuatkan prefiksnya.
    prefiks := public.kode_singkat_penyulang(baru, unit);
  END IF;

  FOR m IN SELECT * FROM public.penyulang_ikut() WHERE ikut LOOP
    CONTINUE WHEN NOT EXISTS (
      SELECT 1 FROM information_schema.columns c
      WHERE c.table_schema = 'public' AND c.table_name = m.tabel AND c.column_name = m.kolom
    );

    IF tindakan = 'ganti' THEN
      EXECUTE format(
        $q$UPDATE public.%I SET %I = $1 WHERE upper(btrim(coalesce(%I,''))) = $2$q$,
        m.tabel, m.kolom, m.kolom) USING baru, lama;
    ELSIF m.kolom_ulp IS NOT NULL THEN
      EXECUTE format(
        $q$UPDATE public.%I SET %I = $1 WHERE upper(btrim(coalesce(%I,''))) = $2 AND upper(coalesce(%I,'')) = $3$q$,
        m.tabel, m.kolom, m.kolom, m.kolom_ulp) USING baru, lama, unit;
    END IF;
    -- Tabel tanpa kolom ulp sengaja dilewati saat memisah; barisnya sudah
    -- dilaporkan di 'tidak_terlingkup' supaya tidak hilang dari pandangan.
  END LOOP;

  -- Baris master lama yang ULP-nya ikut pindah akan berbohong: dia mengaku
  -- milik ULP yang barisnya sudah tidak ada lagi di sana. Diarahkan ke ULP yang
  -- masih memikul nama itu — dan kalau tidak ada lagi yang memikulnya, baris itu
  -- memang sudah tidak punya pemilik dan dibiarkan apa adanya supaya terlihat.
  IF tindakan = 'pisah' AND upper(COALESCE(awal ->> 'ulp_master', '')) = unit THEN
    SELECT ulp INTO sisa_ulp FROM public.sebaran_penyulang(lama) LIMIT 1;
    IF sisa_ulp IS NOT NULL THEN
      UPDATE public.penyulang_ref SET ulp = sisa_ulp WHERE upper(penyulang) = lama;
    END IF;
  END IF;

  -- Satu baris audit, memuat seluruh hitungannya. Inilah satu-satunya jalan
  -- pulang: tidak ada tombol pengembali, dan enam bulan lagi tidak seorang pun
  -- ingat berapa baris yang berpindah.
  INSERT INTO public.master_audit
    (entitas, entitas_kode, ulp, field, nilai_lama, nilai_baru, aksi, oleh_uid, oleh_nama)
  VALUES ('penyulang', lama, unit, 'ganti_nama',
          jsonb_build_object('penyulang', lama, 'ulp', unit),
          awal || jsonb_build_object('prefiks_baru', prefiks, 'ulp_master_sisa', sisa_ulp),
          'sunting_admin', auth.uid(), p_oleh);

  RETURN awal || jsonb_build_object('selesai', true, 'prefiks_baru', prefiks, 'ulp_master_sisa', sisa_ulp);
END $fn$;


-- ── 7. Penjaga: satu nama tidak bisa didaftarkan dua ULP ─────────────────────
--
-- ⚠ BUG YANG DIBETULKAN DI SINI. `simpan_penyulang` versi lama, saat diberi nama
-- yang sudah ada dengan ULP berbeda, DIAM-DIAM MEMINDAHKAN baris masternya ke
-- ULP itu selama penyulangnya belum bertiang. Lewat tombol "Masukkan ke master"
-- di layar Master Penyulang akibatnya nyata: menekan HILBERON/TANJUNG lalu
-- HILBERON/AMPENAN tidak menghasilkan dua penyulang — yang kedua merebut baris
-- yang pertama, dan 85 gardu TANJUNG diam-diam berinduk ke AMPENAN tanpa satu
-- pun pesan.
--
-- Sekarang ditolak, dengan menyebut jalan keluarnya.

CREATE OR REPLACE FUNCTION public.simpan_penyulang(
  p_penyulang    TEXT,
  p_ulp          TEXT,
  p_kode_singkat TEXT DEFAULT NULL,
  p_oleh         TEXT DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  nama    TEXT := regexp_replace(upper(btrim(COALESCE(p_penyulang, ''))), '\s+', ' ', 'g');
  unit    TEXT := upper(btrim(COALESCE(p_ulp, '')));
  kode    TEXT := NULLIF(upper(btrim(COALESCE(p_kode_singkat, ''))), '');
  lama    RECORD;
  dipakai INT;
  lain    BIGINT;
  daftar  TEXT;
  hasil   JSONB := '{}'::jsonb;
BEGIN
  IF nama = '' THEN RAISE EXCEPTION 'Nama penyulang tidak boleh kosong'; END IF;
  IF unit = '' THEN RAISE EXCEPTION 'ULP penyulang % belum diisi', nama; END IF;

  SELECT penyulang, ulp, kode_singkat INTO lama
  FROM public.penyulang_ref WHERE upper(penyulang) = nama;

  IF NOT FOUND THEN
    -- Nama ini dipakai ULP lain juga? Kalau ya, mendaftarkannya di sini
    -- menjadikan satu baris master induk bagi aset DUA penyulang berbeda — dan
    -- angkanya tidak bisa dipisah lagi setelah bercampur.
    SELECT COALESCE(sum(baris), 0) INTO lain
    FROM public.sebaran_penyulang(nama) WHERE ulp <> unit;

    IF lain > 0 THEN
      SELECT string_agg(format('%s %s baris', ulp, baris), ', ' ORDER BY baris DESC) INTO daftar
      FROM public.sebaran_penyulang(nama) WHERE ulp <> unit;

      RAISE EXCEPTION
        'Nama "%" juga dipakai di %. Nama penyulang unik di seluruh basis data, jadi dua ULP tidak bisa sama-sama mendaftarkannya. Ganti nama salah satunya lebih dulu lewat Ganti Nama Penyulang — sisanya baru bisa didaftarkan.',
        nama, daftar;
    END IF;

    INSERT INTO public.penyulang_ref (penyulang, ulp) VALUES (nama, unit);
    INSERT INTO public.master_audit
      (entitas, entitas_kode, ulp, field, nilai_lama, nilai_baru, aksi, oleh_uid, oleh_nama)
    VALUES ('penyulang', nama, unit, 'baru', NULL, to_jsonb(unit),
            'sunting_admin', auth.uid(), p_oleh);
    hasil := jsonb_build_object('baru', true);
  ELSE
    IF upper(COALESCE(lama.ulp, '')) IS DISTINCT FROM unit THEN
      -- Pemindahan ULP hanya sah kalau ULP LAMA sudah tidak memakai nama itu
      -- lagi. Kalau masih, yang diminta sebenarnya PEMISAHAN, bukan pemindahan
      -- — dan pemindahan di situ justru mencabut induk aset ULP lama.
      SELECT COALESCE(sum(baris), 0) INTO lain
      FROM public.sebaran_penyulang(nama) WHERE ulp <> unit;

      IF lain > 0 THEN
        SELECT string_agg(format('%s %s baris', ulp, baris), ', ' ORDER BY baris DESC) INTO daftar
        FROM public.sebaran_penyulang(nama) WHERE ulp <> unit;
        RAISE EXCEPTION
          'Penyulang % masih dipakai di %. Memindahkan masternya ke % akan mencabut induk aset di sana. Kalau maksudnya memisah dua penyulang senama, pakai Ganti Nama Penyulang.',
          nama, daftar, unit;
      END IF;

      SELECT count(*) INTO dipakai FROM public.tiang
      WHERE upper(COALESCE(penyulang, '')) = nama AND status_hidup = 'aktif';
      IF dipakai > 0 THEN
        RAISE EXCEPTION
          'Penyulang % sudah punya % tiang di ULP %. Memindahkannya ke % akan membuat tiang dan penyulangnya beda unit.',
          nama, dipakai, lama.ulp, unit;
      END IF;

      UPDATE public.penyulang_ref SET ulp = unit WHERE upper(penyulang) = nama;
      INSERT INTO public.master_audit
        (entitas, entitas_kode, ulp, field, nilai_lama, nilai_baru, aksi, oleh_uid, oleh_nama)
      VALUES ('penyulang', nama, unit, 'ulp', to_jsonb(lama.ulp), to_jsonb(unit),
              'sunting_admin', auth.uid(), p_oleh);
      hasil := hasil || jsonb_build_object('ulp_pindah', true);
    END IF;
  END IF;

  -- Prefiks diurus fungsinya sendiri — dialah yang tahu cara menomori ulang.
  IF kode IS NOT NULL THEN
    hasil := hasil || jsonb_build_object(
      'prefiks', public.ubah_kode_singkat_penyulang(nama, kode, p_oleh));
  END IF;

  RETURN hasil;
END $fn$;


-- ── 8. Hak akses ─────────────────────────────────────────────────────────────

GRANT EXECUTE ON FUNCTION public.penyulang_ikut                 TO authenticated;
GRANT EXECUTE ON FUNCTION public.penyulang_wajib_boleh          TO authenticated;
GRANT EXECUTE ON FUNCTION public.hitung_pakai_penyulang         TO authenticated;
GRANT EXECUTE ON FUNCTION public.sebaran_penyulang              TO authenticated;
GRANT EXECUTE ON FUNCTION public.pratinjau_ganti_nama_penyulang TO authenticated;
GRANT EXECUTE ON FUNCTION public.ganti_nama_penyulang           TO authenticated;
GRANT EXECUTE ON FUNCTION public.simpan_penyulang               TO authenticated;


-- =============================================================================
-- Periksa hasilnya
-- =============================================================================
-- a. SEMUA nama yang dipakai lebih dari satu ULP — per 21 Sep 2026 ada 11,
--    bukan 4 seperti tertulis di rencana:
--      WITH n AS (
--        SELECT DISTINCT upper(btrim(feeder)) AS nama FROM gardu
--        WHERE btrim(coalesce(feeder,'')) <> ''
--      )
--      SELECT n.nama,
--             (SELECT string_agg(ulp || ' ' || baris, '  ' ORDER BY baris DESC)
--                FROM sebaran_penyulang(n.nama)) AS sebaran,
--             EXISTS (SELECT 1 FROM penyulang_ref p WHERE upper(p.penyulang) = n.nama) AS terdaftar
--      FROM n
--      WHERE (SELECT count(*) FROM sebaran_penyulang(n.nama)) > 1
--      ORDER BY 1;
--
-- b. Pratinjau — TIDAK mengubah apa pun, aman dicoba berkali-kali:
--      SELECT jsonb_pretty(pratinjau_ganti_nama_penyulang('HILBERON', 'AMPENAN', 'HILBERON AMPENAN'));
--
-- c. Laksanakan (contoh; pakai nama sebenarnya):
--      SELECT jsonb_pretty(ganti_nama_penyulang('HILBERON', 'AMPENAN', 'NAMA BENAR', 'uji'));
--
-- d. Penjaga pendaftaran ganda — HARUS gagal selama HILBERON masih di 2 ULP:
--      SELECT simpan_penyulang('HILBERON', 'TANJUNG');
--
-- e. Riwayat penggantian nama:
--      SELECT pada, entitas_kode AS dari, ulp,
--             nilai_baru ->> 'nama_baru' AS jadi,
--             nilai_baru ->> 'tindakan'  AS tindakan,
--             nilai_baru -> 'berubah'    AS berubah,
--             oleh_nama
--      FROM master_audit WHERE field = 'ganti_nama' ORDER BY pada DESC;
-- =============================================================================
