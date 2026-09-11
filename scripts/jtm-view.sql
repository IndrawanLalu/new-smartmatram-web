-- =============================================================================
-- Fase 4.2c — Inspeksi JTM: view turunan
-- Jalankan SESUDAH `jtm-acuan.sql`. Idempoten.
--
-- Tidak ada satu pun angka panjang di sini yang diketik orang. Semuanya
-- dihitung dari koordinat tiang — pelajaran yang sudah dibayar mahal di JTR
-- ("KMS tidak sesuai" ternyata berpangkal pada KMS yang diketik).
--
-- DUA ANGKA PANJANG, dan keduanya benar:
--
--   panjang_rute        bentang FISIK, dihitung sekali berapa pun kabel lewat
--   panjang_penghantar  per penyulang: bentang yang KEDUA UJUNGNYA memikul
--                       kabel penyulang itu
--
-- Ruas berimpit 500 m menambah 500 m ke KMS MATARAM DAN 500 m ke KMS KOPEL A,
-- tapi cuma 500 m ke rute fisik. Yang bertanya memang orang yang berbeda:
-- perencana bertanya rute, pemelihara penyulang bertanya penghantar.
-- =============================================================================

-- Urutan membuangnya penting: yang bergantung dibuang lebih dulu.
DROP VIEW IF EXISTS public.ulp_jtm_panjang;
DROP VIEW IF EXISTS public.penyulang_jtm_panjang;
DROP VIEW IF EXISTS public.segmen_ringkas;
DROP VIEW IF EXISTS public.segmen_panjang;
DROP VIEW IF EXISTS public.gawang_penyulang;
DROP VIEW IF EXISTS public.tiang_jtm_bersama;
DROP VIEW IF EXISTS public.tiang_gawang_jtm;

-- ── 1. Gawang JTM ────────────────────────────────────────────────────────────
-- Satu baris per gawang (ruas tiang ke induknya). Sifat yang dipakai sama
-- dengan JTR: TIAP TIANG MENYUMBANG TEPAT SATU GAWANG, jadi jumlah gawang =
-- jumlah tiang dan percabangan tidak mungkin dobel-hitung.
--
-- Bedanya dengan JTR cuma pangkalnya. Di JTR pangkal diukur dari titik gardu;
-- di JTM pangkal sebuah segmen bisa berupa GI, REC, atau LBS yang belum tentu
-- punya koordinat. Bentangnya dibiarkan NULL — dan itu jujur: yang tidak
-- diketahui tidak boleh diam-diam dihitung nol.

CREATE VIEW public.tiang_gawang_jtm AS
SELECT
  t.id  AS tiang_id,
  t.kode,
  t.penyulang,
  t.ulp,
  t.induk_id,
  (t.induk_id IS NULL) AS pangkal,
  public.jarak_meter(t.lat, t.lng, p.lat, p.lng) AS panjang_m
FROM public.tiang t
LEFT JOIN public.tiang p
  ON p.id = t.induk_id AND p.status_hidup = 'aktif'
WHERE t.status_hidup = 'aktif'
  AND t.penyulang IS NOT NULL
  AND t.gardu_kode IS NULL;

COMMENT ON VIEW public.tiang_gawang_jtm IS
  'Satu baris per gawang JTM. Jumlah gawang = jumlah tiang aktif, jadi percabangan tidak pernah dobel-hitung.';

-- ── 2. Tiang yang dipikul lebih dari satu penyulang ──────────────────────────
-- Inilah underbuild, terbaca sebagai angka dan bukan sebagai cerita. Dipakai
-- di peta (penanda tiang bersama) dan di layar koreksi massal — di sana daftar
-- ini yang memperingatkan "3 dari 40 tiang terpilih juga dipikul KOPEL A".

CREATE VIEW public.tiang_jtm_bersama AS
SELECT
  t.id   AS tiang_id,
  t.kode,
  t.ulp,
  t.penyulang                              AS pemilik,
  count(DISTINCT s.penyulang)              AS jumlah_penyulang,
  string_agg(DISTINCT s.penyulang, ', ')   AS penyulang_lewat,
  count(DISTINCT s.id)                     AS jumlah_segmen
FROM public.tiang t
JOIN public.segmen_tiang st ON st.tiang_id = t.id
JOIN public.segmen s        ON s.id = st.segmen_id AND s.status = 'aktif'
WHERE t.status_hidup = 'aktif'
GROUP BY t.id, t.kode, t.ulp, t.penyulang
HAVING count(DISTINCT s.penyulang) > 1;

COMMENT ON VIEW public.tiang_jtm_bersama IS
  'Tiang yang dipikul lebih dari satu penyulang. Satu batang beton, banyak pemikul — dan tetap satu baris di tabel tiang.';

-- ── 3. Gawang ↔ penyulang yang memikulnya ────────────────────────────────────
-- Aturan "kedua ujungnya memikul kabel yang sama", ditulis sekali di sini dan
-- dipakai semua rekap di bawahnya.
--
-- DISTINCT-nya bukan hiasan. Satu penyulang bisa punya dua segmen yang berbagi
-- tiang di perbatasannya; tanpa DISTINCT, bentang perbatasan itu terhitung dua
-- kali untuk penyulang yang sama — persis kesalahan yang ingin dicegah.
-- Antar-penyulang justru sebaliknya: bentang yang sama memang harus terhitung
-- pada masing-masing, karena kabelnya memang dua.

CREATE VIEW public.gawang_penyulang AS
SELECT DISTINCT
  g.tiang_id,
  g.induk_id,
  s.penyulang,
  s.ulp,
  g.panjang_m
FROM public.tiang_gawang_jtm g
JOIN public.segmen_tiang sa ON sa.tiang_id = g.tiang_id
JOIN public.segmen s        ON s.id = sa.segmen_id AND s.status = 'aktif'
JOIN public.segmen_tiang si ON si.segmen_id = s.id AND si.tiang_id = g.induk_id;

-- ── 4. Panjang per segmen ────────────────────────────────────────────────────

CREATE VIEW public.segmen_panjang AS
WITH anggota AS (
  SELECT segmen_id, count(*) AS jumlah_tiang
  FROM public.segmen_tiang
  GROUP BY segmen_id
), gawang AS (
  SELECT
    sa.segmen_id,
    count(*)                                       AS jumlah_gawang,
    sum(g.panjang_m)                               AS panjang_m,
    count(*) FILTER (WHERE g.panjang_m IS NULL)    AS gawang_tanpa_titik,
    max(g.panjang_m)                               AS gawang_terpanjang_m
  FROM public.tiang_gawang_jtm g
  JOIN public.segmen_tiang sa ON sa.tiang_id = g.tiang_id
  JOIN public.segmen_tiang si ON si.segmen_id = sa.segmen_id AND si.tiang_id = g.induk_id
  GROUP BY sa.segmen_id
)
SELECT
  s.id AS segmen_id,
  s.nama,
  s.penyulang,
  s.ulp,
  s.status,
  s.induk_segmen_id,
  COALESCE(a.jumlah_tiang, 0)                        AS jumlah_tiang,
  COALESCE(gw.jumlah_gawang, 0)                      AS jumlah_gawang,
  round((COALESCE(gw.panjang_m, 0) / 1000)::numeric, 3) AS panjang_km,
  COALESCE(gw.gawang_tanpa_titik, 0)                 AS gawang_tanpa_titik,
  round(gw.gawang_terpanjang_m::numeric, 1)          AS gawang_terpanjang_m,
  -- Berapa tiang segmen ini yang dipikul bersama penyulang lain. Angka ini
  -- yang membuat underbuild terlihat tanpa harus membuka peta.
  (SELECT count(*)
     FROM public.segmen_tiang x
     JOIN public.tiang_jtm_bersama b ON b.tiang_id = x.tiang_id
    WHERE x.segmen_id = s.id)                        AS tiang_bersama
FROM public.segmen s
LEFT JOIN anggota a ON a.segmen_id = s.id
LEFT JOIN gawang gw ON gw.segmen_id = s.id;

COMMENT ON VIEW public.segmen_panjang IS
  'Panjang tiap segmen, dihitung dari bentang yang KEDUA ujungnya anggota segmen itu. Tidak ada angka yang diketik.';

-- ── 5. Daftar segmen siap tampil ─────────────────────────────────────────────
-- Bahan halaman master segmen: satu baris per segmen, sudah membawa nama
-- induknya dan cacah anaknya supaya layar tidak perlu menembak balik per baris.

CREATE VIEW public.segmen_ringkas AS
SELECT
  p.*,
  i.nama AS induk_nama,
  (SELECT count(*) FROM public.segmen c
    WHERE c.induk_segmen_id = p.segmen_id AND c.status = 'aktif') AS jumlah_anak,
  s.titik_awal_jenis,
  s.titik_awal_nama,
  s.titik_akhir_jenis,
  s.titik_akhir_nama,
  s.penghantar_jenis,
  s.penghantar_ukuran,
  s.sumber,
  s.dikonfirmasi_at,
  s.created_at,
  -- Segmen yang kedua ujungnya bukan peralatan hubung. Bukan kesalahan — ruas
  -- yang berakhir di pengambilan atau di ujung jaringan memang ada — tapi
  -- pantas ditengok, karena sering berarti ujungnya belum selesai dicatat.
  (NOT public.segmen_memotong(s.titik_awal_jenis)
   AND NOT public.segmen_memotong(s.titik_akhir_jenis)) AS tanpa_batas_hubung
FROM public.segmen_panjang p
JOIN public.segmen s ON s.id = p.segmen_id
LEFT JOIN public.segmen i ON i.id = p.induk_segmen_id;

-- ── 6. Panjang per penyulang ─────────────────────────────────────────────────

CREATE VIEW public.penyulang_jtm_panjang AS
WITH milik AS (
  SELECT penyulang, ulp,
         count(*)                                    AS tiang_dimiliki,
         count(*) FILTER (WHERE lat IS NULL)         AS tiang_tanpa_titik
  FROM public.tiang
  WHERE status_hidup = 'aktif' AND penyulang IS NOT NULL AND gardu_kode IS NULL
  GROUP BY penyulang, ulp
), hantar AS (
  SELECT penyulang, ulp,
         count(*)          AS jumlah_gawang,
         sum(panjang_m)    AS panjang_m
  FROM public.gawang_penyulang
  GROUP BY penyulang, ulp
), seg AS (
  SELECT penyulang, ulp, count(*) AS jumlah_segmen
  FROM public.segmen WHERE status = 'aktif'
  GROUP BY penyulang, ulp
), numpang AS (
  -- Tiang milik penyulang lain yang ikut dipikul penyulang ini. Angka inilah
  -- yang menjawab "berapa banyak jaringan saya menumpang tiang orang".
  SELECT s.penyulang, s.ulp, count(DISTINCT st.tiang_id) AS tiang_menumpang
  FROM public.segmen s
  JOIN public.segmen_tiang st ON st.segmen_id = s.id
  JOIN public.tiang t ON t.id = st.tiang_id
  WHERE s.status = 'aktif'
    AND upper(COALESCE(t.penyulang, '')) <> upper(s.penyulang)
  GROUP BY s.penyulang, s.ulp
)
SELECT
  COALESCE(m.penyulang, h.penyulang, sg.penyulang)  AS penyulang,
  COALESCE(m.ulp, h.ulp, sg.ulp)                    AS ulp,
  pr.kode_singkat,
  COALESCE(sg.jumlah_segmen, 0)                     AS jumlah_segmen,
  COALESCE(m.tiang_dimiliki, 0)                     AS tiang_dimiliki,
  COALESCE(n.tiang_menumpang, 0)                    AS tiang_menumpang,
  COALESCE(m.tiang_tanpa_titik, 0)                  AS tiang_tanpa_titik,
  round((COALESCE(h.panjang_m, 0) / 1000)::numeric, 3) AS panjang_penghantar_km,
  COALESCE(h.jumlah_gawang, 0)                      AS jumlah_gawang
FROM milik m
FULL JOIN hantar h  ON h.penyulang = m.penyulang AND h.ulp = m.ulp
FULL JOIN seg sg    ON sg.penyulang = COALESCE(m.penyulang, h.penyulang)
                   AND sg.ulp = COALESCE(m.ulp, h.ulp)
LEFT JOIN numpang n ON n.penyulang = COALESCE(m.penyulang, h.penyulang, sg.penyulang)
                   AND n.ulp = COALESCE(m.ulp, h.ulp, sg.ulp)
LEFT JOIN public.penyulang_ref pr
  ON upper(pr.penyulang) = upper(COALESCE(m.penyulang, h.penyulang, sg.penyulang));

COMMENT ON VIEW public.penyulang_jtm_panjang IS
  'KMS penghantar per penyulang, plus berapa tiang yang dimiliki dan berapa yang cuma ditumpangi.';

-- ── 7. Rekap per ULP ─────────────────────────────────────────────────────────
-- Di sinilah rute dan penghantar berpisah, dan perbedaannya sengaja
-- ditampilkan berdampingan supaya tidak ada yang menyangka salah satunya keliru.

CREATE VIEW public.ulp_jtm_panjang AS
WITH rute AS (
  SELECT ulp,
         count(*)                                    AS jumlah_tiang,
         COALESCE(sum(panjang_m), 0)                 AS panjang_m,
         -- Bentang yang tidak bisa dihitung karena salah satu ujungnya belum
         -- punya titik. Ikut ditampilkan supaya panjang yang kecil bisa
         -- dibedakan dari panjang yang belum diketahui.
         count(*) FILTER (WHERE panjang_m IS NULL AND NOT pangkal)
                                                     AS gawang_tanpa_titik
  FROM public.tiang_gawang_jtm
  GROUP BY ulp
), hantar AS (
  SELECT ulp, sum(panjang_m) AS panjang_m
  FROM public.gawang_penyulang
  GROUP BY ulp
), per_gawang AS (
  SELECT ulp, tiang_id,
         min(panjang_m)             AS panjang_m,
         count(DISTINCT penyulang)  AS jumlah_penyulang
  FROM public.gawang_penyulang
  GROUP BY ulp, tiang_id
), berbagi AS (
  -- Panjang yang dipikul bersama, DIHITUNG LANGSUNG — bukan dari selisih
  -- penghantar dikurangi rute.
  --
  -- Selisih itu terlihat benar sampai ada satu gawang yang belum menempel
  -- segmen mana pun: gawang itu masuk rute tapi tidak masuk penghantar, dan
  -- angka "berbagi" diam-diam mengecil — bahkan bisa jadi negatif. Keadaan itu
  -- bukan kemungkinan jauh; dia keadaan NORMAL di awal, saat tiang sudah
  -- dititik tapi segmennya belum ditetapkan.
  SELECT ulp, sum((jumlah_penyulang - 1) * panjang_m) AS panjang_m
  FROM per_gawang WHERE jumlah_penyulang > 1
  GROUP BY ulp
), lepas AS (
  -- Gawang yang belum dimiliki segmen mana pun. Ditampilkan, bukan
  -- disembunyikan: dia bukan nol, dia belum diketahui — dan selama tidak
  -- terlihat, KMS penghantar akan selalu lebih kecil dari kenyataan tanpa ada
  -- yang tahu sebabnya.
  SELECT g.ulp, count(*) AS jumlah, sum(g.panjang_m) AS panjang_m
  FROM public.tiang_gawang_jtm g
  WHERE NOT EXISTS (
    SELECT 1 FROM public.gawang_penyulang gp WHERE gp.tiang_id = g.tiang_id
  )
  GROUP BY g.ulp
)
SELECT
  r.ulp,
  r.jumlah_tiang,
  round((r.panjang_m / 1000)::numeric, 3)                 AS panjang_rute_km,
  round((COALESCE(h.panjang_m, 0) / 1000)::numeric, 3)    AS panjang_penghantar_km,
  round((COALESCE(b.panjang_m, 0) / 1000)::numeric, 3)    AS panjang_berbagi_km,
  COALESCE(l.jumlah, 0)                                   AS gawang_tanpa_segmen,
  round((COALESCE(l.panjang_m, 0) / 1000)::numeric, 3)    AS panjang_tanpa_segmen_km,
  r.gawang_tanpa_titik,
  (SELECT count(*) FROM public.tiang_jtm_bersama b2 WHERE b2.ulp = r.ulp)
                                                          AS tiang_bersama,
  (SELECT count(*) FROM public.segmen s WHERE s.ulp = r.ulp AND s.status = 'aktif')
                                                          AS jumlah_segmen
FROM rute r
LEFT JOIN hantar h  ON h.ulp = r.ulp
LEFT JOIN berbagi b ON b.ulp = r.ulp
LEFT JOIN lepas l   ON l.ulp = r.ulp;

-- ── 8. Hak baca ──────────────────────────────────────────────────────────────

GRANT SELECT ON public.tiang_gawang_jtm      TO authenticated;
GRANT SELECT ON public.tiang_jtm_bersama     TO authenticated;
GRANT SELECT ON public.gawang_penyulang      TO authenticated;
GRANT SELECT ON public.segmen_panjang        TO authenticated;
GRANT SELECT ON public.segmen_ringkas        TO authenticated;
GRANT SELECT ON public.penyulang_jtm_panjang TO authenticated;
GRANT SELECT ON public.ulp_jtm_panjang       TO authenticated;

-- =============================================================================
-- Periksa hasilnya
-- =============================================================================
-- a. Panjang tiap segmen, terpanjang dulu:
--      SELECT nama, penyulang, jumlah_tiang, panjang_km, tiang_bersama
--      FROM segmen_ringkas ORDER BY panjang_km DESC;
--
-- b. Rute lawan penghantar per ULP — selisihnya = yang dipikul bersama:
--      SELECT * FROM ulp_jtm_panjang;
--
-- c. Tiang yang dipikul lebih dari satu penyulang:
--      SELECT kode, pemilik, penyulang_lewat FROM tiang_jtm_bersama ORDER BY kode;
--
-- d. Segmen yang kedua ujungnya bukan peralatan hubung — pantas ditengok:
--      SELECT nama, penyulang FROM segmen_ringkas WHERE tanpa_batas_hubung;
-- =============================================================================
