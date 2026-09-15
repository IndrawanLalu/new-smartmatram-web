-- scripts/jtm-temuan.sql
--
-- Enam perbaikan yang datang dari pemakaian pertama di lapangan.
--
--   1. Temuan wajib berfoto. Temuan JTM masuk ke daftar Perlu Perbaikan yang
--      sama dengan monitoring inspeksi, dan temuan tanpa foto tidak bisa
--      ditindaklanjuti siapa pun dari belakang meja.
--   2. "Tidak ada" pada papan nomor, arrester, dan pentanahan BUKAN temuan.
--   3. Jenis konduktor dan peralatan hubung diambil dari daftar Pengaturan,
--      bukan dari daftar tersendiri yang diam-diam berbeda isinya.
--   4. Syarat bisa dibalik — "tampil kalau jawabannya BUKAN ini". Diperlukan
--      begitu daftar pilihannya datang dari pengaturan dan bisa bertambah.
--   5. Vegetasi yang berpotensi atau menyentuh wajib menyebut nama pohonnya:
--      dari situlah peta pohon bisa lahir.
--   6. Catatan per temuan.
--
-- Prasyarat: jtm-inspeksi-fungsi.sql · jtm-pengaturan.sql · jtm-syarat.sql
-- Aman dijalankan berulang.


-- ── 1. Foto temuan ───────────────────────────────────────────────────────────
-- Dipisah dari `foto_tutup_url`: yang itu bukti PERBAIKAN, yang ini bukti
-- KERUSAKAN. Menyatukannya membuat "sudah diperbaiki" dan "baru ditemukan"
-- tidak bisa dibedakan lagi enam bulan kemudian.

ALTER TABLE public.inspeksi_jtm_periksa
  ADD COLUMN IF NOT EXISTS foto_url TEXT;

COMMENT ON COLUMN public.inspeksi_jtm_periksa.foto_url IS
  'Foto keadaan yang ditemukan. Wajib untuk jawaban yang bukan normal — temuan tanpa foto tidak bisa ditindaklanjuti dari belakang meja.';


-- ── 2. Pilihan yang datang dari halaman Pengaturan ───────────────────────────
-- Jenis konduktor dan peralatan hubung sudah punya daftarnya di Pengaturan JTM
-- (penghantar & penanda tiang). Menyalinnya jadi daftar kedua di sini berarti
-- admin menambah AAAC di satu tempat dan formulirnya tetap tidak berubah.

ALTER TABLE public.jtm_item_ref
  ADD COLUMN IF NOT EXISTS sumber_opsi TEXT;

ALTER TABLE public.jtm_item_ref DROP CONSTRAINT IF EXISTS jtm_item_sumber_opsi_valid;
ALTER TABLE public.jtm_item_ref ADD CONSTRAINT jtm_item_sumber_opsi_valid
  CHECK (sumber_opsi IS NULL OR sumber_opsi IN ('penanda', 'penghantar', 'ukuran'));

COMMENT ON COLUMN public.jtm_item_ref.sumber_opsi IS
  'Kategori jtm_ref yang jadi sumber pilihan item ini. Diisi berarti daftar pilihannya diselaraskan dari halaman Pengaturan, bukan diketik terpisah.';

ALTER TABLE public.jtm_opsi_ref
  ADD COLUMN IF NOT EXISTS dari_ref BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN public.jtm_opsi_ref.dari_ref IS
  'true = baris ini dikelola daftar Pengaturan, jadi boleh dinonaktifkan otomatis saat hilang dari sana. false = pilihan tetap milik item ini sendiri (misal "tidak ada").';


CREATE OR REPLACE FUNCTION public.jtm_selaraskan_opsi(p_kategori TEXT DEFAULT NULL)
RETURNS INT
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE n INT := 0;
BEGIN
  INSERT INTO public.jtm_opsi_ref (item_kode, kode, label, normal, urutan, aktif, dari_ref)
  SELECT i.kode, r.kode, r.label, true, r.urutan, r.aktif, true
  FROM public.jtm_item_ref i
  JOIN public.jtm_ref r ON r.kategori = i.sumber_opsi
  WHERE i.sumber_opsi IS NOT NULL
    AND (p_kategori IS NULL OR i.sumber_opsi = p_kategori)
  ON CONFLICT (item_kode, kode) DO UPDATE
    SET label    = EXCLUDED.label,
        urutan   = EXCLUDED.urutan,
        aktif    = EXCLUDED.aktif,
        dari_ref = true;
  GET DIAGNOSTICS n = ROW_COUNT;

  -- Yang hilang dari daftar Pengaturan DINONAKTIFKAN, bukan dihapus: ribuan
  -- baris pemeriksaan lama masih menunjuk kodenya, dan label temuan tahun lalu
  -- harus tetap terbaca.
  UPDATE public.jtm_opsi_ref o SET aktif = false
  FROM public.jtm_item_ref i
  WHERE i.kode = o.item_kode
    AND i.sumber_opsi IS NOT NULL
    AND o.dari_ref
    AND o.aktif
    AND (p_kategori IS NULL OR i.sumber_opsi = p_kategori)
    AND NOT EXISTS (
      SELECT 1 FROM public.jtm_ref r
      WHERE r.kategori = i.sumber_opsi AND r.kode = o.kode AND r.aktif
    );

  -- Jawaban bawaan yang menunjuk pilihan yang sudah mati dikosongkan, kalau
  -- tidak tombol "Tiang normal" diam-diam berhenti mengisi item itu.
  UPDATE public.jtm_item_ref i SET nilai_bawaan = NULL, updated_at = now()
  WHERE i.nilai_bawaan IS NOT NULL
    AND i.tipe = 'pilihan'
    AND NOT EXISTS (
      SELECT 1 FROM public.jtm_opsi_ref o
      WHERE o.item_kode = i.kode AND o.kode = i.nilai_bawaan AND o.aktif
    );

  RETURN n;
END $$;

COMMENT ON FUNCTION public.jtm_selaraskan_opsi IS
  'Menyalin daftar Pengaturan (jtm_ref) jadi pilihan jawaban item yang sumber_opsi-nya diisi. Dipanggil trigger tiap daftar itu berubah.';


CREATE OR REPLACE FUNCTION public.jtm_ref_selaras()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  PERFORM public.jtm_selaraskan_opsi(COALESCE(NEW.kategori, OLD.kategori));
  RETURN NULL;
END $$;

DROP TRIGGER IF EXISTS trg_jtm_ref_selaras ON public.jtm_ref;
CREATE TRIGGER trg_jtm_ref_selaras
  AFTER INSERT OR UPDATE OR DELETE ON public.jtm_ref
  FOR EACH ROW EXECUTE FUNCTION public.jtm_ref_selaras();


UPDATE public.jtm_item_ref SET sumber_opsi = 'penghantar' WHERE kode = 'jenis_konduktor';
UPDATE public.jtm_item_ref SET sumber_opsi = 'penanda'    WHERE kode = 'peralatan_hubung';

-- Pilihan lama kedua item itu ikut dikelola daftar Pengaturan — kecuali
-- "tidak ada", yang memang tidak mungkin ada di daftar peralatan mana pun.
UPDATE public.jtm_opsi_ref o SET dari_ref = true
FROM public.jtm_item_ref i
WHERE i.kode = o.item_kode
  AND i.sumber_opsi IS NOT NULL
  AND o.kode <> 'tidak_ada';

INSERT INTO public.jtm_opsi_ref (item_kode, kode, label, normal, urutan, aktif, dari_ref)
VALUES ('peralatan_hubung', 'tidak_ada', 'Tidak ada', true, 0, true, false)
ON CONFLICT (item_kode, kode) DO UPDATE
  SET aktif = true, urutan = 0, dari_ref = false;

SELECT public.jtm_selaraskan_opsi();


-- ── 3. Syarat yang bisa dibalik ──────────────────────────────────────────────
-- Daftar peralatan hubung kini datang dari Pengaturan dan bisa bertambah kapan
-- saja. Menyebutkan satu per satu mana yang memunculkan isian kondisinya
-- berarti tiap penanda baru harus didaftarkan lagi di sini. Dibalik saja:
-- tampil kalau jawabannya BUKAN "tidak ada".

ALTER TABLE public.jtm_item_ref
  ADD COLUMN IF NOT EXISTS syarat_negasi BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN public.jtm_item_ref.syarat_negasi IS
  'false = tampil kalau jawaban penentu ADA di syarat_nilai. true = tampil kalau jawabannya BUKAN salah satunya.';

UPDATE public.jtm_item_ref
SET syarat_item = 'peralatan_hubung', syarat_nilai = ARRAY['tidak_ada'], syarat_negasi = true
WHERE kode IN ('kondisi_peralatan', 'nomor_peralatan');

UPDATE public.jtm_item_ref
SET syarat_item = 'gardu', syarat_nilai = ARRAY['tidak_ada'], syarat_negasi = true
WHERE kode = 'nomor_gardu';


-- ── 4. "Tidak ada" yang bukan temuan ─────────────────────────────────────────
-- Sebagian besar tiang memang tidak punya arrester, dan tiang yang tidak punya
-- papan nomor bukan tiang rusak. Selama ini ditandai temuan, dan itu membanjiri
-- daftar Perlu Perbaikan dengan ribuan baris yang tidak perlu dikerjakan siapa
-- pun — persis cara tercepat membuat daftar itu berhenti dibaca.

UPDATE public.jtm_opsi_ref SET normal = true
WHERE (item_kode = 'papan_nomor' AND kode IN ('tidak', 'tidak_ada'))
   OR (item_kode = 'arrester'    AND kode IN ('tidak', 'tidak_ada'))
   OR (item_kode = 'pentanahan'  AND kode IN ('tidak', 'tidak_ada'))
   OR (item_kode = 'fco'         AND kode IN ('tidak', 'tidak_ada'));


-- ── 5. Nama pohon → peta pohon ───────────────────────────────────────────────
-- Vegetasi yang berpotensi atau menyentuh tidak cukup dicatat sebagai keadaan:
-- yang menentukan perabasan adalah pohon apa dan di mana. Namanya ditanyakan
-- di sini supaya peta pohon punya isi sejak hari pertama, bukan dikumpulkan
-- ulang lewat survei tersendiri nanti.

INSERT INTO public.jtm_item_ref
  (kode, nama, kelompok, dimensi, tipe, satuan, tier, milik, urutan, tampil_dashboard)
VALUES
  ('jenis_pohon', 'Nama pohonnya', 'ROW', 'tunggal', 'teks', NULL, '12', 'tiang', 100, false)
ON CONFLICT (kode) DO NOTHING;

UPDATE public.jtm_item_ref
SET syarat_item = 'vegetasi', syarat_nilai = ARRAY['aman'], syarat_negasi = true, urutan = 100
WHERE kode = 'jenis_pohon';

-- `vegetasi` digeser satu supaya nama pohon tepat di bawahnya.
UPDATE public.jtm_item_ref SET urutan = 99 WHERE kode = 'vegetasi';


-- ── 6. Menilai tiang: temuan wajib berfoto ───────────────────────────────────
-- Ditulis ulang utuh, bukan ditambal: fungsi ini satu-satunya pintu masuk
-- penilaian, dan menambalnya lewat beberapa skrip membuat isinya tidak bisa
-- dibaca dari satu tempat mana pun.

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
  v_foto   TEXT;
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
    v_foto   := NULLIF(btrim(COALESCE(r->>'foto_url', '')), '');

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

    -- TEMUAN BARU WAJIB BERFOTO. Temuan ini muncul di daftar Perlu Perbaikan
    -- yang sama dengan monitoring inspeksi, dan yang menerimanya di kantor
    -- tidak pernah melihat tiangnya. Baris tanpa foto berakhir jadi antrean
    -- yang tidak bisa dinilai mendesak atau tidak.
    IF NOT normal_baru AND v_nilai IS NOT NULL AND v_foto IS NULL THEN
      RAISE EXCEPTION
        'Temuan pada "%" wajib disertai foto. Potret keadaannya sebelum menyimpan.',
        it.nama;
    END IF;

    INSERT INTO public.inspeksi_jtm_periksa
      (titik_id, item_kode, bagian, sirkit_segmen_id, nilai, nilai_angka, catatan,
       sebab_tutup, foto_tutup_url, foto_url)
    VALUES (
      v_titik, it.kode, v_bagian, v_sirkit, v_nilai,
      NULLIF(r->>'nilai_angka', '')::numeric,
      NULLIF(r->>'catatan', ''),
      sebab,
      NULLIF(btrim(COALESCE(r->>'foto_tutup_url', '')), ''),
      v_foto)
    ON CONFLICT (titik_id, item_kode, bagian,
                 COALESCE(sirkit_segmen_id, '00000000-0000-0000-0000-000000000000'::uuid))
    DO UPDATE SET
      nilai = EXCLUDED.nilai,
      nilai_angka = EXCLUDED.nilai_angka,
      catatan = EXCLUDED.catatan,
      sebab_tutup = EXCLUDED.sebab_tutup,
      foto_tutup_url = EXCLUDED.foto_tutup_url,
      foto_url = EXCLUDED.foto_url,
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
    'tiang',    t.kode,
    'jarak_m',  round(COALESCE(v_jarak, 0)::numeric, 1),
    'jawaban',  jml,
    'temuan',   temuan
  );
END $$;


-- ── 7. Foto ikut terbawa ke daftar Perlu Perbaikan ───────────────────────────

-- `jtm_cakupan` ikut dibuat ulang karena bergantung pada view di bawahnya,
-- bukan karena isinya berubah. Urutannya dibalik saat membuat: yang paling
-- dalam lebih dulu.
DROP VIEW IF EXISTS public.jtm_perlu_perbaikan;
DROP VIEW IF EXISTS public.jtm_cakupan;
DROP VIEW IF EXISTS public.tiang_kondisi_terakhir;

CREATE VIEW public.tiang_kondisi_terakhir AS
WITH jawaban AS (
  SELECT
    tk.tiang_id,
    p.item_kode,
    p.bagian,
    p.sirkit_segmen_id,
    p.nilai,
    p.nilai_angka,
    p.catatan,
    p.foto_url,
    m.id          AS inspeksi_id,
    m.penyulang,
    m.ulp,
    m.tier,
    COALESCE(m.tgl_selesai, m.verified_at, m.tgl_mulai) AS tgl,
    row_number() OVER (
      PARTITION BY tk.tiang_id, p.item_kode, p.bagian,
                   COALESCE(p.sirkit_segmen_id, '00000000-0000-0000-0000-000000000000'::uuid)
      ORDER BY COALESCE(m.tgl_selesai, m.verified_at, m.tgl_mulai) DESC, p.updated_at DESC
    ) AS urut
  FROM public.inspeksi_jtm_periksa p
  JOIN public.inspeksi_jtm_titik tk ON tk.id = p.titik_id
  JOIN public.inspeksi_jtm m        ON m.id = tk.inspeksi_id
  WHERE m.status = 'Diverifikasi'
    AND (p.nilai IS NOT NULL OR p.nilai_angka IS NOT NULL)
)
SELECT
  j.tiang_id,
  t.kode AS tiang_kode,
  t.penyulang AS pemilik,
  j.ulp,
  j.item_kode,
  i.nama     AS item_nama,
  i.kelompok,
  i.tampil_dashboard,
  j.bagian,
  j.sirkit_segmen_id,
  s.nama     AS sirkit_nama,
  s.penyulang AS sirkit_penyulang,
  j.nilai,
  o.label    AS nilai_label,
  j.nilai_angka,
  j.catatan,
  j.foto_url,
  j.tgl,
  j.inspeksi_id,
  -- Item angka dan teks tidak punya daftar pilihan, jadi tidak punya penilaian
  -- normal/tidak. Dianggap normal supaya tidak jadi temuan palsu.
  COALESCE(o.normal, true) AS normal
FROM jawaban j
JOIN public.tiang t          ON t.id = j.tiang_id
JOIN public.jtm_item_ref i   ON i.kode = j.item_kode
LEFT JOIN public.jtm_opsi_ref o ON o.item_kode = j.item_kode AND o.kode = j.nilai
LEFT JOIN public.segmen s    ON s.id = j.sirkit_segmen_id
WHERE j.urut = 1;

COMMENT ON VIEW public.tiang_kondisi_terakhir IS
  'Keadaan tiap item per tiang menurut penyapuan terverifikasi terakhir. Dasar semua angka JTM.';


CREATE VIEW public.jtm_cakupan AS
WITH per_segmen AS (
  SELECT
    s.id AS segmen_id, s.nama, s.penyulang, s.ulp,
    count(st.tiang_id)                                        AS tiang,
    count(*) FILTER (WHERE k.tiang_id IS NOT NULL)            AS tiang_dinilai
  FROM public.segmen s
  LEFT JOIN public.segmen_tiang st ON st.segmen_id = s.id
  LEFT JOIN LATERAL (
    SELECT DISTINCT tiang_id FROM public.tiang_kondisi_terakhir k2
    WHERE k2.tiang_id = st.tiang_id
  ) k ON true
  WHERE s.status = 'aktif'
  GROUP BY s.id, s.nama, s.penyulang, s.ulp
)
SELECT
  p.*,
  round(100.0 * p.tiang_dinilai / NULLIF(p.tiang, 0), 1) AS persen_dinilai,
  (SELECT max(COALESCE(m.tgl_selesai, m.tgl_mulai))
     FROM public.inspeksi_jtm m
    WHERE m.segmen_id = p.segmen_id AND m.status = 'Diverifikasi') AS terakhir_disapu
FROM per_segmen p;


CREATE VIEW public.jtm_perlu_perbaikan AS
SELECT
  'penyapuan'::text     AS asal,
  k.tiang_id::text      AS acuan_id,
  k.tiang_kode          AS lokasi,
  k.pemilik             AS penyulang,
  k.ulp,
  k.sirkit_nama         AS segmen,
  k.item_nama           AS temuan,
  k.nilai_label         AS keadaan,
  k.bagian,
  k.catatan,
  k.foto_url,
  k.tgl                 AS ditemukan_pada,
  t.lat, t.lng
FROM public.tiang_kondisi_terakhir k
JOIN public.tiang t ON t.id = k.tiang_id
WHERE NOT k.normal

UNION ALL

SELECT
  'laporan'::text       AS asal,
  i.id::text            AS acuan_id,
  COALESCE(NULLIF(btrim(i.lokasi), ''), '—') AS lokasi,
  i.penyulang,
  i.ulp,
  NULL::text            AS segmen,
  COALESCE(NULLIF(btrim(i.temuan), ''), 'Temuan') AS temuan,
  i.status              AS keadaan,
  '-'::text             AS bagian,
  i.deskripsi           AS catatan,
  i.foto_sebelum_url    AS foto_url,
  i.tgl_inspeksi::timestamptz AS ditemukan_pada,
  -- Koordinat inspeksi lama tersimpan sebagai teks "lat, lng". Dipecah di sini
  -- supaya dua sumber bisa muncul di satu peta tanpa aplikasi menebak bentuknya.
  NULLIF(split_part(i.koordinat, ',', 1), '')::double precision AS lat,
  NULLIF(btrim(split_part(i.koordinat, ',', 2)), '')::double precision AS lng
FROM public.inspeksi i
WHERE COALESCE(i.status, '') NOT IN ('Selesai', 'Batal');

COMMENT ON VIEW public.jtm_perlu_perbaikan IS
  'Temuan JTM dari DUA sumber dengan penanda asal: turunan penyapuan (hilang sendiri begitu dicatat normal) dan laporan lepas yang belum selesai.';

GRANT SELECT ON public.tiang_kondisi_terakhir TO authenticated;
GRANT SELECT ON public.jtm_cakupan            TO authenticated;
GRANT SELECT ON public.jtm_perlu_perbaikan    TO authenticated;
GRANT EXECUTE ON FUNCTION public.jtm_selaraskan_opsi TO authenticated;
