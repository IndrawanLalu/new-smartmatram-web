-- =============================================================================
-- Pemeliharaan Jaringan JTM/JTR
-- =============================================================================
-- Mengisi baris yang selama ini kosong di Rekap Kinerja Pelayanan Teknik.
-- Aman dijalankan berulang.
--
-- ── SESEDERHANA YANG DIMINTA ────────────────────────────────────────────────
-- Satu catatan = satu pekerjaan yang SUDAH dikerjakan: penyulang, jenis
-- jaringan, kategori, pekerjaannya apa, di mana, titiknya, foto sebelum dan
-- sesudah. Tidak ada WO, tidak ada penugasan, tidak ada alur banyak tahap.
--
-- Yang SENGAJA tidak dibuat, supaya jelas kalau nanti ditanya:
--   · WO — pekerjaannya lahir dari temuan di lapangan, bukan dari kantor.
--     Kalau kelak perlu, dia ditambahkan DI ATAS tabel ini tanpa mengubahnya.
--   · Tahap "dalam proses" — regu memotret sebelum, bekerja, memotret sesudah,
--     lalu menyimpan. Satu kali duduk, jadi tidak ada keadaan setengah jadi
--     yang perlu disimpan.
--
-- ── KENAPA DUA FOTO WAJIB ───────────────────────────────────────────────────
-- Pemeliharaan tanpa foto sesudah tidak bisa dibedakan dari temuan yang belum
-- dikerjakan. Dan foto sebelum tanpa foto sesudah adalah bentuk laporan yang
-- PALING sering dipakai untuk mengaku sudah mengerjakan sesuatu. Keduanya
-- diwajibkan di database, bukan cuma di layar — layar bisa diganti versinya,
-- kolom NOT NULL tidak.

-- ── 1. Daftar kategori ───────────────────────────────────────────────────────
-- Sepola `jtm_ref`: daftar pilihan itu DATA, bukan kode. Menambah kategori
-- baru tidak menunggu rilis aplikasi.

CREATE TABLE IF NOT EXISTS public.pemeliharaan_jaringan_ref (
  -- TETAP. Yang boleh berubah labelnya — kode inilah yang tersimpan di tiap
  -- catatan pemeliharaan, dan mengubahnya akan memutus catatan lama.
  kode    TEXT PRIMARY KEY,
  label   TEXT NOT NULL,
  -- 'JTM', 'JTR', atau 'SEMUA' untuk kategori yang berlaku di keduanya.
  -- Dipisah supaya daftar di HP tidak menyuguhkan "Rak TR" kepada regu yang
  -- sedang memperbaiki JTM.
  jenis   TEXT NOT NULL DEFAULT 'SEMUA',
  urutan  INT     NOT NULL DEFAULT 100,
  aktif   BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.pemeliharaan_jaringan_ref
  DROP CONSTRAINT IF EXISTS pemeliharaan_jaringan_ref_jenis_valid;
ALTER TABLE public.pemeliharaan_jaringan_ref
  ADD CONSTRAINT pemeliharaan_jaringan_ref_jenis_valid
  CHECK (jenis IN ('JTM', 'JTR', 'SEMUA'));

COMMENT ON TABLE public.pemeliharaan_jaringan_ref IS
  'Daftar kategori pemeliharaan jaringan. Diubah dari tab Pengaturan, bukan lewat rilis aplikasi.';


-- ── 2. Isi awal ──────────────────────────────────────────────────────────────
-- TEBAKAN YANG MASUK AKAL, BUKAN KETETAPAN. Yang tahu kosakata sebenarnya
-- orang lapangan, dan mereka bisa menyuntingnya sendiri sejak hari pertama
-- lewat tab Pengaturan. Sengaja sedikit: daftar panjang yang separuhnya tidak
-- pernah dipakai membuat regu menggulir daripada memilih.

INSERT INTO public.pemeliharaan_jaringan_ref (kode, label, jenis, urutan) VALUES
  ('isolator',   'Isolator',                'SEMUA', 10),
  ('jumper',     'Jumper & konektor',       'SEMUA', 20),
  ('penghantar', 'Penghantar & andongan',   'SEMUA', 30),
  ('tiang',      'Tiang & travers',         'SEMUA', 40),
  ('grounding',  'Pembumian',               'SEMUA', 50),
  ('arrester',   'Arrester',                'JTM',   60),
  ('cutout',     'Cut out & fuse',          'JTM',   70),
  ('rak_tr',     'Rak TR & instalasi gardu','JTR',   80),
  ('lainnya',    'Lainnya',                 'SEMUA', 999)
ON CONFLICT (kode) DO NOTHING;


-- ── 3. Catatan pemeliharaan ──────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.pemeliharaan_jaringan (
  id        UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  jenis     TEXT NOT NULL,
  penyulang TEXT NOT NULL,
  ulp       TEXT NOT NULL,

  kategori  TEXT NOT NULL REFERENCES public.pemeliharaan_jaringan_ref (kode),
  -- Ketikan bebas, dan itu disengaja. Kategori menjawab "bagian apa",
  -- pekerjaan menjawab "apa yang dilakukan padanya" — dan yang kedua tidak
  -- akan pernah habis didaftar.
  pekerjaan TEXT NOT NULL,
  alamat    TEXT,

  lat       DOUBLE PRECISION,
  lng       DOUBLE PRECISION,
  akurasi   DOUBLE PRECISION,

  -- NOT NULL, dan inilah penjaganya yang sebenarnya. Lihat catatan di kepala
  -- berkas: foto sebelum tanpa foto sesudah adalah bentuk laporan yang paling
  -- sering dipakai untuk mengaku sudah mengerjakan sesuatu.
  foto_sebelum_url TEXT NOT NULL,
  foto_sesudah_url TEXT NOT NULL,

  -- Selesai → Diverifikasi. 'Dibatalkan' untuk yang salah input; TIDAK dihapus,
  -- sepola tiang dan inspeksi — yang dihapus tidak bisa diterangkan lagi.
  status    TEXT NOT NULL DEFAULT 'Selesai',

  petugas_uid  UUID,
  petugas_nama TEXT,
  catatan      TEXT,

  tgl        DATE NOT NULL DEFAULT CURRENT_DATE,
  verified_at   TIMESTAMPTZ,
  verified_by   TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.pemeliharaan_jaringan
  DROP CONSTRAINT IF EXISTS pemeliharaan_jaringan_jenis_valid;
ALTER TABLE public.pemeliharaan_jaringan
  ADD CONSTRAINT pemeliharaan_jaringan_jenis_valid CHECK (jenis IN ('JTM', 'JTR'));

ALTER TABLE public.pemeliharaan_jaringan
  DROP CONSTRAINT IF EXISTS pemeliharaan_jaringan_status_valid;
ALTER TABLE public.pemeliharaan_jaringan
  ADD CONSTRAINT pemeliharaan_jaringan_status_valid
  CHECK (status IN ('Selesai', 'Diverifikasi', 'Dibatalkan'));

CREATE INDEX IF NOT EXISTS pemeliharaan_jaringan_ulp_idx
  ON public.pemeliharaan_jaringan (ulp, tgl DESC);
CREATE INDEX IF NOT EXISTS pemeliharaan_jaringan_penyulang_idx
  ON public.pemeliharaan_jaringan (penyulang, jenis);

COMMENT ON TABLE public.pemeliharaan_jaringan IS
  'Pemeliharaan jaringan JTM/JTR yang SUDAH dikerjakan. Satu baris = satu pekerjaan, dengan foto sebelum dan sesudah yang dua-duanya wajib.';


-- ── 4. Menyimpan dari HP ─────────────────────────────────────────────────────
-- Lewat fungsi, bukan INSERT langsung, karena ada tiga hal yang harus dijaga
-- di sisi server: penyulang harus ada di master, kategorinya harus yang aktif,
-- dan ULP-nya diturunkan dari penyulangnya — bukan dari kiriman HP, yang bisa
-- saja milik petugas yang unitnya baru dipindah.

CREATE OR REPLACE FUNCTION public.simpan_pemeliharaan_jaringan(
  p_jenis      TEXT,
  p_penyulang  TEXT,
  p_kategori   TEXT,
  p_pekerjaan  TEXT,
  p_foto_sebelum TEXT,
  p_foto_sesudah TEXT,
  p_alamat     TEXT DEFAULT NULL,
  p_lat        DOUBLE PRECISION DEFAULT NULL,
  p_lng        DOUBLE PRECISION DEFAULT NULL,
  p_akurasi    DOUBLE PRECISION DEFAULT NULL,
  p_catatan    TEXT DEFAULT NULL,
  p_nama       TEXT DEFAULT NULL,
  p_ulp        TEXT DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_jenis TEXT := upper(btrim(COALESCE(p_jenis, '')));
  v_peny  TEXT := upper(btrim(COALESCE(p_penyulang, '')));
  v_ulp   TEXT;
  v_id    UUID;
BEGIN
  IF v_jenis NOT IN ('JTM', 'JTR') THEN
    RAISE EXCEPTION 'Jenis jaringan harus JTM atau JTR';
  END IF;
  IF v_peny = '' THEN
    RAISE EXCEPTION 'Penyulang wajib dipilih';
  END IF;
  IF btrim(COALESCE(p_pekerjaan, '')) = '' THEN
    RAISE EXCEPTION 'Pekerjaan wajib diisi';
  END IF;
  IF btrim(COALESCE(p_foto_sebelum, '')) = ''
     OR btrim(COALESCE(p_foto_sesudah, '')) = '' THEN
    RAISE EXCEPTION 'Foto sebelum dan sesudah dua-duanya wajib';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.pemeliharaan_jaringan_ref r
    WHERE r.kode = p_kategori AND r.aktif
  ) THEN
    RAISE EXCEPTION 'Kategori "%" tidak ada di daftar yang aktif', p_kategori;
  END IF;

  -- ULP diturunkan dari master penyulang. Kiriman HP cuma jadi cadangan untuk
  -- penyulang yang belum terdaftar — dan itu keadaan yang memang masih ada,
  -- jadi menolaknya di sini berarti menolak pekerjaan yang benar-benar terjadi.
  SELECT upper(pr.ulp) INTO v_ulp
  FROM public.penyulang_ref pr
  WHERE upper(pr.penyulang) = v_peny
  LIMIT 1;
  v_ulp := COALESCE(v_ulp, upper(btrim(COALESCE(p_ulp, ''))));
  IF COALESCE(v_ulp, '') = '' THEN
    RAISE EXCEPTION 'ULP tidak diketahui untuk penyulang %', v_peny;
  END IF;

  INSERT INTO public.pemeliharaan_jaringan
    (jenis, penyulang, ulp, kategori, pekerjaan, alamat,
     lat, lng, akurasi, foto_sebelum_url, foto_sesudah_url,
     petugas_uid, petugas_nama, catatan)
  VALUES
    (v_jenis, v_peny, v_ulp, p_kategori, btrim(p_pekerjaan),
     NULLIF(btrim(COALESCE(p_alamat, '')), ''),
     p_lat, p_lng, p_akurasi, p_foto_sebelum, p_foto_sesudah,
     auth.uid(), p_nama, NULLIF(btrim(COALESCE(p_catatan, '')), ''))
  RETURNING id INTO v_id;

  RETURN jsonb_build_object('id', v_id, 'ulp', v_ulp);
END $$;

COMMENT ON FUNCTION public.simpan_pemeliharaan_jaringan IS
  'Menyimpan satu pemeliharaan jaringan dari HP. ULP diturunkan dari master penyulang, bukan dari kiriman HP.';


-- ── 5. Verifikasi admin ──────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.verifikasi_pemeliharaan_jaringan(
  p_id   UUID,
  p_nama TEXT DEFAULT NULL
) RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE public.pemeliharaan_jaringan
  SET status = 'Diverifikasi', verified_at = now(), verified_by = p_nama,
      updated_at = now()
  WHERE id = p_id AND status = 'Selesai';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Catatan tidak ditemukan, atau sudah diverifikasi sebelumnya';
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.batalkan_pemeliharaan_jaringan(
  p_id     UUID,
  p_alasan TEXT,
  p_nama   TEXT DEFAULT NULL
) RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF btrim(COALESCE(p_alasan, '')) = '' THEN
    RAISE EXCEPTION 'Alasan pembatalan wajib diisi';
  END IF;

  UPDATE public.pemeliharaan_jaringan
  SET status = 'Dibatalkan',
      catatan = btrim(COALESCE(catatan || ' | ', '') || 'dibatalkan: ' || p_alasan),
      verified_by = p_nama,
      updated_at = now()
  WHERE id = p_id AND status <> 'Dibatalkan';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Catatan tidak ditemukan, atau sudah dibatalkan sebelumnya';
  END IF;
END $$;


-- ── 6. Tampilan untuk web ────────────────────────────────────────────────────
-- Label kategori ikut di sini supaya daftar di web tidak perlu menggabungkan
-- sendiri — dan supaya label yang diubah di Pengaturan langsung terbaca di
-- catatan lama, tanpa satu pun baris disentuh.

CREATE OR REPLACE VIEW public.pemeliharaan_jaringan_daftar AS
SELECT
  p.id,
  p.jenis,
  p.penyulang,
  p.ulp,
  p.kategori,
  r.label AS kategori_label,
  p.pekerjaan,
  p.alamat,
  p.lat,
  p.lng,
  p.foto_sebelum_url,
  p.foto_sesudah_url,
  p.status,
  p.petugas_nama,
  p.catatan,
  p.tgl,
  p.verified_at,
  p.verified_by,
  p.created_at
FROM public.pemeliharaan_jaringan p
LEFT JOIN public.pemeliharaan_jaringan_ref r ON r.kode = p.kategori;

COMMENT ON VIEW public.pemeliharaan_jaringan_daftar IS
  'Daftar pemeliharaan jaringan berikut label kategorinya. Label diambil dari acuan, jadi menyuntingnya di Pengaturan langsung terbaca di catatan lama.';


-- ── 7. Hak akses ─────────────────────────────────────────────────────────────

ALTER TABLE public.pemeliharaan_jaringan     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pemeliharaan_jaringan_ref ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS auth_all_pemeliharaan_jaringan ON public.pemeliharaan_jaringan;
CREATE POLICY auth_all_pemeliharaan_jaringan ON public.pemeliharaan_jaringan
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS auth_all_pemeliharaan_jaringan_ref ON public.pemeliharaan_jaringan_ref;
CREATE POLICY auth_all_pemeliharaan_jaringan_ref ON public.pemeliharaan_jaringan_ref
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.pemeliharaan_jaringan     TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.pemeliharaan_jaringan_ref TO authenticated;
GRANT SELECT ON public.pemeliharaan_jaringan_daftar TO authenticated;

GRANT EXECUTE ON FUNCTION public.simpan_pemeliharaan_jaringan(
  TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT,
  DOUBLE PRECISION, DOUBLE PRECISION, DOUBLE PRECISION, TEXT, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.verifikasi_pemeliharaan_jaringan(UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.batalkan_pemeliharaan_jaringan(UUID, TEXT, TEXT) TO authenticated;


-- =============================================================================
-- Periksa hasilnya
-- =============================================================================
-- a. Kategori yang tersedia per jenis:
--      SELECT jenis, string_agg(label, ', ' ORDER BY urutan) FROM pemeliharaan_jaringan_ref
--      WHERE aktif GROUP BY jenis;
--
-- b. Rekap per ULP dan jenis:
--      SELECT ulp, jenis, count(*) AS jumlah,
--             count(*) FILTER (WHERE status = 'Selesai')      AS belum_verifikasi,
--             count(*) FILTER (WHERE status = 'Diverifikasi') AS terverifikasi
--      FROM pemeliharaan_jaringan GROUP BY ulp, jenis ORDER BY 1, 2;
--
-- c. Foto yang hilang (seharusnya NOL, dijaga NOT NULL):
--      SELECT count(*) FROM pemeliharaan_jaringan
--      WHERE COALESCE(foto_sebelum_url, '') = '' OR COALESCE(foto_sesudah_url, '') = '';
