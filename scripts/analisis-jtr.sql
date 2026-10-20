-- ════════════════════════════════════════════════════════════════════════════
-- Analisis JTR — F1 (20 Okt 2026). Tab "Analisis JTR" di Pengukuran Gardu.
--
-- Satu baris per GARDU + JURUSAN: arus terukur (pengukuran terakhir), bentuk
-- jaringannya dari inspeksi JTR (lintasan terjauh gardu → ujung, panjang
-- sirkuit, kabel ber-KHA terkecil, tarikan SR), dan slot jurusan PHB TR dari
-- pemeliharaan gardu terakhir. Ditandai merah/kuning menurut pengaturan.
--
-- Huruf jurusan JTR (A/B/C/D) = huruf jurusan formulir pengukuran — itu yang
-- membuat arus bisa dipasangkan ke kabelnya.
--
-- Pengaturan (UP3 saja yang boleh mengubah, berlaku seluruh UP3):
--   jtr_kha_ref              — KHA per jenis + ukuran kabel
--   jtr_analisis_pengaturan  — batas arus jurusan, panjang, % KHA
-- Kuning = ≥ 80 % batas arus atau batas % KHA (tetap, tidak diatur).
--
-- Aman diulang. Jalankan di Supabase SQL Editor SEBELUM web dibangun.
-- ════════════════════════════════════════════════════════════════════════════

-- ── 1. KHA per kabel ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.jtr_kha_ref (
  jenis       TEXT NOT NULL,
  ukuran      TEXT NOT NULL,
  kha_a       NUMERIC CHECK (kha_a IS NULL OR kha_a > 0),
  diubah_oleh TEXT,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (jenis, ukuran)
);

-- Nilai bawaan LVTC — WAJIB diperiksa user di Pengaturan. 4x16 sengaja kosong.
INSERT INTO public.jtr_kha_ref (jenis, ukuran, kha_a) VALUES
  ('LVTC', '3x35+25', 125),
  ('LVTC', '3x50+35', 154),
  ('LVTC', '3x70+50', 196),
  ('LVTC', '4x70',    196)
ON CONFLICT (jenis, ukuran) DO NOTHING;

-- Ukuran lain yang sudah tercatat di lapangan ikut terdaftar (KHA kosong),
-- supaya Pengaturan menampilkan semua kabel yang benar-benar terpasang.
INSERT INTO public.jtr_kha_ref (jenis, ukuran)
SELECT DISTINCT k.jenis, k.ukuran FROM public.jtr_kabel k
WHERE k.jenis IS NOT NULL AND k.ukuran IS NOT NULL
ON CONFLICT (jenis, ukuran) DO NOTHING;

-- ── 2. Batas ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.jtr_analisis_pengaturan (
  id                   INT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  batas_arus_jurusan_a NUMERIC NOT NULL DEFAULT 160 CHECK (batas_arus_jurusan_a > 0),
  batas_panjang_m      NUMERIC NOT NULL DEFAULT 1000 CHECK (batas_panjang_m > 0),
  batas_kha_pct        NUMERIC NOT NULL DEFAULT 100 CHECK (batas_kha_pct > 0),
  diubah_oleh          TEXT,
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);
INSERT INTO public.jtr_analisis_pengaturan (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

ALTER TABLE public.jtr_kha_ref ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.jtr_analisis_pengaturan ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS jtr_kha_ref_baca ON public.jtr_kha_ref;
CREATE POLICY jtr_kha_ref_baca ON public.jtr_kha_ref FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS jtr_kha_ref_ubah ON public.jtr_kha_ref;
CREATE POLICY jtr_kha_ref_ubah ON public.jtr_kha_ref FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.user_roles r WHERE r.user_id = auth.uid() AND r.role = 'UP3'))
  WITH CHECK (EXISTS (SELECT 1 FROM public.user_roles r WHERE r.user_id = auth.uid() AND r.role = 'UP3'));

DROP POLICY IF EXISTS jtr_analisis_pengaturan_baca ON public.jtr_analisis_pengaturan;
CREATE POLICY jtr_analisis_pengaturan_baca ON public.jtr_analisis_pengaturan FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS jtr_analisis_pengaturan_ubah ON public.jtr_analisis_pengaturan;
CREATE POLICY jtr_analisis_pengaturan_ubah ON public.jtr_analisis_pengaturan FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.user_roles r WHERE r.user_id = auth.uid() AND r.role = 'UP3'))
  WITH CHECK (EXISTS (SELECT 1 FROM public.user_roles r WHERE r.user_id = auth.uid() AND r.role = 'UP3'));

GRANT SELECT, INSERT, UPDATE ON public.jtr_kha_ref TO authenticated;

-- Daftar untuk Pengaturan: semua ukuran yang TERPASANG (jtr_kabel) + yang
-- sudah diatur. Ukuran baru dari lapangan otomatis muncul dengan KHA kosong;
-- web menyimpannya dengan upsert.
CREATE OR REPLACE VIEW public.jtr_kha_daftar
WITH (security_invoker = true) AS
SELECT x.jenis, x.ukuran, r.kha_a, r.diubah_oleh, r.updated_at,
       (SELECT count(*)::int FROM public.jtr_kabel k WHERE k.jenis = x.jenis AND k.ukuran = x.ukuran) AS jumlah_kabel
FROM (
  SELECT DISTINCT jenis, ukuran FROM public.jtr_kabel WHERE jenis IS NOT NULL AND ukuran IS NOT NULL
  UNION
  SELECT jenis, ukuran FROM public.jtr_kha_ref
) x
LEFT JOIN public.jtr_kha_ref r ON r.jenis = x.jenis AND r.ukuran = x.ukuran;

GRANT SELECT ON public.jtr_kha_daftar TO authenticated;
GRANT SELECT, UPDATE ON public.jtr_analisis_pengaturan TO authenticated;

-- ── 3. View analisis per gardu + jurusan ────────────────────────────────────
CREATE OR REPLACE VIEW public.analisis_jtr_jurusan
WITH (security_invoker = true) AS
WITH RECURSIVE
-- Satu gawang per tiang per gardu+jurusan (tiang underbuild berkabel dua tidak
-- dihitung dua kali). `panjang_m` pangkal = dari titik gardu.
gw AS (
  SELECT DISTINCT ON (upper(k.gardu_kode), k.jurusan, k.tiang_id)
         upper(k.gardu_kode) AS g, k.jurusan AS j, k.tiang_id, k.hulu_id,
         COALESCE(k.panjang_m, 0) AS panjang_m
  FROM public.tiang_gawang_kabel k
  WHERE k.jurusan IS NOT NULL
  ORDER BY upper(k.gardu_kode), k.jurusan, k.tiang_id, k.tersambung DESC, k.panjang_m
),
-- Jarak lewat kabel dari gardu ke tiap tiang. Batas kedalaman = rem darurat
-- kalau ada data berputar.
jarak AS (
  SELECT a.g, a.j, a.tiang_id, a.panjang_m AS m, 1 AS dalam
  FROM gw a
  WHERE a.hulu_id IS NULL
     OR NOT EXISTS (SELECT 1 FROM gw b WHERE b.g = a.g AND b.j = a.j AND b.tiang_id = a.hulu_id)
  UNION ALL
  SELECT c.g, c.j, c.tiang_id, p.m + c.panjang_m, p.dalam + 1
  FROM jarak p
  JOIN gw c ON c.g = p.g AND c.j = p.j AND c.hulu_id = p.tiang_id
  WHERE p.dalam < 2000
),
geo AS (
  SELECT g.g, g.j,
         (SELECT max(x.m) FROM jarak x WHERE x.g = g.g AND x.j = g.j) AS terjauh_m,
         sum(g.panjang_m) AS sirkuit_m,
         count(*)::int AS jumlah_tiang,
         sum(COALESCE(t.tarikan_sr, 0))::int AS jumlah_sr
  FROM gw g
  LEFT JOIN public.tiang t ON t.id = g.tiang_id
  GROUP BY g.g, g.j
),
-- Kabel ber-KHA terkecil di jurusan itu. KHA kosong didahulukan: ukuran yang
-- belum diatur tidak boleh tersembunyi di balik ukuran besar yang aman.
kabel AS (
  SELECT DISTINCT ON (upper(k.gardu_kode), k.jurusan)
         upper(k.gardu_kode) AS g, k.jurusan AS j,
         concat_ws(' ', k.jenis, k.ukuran) AS kabel, r.kha_a
  FROM public.tiang_gawang_kabel k
  LEFT JOIN public.jtr_kha_ref r ON r.jenis = k.jenis AND r.ukuran = k.ukuran
  WHERE k.jurusan IS NOT NULL AND k.ukuran IS NOT NULL
  ORDER BY upper(k.gardu_kode), k.jurusan, r.kha_a ASC NULLS FIRST
),
-- Pengukuran terakhir per gardu — aturan sama dengan kesehatan_gardu.
terakhir AS (
  SELECT DISTINCT ON (upper(p.no_gardu)) p.*
  FROM public.pengukuran_gardu p
  WHERE p.dikembalikan_at IS NULL
  ORDER BY upper(p.no_gardu), p.tanggal_pengukuran DESC, p.jam_pengukuran DESC NULLS LAST, p.created_at DESC NULLS LAST
),
ukur AS (
  SELECT upper(t.no_gardu) AS g, j.key AS j,
         COALESCE((j.value->'arus'->>'R')::numeric, 0) AS a_r,
         COALESCE((j.value->'arus'->>'S')::numeric, 0) AS a_s,
         COALESCE((j.value->'arus'->>'T')::numeric, 0) AS a_t,
         COALESCE((j.value->'arus'->>'N')::numeric, 0) AS a_n
  FROM terakhir t
  CROSS JOIN LATERAL jsonb_each(
    CASE WHEN jsonb_typeof(t.perjurusan) = 'object' THEN t.perjurusan ELSE '{}'::jsonb END) j
  WHERE jsonb_typeof(j.value) = 'object'
),
-- Slot jurusan PHB TR dari pemeliharaan gardu terakhir yang selesai.
pml AS (
  SELECT DISTINCT ON (upper(m.gardu_kode)) upper(m.gardu_kode) AS g,
         (SELECT x.nilai_angka FROM public.pemeliharaan_gardu_periksa x
           WHERE x.pemeliharaan_id = m.id AND x.item_kode = 'jurusan_tersedia') AS tersedia,
         (SELECT x.nilai_angka FROM public.pemeliharaan_gardu_periksa x
           WHERE x.pemeliharaan_id = m.id AND x.item_kode = 'jurusan_terpakai') AS terpakai,
         COALESCE(m.tgl_selesai, m.created_at)::date AS tgl
  FROM public.pemeliharaan_gardu m
  WHERE m.status IN ('Selesai', 'Diverifikasi')
  ORDER BY upper(m.gardu_kode), m.tgl_selesai DESC NULLS LAST, m.created_at DESC
),
kunci AS (
  SELECT g, j FROM ukur WHERE greatest(a_r, a_s, a_t) > 0
  UNION
  SELECT g, j FROM geo
),
dasar AS (
  SELECT
    k.g AS gardu_kode, k.j AS jurusan,
    COALESCE(gd.ulp, t.petugas_unit) AS ulp,
    COALESCE(gd.feeder, t.penyulang) AS penyulang,
    gd.nama AS gardu_nama,
    COALESCE(t.kva_trafo, gd.daya) AS kva,
    t.persen_beban, t.tanggal_pengukuran,
    u.a_r, u.a_s, u.a_t, u.a_n,
    greatest(u.a_r, u.a_s, u.a_t) AS arus_maks,
    geo.g IS NOT NULL AS jtr_ada,
    round(geo.terjauh_m) AS terjauh_m,
    round(geo.sirkuit_m) AS sirkuit_m,
    geo.jumlah_tiang, geo.jumlah_sr,
    kb.kabel, kb.kha_a,
    pml.tersedia AS jurusan_tersedia, pml.terpakai AS jurusan_terpakai, pml.tgl AS tgl_pemeliharaan,
    s.batas_arus_jurusan_a, s.batas_panjang_m, s.batas_kha_pct
  FROM kunci k
  CROSS JOIN public.jtr_analisis_pengaturan s
  LEFT JOIN public.gardu gd ON upper(gd.kode) = k.g
  LEFT JOIN terakhir t ON upper(t.no_gardu) = k.g
  LEFT JOIN ukur u ON u.g = k.g AND u.j = k.j
  LEFT JOIN geo ON geo.g = k.g AND geo.j = k.j
  LEFT JOIN kabel kb ON kb.g = k.g AND kb.j = k.j
  LEFT JOIN pml ON pml.g = k.g
),
nilai AS (
  SELECT d.*,
         CASE WHEN d.kha_a > 0 AND d.arus_maks IS NOT NULL THEN round(d.arus_maks / d.kha_a * 100, 1) END AS beban_kha_pct,
         COALESCE(d.arus_maks > d.batas_arus_jurusan_a, false) AS arus_lebih,
         COALESCE(d.arus_maks / NULLIF(d.kha_a, 0) * 100 > d.batas_kha_pct, false) AS kha_lebih,
         COALESCE(d.terjauh_m > d.batas_panjang_m, false) AS panjang_lebih,
         COALESCE(d.arus_maks >= 0.8 * d.batas_arus_jurusan_a, false)
           OR COALESCE(d.arus_maks / NULLIF(d.kha_a, 0) * 100 >= 0.8 * d.batas_kha_pct, false) AS mendekati
  FROM dasar d
)
SELECT n.gardu_kode, n.jurusan, n.ulp, n.penyulang, n.gardu_nama, n.kva, n.persen_beban, n.tanggal_pengukuran,
       n.a_r, n.a_s, n.a_t, n.a_n, n.arus_maks,
       n.jtr_ada, n.terjauh_m, n.sirkuit_m, n.jumlah_tiang, n.jumlah_sr, n.kabel, n.kha_a, n.beban_kha_pct,
       n.jurusan_tersedia, n.jurusan_terpakai, n.tgl_pemeliharaan,
       n.arus_lebih, n.kha_lebih, n.panjang_lebih,
       CASE WHEN n.arus_lebih OR n.kha_lebih OR n.panjang_lebih THEN 'merah'
            WHEN n.mendekati THEN 'kuning'
            ELSE 'baik' END AS status
FROM nilai n;

COMMENT ON VIEW public.analisis_jtr_jurusan IS
  'Analisis JTR F1: per gardu+jurusan — arus terukur, lintasan terjauh, kabel ber-KHA terkecil, slot jurusan PHB TR; status merah/kuning/baik menurut jtr_analisis_pengaturan.';

GRANT SELECT ON public.analisis_jtr_jurusan TO authenticated;
