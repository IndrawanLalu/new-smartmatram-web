-- =============================================================================
-- Kode vegetasi baru (5 Nov 2026)
-- -----------------------------------------------------------------------------
-- Pilihan jawaban vegetasi Inspeksi JTM berganti: "Berpotensi mengganggu" dan
-- "Menyentuh jaringan" dinonaktifkan, kini "Rawan" dan "Resiko Tinggi". View
-- perabasan_pohon masih menyaring kode lama, jadi pohon temuan JTM tidak muncul
-- di Peta Jaringan, Perabasan web, dan peta segmen HP.
--
--   1. perabasan_pohon: saring "jawaban tidak normal" dari jtm_opsi_ref.
--      ⚠ Definisi terbaru perabasan_pohon kini di SINI.
--   2. tugaskan_temuan_jtm: prioritas vegetasi tanpa kategori — Resiko Tinggi
--      sama dengan Menyentuh (Sangat Tinggi). Ditambal pada definisi yang hidup.
-- Aman dijalankan ulang.
-- =============================================================================

-- ── 1. perabasan_pohon ───────────────────────────────────────────────────────
CREATE OR REPLACE VIEW public.perabasan_pohon AS
WITH per_titik AS (
  SELECT
    tk.tiang_id,
    m.segmen_id                                              AS kabel,   -- ★
    m.status                                                 AS status_inspeksi,
    COALESCE(m.tgl_selesai, m.tgl_mulai)                     AS tgl,
    max(p.nilai) FILTER (WHERE p.item_kode = 'vegetasi')     AS vegetasi,
    max(p.nilai) FILTER (WHERE p.item_kode = 'jenis_pohon')  AS jenis_pohon,
    max(p.foto_url) FILTER (WHERE p.item_kode = 'vegetasi')  AS foto_url,
    max(p.catatan)  FILTER (WHERE p.item_kode = 'vegetasi')  AS catatan,
    row_number() OVER (
      PARTITION BY tk.tiang_id, m.segmen_id                              -- ★
      ORDER BY COALESCE(m.tgl_selesai, m.tgl_mulai) DESC NULLS LAST, tk.id DESC
    )                                                        AS urut
  FROM public.inspeksi_jtm_titik tk
  JOIN public.inspeksi_jtm m         ON m.id = tk.inspeksi_id
  JOIN public.inspeksi_jtm_periksa p ON p.titik_id = tk.id
  WHERE p.item_kode IN ('vegetasi', 'jenis_pohon')
    AND m.status <> 'Dibatalkan'
  GROUP BY tk.tiang_id, m.segmen_id, tk.id, m.status, m.tgl_selesai, m.tgl_mulai
),
terkini AS (
  SELECT * FROM per_titik WHERE urut = 1
),
-- ★ Satu baris per (segmen, tiang): jawaban kabel segmen itu sendiri kalau ada,
--   kalau belum ada, jawaban penyulang lain yang paling baru.
pilih AS (
  SELECT DISTINCT ON (st.segmen_id, x.tiang_id)
    st.segmen_id, x.*
  FROM terkini x
  JOIN public.segmen_tiang st ON st.tiang_id = x.tiang_id
  ORDER BY st.segmen_id, x.tiang_id, (x.kabel = st.segmen_id) DESC, x.tgl DESC NULLS LAST
)
SELECT
  x.segmen_id,
  x.tiang_id,
  t.kode  AS tiang_kode,
  t.lat,
  t.lng,
  x.vegetasi,
  x.jenis_pohon,
  x.tgl   AS tgl_inspeksi,
  x.status_inspeksi,
  (x.status_inspeksi = 'Diverifikasi') AS terverifikasi,
  x.foto_url,
  x.catatan
FROM pilih x
JOIN public.tiang t ON t.id = x.tiang_id
-- ★ (5 Nov) Kode jawaban diambil dari daftar pilihan, bukan ditulis tetap:
--   pilihan vegetasi kini Rawan/Resiko Tinggi (berpotensi/menyentuh dinonaktifkan),
--   sehingga 2.400-an temuan pohon hilang dari peta dan Perabasan.
WHERE x.vegetasi IN (SELECT o.kode FROM public.jtm_opsi_ref o
                     WHERE o.item_kode = 'vegetasi' AND NOT o.normal);

COMMENT ON VIEW public.perabasan_pohon IS
  'Pohon yang menunggu dirabas per segmen, dari jawaban vegetasi inspeksi JTM KABEL SEGMEN ITU (jatuh ke penyulang lain bila kabelnya belum pernah menjawab), lengkap dengan foto dan koordinat tiangnya. Inspeksi yang belum diverifikasi ikut tampil, ditandai `terverifikasi`. Yang Dibatalkan tidak ikut.';

GRANT SELECT ON public.perabasan_pohon TO authenticated;


-- ── 2. tugaskan_temuan_jtm: prioritas ────────────────────────────────────────
DO $$
DECLARE
  d TEXT;
  lama TEXT := $q$WHEN k.nilai = 'menyentuh' THEN$q$;
  baru TEXT := $q$WHEN k.nilai IN ('menyentuh', 'resiko_tinggi') THEN$q$;
BEGIN
  SELECT pg_get_functiondef(p.oid) INTO d
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'tugaskan_temuan_jtm';
  IF d IS NULL THEN RAISE EXCEPTION 'tugaskan_temuan_jtm tidak ditemukan'; END IF;
  IF position(baru IN d) > 0 THEN RAISE NOTICE 'prioritas sudah diperbarui'; RETURN; END IF;
  IF (length(d) - length(replace(d, lama, ''))) / length(lama) <> 1 THEN
    RAISE EXCEPTION 'penanda prioritas tidak ditemukan tepat sekali';
  END IF;
  EXECUTE replace(d, lama, baru);
END $$;


-- ── Periksa ──────────────────────────────────────────────────────────────────
-- Pohon per jenis jawaban (sebelumnya hanya berpotensi/menyentuh ≈ 52):
SELECT vegetasi, count(*) FROM public.perabasan_pohon GROUP BY 1 ORDER BY 2 DESC;
