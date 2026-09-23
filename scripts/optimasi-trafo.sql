-- =============================================================================
-- Optimasi Trafo (Fase 3.2) — fondasi
-- =============================================================================
-- Jalankan manual di Supabase SQL Editor, SESUDAH `master-usulan-schema.sql`
-- dan `hargardu-schema.sql` (yang membuat kolom `gardu.no_seri`). Aman diulang.
-- Rencana lengkap: `rencana-optimasi-trafo.md`.
--
-- ── KENAPA MODUL INI BERBEDA ────────────────────────────────────────────────
-- Semua pekerjaan lain MELAPORKAN keadaan aset. Ini satu-satunya yang
-- MENGUBAHNYA: trafo 100 kVA diganti 160 kVA, dan sejak detik itu pengukuran,
-- penyeimbangan, pemeliharaan, dan AMG memakai angka yang salah sampai
-- masternya ikut berubah. Karena itu keluarannya bukan cuma catatan realisasi,
-- tapi KOREKSI MASTER yang punya bukti dan punya persetujuan.
--
-- ── NOMOR SERI ADALAH KUNCINYA ──────────────────────────────────────────────
-- Trafo tidak lahir dan tidak hilang; dia berpindah. Trafo yang turun dari
-- gardu A lalu naik di gardu B adalah SATU benda, dan satu-satunya yang bisa
-- menyambungkan dua catatan itu adalah nomor serinya. kVA dan merk cuma
-- menjawab "trafo sejenis"; nomor seri menjawab "trafo INI".
--
-- Yang dibangun di atas itu:
--   · formulir HP mencari nomor seri trafo baru di master — kalau tercatat di
--     gardu lain, gardu itulah asalnya, tanpa regu perlu menebak kodenya;
--   · catatan di gardu asal dan di gardu tujuan saling mengenali lewat nomor
--     seri, jadi "jejak yang belum bersambung" bisa dihitung, bukan diingat;
--   · `riwayat_trafo` membaca perjalanan satu trafo dari nomor serinya.
--
-- ── KEADAAN DATA SAAT DITULIS (23 Sep 2026) ────────────────────────────────
-- `gardu.no_seri` baru terisi di 1 dari 2.536 gardu. Nilainya selama ini cuma
-- menumpang di `data_amg->>'NO SERI'` (terisi 2.420). Dari yang terisi:
--   · 76 bukan nomor seri — "0", "000…", "1", kosong. TIDAK disalin.
--   · 110 nomor seri dipakai lebih dari satu gardu (235 gardu terlibat) —
--     mis. "92903" di enam gardu. Disalin apa adanya, tapi pencarian TIDAK
--     pernah memilih sendiri kalau hasilnya lebih dari satu; regu yang memilih.
--     Kembaran ini justru daftar kerja: tiap optimasi yang membaca papan nama
--     mengurangi satu.
-- =============================================================================


-- ── 0. Nomor seri pembanding ────────────────────────────────────────────────
-- Papan nama ditulis "21R265385", AMG menyimpan "21R-265385", regu mengetik
-- "21r 265385". Tiga-tiganya trafo yang sama. Pembanding membuang semua yang
-- bukan huruf/angka dan menyeragamkan huruf besar — nilai aslinya TIDAK
-- diubah, yang diseragamkan hanya cara membandingkannya.

CREATE OR REPLACE FUNCTION public.seri_norm(p TEXT)
RETURNS TEXT LANGUAGE sql IMMUTABLE PARALLEL SAFE AS $$
  SELECT NULLIF(upper(regexp_replace(COALESCE(p, ''), '[^A-Za-z0-9]', '', 'g')), '')
$$;

COMMENT ON FUNCTION public.seri_norm IS
  'Nomor seri untuk dibandingkan: huruf besar, tanpa spasi/tanda baca. Nilai aslinya tetap tersimpan apa adanya.';

CREATE INDEX IF NOT EXISTS gardu_seri_norm_idx
  ON public.gardu (public.seri_norm(no_seri))
  WHERE no_seri IS NOT NULL;


-- ── 0b. Pindahkan nomor seri dari data_amg ke kolomnya sendiri ──────────────
-- Yang menumpang tidak bisa dijadikan acuan: tidak bisa diindeks, tidak bisa
-- dikoreksi lewat usulan, dan tidak ikut berubah saat trafonya diganti.
-- Hanya mengisi yang KOSONG — nilai yang sudah diisi orang tidak ditimpa.
-- Tiap isian dicatat di jejak audit supaya asal nilainya bisa diterangkan.

WITH calon AS (
  SELECT g.kode, g.ulp, btrim(g.data_amg->>'NO SERI') AS seri
  FROM public.gardu g
  WHERE g.no_seri IS NULL
    AND g.data_amg->>'NO SERI' IS NOT NULL
    -- "0", "000", "1" bukan nomor seri. Empat karakter adalah batas yang
    -- memisahkan isian asal-asalan dari nomor seri terpendek yang ada.
    AND length(COALESCE(public.seri_norm(g.data_amg->>'NO SERI'), '')) >= 4
    AND public.seri_norm(g.data_amg->>'NO SERI') !~ '^0+$'
),
isi AS (
  UPDATE public.gardu g
  SET no_seri = c.seri
  FROM calon c
  WHERE g.kode = c.kode AND g.ulp = c.ulp
  RETURNING g.kode, g.ulp, g.no_seri
)
INSERT INTO public.master_audit
  (entitas, entitas_kode, ulp, field, nilai_lama, nilai_baru, aksi, oleh_nama)
SELECT 'gardu', upper(kode), upper(ulp), 'no_seri', NULL,
       jsonb_build_object('nilai', no_seri), 'isi_dari_amg', 'optimasi-trafo.sql'
FROM isi;


-- ── 1. Daftar alasan ────────────────────────────────────────────────────────
-- Sepola `pemeliharaan_jaringan_ref`: daftar pilihan itu DATA, bukan kode.

CREATE TABLE IF NOT EXISTS public.optimasi_alasan_ref (
  -- TETAP. Yang boleh berubah labelnya; kode inilah yang tersimpan di tiap
  -- catatan, dan mengubahnya memutus catatan lama.
  kode    TEXT PRIMARY KEY,
  label   TEXT NOT NULL,
  urutan  INT     NOT NULL DEFAULT 100,
  aktif   BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.optimasi_alasan_ref IS
  'Daftar alasan optimasi trafo. Diubah dari halaman Optimasi Trafo di web, bukan lewat rilis aplikasi.';

-- Diputuskan 23 Sep 2026.
INSERT INTO public.optimasi_alasan_ref (kode, label, urutan) VALUES
  ('overload',      'Beban lebih (overload)',  10),
  ('underload',     'Beban rendah (underload)', 20),
  ('rusak',         'Trafo rusak/terbakar',     30),
  ('pengembangan',  'Pengembangan jaringan',    40),
  ('lainnya',       'Lainnya',                  999)
ON CONFLICT (kode) DO NOTHING;


-- ── 2. Catatan optimasi ─────────────────────────────────────────────────────
-- Satu baris = satu penggantian trafo di satu gardu.

CREATE TABLE IF NOT EXISTS public.optimasi_trafo (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- NULL = pekerjaan di luar WO. Pekerjaan lapangan tidak selalu menunggu
  -- kantor, dan yang tidak punya tempat mencatat akan dicatat di tempat yang
  -- salah — atau tidak sama sekali.
  -- TEXT, bukan UUID: `pengukuran_gardu.id` memang bertipe TEXT (warisan
  -- migrasi Firestore). FK dengan tipe berbeda ditolak Postgres.
  pengukuran_id TEXT REFERENCES public.pengukuran_gardu (id) ON DELETE SET NULL,

  -- ── Gardu yang dikerjakan ── (kode tidak unik lintas ULP → selalu berpasangan)
  kode_gardu    TEXT NOT NULL,
  ulp           TEXT NOT NULL,
  penyulang     TEXT,
  alamat        TEXT,

  -- ── Inti pekerjaannya ──
  kva_lama      NUMERIC NOT NULL,
  kva_baru      NUMERIC NOT NULL,
  -- Potret master SAAT dikirim. Kalau berbeda dari yang dibaca regu di papan
  -- nama, masternya yang salah sejak sebelum pekerjaan ini — dan itu temuan
  -- tersendiri yang tidak boleh hilang tertimpa angka baru.
  kva_lama_master     NUMERIC,

  -- Nomor seri LAMA boleh kosong hanya kalau papan namanya memang tidak
  -- terbaca (trafo terbakar). Itu dinyatakan terang-terangan lewat
  -- `seri_lama_tak_terbaca`, bukan dengan membiarkan kolomnya kosong diam-diam.
  no_seri_lama        TEXT,
  seri_lama_tak_terbaca BOOLEAN NOT NULL DEFAULT false,
  no_seri_lama_master TEXT,
  -- Trafo yang baru dipasang papan namanya selalu bisa dibaca. Wajib.
  no_seri_baru        TEXT NOT NULL,
  merk_baru     TEXT,
  tahun_baru    INT,

  -- ── Dari mana trafo baru, ke mana trafo lama ──
  asal_trafo        TEXT NOT NULL,
  asal_kode_gardu   TEXT,
  asal_ulp          TEXT,
  -- Wajib, bawaan GUDANG. Tidak ada "belum tahu" — jejak yang berlubang tidak
  -- akan pernah ditagih kelengkapannya oleh siapa pun. (Diputuskan 23 Sep 2026.)
  tujuan_trafo_lama TEXT NOT NULL DEFAULT 'GUDANG',
  tujuan_kode_gardu TEXT,
  tujuan_ulp        TEXT,

  alasan        TEXT NOT NULL REFERENCES public.optimasi_alasan_ref (kode),

  -- Nama kolom mengikuti AMG, supaya ekspornya tinggal memetakan.
  tgl_mutasi    DATE NOT NULL DEFAULT CURRENT_DATE,
  tgl_operasi   DATE NOT NULL DEFAULT CURRENT_DATE,

  -- NOT NULL dua-duanya. Papan nama adalah satu-satunya bukti nomor seri, dan
  -- nomor seri adalah satu-satunya yang menyambungkan perpindahan trafo.
  foto_nameplate_lama_url TEXT NOT NULL,
  foto_nameplate_baru_url TEXT NOT NULL,

  lat           DOUBLE PRECISION,
  lng           DOUBLE PRECISION,
  akurasi       DOUBLE PRECISION,

  -- Selesai → Diverifikasi, atau Dibatalkan. TIDAK dihapus.
  status        TEXT NOT NULL DEFAULT 'Selesai',
  petugas_uid   UUID,
  petugas_nama  TEXT,
  catatan       TEXT,

  -- Admin menyatakan gardu seberang (asal atau tujuan) sudah dipastikan, untuk kasus yang tidak
  -- tersambung sendiri lewat nomor seri (lihat kolom jejak_* di `optimasi_trafo_daftar`).
  jejak_dipastikan_at TIMESTAMPTZ,
  jejak_dipastikan_by TEXT,

  verified_at   TIMESTAMPTZ,
  verified_by   TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.optimasi_trafo DROP CONSTRAINT IF EXISTS optimasi_trafo_status_valid;
ALTER TABLE public.optimasi_trafo ADD CONSTRAINT optimasi_trafo_status_valid
  CHECK (status IN ('Selesai', 'Diverifikasi', 'Dibatalkan'));

ALTER TABLE public.optimasi_trafo DROP CONSTRAINT IF EXISTS optimasi_trafo_asal_valid;
ALTER TABLE public.optimasi_trafo ADD CONSTRAINT optimasi_trafo_asal_valid CHECK (
  (asal_trafo = 'GUDANG' AND asal_kode_gardu IS NULL AND asal_ulp IS NULL) OR
  (asal_trafo = 'GARDU'  AND asal_kode_gardu IS NOT NULL AND asal_ulp IS NOT NULL)
);

ALTER TABLE public.optimasi_trafo DROP CONSTRAINT IF EXISTS optimasi_trafo_tujuan_valid;
ALTER TABLE public.optimasi_trafo ADD CONSTRAINT optimasi_trafo_tujuan_valid CHECK (
  (tujuan_trafo_lama IN ('GUDANG', 'PERBAIKAN') AND tujuan_kode_gardu IS NULL AND tujuan_ulp IS NULL) OR
  (tujuan_trafo_lama = 'GARDU' AND tujuan_kode_gardu IS NOT NULL AND tujuan_ulp IS NOT NULL)
);

ALTER TABLE public.optimasi_trafo DROP CONSTRAINT IF EXISTS optimasi_trafo_seri_lama_valid;
ALTER TABLE public.optimasi_trafo ADD CONSTRAINT optimasi_trafo_seri_lama_valid
  CHECK (no_seri_lama IS NOT NULL OR seri_lama_tak_terbaca);

CREATE INDEX IF NOT EXISTS optimasi_trafo_ulp_idx
  ON public.optimasi_trafo (ulp, tgl_operasi DESC);
CREATE INDEX IF NOT EXISTS optimasi_trafo_gardu_idx
  ON public.optimasi_trafo (upper(kode_gardu), upper(ulp));
CREATE INDEX IF NOT EXISTS optimasi_trafo_pengukuran_idx
  ON public.optimasi_trafo (pengukuran_id) WHERE pengukuran_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS optimasi_trafo_seri_baru_idx
  ON public.optimasi_trafo (public.seri_norm(no_seri_baru));
CREATE INDEX IF NOT EXISTS optimasi_trafo_seri_lama_idx
  ON public.optimasi_trafo (public.seri_norm(no_seri_lama)) WHERE no_seri_lama IS NOT NULL;

COMMENT ON TABLE public.optimasi_trafo IS
  'Penggantian trafo (uprating/downrating) — satu baris satu gardu. Menghasilkan usulan koreksi master yang menunggu persetujuan.';


-- ── 3. WO yang masih terbuka ────────────────────────────────────────────────
-- Tiruan `v_wo_pemerataan_terbuka`, dengan satu beda: tidak ada tahap klaim.
-- Optimasi dikerjakan dalam satu kali datang, jadi WO hilang dari daftar
-- begitu catatannya TERKIRIM — draf di HP tidak menghitung.
--
-- Spek master ikut dibawa supaya formulir HP langsung terisi kVA dan nomor
-- seri yang tercatat, dan regu tinggal membandingkannya dengan papan nama.

CREATE OR REPLACE VIEW public.v_wo_optimasi_terbuka
WITH (security_invoker = true) AS
SELECT
  pg.id                  AS pengukuran_id,
  pg.no_gardu,
  pg.alamat,
  pg.penyulang,
  pg.petugas_unit        AS ulp,
  pg.kva_trafo,
  pg.tanggal_pengukuran,
  pg.wo_sent_at,
  -- Alasan WO melekat pada pengukurannya, bukan pada ingatan orang.
  pg.persen_beban,
  pg.beban_kva,
  pg.suhu_trafo,
  g.daya                 AS kva_master,
  g.no_seri              AS no_seri_master,
  g.merk                 AS merk_master,
  g.nama                 AS nama_gardu
FROM public.pengukuran_gardu pg
LEFT JOIN public.gardu g
  ON upper(g.kode) = upper(pg.no_gardu) AND upper(g.ulp) = upper(pg.petugas_unit)
WHERE pg.jenis_pemeliharaan = 'OPTIMASI TRAFO'
  AND pg.hasil_penyeimbangan_id IS NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.optimasi_trafo o
    WHERE o.pengukuran_id = pg.id AND o.status <> 'Dibatalkan'
  );

GRANT SELECT ON public.v_wo_optimasi_terbuka TO authenticated;


-- ── 4. Cari trafo dari nomor serinya ────────────────────────────────────────
-- Menjawab "trafo ini sekarang di mana". Dua sumber, karena trafo bisa berada
-- di dua macam tempat:
--   · terpasang di gardu  → master `gardu.no_seri`
--   · sudah dilepas       → catatan optimasi terakhir yang melepasnya
--                            (ke gudang, perbaikan, atau gardu lain)
-- Mengembalikan SEMUA yang cocok. Kalau lebih dari satu, aplikasi tidak boleh
-- memilih sendiri — 110 nomor seri di master memang masih kembar.

CREATE OR REPLACE FUNCTION public.cari_trafo_seri(p_seri TEXT)
RETURNS TABLE (
  sumber     TEXT,      -- 'master' | 'dilepas'
  kode_gardu TEXT,
  ulp        TEXT,
  nama       TEXT,
  alamat     TEXT,
  penyulang  TEXT,
  kva        NUMERIC,
  merk       TEXT,
  no_seri    TEXT,
  keterangan TEXT
)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public AS $$
  WITH k AS (SELECT public.seri_norm(p_seri) AS s)
  SELECT 'master', g.kode, g.ulp, g.nama, g.alamat, g.feeder,
         g.daya::numeric, g.merk, g.no_seri,
         'Tercatat terpasang di gardu ini'
  FROM public.gardu g, k
  WHERE k.s IS NOT NULL AND length(k.s) >= 4
    AND public.seri_norm(g.no_seri) = k.s
  UNION ALL
  (SELECT 'dilepas', o.kode_gardu, o.ulp, NULL, o.alamat, o.penyulang,
          o.kva_lama, NULL, o.no_seri_lama,
          'Dilepas ' || to_char(o.tgl_mutasi, 'DD-MM-YYYY') || ' → ' ||
          CASE o.tujuan_trafo_lama
            WHEN 'GARDU' THEN 'gardu ' || o.tujuan_kode_gardu || ' (' || o.tujuan_ulp || ')'
            ELSE lower(o.tujuan_trafo_lama)
          END
   FROM public.optimasi_trafo o, k
   WHERE k.s IS NOT NULL AND length(k.s) >= 4
     AND o.status <> 'Dibatalkan'
     AND public.seri_norm(o.no_seri_lama) = k.s
   ORDER BY o.tgl_mutasi DESC, o.created_at DESC
   LIMIT 1)
$$;

GRANT EXECUTE ON FUNCTION public.cari_trafo_seri(TEXT) TO authenticated;


-- ── 5. Usulan master dari satu catatan optimasi ─────────────────────────────
-- Satu catatan menghasilkan beberapa usulan — satu per field yang berubah
-- (daya, no_seri, merk, tahun_pembuatan) — karena `master_usulan` memang satu
-- baris per field. Semuanya disambung lewat `sumber_modul` + `sumber_id`, dan
-- diputuskan BERSAMA saat admin memverifikasi catatannya.
--
-- `diterapkan_langsung = false`: master TIDAK berubah sampai disetujui. Aturan
-- itu sudah tertulis di `master-usulan-schema.sql` untuk kVA — "salah di situ
-- menggerakkan orang dan barang" — dan modul ini tidak membuat pengecualian
-- untuk dirinya sendiri.
--
-- Dipanggil ulang setiap catatan dikoreksi. Usulan yang MASIH MENUNGGU dihapus
-- lalu dibuat lagi dari isian terbaru: belum ada keputusan yang menempel
-- padanya, dan belum ada jejak audit yang menunjuknya. Yang sudah diputuskan
-- tidak disentuh.

CREATE OR REPLACE FUNCTION public._optimasi_susun_usulan(p_id UUID)
RETURNS INT
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  o   RECORD;
  g   RECORD;
  n   INT := 0;
  ket TEXT;
BEGIN
  SELECT * INTO o FROM public.optimasi_trafo WHERE id = p_id;
  IF NOT FOUND THEN RETURN 0; END IF;

  DELETE FROM public.master_usulan
  WHERE sumber_modul = 'optimasi_trafo' AND sumber_id = p_id AND status = 'menunggu';

  IF o.status = 'Dibatalkan' THEN RETURN 0; END IF;

  SELECT daya, no_seri, merk, tahun_pembuatan INTO g
  FROM public.gardu
  WHERE upper(kode) = upper(o.kode_gardu) AND upper(ulp) = upper(o.ulp);

  ket := format('Optimasi trafo: %s → %s kVA, seri %s → %s',
                o.kva_lama, o.kva_baru,
                COALESCE(o.no_seri_lama, 'tak terbaca'), o.no_seri_baru);

  INSERT INTO public.master_usulan (
    entitas, entitas_kode, ulp, field, nilai_lama, nilai_baru,
    bukti_lat, bukti_lng, bukti_akurasi, bukti_foto, catatan,
    sumber_modul, sumber_id, pengusul_uid, pengusul_nama,
    diterapkan_langsung, status
  )
  SELECT 'gardu', upper(o.kode_gardu), upper(o.ulp), f.field,
         CASE WHEN f.lama IS NULL THEN NULL ELSE jsonb_build_object('nilai', f.lama) END,
         jsonb_build_object('nilai', f.baru),
         o.lat, o.lng, o.akurasi,
         ARRAY[o.foto_nameplate_baru_url, o.foto_nameplate_lama_url], ket,
         'optimasi_trafo', o.id, o.petugas_uid, o.petugas_nama,
         false, 'menunggu'
  FROM (VALUES
    ('daya',            g.daya::text,            o.kva_baru::text),
    ('no_seri',         g.no_seri,               o.no_seri_baru),
    ('merk',            g.merk,                  o.merk_baru),
    ('tahun_pembuatan', g.tahun_pembuatan::text, o.tahun_baru::text)
  ) AS f(field, lama, baru)
  WHERE f.baru IS NOT NULL AND btrim(f.baru) <> ''
    -- Nilai yang sudah sama dengan master tidak perlu diusulkan.
    AND (
      CASE WHEN f.field = 'no_seri'
           THEN public.seri_norm(f.lama) IS DISTINCT FROM public.seri_norm(f.baru)
           WHEN f.field = 'daya'
           THEN f.lama IS NULL OR f.lama::numeric <> f.baru::numeric
           ELSE upper(btrim(COALESCE(f.lama, ''))) <> upper(btrim(f.baru))
      END
    );

  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END $$;

REVOKE ALL ON FUNCTION public._optimasi_susun_usulan(UUID) FROM PUBLIC;


-- ── 6. Penjaga isian — dipakai simpan DAN koreksi ───────────────────────────
-- Satu tempat, supaya aturan yang berlaku saat mengirim tidak berbeda dari
-- aturan yang berlaku saat mengoreksi. Dua salinan aturan selalu berakhir
-- dengan salah satunya tertinggal.

CREATE OR REPLACE FUNCTION public._optimasi_periksa(
  p_kode TEXT, p_ulp TEXT,
  p_kva_lama NUMERIC, p_kva_baru NUMERIC,
  p_seri_lama TEXT, p_seri_tak_terbaca BOOLEAN, p_seri_baru TEXT,
  p_asal TEXT, p_asal_kode TEXT, p_asal_ulp TEXT,
  p_tujuan TEXT, p_tujuan_kode TEXT, p_tujuan_ulp TEXT,
  p_alasan TEXT
) RETURNS VOID
LANGUAGE plpgsql STABLE SET search_path = public AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.gardu
                 WHERE upper(kode) = upper(p_kode) AND upper(ulp) = upper(p_ulp)) THEN
    RAISE EXCEPTION 'Gardu % di ULP % tidak ada di master', p_kode, p_ulp;
  END IF;

  IF COALESCE(p_kva_lama, 0) <= 0 OR COALESCE(p_kva_baru, 0) <= 0 THEN
    RAISE EXCEPTION 'kVA lama dan kVA baru wajib diisi';
  END IF;

  IF public.seri_norm(p_seri_baru) IS NULL THEN
    RAISE EXCEPTION 'Nomor seri trafo baru wajib diisi — dibaca dari papan namanya';
  END IF;
  IF public.seri_norm(p_seri_lama) IS NULL AND NOT COALESCE(p_seri_tak_terbaca, false) THEN
    RAISE EXCEPTION 'Nomor seri trafo lama wajib diisi, atau nyatakan papan namanya tidak terbaca';
  END IF;
  IF public.seri_norm(p_seri_lama) = public.seri_norm(p_seri_baru) THEN
    RAISE EXCEPTION 'Nomor seri lama dan baru sama — kalau trafonya diganti, nomor serinya pasti berbeda';
  END IF;

  IF p_asal NOT IN ('GUDANG', 'GARDU') THEN
    RAISE EXCEPTION 'Asal trafo harus Gudang atau Gardu';
  END IF;
  IF p_asal = 'GARDU' THEN
    IF NOT EXISTS (SELECT 1 FROM public.gardu
                   WHERE upper(kode) = upper(p_asal_kode) AND upper(ulp) = upper(p_asal_ulp)) THEN
      RAISE EXCEPTION 'Gardu asal % di ULP % tidak ada di master', p_asal_kode, p_asal_ulp;
    END IF;
    IF upper(p_asal_kode) = upper(p_kode) AND upper(p_asal_ulp) = upper(p_ulp) THEN
      RAISE EXCEPTION 'Gardu asal tidak boleh gardu yang sedang dikerjakan';
    END IF;
  END IF;

  IF p_tujuan NOT IN ('GUDANG', 'GARDU', 'PERBAIKAN') THEN
    RAISE EXCEPTION 'Tujuan trafo lama harus Gudang, Gardu lain, atau Perbaikan';
  END IF;
  IF p_tujuan = 'GARDU' THEN
    IF NOT EXISTS (SELECT 1 FROM public.gardu
                   WHERE upper(kode) = upper(p_tujuan_kode) AND upper(ulp) = upper(p_tujuan_ulp)) THEN
      RAISE EXCEPTION 'Gardu tujuan % di ULP % tidak ada di master', p_tujuan_kode, p_tujuan_ulp;
    END IF;
    IF upper(p_tujuan_kode) = upper(p_kode) AND upper(p_tujuan_ulp) = upper(p_ulp) THEN
      RAISE EXCEPTION 'Gardu tujuan tidak boleh gardu yang sedang dikerjakan';
    END IF;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.optimasi_alasan_ref WHERE kode = p_alasan AND aktif) THEN
    RAISE EXCEPTION 'Alasan "%" tidak ada di daftar yang aktif', p_alasan;
  END IF;
END $$;


-- ── 7. Kirim dari HP ────────────────────────────────────────────────────────
-- Dipanggil saat regu menekan KIRIM (teknisaplikasi.md butir 1), bukan saat
-- menyimpan draf. Catatan, usulan master, dan pemeriksaannya satu transaksi:
-- kalau salah satu gagal, tidak ada yang tertulis.

CREATE OR REPLACE FUNCTION public.simpan_optimasi_trafo(
  p_kode_gardu   TEXT,
  p_ulp          TEXT,
  p_kva_lama     NUMERIC,
  p_kva_baru     NUMERIC,
  p_no_seri_lama TEXT,
  p_no_seri_baru TEXT,
  p_asal         TEXT,
  p_tujuan       TEXT,
  p_alasan       TEXT,
  p_foto_lama    TEXT,
  p_foto_baru    TEXT,
  p_seri_lama_tak_terbaca BOOLEAN DEFAULT false,
  p_pengukuran_id TEXT DEFAULT NULL,
  p_merk_baru    TEXT DEFAULT NULL,
  p_tahun_baru   INT  DEFAULT NULL,
  p_asal_kode    TEXT DEFAULT NULL,
  p_asal_ulp     TEXT DEFAULT NULL,
  p_tujuan_kode  TEXT DEFAULT NULL,
  p_tujuan_ulp   TEXT DEFAULT NULL,
  p_tgl_mutasi   DATE DEFAULT NULL,
  p_tgl_operasi  DATE DEFAULT NULL,
  p_lat          DOUBLE PRECISION DEFAULT NULL,
  p_lng          DOUBLE PRECISION DEFAULT NULL,
  p_akurasi      DOUBLE PRECISION DEFAULT NULL,
  p_catatan      TEXT DEFAULT NULL,
  p_nama         TEXT DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_asal   TEXT := upper(btrim(COALESCE(p_asal, '')));
  v_tujuan TEXT := upper(btrim(COALESCE(p_tujuan, 'GUDANG')));
  g        RECORD;
  v_id     UUID;
  v_usulan INT;
BEGIN
  PERFORM public._optimasi_periksa(
    p_kode_gardu, p_ulp, p_kva_lama, p_kva_baru,
    p_no_seri_lama, p_seri_lama_tak_terbaca, p_no_seri_baru,
    v_asal, p_asal_kode, p_asal_ulp, v_tujuan, p_tujuan_kode, p_tujuan_ulp,
    p_alasan);

  IF btrim(COALESCE(p_foto_lama, '')) = '' OR btrim(COALESCE(p_foto_baru, '')) = '' THEN
    RAISE EXCEPTION 'Foto papan nama trafo lama dan baru dua-duanya wajib';
  END IF;

  -- WO yang sama tidak boleh terkirim dua kali. Ini terjadi kalau Kirim
  -- ditekan dua kali di sinyal yang lambat — respons pertama belum kembali,
  -- drafnya belum terhapus, dan regu menekan lagi.
  IF p_pengukuran_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.optimasi_trafo
    WHERE pengukuran_id = p_pengukuran_id AND status <> 'Dibatalkan'
  ) THEN
    RAISE EXCEPTION 'WO ini sudah punya catatan optimasi yang terkirim';
  END IF;

  -- Identitas gardu diambil dari MASTER, bukan dari kiriman HP.
  SELECT kode, ulp, feeder, alamat, daya, no_seri INTO g
  FROM public.gardu
  WHERE upper(kode) = upper(p_kode_gardu) AND upper(ulp) = upper(p_ulp);

  INSERT INTO public.optimasi_trafo (
    pengukuran_id, kode_gardu, ulp, penyulang, alamat,
    kva_lama, kva_baru, kva_lama_master,
    no_seri_lama, seri_lama_tak_terbaca, no_seri_lama_master, no_seri_baru,
    merk_baru, tahun_baru,
    asal_trafo, asal_kode_gardu, asal_ulp,
    tujuan_trafo_lama, tujuan_kode_gardu, tujuan_ulp,
    alasan, tgl_mutasi, tgl_operasi,
    foto_nameplate_lama_url, foto_nameplate_baru_url,
    lat, lng, akurasi, petugas_uid, petugas_nama, catatan
  ) VALUES (
    p_pengukuran_id, upper(g.kode), upper(g.ulp), g.feeder, g.alamat,
    p_kva_lama, p_kva_baru, g.daya::numeric,
    NULLIF(btrim(COALESCE(p_no_seri_lama, '')), ''),
    COALESCE(p_seri_lama_tak_terbaca, false) AND public.seri_norm(p_no_seri_lama) IS NULL,
    g.no_seri,
    btrim(p_no_seri_baru),
    NULLIF(btrim(COALESCE(p_merk_baru, '')), ''), p_tahun_baru,
    v_asal,
    CASE WHEN v_asal = 'GARDU' THEN upper(btrim(p_asal_kode)) END,
    CASE WHEN v_asal = 'GARDU' THEN upper(btrim(p_asal_ulp)) END,
    v_tujuan,
    CASE WHEN v_tujuan = 'GARDU' THEN upper(btrim(p_tujuan_kode)) END,
    CASE WHEN v_tujuan = 'GARDU' THEN upper(btrim(p_tujuan_ulp)) END,
    p_alasan,
    COALESCE(p_tgl_mutasi, CURRENT_DATE), COALESCE(p_tgl_operasi, CURRENT_DATE),
    p_foto_lama, p_foto_baru,
    p_lat, p_lng, p_akurasi, auth.uid(), p_nama,
    NULLIF(btrim(COALESCE(p_catatan, '')), '')
  )
  RETURNING id INTO v_id;

  v_usulan := public._optimasi_susun_usulan(v_id);

  RETURN jsonb_build_object('id', v_id, 'usulan', v_usulan);
END $$;

COMMENT ON FUNCTION public.simpan_optimasi_trafo IS
  'Mengirim satu optimasi trafo dari HP. Identitas gardu dari master; usulan koreksi master dibuat otomatis dan menunggu persetujuan.';


-- ── 8. Koreksi dari HP ──────────────────────────────────────────────────────
-- Selama BELUM diverifikasi (teknisaplikasi.md butir 2). Gardu dan WO-nya
-- tidak bisa diganti di sini: salah gardu berarti catatan yang salah, dan
-- jalannya dibatalkan lalu dicatat ulang — bukan dipindah diam-diam.
-- Foto NULL = foto lama dipertahankan.

CREATE OR REPLACE FUNCTION public.ubah_optimasi_trafo(
  p_id           UUID,
  p_kva_lama     NUMERIC,
  p_kva_baru     NUMERIC,
  p_no_seri_lama TEXT,
  p_no_seri_baru TEXT,
  p_asal         TEXT,
  p_tujuan       TEXT,
  p_alasan       TEXT,
  p_seri_lama_tak_terbaca BOOLEAN DEFAULT false,
  p_merk_baru    TEXT DEFAULT NULL,
  p_tahun_baru   INT  DEFAULT NULL,
  p_asal_kode    TEXT DEFAULT NULL,
  p_asal_ulp     TEXT DEFAULT NULL,
  p_tujuan_kode  TEXT DEFAULT NULL,
  p_tujuan_ulp   TEXT DEFAULT NULL,
  p_tgl_mutasi   DATE DEFAULT NULL,
  p_tgl_operasi  DATE DEFAULT NULL,
  p_lat          DOUBLE PRECISION DEFAULT NULL,
  p_lng          DOUBLE PRECISION DEFAULT NULL,
  p_catatan      TEXT DEFAULT NULL,
  p_foto_lama    TEXT DEFAULT NULL,
  p_foto_baru    TEXT DEFAULT NULL
) RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  o        RECORD;
  v_asal   TEXT := upper(btrim(COALESCE(p_asal, '')));
  v_tujuan TEXT := upper(btrim(COALESCE(p_tujuan, 'GUDANG')));
BEGIN
  SELECT * INTO o FROM public.optimasi_trafo WHERE id = p_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Catatan tidak ditemukan'; END IF;
  IF o.status <> 'Selesai' THEN
    RAISE EXCEPTION 'Catatan ini sudah % — koreksinya lewat admin', lower(o.status);
  END IF;

  PERFORM public._optimasi_periksa(
    o.kode_gardu, o.ulp, p_kva_lama, p_kva_baru,
    p_no_seri_lama, p_seri_lama_tak_terbaca, p_no_seri_baru,
    v_asal, p_asal_kode, p_asal_ulp, v_tujuan, p_tujuan_kode, p_tujuan_ulp,
    p_alasan);

  UPDATE public.optimasi_trafo SET
    kva_lama   = p_kva_lama,
    kva_baru   = p_kva_baru,
    no_seri_lama = NULLIF(btrim(COALESCE(p_no_seri_lama, '')), ''),
    seri_lama_tak_terbaca = COALESCE(p_seri_lama_tak_terbaca, false) AND public.seri_norm(p_no_seri_lama) IS NULL,
    no_seri_baru = btrim(p_no_seri_baru),
    merk_baru  = NULLIF(btrim(COALESCE(p_merk_baru, '')), ''),
    tahun_baru = p_tahun_baru,
    asal_trafo = v_asal,
    asal_kode_gardu = CASE WHEN v_asal = 'GARDU' THEN upper(btrim(p_asal_kode)) END,
    asal_ulp        = CASE WHEN v_asal = 'GARDU' THEN upper(btrim(p_asal_ulp)) END,
    tujuan_trafo_lama = v_tujuan,
    tujuan_kode_gardu = CASE WHEN v_tujuan = 'GARDU' THEN upper(btrim(p_tujuan_kode)) END,
    tujuan_ulp        = CASE WHEN v_tujuan = 'GARDU' THEN upper(btrim(p_tujuan_ulp)) END,
    alasan     = p_alasan,
    tgl_mutasi = COALESCE(p_tgl_mutasi, tgl_mutasi),
    tgl_operasi = COALESCE(p_tgl_operasi, tgl_operasi),
    lat        = COALESCE(p_lat, lat),
    lng        = COALESCE(p_lng, lng),
    catatan    = NULLIF(btrim(COALESCE(p_catatan, '')), ''),
    foto_nameplate_lama_url = COALESCE(NULLIF(btrim(COALESCE(p_foto_lama, '')), ''), foto_nameplate_lama_url),
    foto_nameplate_baru_url = COALESCE(NULLIF(btrim(COALESCE(p_foto_baru, '')), ''), foto_nameplate_baru_url),
    updated_at = now()
  WHERE id = p_id;

  -- Usulan ikut isian terbaru — admin tidak boleh menyetujui angka yang sudah
  -- dikoreksi regunya sendiri.
  PERFORM public._optimasi_susun_usulan(p_id);
END $$;


-- ── 9. Keputusan admin ──────────────────────────────────────────────────────
-- Memverifikasi catatan = menyetujui SEMUA usulan master yang lahir darinya,
-- dalam satu transaksi. Dua tombol untuk satu keputusan akan berakhir dengan
-- catatan "Diverifikasi" yang masternya tidak pernah bergerak.
--
-- Usulan yang sudah diputuskan di tempat lain (layar usulan koreksi umum)
-- dilewati, bukan diputuskan ulang.

CREATE OR REPLACE FUNCTION public.verifikasi_optimasi_trafo(
  p_id   UUID,
  p_nama TEXT DEFAULT NULL
) RETURNS INT
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  u RECORD;
  n INT := 0;
BEGIN
  UPDATE public.optimasi_trafo
  SET status = 'Diverifikasi', verified_at = now(), verified_by = p_nama, updated_at = now()
  WHERE id = p_id AND status = 'Selesai';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Catatan tidak ditemukan, atau sudah diverifikasi/dibatalkan';
  END IF;

  FOR u IN
    SELECT id FROM public.master_usulan
    WHERE sumber_modul = 'optimasi_trafo' AND sumber_id = p_id AND status = 'menunggu'
  LOOP
    PERFORM public.putuskan_usulan(u.id, true, p_nama, 'Optimasi trafo diverifikasi');
    n := n + 1;
  END LOOP;

  RETURN n;
END $$;

CREATE OR REPLACE FUNCTION public.batalkan_optimasi_trafo(
  p_id     UUID,
  p_alasan TEXT,
  p_nama   TEXT DEFAULT NULL
) RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  u RECORD;
BEGIN
  IF btrim(COALESCE(p_alasan, '')) = '' THEN
    RAISE EXCEPTION 'Alasan pembatalan wajib diisi';
  END IF;

  -- Yang sudah diverifikasi sudah mengubah master. Membatalkannya di sini
  -- tidak akan mengembalikan master, jadi tidak diizinkan: koreksinya lewat
  -- master gardu, dengan jejak auditnya sendiri.
  UPDATE public.optimasi_trafo
  SET status = 'Dibatalkan',
      catatan = btrim(COALESCE(catatan || ' | ', '') || 'dibatalkan: ' || p_alasan),
      verified_by = p_nama,
      updated_at = now()
  WHERE id = p_id AND status = 'Selesai';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Hanya catatan yang belum diverifikasi yang bisa dibatalkan';
  END IF;

  FOR u IN
    SELECT id FROM public.master_usulan
    WHERE sumber_modul = 'optimasi_trafo' AND sumber_id = p_id AND status = 'menunggu'
  LOOP
    PERFORM public.putuskan_usulan(u.id, false, p_nama, 'Optimasi trafo dibatalkan: ' || p_alasan);
  END LOOP;
END $$;

CREATE OR REPLACE FUNCTION public.pastikan_jejak_optimasi(
  p_id   UUID,
  p_nama TEXT DEFAULT NULL
) RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE public.optimasi_trafo
  SET jejak_dipastikan_at = now(), jejak_dipastikan_by = p_nama, updated_at = now()
  WHERE id = p_id AND (asal_trafo = 'GARDU' OR tujuan_trafo_lama = 'GARDU');
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Catatan tidak ditemukan, atau tidak melibatkan gardu lain';
  END IF;
END $$;


-- ── 10. Daftar untuk web dan HP ─────────────────────────────────────────────
-- Label alasan diambil dari acuan, jadi menyuntingnya langsung terbaca di
-- catatan lama. Status usulan diringkas di sini supaya daftar tidak perlu
-- menarik tabel usulan sendiri.
--
-- `jejak_asal` / `jejak_tujuan` — apakah gardu seberang sudah punya catatan
-- yang menyambung LEWAT NOMOR SERI:
--   · asal GARDU   → di gardu asal ada catatan yang MELEPAS seri ini
--   · tujuan GARDU → di gardu tujuan ada catatan yang MEMASANG seri ini
-- 'bersambung' | 'dipastikan' (admin menyatakannya) | 'terbuka' | NULL (tidak
-- melibatkan gardu lain).

CREATE OR REPLACE VIEW public.optimasi_trafo_daftar
WITH (security_invoker = true) AS
SELECT
  o.*,
  r.label AS alasan_label,
  (SELECT count(*) FROM public.master_usulan u
    WHERE u.sumber_modul = 'optimasi_trafo' AND u.sumber_id = o.id
      AND u.status = 'menunggu')  AS usulan_menunggu,
  (SELECT count(*) FROM public.master_usulan u
    WHERE u.sumber_modul = 'optimasi_trafo' AND u.sumber_id = o.id
      AND u.status = 'disetujui') AS usulan_disetujui,
  CASE
    WHEN o.asal_trafo <> 'GARDU' THEN NULL
    WHEN EXISTS (
      SELECT 1 FROM public.optimasi_trafo x
      WHERE x.id <> o.id AND x.status <> 'Dibatalkan'
        AND upper(x.kode_gardu) = o.asal_kode_gardu AND upper(x.ulp) = o.asal_ulp
        AND public.seri_norm(x.no_seri_lama) = public.seri_norm(o.no_seri_baru)
    ) THEN 'bersambung'
    WHEN o.jejak_dipastikan_at IS NOT NULL THEN 'dipastikan'
    ELSE 'terbuka'
  END AS jejak_asal,
  CASE
    WHEN o.tujuan_trafo_lama <> 'GARDU' THEN NULL
    WHEN EXISTS (
      SELECT 1 FROM public.optimasi_trafo x
      WHERE x.id <> o.id AND x.status <> 'Dibatalkan'
        AND upper(x.kode_gardu) = o.tujuan_kode_gardu AND upper(x.ulp) = o.tujuan_ulp
        AND public.seri_norm(x.no_seri_baru) = public.seri_norm(o.no_seri_lama)
    ) THEN 'bersambung'
    WHEN o.jejak_dipastikan_at IS NOT NULL THEN 'dipastikan'
    ELSE 'terbuka'
  END AS jejak_tujuan
FROM public.optimasi_trafo o
LEFT JOIN public.optimasi_alasan_ref r ON r.kode = o.alasan;

COMMENT ON VIEW public.optimasi_trafo_daftar IS
  'Optimasi trafo berikut label alasan, ringkasan usulan master, dan apakah perpindahan trafonya sudah bersambung lewat nomor seri.';


-- ── 11. Riwayat satu trafo ──────────────────────────────────────────────────
-- Perjalanan sebuah trafo dibaca dari nomor serinya: kapan dipasang di mana,
-- kapan dilepas ke mana. Inilah jawaban untuk "trafo gardu ini dulu dari mana".
--   SELECT * FROM riwayat_trafo WHERE seri = seri_norm('21R-265385') ORDER BY tgl;

CREATE OR REPLACE VIEW public.riwayat_trafo
WITH (security_invoker = true) AS
SELECT public.seri_norm(o.no_seri_baru) AS seri, o.no_seri_baru AS no_seri,
       'dipasang'::text AS peristiwa, o.tgl_operasi AS tgl,
       o.kode_gardu, o.ulp, o.kva_baru AS kva,
       CASE o.asal_trafo WHEN 'GARDU' THEN 'dari gardu ' || o.asal_kode_gardu || ' (' || o.asal_ulp || ')'
                         ELSE 'dari gudang' END AS keterangan,
       o.id AS optimasi_id, o.status
FROM public.optimasi_trafo o
WHERE o.status <> 'Dibatalkan'
UNION ALL
SELECT public.seri_norm(o.no_seri_lama), o.no_seri_lama,
       'dilepas', o.tgl_mutasi,
       o.kode_gardu, o.ulp, o.kva_lama,
       CASE o.tujuan_trafo_lama WHEN 'GARDU' THEN 'ke gardu ' || o.tujuan_kode_gardu || ' (' || o.tujuan_ulp || ')'
                                ELSE 'ke ' || lower(o.tujuan_trafo_lama) END,
       o.id, o.status
FROM public.optimasi_trafo o
WHERE o.status <> 'Dibatalkan' AND o.no_seri_lama IS NOT NULL;


-- ── 12. Hak akses ───────────────────────────────────────────────────────────
-- Tulis lewat fungsi saja. Tabelnya boleh dibaca semua pengguna masuk, tapi
-- tidak boleh ditulis langsung: tiap perubahan harus membawa usulan masternya
-- ikut serta, dan itu hanya dijamin di dalam fungsi.

ALTER TABLE public.optimasi_trafo      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.optimasi_alasan_ref ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS optimasi_trafo_baca ON public.optimasi_trafo;
CREATE POLICY optimasi_trafo_baca ON public.optimasi_trafo
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS optimasi_alasan_ref_semua ON public.optimasi_alasan_ref;
CREATE POLICY optimasi_alasan_ref_semua ON public.optimasi_alasan_ref
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

GRANT SELECT ON public.optimasi_trafo TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.optimasi_alasan_ref TO authenticated;
GRANT SELECT ON public.optimasi_trafo_daftar TO authenticated;
GRANT SELECT ON public.riwayat_trafo TO authenticated;

GRANT EXECUTE ON FUNCTION public.simpan_optimasi_trafo(
  TEXT, TEXT, NUMERIC, NUMERIC, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT,
  BOOLEAN, TEXT, TEXT, INT, TEXT, TEXT, TEXT, TEXT, DATE, DATE,
  DOUBLE PRECISION, DOUBLE PRECISION, DOUBLE PRECISION, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.ubah_optimasi_trafo(
  UUID, NUMERIC, NUMERIC, TEXT, TEXT, TEXT, TEXT, TEXT,
  BOOLEAN, TEXT, INT, TEXT, TEXT, TEXT, TEXT, DATE, DATE,
  DOUBLE PRECISION, DOUBLE PRECISION, TEXT, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.verifikasi_optimasi_trafo(UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.batalkan_optimasi_trafo(UUID, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.pastikan_jejak_optimasi(UUID, TEXT) TO authenticated;


-- ── 13. Role dan menu ───────────────────────────────────────────────────────
-- Diputuskan 23 Sep 2026: role `OPTIMASI`, label menu "Optimasi Trafo" — sama
-- dengan baris di Rekap Kinerja dan di sidebar web.
--
-- `is_eksekutor = false`, alasannya sama dengan PEMERATAAN: flag itu memberi
-- menu Work Order batch yang BUKAN sumber tugas modul ini. WO optimasi datang
-- dari penandaan pengukuran, dan tampil di layar Optimasi Trafo sendiri.

INSERT INTO public.roles (
  code, label, platform, needs_unit, is_eksekutor, sees_all_units, can_assign,
  can_verify_wo, can_approve_wo, is_system, menus, urutan
) VALUES (
  'OPTIMASI', 'Optimasi Trafo', 'mobile', true, false, false, false,
  false, false, false,
  ARRAY['optimasiTrafo', 'riwayatGardu', 'bebanTrafo', 'scanMeter'], 16
) ON CONFLICT (code) DO NOTHING;

-- Admin ULP ikut memegang menunya: dia yang memeriksa hasil regu, dan menu
-- yang cuma dimiliki regu tidak bisa dipakai menengok pekerjaannya.
UPDATE public.roles
SET menus = (SELECT array_agg(DISTINCT m ORDER BY m)
             FROM unnest(COALESCE(menus, '{}') || ARRAY['optimasiTrafo']) AS m),
    updated_at = now()
WHERE code = 'admin' AND NOT ('optimasiTrafo' = ANY (COALESCE(menus, '{}')));


-- =============================================================================
-- Periksa hasilnya
-- =============================================================================
-- a. Nomor seri pindah dari data_amg (harapan ±2.415 terisi):
--      SELECT count(*) FILTER (WHERE no_seri IS NOT NULL) AS terisi, count(*) FROM gardu;
--
-- b. Nomor seri kembar — daftar kerja pembacaan papan nama:
--      SELECT seri_norm(no_seri) AS seri, string_agg(kode || '/' || ulp, ', ') AS gardu
--      FROM gardu WHERE no_seri IS NOT NULL
--      GROUP BY 1 HAVING count(*) > 1 ORDER BY count(*) DESC;
--
-- c. WO optimasi yang terbuka per ULP:
--      SELECT ulp, count(*) FROM v_wo_optimasi_terbuka GROUP BY ulp;
--
-- d. Cari sebuah trafo:
--      SELECT * FROM cari_trafo_seri('21R265385');
--
-- e. Role dan menu:
--      SELECT code, menus FROM roles WHERE code IN ('OPTIMASI', 'admin');
--
-- SESUDAH INI: pengguna HP yang diberi role/menu baru cukup KELUAR lalu MASUK
-- LAGI. Daftar menu dibaca saat login.
-- =============================================================================
