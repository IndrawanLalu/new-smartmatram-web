-- =============================================================================
-- Fase 4.2e — Inspeksi JTM: penyapuan
-- Jalankan SESUDAH `jtm-impor.sql`. Idempoten.
--
-- TIGA ATURAN YANG BEKERJA BERSAMA. Menghapus salah satunya membuat dua yang
-- lain bocor:
--
--   1. SATU BENDA, SATU KEADAAN. Tidak ada dua catatan untuk satu tiang. Kalau
--      tiap penyulang menyimpan penilaiannya sendiri, "berapa tiang miring di
--      Ampenan" jadi pertanyaan berjawab dua.
--
--   2. YANG MENIMPA HANYA PENILAIAN YANG BENAR-BENAR DILAKUKAN. Item yang tidak
--      diisi tidak menghapus apa pun. Regu penumpang yang cuma lewat tidak
--      wajib menilai badan tiang — tapi kalau dia MELIHAT tiangnya miring, dia
--      mencatatnya dan itu yang berlaku. Yang dibatasi kewajiban mengisi, bukan
--      hak melaporkan.
--
--   3. MENUTUP TEMUAN HARUS PUNYA SEBAB, dan foto kalau sebabnya "sudah
--      diperbaiki". Tanpa ini, temuan hilang cuma karena inspeksi berikutnya
--      menjawab "tidak ada temuan" — persis keluhan yang membuat modul ini ada.
--
-- Temuan sendiri TIDAK PERNAH disimpan sebagai tabel. Dia diturunkan dari
-- kondisi item terakhir, jadi tidak ada baris temuan yang tertinggal terbuka
-- setelah barangnya betul-betul diperbaiki.
-- =============================================================================

-- ── 1. Penyapuan ─────────────────────────────────────────────────────────────
-- Satu baris per (segmen × tier × periode kerja). BOLEH BERHENTI DI TENGAH:
-- status tetap 'Dalam Proses' berhari-hari, dan cakupannya diukur apa adanya.

CREATE TABLE IF NOT EXISTS public.inspeksi_jtm (
  id        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  segmen_id UUID NOT NULL REFERENCES public.segmen(id) ON DELETE RESTRICT,

  -- Disalin saat penyapuan dibuat, tidak diambil dari segmen saat dibaca:
  -- kepemilikan segmen bisa dikoreksi belakangan, dan laporan lama harus tetap
  -- menyebut penyulang yang benar SAAT ITU.
  penyulang TEXT NOT NULL,
  ulp       TEXT NOT NULL,

  tier      TEXT NOT NULL DEFAULT '1',
  status    TEXT NOT NULL DEFAULT 'Dalam Proses',

  tgl_rencana DATE,
  tgl_mulai   TIMESTAMPTZ NOT NULL DEFAULT now(),
  tgl_selesai TIMESTAMPTZ,

  petugas_nama TEXT,
  petugas_uid  UUID,
  catatan      TEXT,

  verified_at   TIMESTAMPTZ,
  verified_by   TEXT,
  verified_note TEXT,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.inspeksi_jtm DROP CONSTRAINT IF EXISTS inspeksi_jtm_status_valid;
ALTER TABLE public.inspeksi_jtm ADD CONSTRAINT inspeksi_jtm_status_valid
  CHECK (status IN ('Dijadwalkan', 'Dalam Proses', 'Selesai', 'Diverifikasi', 'Ditolak'));

ALTER TABLE public.inspeksi_jtm DROP CONSTRAINT IF EXISTS inspeksi_jtm_tier_valid;
ALTER TABLE public.inspeksi_jtm ADD CONSTRAINT inspeksi_jtm_tier_valid
  CHECK (tier IN ('1', '2'));

CREATE INDEX IF NOT EXISTS inspeksi_jtm_segmen_idx ON public.inspeksi_jtm (segmen_id, status);
CREATE INDEX IF NOT EXISTS inspeksi_jtm_ulp_idx    ON public.inspeksi_jtm (ulp, status);

-- Satu penyapuan BERJALAN per segmen per tier. Dua yang terbuka bersamaan
-- membuat dua regu mengisi tiang yang sama tanpa saling tahu.
CREATE UNIQUE INDEX IF NOT EXISTS inspeksi_jtm_berjalan_unik
  ON public.inspeksi_jtm (segmen_id, tier)
  WHERE status IN ('Dijadwalkan', 'Dalam Proses');

COMMENT ON TABLE public.inspeksi_jtm IS
  'Penyapuan satu segmen. Boleh berhenti di tengah — cakupan diukur, tidak dipaksa lengkap.';

-- ── 2. Tiang yang dinilai ────────────────────────────────────────────────────
-- Bukti kedekatan ikut disimpan. Bukan kerewelan administratif: tanpa jarak dan
-- akurasi tersimpan, tidak ada cara membedakan tiang yang benar-benar
-- didatangi dari tiang yang dinilai dari atas motor di jalan sebelah.

CREATE TABLE IF NOT EXISTS public.inspeksi_jtm_titik (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  inspeksi_id UUID NOT NULL REFERENCES public.inspeksi_jtm(id) ON DELETE CASCADE,
  tiang_id    UUID NOT NULL REFERENCES public.tiang(id) ON DELETE CASCADE,

  dinilai_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  petugas_lat DOUBLE PRECISION,
  petugas_lng DOUBLE PRECISION,
  jarak_m     NUMERIC(8,1),
  akurasi_m   NUMERIC(8,1),
  catatan     TEXT,

  UNIQUE (inspeksi_id, tiang_id)
);

CREATE INDEX IF NOT EXISTS inspeksi_jtm_titik_tiang_idx ON public.inspeksi_jtm_titik (tiang_id);

-- ── 3. Jawaban ───────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.inspeksi_jtm_periksa (
  id       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  titik_id UUID NOT NULL REFERENCES public.inspeksi_jtm_titik(id) ON DELETE CASCADE,

  item_kode TEXT NOT NULL REFERENCES public.jtm_item_ref(kode),

  -- Fasa R/S/T, atau '-' untuk item yang dinilai sekali. '-' BUKAN NULL: dua
  -- NULL dianggap berbeda oleh kunci unik, jadi baris kembar akan lolos —
  -- jebakan yang sudah pernah kena di JTR.
  bagian TEXT NOT NULL DEFAULT '-',

  -- Untuk item berdimensi `sirkit`: kabel milik segmen yang mana. Di tiang
  -- bersama, konduktor MATARAM dan konduktor KOPEL A dinilai terpisah — dan
  -- tanpa kolom ini keduanya akan saling menimpa.
  sirkit_segmen_id UUID REFERENCES public.segmen(id) ON DELETE CASCADE,

  nilai       TEXT,
  nilai_angka NUMERIC,
  catatan     TEXT,

  -- Diisi HANYA saat jawaban ini menutup temuan yang sedang terbuka.
  sebab_tutup    TEXT,
  foto_tutup_url TEXT,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.inspeksi_jtm_periksa DROP CONSTRAINT IF EXISTS periksa_jtm_bagian_valid;
ALTER TABLE public.inspeksi_jtm_periksa ADD CONSTRAINT periksa_jtm_bagian_valid
  CHECK (bagian IN ('R', 'S', 'T', '-'));

ALTER TABLE public.inspeksi_jtm_periksa DROP CONSTRAINT IF EXISTS periksa_jtm_sebab_valid;
ALTER TABLE public.inspeksi_jtm_periksa ADD CONSTRAINT periksa_jtm_sebab_valid
  CHECK (sebab_tutup IS NULL OR sebab_tutup IN ('diperbaiki', 'tidak_ada', 'tidak_diperiksa'));

-- Kunci unik memakai COALESCE, bukan kolom apa adanya: `sirkit_segmen_id` yang
-- NULL pada item non-sirkit akan membuat kunci unik kehilangan giginya.
CREATE UNIQUE INDEX IF NOT EXISTS periksa_jtm_unik
  ON public.inspeksi_jtm_periksa
     (titik_id, item_kode, bagian,
      COALESCE(sirkit_segmen_id, '00000000-0000-0000-0000-000000000000'::uuid));

CREATE INDEX IF NOT EXISTS periksa_jtm_item_idx
  ON public.inspeksi_jtm_periksa (item_kode, nilai);

COMMENT ON COLUMN public.inspeksi_jtm_periksa.sebab_tutup IS
  'diperbaiki | tidak_ada | tidak_diperiksa. Wajib saat jawaban ini mengubah temuan terbuka jadi normal — supaya temuan tidak pernah hilang diam-diam.';

-- ── 4. Foto ──────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.inspeksi_jtm_foto (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  titik_id   UUID NOT NULL REFERENCES public.inspeksi_jtm_titik(id) ON DELETE CASCADE,
  kode       TEXT NOT NULL DEFAULT 'tiang',
  url        TEXT NOT NULL,
  lat        DOUBLE PRECISION,
  lng        DOUBLE PRECISION,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS inspeksi_jtm_foto_titik_idx ON public.inspeksi_jtm_foto (titik_id);

-- ── 5. Penjaga nilai ─────────────────────────────────────────────────────────
-- Salah ketik dari aplikasi menghasilkan nilai yang tidak cocok dengan opsi
-- mana pun: tidak terhitung normal, tidak terhitung temuan, hilang begitu saja
-- dari semua rekap. Ditolak di database, bukan hanya di aplikasi.

CREATE OR REPLACE FUNCTION public.jaga_nilai_periksa_jtm()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE it RECORD;
BEGIN
  SELECT * INTO it FROM public.jtm_item_ref WHERE kode = NEW.item_kode;
  IF NOT FOUND THEN RAISE EXCEPTION 'Item % tidak dikenal', NEW.item_kode; END IF;

  IF it.tipe = 'pilihan' AND NEW.nilai IS NOT NULL THEN
    IF NOT EXISTS (SELECT 1 FROM public.jtm_opsi_ref
                   WHERE item_kode = NEW.item_kode AND kode = NEW.nilai) THEN
      RAISE EXCEPTION 'Pilihan "%" tidak ada pada item %', NEW.nilai, NEW.item_kode;
    END IF;
  END IF;

  IF it.dimensi = 'tunggal' AND NEW.bagian <> '-' THEN
    RAISE EXCEPTION 'Item % dinilai sekali saja, bukan per fasa', NEW.item_kode;
  END IF;
  IF it.dimensi = 'fasa' AND NEW.bagian NOT IN ('R', 'S', 'T') THEN
    RAISE EXCEPTION 'Item % dinilai per fasa (R/S/T), bukan "%"', NEW.item_kode, NEW.bagian;
  END IF;
  IF it.dimensi = 'sirkit' AND NEW.sirkit_segmen_id IS NULL THEN
    RAISE EXCEPTION 'Item % dinilai per kabel — segmen pemilik kabelnya harus disebut',
      NEW.item_kode;
  END IF;

  NEW.updated_at := now();
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_jaga_nilai_periksa_jtm ON public.inspeksi_jtm_periksa;
CREATE TRIGGER trg_jaga_nilai_periksa_jtm
  BEFORE INSERT OR UPDATE ON public.inspeksi_jtm_periksa
  FOR EACH ROW EXECUTE FUNCTION public.jaga_nilai_periksa_jtm();

-- ── 6. Keadaan tiang sekarang ────────────────────────────────────────────────
-- Dari penyapuan TERVERIFIKASI terakhir, bukan yang terakhir dikerjakan. Angka
-- resmi tidak boleh digerakkan catatan yang belum diperiksa siapa pun.
--
-- Jawaban KOSONG diabaikan: baris yang tersimpan dengan sebab 'tidak_diperiksa'
-- memang bukti bahwa regu ditanya dan memilih tidak menimpa — tapi dia bukan
-- penilaian, jadi keadaan lama yang tetap berlaku.

DROP VIEW IF EXISTS public.jtm_perlu_perbaikan;
DROP VIEW IF EXISTS public.jtm_cakupan;
DROP VIEW IF EXISTS public.inspeksi_jtm_ringkas;
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

-- ── 7. Ringkasan penyapuan ───────────────────────────────────────────────────

CREATE VIEW public.inspeksi_jtm_ringkas AS
SELECT
  m.id,
  m.segmen_id,
  s.nama AS segmen_nama,
  m.penyulang,
  m.ulp,
  m.tier,
  m.status,
  m.tgl_rencana, m.tgl_mulai, m.tgl_selesai,
  m.petugas_nama,
  m.catatan,
  m.verified_at, m.verified_by, m.verified_note,
  (SELECT count(*) FROM public.segmen_tiang st WHERE st.segmen_id = m.segmen_id)
                                                        AS tiang_segmen,
  (SELECT count(*) FROM public.inspeksi_jtm_titik tk WHERE tk.inspeksi_id = m.id)
                                                        AS tiang_dinilai,
  (SELECT count(*)
     FROM public.inspeksi_jtm_titik tk
     JOIN public.inspeksi_jtm_periksa p ON p.titik_id = tk.id
    WHERE tk.inspeksi_id = m.id)                        AS jawaban,
  -- Dihitung LANGSUNG dari jawaban penyapuan ini, bukan lewat
  -- `tiang_kondisi_terakhir`. View itu hanya memuat yang sudah DIVERIFIKASI —
  -- padahal baris ini justru dipakai layar persetujuan, saat statusnya masih
  -- 'Selesai'. Lewat sana angkanya akan selalu 0 tepat pada pekerjaan yang
  -- sedang diperiksa admin: bukan galat, cuma bohong yang rapi.
  (SELECT count(*)
     FROM public.inspeksi_jtm_titik tk
     JOIN public.inspeksi_jtm_periksa p ON p.titik_id = tk.id
     JOIN public.jtm_opsi_ref o ON o.item_kode = p.item_kode AND o.kode = p.nilai
    WHERE tk.inspeksi_id = m.id AND NOT o.normal)       AS temuan,
  (SELECT count(*)
     FROM public.inspeksi_jtm_titik tk
     JOIN public.inspeksi_jtm_foto f ON f.titik_id = tk.id
    WHERE tk.inspeksi_id = m.id)                        AS jumlah_foto
FROM public.inspeksi_jtm m
LEFT JOIN public.segmen s ON s.id = m.segmen_id;

-- ── 8. Cakupan ───────────────────────────────────────────────────────────────
-- TIDAK DIKETAHUI ≠ TIDAK ADA. Tiang yang belum pernah dinilai bukan tiang yang
-- baik — dia tiang yang belum diperiksa, dan itu harus terlihat sebagai angkanya
-- sendiri.

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

-- ── 9. Satu daftar perlu perbaikan, dua sumber ───────────────────────────────
-- Inspeksi lama tetap hidup berdampingan, jadi temuannya harus bertemu di satu
-- tempat. Kalau tidak, "berapa temuan JTM belum ditangani" jadi pertanyaan
-- berjawab dua angka — dan yang menjumlahkan keduanya adalah orang, dengan
-- tangan, tiap kali ditanya.

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
  i.tgl_inspeksi::timestamptz AS ditemukan_pada,
  -- Koordinat inspeksi lama tersimpan sebagai teks "lat, lng". Dipecah di sini
  -- supaya dua sumber bisa muncul di satu peta tanpa aplikasi menebak bentuknya.
  NULLIF(split_part(i.koordinat, ',', 1), '')::double precision AS lat,
  NULLIF(btrim(split_part(i.koordinat, ',', 2)), '')::double precision AS lng
FROM public.inspeksi i
WHERE COALESCE(i.status, '') NOT IN ('Selesai', 'Batal');

COMMENT ON VIEW public.jtm_perlu_perbaikan IS
  'Temuan JTM dari DUA sumber dengan penanda asal: turunan penyapuan (hilang sendiri begitu dicatat normal) dan laporan lepas yang belum selesai.';

-- ── 10. Hak akses ────────────────────────────────────────────────────────────

DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'inspeksi_jtm', 'inspeksi_jtm_titik', 'inspeksi_jtm_periksa', 'inspeksi_jtm_foto'
  ] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS auth_all_%I ON public.%I', t, t);
    EXECUTE format(
      'CREATE POLICY auth_all_%I ON public.%I FOR ALL TO authenticated USING (true) WITH CHECK (true)',
      t, t);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON public.%I TO authenticated', t);
  END LOOP;
END $$;

GRANT SELECT ON public.tiang_kondisi_terakhir TO authenticated;
GRANT SELECT ON public.inspeksi_jtm_ringkas   TO authenticated;
GRANT SELECT ON public.jtm_cakupan            TO authenticated;
GRANT SELECT ON public.jtm_perlu_perbaikan    TO authenticated;

-- =============================================================================
-- Periksa hasilnya
-- =============================================================================
-- a. Cakupan penyapuan per segmen:
--      SELECT nama, penyulang, tiang, tiang_dinilai, persen_dinilai FROM jtm_cakupan
--      ORDER BY persen_dinilai;
--
-- b. Temuan menggantung dari dua sumber:
--      SELECT asal, count(*) FROM jtm_perlu_perbaikan GROUP BY asal;
--
-- c. Keadaan satu tiang sekarang:
--      SELECT item_nama, bagian, nilai_label, normal, tgl
--      FROM tiang_kondisi_terakhir WHERE tiang_kode = 'GNN-003';
-- =============================================================================
