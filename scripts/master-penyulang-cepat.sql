-- =============================================================================
-- Master Penyulang: Daftar Penyulang & Rekap Data tidak timeout + beban gardu
-- (26 Nov 2026). Jalankan SESUDAH master-penyulang.sql & jtm-pecah-riwayat.sql.
-- Idempoten.
--
-- 1. penyulang_pakai — dulu 6 subkueri PER penyulang dengan upper(...) tanpa
--    indeks yang cocok → tabel tiang/gardu disapu ratusan kali. Kini tiap
--    tabel dihitung SEKALI untuk semua penyulang lalu digabung. Kolom, urutan,
--    dan nilainya sama.
-- 2. rekap_data_jtm (versi jtm-pecah-riwayat.sql; ★ = berubah):
--    ★ kolom ukuran/jenis/jenis_tiang/peralatan dulu dicari ulang dari seluruh
--      hasil antara untuk SETIAP baris (4×) → kini disusun sekali.
--    ★ gabungan pakai kunci segmen non-NULL (IS NOT DISTINCT FROM tidak bisa
--      di-hash, jadi dulu jadi nested loop).
--    ★ kolom baru gardu_beban_kva: jumlah beban (kVA) pengukuran gardu
--      TERAKHIR tiap gardu (yang tidak dikembalikan admin, bukan hasil
--      penyeimbangan). Kolom baru di BELAKANG → fungsi di-DROP lalu dibuat lagi.
-- 3. rekap_data_jtm_semua(p_ulp) — semua baris dalam SATU panggilan (JSONB).
--    Dulu layar mengambil per 1000 baris, dan tiap halaman menjalankan ulang
--    fungsi yang berat itu dari awal.
-- ⚠ Versi terbaru rekap_data_jtm kini di SINI — salin dari sini bila mengubahnya.
-- =============================================================================


-- ── 1. penyulang_pakai ───────────────────────────────────────────────────────
CREATE OR REPLACE VIEW public.penyulang_pakai AS
WITH t AS (
  SELECT upper(COALESCE(penyulang, '')) AS k, count(*) AS n
  FROM public.tiang WHERE status_hidup = 'aktif' GROUP BY 1
), kp AS (
  SELECT upper(penyulang) AS k, count(*) AS n
  FROM public.tiang_kode_penyulang GROUP BY 1
), sg AS (
  SELECT upper(COALESCE(penyulang, '')) AS k, count(*) AS n
  FROM public.segmen GROUP BY 1
), g AS (
  SELECT upper(btrim(COALESCE(feeder, ''))) AS k, ulp, count(*) AS n
  FROM public.gardu GROUP BY 1, 2
)
SELECT
  p.penyulang,
  p.ulp,
  p.kode_singkat,
  COALESCE(t.n, 0)  AS tiang_dimiliki,
  COALESCE(kp.n, 0) AS tiang_bernama,
  COALESCE(sg.n, 0) AS segmen,
  COALESCE(gg.gardu, 0) AS gardu,
  COALESCE(gg.gardu_ulp_lain, 0) AS gardu_ulp_lain,
  gg.gardu_per_ulp
FROM public.penyulang_ref p
LEFT JOIN t  ON t.k  = upper(p.penyulang)
LEFT JOIN kp ON kp.k = upper(p.penyulang)
LEFT JOIN sg ON sg.k = upper(p.penyulang)
LEFT JOIN LATERAL (
  SELECT sum(g.n)::bigint AS gardu,
         (sum(g.n) FILTER (WHERE upper(COALESCE(g.ulp, '')) <> upper(COALESCE(p.ulp, ''))))::bigint AS gardu_ulp_lain,
         (SELECT jsonb_object_agg(x.ulp, x.n)
            FROM (SELECT COALESCE(g2.ulp, '-') AS ulp, sum(g2.n)::bigint AS n
                    FROM g g2 WHERE g2.k = upper(p.penyulang) GROUP BY 1) x) AS gardu_per_ulp
  FROM g WHERE g.k = upper(p.penyulang)
) gg ON true;

COMMENT ON VIEW public.penyulang_pakai IS
  'Master penyulang + berapa banyak yang bergantung padanya (dihitung sekali per tabel — master-penyulang-cepat.sql). gardu_ulp_lain > 0 berarti nama ini dipakai penyulang berbeda di ULP lain — penggantian namanya harus memisah, bukan merambat.';
GRANT SELECT ON public.penyulang_pakai TO authenticated;


-- ── 2. rekap_data_jtm ────────────────────────────────────────────────────────
DROP FUNCTION IF EXISTS public.rekap_data_jtm_semua(TEXT);
DROP FUNCTION IF EXISTS public.rekap_data_jtm(TEXT, TEXT, UUID);

CREATE FUNCTION public.rekap_data_jtm(
  p_ulp       TEXT DEFAULT NULL,
  p_penyulang TEXT DEFAULT NULL,
  p_segmen_id UUID DEFAULT NULL
)
RETURNS TABLE (
  penyulang  TEXT,
  ulp        TEXT,
  segmen_id  UUID,
  segmen     TEXT,
  kms        NUMERIC,
  tiang      INT,
  ukuran     JSONB,
  jenis      JSONB,
  jenis_tiang JSONB,
  peralatan  JSONB,
  gardu      INT,
  gardu_kva  NUMERIC,
  gardu_beban_kva NUMERIC          -- ★
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
WITH m AS (
  SELECT i.id, i.segmen_id, upper(i.penyulang) AS p, upper(i.ulp) AS u,
         COALESCE(i.tgl_selesai::timestamptz, i.verified_at, i.tgl_mulai::timestamptz) AS w
  FROM inspeksi_jtm i
  WHERE i.status IN ('Selesai', 'Diverifikasi')
    AND i.segmen_id IS NOT NULL
    AND (p_ulp IS NULL OR upper(i.ulp) = upper(p_ulp))
    AND (p_penyulang IS NULL OR upper(i.penyulang) = upper(p_penyulang))
    AND (p_segmen_id IS NULL OR EXISTS (
          SELECT 1 FROM inspeksi_jtm_titik t2
          JOIN segmen_tiang s2 ON s2.tiang_id = t2.tiang_id AND s2.segmen_id = p_segmen_id
          WHERE t2.inspeksi_id = i.id))
), tk AS (
  SELECT DISTINCT ON (sx.segmen_id, t.tiang_id)
         sx.segmen_id, m.p, m.u, t.tiang_id, t.id AS titik_id
  FROM inspeksi_jtm_titik t
  JOIN m ON m.id = t.inspeksi_id
  JOIN tiang ta ON ta.id = t.tiang_id AND ta.status_hidup = 'aktif'
  JOIN segmen_tiang sx ON sx.tiang_id = t.tiang_id
  JOIN segmen sgx ON sgx.id = sx.segmen_id AND upper(sgx.penyulang) = m.p
   AND (p_segmen_id IS NULL OR sx.segmen_id = p_segmen_id)
  ORDER BY sx.segmen_id, t.tiang_id, m.w DESC NULLS LAST
), nilai AS (
  SELECT DISTINCT ON (tk.segmen_id, tk.tiang_id, pr.item_kode)
         tk.segmen_id, tk.tiang_id, pr.item_kode, pr.nilai
  FROM tk
  JOIN inspeksi_jtm_periksa pr
    ON pr.titik_id = tk.titik_id AND pr.bagian = '-' AND pr.nilai IS NOT NULL
   AND pr.item_kode IN ('ukuran_konduktor', 'jenis_konduktor', 'jenis_tiang')
  LEFT JOIN segmen ss ON ss.id = pr.sirkit_segmen_id
  ORDER BY tk.segmen_id, tk.tiang_id, pr.item_kode,
           CASE WHEN upper(ss.penyulang) = tk.p THEN 0 WHEN ss.id IS NULL THEN 1 ELSE 2 END,
           pr.updated_at DESC
), dasar0 AS (
  SELECT tk.segmen_id, tk.p, tk.u, tk.tiang_id,
         g.panjang_m, n.ukuran, n.jenis,
         CASE WHEN upper(COALESCE(t.penyulang, '')) <> tk.p THEN 'menumpang' ELSE n.jenis_tiang END AS jenis_tiang,
         t.penanda,
         upper(NULLIF(btrim(t.gardu_di_tiang), '')) AS gardu_kode
  FROM tk
  JOIN tiang t ON t.id = tk.tiang_id
  LEFT JOIN (
    SELECT g.tiang_id, si.segmen_id, g.panjang_m
    FROM tiang_gawang_jtm g
    JOIN segmen_tiang si ON si.tiang_id = g.induk_id
  ) g ON g.tiang_id = tk.tiang_id AND g.segmen_id = tk.segmen_id
  LEFT JOIN (
    SELECT segmen_id, tiang_id,
           max(nilai) FILTER (WHERE item_kode = 'ukuran_konduktor') AS ukuran,
           max(nilai) FILTER (WHERE item_kode = 'jenis_konduktor')  AS jenis,
           max(nilai) FILTER (WHERE item_kode = 'jenis_tiang')      AS jenis_tiang
    FROM nilai GROUP BY segmen_id, tiang_id
  ) n ON n.segmen_id = tk.segmen_id AND n.tiang_id = tk.tiang_id
), milik AS MATERIALIZED (
  SELECT v.tiang_id, upper(v.penyulang) AS p, v.hitung FROM jtm_pemilik_penanda v
), dasar AS (
  SELECT d.segmen_id, d.p, d.u, d.tiang_id, d.panjang_m, d.ukuran, d.jenis, d.jenis_tiang,
         CASE WHEN COALESCE(v.hitung, true) THEN d.penanda END AS penanda,
         CASE WHEN COALESCE(v.hitung, true) THEN d.gardu_kode END AS gardu_kode
  FROM dasar0 d
  LEFT JOIN milik v ON v.tiang_id = d.tiang_id AND v.p = d.p
), semua0 AS (
  SELECT * FROM dasar
  UNION ALL
  SELECT * FROM (
    SELECT DISTINCT ON (d.p, d.u, d.tiang_id)
           NULL::uuid, d.p, d.u, d.tiang_id, d.panjang_m, d.ukuran, d.jenis, d.jenis_tiang, d.penanda, d.gardu_kode
    FROM dasar d
    ORDER BY d.p, d.u, d.tiang_id, d.panjang_m DESC NULLS LAST
  ) x
  UNION ALL
  SELECT * FROM (
    SELECT DISTINCT ON (d.tiang_id)
           NULL::uuid, '', '', d.tiang_id, d.panjang_m, d.ukuran, d.jenis, d.jenis_tiang, d.penanda, d.gardu_kode
    FROM dasar0 d
    ORDER BY d.tiang_id, (d.jenis_tiang = 'menumpang') NULLS FIRST, d.panjang_m DESC NULLS LAST
  ) y
), semua AS MATERIALIZED (
  -- ★ sk = kunci segmen yang tidak pernah NULL (baris penyulang & jumlah =
  --   uuid nol), supaya semua gabungan di bawah bisa di-hash.
  SELECT s.*, COALESCE(s.segmen_id, '00000000-0000-0000-0000-000000000000'::uuid) AS sk
  FROM semua0 s
), pokok AS (
  SELECT s.sk, s.segmen_id, s.p, s.u,
         round((COALESCE(sum(s.panjang_m), 0) / 1000)::numeric, 3) AS kms,
         count(*)::int AS tiang,
         count(DISTINCT s.gardu_kode)::int AS gardu
  FROM semua s
  GROUP BY s.sk, s.segmen_id, s.p, s.u
), gd AS (
  -- Gardu unik per baris rekap. ULP gardu = ULP baris; baris jumlah (u = '')
  -- memakai ULP baris penyulang tempat gardu itu muncul.
  SELECT DISTINCT s.sk, s.p, s.u, s.gardu_kode FROM semua s WHERE s.gardu_kode IS NOT NULL
), gd_ulp AS (
  SELECT DISTINCT gardu_kode, u FROM gd WHERE u <> ''
), daya AS (
  SELECT DISTINCT ON (upper(kode)) upper(kode) AS kode, daya FROM gardu ORDER BY upper(kode), daya DESC NULLS LAST
), beban AS (
  -- ★ Pengukuran TERAKHIR tiap gardu di ULP-nya (indeks
  --   pengukuran_gardu_gardu_tgl_idx: upper(no_gardu), upper(petugas_unit), tgl).
  SELECT x.gardu_kode, x.u, b.beban_kva
  FROM gd_ulp x
  JOIN LATERAL (
    SELECT p.beban_kva FROM pengukuran_gardu p
     WHERE upper(p.no_gardu) = x.gardu_kode AND upper(p.petugas_unit) = x.u
       AND p.hasil_penyeimbangan_id IS NULL AND p.dikembalikan_at IS NULL
     ORDER BY p.tanggal_pengukuran DESC, p.created_at DESC
     LIMIT 1
  ) b ON true
), beban_kode AS (
  SELECT gardu_kode, max(beban_kva) AS beban_kva FROM beban GROUP BY 1
), kva AS (
  SELECT x.sk, x.p, x.u,
         sum(dy.daya)::numeric AS gardu_kva,
         sum(CASE WHEN x.u = '' THEN bk.beban_kva ELSE bb.beban_kva END)::numeric AS gardu_beban_kva
  FROM gd x
  LEFT JOIN daya dy ON dy.kode = x.gardu_kode
  LEFT JOIN beban bb ON bb.gardu_kode = x.gardu_kode AND bb.u = x.u
  LEFT JOIN beban_kode bk ON bk.gardu_kode = x.gardu_kode
  GROUP BY x.sk, x.p, x.u
), km_per AS (
  SELECT sk, p, u, 'ukuran' AS dim, COALESCE(ukuran, '-') AS k, sum(panjang_m) AS v
  FROM semua WHERE panjang_m IS NOT NULL GROUP BY 1, 2, 3, 5
  UNION ALL
  SELECT sk, p, u, 'jenis', COALESCE(jenis, '-'), sum(panjang_m)
  FROM semua WHERE panjang_m IS NOT NULL GROUP BY 1, 2, 3, 5
), n_per AS (
  SELECT sk, p, u, 'jenis_tiang' AS dim, COALESCE(jenis_tiang, '-') AS k, count(*) AS v
  FROM semua GROUP BY 1, 2, 3, 5
  UNION ALL
  SELECT sk, p, u, 'peralatan', lower(penanda), count(*)
  FROM semua WHERE penanda IS NOT NULL AND lower(penanda) <> 'gardu' GROUP BY 1, 2, 3, 5
), obj AS (
  SELECT sk, p, u, dim, jsonb_object_agg(k, round((v / 1000)::numeric, 3)) AS isi
  FROM km_per GROUP BY 1, 2, 3, 4
  UNION ALL
  SELECT sk, p, u, dim, jsonb_object_agg(k, v)
  FROM n_per GROUP BY 1, 2, 3, 4
), objp AS (
  -- ★ Satu baris per baris rekap, keempat kelompok sekaligus.
  SELECT sk, p, u, jsonb_object_agg(dim, isi) AS d FROM obj GROUP BY 1, 2, 3
)
SELECT
  COALESCE(pr.penyulang, k.p) AS penyulang,
  k.u                         AS ulp,
  k.segmen_id,
  sg.nama                     AS segmen,
  k.kms,
  k.tiang,
  COALESCE(o.d->'ukuran', '{}'),
  COALESCE(o.d->'jenis', '{}'),
  COALESCE(o.d->'jenis_tiang', '{}'),
  COALESCE(o.d->'peralatan', '{}'),
  k.gardu,
  COALESCE(kv.gardu_kva, 0),
  COALESCE(kv.gardu_beban_kva, 0)
FROM pokok k
LEFT JOIN objp o ON o.sk = k.sk AND o.p = k.p AND o.u = k.u
LEFT JOIN kva kv ON kv.sk = k.sk AND kv.p = k.p AND kv.u = k.u
LEFT JOIN segmen sg ON sg.id = k.segmen_id
LEFT JOIN LATERAL (
  SELECT r.penyulang FROM penyulang_ref r WHERE upper(r.penyulang) = k.p LIMIT 1
) pr ON true
ORDER BY k.u, k.p, k.segmen_id IS NOT NULL, sg.nama
$$;

REVOKE ALL ON FUNCTION public.rekap_data_jtm(TEXT, TEXT, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rekap_data_jtm(TEXT, TEXT, UUID) TO authenticated;
COMMENT ON FUNCTION public.rekap_data_jtm(TEXT, TEXT, UUID) IS
  'Rekap Data JTM per penyulang (segmen_id NULL) & per segmen — HANYA tiang dari inspeksi Selesai/Diverifikasi; gardu_beban_kva = jumlah beban pengukuran terakhir tiap gardu. Versi master-penyulang-cepat.sql.';


-- ── 3. Semua baris dalam satu panggilan ──────────────────────────────────────
CREATE FUNCTION public.rekap_data_jtm_semua(p_ulp TEXT DEFAULT NULL)
RETURNS JSONB
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE(jsonb_agg(to_jsonb(r) ORDER BY r.ulp, r.penyulang, r.segmen NULLS LAST), '[]'::jsonb)
  FROM public.rekap_data_jtm(NULLIF(btrim(COALESCE(p_ulp, '')), ''), NULL, NULL) r
$$;
REVOKE ALL ON FUNCTION public.rekap_data_jtm_semua(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rekap_data_jtm_semua(TEXT) TO authenticated;

NOTIFY pgrst, 'reload schema';


-- ── Periksa ──
--   EXPLAIN ANALYZE SELECT * FROM penyulang_pakai;                 -- harus jauh di bawah 1 detik
--   SELECT jsonb_array_length(rekap_data_jtm_semua(NULL));          -- Semua ULP, satu panggilan
--   SELECT penyulang, segmen, gardu, gardu_kva, gardu_beban_kva
--     FROM rekap_data_jtm('AMPENAN') WHERE gardu > 0 LIMIT 20;
