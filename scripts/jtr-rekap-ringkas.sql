-- =============================================================================
-- Menu JTR: rekap = angka dari database, daftar = kolom tabel (9 Nov 2026).
--
-- Sebelumnya web menarik SEMUA tiang JTR aktif (13.348, untuk UP3 14 halaman
-- berurutan) dua kali: Rekap menghitung temuan di browser, Daftar Inspeksi
-- mencari gardu yang sedang disapu. Ditambah seluruh tabel sambungan WO tanpa
-- saringan ULP. Kini database yang menghitung; web menerima hasilnya saja.
--
--   1. jtr_rekap_kondisi       — temuan & penghalang ROW per ULP (puluhan baris).
--                                Aturan SAMA dengan useJtrRekap.ts sebelumnya.
--   2. jtr_inspeksi_berjalan   — gardu yang sedang dititik tapi belum "Selesai"
--                                di HP. Aturan SAMA dengan ambilBerjalan().
--   3. jtr_inspeksi + wo_nama, tgl_wo (ditambah di AKHIR; kolom lain tetap).
--
-- (Nama `jtr_rekap_temuan` sudah dipakai view lama hasil inspeksi — tak disentuh.)
-- Idempoten (aman diulang).
-- =============================================================================


-- ── 1. Rekap kondisi tiang JTR ──────────────────────────────────────────────
-- Satu baris per (ulp, label). Tiang dihitung per keanggotaan gardu
-- (jtr_tiang_lengkap: milik + batang pinjaman), satu tiang sekali per label
-- walau dua kabelnya sama-sama bermasalah. Kosong ('') = tidak diisi.
-- Sengaja tanpa CTE bersama: CTE yang dipakai dua kali dimaterialkan dan
-- saringan ulp=eq.X tidak bisa masuk.
CREATE OR REPLACE VIEW public.jtr_rekap_kondisi AS
SELECT c.ulp, 'temuan'::text AS jenis, x.urutan, x.label, x.urgensi, x.jumlah
FROM (
  SELECT t.ulp,
    count(*) FILTER (WHERE t.arde_kondisi = 'Putus')                              AS arde,
    count(*) FILTER (WHERE COALESCE(t.kondisi, '') NOT IN ('', 'Baik'))           AS tiang,
    count(*) FILTER (WHERE COALESCE(t.andongan, '') NOT IN ('', 'Baik'))          AS andongan,
    count(*) FILTER (WHERE EXISTS (
      SELECT 1 FROM jsonb_array_elements(t.tiang_konduktor) k
      WHERE COALESCE(k->>'kondisi', '') NOT IN ('', 'Baik')))                     AS konduktor,
    count(*) FILTER (WHERE EXISTS (
      SELECT 1 FROM jsonb_array_elements(t.tiang_konduktor) k
      WHERE 'Rusak' IN (k->>'aks_suspension', k->>'aks_large_angle', k->>'aks_dead_end'))) AS aksesoris,
    count(*) FILTER (WHERE t.stay_kondisi = 'Rusak')                              AS stay,
    count(*) FILTER (WHERE cardinality(t.rawan_row) > 0)                          AS row_,
    count(*) FILTER (WHERE t.catatan_perbaikan ~ '\S')                            AS catatan
  FROM public.jtr_tiang_lengkap t
  WHERE t.status_hidup = 'aktif'
  GROUP BY t.ulp
) c
CROSS JOIN LATERAL (VALUES
  -- "Arde tidak ada" sengaja bukan temuan: kebanyakan tiang JTR memang tak berarde.
  (1, 'Arde putus',            'Tinggi', c.arde),
  (2, 'Tiang tidak baik',      'Tinggi', c.tiang),
  (3, 'Andongan tidak baik',   'Sedang', c.andongan),
  (4, 'Konduktor tidak baik',  'Tinggi', c.konduktor),
  (5, 'Aksesoris rusak',       'Sedang', c.aksesoris),
  (6, 'Stay rusak',            'Sedang', c.stay),
  (7, 'Rawan ROW',             'Sedang', c.row_),
  (8, 'Ada catatan perbaikan', 'Sedang', c.catatan)
) x(urutan, label, urgensi, jumlah)
UNION ALL
-- Penghalang ROW per jenis (pohon, bangunan, …): tiap isian dihitung.
SELECT t.ulp, 'penghalang'::text, NULL::int, r.v, NULL::text, count(*)
FROM public.jtr_tiang_lengkap t
CROSS JOIN LATERAL unnest(t.rawan_row) r(v)
WHERE t.status_hidup = 'aktif'
GROUP BY t.ulp, r.v;

GRANT SELECT ON public.jtr_rekap_kondisi TO authenticated;


-- ── 2. Inspeksi JTR yang sedang berjalan ────────────────────────────────────
-- HP baru membuat baris inspeksi saat petugas menekan "Selesai". Gardu yang
-- punya tiang aktif dicatat SESUDAH hari inspeksi terakhirnya (atau belum
-- pernah diinspeksi), dan tidak sedang punya inspeksi terbuka, tampil di sini.
-- Hari = tanggal WITA. Kolom mengikuti jtr_inspeksi supaya web cukup memetakan.
CREATE OR REPLACE VIEW public.jtr_inspeksi_berjalan AS
WITH ins AS (
  SELECT upper(i.gardu_kode) AS gardu, i.ulp,
         bool_or(i.status IN ('Dijadwalkan', 'Dalam Proses', 'Selesai', 'Ditolak')) AS terbuka,
         max(COALESCE(i.tgl_selesai, i.tgl_mulai)) AS terakhir
  FROM public.inspeksi_jtr i
  GROUP BY 1, 2
), tg AS (
  SELECT upper(t.gardu_kode) AS gardu, t.ulp,
         (t.created_at AT TIME ZONE 'Asia/Makassar')::date AS dibuat,
         (GREATEST(t.created_at, t.dikonfirmasi_at) AT TIME ZONE 'Asia/Makassar')::date AS kegiatan
  FROM public.jtr_tiang t
  WHERE t.status_hidup = 'aktif'
), per AS (
  SELECT tg.gardu, tg.ulp,
         count(*) AS aktif,
         count(*) FILTER (WHERE ins.terakhir IS NULL OR tg.dibuat > ins.terakhir) AS baru,
         min(tg.kegiatan) FILTER (WHERE ins.terakhir IS NULL OR tg.kegiatan > ins.terakhir) AS mulai
  FROM tg
  LEFT JOIN ins ON ins.gardu = tg.gardu AND ins.ulp = tg.ulp
  WHERE NOT COALESCE(ins.terbuka, false)
  GROUP BY 1, 2
)
SELECT 'berjalan:' || p.gardu || '|' || p.ulp AS id,
  p.gardu        AS gardu_kode,
  p.ulp,
  g.feeder       AS penyulang,
  g.nama         AS gardu_nama,
  g.alamat       AS gardu_alamat,
  p.mulai        AS tgl_mulai,
  p.aktif        AS tiang_aktif,
  p.baru         AS tiang_baru,
  COALESCE(( SELECT round(sum(gg.panjang_rute_km), 3) FROM public.gardu_jtr_panjang gg
              WHERE upper(gg.gardu_kode) = p.gardu AND gg.ulp = p.ulp), 0::numeric) AS panjang_km
FROM per p
LEFT JOIN LATERAL (
  SELECT x.nama, x.alamat, x.feeder FROM public.gardu x
  WHERE upper(x.kode) = p.gardu AND x.ulp = p.ulp
  LIMIT 1
) g ON true
WHERE p.mulai IS NOT NULL;

GRANT SELECT ON public.jtr_inspeksi_berjalan TO authenticated;


-- ── 3. jtr_inspeksi + WO ────────────────────────────────────────────────────
-- Sama dengan rekap-kinerja-jtr-inspeksi-cepat.sql; dua kolom WO di AKHIR
-- (CREATE OR REPLACE hanya boleh menambah di belakang). Dulu web menarik
-- seluruh inspeksi_jtr ber-WO + seluruh item WO lalu memasangkannya sendiri.
CREATE OR REPLACE VIEW public.jtr_inspeksi AS
SELECT i.id,
  i.gardu_kode,
  i.ulp,
  i.penyulang,
  i.tgl_mulai,
  i.tgl_selesai,
  i.status,
  i.inspektor_nama,
  i.petugas_2,
  i.catatan,
  i.verified_at,
  i.verified_by,
  i.verified_note,
  g.nama   AS gardu_nama,
  g.alamat AS gardu_alamat,
  k.tiang_aktif,
  k.sudah_diperiksa,
  k.tiang_baru,
  COALESCE(tm.jumlah, 0::bigint) AS jumlah_temuan,
  COALESCE(( SELECT round(sum(gg.panjang_rute_km), 3)
               FROM public.gardu_jtr_panjang gg
              WHERE upper(gg.gardu_kode) = upper(i.gardu_kode) AND upper(gg.ulp) = upper(i.ulp)), 0::numeric) AS panjang_km,
  w.nama   AS wo_nama,
  w.tgl_wo
FROM public.inspeksi_jtr i
LEFT JOIN public.gardu g ON upper(g.kode) = upper(i.gardu_kode) AND upper(g.ulp) = upper(i.ulp)
LEFT JOIN public.inspeksi_jtr_kelengkapan k ON k.inspeksi_id = i.id
LEFT JOIN ( SELECT t.inspeksi_id, count(*) AS jumlah
              FROM public.inspeksi_jtr_temuan t
             GROUP BY t.inspeksi_id) tm ON tm.inspeksi_id = i.id
LEFT JOIN public.wo_inspeksi_item wi ON wi.id = i.wo_item_id AND wi.jenis = 'JTR'
LEFT JOIN public.wo_inspeksi w ON w.id = wi.wo_id;


-- ── Pemeriksaan ─────────────────────────────────────────────────────────────
--   SELECT * FROM jtr_rekap_kondisi WHERE jenis = 'temuan' ORDER BY ulp, urutan;
--   SELECT * FROM jtr_inspeksi_berjalan ORDER BY ulp, gardu_kode;
