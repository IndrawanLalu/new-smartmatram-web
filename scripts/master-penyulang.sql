-- =============================================================================
-- Master Penyulang: berapa gardu yang memakainya, dan mana yang belum terdaftar
-- Jalankan SESUDAH `jtm-penyulang-unik.sql`. Idempoten.
--
-- ── KENAPA ──────────────────────────────────────────────────────────────────
-- `penyulang_ref` akan jadi induk yang dituju `gardu.feeder`, `tiang.penyulang`,
-- dan `segmen.penyulang` lewat kunci asing. Sebelum kunci itu bisa dipasang,
-- dua hal harus terlihat lebih dulu — dan sekarang keduanya tidak terlihat sama
-- sekali dari layar mana pun:
--
--   1. Berapa gardu yang bergantung pada tiap penyulang. Tanpa angka ini,
--      mengganti nama terasa seperti menyunting satu baris — padahal bisa
--      menyentuh ratusan.
--
--   2. Penyulang yang dipakai gardu tapi TIDAK ADA di master. Diperiksa
--      21 Sep 2026: ada 22, mencakup 704 gardu. Selama itu belum dilengkapi,
--      kunci asingnya akan menolak terbentuk.
-- =============================================================================

-- ── 1. Penyulang + siapa saja yang memakainya ────────────────────────────────
-- Kolom lama dipertahankan urutannya; yang baru ditambahkan di belakang, supaya
-- `CREATE OR REPLACE` diterima tanpa membongkar apa pun yang bergantung padanya.

CREATE OR REPLACE VIEW public.penyulang_pakai AS
SELECT
  p.penyulang,
  p.ulp,
  p.kode_singkat,
  (SELECT count(*) FROM public.tiang t
    WHERE upper(COALESCE(t.penyulang, '')) = upper(p.penyulang)
      AND t.status_hidup = 'aktif')                               AS tiang_dimiliki,
  (SELECT count(*) FROM public.tiang_kode_penyulang k
    WHERE upper(k.penyulang) = upper(p.penyulang))                AS tiang_bernama,
  (SELECT count(*) FROM public.segmen s
    WHERE upper(COALESCE(s.penyulang, '')) = upper(p.penyulang))  AS segmen,

  -- ── Baru ──
  (SELECT count(*) FROM public.gardu g
    WHERE upper(btrim(COALESCE(g.feeder, ''))) = upper(p.penyulang)) AS gardu,

  -- Gardu yang memakai penyulang ini TAPI berada di ULP lain. Bukan sekadar
  -- keterangan: nilai > 0 berarti nama ini dipakai dua penyulang berbeda yang
  -- kebetulan senama, dan penggantian namanya harus MEMISAH, bukan merambat.
  (SELECT count(*) FROM public.gardu g
    WHERE upper(btrim(COALESCE(g.feeder, ''))) = upper(p.penyulang)
      AND upper(COALESCE(g.ulp, '')) <> upper(COALESCE(p.ulp, ''))) AS gardu_ulp_lain,

  -- Sebarannya per ULP, untuk pratinjau penggantian nama. Disediakan di sini,
  -- bukan dihitung di layar: layar yang menghitung sendiri akan memakai aturan
  -- pencocokan yang sedikit berbeda dari view ini, dan selisihnya baru
  -- ketahuan saat angkanya dibandingkan orang.
  (SELECT jsonb_object_agg(x.ulp, x.n)
     FROM (SELECT COALESCE(g.ulp, '-') AS ulp, count(*) AS n
             FROM public.gardu g
            WHERE upper(btrim(COALESCE(g.feeder, ''))) = upper(p.penyulang)
            GROUP BY 1) x)                                        AS gardu_per_ulp
FROM public.penyulang_ref p;

COMMENT ON VIEW public.penyulang_pakai IS
  'Master penyulang + berapa banyak yang bergantung padanya. gardu_ulp_lain > 0 berarti nama ini dipakai penyulang berbeda di ULP lain — penggantian namanya harus memisah, bukan merambat.';


-- ── 2. Penyulang yang dipakai gardu tapi belum terdaftar ─────────────────────
-- Inilah daftar kerja melengkapi master. Dibuat sebagai view, bukan sekali
-- jalan: begitu impor gardu berikutnya membawa penyulang baru, daftarnya
-- terisi sendiri tanpa ada yang perlu ingat memeriksanya.
--
-- Sesudah kunci asing terpasang nanti, view ini seharusnya SELALU kosong. Kalau
-- tidak, berarti ada jalan masuk yang melewati kunci asingnya — dan itu perlu
-- ditelusuri, bukan dibiarkan.

CREATE OR REPLACE VIEW public.penyulang_belum_terdaftar AS
SELECT
  upper(btrim(g.feeder)) AS penyulang,
  upper(COALESCE(g.ulp, '-')) AS ulp,
  count(*) AS gardu
FROM public.gardu g
WHERE btrim(COALESCE(g.feeder, '')) <> ''
  AND NOT EXISTS (
    SELECT 1 FROM public.penyulang_ref p
    WHERE upper(p.penyulang) = upper(btrim(g.feeder))
  )
GROUP BY 1, 2;

COMMENT ON VIEW public.penyulang_belum_terdaftar IS
  'Penyulang yang dipakai gardu tapi tidak ada di master. Daftar kerja melengkapi master — dan sesudah kunci asing terpasang, seharusnya selalu kosong.';


-- ── 3. Hak akses ─────────────────────────────────────────────────────────────

GRANT SELECT ON public.penyulang_pakai            TO authenticated;
GRANT SELECT ON public.penyulang_belum_terdaftar  TO authenticated;


-- =============================================================================
-- Periksa hasilnya
-- =============================================================================
-- a. Yang belum terdaftar — per 21 Sep 2026: 22 baris, 704 gardu:
--      SELECT * FROM penyulang_belum_terdaftar ORDER BY gardu DESC;
--      SELECT count(*) AS penyulang, sum(gardu) AS gardu FROM penyulang_belum_terdaftar;
--
-- b. Nama yang dipakai lebih dari satu ULP — per 21 Sep: HILBERON, KOPANG,
--    PRAYA, TANJUNG:
--      SELECT penyulang, ulp, gardu, gardu_ulp_lain, gardu_per_ulp
--      FROM penyulang_pakai WHERE gardu_ulp_lain > 0 ORDER BY gardu_ulp_lain DESC;
--
-- c. Penyulang terbesar, untuk merasakan bobot penggantian nama:
--      SELECT penyulang, ulp, gardu, tiang_dimiliki, segmen
--      FROM penyulang_pakai ORDER BY gardu DESC LIMIT 15;
-- =============================================================================
