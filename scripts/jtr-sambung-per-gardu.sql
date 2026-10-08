-- =============================================================================
-- JTR F1 — bentang tersambung per GARDU, bukan per nomor kabel (8 Okt 2026)
-- `rencana-jtr-jurusan-kabel.md` bagian 7, F1. Jalankan SESUDAH
-- jtr-asal-kabel.sql. Idempoten. Tanpa perubahan data.
-- =============================================================================
-- "Kabel ke-N" di lapangan = POSISI kabel di batang itu, dihitung bersama kabel
-- gardu lain. Kabel yang melewati tiang bersama (kabel gardu lain di posisi
-- ke-1) tercatat ke-2, lalu jadi ke-1 begitu keluar sendirian. Aturan lama
-- mensyaratkan nomor SAMA di tiang induk → bentangnya dianggap putus dan tidak
-- ikut dihitung (contoh AM104-A4: 22 m). Data 8 Okt: 12 bentang putus, 9
-- berpola ini.
--
-- Aturan baru: tiang induk membawa TEPAT SATU kabel gardu yang sama →
-- tersambung, berapa pun nomornya. Nomor baru menentukan bila di induk ada
-- ≥ 2 kabel gardu yang sama (dua jalur sejajar) — di situ tetap usulan/pilih
-- asal seperti sekarang. Satu-satunya yang berubah: ekspresi `tersambung`
-- (kolom & urutan sama, view turunan ikut benar).
-- =============================================================================

CREATE OR REPLACE VIEW public.tiang_gawang_kabel AS
SELECT t.id AS tiang_id,
    t.kode,
    t.gardu_kode,
    t.ulp,
    t.jurusan,
    k.id AS konduktor_id,
    k.nomor AS nomor_kabel,
    k.jenis,
    k.ukuran,
    CASE WHEN kk.dari_gardu THEN NULL::uuid ELSE COALESCE(k.induk_tiang_id, t.induk_id) END AS hulu_id,
    k.induk_tiang_id IS NOT NULL OR kk.dari_gardu AS hulu_ditunjuk,
    jarak_meter(t.lat::double precision, t.lng::double precision, COALESCE(h.lat::double precision, g.lat), COALESCE(h.lng::double precision, g.lng)) AS panjang_m,
    kk.dari_gardu OR COALESCE(k.induk_tiang_id, t.induk_id) IS NULL OR k.induk_tiang_id IS NOT NULL
      OR (EXISTS ( SELECT 1
           FROM jtr_kabel kp
          WHERE kp.tiang_id = t.induk_id AND kp.nomor = k.nomor AND kp.gardu = upper(t.gardu_kode)))
      -- ★ F1: induk membawa tepat satu kabel gardu ini → itulah asalnya.
      OR (( SELECT count(*)
           FROM jtr_kabel kp
          WHERE kp.tiang_id = t.induk_id AND kp.gardu = upper(t.gardu_kode)) = 1) AS tersambung
   FROM jtr_tiang t
     JOIN jtr_kabel k ON k.tiang_id = t.id AND k.gardu = upper(t.gardu_kode)
     JOIN tiang_konduktor kk ON kk.id = k.id
     LEFT JOIN tiang h ON h.id = CASE WHEN kk.dari_gardu THEN NULL::uuid ELSE COALESCE(k.induk_tiang_id, t.induk_id) END AND h.status_hidup = 'aktif'::text
     LEFT JOIN gardu g ON upper(g.kode) = upper(t.gardu_kode) AND upper(g.ulp) = upper(t.ulp)
  WHERE t.status_hidup = 'aktif'::text AND t.gardu_kode IS NOT NULL;

-- ── Periksa ──────────────────────────────────────────────────────────────────
--   SELECT count(*) FILTER (WHERE NOT tersambung) AS putus FROM tiang_gawang_kabel;
--   -- 8 Okt sebelum: 12 · sesudah: 3 (yang induknya membawa ≥ 2 kabel gardu sama)
