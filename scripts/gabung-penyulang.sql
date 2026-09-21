-- =============================================================================
-- Gabungkan penyulang ke penyulang yang SUDAH ADA di master
-- Jalankan SESUDAH `ganti-nama-penyulang.sql`. Idempoten.
--
-- ── KENAPA ──────────────────────────────────────────────────────────────────
-- Mencoba mengganti nama HILBERON (AMPENAN) jadi 'OL. KERANDANGAN' ditolak
-- dengan alasan namanya sudah ada di master. Penolakan itu benar — tapi buntu,
-- karena yang diminta memang bukan penggantian nama.
--
-- Duduk perkaranya baru kelihatan setelah datanya diperiksa (21 Sep 2026):
--
--     Master punya 81 penyulang. 48 DI ANTARANYA TANPA SATU GARDU PUN.
--     Sementara 21 nama dipakai gardu tapi tidak ada di master.
--
-- Keduanya sebagian besar BENDA YANG SAMA, tertulis dengan dua kebiasaan
-- penamaan berbeda — master memakai awalan "OL." (outlet), data gardu tidak:
--
--     BATU LAYAR      (33 gardu)  ↔  OL. BATU LAYAR      (0 gardu)
--     UDAYANA         (20 gardu)  ↔  OL. UDAYANA         (0 gardu)
--     OUTLET SHERATON (11 gardu)  ↔  OL. SHERATON        (0 gardu)
--     TANJUNG         ( 6 gardu)  ↔  OL. TANJUNG         (0 gardu)
--     TERONG TAWANG   ( 2 gardu)  ↔  TERONG TAWAH        (0 gardu)   ← salah ketik
--     HILBERON        (29 gardu)  ↔  OL. KERANDANGAN     (0 gardu)   ← menurut Bapak
--
-- Jadi ini bukan kejadian sekali. Menyuruh admin membereskannya lewat ganti
-- nama berarti memaksa 21 keputusan lewat pintu yang salah.
--
-- ── KENAPA TIDAK CUKUP MELONGGARKAN PENJAGA GANTI NAMA ──────────────────────
-- Karena yang terjadi memang berbeda. Ganti nama meninggalkan SATU penyulang
-- dengan nama lain; penggabungan membuat DUA riwayat jadi satu dan tidak bisa
-- dipisah lagi. Menumpangkannya pada tombol ganti nama akan membuat tindakan
-- yang tidak bisa dibatalkan terjadi karena orang salah mengetik nama.
--
-- ── YANG TETAP DITOLAK ──────────────────────────────────────────────────────
-- Penggabungan ketika KEDUA belah pihak sama-sama punya tiang atau segmen.
-- Di situ dua jaringan sungguhan yang dilebur: nama tiangnya memakai dua
-- prefiks berbeda, dan sesudah tercampur tidak ada yang bisa memilahnya lagi.
-- =============================================================================


-- ── 1. Pratinjau yang tahu bedanya ───────────────────────────────────────────
-- `pratinjau_ganti_nama_penyulang` sekarang mengenali keadaan keempat: nama
-- tujuannya SUDAH ADA di master. Dulu itu cuma peringatan buntu; sekarang jadi
-- tindakan 'gabung' beserta hitungan kedua belah pihak.
--
-- Satu pintu pratinjau untuk keempat keadaan, bukan dua fungsi yang dipilih
-- layar: layar yang memilih sendiri harus tahu lebih dulu mana yang berlaku,
-- dan untuk tahu itu dia harus mengulang penilaian yang sudah dikerjakan di
-- sini — dengan aturan yang cepat atau lambat melenceng.

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
  tuj        RECORD;
  lain       BIGINT;
  tindakan   TEXT;
  lingkup    TEXT;
  peringatan TEXT[] := ARRAY[]::TEXT[];
  n_bernama  BIGINT;
  n_tuj_sim  BIGINT := 0;
  n_sum_sim  BIGINT := 0;
BEGIN
  IF lama = '' THEN RAISE EXCEPTION 'Nama penyulang yang mau diganti belum diisi'; END IF;
  IF unit = '' THEN RAISE EXCEPTION 'ULP belum dipilih. Penggantian nama selalu dilingkupi satu ULP.'; END IF;

  SELECT true, ulp INTO terdaftar, ulp_master
  FROM public.penyulang_ref WHERE upper(penyulang) = lama;
  terdaftar := COALESCE(terdaftar, false);

  SELECT COALESCE(sum(baris), 0) INTO lain
  FROM public.sebaran_penyulang(lama) WHERE ulp <> unit;

  SELECT penyulang, ulp, kode_singkat INTO tuj
  FROM public.penyulang_ref WHERE upper(penyulang) = baru;

  -- Empat keadaan, ditentukan DATA — bukan dipilih pemakai. Pemakai yang boleh
  -- memilih akan memilih yang salah persis di saat yang paling merugikan,
  -- karena yang tahu bedanya cuma angka di basis data.
  tindakan := CASE
    WHEN baru <> '' AND tuj.penyulang IS NOT NULL THEN 'gabung'  -- tujuannya sudah ada
    WHEN lain > 0                                 THEN 'pisah'   -- namanya dipakai ULP lain juga
    WHEN terdaftar                                THEN 'ganti'   -- namanya milik ULP ini sendirian
    ELSE                                               'daftar_baru'
  END;
  lingkup := CASE WHEN tindakan = 'ganti' OR (tindakan = 'gabung' AND lain = 0)
                  THEN NULL ELSE unit END;

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
    SELECT 1 FROM public.hitung_pakai_penyulang(lama, lingkup)
    WHERE ikut AND NOT terlingkup AND baris > 0
  ) THEN
    peringatan := peringatan ||
      'Ada tabel yang tidak menyimpan ULP, jadi barisnya tidak bisa dipisah dan tetap memakai nama lama. Rinciannya di daftar "tidak terlingkup".'::TEXT;
  END IF;

  IF tindakan = 'gabung' THEN
    -- Yang menentukan boleh-tidaknya: apakah KEDUA belah pihak sama-sama
    -- memikul jaringan. Kalau ya, yang dilebur dua jaringan sungguhan, dan
    -- nama tiangnya akan memakai dua prefiks berbeda di bawah satu penyulang.
    SELECT COALESCE(sum(baris), 0) INTO n_sum_sim
    FROM public.hitung_pakai_penyulang(lama, lingkup)
    WHERE tabel IN ('tiang', 'segmen', 'tiang_kode_penyulang');

    SELECT COALESCE(sum(baris), 0) INTO n_tuj_sim
    FROM public.hitung_pakai_penyulang(baru, NULL)
    WHERE tabel IN ('tiang', 'segmen', 'tiang_kode_penyulang');

    IF upper(COALESCE(tuj.ulp, '')) <> unit THEN
      peringatan := peringatan || format(
        'TIDAK BISA: "%s" terdaftar di ULP %s, bukan %s. Menggabungkan ke sana berarti memindahkan aset lintas ULP.',
        baru, COALESCE(tuj.ulp, '-'), unit);
    ELSIF n_sum_sim > 0 AND n_tuj_sim > 0 THEN
      peringatan := peringatan || format(
        'TIDAK BISA: keduanya sama-sama punya tiang/segmen (%s dan %s baris). Yang dilebur dua jaringan sungguhan, dan sesudah tercampur tidak ada yang bisa memilahnya lagi.',
        n_sum_sim, n_tuj_sim);
    END IF;

  ELSIF baru <> '' THEN
    IF baru = lama THEN
      peringatan := peringatan || 'Nama barunya sama dengan nama lama.'::TEXT;
    ELSIF EXISTS (SELECT 1 FROM public.sebaran_penyulang(baru)) THEN
      peringatan := peringatan || format(
        'Nama "%s" sudah dipakai baris lain meski belum terdaftar. Pilih nama lain, atau daftarkan dulu yang itu supaya bisa digabung.', baru);
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'nama_lama',  lama,
    'nama_baru',  NULLIF(baru, ''),
    'ulp',        unit,
    'terdaftar',  terdaftar,
    'ulp_master', ulp_master,
    'tindakan',   tindakan,

    -- Keterangan tujuan, hanya saat menggabung: admin perlu melihat dia
    -- menggabung KE APA, bukan cuma bahwa penggabungan akan terjadi.
    'tujuan', CASE WHEN tindakan = 'gabung' THEN jsonb_build_object(
      'penyulang',    tuj.penyulang,
      'ulp',          tuj.ulp,
      'kode_singkat', tuj.kode_singkat,
      'isi', (
        SELECT COALESCE(jsonb_agg(jsonb_build_object('tabel', tabel, 'kolom', kolom, 'baris', baris)
                                  ORDER BY baris DESC), '[]'::jsonb)
        FROM public.hitung_pakai_penyulang(baru, NULL) WHERE ikut AND baris > 0)
    ) ELSE NULL END,

    'berubah', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object('tabel', tabel, 'kolom', kolom, 'baris', baris)
                                ORDER BY baris DESC), '[]'::jsonb)
      FROM public.hitung_pakai_penyulang(lama, lingkup)
      WHERE ikut AND terlingkup AND baris > 0),

    'tidak_terlingkup', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object('tabel', tabel, 'baris', baris, 'alasan', alasan)
                                ORDER BY baris DESC), '[]'::jsonb)
      FROM public.hitung_pakai_penyulang(lama, lingkup)
      WHERE ikut AND NOT terlingkup AND baris > 0),

    'tidak_ikut', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object('tabel', tabel, 'baris', baris, 'alasan', alasan)
                                ORDER BY baris DESC), '[]'::jsonb)
      FROM public.hitung_pakai_penyulang(lama, NULL)
      WHERE NOT ikut AND baris > 0),

    'tetap_ulp_lain', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object('ulp', ulp, 'baris', baris) ORDER BY baris DESC), '[]'::jsonb)
      FROM public.sebaran_penyulang(lama) WHERE ulp <> unit),

    -- Penghalang, terpisah dari peringatan biasa. Layar memakainya untuk
    -- mematikan tombolnya; database tetap menolak sendiri kalau dilewati.
    'terhalang', (
      SELECT COALESCE(bool_or(p LIKE 'TIDAK BISA:%'), false) FROM unnest(peringatan) p),

    'peringatan', to_jsonb(peringatan)
  );
END $fn$;


-- ── 2. Penggabungannya ───────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.gabung_penyulang(
  p_lama   TEXT,
  p_ulp    TEXT,
  p_tujuan TEXT,
  p_oleh   TEXT DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  lama     TEXT := regexp_replace(upper(btrim(COALESCE(p_lama, ''))), '\s+', ' ', 'g');
  tujuan   TEXT := regexp_replace(upper(btrim(COALESCE(p_tujuan, ''))), '\s+', ' ', 'g');
  unit     TEXT := upper(btrim(COALESCE(p_ulp, '')));
  awal     JSONB;
  m        RECORD;
  lain     BIGINT;
  pakai_lingkup BOOLEAN;
  kode_lama TEXT;
  kode_tuj  TEXT;
  dibuang  BOOLEAN := false;
  bawa     TEXT := NULL;
BEGIN
  IF lama = tujuan THEN RAISE EXCEPTION 'Penyulang asal dan tujuannya sama'; END IF;

  PERFORM public.penyulang_wajib_boleh(unit);

  -- Dihitung DI SINI, di transaksi yang sama dengan yang mengubahnya. Angka
  -- yang dikirim layar sudah berumur beberapa detik, dan beberapa detik cukup
  -- untuk satu impor gardu berjalan.
  awal := public.pratinjau_ganti_nama_penyulang(lama, unit, tujuan);

  IF awal ->> 'tindakan' <> 'gabung' THEN
    RAISE EXCEPTION
      'Penyulang "%" tidak ada di master, jadi tidak ada yang bisa digabungi. Pakai Ganti Nama kalau maksudnya memberi nama baru.', tujuan;
  END IF;

  IF (awal ->> 'terhalang')::BOOLEAN THEN
    RAISE EXCEPTION '%', (SELECT string_agg(p ->> 0, ' ') FROM jsonb_array_elements(awal -> 'peringatan') p
                          WHERE p ->> 0 LIKE 'TIDAK BISA:%');
  END IF;

  SELECT COALESCE(sum(baris), 0) INTO lain
  FROM public.sebaran_penyulang(lama) WHERE ulp <> unit;

  -- Nama yang juga dipakai ULP lain hanya boleh dipindah SEBAGIAN — punya ULP
  -- sebelah itu penyulang lain yang kebetulan senama, dan tidak ada urusannya
  -- dengan penggabungan ini.
  pakai_lingkup := lain > 0;

  FOR m IN SELECT * FROM public.penyulang_ikut() WHERE ikut LOOP
    CONTINUE WHEN NOT EXISTS (
      SELECT 1 FROM information_schema.columns c
      WHERE c.table_schema = 'public' AND c.table_name = m.tabel AND c.column_name = m.kolom
    );

    IF NOT pakai_lingkup THEN
      EXECUTE format(
        $q$UPDATE public.%I SET %I = $1 WHERE upper(btrim(coalesce(%I,''))) = $2$q$,
        m.tabel, m.kolom, m.kolom) USING tujuan, lama;
    ELSIF m.kolom_ulp IS NOT NULL THEN
      EXECUTE format(
        $q$UPDATE public.%I SET %I = $1 WHERE upper(btrim(coalesce(%I,''))) = $2 AND upper(coalesce(%I,'')) = $3$q$,
        m.tabel, m.kolom, m.kolom, m.kolom_ulp) USING tujuan, lama, unit;
    END IF;
  END LOOP;

  -- Prefiks nama tiang ikut pindah HANYA kalau tujuannya belum punya. Tujuan
  -- yang sudah punya prefiks berarti dia sudah menamai tiangnya sendiri, dan
  -- menimpanya akan menomori ulang tiang yang tidak ada hubungannya dengan
  -- penggabungan ini.
  SELECT kode_singkat INTO kode_lama FROM public.penyulang_ref WHERE upper(penyulang) = lama;
  SELECT kode_singkat INTO kode_tuj  FROM public.penyulang_ref WHERE upper(penyulang) = tujuan;

  IF kode_lama IS NOT NULL AND kode_tuj IS NULL THEN
    UPDATE public.penyulang_ref SET kode_singkat = kode_lama WHERE upper(penyulang) = tujuan;
    bawa := kode_lama;
  END IF;

  -- Baris master asal dibuang HANYA kalau sudah tidak ada yang memakainya lagi
  -- di mana pun. Kalau ULP sebelah masih memikul namanya, baris itu induknya —
  -- membuangnya akan membuat aset mereka kehilangan induk tanpa ada yang tahu.
  IF EXISTS (SELECT 1 FROM public.penyulang_ref WHERE upper(penyulang) = lama)
     AND NOT EXISTS (SELECT 1 FROM public.sebaran_penyulang(lama)) THEN
    DELETE FROM public.penyulang_ref WHERE upper(penyulang) = lama;
    dibuang := true;
  END IF;

  INSERT INTO public.master_audit
    (entitas, entitas_kode, ulp, field, nilai_lama, nilai_baru, aksi, oleh_uid, oleh_nama)
  VALUES ('penyulang', lama, unit, 'gabung',
          jsonb_build_object('penyulang', lama, 'ulp', unit),
          awal || jsonb_build_object('master_asal_dihapus', dibuang, 'prefiks_dibawa', bawa),
          'sunting_admin', auth.uid(), p_oleh);

  RETURN awal || jsonb_build_object(
    'selesai', true, 'master_asal_dihapus', dibuang, 'prefiks_dibawa', bawa);
END $fn$;


-- ── 3. Hak akses ─────────────────────────────────────────────────────────────

GRANT EXECUTE ON FUNCTION public.pratinjau_ganti_nama_penyulang TO authenticated;
GRANT EXECUTE ON FUNCTION public.gabung_penyulang               TO authenticated;


-- =============================================================================
-- Periksa hasilnya
-- =============================================================================
-- a. Master yang KOSONG — calon tujuan penggabungan. Per 21 Sep 2026: 48 dari 81:
--      SELECT ulp, count(*) FROM penyulang_pakai
--      WHERE gardu = 0 AND tiang_dimiliki = 0 AND segmen = 0
--      GROUP BY ulp ORDER BY ulp;
--
-- b. Pratinjau penggabungan — TIDAK mengubah apa pun:
--      SELECT jsonb_pretty(pratinjau_ganti_nama_penyulang('HILBERON','AMPENAN','OL. KERANDANGAN'));
--
-- c. Laksanakan:
--      SELECT jsonb_pretty(gabung_penyulang('HILBERON','AMPENAN','OL. KERANDANGAN','uji'));
--
-- d. Yang HARUS ditolak — dua jaringan sungguhan dilebur:
--      SELECT gabung_penyulang('SEKOTONG','GERUNG','GUNUNG SARI','uji');
--
-- e. Riwayat penggabungan:
--      SELECT pada, entitas_kode AS dari, ulp, nilai_baru ->> 'nama_baru' AS ke,
--             nilai_baru ->> 'master_asal_dihapus' AS master_dibuang, oleh_nama
--      FROM master_audit WHERE field = 'gabung' ORDER BY pada DESC;
-- =============================================================================
