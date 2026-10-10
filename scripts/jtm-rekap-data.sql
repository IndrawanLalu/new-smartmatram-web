-- =============================================================================
-- Rekap Data JTM per penyulang & per segmen (10 Okt 2026)
-- Tab "Rekap Data" di Master Penyulang.
--
-- HANYA DATA HASIL INSPEKSI. Yang dihitung: tiang yang tercatat di inspeksi JTM
-- berstatus Selesai atau Diverifikasi. Panjang ketikan dari impor, inspeksi
-- yang masih Dalam Proses, dan yang Dibatalkan TIDAK masuk — rekap ini
-- menjawab "apa yang sudah dilihat regu", bukan "apa yang tertulis".
--
--   kms        panjang gawang tiang terinspeksi ke induk batangnya (induk di
--              segmen yang sama — aturan yang sama dengan segmen_panjang)
--   ukuran     KMS per ukuran konduktor; nilai diambil di tiang ujung gawang,
--              kabel penyulang itu sendiri bila tiangnya memikul beberapa
--   jenis      KMS per jenis konduktor (cara yang sama)
--   tiang      jumlah tiang per jenis tiang (isian inspeksi); tiang milik
--              penyulang lain yang ditumpangi = 'menumpang'
--   peralatan  jumlah tiang per penanda (recloser, LBS, FCO, …) selain gardu
--   gardu      gardu yang berdiri di tiang terinspeksi + total kVA
--
-- Baris penyulang (segmen_id NULL) dihitung ulang dari tiangnya, BUKAN
-- dijumlah dari baris segmen: tiang batas dua segmen tidak terhitung dua kali.
-- Baris jumlah (penyulang = '') menghitung tiang, peralatan, dan gardu FISIK
-- sekali — tiang yang ditumpangi tidak terhitung di pemilik dan penumpangnya.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.rekap_data_jtm(p_ulp TEXT DEFAULT NULL)
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
  gardu_kva  NUMERIC
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
WITH m AS (
  SELECT i.id, i.segmen_id, upper(i.penyulang) AS p, upper(i.ulp) AS u,
         COALESCE(i.tgl_selesai::timestamptz, i.verified_at, i.tgl_mulai::timestamptz) AS w
  FROM inspeksi_jtm i
  WHERE i.status IN ('Selesai', 'Diverifikasi')
    AND i.segmen_id IS NOT NULL
    AND (p_ulp IS NULL OR upper(i.ulp) = upper(p_ulp))
), tk AS (
  -- Satu tiang per segmen: titik dari inspeksi terbaru.
  SELECT DISTINCT ON (m.segmen_id, t.tiang_id)
         m.segmen_id, m.p, m.u, t.tiang_id, t.id AS titik_id
  FROM inspeksi_jtm_titik t
  JOIN m ON m.id = t.inspeksi_id
  WHERE t.tiang_id IS NOT NULL
  ORDER BY m.segmen_id, t.tiang_id, m.w DESC NULLS LAST
), nilai AS (
  -- Kabel penyulang ini dulu, lalu isian tanpa kabel (tiang satu sirkit),
  -- baru kabel penyulang lain.
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
), dasar AS (
  SELECT tk.segmen_id, tk.p, tk.u, tk.tiang_id,
         g.panjang_m, n.ukuran, n.jenis,
         -- Tiang milik penyulang lain yang cuma ditumpangi kabel penyulang ini:
         -- badannya tidak diisi di inspeksi ini (sudah di inspeksi pemiliknya),
         -- jadi masuk kolom sendiri, bukan "belum diisi" (10 Okt 2026).
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
), semua AS (
  -- Tingkat segmen, lalu tingkat penyulang (segmen_id NULL) — satu tiang
  -- sekali per penyulang; yang punya gawang didahulukan.
  SELECT * FROM dasar
  UNION ALL
  SELECT * FROM (
    SELECT DISTINCT ON (d.p, d.u, d.tiang_id)
           NULL::uuid, d.p, d.u, d.tiang_id, d.panjang_m, d.ukuran, d.jenis, d.jenis_tiang, d.penanda, d.gardu_kode
    FROM dasar d
    ORDER BY d.p, d.u, d.tiang_id, d.panjang_m DESC NULLS LAST
  ) x
  UNION ALL
  -- Baris JUMLAH (penyulang & ulp = ''): tiap batang fisik SEKALI. Tiang yang
  -- ditumpangi tercatat di pemilik DAN penumpangnya; di sini dihitung sebagai
  -- milik sendiri bila pemiliknya ikut terinspeksi. kms baris ini TIDAK
  -- dipakai — kms adalah kilometer sirkit, jumlahnya dari baris penyulang.
  SELECT * FROM (
    SELECT DISTINCT ON (d.tiang_id)
           NULL::uuid, '', '', d.tiang_id, d.panjang_m, d.ukuran, d.jenis, d.jenis_tiang, d.penanda, d.gardu_kode
    FROM dasar d
    ORDER BY d.tiang_id, (d.jenis_tiang = 'menumpang') NULLS FIRST, d.panjang_m DESC NULLS LAST
  ) y
), pokok AS (
  SELECT s.segmen_id, s.p, s.u,
         round((COALESCE(sum(s.panjang_m), 0) / 1000)::numeric, 3) AS kms,
         count(*)::int AS tiang,
         count(DISTINCT s.gardu_kode)::int AS gardu
  FROM semua s
  GROUP BY s.segmen_id, s.p, s.u
), kva AS (
  SELECT x.segmen_id, x.p, x.u, sum(g.daya)::numeric AS gardu_kva
  FROM (SELECT DISTINCT segmen_id, p, u, gardu_kode FROM semua WHERE gardu_kode IS NOT NULL) x
  JOIN (SELECT DISTINCT ON (upper(kode)) upper(kode) AS kode, daya FROM gardu ORDER BY upper(kode), daya DESC NULLS LAST) g
    ON g.kode = x.gardu_kode
  GROUP BY x.segmen_id, x.p, x.u
), km_per AS (
  SELECT segmen_id, p, u, 'ukuran' AS dim, COALESCE(ukuran, '-') AS k, sum(panjang_m) AS v
  FROM semua WHERE panjang_m IS NOT NULL GROUP BY 1, 2, 3, 5
  UNION ALL
  SELECT segmen_id, p, u, 'jenis', COALESCE(jenis, '-'), sum(panjang_m)
  FROM semua WHERE panjang_m IS NOT NULL GROUP BY 1, 2, 3, 5
), n_per AS (
  SELECT segmen_id, p, u, 'jenis_tiang' AS dim, COALESCE(jenis_tiang, '-') AS k, count(*) AS v
  FROM semua GROUP BY 1, 2, 3, 5
  UNION ALL
  SELECT segmen_id, p, u, 'peralatan', lower(penanda), count(*)
  FROM semua WHERE penanda IS NOT NULL AND lower(penanda) <> 'gardu' GROUP BY 1, 2, 3, 5
), obj AS (
  SELECT segmen_id, p, u, dim, jsonb_object_agg(k, round((v / 1000)::numeric, 3)) AS isi
  FROM km_per GROUP BY 1, 2, 3, 4
  UNION ALL
  SELECT segmen_id, p, u, dim, jsonb_object_agg(k, v)
  FROM n_per GROUP BY 1, 2, 3, 4
)
SELECT
  COALESCE(pr.penyulang, k.p) AS penyulang,
  k.u                         AS ulp,
  k.segmen_id,
  sg.nama                     AS segmen,
  k.kms,
  k.tiang,
  COALESCE((SELECT o.isi FROM obj o WHERE o.segmen_id IS NOT DISTINCT FROM k.segmen_id AND o.p = k.p AND o.u = k.u AND o.dim = 'ukuran'), '{}'),
  COALESCE((SELECT o.isi FROM obj o WHERE o.segmen_id IS NOT DISTINCT FROM k.segmen_id AND o.p = k.p AND o.u = k.u AND o.dim = 'jenis'), '{}'),
  COALESCE((SELECT o.isi FROM obj o WHERE o.segmen_id IS NOT DISTINCT FROM k.segmen_id AND o.p = k.p AND o.u = k.u AND o.dim = 'jenis_tiang'), '{}'),
  COALESCE((SELECT o.isi FROM obj o WHERE o.segmen_id IS NOT DISTINCT FROM k.segmen_id AND o.p = k.p AND o.u = k.u AND o.dim = 'peralatan'), '{}'),
  k.gardu,
  COALESCE(kv.gardu_kva, 0)
FROM pokok k
LEFT JOIN kva kv ON kv.segmen_id IS NOT DISTINCT FROM k.segmen_id AND kv.p = k.p AND kv.u = k.u
LEFT JOIN segmen sg ON sg.id = k.segmen_id
LEFT JOIN LATERAL (
  SELECT r.penyulang FROM penyulang_ref r WHERE upper(r.penyulang) = k.p LIMIT 1
) pr ON true
ORDER BY k.u, k.p, k.segmen_id IS NOT NULL, sg.nama
$$;

REVOKE ALL ON FUNCTION public.rekap_data_jtm(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rekap_data_jtm(TEXT) TO authenticated;

COMMENT ON FUNCTION public.rekap_data_jtm(TEXT) IS
  'Rekap Data JTM per penyulang (segmen_id NULL) & per segmen — HANYA tiang dari inspeksi Selesai/Diverifikasi. KMS per ukuran/jenis konduktor, jenis tiang, peralatan, gardu.';
