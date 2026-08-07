-- =============================================================================
-- Perbaiki persentase beban pemerataan yang memakai kVA salah
-- Jalankan manual di Supabase SQL Editor. AMAN DIULANG kapan saja.
--
-- MASALAHNYA
-- `penyeimbangan_gardu.kva_trafo` disalin dari baris pengukuran saat rekap
-- dibuat. kVA di baris itu diketik petugas di lapangan dan bisa salah baca
-- papan nama. Akibatnya memperbaiki kVA di pengukuran TIDAK membetulkan rekap
-- pemerataannya — gardunya terbaca overload selamanya.
--
-- Contoh nyata: AM197 dicatat 100 kVA padahal masternya 160. Beban 84,9 kVA
-- terbaca 84,9% (overload) alih-alih 53,1% (normal).
--
-- KENAPA INI KOREKSI, BUKAN MENGARANG ANGKA
-- `beban_kva_after` dihitung dari arus × tegangan — itu hasil ukur sungguhan
-- dan TIDAK tersentuh kesalahan kVA. Yang salah hanya penyebutnya. Jadi
--     persen = beban_kva / daya_master * 100
-- memulihkan angka yang seharusnya sejak awal, tanpa satu pun nilai baru.
--
-- Baris "before" ikut dihitung ulang dengan alasan yang sama.
--
-- Gardu yang belum ada di master TIDAK disentuh — tanpa daya master tidak ada
-- yang bisa dijadikan acuan, dan menebak lebih buruk daripada membiarkan.
-- =============================================================================

-- ── 1. LIHAT DULU sebelum mengubah apa pun ───────────────────────────────────
-- Jalankan bagian ini sendirian. Kolom `status_berubah` menunjukkan baris mana
-- yang penilaian overload-nya ikut berubah — itu yang paling perlu ditengok.

SELECT
  ps.no_gardu,
  ps.ulp,
  ps.tgl_penyeimbangan,
  ps.kva_trafo                         AS kva_tersimpan,
  g.daya                               AS kva_master,
  round(ps.beban_kva_after::numeric, 1) AS beban_kva,
  round(ps.beban_pct_after::numeric, 1) AS persen_sekarang,
  round((ps.beban_kva_after / g.daya * 100)::numeric, 1) AS persen_seharusnya,
  CASE
    WHEN (round(ps.beban_pct_after::numeric) >= 80)
       <> (round((ps.beban_kva_after / g.daya * 100)::numeric) >= 80)
    THEN '← STATUS OVERLOAD BERUBAH'
    ELSE ''
  END AS status_berubah
FROM penyeimbangan_gardu ps
JOIN gardu g
  ON upper(g.kode) = upper(ps.no_gardu)
 AND upper(g.ulp)  = upper(ps.ulp)
WHERE g.daya IS NOT NULL
  AND g.daya > 0
  AND abs(ps.kva_trafo - g.daya) > 0.01
ORDER BY ps.no_gardu;

-- ── 2. TERAPKAN perbaikannya ─────────────────────────────────────────────────
-- Baru jalankan setelah hasil di atas Anda setujui.

UPDATE penyeimbangan_gardu ps
SET
  kva_trafo        = g.daya,
  beban_pct_after  = ps.beban_kva_after  / g.daya * 100,
  beban_pct_before = ps.beban_kva_before / g.daya * 100
FROM gardu g
WHERE upper(g.kode) = upper(ps.no_gardu)
  AND upper(g.ulp)  = upper(ps.ulp)
  AND g.daya IS NOT NULL
  AND g.daya > 0
  AND abs(ps.kva_trafo - g.daya) > 0.01;

-- ── 3. Periksa hasilnya ──────────────────────────────────────────────────────
-- Harus mengembalikan 0 baris: tidak ada lagi rekap yang kVA-nya beda dari master.

SELECT count(*) AS sisa_yang_belum_cocok
FROM penyeimbangan_gardu ps
JOIN gardu g
  ON upper(g.kode) = upper(ps.no_gardu)
 AND upper(g.ulp)  = upper(ps.ulp)
WHERE g.daya IS NOT NULL AND g.daya > 0
  AND abs(ps.kva_trafo - g.daya) > 0.01;

-- Rekap yang gardunya belum ada di master — sengaja dilewati, dicatat di sini
-- supaya tidak terlupakan.
SELECT ps.no_gardu, ps.ulp, ps.kva_trafo, ps.tgl_penyeimbangan
FROM penyeimbangan_gardu ps
LEFT JOIN gardu g
  ON upper(g.kode) = upper(ps.no_gardu)
 AND upper(g.ulp)  = upper(ps.ulp)
WHERE g.kode IS NULL
ORDER BY ps.no_gardu;

-- =============================================================================
-- CATATAN: skrip ini boleh dijalankan ulang setiap kali master gardu dikoreksi.
-- Selama `beban_kva_after` tidak diubah, hasilnya selalu konsisten dengan
-- master yang berlaku saat itu.
--
-- Utang yang tersisa: `beban_pct_*` dan `pengukuran_gardu.persen_beban` adalah
-- nilai TURUNAN yang disimpan berulang, jadi ia akan basi lagi setiap kali daya
-- master berubah. Obat tuntasnya adalah menghitung persentase saat dibaca
-- (di view `gardu_latest_state`) dan berhenti menyimpannya. Belum dikerjakan.
-- =============================================================================
