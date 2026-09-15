-- scripts/jtm-nama.sql
--
-- SATU BATANG BETON, SATU NAMA DI TIAP PENYULANG YANG MELEWATINYA.
--
-- Tiang pertama PERUMNAS kebetulan tiang milik GUNUNG SARI. Batangnya satu,
-- tapi regu PERUMNAS menyebutnya PRM-001 dan regu GUNUNG SARI menyebutnya
-- GNN-001 — dan keduanya benar, karena yang dinomori bukan batangnya melainkan
-- urutan tiang di sepanjang penyulang masing-masing.
--
-- KENAPA BUKAN MENAMBAH BARIS DI `tiang`: kalau underbuild melahirkan baris
-- tiang kedua, panjang rute langsung terhitung dua kali dan tidak ada satu pun
-- galat yang muncul — angkanya cuma jadi lebih panjang dari kenyataan. Itu
-- keputusan terkunci nomor 7, dan berkas ini tidak menyentuhnya: jumlah tiang
-- tetap dihitung dari identitas batangnya (`segmen_tiang.tiang_id`), bukan dari
-- berapa nama yang dia punya.
--
-- PENOMORAN MENGIKUTI RUTE, BUKAN URUTAN PENCATATAN. Tiang pertama sebuah
-- penyulang adalah tiang pertama menurut jalurnya — walaupun batangnya milik
-- penyulang lain. Itulah sebabnya ada `nomori_ulang_penyulang_jtm` di bawah.
--
-- Prasyarat: jtm-schema.sql · jtm-lanjut.sql
-- Aman dijalankan berulang.


-- ── 1. Nama tiang per penyulang ──────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.tiang_kode_penyulang (
  tiang_id  UUID NOT NULL REFERENCES public.tiang(id) ON DELETE CASCADE,
  penyulang TEXT NOT NULL,
  ulp       TEXT NOT NULL,
  kode      TEXT NOT NULL,

  -- Penyulang PEMILIK (konduktor paling atas). Tetap ditandai karena
  -- `tiang.kode` dan indeks uniknya bergantung padanya — tapi TIDAK dipakai
  -- memilih nama mana yang ditampilkan: tiap layar menyebut nama sesuai
  -- penyulang yang sedang dilihatnya.
  utama BOOLEAN NOT NULL DEFAULT false,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (tiang_id, penyulang)
);

CREATE UNIQUE INDEX IF NOT EXISTS tiang_kode_penyulang_unik
  ON public.tiang_kode_penyulang (upper(ulp), upper(penyulang), upper(kode));

CREATE INDEX IF NOT EXISTS tiang_kode_penyulang_idx
  ON public.tiang_kode_penyulang (penyulang, ulp);

COMMENT ON TABLE public.tiang_kode_penyulang IS
  'Nama tiang di tiap penyulang yang melewatinya. Satu batang beton bisa punya beberapa nama; jumlah tiang tetap dihitung dari identitas batangnya, bukan dari namanya.';


-- ── 2. Nomor berikutnya di sebuah penyulang ──────────────────────────────────
-- Dipakai saat tiang MASUK segmen penyulang yang belum menamainya.

CREATE OR REPLACE FUNCTION public.jtm_kode_penyulang_baru(
  p_tiang_id  UUID,
  p_penyulang TEXT,
  p_ulp       TEXT
) RETURNS TEXT
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  singkat    TEXT;
  naik       UUID;
  induk_kode TEXT;
  prefiks    TEXT;
  nomor_maks INT;
  pokok      BOOLEAN;
  n          INT := 0;
BEGIN
  singkat := public.kode_singkat_penyulang(p_penyulang, p_ulp);
  IF singkat IS NULL THEN RETURN NULL; END IF;

  -- Leluhur TERDEKAT yang juga bernama di penyulang ini. Dicari naik lewat
  -- `induk_id`, bukan lewat keanggotaan segmen: yang menentukan urutan tiang
  -- adalah jalurnya, dan jalur itu ada di pohon induk.
  SELECT induk_id INTO naik FROM public.tiang WHERE id = p_tiang_id;
  WHILE naik IS NOT NULL AND n < 500 LOOP
    SELECT k.kode INTO induk_kode
    FROM public.tiang_kode_penyulang k
    WHERE k.tiang_id = naik AND upper(k.penyulang) = upper(p_penyulang);
    EXIT WHEN induk_kode IS NOT NULL;

    SELECT induk_id INTO naik FROM public.tiang WHERE id = naik;
    n := n + 1;
  END LOOP;

  -- Tidak ada leluhur yang bernama di penyulang ini → dialah tiang PERTAMA
  -- penyulang ini, apa pun penyulang pemilik batangnya.
  IF induk_kode IS NULL THEN
    prefiks := singkat || '-';
  ELSE
    prefiks := regexp_replace(induk_kode, '[0-9]+[a-z]?$', '');
  END IF;

  pokok := prefiks = singkat || '-';

  SELECT COALESCE(max((regexp_match(kode, '([0-9]+)[a-z]?$'))[1]::int), 0)
    INTO nomor_maks
  FROM public.tiang_kode_penyulang
  WHERE upper(penyulang) = upper(p_penyulang)
    AND upper(ulp) = upper(p_ulp)
    AND kode ~ ('^' || prefiks || '[0-9]+[a-z]?$');

  RETURN prefiks || CASE
    WHEN pokok THEN lpad((nomor_maks + 1)::text, 3, '0')
    ELSE (nomor_maks + 1)::text
  END;
END $$;

COMMENT ON FUNCTION public.jtm_kode_penyulang_baru IS
  'Nomor tiang berikutnya di sebuah penyulang, diteruskan dari leluhur terdekat yang bernama di penyulang itu. Tanpa leluhur bernama = tiang pertama penyulang tersebut.';


-- ── 3. Nama pemilik ikut tercatat di sini ────────────────────────────────────
-- `tiang.kode` tetap ada — indeks unik dan pemicu penamaan bergantung padanya —
-- tapi mulai sekarang dia ACUAN INTERNAL. Yang ditampilkan layar selalu datang
-- dari tabel ini, supaya cuma ada satu tempat yang menjawab "tiang ini disebut
-- apa di penyulang X".

CREATE OR REPLACE FUNCTION public.jtm_cermin_kode_pemilik()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.penyulang IS NULL OR NEW.kode IS NULL OR NEW.gardu_kode IS NOT NULL THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.tiang_kode_penyulang (tiang_id, penyulang, ulp, kode, utama)
  VALUES (NEW.id, NEW.penyulang, COALESCE(NEW.ulp, '-'), NEW.kode, true)
  ON CONFLICT (tiang_id, penyulang) DO UPDATE
    SET kode = EXCLUDED.kode, utama = true, updated_at = now();

  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_jtm_cermin_kode_pemilik ON public.tiang;
CREATE TRIGGER trg_jtm_cermin_kode_pemilik
  AFTER INSERT OR UPDATE OF kode, penyulang ON public.tiang
  FOR EACH ROW EXECUTE FUNCTION public.jtm_cermin_kode_pemilik();


-- ── 4. Menumpang = langsung dapat nama ───────────────────────────────────────
-- Dipicu keanggotaan segmen, bukan dipanggil aplikasi. Alasannya: keanggotaan
-- segmen ITULAH yang berarti "kabel penyulang ini lewat tiang itu", dan kalau
-- pemberian namanya diserahkan ke aplikasi, satu jalur masuk yang lupa
-- memanggilnya akan melahirkan tiang tanpa nama yang baru ketahuan di lapangan.

CREATE OR REPLACE FUNCTION public.jtm_namai_saat_menumpang()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  s    RECORD;
  kode TEXT;
BEGIN
  SELECT penyulang, ulp INTO s FROM public.segmen WHERE id = NEW.segmen_id;
  IF NOT FOUND THEN RETURN NEW; END IF;

  IF EXISTS (
    SELECT 1 FROM public.tiang_kode_penyulang
    WHERE tiang_id = NEW.tiang_id AND upper(penyulang) = upper(s.penyulang)
  ) THEN
    RETURN NEW;                                   -- sudah punya nama di sini
  END IF;

  kode := public.jtm_kode_penyulang_baru(NEW.tiang_id, s.penyulang, s.ulp);
  IF kode IS NULL THEN RETURN NEW; END IF;

  INSERT INTO public.tiang_kode_penyulang (tiang_id, penyulang, ulp, kode, utama)
  VALUES (NEW.tiang_id, s.penyulang, s.ulp, kode, false)
  ON CONFLICT DO NOTHING;

  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_jtm_namai_saat_menumpang ON public.segmen_tiang;
CREATE TRIGGER trg_jtm_namai_saat_menumpang
  AFTER INSERT ON public.segmen_tiang
  FOR EACH ROW EXECUTE FUNCTION public.jtm_namai_saat_menumpang();


-- ── 5. Isi awal dari data yang sudah ada ─────────────────────────────────────

INSERT INTO public.tiang_kode_penyulang (tiang_id, penyulang, ulp, kode, utama)
SELECT t.id, t.penyulang, COALESCE(t.ulp, '-'), t.kode, true
FROM public.tiang t
WHERE t.penyulang IS NOT NULL AND t.kode IS NOT NULL
  AND t.gardu_kode IS NULL AND t.status_hidup = 'aktif'
ON CONFLICT (tiang_id, penyulang) DO NOTHING;

-- Tiang yang sudah terlanjur menumpang segmen penyulang lain sebelum berkas ini
-- ada. Diberi nomor bebas berikutnya — BUKAN nomor yang benar menurut rute.
-- Merapikannya lewat `nomori_ulang_penyulang_jtm`, sesudah topologinya betul.
DO $$
DECLARE r RECORD; kode TEXT;
BEGIN
  FOR r IN
    SELECT st.tiang_id, s.penyulang, s.ulp
    FROM public.segmen_tiang st
    JOIN public.segmen s ON s.id = st.segmen_id AND s.status = 'aktif'
    WHERE NOT EXISTS (
      SELECT 1 FROM public.tiang_kode_penyulang k
      WHERE k.tiang_id = st.tiang_id AND upper(k.penyulang) = upper(s.penyulang)
    )
    ORDER BY s.penyulang, st.created_at
  LOOP
    kode := public.jtm_kode_penyulang_baru(r.tiang_id, r.penyulang, r.ulp);
    IF kode IS NOT NULL THEN
      INSERT INTO public.tiang_kode_penyulang (tiang_id, penyulang, ulp, kode, utama)
      VALUES (r.tiang_id, r.penyulang, r.ulp, kode, false)
      ON CONFLICT DO NOTHING;
    END IF;
  END LOOP;
END $$;


-- ── 6. Mengganti nama satu tiang ─────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.ubah_kode_tiang_jtm(
  p_tiang_id  UUID,
  p_penyulang TEXT,
  p_kode      TEXT,
  p_oleh      TEXT DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  k     RECORD;
  t     RECORD;
  v_baru TEXT := upper(btrim(COALESCE(p_kode, '')));
BEGIN
  IF v_baru = '' THEN RAISE EXCEPTION 'Nama tiang tidak boleh kosong'; END IF;

  SELECT * INTO k FROM public.tiang_kode_penyulang
  WHERE tiang_id = p_tiang_id AND upper(penyulang) = upper(p_penyulang);
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Tiang ini belum punya nama di penyulang %', p_penyulang;
  END IF;
  IF upper(k.kode) = v_baru THEN
    RETURN jsonb_build_object('kode', k.kode, 'berubah', false);
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.tiang_kode_penyulang x
    WHERE upper(x.ulp) = upper(k.ulp)
      AND upper(x.penyulang) = upper(k.penyulang)
      AND upper(x.kode) = v_baru
  ) THEN
    RAISE EXCEPTION 'Nama % sudah dipakai tiang lain di penyulang %', v_baru, k.penyulang;
  END IF;

  SELECT * INTO t FROM public.tiang WHERE id = p_tiang_id;

  INSERT INTO public.master_audit
    (entitas, entitas_kode, ulp, field, nilai_lama, nilai_baru, aksi, oleh_uid, oleh_nama)
  VALUES ('tiang', k.kode, k.ulp, 'kode/' || k.penyulang,
          to_jsonb(k.kode), to_jsonb(v_baru), 'koreksi_meja', auth.uid(), p_oleh);

  UPDATE public.tiang_kode_penyulang
  SET kode = v_baru, updated_at = now()
  WHERE tiang_id = p_tiang_id AND upper(penyulang) = upper(p_penyulang);

  -- Nama pemilik ikut ke `tiang.kode`: di situlah indeks unik dan seluruh
  -- rujukan lama berada. Dua tempat, tapi satu arah — tabel nama yang memimpin.
  IF k.utama THEN
    UPDATE public.tiang SET kode = v_baru, updated_at = now() WHERE id = p_tiang_id;
  END IF;

  RETURN jsonb_build_object('kode', v_baru, 'lama', k.kode, 'berubah', true);
END $$;


-- ── 7. Menomori ulang satu penyulang menurut rutenya ─────────────────────────
--
-- ⚠ MENGGANTI NAMA TIANG YANG SUDAH TERCATAT. Aman selama nama itu belum
-- terpasang sebagai papan nomor dan belum pernah disebut di laporan gangguan.
-- Sesudahnya, alat ini berbahaya — karena itu dia menuntut pemanggilan tegas,
-- bukan berjalan sendiri.
--
-- Diperlukan karena penomoran mengikuti RUTE, sementara nama terlanjur lahir
-- mengikuti URUTAN PENCATATAN. Tiang pertama PERUMNAS ternyata batang milik
-- GUNUNG SARI yang dititik belakangan; tanpa penomoran ulang, dia selamanya
-- memegang nomor terakhir padahal berdiri paling depan.

CREATE OR REPLACE FUNCTION public.nomori_ulang_penyulang_jtm(
  p_penyulang TEXT,
  p_ulp       TEXT,
  p_oleh      TEXT DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  singkat    TEXT;
  r          RECORD;
  v_prefiks  TEXT;
  v_kode     TEXT;
  induk_kode TEXT;
  pokok_kode TEXT;
  huruf      TEXT;
  arah       DOUBLE PRECISION;
  n_ubah     INT := 0;
  n_total    INT := 0;
BEGIN
  singkat := public.kode_singkat_penyulang(p_penyulang, p_ulp);
  IF singkat IS NULL THEN RAISE EXCEPTION 'Penyulang % tidak dikenal', p_penyulang; END IF;

  -- Nama sementara lebih dulu. Tanpa ini, menggeser PRM-001 jadi PRM-002
  -- bertabrakan dengan PRM-002 yang masih hidup — dan yang gagal bukan
  -- barisnya saja, melainkan seluruh penomoran.
  UPDATE public.tiang_kode_penyulang
  SET kode = '~' || left(tiang_id::text, 8) || '~'
  WHERE upper(penyulang) = upper(p_penyulang) AND upper(ulp) = upper(p_ulp);

  -- `tiang.kode` ikut dikosongkan sementara. Indeks uniknya berdiri di tabel
  -- itu juga, jadi kalau cuma tabel nama yang disingkirkan, menggeser KKC-001
  -- jadi KKC-002 tetap bertabrakan dengan KKC-002 yang masih hidup di sana.
  UPDATE public.tiang
  SET kode = '~' || left(id::text, 8) || '~'
  WHERE upper(COALESCE(penyulang, '')) = upper(p_penyulang)
    AND upper(COALESCE(ulp, '')) = upper(p_ulp)
    AND status_hidup = 'aktif';

  -- Urutan rute: menyusur pohon dari pangkal, anak tertua lebih dulu.
  FOR r IN
    WITH RECURSIVE bernama AS (
      SELECT k.tiang_id, t.induk_id, t.created_at, t.lat, t.lng
      FROM public.tiang_kode_penyulang k
      JOIN public.tiang t ON t.id = k.tiang_id
      WHERE upper(k.penyulang) = upper(p_penyulang) AND upper(k.ulp) = upper(p_ulp)
    ),
    -- Pangkal = tiang yang leluhur langsungnya tidak ikut bernama di penyulang
    -- ini. Untuk penyulang yang menumpang, pangkalnya memang tiang milik orang.
    jalur AS (
      SELECT b.tiang_id, b.induk_id, ARRAY[b.created_at] AS urut, 0 AS dalam
      FROM bernama b
      WHERE b.induk_id IS NULL
         OR NOT EXISTS (SELECT 1 FROM bernama x WHERE x.tiang_id = b.induk_id)
      UNION ALL
      SELECT a.tiang_id, a.induk_id, j.urut || a.created_at, j.dalam + 1
      FROM bernama a
      JOIN jalur j ON a.induk_id = j.tiang_id
      WHERE j.dalam < 2000
    )
    SELECT j.tiang_id, t.induk_id, t.lat, t.lng
    FROM jalur j JOIN public.tiang t ON t.id = j.tiang_id
    ORDER BY j.urut
  LOOP
    n_total := n_total + 1;

    SELECT k.kode INTO induk_kode
    FROM public.tiang_kode_penyulang k
    WHERE k.tiang_id = r.induk_id
      AND upper(k.penyulang) = upper(p_penyulang)
      AND k.kode NOT LIKE '~%';

    IF induk_kode IS NULL THEN
      v_prefiks := singkat || '-';                -- pangkal penyulang ini
    ELSIF EXISTS (
      -- Induknya sudah punya anak yang dinomori pada putaran ini → jalurnya
      -- pecah di situ. Cabang digantung pada nomor pokok terdekat supaya
      -- namanya tidak menumpuk sepanjang jalurnya.
      SELECT 1 FROM public.tiang a
      JOIN public.tiang_kode_penyulang ka ON ka.tiang_id = a.id
        AND upper(ka.penyulang) = upper(p_penyulang)
      WHERE a.induk_id = r.induk_id AND a.id <> r.tiang_id AND ka.kode NOT LIKE '~%'
    ) THEN
      pokok_kode := induk_kode;
      IF pokok_kode !~ ('^' || singkat || '-[0-9]+$') THEN
        pokok_kode := regexp_replace(pokok_kode, '_.*$', '');
      END IF;
      arah := public.arah_derajat(
        (SELECT lat FROM public.tiang WHERE id = r.induk_id),
        (SELECT lng FROM public.tiang WHERE id = r.induk_id), r.lat, r.lng);
      huruf := COALESCE(public.arah_huruf(arah), 'K');
      v_prefiks := pokok_kode || '_' || huruf;
    ELSE
      v_prefiks := regexp_replace(induk_kode, '[0-9]+[a-z]?$', '');
    END IF;

    SELECT v_prefiks || CASE
      WHEN v_prefiks = singkat || '-'
        THEN lpad((COALESCE(max((regexp_match(kode, '([0-9]+)[a-z]?$'))[1]::int), 0) + 1)::text, 3, '0')
      ELSE (COALESCE(max((regexp_match(kode, '([0-9]+)[a-z]?$'))[1]::int), 0) + 1)::text
    END INTO v_kode
    FROM public.tiang_kode_penyulang
    WHERE upper(penyulang) = upper(p_penyulang) AND upper(ulp) = upper(p_ulp)
      AND kode ~ ('^' || v_prefiks || '[0-9]+[a-z]?$');

    UPDATE public.tiang_kode_penyulang
    SET kode = v_kode, updated_at = now()
    WHERE tiang_id = r.tiang_id AND upper(penyulang) = upper(p_penyulang);

    UPDATE public.tiang SET kode = v_kode, updated_at = now()
    WHERE id = r.tiang_id
      AND upper(COALESCE(penyulang, '')) = upper(p_penyulang);

    n_ubah := n_ubah + 1;
  END LOOP;

  -- Tiang yang tidak terjangkau penyusuran — pohonnya terputus. Dikembalikan
  -- nomor apa adanya supaya tidak ada yang tertinggal bernama '~'.
  FOR r IN
    SELECT tiang_id FROM public.tiang_kode_penyulang
    WHERE upper(penyulang) = upper(p_penyulang) AND upper(ulp) = upper(p_ulp)
      AND kode LIKE '~%'
  LOOP
    v_kode := public.jtm_kode_penyulang_baru(r.tiang_id, p_penyulang, p_ulp);
    UPDATE public.tiang_kode_penyulang SET kode = v_kode, updated_at = now()
    WHERE tiang_id = r.tiang_id AND upper(penyulang) = upper(p_penyulang);
    UPDATE public.tiang SET kode = v_kode WHERE id = r.tiang_id
      AND upper(COALESCE(penyulang, '')) = upper(p_penyulang);
    n_ubah := n_ubah + 1;
  END LOOP;

  INSERT INTO public.master_audit
    (entitas, entitas_kode, ulp, field, nilai_lama, nilai_baru, aksi, oleh_uid, oleh_nama)
  VALUES ('penyulang', upper(p_penyulang), upper(p_ulp), 'nomor_tiang',
          to_jsonb(n_total), to_jsonb(n_ubah), 'nomor_ulang', auth.uid(), p_oleh);

  RETURN jsonb_build_object('penyulang', p_penyulang, 'tiang', n_total, 'diubah', n_ubah);
END $$;

COMMENT ON FUNCTION public.nomori_ulang_penyulang_jtm IS
  'Menomori ulang seluruh tiang sebuah penyulang menurut rutenya. MENGGANTI NAMA YANG SUDAH TERCATAT — panggil hanya dengan persetujuan tegas.';


-- ── 8. Daftar tiang: semua namanya ikut ──────────────────────────────────────

DROP VIEW IF EXISTS public.tiang_jtm_daftar;

CREATE VIEW public.tiang_jtm_daftar AS
SELECT
  t.id,
  t.kode,
  -- Di layar tanpa konteks penyulang, menyebut salah satu nama saja berarti
  -- menebak. Semua namanya disebut sekaligus — dan itu juga yang akan tertulis
  -- di papan nomor tiang yang dipikul dua penyulang.
  COALESCE(
    (SELECT string_agg(k.kode, ' / ' ORDER BY k.utama DESC, k.penyulang)
       FROM public.tiang_kode_penyulang k WHERE k.tiang_id = t.id),
    t.kode) AS semua_kode,
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
  (SELECT count(*) FROM public.tiang_kode_penyulang k WHERE k.tiang_id = t.id) AS jumlah_nama,
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
  'Daftar tiang JTM. `semua_kode` menyebut seluruh namanya — dipakai di layar yang tidak punya konteks penyulang.';


ALTER TABLE public.tiang_kode_penyulang ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "auth baca kode penyulang" ON public.tiang_kode_penyulang;
CREATE POLICY "auth baca kode penyulang"
  ON public.tiang_kode_penyulang FOR SELECT TO authenticated USING (true);

GRANT SELECT  ON public.tiang_kode_penyulang TO authenticated;
GRANT SELECT  ON public.tiang_jtm_daftar     TO authenticated;
GRANT EXECUTE ON FUNCTION public.jtm_kode_penyulang_baru      TO authenticated;
GRANT EXECUTE ON FUNCTION public.ubah_kode_tiang_jtm          TO authenticated;
GRANT EXECUTE ON FUNCTION public.nomori_ulang_penyulang_jtm   TO authenticated;


-- ── 9. Penamaan tiang baru: SATU aturan untuk pemilik dan penumpang ──────────
--
-- Menggantikan `tiang_buat_kode_jtm` di `jtm-lanjut.sql`. Dua hal berubah, dan
-- keduanya datang dari lapangan:
--
--   (a) Nama diteruskan dari leluhur yang bernama DI PENYULANG TIANG INI, bukan
--       dari kode induk apa adanya. Tanpa itu, tiang PERUMNAS yang induknya
--       GNN-001 akan lahir bernama GNN-003 — meneruskan deret penyulang yang
--       bukan miliknya. Ini yang membuat penyulang bisa berpangkal pada tiang
--       milik orang dan tetap dinomori dari 001.
--
--   (b) Aturan belok dikembalikan seperti JTR. Sebelumnya anak PERTAMA selalu
--       meneruskan deret apa pun arahnya — perlindungan yang dibuat untuk data
--       impor, di mana lateral tercatat sebelum jalur utama. Di lapangan
--       perlindungan itu justru merusak: PRM-008 bercabang ke utara dan tiang
--       cabangnya dinamai PRM-009. Sekarang belok >60 derajat memulai deret
--       berhuruf, persis JTR — dan perlindungan impornya tetap ada, karena
--       jalur yang LURUS tetap meneruskan deret meski induknya sudah punya anak.

CREATE OR REPLACE FUNCTION public.tiang_buat_kode_jtm()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  singkat    TEXT;
  naik       UUID;
  -- Skalar, BUKAN RECORD. RECORD yang tidak pernah kena `SELECT INTO` tidak
  -- punya bentuk, dan membacanya menggagalkan seluruh penyisipan — jebakan yang
  -- sudah pernah kena di `ubah_induk_tiang_jtm`.
  l_id       UUID;
  l_kode     TEXT;
  l_lat      DOUBLE PRECISION;
  l_lng      DOUBLE PRECISION;
  l_induk    UUID;
  induk_kode TEXT;
  hulu_lat   DOUBLE PRECISION;
  hulu_lng   DOUBLE PRECISION;
  anak_lat   DOUBLE PRECISION;
  anak_lng   DOUBLE PRECISION;
  ada_anak   BOOLEAN := false;
  arah_baru  DOUBLE PRECISION;
  arah_lama  DOUBLE PRECISION;
  arah_anak  DOUBLE PRECISION;
  belok      DOUBLE PRECISION;
  selisih    DOUBLE PRECISION;
  huruf      TEXT;
  pokok_kode TEXT;
  prefiks    TEXT;
  nomor_maks INT;
  pokok      BOOLEAN;
  n          INT := 0;
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

  IF NEW.feeder IS NULL THEN NEW.feeder := NEW.penyulang; END IF;

  -- Leluhur terdekat yang bernama DI PENYULANG INI.
  naik := NEW.induk_id;
  WHILE naik IS NOT NULL AND n < 500 LOOP
    SELECT k.kode, t.id, t.lat, t.lng, t.induk_id
      INTO l_kode, l_id, l_lat, l_lng, l_induk
    FROM public.tiang t
    JOIN public.tiang_kode_penyulang k
      ON k.tiang_id = t.id AND upper(k.penyulang) = upper(NEW.penyulang)
    WHERE t.id = naik;
    EXIT WHEN l_id IS NOT NULL;

    SELECT induk_id INTO naik FROM public.tiang WHERE id = naik;
    n := n + 1;
  END LOOP;

  IF l_id IS NULL THEN
    -- Pangkal penyulang ini. Nomor tiga angka supaya urut terbaca.
    prefiks := singkat || '-';
    SELECT COALESCE(max((regexp_match(kode, '([0-9]+)[a-z]?$'))[1]::int), 0)
      INTO nomor_maks
    FROM public.tiang_kode_penyulang
    WHERE upper(penyulang) = upper(NEW.penyulang)
      AND upper(ulp) = upper(COALESCE(NEW.ulp, '-'))
      AND kode ~ ('^' || prefiks || '[0-9]+$');
    NEW.kode := prefiks || lpad((nomor_maks + 1)::text, 3, '0');
    RETURN NEW;
  END IF;

  induk_kode := l_kode;
  arah_baru  := public.arah_derajat(l_lat, l_lng, NEW.lat, NEW.lng);

  -- Anak leluhur yang SUDAH bernama di penyulang ini.
  SELECT t.lat, t.lng INTO anak_lat, anak_lng
  FROM public.tiang t
  JOIN public.tiang_kode_penyulang k
    ON k.tiang_id = t.id AND upper(k.penyulang) = upper(NEW.penyulang)
  WHERE t.induk_id = l_id AND t.status_hidup = 'aktif'
  ORDER BY t.created_at
  LIMIT 1;
  ada_anak := FOUND;

  -- (d) Sisipan: sudah ada anak yang menuju arah yang hampir sama, jadi tiang
  --     ini berdiri DI ANTARA leluhur dan anak itu — bukan cabang baru.
  IF ada_anak AND arah_baru IS NOT NULL AND NOT COALESCE(NEW.cabang_baru, false) THEN
    arah_anak := public.arah_derajat(l_lat, l_lng, anak_lat, anak_lng);
    IF arah_anak IS NOT NULL THEN
      selisih := abs(arah_baru - arah_anak);
      IF selisih > 180 THEN selisih := 360 - selisih; END IF;
      IF selisih <= 45 THEN
        SELECT COALESCE(max(substring(kode from '([a-z])$')), '') INTO huruf
        FROM public.tiang_kode_penyulang
        WHERE upper(penyulang) = upper(NEW.penyulang)
          AND upper(ulp) = upper(COALESCE(NEW.ulp, '-'))
          AND kode ~ ('^' || induk_kode || '[a-z]$');
        NEW.kode := induk_kode || CASE WHEN huruf = '' THEN 'a' ELSE chr(ascii(huruf) + 1) END;
        RETURN NEW;
      END IF;
    END IF;
  END IF;

  -- Arah bentang sebelumnya: dari hulu ke leluhur.
  belok := NULL;
  IF l_induk IS NOT NULL AND arah_baru IS NOT NULL THEN
    SELECT lat, lng INTO hulu_lat, hulu_lng FROM public.tiang WHERE id = l_induk;
    IF FOUND THEN
      arah_lama := public.arah_derajat(hulu_lat, hulu_lng, l_lat, l_lng);
      IF arah_lama IS NOT NULL THEN
        belok := abs(arah_baru - arah_lama);
        IF belok > 180 THEN belok := 360 - belok; END IF;
      END IF;
    END IF;
  END IF;

  IF NOT COALESCE(NEW.cabang_baru, false) AND (belok IS NULL OR belok <= 60) THEN
    -- Jalur yang sama diteruskan. 'MTR-005' -> 'MTR-' ; 'MTR-005_B1' -> 'MTR-005_B'.
    prefiks := regexp_replace(induk_kode, '[0-9]+[a-z]?$', '');
  ELSE
    -- Deret berhuruf. CABANG (garis bawah) kalau leluhurnya sudah punya anak;
    -- BELOKAN (tanpa garis bawah) kalau jalurnya sendiri yang membelok.
    --
    -- Digantung pada NOMOR POKOK terdekat, bukan pada kode leluhur apa adanya:
    -- pada impor 250 tiang sungguhan, cabang bersarang melahirkan nama 46 huruf
    -- yang tidak bisa dibaca di HP maupun disebut lewat radio. Susunan pohon
    -- yang sebenarnya tidak hilang — dia ada di `induk_id`, bukan di nama.
    pokok_kode := regexp_replace(induk_kode, '[_].*$', '');
    IF pokok_kode !~ ('^' || singkat || '-[0-9]+$') THEN
      pokok_kode := regexp_replace(pokok_kode, '[a-zA-Z]+[0-9]*$', '');
      IF pokok_kode !~ ('^' || singkat || '-[0-9]+$') THEN
        pokok_kode := induk_kode;
      END IF;
    END IF;

    huruf := COALESCE(public.arah_huruf(arah_baru), 'K');
    prefiks := pokok_kode || CASE WHEN ada_anak THEN '_' ELSE '' END || huruf;

    -- Huruf yang sudah terpakai di titik cabang yang sama maju ke huruf
    -- berikutnya; lanjutan deret cabang lama tidak lewat sini, dia lewat jalur
    -- "diteruskan" di atas.
    WHILE EXISTS (
      SELECT 1 FROM public.tiang_kode_penyulang
      WHERE upper(penyulang) = upper(NEW.penyulang)
        AND upper(ulp) = upper(COALESCE(NEW.ulp, '-'))
        AND kode ~ ('^' || prefiks || '[0-9]+[a-z]?$')
    ) LOOP
      huruf := chr(ascii(huruf) + 1);
      EXIT WHEN huruf > 'Z';
      prefiks := pokok_kode || CASE WHEN ada_anak THEN '_' ELSE '' END || huruf;
    END LOOP;
  END IF;

  pokok := prefiks = singkat || '-';

  SELECT COALESCE(max((regexp_match(kode, '([0-9]+)[a-z]?$'))[1]::int), 0)
    INTO nomor_maks
  FROM public.tiang_kode_penyulang
  WHERE upper(penyulang) = upper(NEW.penyulang)
    AND upper(ulp) = upper(COALESCE(NEW.ulp, '-'))
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

COMMENT ON FUNCTION public.tiang_buat_kode_jtm IS
  'Nama tiang JTM. Diteruskan dari leluhur terdekat yang bernama di penyulang tiang ini, jadi penyulang yang berpangkal pada tiang milik orang tetap dinomori dari 001. Belok >60 derajat memulai deret berhuruf, seperti JTR.';
