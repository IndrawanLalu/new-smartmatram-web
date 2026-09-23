-- =============================================================================
-- Koreksi catatan Pemeliharaan Jaringan yang sudah terkirim
-- =============================================================================
-- Dijalankan SESUDAH `scripts/pemeliharaan-jaringan.sql`. Aman diulang.
--
-- Kesalahan di lapangan itu normal: penyulang salah pilih, foto tertukar,
-- pekerjaan salah ketik. Tanpa jalan memperbaikinya, regu mengirim ulang
-- pekerjaan yang sama — dan realisasinya terhitung DUA KALI.
--
-- ── BATASNYA: BELUM DIVERIFIKASI ────────────────────────────────────────────
-- Catatan yang sudah diverifikasi admin TIDAK bisa diubah dari HP. Kalau bisa,
-- yang sudah diperiksa berubah diam-diam di belakang pemeriksanya, dan tanda
-- verifikasi itu berhenti berarti apa-apa. Koreksinya lewat admin.
--
-- Foto: parameter yang dikirim NULL berarti "foto lama dipertahankan", bukan
-- "kosongkan fotonya" — kolomnya NOT NULL, jadi mengosongkan memang tidak bisa.

CREATE OR REPLACE FUNCTION public.ubah_pemeliharaan_jaringan(
  p_id           UUID,
  p_jenis        TEXT,
  p_penyulang    TEXT,
  p_kategori     TEXT,
  p_pekerjaan    TEXT,
  p_alamat       TEXT DEFAULT NULL,
  p_lat          DOUBLE PRECISION DEFAULT NULL,
  p_lng          DOUBLE PRECISION DEFAULT NULL,
  p_catatan      TEXT DEFAULT NULL,
  p_foto_sebelum TEXT DEFAULT NULL,
  p_foto_sesudah TEXT DEFAULT NULL
) RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_jenis  TEXT := upper(btrim(COALESCE(p_jenis, '')));
  v_peny   TEXT := upper(btrim(COALESCE(p_penyulang, '')));
  v_status TEXT;
  v_ulp    TEXT;
BEGIN
  SELECT status INTO v_status FROM public.pemeliharaan_jaringan WHERE id = p_id;
  IF v_status IS NULL THEN
    RAISE EXCEPTION 'Catatan tidak ditemukan';
  END IF;
  IF v_status <> 'Selesai' THEN
    RAISE EXCEPTION 'Catatan ini sudah % — koreksinya lewat admin', lower(v_status);
  END IF;

  IF v_jenis NOT IN ('JTM', 'JTR') THEN
    RAISE EXCEPTION 'Jenis jaringan harus JTM atau JTR';
  END IF;
  IF v_peny = '' THEN
    RAISE EXCEPTION 'Penyulang wajib dipilih';
  END IF;
  IF btrim(COALESCE(p_pekerjaan, '')) = '' THEN
    RAISE EXCEPTION 'Pekerjaan wajib diisi';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.pemeliharaan_jaringan_ref r
    WHERE r.kode = p_kategori AND r.aktif
  ) THEN
    RAISE EXCEPTION 'Kategori "%" tidak ada di daftar yang aktif', p_kategori;
  END IF;

  -- ULP ikut dihitung ulang: penyulang yang dikoreksi bisa milik ULP lain, dan
  -- catatan yang ULP-nya tertinggal akan hilang dari rekap unit yang benar.
  SELECT upper(pr.ulp) INTO v_ulp
  FROM public.penyulang_ref pr
  WHERE upper(pr.penyulang) = v_peny
  LIMIT 1;

  UPDATE public.pemeliharaan_jaringan
  SET jenis     = v_jenis,
      penyulang = v_peny,
      ulp       = COALESCE(v_ulp, ulp),
      kategori  = p_kategori,
      pekerjaan = btrim(p_pekerjaan),
      alamat    = NULLIF(btrim(COALESCE(p_alamat, '')), ''),
      lat       = COALESCE(p_lat, lat),
      lng       = COALESCE(p_lng, lng),
      catatan   = NULLIF(btrim(COALESCE(p_catatan, '')), ''),
      foto_sebelum_url = COALESCE(NULLIF(btrim(COALESCE(p_foto_sebelum, '')), ''), foto_sebelum_url),
      foto_sesudah_url = COALESCE(NULLIF(btrim(COALESCE(p_foto_sesudah, '')), ''), foto_sesudah_url),
      updated_at = now()
  WHERE id = p_id;
END $$;

COMMENT ON FUNCTION public.ubah_pemeliharaan_jaringan IS
  'Koreksi catatan pemeliharaan jaringan dari HP, hanya selama status masih Selesai (belum diverifikasi admin).';

GRANT EXECUTE ON FUNCTION public.ubah_pemeliharaan_jaringan(
  UUID, TEXT, TEXT, TEXT, TEXT, TEXT,
  DOUBLE PRECISION, DOUBLE PRECISION, TEXT, TEXT, TEXT) TO authenticated;

-- Periksa hasilnya
--   SELECT id, penyulang, pekerjaan, status, updated_at
--   FROM pemeliharaan_jaringan ORDER BY updated_at DESC LIMIT 5;
