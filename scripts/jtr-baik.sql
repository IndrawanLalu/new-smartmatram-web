-- =============================================================================
-- "TIANG BAIK": satu ketukan mengisi seluruh formulir JTR dengan jawaban bawaan.
--
-- Perlakuannya dibuat sama persis dengan inspeksi JTM (`jtm-normal.sql` +
-- `jtm-pengaturan.sql`). Yang berbeda cuma tempat penyimpanan jawabannya, dan
-- perbedaan itu tidak terlihat oleh siapa pun:
--
--   JTM  jawaban per tiang → `nilai_tiang_jtm`, satu baris per jawaban
--   JTR  jawaban per tiang → kolom `tiang.*` + tabel anak `tiang_konduktor`
--
-- Karena kolom JTR tetap, katalog field-nya tidak bisa ditambah lewat halaman
-- pengaturan — menambah field berarti menambah kolom. Yang BISA diatur, dan
-- itulah yang penting sehari-hari: daftar pilihan tiap field, dan jawaban mana
-- yang dipasang tombol "Tiang baik".
--
-- KENAPA JAWABAN BAWAAN TIDAK BISA DISIMPULKAN DARI `jtr_ref.normal` —
-- ini inti berkas ini, sama dengan alasan di `jtm-normal.sql`.
-- `normal` menjawab "apakah jawaban ini sebuah temuan", dan satu field boleh
-- punya banyak jawaban yang sama-sama bukan temuan: tiang beton normal, besi
-- juga normal; kabel 3x70+50 normal, 4x16 juga. Dari situ tidak bisa
-- disimpulkan mana yang HARUS diisikan sebagai bawaan — itu keputusan orang
-- yang tahu tiang di wilayahnya kebanyakan bentuknya apa.
--
-- Prasyarat: jtr-penyapuan.sql
-- Aman dijalankan berulang.
-- =============================================================================

-- ── 1. Daftar pilihan ────────────────────────────────────────────────────────
-- Sebelum ini daftarnya hidup sebagai konstanta di `src/types/jtr.types.ts`.
-- Akibatnya menambah satu ukuran kabel berarti rilis aplikasi, dan yang boleh
-- menambahkannya cuma orang yang memegang repo — bukan orang yang tahu
-- barangnya. Alasan yang sama dipakai `jtm-pengaturan.sql`.
--
-- Satu tabel untuk tiga belas daftar, bukan tiga belas tabel: bentuknya sama
-- persis (kode + label + urutan + aktif), dan memisahkannya berarti menulis
-- tiga belas kali kode CRUD yang sama.
--
-- Satu kategori dipakai bersama beberapa field — `kondisi_aksesoris` melayani
-- suspension, large angle, dan dead end sekaligus. Itu bedanya dari
-- `jtm_opsi_ref` yang selalu milik satu item.

CREATE TABLE IF NOT EXISTS public.jtr_ref (
  kategori TEXT NOT NULL,
  -- TETAP, dan sengaja sama dengan teks yang tersimpan di kolom `tiang`.
  -- Bukan slug: kolom `tiang.kondisi` sudah berisi 'Baik'/'Miring' sejak
  -- inspeksi pertama, dan mengubahnya jadi kode berarti menulis ulang data
  -- lapangan yang sudah terkumpul demi kerapian yang tidak dilihat siapa pun.
  kode     TEXT NOT NULL,
  label    TEXT NOT NULL,

  -- false = jawaban ini sebuah temuan. Dipakai halaman pengaturan untuk
  -- memperingatkan admin yang tanpa sadar menjadikan "Miring" sebagai bawaan.
  -- BUKAN sumber kebenaran temuan — itu tetap view `inspeksi_jtr_temuan`.
  normal   BOOLEAN NOT NULL DEFAULT true,

  urutan   INT     NOT NULL DEFAULT 100,
  aktif    BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (kategori, kode)
);

ALTER TABLE public.jtr_ref DROP CONSTRAINT IF EXISTS jtr_ref_kategori_valid;
ALTER TABLE public.jtr_ref ADD CONSTRAINT jtr_ref_kategori_valid
  CHECK (kategori IN (
    'jenis_tiang', 'ukuran_tiang', 'kondisi_tiang',
    'jenis_kabel', 'ukuran_kabel', 'kondisi_kabel',
    'kondisi_aksesoris', 'kondisi_andongan', 'kondisi_arde', 'kondisi_stay',
    'jenis_jamperan', 'kondisi_jamperan', 'rawan_row'
  ));

COMMENT ON TABLE public.jtr_ref IS
  'Daftar pilihan isian tiang JTR. Diubah dari halaman Pengaturan, bukan lewat rilis aplikasi.';


-- ── 2. Katalog field + jawaban bawaannya ─────────────────────────────────────
-- Padanan `jtm_item_ref`: nama yang ditampilkan, halaman tempatnya muncul,
-- urutan, dan `nilai_bawaan`.
--
-- Barisnya disemai skrip ini dan TIDAK ditambah dari halaman pengaturan —
-- tiap baris di sini berpasangan dengan satu kolom tabel `tiang`, jadi
-- menambah baris tanpa menambah kolom cuma melahirkan setelan yang tidak
-- pernah sampai ke mana-mana.

CREATE TABLE IF NOT EXISTS public.jtr_item_ref (
  -- Nama field di layar HP (camelCase-nya ada di IsianTiang). Bukan nama kolom
  -- `tiang` karena tiga di antaranya memang tidak sepadan satu-satu:
  -- konduktor_* masuk ke tabel anak, jamperan_* digabung jadi satu JSONB.
  field    TEXT PRIMARY KEY,
  nama     TEXT NOT NULL,
  kelompok TEXT NOT NULL,   -- halaman formulir; sama dengan judul halaman di HP
  urutan   INT  NOT NULL DEFAULT 100,

  tipe     TEXT NOT NULL,   -- pilihan | angka | boolean
  kategori TEXT,            -- kategori jtr_ref; wajib untuk tipe 'pilihan'
  satuan   TEXT,

  -- Jawaban yang diisikan tombol "Tiang baik".
  -- NULL = tidak diisi otomatis → petugas WAJIB memilih sendiri, dan papan
  -- kendali menyatakannya "belum diisi". Itulah cara menetapkan field yang
  -- harus diisi manual, tanpa rilis aplikasi.
  nilai_bawaan TEXT,

  aktif      BOOLEAN NOT NULL DEFAULT true,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.jtr_item_ref DROP CONSTRAINT IF EXISTS jtr_item_ref_tipe_valid;
ALTER TABLE public.jtr_item_ref ADD CONSTRAINT jtr_item_ref_tipe_valid
  CHECK (tipe IN ('pilihan', 'angka', 'boolean'));

ALTER TABLE public.jtr_item_ref DROP CONSTRAINT IF EXISTS jtr_item_ref_kategori_ada;
ALTER TABLE public.jtr_item_ref ADD CONSTRAINT jtr_item_ref_kategori_ada
  CHECK (tipe <> 'pilihan' OR kategori IS NOT NULL);

COMMENT ON COLUMN public.jtr_item_ref.nilai_bawaan IS
  'Jawaban yang diisikan tombol "Tiang baik". BUKAN sama dengan jtr_ref.normal: normal = bukan temuan (boleh banyak), bawaan = jawaban yang paling sering benar (hanya satu). NULL = wajib diisi petugas.';


-- ── 3. Isi awal ──────────────────────────────────────────────────────────────
-- Persis daftar yang hari ini ada di `src/types/jtr.types.ts`, supaya hari
-- pertama tidak ada yang berubah bagi petugas.
--
-- ON CONFLICT DO NOTHING di mana-mana: menjalankan ulang skrip ini TIDAK boleh
-- memulihkan label atau bawaan yang sudah disunting orang. Pelajaran dari
-- HARGARDU — "mengembalikan ke keadaan baku" sama dengan menghapus keputusan
-- orang, diam-diam.
--
-- Kolom `normal` disetel agar COCOK dengan view `inspeksi_jtr_temuan`; kalau
-- keduanya berselisih, lencana peringatan di web akan berbohong. Lihat
-- catatan di kaki berkas untuk dua tempat yang memang belum sejalan.

INSERT INTO public.jtr_ref (kategori, kode, label, normal, urutan) VALUES
  -- Bentuk tiang. Semua normal — beton, besi, dan kayu sama-sama sah berdiri.
  ('jenis_tiang', 'Beton', 'Beton', true, 10),
  ('jenis_tiang', 'Besi',  'Besi',  true, 20),
  ('jenis_tiang', 'Kayu',  'Kayu',  true, 30),

  ('ukuran_tiang', '7',  '7 m',  true, 10),
  ('ukuran_tiang', '9',  '9 m',  true, 20),
  ('ukuran_tiang', '11', '11 m', true, 30),
  ('ukuran_tiang', '13', '13 m', true, 40),
  ('ukuran_tiang', '14', '14 m', true, 50),

  ('kondisi_tiang', 'Baik',    'Baik',    true,  10),
  ('kondisi_tiang', 'Miring',  'Miring',  false, 20),
  ('kondisi_tiang', 'Retak',   'Retak',   false, 30),
  ('kondisi_tiang', 'Keropos', 'Keropos', false, 40),
  ('kondisi_tiang', 'Rusak',   'Rusak',   false, 50),

  ('jenis_kabel', 'LVTC',      'LVTC',      true, 10),
  ('jenis_kabel', 'Twisted',   'Twisted',   true, 20),
  ('jenis_kabel', 'Telanjang', 'Telanjang', true, 30),

  ('ukuran_kabel', '3x70+50', '3x70+50', true, 10),
  ('ukuran_kabel', '4x70',    '4x70',    true, 20),
  ('ukuran_kabel', '3x50+35', '3x50+35', true, 30),
  ('ukuran_kabel', '3x35+25', '3x35+25', true, 40),
  ('ukuran_kabel', '4x16',    '4x16',    true, 50),

  ('kondisi_kabel', 'Baik',        'Baik',        true,  10),
  ('kondisi_kabel', 'Lepas',       'Lepas',       false, 20),
  ('kondisi_kabel', 'Pecah-pecah', 'Pecah-pecah', false, 30),
  ('kondisi_kabel', 'Terkelupas',  'Terkelupas',  false, 40),
  ('kondisi_kabel', 'Putus',       'Putus',       false, 50),

  -- "Tidak Ada" BUKAN temuan: large angle dan dead end memang cuma ada di
  -- tiang sudut dan tiang ujung. Menghitungnya temuan akan memenuhi rekap
  -- dengan ribuan baris yang tidak menuntut tindakan apa pun — dan daftar
  -- temuan yang isinya bukan masalah akan berhenti dibaca.
  ('kondisi_aksesoris', 'Baik',      'Baik',      true,  10),
  ('kondisi_aksesoris', 'Rusak',     'Rusak',     false, 20),
  ('kondisi_aksesoris', 'Tidak Ada', 'Tidak Ada', true,  30),

  ('kondisi_andongan', 'Baik',   'Baik',   true,  10),
  ('kondisi_andongan', 'Rendah', 'Rendah', false, 20),
  ('kondisi_andongan', 'Kendor', 'Kendor', false, 30),

  -- Sama seperti aksesoris: sebagian besar tiang JTR memang tidak berarde, dan
  -- itu keadaan biasa. Yang temuan adalah arde yang PUTUS — itu pernah ada
  -- lalu rusak.
  ('kondisi_arde', 'Ada',       'Ada',       true,  10),
  ('kondisi_arde', 'Tidak Ada', 'Tidak Ada', true,  20),
  ('kondisi_arde', 'Putus',     'Putus',     false, 30),

  ('kondisi_stay', 'Baik',          'Baik',          true,  10),
  ('kondisi_stay', 'Rusak',         'Rusak',         false, 20),
  ('kondisi_stay', 'Tidak Ada TUI', 'Tidak Ada TUI', true,  30),

  ('jenis_jamperan', 'Tidak Ada', 'Tidak Ada', true, 10),
  ('jenis_jamperan', 'Konektor',  'Konektor',  true, 20),
  ('jenis_jamperan', 'Peral',     'Peral',     true, 30),
  ('jenis_jamperan', 'Press',     'Press',     true, 40),

  ('kondisi_jamperan', 'Baik',       'Baik',       true,  10),
  ('kondisi_jamperan', 'Tidak Baik', 'Tidak Baik', false, 20),

  -- Semuanya temuan: view menghitung tiap isi rawan_row sebagai satu temuan.
  ('rawan_row', 'Pohon',    'Pohon',    false, 10),
  ('rawan_row', 'Bangunan', 'Bangunan', false, 20),
  ('rawan_row', 'Reklame',  'Reklame',  false, 30),
  ('rawan_row', 'Antena',   'Antena',   false, 40)
ON CONFLICT (kategori, kode) DO NOTHING;


-- Katalog field. Kelompoknya = judul halaman di HP, supaya susunan yang dilihat
-- admin di web sama dengan yang dilihat petugas di lapangan.
--
-- Nilai bawaannya diambil dari `ISIAN_BAWAAN` yang selama ini terpasang di
-- aplikasi. Yang paling perlu diketahui: `arde_kondisi` bawaannya "Tidak Ada",
-- bukan "Ada" — dari data lapangan yang ada, 95% tiang memang tanpa arde.
-- Membawakan "Ada" berarti 19 dari 20 tiang harus dikoreksi manual, dan yang
-- terlewat akan tercatat punya arde padahal tidak. Salah ke arah "tidak ada"
-- masih kelihatan dan bisa diperiksa; salah ke arah "ada" menyembunyikan
-- masalah keselamatan.

INSERT INTO public.jtr_item_ref (field, nama, kelompok, urutan, tipe, kategori, satuan, nilai_bawaan) VALUES
  ('jenis',             'Jenis tiang',       'Tiang', 10, 'pilihan', 'jenis_tiang',   NULL, 'Beton'),
  ('tinggi',            'Tinggi tiang',      'Tiang', 20, 'pilihan', 'ukuran_tiang',  'm',  '9'),
  ('kondisi',           'Kondisi tiang',     'Tiang', 30, 'pilihan', 'kondisi_tiang', NULL, 'Baik'),
  ('underbuildTm',      'Digantung tiang TM','Tiang', 40, 'boolean', NULL,            NULL, 'false'),

  ('konduktorJenis',    'Jenis kabel',       'Konduktor', 10, 'pilihan', 'jenis_kabel',   NULL, 'LVTC'),
  ('konduktorUkuran',   'Ukuran kabel',      'Konduktor', 20, 'pilihan', 'ukuran_kabel',  NULL, '3x70+50'),
  ('konduktorKondisi',  'Kondisi kabel',     'Konduktor', 30, 'pilihan', 'kondisi_kabel', NULL, 'Baik'),

  ('aksSuspension',     'Suspension',        'Aksesoris & jamperan', 10, 'pilihan', 'kondisi_aksesoris', NULL, 'Baik'),
  ('aksLargeAngle',     'Large angle',       'Aksesoris & jamperan', 20, 'pilihan', 'kondisi_aksesoris', NULL, 'Tidak Ada'),
  ('aksDeadEnd',        'Dead end',          'Aksesoris & jamperan', 30, 'pilihan', 'kondisi_aksesoris', NULL, 'Tidak Ada'),
  ('jamperanJenis',     'Jenis jamperan',    'Aksesoris & jamperan', 40, 'pilihan', 'jenis_jamperan',    NULL, 'Tidak Ada'),
  ('jamperanKondisi',   'Kondisi jamperan',  'Aksesoris & jamperan', 50, 'pilihan', 'kondisi_jamperan',  NULL, 'Baik'),

  ('andongan',          'Andongan',          'Andongan, arde, stay & ROW', 10, 'pilihan', 'kondisi_andongan', NULL, 'Baik'),
  ('tarikanSr',         'Tarikan SR',        'Andongan, arde, stay & ROW', 20, 'angka',   NULL,               'SR', '0'),
  ('ardeKondisi',       'Arde',              'Andongan, arde, stay & ROW', 30, 'pilihan', 'kondisi_arde',     NULL, 'Tidak Ada'),
  ('stayKondisi',       'Stay',              'Andongan, arde, stay & ROW', 40, 'pilihan', 'kondisi_stay',     NULL, 'Tidak Ada TUI')
ON CONFLICT (field) DO NOTHING;

-- ── Yang SENGAJA tidak ada di katalog ────────────────────────────────────────
-- Bukan kelupaan. Keempatnya tidak boleh punya jawaban bawaan sama sekali:
--
--   arde_nilai_ohm     angka hasil PENGUKURAN. Mengisinya otomatis berarti
--                      menuliskan hasil ukur yang tidak pernah diambil siapa
--                      pun. Alasan yang sama dipakai `jtm-normal.sql` untuk
--                      nomor peralatan dan nilai pentanahan.
--   rawan_row          larik penghalang. Pohon di satu tiang tidak berarti ada
--                      pohon di tiang sebelahnya; bawaan yang benar adalah
--                      kosong, dan kosong tidak perlu diatur. Daftar
--                      PILIHANNYA tetap ada di `jtr_ref`.
--   catatan_perbaikan  teks bebas. Catatan yang terbawa akan menempel pada
--                      tiang yang tidak ada masalahnya.
--   konduktor.huluId   menyatakan hubungan satu tiang tertentu dengan tiang
--                      lain, bukan sifat jalur.


-- ── 4. Penjaga bawaan ────────────────────────────────────────────────────────
-- Ini bukan hiasan. Satu salah ketik di halaman pengaturan akan mengisi ratusan
-- tiang dengan nilai yang tidak dikenal, dan salahnya baru ketahuan jauh dari
-- tempat ia dibuat — tersebar di data lapangan, bukan di layar admin.

CREATE OR REPLACE FUNCTION public.jaga_jtr_bawaan()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.nilai_bawaan IS NULL OR btrim(NEW.nilai_bawaan) = '' THEN
    NEW.nilai_bawaan := NULL;
    RETURN NEW;
  END IF;

  IF NEW.tipe = 'pilihan' THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.jtr_ref r
      WHERE r.kategori = NEW.kategori AND r.kode = NEW.nilai_bawaan AND r.aktif
    ) THEN
      RAISE EXCEPTION
        'Jawaban bawaan "%" bukan pilihan aktif pada daftar %', NEW.nilai_bawaan, NEW.kategori;
    END IF;

  ELSIF NEW.tipe = 'angka' THEN
    IF NEW.nilai_bawaan !~ '^-?[0-9]+([.,][0-9]+)?$' THEN
      RAISE EXCEPTION 'Jawaban bawaan % harus berupa angka, bukan "%"',
        NEW.field, NEW.nilai_bawaan;
    END IF;

  ELSIF NEW.tipe = 'boolean' THEN
    IF NEW.nilai_bawaan NOT IN ('true', 'false') THEN
      RAISE EXCEPTION 'Jawaban bawaan % harus true atau false, bukan "%"',
        NEW.field, NEW.nilai_bawaan;
    END IF;
  END IF;

  NEW.updated_at := now();
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_jaga_jtr_bawaan ON public.jtr_item_ref;
CREATE TRIGGER trg_jaga_jtr_bawaan
  BEFORE INSERT OR UPDATE OF nilai_bawaan, tipe, kategori ON public.jtr_item_ref
  FOR EACH ROW EXECUTE FUNCTION public.jaga_jtr_bawaan();


-- ── 5. Penjaga pilihan yang masih terpakai ───────────────────────────────────
-- Dua hal yang dijaga, dan keduanya gagal diam-diam kalau tidak dijaga:
--
--   a. Pilihan yang sedang jadi bawaan. Kalau hilang, tombol "Tiang baik"
--      berhenti mengisi field itu tanpa ada yang memberi tahu siapa pun.
--   b. Pilihan yang sudah tersimpan di data tiang. Kalau hilang, ratusan baris
--      menyimpan nilai yang tidak ada lagi di daftar mana pun — dan halaman
--      yang menampilkannya jadi menampilkan sesuatu yang tak bernama.
--
-- Jalan keluarnya SELALU sama: nonaktifkan, jangan hapus. Nonaktif
-- menghilangkannya dari daftar pilihan tanpa merusak yang sudah tercatat.

CREATE OR REPLACE FUNCTION public.jaga_jtr_ref_terpakai()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE dipakai INT := 0;
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.jtr_item_ref i
    WHERE i.kategori = OLD.kategori AND i.nilai_bawaan = OLD.kode
  ) THEN
    RAISE EXCEPTION
      'Pilihan "%" sedang dipakai sebagai jawaban bawaan. Ganti bawaannya dulu.', OLD.label;
  END IF;

  dipakai := CASE OLD.kategori
    WHEN 'jenis_tiang'   THEN (SELECT count(*) FROM public.tiang WHERE jenis = OLD.kode)
    WHEN 'ukuran_tiang'  THEN (SELECT count(*) FROM public.tiang WHERE tinggi::text = OLD.kode)
    WHEN 'kondisi_tiang' THEN (SELECT count(*) FROM public.tiang WHERE kondisi = OLD.kode)
    WHEN 'jenis_kabel'   THEN (SELECT count(*) FROM public.tiang_konduktor WHERE jenis = OLD.kode)
    WHEN 'ukuran_kabel'  THEN (SELECT count(*) FROM public.tiang_konduktor WHERE ukuran = OLD.kode)
    WHEN 'kondisi_kabel' THEN (SELECT count(*) FROM public.tiang_konduktor WHERE kondisi = OLD.kode)
    WHEN 'kondisi_aksesoris' THEN (
      SELECT count(*) FROM public.tiang
      WHERE OLD.kode IN (COALESCE(aks_suspension, ''), COALESCE(aks_large_angle, ''), COALESCE(aks_dead_end, '')))
    WHEN 'kondisi_andongan' THEN (SELECT count(*) FROM public.tiang WHERE andongan = OLD.kode)
    WHEN 'kondisi_arde'     THEN (SELECT count(*) FROM public.tiang WHERE arde_kondisi = OLD.kode)
    WHEN 'kondisi_stay'     THEN (SELECT count(*) FROM public.tiang WHERE stay_kondisi = OLD.kode)
    WHEN 'jenis_jamperan'   THEN (
      SELECT count(*) FROM public.tiang t
      WHERE EXISTS (SELECT 1 FROM jsonb_array_elements(t.jamperan) j WHERE j->>'jenis' = OLD.kode))
    WHEN 'kondisi_jamperan' THEN (
      SELECT count(*) FROM public.tiang t
      WHERE EXISTS (SELECT 1 FROM jsonb_array_elements(t.jamperan) j WHERE j->>'kondisi' = OLD.kode))
    WHEN 'rawan_row' THEN (SELECT count(*) FROM public.tiang WHERE OLD.kode = ANY(rawan_row))
    ELSE 0
  END;

  IF dipakai > 0 THEN
    RAISE EXCEPTION
      'Pilihan "%" masih tercatat di % tiang. Nonaktifkan saja — menghapusnya membuat baris-baris itu menyimpan nilai yang tidak ada lagi daftarnya.',
      OLD.label, dipakai;
  END IF;

  RETURN OLD;
END $$;

DROP TRIGGER IF EXISTS trg_jaga_jtr_ref_terpakai ON public.jtr_ref;
CREATE TRIGGER trg_jaga_jtr_ref_terpakai
  BEFORE DELETE ON public.jtr_ref
  FOR EACH ROW EXECUTE FUNCTION public.jaga_jtr_ref_terpakai();


-- ── 6. Hak akses ─────────────────────────────────────────────────────────────
-- Mengikuti pola tabel pengaturan lain; pengetatan per-peran dikerjakan
-- sekaligus untuk semua tabel di Fase 0.4 supaya bisa diuji dalam satu tarikan.
-- Sementara ini pembatasannya di sisi web: tab Pengaturan hanya muncul untuk
-- peran yang lolos `canManageSettings`.

ALTER TABLE public.jtr_ref      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.jtr_item_ref ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS auth_all_jtr_ref      ON public.jtr_ref;
DROP POLICY IF EXISTS auth_all_jtr_item_ref ON public.jtr_item_ref;

CREATE POLICY auth_all_jtr_ref ON public.jtr_ref
  FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY auth_all_jtr_item_ref ON public.jtr_item_ref
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.jtr_ref      TO authenticated;
GRANT SELECT, UPDATE                 ON public.jtr_item_ref TO authenticated;


-- =============================================================================
-- Dua tempat yang BELUM sejalan — disebut supaya tidak jadi kejutan
-- =============================================================================
-- `jtr_ref.normal` di atas menandai kondisi kabel selain 'Baik' dan stay
-- 'Rusak' sebagai temuan, padahal view `inspeksi_jtr_temuan` belum
-- melaporkan keduanya — view itu baru mengenali arde putus, kondisi tiang,
-- andongan, rawan ROW, aksesoris rusak, jamperan, dan catatan perbaikan.
--
-- Selisihnya sengaja dibiarkan ke arah yang aman: lencana di web akan
-- MEMPERINGATKAN admin yang menjadikan "Putus" sebagai bawaan kabel, meski
-- rekap temuannya sendiri belum menghitungnya. Kebalikannya — web diam
-- sementara rekap melapor — jauh lebih membingungkan.
--
-- Menambah kedua cabang itu ke `inspeksi_jtr_temuan` pekerjaan tersendiri:
-- kondisi kabel ada di `tiang_konduktor`, jadi view-nya perlu satu join baru
-- dan tiap kabel jadi satu baris temuan. Dikerjakan menyusul, bukan di sini.
-- =============================================================================

-- =============================================================================
-- Periksa hasilnya
-- =============================================================================
-- a. Tiga belas daftar pilihan:
--      SELECT kategori, count(*) FILTER (WHERE aktif) AS pilihan,
--             count(*) FILTER (WHERE NOT normal) AS temuan
--      FROM jtr_ref GROUP BY kategori ORDER BY kategori;
--
-- b. Berapa field yang ikut terisi tombol "Tiang baik":
--      SELECT count(*) FILTER (WHERE nilai_bawaan IS NOT NULL) AS terisi,
--             count(*) AS total FROM jtr_item_ref WHERE aktif;
--
-- c. Field yang wajib diisi petugas sendiri:
--      SELECT kelompok, nama FROM jtr_item_ref
--      WHERE aktif AND nilai_bawaan IS NULL ORDER BY kelompok, urutan;
--
-- d. Uji penjaganya benar-benar hidup (keduanya HARUS gagal):
--      UPDATE jtr_item_ref SET nilai_bawaan = 'Betonn' WHERE field = 'jenis';
--      DELETE FROM jtr_ref WHERE kategori = 'jenis_tiang' AND kode = 'Beton';
-- =============================================================================
