-- =============================================================================
-- Foto & petugas laporan gangguan APKT (16 Nov 2026). Idempoten.
-- Rencana: rencana-foto-apkt.md.
--
-- Pekerja homelab (pekerja/apktFoto.mjs) menarik dari APKT, per laporan
-- berstatus persis 'Selesai' sejak 1 Nov 2026: 1 foto Dalam Pengerjaan,
-- 1 foto Selesai, dan petugas penutup laporan. Berkas foto di Storage
-- `apkt-foto` dihapus sesudah 2 bulan; catatannya permanen (dasar Realisasi PS4).
--
-- Sengaja TANPA foreign key ke apkt_gangguan: unggah Excel ulang (upsert
-- apkt_gangguan onConflict no_laporan) tidak pernah menyentuh tabel di sini.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.apkt_foto_laporan (
  no_laporan      TEXT PRIMARY KEY,
  tgl_lapor       DATE,
  status          TEXT NOT NULL DEFAULT 'antre'
                  CHECK (status IN ('antre', 'ada_foto', 'tidak_ada_foto', 'gagal')),
  coba            INT NOT NULL DEFAULT 0,
  pesan           TEXT,
  dicoba_at       TIMESTAMPTZ,
  petugas         TEXT,
  minta_manual_at TIMESTAMPTZ,
  -- Verifikasi PS4 (tab Realisasi PS4, menyusul): NULL = belum diverifikasi.
  ps4             TEXT CHECK (ps4 IN ('ya', 'tidak')),
  ps4_oleh        TEXT,
  ps4_at          TIMESTAMPTZ,
  dibuat_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_apkt_foto_laporan_manual ON public.apkt_foto_laporan (minta_manual_at) WHERE minta_manual_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_apkt_foto_laporan_petugas ON public.apkt_foto_laporan (petugas);

CREATE TABLE IF NOT EXISTS public.apkt_foto (
  no_laporan    TEXT NOT NULL,
  tahap         TEXT NOT NULL CHECK (tahap IN ('pengerjaan', 'selesai')),
  apkt_foto_id  BIGINT NOT NULL,
  path          TEXT,          -- NULL = berkas sudah dihapus (lewat 2 bulan)
  ukuran        INT,
  tgl_lapor     DATE,
  diambil_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (no_laporan, tahap)
);

ALTER TABLE public.apkt_foto_laporan ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.apkt_foto ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS baca_apkt_foto_laporan ON public.apkt_foto_laporan;
CREATE POLICY baca_apkt_foto_laporan ON public.apkt_foto_laporan FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS baca_apkt_foto ON public.apkt_foto;
CREATE POLICY baca_apkt_foto ON public.apkt_foto FOR SELECT TO authenticated USING (true);
-- Menulis hanya lewat RPC di bawah (pekerja = service_role, tombol = apkt_foto_minta).

INSERT INTO storage.buckets (id, name, public)
VALUES ('apkt-foto', 'apkt-foto', true)
ON CONFLICT (id) DO NOTHING;


-- ── Tombol "Ambil foto" di form koreksi ─────────────────────────────────────
CREATE OR REPLACE FUNCTION public.apkt_foto_minta(p_no_laporan TEXT)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  g RECORD;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Sesi tidak dikenali server. Keluar lalu masuk lagi.';
  END IF;
  SELECT no_laporan, tgl_lapor, status_akhir INTO g
  FROM public.apkt_gangguan WHERE no_laporan = btrim(p_no_laporan);
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Laporan % tidak ada di data APKT Smart.', p_no_laporan;
  END IF;
  IF g.status_akhir IS DISTINCT FROM 'Selesai' THEN
    RAISE EXCEPTION 'Foto hanya diambil untuk laporan berstatus Selesai — laporan ini %.', COALESCE(g.status_akhir, 'tanpa status');
  END IF;

  INSERT INTO public.apkt_foto_laporan (no_laporan, tgl_lapor, minta_manual_at)
  VALUES (g.no_laporan, g.tgl_lapor, now())
  ON CONFLICT (no_laporan) DO UPDATE SET minta_manual_at = now(), tgl_lapor = EXCLUDED.tgl_lapor;
END $$;
REVOKE ALL ON FUNCTION public.apkt_foto_minta(TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.apkt_foto_minta(TEXT) TO authenticated;


-- ── Antrean pekerja (diturunkan dari apkt_gangguan, tidak disalin) ──────────
-- Permintaan manual selalu didahulukan. p_otomatis = false → manual saja
-- (di luar jam otomatis). Coba ulang paling banyak sekali per malam.
CREATE OR REPLACE FUNCTION public.apkt_foto_antrean(p_jumlah INT, p_otomatis BOOLEAN)
RETURNS TABLE (no_laporan TEXT, tgl_lapor DATE, manual BOOLEAN)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH malam AS (
    SELECT ((now() AT TIME ZONE 'Asia/Makassar')::date::timestamp AT TIME ZONE 'Asia/Makassar') AS awal
  )
  (SELECT f.no_laporan, f.tgl_lapor, true
   FROM public.apkt_foto_laporan f
   WHERE f.minta_manual_at IS NOT NULL
   ORDER BY f.minta_manual_at
   LIMIT p_jumlah)
  UNION ALL
  (SELECT g.no_laporan, g.tgl_lapor, false
   FROM public.apkt_gangguan g
   LEFT JOIN public.apkt_foto_laporan f ON f.no_laporan = g.no_laporan
   CROSS JOIN malam
   WHERE p_otomatis
     AND g.tgl_lapor >= DATE '2026-11-01'
     AND g.status_akhir = 'Selesai'
     AND (f.no_laporan IS NULL
          OR f.status = 'antre'
          OR (f.status = 'tidak_ada_foto' AND f.coba < 3 AND f.dicoba_at < malam.awal)
          OR (f.status = 'gagal' AND f.coba < 5 AND f.dicoba_at < malam.awal)
          -- Baru satu tahap berfoto: petugas bisa mengunggah yang lain belakangan.
          OR (f.status = 'ada_foto' AND f.coba < 3 AND f.dicoba_at < malam.awal
              AND (SELECT count(*) FROM public.apkt_foto a WHERE a.no_laporan = f.no_laporan) < 2))
     AND f.minta_manual_at IS NULL
   ORDER BY g.tgl_lapor, g.no_laporan
   LIMIT p_jumlah)
$$;
REVOKE ALL ON FUNCTION public.apkt_foto_antrean(INT, BOOLEAN) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.apkt_foto_antrean(INT, BOOLEAN) TO service_role;


-- ── Hasil satu laporan dari pekerja ─────────────────────────────────────────
-- p_foto = [{tahap, apkt_foto_id, path, ukuran}] — hanya tahap yang berhasil
-- diunggah. Tahap yang tidak ada di p_foto TIDAK dihapus (foto lama tetap).
-- Kembali: path lama yang diganti foto lain → pekerja menghapus berkasnya.
CREATE OR REPLACE FUNCTION public.apkt_foto_simpan(
  p_no_laporan TEXT, p_tgl_lapor DATE, p_status TEXT, p_petugas TEXT, p_pesan TEXT, p_foto JSONB)
RETURNS TEXT[] LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  lama TEXT[];
BEGIN
  IF p_status NOT IN ('ada_foto', 'tidak_ada_foto', 'gagal') THEN
    RAISE EXCEPTION 'Status % tidak dikenal.', p_status;
  END IF;

  SELECT COALESCE(array_agg(a.path), '{}') INTO lama
  FROM public.apkt_foto a
  JOIN jsonb_array_elements(COALESCE(p_foto, '[]'::jsonb)) x ON x->>'tahap' = a.tahap
  WHERE a.no_laporan = p_no_laporan AND a.path IS NOT NULL AND a.path <> x->>'path';

  INSERT INTO public.apkt_foto (no_laporan, tahap, apkt_foto_id, path, ukuran, tgl_lapor, diambil_at)
  SELECT p_no_laporan, x->>'tahap', (x->>'apkt_foto_id')::bigint, x->>'path', (x->>'ukuran')::int, p_tgl_lapor, now()
  FROM jsonb_array_elements(COALESCE(p_foto, '[]'::jsonb)) x
  ON CONFLICT (no_laporan, tahap) DO UPDATE SET
    apkt_foto_id = EXCLUDED.apkt_foto_id, path = EXCLUDED.path, ukuran = EXCLUDED.ukuran,
    tgl_lapor = EXCLUDED.tgl_lapor, diambil_at = now();

  INSERT INTO public.apkt_foto_laporan AS f (no_laporan, tgl_lapor, status, coba, pesan, dicoba_at, petugas)
  VALUES (p_no_laporan, p_tgl_lapor, p_status, 1, p_pesan, now(), NULLIF(btrim(p_petugas), ''))
  ON CONFLICT (no_laporan) DO UPDATE SET
    tgl_lapor = EXCLUDED.tgl_lapor,
    -- Gagal sesudah pernah berhasil tidak menurunkan status: foto lama tetap sah.
    status = CASE WHEN EXCLUDED.status = 'gagal' AND f.status = 'ada_foto' THEN f.status
                  WHEN EXCLUDED.status = 'tidak_ada_foto' AND EXISTS (
                         SELECT 1 FROM public.apkt_foto a WHERE a.no_laporan = f.no_laporan) THEN 'ada_foto'
                  ELSE EXCLUDED.status END,
    coba = f.coba + 1,
    pesan = EXCLUDED.pesan,
    dicoba_at = now(),
    petugas = COALESCE(EXCLUDED.petugas, f.petugas),
    minta_manual_at = NULL;

  RETURN lama;
END $$;
REVOKE ALL ON FUNCTION public.apkt_foto_simpan(TEXT, DATE, TEXT, TEXT, TEXT, JSONB) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.apkt_foto_simpan(TEXT, DATE, TEXT, TEXT, TEXT, JSONB) TO service_role;


-- ── Simpan 2 bulan: berkas dihapus pekerja, barisnya tetap ──────────────────
CREATE OR REPLACE FUNCTION public.apkt_foto_kedaluwarsa(p_jumlah INT)
RETURNS TABLE (path TEXT) LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT a.path FROM public.apkt_foto a
  WHERE a.path IS NOT NULL
    AND a.tgl_lapor < ((now() AT TIME ZONE 'Asia/Makassar')::date - INTERVAL '2 months')
  ORDER BY a.tgl_lapor
  LIMIT p_jumlah
$$;
CREATE OR REPLACE FUNCTION public.apkt_foto_lepas(p_path TEXT[])
RETURNS VOID LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  UPDATE public.apkt_foto SET path = NULL WHERE path = ANY (p_path)
$$;
REVOKE ALL ON FUNCTION public.apkt_foto_kedaluwarsa(INT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.apkt_foto_lepas(TEXT[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.apkt_foto_kedaluwarsa(INT) TO service_role;
GRANT EXECUTE ON FUNCTION public.apkt_foto_lepas(TEXT[]) TO service_role;

-- Periksa hasilnya
--   a. Sebaran status:   SELECT status, count(*) FROM apkt_foto_laporan GROUP BY 1;
--   b. Antrean otomatis: SELECT count(*) FROM apkt_foto_antrean(100000, true);
--   c. Per petugas:      SELECT petugas, count(*) FILTER (WHERE status = 'ada_foto') AS berfoto, count(*)
--                        FROM apkt_foto_laporan GROUP BY 1 ORDER BY 3 DESC;
