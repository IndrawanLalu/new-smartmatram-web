-- =============================================================================
-- Pemeliharaan Jaringan — tiang / gardu terdekat (16 Nov 2026). Idempoten.
--
-- Saat koreksi di web, admin BOLEH (tidak wajib) memilih tiang JTM atau gardu
-- yang berjarak ≤ 100 m dari titik catatan. Penyulang catatan IKUT pilihan
-- (keputusan user), jadi ULP-nya bisa ikut berpindah (lewat ubah_pemeliharaan_jaringan).
--
--   1. Kolom terdekat_* di pemeliharaan_jaringan (+ di akhir view daftar).
--   2. RPC koreksi_pemeliharaan_jaringan: koreksi isian + pilihan terdekat
--      dalam SATU transaksi (teknisaplikasi butir 17). Isian tetap dijaga
--      ubah_pemeliharaan_jaringan (definisi hidup, sudah bertambalan).
--
-- Butuh: pemeliharaan-jaringan-koreksi-disetujui.sql, cari-lokasi.sql (jarak_meter),
-- wo-perabasan.sql (wajib_boleh_ulp).
-- =============================================================================

-- ── 1. Kolom ─────────────────────────────────────────────────────────────────
ALTER TABLE public.pemeliharaan_jaringan
  ADD COLUMN IF NOT EXISTS terdekat_tiang_id   UUID REFERENCES public.tiang(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS terdekat_gardu_kode TEXT,
  -- "Tiang NCM-007R001R074" / "Gardu AM001" — beku saat dipilih
  ADD COLUMN IF NOT EXISTS terdekat_label      TEXT,
  ADD COLUMN IF NOT EXISTS terdekat_jarak_m    NUMERIC(7, 1);

ALTER TABLE public.pemeliharaan_jaringan DROP CONSTRAINT IF EXISTS pemeliharaan_jaringan_terdekat_satu;
ALTER TABLE public.pemeliharaan_jaringan ADD CONSTRAINT pemeliharaan_jaringan_terdekat_satu
  CHECK (terdekat_tiang_id IS NULL OR terdekat_gardu_kode IS NULL);

-- View daftar: kolom baru di AKHIR (CREATE OR REPLACE VIEW hanya boleh menambah di akhir).
DO $do$
DECLARE
  def  TEXT := pg_get_viewdef('public.pemeliharaan_jaringan_daftar'::regclass, true);
  lama TEXT := E'p.gardu_kode\n   FROM';
BEGIN
  IF position('terdekat_label' IN def) > 0 THEN
    RAISE NOTICE 'pemeliharaan_jaringan_daftar sudah memuat terdekat_* — dilewati.'; RETURN;
  END IF;
  IF (length(def) - length(replace(def, lama, ''))) / length(lama) <> 1 THEN
    RAISE EXCEPTION 'Tambalan pemeliharaan_jaringan_daftar (terdekat): penanda tidak ditemukan tepat sekali — tidak ada yang berubah.';
  END IF;
  EXECUTE 'CREATE OR REPLACE VIEW public.pemeliharaan_jaringan_daftar AS ' || replace(def, lama,
    E'p.gardu_kode,\n    p.terdekat_tiang_id,\n    p.terdekat_gardu_kode,\n    p.terdekat_label,\n    p.terdekat_jarak_m\n   FROM');
  RAISE NOTICE 'pemeliharaan_jaringan_daftar + terdekat_*.';
END $do$;


-- ── 2. Koreksi + pilihan terdekat ────────────────────────────────────────────
-- p_tiang_id + p_penyulang (penyulang yang melewati tiang itu) ATAU p_gardu_kode;
-- keduanya kosong = pilihan dihapus. Jarak dihitung ulang di sini, bukan dari web.
CREATE OR REPLACE FUNCTION public.koreksi_pemeliharaan_jaringan(
  p_id         UUID,
  p_jenis      TEXT,
  p_penyulang  TEXT,
  p_kategori   TEXT,
  p_pekerjaan  TEXT,
  p_alamat     TEXT DEFAULT NULL,
  p_catatan    TEXT DEFAULT NULL,
  p_tiang_id   UUID DEFAULT NULL,
  p_gardu_kode TEXT DEFAULT NULL
) RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  batas  CONSTANT NUMERIC := 100;
  j      public.pemeliharaan_jaringan;
  v_peny TEXT := upper(btrim(COALESCE(p_penyulang, '')));
  v_gk   TEXT := NULLIF(upper(btrim(COALESCE(p_gardu_kode, ''))), '');
  v_lbl  TEXT;
  v_jrk  NUMERIC;
BEGIN
  SELECT * INTO j FROM public.pemeliharaan_jaringan WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Catatan tidak ditemukan'; END IF;
  -- Fungsi web: admin ULP catatan itu / UP3 saja (juga selama menunggu verifikasi).
  PERFORM public.wajib_boleh_ulp(j.ulp);

  IF p_tiang_id IS NOT NULL AND v_gk IS NOT NULL THEN
    RAISE EXCEPTION 'Pilih tiang ATAU gardu, tidak keduanya.';
  END IF;
  IF (p_tiang_id IS NOT NULL OR v_gk IS NOT NULL) AND (j.lat IS NULL OR j.lng IS NULL) THEN
    RAISE EXCEPTION 'Catatan ini tidak bertitik — tiang/gardu terdekat tidak bisa dipilih.';
  END IF;

  IF p_tiang_id IS NOT NULL THEN
    SELECT 'Tiang ' || COALESCE(kp.kode, t.kode, '?'),
           public.jarak_meter(j.lat, j.lng, t.lat, t.lng)
      INTO v_lbl, v_jrk
    FROM public.tiang t
    LEFT JOIN public.tiang_kode_penyulang kp
           ON kp.tiang_id = t.id AND upper(kp.penyulang) = v_peny
    WHERE t.id = p_tiang_id AND t.status_hidup = 'aktif' AND t.gardu_kode IS NULL
      AND (kp.tiang_id IS NOT NULL OR upper(COALESCE(t.penyulang, t.feeder, '')) = v_peny);
    IF v_lbl IS NULL THEN
      RAISE EXCEPTION 'Tiang terpilih tidak aktif atau tidak dilewati penyulang %.', v_peny;
    END IF;
  ELSIF v_gk IS NOT NULL THEN
    SELECT 'Gardu ' || upper(btrim(g.kode)),
           public.jarak_meter(j.lat, j.lng, g.lat, g.lng),
           COALESCE(NULLIF(upper(btrim(COALESCE(g.feeder, ''))), ''), v_peny)
      INTO v_lbl, v_jrk, v_peny
    FROM public.gardu g
    WHERE upper(btrim(g.kode)) = v_gk AND g.lat IS NOT NULL AND g.lng IS NOT NULL
    ORDER BY public.jarak_meter(j.lat, j.lng, g.lat, g.lng)
    LIMIT 1;
    IF v_lbl IS NULL THEN RAISE EXCEPTION 'Gardu % tidak ditemukan atau tidak bertitik.', v_gk; END IF;
  END IF;
  IF v_jrk > batas THEN
    RAISE EXCEPTION '% berjarak % m dari titik catatan — yang bisa dipilih paling jauh % m.',
      v_lbl, round(v_jrk), batas;
  END IF;

  -- Isian (status, hak Diverifikasi, ULP dari penyulang) dijaga fungsi yang sama dengan sebelumnya.
  PERFORM public.ubah_pemeliharaan_jaringan(
    p_id, p_jenis, v_peny, p_kategori, p_pekerjaan, p_alamat, NULL, NULL, p_catatan, NULL, NULL);

  UPDATE public.pemeliharaan_jaringan
  SET terdekat_tiang_id   = p_tiang_id,
      terdekat_gardu_kode = v_gk,
      terdekat_label      = v_lbl,
      terdekat_jarak_m    = round(v_jrk, 1)
  WHERE id = p_id;
END $$;
COMMENT ON FUNCTION public.koreksi_pemeliharaan_jaringan IS
  'Koreksi web Pemeliharaan Jaringan + tiang JTM / gardu terdekat (≤ 100 m, tidak wajib; penyulang ikut pilihan). pemeliharaan-jaringan-terdekat.sql';

REVOKE ALL ON FUNCTION public.koreksi_pemeliharaan_jaringan(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.koreksi_pemeliharaan_jaringan(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, UUID, TEXT) TO authenticated;

-- Periksa hasilnya
--   SELECT id, penyulang, ulp, terdekat_label, terdekat_jarak_m
--   FROM pemeliharaan_jaringan WHERE terdekat_label IS NOT NULL ORDER BY updated_at DESC LIMIT 5;
