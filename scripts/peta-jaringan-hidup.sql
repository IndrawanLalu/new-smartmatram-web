-- =============================================================================
-- Peta Jaringan — Tahap 1: daftar & rute selalu hidup, tiang menumpang tampil
-- Jalankan SESUDAH peta-jaringan.sql, wo-inspeksi-jtr.sql, jtm-nama.sql.
-- Aman diulang.
--
-- ── KENAPA ──────────────────────────────────────────────────────────────────
-- Bapak 30 Sep 2026: "waktu coba penitikan, tidak semua titik masuk di peta."
--
--   1. Daftar penyulang JTM di panel kiri dibaca dari `penyulang_rute` — tabel
--      SIMPANAN yang hanya diisi `segarkan_rute_penyulang()`, dan fungsi itu
--      tidak dipanggil apa pun. Terakhir diisi 17 Sep, 3 penyulang. Penyulang
--      yang dirintis sesudahnya tidak pernah muncul, jadi tiangnya tidak bisa
--      dinyalakan. Sesudah data uji dihapus, simpanan yang sama menggambar
--      garis HANTU dari tiang yang sudah tidak ada.
--   2. Tiang JTM digolongkan ke penyulang PEMILIK batang saja. Menyalakan
--      PERUMNAS tidak menampilkan tiang GUNUNG SARI yang dilewati kabelnya.
--      Tiang JTR pinjaman juga tidak ikut di gardu peminjamnya.
--
-- ── CARANYA ─────────────────────────────────────────────────────────────────
--   • Menulis tetap murah: perubahan tiang hanya MENANDAI penyulangnya kotor
--     (satu baris upsert). Kiriman dari HP tidak melambat.
--   • Membaca yang menghitung: peta memanggil `segarkan_rute_kotor()` saat
--     dibuka — hanya penyulang yang kotor yang dihitung ulang, dan yang
--     tiangnya habis dibuang dari daftar.
-- =============================================================================


-- ── 1. Tanda kotor ───────────────────────────────────────────────────────────

ALTER TABLE public.penyulang_rute
  ADD COLUMN IF NOT EXISTS kotor BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN public.penyulang_rute.kotor IS
  'Tiang penyulang ini berubah sejak rute terakhir dihitung. Dihitung ulang oleh segarkan_rute_kotor() saat peta dibuka.';

CREATE OR REPLACE FUNCTION public.tandai_rute_kotor(p_penyulang TEXT, p_ulp TEXT)
RETURNS VOID
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  INSERT INTO public.penyulang_rute (penyulang, ulp, kotor)
  SELECT upper(btrim(p_penyulang)), upper(btrim(COALESCE(p_ulp, '-'))), true
  WHERE COALESCE(btrim(p_penyulang), '') <> ''
  ON CONFLICT (penyulang, ulp) DO UPDATE SET kotor = true;
$$;


-- ── 2. Pemicu: nama tiang per penyulang berubah ──────────────────────────────

CREATE OR REPLACE FUNCTION public.rute_kotor_dari_nama()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP IN ('INSERT', 'UPDATE') THEN
    PERFORM public.tandai_rute_kotor(NEW.penyulang, NEW.ulp);
  END IF;
  IF TG_OP IN ('DELETE', 'UPDATE') THEN
    PERFORM public.tandai_rute_kotor(OLD.penyulang, OLD.ulp);
  END IF;
  RETURN NULL;
END $$;

DROP TRIGGER IF EXISTS trg_rute_kotor_dari_nama ON public.tiang_kode_penyulang;
CREATE TRIGGER trg_rute_kotor_dari_nama
  AFTER INSERT OR UPDATE OR DELETE ON public.tiang_kode_penyulang
  FOR EACH ROW EXECUTE FUNCTION public.rute_kotor_dari_nama();


-- ── 3. Pemicu: tiang JTM digeser, dibatalkan, atau induknya berubah ──────────

CREATE OR REPLACE FUNCTION public.rute_kotor_dari_tiang()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.gardu_kode IS NOT NULL THEN RETURN NULL; END IF;   -- JTR tidak punya rute
  INSERT INTO public.penyulang_rute (penyulang, ulp, kotor)
  SELECT DISTINCT upper(k.penyulang), upper(COALESCE(k.ulp, '-')), true
  FROM public.tiang_kode_penyulang k
  WHERE k.tiang_id = NEW.id
  ON CONFLICT (penyulang, ulp) DO UPDATE SET kotor = true;
  RETURN NULL;
END $$;

DROP TRIGGER IF EXISTS trg_rute_kotor_dari_tiang ON public.tiang;
CREATE TRIGGER trg_rute_kotor_dari_tiang
  AFTER UPDATE OF lat, lng, status_hidup, induk_id ON public.tiang
  FOR EACH ROW
  WHEN (OLD.lat IS DISTINCT FROM NEW.lat OR OLD.lng IS DISTINCT FROM NEW.lng
        OR OLD.status_hidup IS DISTINCT FROM NEW.status_hidup
        OR OLD.induk_id IS DISTINCT FROM NEW.induk_id)
  EXECUTE FUNCTION public.rute_kotor_dari_tiang();


-- ── 4. Hitung ulang yang kotor — dipanggil peta saat dibuka ──────────────────

CREATE OR REPLACE FUNCTION public.segarkan_rute_kotor(p_batas INT DEFAULT 30)
RETURNS INT
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  r RECORD;
  n INT := 0;
BEGIN
  FOR r IN
    SELECT penyulang, ulp FROM public.penyulang_rute
    WHERE kotor ORDER BY updated_at NULLS FIRST LIMIT GREATEST(p_batas, 1)
  LOOP
    PERFORM public.segarkan_rute_penyulang(r.penyulang, r.ulp);
    UPDATE public.penyulang_rute SET kotor = false
    WHERE penyulang = r.penyulang AND ulp = r.ulp;
    -- Tiangnya habis (dibatalkan/dihapus) = tidak ada jaringan untuk digambar.
    DELETE FROM public.penyulang_rute
    WHERE penyulang = r.penyulang AND ulp = r.ulp AND jumlah_tiang = 0;
    n := n + 1;
  END LOOP;
  RETURN n;
END $$;

GRANT EXECUTE ON FUNCTION public.segarkan_rute_kotor(INT) TO authenticated;

-- Semua penyulang yang punya tiang ditandai sekali sekarang, supaya bukaan peta
-- berikutnya menyusun daftar dari keadaan sebenarnya.
INSERT INTO public.penyulang_rute (penyulang, ulp, kotor)
SELECT DISTINCT upper(k.penyulang), upper(COALESCE(k.ulp, '-')), true
FROM public.tiang_kode_penyulang k
ON CONFLICT (penyulang, ulp) DO UPDATE SET kotor = true;
UPDATE public.penyulang_rute SET kotor = true;


-- ── 5. Tiang di peta: per penyulang yang melewatinya, per gardu peminjamnya ──
-- Kolom lama tetap, urutan tetap; `menumpang` ditambahkan di ujung.
--   JTM: satu baris per (tiang, penyulang) dari `tiang_kode_penyulang`, dengan
--        NAMA TIANG DI PENYULANG ITU. Tiang JTM yang belum punya nama per
--        penyulang tetap muncul lewat penyulang pemiliknya.
--   JTR: dari `jtr_tiang` — tiang milik gardu DAN pinjamannya.

CREATE OR REPLACE VIEW public.peta_tiang AS
SELECT t.id,
       k.kode,
       t.ulp,
       t.lat,
       t.lng,
       t.penanda,
       t.percabangan,
       'jtm'::text          AS jaringan,
       k.penyulang          AS induk_kelompok,
       t.induk_id,
       p.lat                AS induk_lat,
       p.lng                AS induk_lng,
       NOT k.utama          AS menumpang
FROM public.tiang t
JOIN public.tiang_kode_penyulang k ON k.tiang_id = t.id
LEFT JOIN public.tiang p ON p.id = t.induk_id AND p.status_hidup = 'aktif'
WHERE t.gardu_kode IS NULL
  AND t.status_hidup = 'aktif' AND t.lat IS NOT NULL AND t.lng IS NOT NULL

UNION ALL

SELECT t.id, t.kode, t.ulp, t.lat, t.lng, t.penanda, t.percabangan,
       'jtm'::text, t.penyulang, t.induk_id, p.lat, p.lng, false
FROM public.tiang t
LEFT JOIN public.tiang p ON p.id = t.induk_id AND p.status_hidup = 'aktif'
WHERE t.gardu_kode IS NULL
  AND t.status_hidup = 'aktif' AND t.lat IS NOT NULL AND t.lng IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM public.tiang_kode_penyulang k WHERE k.tiang_id = t.id)

UNION ALL

SELECT j.id, j.kode, j.ulp, j.lat, j.lng, j.penanda, j.percabangan,
       'jtr'::text, j.gardu_kode, j.induk_id, p.lat, p.lng, j.menumpang
FROM public.jtr_tiang j
LEFT JOIN public.tiang p ON p.id = j.induk_id AND p.status_hidup = 'aktif'
WHERE j.status_hidup = 'aktif' AND j.lat IS NOT NULL AND j.lng IS NOT NULL;

COMMENT ON VIEW public.peta_tiang IS
  'Tiang untuk Peta Jaringan: JTM satu baris per penyulang yang melewatinya (nama di penyulang itu), JTR per gardu termasuk pinjaman. `menumpang` = bukan milik kelompok ini.';

GRANT SELECT ON public.peta_tiang TO authenticated;


-- =============================================================================
-- Periksa hasilnya (fungsi plpgsql wajib diuji dengan DIPANGGIL)
-- =============================================================================
--   SELECT segarkan_rute_kotor();                       -- jumlah penyulang dihitung
--   SELECT penyulang, ulp, jumlah_tiang, kotor FROM penyulang_rute;   -- kosong bila belum ada tiang
--   SELECT jaringan, menumpang, count(*) FROM peta_tiang GROUP BY 1, 2;
-- =============================================================================
