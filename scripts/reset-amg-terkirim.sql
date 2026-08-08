-- =============================================================================
-- Batalkan tanda "terkirim ke AMG" secara massal, lalu antre ulang
-- Jalankan manual di Supabase SQL Editor.
--
-- KAPAN DIPAKAI
-- Agen lokal menandai baris sebagai terkirim setelah POST ke AMG dianggap
-- berhasil. Kalau AMG ternyata tidak mencatatnya — agen sedang direstart,
-- endpoint-nya berubah, atau AMG menjawab 200 tanpa menyimpan — SMART berkata
-- "Terkirim" padahal tidak. Tidak ada cara otomatis mengetahuinya; yang tahu
-- hanya orang yang mengecek di AMG.
--
-- APA YANG DILAKUKAN
-- Persis sama dengan tombol "Kirim ulang" per baris (`/api/amg-queue`):
--     amg_queued_at = sekarang   ← masuk antrean lagi
--     amg_sent_at   = NULL       ← tanda terkirim dicabut
--     amg_error     = NULL
--     amg_attempts  = 0          ← baris yang sudah mentok 3× bisa dicoba lagi
--
-- Agen mengambil baris yang `amg_queued_at` terisi, `amg_sent_at` NULL, dan
-- `amg_attempts` masih di bawah batas. Jadi sesudah skrip ini dijalankan,
-- pengirimannya berjalan sendiri pada giliran agen berikutnya — tidak perlu
-- diklik satu per satu.
--
-- Jam memakai WITA (Asia/Makassar), bukan UTC, supaya rentangnya sama dengan
-- yang Anda lihat di layar. `amg_sent_at` disimpan sebagai timestamptz.
-- =============================================================================

-- ── 1. LIHAT DULU ────────────────────────────────────────────────────────────
-- Ganti dua tanggal di bawah sesuai rentang yang mau dibatalkan.
-- Contoh ini: sepanjang 6 Agustus 2026 WITA.

SELECT
  no_gardu,
  petugas_unit,
  tanggal_pengukuran,
  kva_trafo,
  round(persen_beban::numeric) AS persen,
  to_char(amg_sent_at AT TIME ZONE 'Asia/Makassar', 'YYYY-MM-DD HH24:MI:SS') AS ditandai_wita
FROM pengukuran_gardu
WHERE amg_sent_at IS NOT NULL
  AND (amg_sent_at AT TIME ZONE 'Asia/Makassar') >= '2026-08-06 00:00'
  AND (amg_sent_at AT TIME ZONE 'Asia/Makassar') <  '2026-08-07 00:00'
ORDER BY amg_sent_at DESC;

-- Kalau perlu dipersempit, tambahkan salah satu baris ini ke WHERE di atas:
--   AND petugas_unit = 'AMPENAN'
--   AND no_gardu IN ('GS078', 'GS085', 'AM028')

-- ── 2. TERAPKAN — batalkan tanda DAN antre ulang ─────────────────────────────
-- Baru jalankan setelah daftar di atas Anda setujui.
-- WHERE-nya HARUS sama persis dengan yang di bagian 1.

UPDATE pengukuran_gardu
SET
  amg_queued_at = now(),
  amg_sent_at   = NULL,
  amg_error     = NULL,
  amg_attempts  = 0
WHERE amg_sent_at IS NOT NULL
  AND (amg_sent_at AT TIME ZONE 'Asia/Makassar') >= '2026-08-06 00:00'
  AND (amg_sent_at AT TIME ZONE 'Asia/Makassar') <  '2026-08-07 00:00';

-- ── 2b. VARIAN: cabut tandanya saja, JANGAN antre ulang ──────────────────────
-- Pakai ini kalau agennya belum siap dan Anda mau memilih sendiri kapan
-- mengirim. Barisnya kembali ke keadaan "belum pernah dikirim", lalu tinggal
-- dicentang di tab Realisasi dan ditekan Kirim AMG.
--
-- UPDATE pengukuran_gardu
-- SET amg_queued_at = NULL, amg_sent_at = NULL, amg_error = NULL, amg_attempts = 0
-- WHERE ... (WHERE yang sama seperti di atas)

-- ── 3. PERIKSA ───────────────────────────────────────────────────────────────
-- Harus 0: tidak ada lagi baris bertanda terkirim pada rentang itu.

SELECT count(*) AS masih_bertanda_terkirim
FROM pengukuran_gardu
WHERE amg_sent_at IS NOT NULL
  AND (amg_sent_at AT TIME ZONE 'Asia/Makassar') >= '2026-08-06 00:00'
  AND (amg_sent_at AT TIME ZONE 'Asia/Makassar') <  '2026-08-07 00:00';

-- Isi antrean yang menunggu agen sekarang. Angkanya harus turun sendiri
-- setelah agen berjalan; kalau mandek dan `amg_error` terisi, pesannya ada di
-- kolom itu.
SELECT
  petugas_unit,
  count(*)                                    AS antre,
  count(*) FILTER (WHERE amg_error IS NOT NULL) AS bergalat
FROM pengukuran_gardu
WHERE amg_queued_at IS NOT NULL AND amg_sent_at IS NULL
GROUP BY petugas_unit
ORDER BY antre DESC;
