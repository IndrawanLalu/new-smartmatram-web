-- scripts/jtm-lanjut.sql
--
-- SATU SEGMEN, SATU PENYAPUAN — dan angka yang menyebut kebenaran.
--
-- Ditemukan pada uji lapangan pertama: regu menitik 11 tiang PERUMNAS, menekan
-- Selesai, lalu masuk lagi ke segmen yang sama. `mulai_penyapuan_jtm` hanya
-- menyambung penyapuan berstatus 'Dijadwalkan' atau 'Dalam Proses', jadi yang
-- sudah 'Selesai' tidak disambung — lahirlah penyapuan KEDUA yang kosong.
-- Di layar, angkanya berbunyi "1 dari 12", dan yang terbaca oleh regu bukan
-- "ini penyapuan baru" melainkan "sebelas tiang saya hilang".
--
-- Datanya tidak pernah hilang. Tapi ketakutan itu wajar, dan aplikasi yang
-- membuat orang takut kehilangan pekerjaannya akan ditinggalkan — jadi yang
-- diperbaiki bukan datanya, melainkan perilakunya.
--
-- Dua hal di sini:
--   1. Penyapuan yang sudah dikirim tapi BELUM diputuskan admin disambung,
--      bukan diduplikasi. Yang ditolak juga: kerja yang dikembalikan untuk
--      dibetulkan memang harus dilanjutkan, bukan diulang dari nol.
--   2. Angka yang ditampilkan ke regu dan ke admin memakai CAKUPAN SEGMEN —
--      berapa tiang segmen ini yang sudah pernah dinilai — bukan cuma isi
--      penyapuan yang kebetulan sedang dibuka.
--
-- Prasyarat: jtm-inspeksi-fungsi.sql · jtm-temuan.sql
-- Aman dijalankan berulang.


-- ── 1. Menyambung, bukan menduakan ───────────────────────────────────────────

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

  -- 'Selesai' dan 'Ditolak' ikut disambung. Hanya 'Diverifikasi' yang tidak:
  -- pekerjaan yang sudah diputuskan admin adalah catatan sejarah, dan menambah
  -- isinya belakangan membuat keputusan itu menilai sesuatu yang berbeda dari
  -- yang akhirnya tersimpan.
  SELECT id INTO id_ada FROM public.inspeksi_jtm
  WHERE segmen_id = p_segmen_id AND tier = p_tier
    AND status IN ('Dijadwalkan', 'Dalam Proses', 'Selesai', 'Ditolak')
  ORDER BY created_at DESC
  LIMIT 1;

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

COMMENT ON FUNCTION public.mulai_penyapuan_jtm IS
  'Menyambung penyapuan segmen yang belum diputuskan admin — termasuk yang sudah dikirim dan yang ditolak. Penyapuan kedua di segmen yang sama hanya lahir setelah yang lama diverifikasi.';


-- ── 2. Cakupan segmen: berapa tiangnya yang sudah pernah dinilai ─────────────
-- Dipakai layar regu DAN layar persetujuan. Dihitung dari penyapuan yang belum
-- ditolak — termasuk yang masih berjalan, karena pertanyaan yang dijawabnya
-- adalah "sudah sampai mana", bukan "apa yang sudah disahkan".

CREATE OR REPLACE FUNCTION public.jtm_tiang_tersapu(p_segmen_id UUID)
RETURNS INT
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT count(DISTINCT tk.tiang_id)::int
  FROM public.inspeksi_jtm_titik tk
  JOIN public.inspeksi_jtm m ON m.id = tk.inspeksi_id
  WHERE m.segmen_id = p_segmen_id
    AND m.status <> 'Ditolak'
$$;

COMMENT ON FUNCTION public.jtm_tiang_tersapu IS
  'Jumlah tiang BERBEDA di segmen ini yang sudah pernah dinilai, lintas penyapuan. Inilah angka yang berarti bagi regu; isi satu penyapuan saja tidak.';


-- ── 3. Menyelesaikan: sebut dua angka, jangan satu ───────────────────────────

CREATE OR REPLACE FUNCTION public.selesaikan_penyapuan_jtm(
  p_id      UUID,
  p_nama    TEXT DEFAULT NULL,
  p_catatan TEXT DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  m        RECORD;
  jml_t    INT;
  jml_d    INT;
  jml_seg  INT;
BEGIN
  SELECT * INTO m FROM public.inspeksi_jtm WHERE id = p_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Penyapuan tidak ditemukan'; END IF;
  IF m.status NOT IN ('Dijadwalkan', 'Dalam Proses') THEN
    RAISE EXCEPTION 'Penyapuan sudah berstatus %', m.status;
  END IF;

  SELECT count(*) INTO jml_t FROM public.segmen_tiang WHERE segmen_id = m.segmen_id;
  SELECT count(*) INTO jml_d FROM public.inspeksi_jtm_titik WHERE inspeksi_id = p_id;
  jml_seg := public.jtm_tiang_tersapu(m.segmen_id);

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
    'tiang_segmen',  jml_t,
    'tiang_dinilai', jml_seg,            -- cakupan segmen, bukan isi satu penyapuan
    'sesi_ini',      jml_d,
    'persen', CASE WHEN jml_t > 0 THEN round(100.0 * jml_seg / jml_t, 1) ELSE NULL END
  );
END $$;


-- ── 4. Daftar tiang untuk web ────────────────────────────────────────────────
-- Sampai sekarang tidak ada satu pun layar yang memperlihatkan tiang JTM, jadi
-- regu menitik sepanjang hari tanpa pernah bisa memeriksa hasilnya dari kantor.
-- View ini bukan laporan — dia daftar kerja: mana yang sudah dikonfirmasi
-- lapangan, mana yang sudah dinilai, dan siapa induknya.

DROP VIEW IF EXISTS public.tiang_jtm_daftar;

CREATE VIEW public.tiang_jtm_daftar AS
SELECT
  t.id,
  t.kode,
  t.penyulang,
  t.ulp,
  t.lat, t.lng,
  t.jenis,
  t.konstruksi,
  t.nomor_lama,
  t.penanda,
  t.induk_id,
  i.kode AS induk_kode,
  t.dikonfirmasi_at,
  t.dikonfirmasi_oleh,
  t.sumber,
  t.created_at,
  (SELECT count(*) FROM public.tiang a
    WHERE a.induk_id = t.id AND a.status_hidup = 'aktif')        AS jumlah_anak,
  (SELECT string_agg(s.nama, ' · ' ORDER BY s.nama)
     FROM public.segmen_tiang st
     JOIN public.segmen s ON s.id = st.segmen_id AND s.status = 'aktif'
    WHERE st.tiang_id = t.id)                                    AS segmen,
  (SELECT count(*) FROM public.segmen_tiang st WHERE st.tiang_id = t.id) AS jumlah_segmen,
  (SELECT max(tk.dinilai_at)
     FROM public.inspeksi_jtm_titik tk
     JOIN public.inspeksi_jtm m ON m.id = tk.inspeksi_id AND m.status <> 'Ditolak'
    WHERE tk.tiang_id = t.id)                                    AS terakhir_dinilai
FROM public.tiang t
LEFT JOIN public.tiang i ON i.id = t.induk_id
WHERE t.status_hidup = 'aktif'
  AND t.gardu_kode IS NULL
  AND t.penyulang IS NOT NULL;

COMMENT ON VIEW public.tiang_jtm_daftar IS
  'Daftar tiang JTM beserta induk, segmen, dan kapan terakhir dinilai. Dasar tabel tiang di web.';


-- ── 5. Memindahkan induk tiang dari web ──────────────────────────────────────
-- Topologi yang salah tidak bisa dibetulkan dari lapangan tanpa membongkar
-- tiangnya, jadi harus bisa dibetulkan dari meja. Penamaan ulang SENGAJA tidak
-- ikut: kode tiang sudah tertulis di lembar kerja dan disebut lewat radio, dan
-- mengganti nama diam-diam karena indukya berpindah akan membuat dua orang
-- menyebut tiang yang sama dengan nama berbeda di hari yang sama.

CREATE OR REPLACE FUNCTION public.ubah_induk_tiang_jtm(
  p_tiang_id UUID,
  p_induk_id UUID,
  p_oleh     TEXT DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  t     RECORD;
  induk RECORD;
  -- Kode induk dipegang terpisah, bukan dibaca dari RECORD-nya. RECORD yang
  -- tidak pernah di-SELECT INTO — persis yang terjadi saat induk dikosongkan —
  -- tidak punya bentuk, dan membacanya menggagalkan seluruh pemanggilan.
  v_induk_kode TEXT;
  naik  UUID;
  n     INT := 0;
BEGIN
  SELECT * INTO t FROM public.tiang WHERE id = p_tiang_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Tiang tidak ditemukan'; END IF;

  IF p_induk_id IS NOT NULL THEN
    IF p_induk_id = p_tiang_id THEN
      RAISE EXCEPTION 'Tiang tidak bisa jadi induk bagi dirinya sendiri';
    END IF;

    SELECT * INTO induk FROM public.tiang WHERE id = p_induk_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Tiang induk tidak ditemukan'; END IF;
    v_induk_kode := induk.kode;

    -- Induk tidak harus MILIK penyulang yang sama — justru itulah underbuild:
    -- penyulang berpangkal pada batang milik penyulang lain. Yang disyaratkan
    -- adalah kabel penyulang ini benar-benar LEWAT tiang itu, dan bukti itu ada
    -- pada keanggotaan segmen.
    IF upper(COALESCE(induk.penyulang, '')) <> upper(COALESCE(t.penyulang, ''))
       AND NOT EXISTS (
         SELECT 1 FROM public.segmen_tiang st
         JOIN public.segmen sg ON sg.id = st.segmen_id AND sg.status = 'aktif'
         WHERE st.tiang_id = p_induk_id
           AND upper(sg.penyulang) = upper(COALESCE(t.penyulang, ''))
       ) THEN
      RAISE EXCEPTION
        'Tiang % tidak dilewati penyulang %. Masukkan dulu tiang itu ke segmen penyulang tersebut.',
        induk.kode, t.penyulang;
    END IF;

    -- Lingkaran membuat setiap penelusuran pohon berputar selamanya. Ditolak di
    -- sini, bukan ditemukan nanti sebagai halaman yang menggantung.
    naik := induk.induk_id;
    WHILE naik IS NOT NULL AND n < 500 LOOP
      IF naik = p_tiang_id THEN
        RAISE EXCEPTION 'Tidak bisa: % sudah berada di bawah %', induk.kode, t.kode;
      END IF;
      SELECT induk_id INTO naik FROM public.tiang WHERE id = naik;
      n := n + 1;
    END LOOP;
  END IF;

  INSERT INTO public.master_audit
    (entitas, entitas_kode, ulp, field, nilai_lama, nilai_baru, aksi, oleh_uid, oleh_nama)
  VALUES ('tiang', t.kode, COALESCE(t.ulp, '-'), 'induk_id',
          to_jsonb((SELECT kode FROM public.tiang WHERE id = t.induk_id)),
          to_jsonb(v_induk_kode),
          'koreksi_meja', auth.uid(), p_oleh);

  UPDATE public.tiang SET induk_id = p_induk_id, updated_at = now()
  WHERE id = p_tiang_id;

  RETURN jsonb_build_object('kode', t.kode, 'induk', v_induk_kode);
END $$;


GRANT SELECT  ON public.tiang_jtm_daftar          TO authenticated;
GRANT EXECUTE ON FUNCTION public.jtm_tiang_tersapu     TO authenticated;
GRANT EXECUTE ON FUNCTION public.ubah_induk_tiang_jtm  TO authenticated;


-- ── 6. Cabang yang dinyatakan regu, bukan ditebak sistem ─────────────────────
--
-- Dilaporkan dari lapangan: PRM-008 bercabang ke utara, tapi tiang cabangnya
-- dinamai PRM-009 — meneruskan deret, bukan `PRM-008_A1`.
--
-- Bukan kekeliruan hitung. Pada tiang cabang yang PERTAMA, induknya belum punya
-- anak lain, jadi tidak ada satu pun keterangan di data yang membedakan "jalur
-- diteruskan" dari "jalur pecah di sini". Aturan belok >45° baru bisa bekerja
-- pada cabang KEDUA dan seterusnya. Yang tahu sejak awal hanya orang yang
-- berdiri di bawahnya dan melihat kabelnya berpisah — jadi dialah yang
-- ditanya, bukan ditebak.

ALTER TABLE public.tiang
  ADD COLUMN IF NOT EXISTS cabang_baru BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN public.tiang.cabang_baru IS
  'Regu menyatakan tiang ini memulai cabang baru. Dibaca pemicu penamaan; tidak bisa disimpulkan dari data karena pada cabang pertama induknya belum punya anak lain.';

-- Menggantikan yang di `jtm-schema.sql` — satu baris berbeda, ditandai di sana.
CREATE OR REPLACE FUNCTION public.tiang_buat_kode_jtm()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  induk      RECORD;
  hulu       RECORD;
  naik       RECORD;
  anak       RECORD;
  ada_anak   BOOLEAN;
  lurus      BOOLEAN;
  belok      DOUBLE PRECISION;
  arah_lama  DOUBLE PRECISION;
  pokok_kode TEXT;
  prefiks    TEXT;
  singkat    TEXT;
  nomor_maks INT;
  arah_baru  DOUBLE PRECISION;
  arah_anak  DOUBLE PRECISION;
  selisih    DOUBLE PRECISION;
  huruf      TEXT;
  pokok      BOOLEAN;
BEGIN
  IF NEW.kode IS NOT NULL AND btrim(NEW.kode) <> '' THEN
    RETURN NEW;                                   -- nama manual dihormati
  END IF;
  IF NEW.penyulang IS NULL OR NEW.gardu_kode IS NOT NULL THEN
    RETURN NEW;                                   -- bukan tiang JTM
  END IF;

  singkat := public.kode_singkat_penyulang(NEW.penyulang, NEW.ulp);
  IF singkat IS NULL THEN
    RAISE EXCEPTION 'Penyulang "%" tidak bisa dibuatkan kode singkat', NEW.penyulang;
  END IF;

  -- `feeder` kolom lama yang dipakai layer Peta Aset. Diisi sekalian supaya
  -- tidak lahir dua kosakata untuk benda yang sama.
  IF NEW.feeder IS NULL THEN NEW.feeder := NEW.penyulang; END IF;

  -- (a) Pangkal penyulang.
  IF NEW.induk_id IS NULL THEN
    prefiks := singkat || '-';
    SELECT COALESCE(max((regexp_match(kode, '([0-9]+)[a-z]?$'))[1]::int), 0)
      INTO nomor_maks
    FROM public.tiang
    WHERE upper(COALESCE(penyulang, '')) = upper(NEW.penyulang)
      AND status_hidup = 'aktif'
      AND kode ~ ('^' || prefiks || '[0-9]+$');
    NEW.kode := prefiks || lpad((nomor_maks + 1)::text, 3, '0');
    RETURN NEW;
  END IF;

  SELECT * INTO induk FROM public.tiang WHERE id = NEW.induk_id;
  IF NOT FOUND THEN RETURN NEW; END IF;

  arah_baru := public.arah_derajat(induk.lat, induk.lng, NEW.lat, NEW.lng);

  SELECT * INTO anak
  FROM public.tiang
  WHERE induk_id = induk.id AND status_hidup = 'aktif'
  ORDER BY created_at
  LIMIT 1;
  ada_anak := FOUND;

  -- (d) Sisipan: sudah ada anak yang menuju arah yang hampir sama, jadi tiang
  --     ini berdiri DI ANTARA induk dan anak itu — bukan cabang baru.
  IF ada_anak AND arah_baru IS NOT NULL THEN
    arah_anak := public.arah_derajat(induk.lat, induk.lng, anak.lat, anak.lng);
    IF arah_anak IS NOT NULL THEN
      selisih := abs(arah_baru - arah_anak);
      IF selisih > 180 THEN selisih := 360 - selisih; END IF;
      IF selisih <= 45 THEN
        SELECT COALESCE(max(substring(kode from '([a-z])$')), '') INTO huruf
        FROM public.tiang
        WHERE upper(COALESCE(penyulang, '')) = upper(NEW.penyulang)
          AND status_hidup = 'aktif'
          AND kode ~ ('^' || induk.kode || '[a-z]$');
        NEW.kode := induk.kode || CASE
          WHEN huruf = '' THEN 'a'
          ELSE chr(ascii(huruf) + 1)
        END;
        RETURN NEW;
      END IF;
    END IF;
  END IF;

  -- Di percabangan, yang LURUS meneruskan deret; yang membelok jadi cabang.
  --
  -- Tanpa aturan ini, yang menentukan siapa "jalur utama" cuma urutan
  -- pencatatan. Terbukti di impor sungguhan: Sheet menuliskan tujuh tiang
  -- lateral ('3 L1'..'3 L7') sebelum melanjutkan jalur utamanya, jadi lateral
  -- itulah yang menyandang nomor pokok dan SELURUH jalur utama sesudahnya —
  -- lebih dari dua ratus tiang — terlempar jadi cabang. Namanya tetap pendek
  -- dan unik, tapi penyulangnya jadi terbaca seolah trunk-nya sebuah cabang.
  lurus := false;
  IF ada_anak AND arah_baru IS NOT NULL AND induk.induk_id IS NOT NULL THEN
    SELECT * INTO hulu FROM public.tiang WHERE id = induk.induk_id;
    IF FOUND THEN
      arah_lama := public.arah_derajat(hulu.lat, hulu.lng, induk.lat, induk.lng);
      IF arah_lama IS NOT NULL THEN
        belok := abs(arah_baru - arah_lama);
        IF belok > 180 THEN belok := 360 - belok; END IF;
        -- Anak PERTAMA selalu meneruskan deret, apa pun arahnya — dan di data
        -- survei anak pertama sering justru lateral, karena begitulah urutan
        -- pencatatannya. Jadi jalur yang lurus TETAP diberi deret meski sudah
        -- ada saudara di deret yang sama: deretnya bukan janji bahwa jalurnya
        -- tunggal, cuma penomoran yang berjalan. Huruf disimpan untuk yang
        -- benar-benar membelok.
        lurus := belok <= 45;
      END IF;
    END IF;
  END IF;

  -- `cabang_baru` adalah PERMINTAAN REGU, dan dia menang atas tebakan mana pun
  -- di atas. Alasannya sederhana: pada tiang cabang yang PERTAMA, induknya belum
  -- punya anak lain, jadi tidak ada satu pun keterangan di data yang bisa
  -- membedakan "cabang baru" dari "jalur diteruskan". Yang tahu cuma orang yang
  -- berdiri di bawahnya dan melihat kabelnya berpisah.
  IF (NOT ada_anak OR lurus) AND NOT COALESCE(NEW.cabang_baru, false) THEN
    -- (b) Jalur yang sama diteruskan. 'MTR-005' → prefiks 'MTR-' ;
    --     'MTR-005_B1' → prefiks 'MTR-005_B'.
    prefiks := regexp_replace(induk.kode, '[0-9]+[a-z]?$', '');
  ELSE
    -- (c) Induknya sudah punya anak → di sinilah jalurnya benar-benar pecah.
    --
    --     CABANG HANYA SATU TINGKAT. Kalau cabang boleh bersarang, namanya
    --     menumpuk sepanjang jalurnya: pada impor 250 tiang sungguhan muncul
    --     `GNN-003_A47_A15_A35_A8_A3_A2_B22_A5_A10_A25_A3` — 46 huruf, tidak
    --     bisa dibaca di HP dan tidak bisa disebut lewat radio. Jadi cabang
    --     selalu digantungkan pada NOMOR POKOK terdekat di hulunya, bukan pada
    --     kode induk apa adanya. Bentuknya tetap seperti yang diminta:
    --     MTR-005_B1. Susunan pohon yang sebenarnya tidak hilang — dia ada di
    --     `induk_id`, bukan di nama.
    pokok_kode := induk.kode;
    naik := induk;
    WHILE pokok_kode !~ ('^' || singkat || '-[0-9]+$') AND naik.induk_id IS NOT NULL LOOP
      SELECT * INTO naik FROM public.tiang WHERE id = naik.induk_id;
      EXIT WHEN NOT FOUND;
      pokok_kode := naik.kode;
    END LOOP;
    -- Jalur yang pangkalnya sendiri bukan nomor pokok (mis. hasil impor yang
    -- terputus) tetap dapat nama — dipakai kode induk apa adanya.
    IF pokok_kode !~ ('^' || singkat || '-[0-9]+$') THEN
      pokok_kode := induk.kode;
    END IF;

    -- Huruf dari arah mata angin nyata; kalau sudah terpakai di titik cabang
    -- yang sama, maju ke huruf berikutnya supaya tidak ada nama kembar.
    huruf := COALESCE(public.arah_huruf(arah_baru), 'K');
    WHILE EXISTS (
      SELECT 1 FROM public.tiang
      WHERE upper(COALESCE(penyulang, '')) = upper(NEW.penyulang)
        AND status_hidup = 'aktif'
        AND kode ~ ('^' || pokok_kode || '_' || huruf || '[0-9]+[a-z]?$')
    ) LOOP
      huruf := chr(ascii(huruf) + 1);
      EXIT WHEN huruf > 'Z';
    END LOOP;

    prefiks := pokok_kode || '_' || huruf;
  END IF;

  -- Deret pokok (langsung di belakang kode singkat) dinomori tiga angka supaya
  -- urut terbaca; deret cabang tidak — 'MTR-005_B1' lebih enak dibaca daripada
  -- 'MTR-005_B001'.
  pokok := prefiks = singkat || '-';

  SELECT COALESCE(max((regexp_match(kode, '([0-9]+)[a-z]?$'))[1]::int), 0)
    INTO nomor_maks
  FROM public.tiang
  WHERE upper(COALESCE(penyulang, '')) = upper(NEW.penyulang)
    AND status_hidup = 'aktif'
    AND kode ~ ('^' || prefiks || '[0-9]+[a-z]?$');

  NEW.kode := prefiks || CASE
    WHEN pokok THEN lpad((nomor_maks + 1)::text, 3, '0')
    ELSE (nomor_maks + 1)::text
  END;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_tiang_buat_kode_jtm ON public.tiang;
CREATE TRIGGER trg_tiang_buat_kode_jtm
  BEFORE INSERT ON public.tiang
  FOR EACH ROW EXECUTE FUNCTION public.tiang_buat_kode_jtm();


-- Menggantikan yang di `jtm-inspeksi-fungsi.sql`: satu parameter bertambah,
-- jadi harus di-DROP dulu — CREATE OR REPLACE tidak bisa mengubah jumlah
-- argumen, dan membiarkan dua-duanya hidup membuat PostgREST memilih sendiri
-- yang mana yang dipanggil.
DROP FUNCTION IF EXISTS public.tambah_tiang_jtm(
  UUID, DOUBLE PRECISION, DOUBLE PRECISION, DOUBLE PRECISION,
  UUID, TEXT, TEXT, TEXT, TEXT);

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
  p_cabang     BOOLEAN DEFAULT false
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
     cabang_baru, sumber, status_hidup, dikonfirmasi_at, dikonfirmasi_oleh)
  VALUES (s.penyulang, s.ulp, p_lat, p_lng,
          NULLIF(btrim(COALESCE(p_jenis, '')), ''),
          NULLIF(btrim(COALESCE(p_konstruksi, '')), ''),
          NULLIF(btrim(COALESCE(p_nomor_lama, '')), ''),
          induk, COALESCE(p_cabang, false), 'lapangan', 'aktif', now(), p_nama)
  RETURNING id, kode INTO id_baru, kode_baru;

  INSERT INTO public.segmen_tiang (segmen_id, tiang_id, posisi, sumber)
  VALUES (p_segmen_id, id_baru, 'atas', 'lapangan')
  ON CONFLICT DO NOTHING;

  RETURN jsonb_build_object('id', id_baru, 'kode', kode_baru, 'induk_id', induk);
END $$;


GRANT EXECUTE ON FUNCTION public.tambah_tiang_jtm TO authenticated;
