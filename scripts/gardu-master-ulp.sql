-- =============================================================================
-- Master gardu: tambah ULP + kode AMG, dan jadikan `kode` kunci yang sah
-- Jalankan manual di Supabase SQL Editor. Idempoten.
--
-- Latar: tabel `gardu` sudah berisi 813 baris dengan `daya` terisi 100%, tapi
-- belum pernah dipakai sebagai acuan pengukuran. Struktur yang ada
-- DIPERTAHANKAN — skrip ini hanya menambah apa yang kurang.
-- =============================================================================

-- ── 1. Bersihkan duplikat sebelum kode dijadikan kunci ───────────────────────
-- Ditemukan 1 duplikat: GS151 muncul 2×. Upsert per kode mustahil selama masih
-- ada kode ganda — baris mana yang harus diperbarui jadi ambigu.
-- Yang dibuang baris TERBARU; yang lama dipertahankan karena kemungkinan besar
-- itu yang sudah dirujuk data lain (koordinat, riwayat).
-- PERIKSA DULU sebelum menjalankan blok DELETE di bawah:
--
--   SELECT id, kode, nama, daya, lat, lng, created_at
--   FROM gardu WHERE kode = 'GS151' ORDER BY created_at;

DELETE FROM gardu a
USING gardu b
WHERE a.kode = b.kode
  AND a.ctid > b.ctid;   -- sisakan satu baris per kode

-- ── 2. Kolom baru ────────────────────────────────────────────────────────────
ALTER TABLE gardu
  ADD COLUMN IF NOT EXISTS ulp      TEXT,
  -- Kode versi AMG (ID UP + kode, mis. "44150AM171") — RUJUKAN saja.
  -- SENGAJA TIDAK dipakai untuk mengirim ke AMG: satu ULP bisa punya lebih dari
  -- satu prefix (Ampenan 44150 dan 44151) dan yang kedua tidak ikut terunduh di
  -- master, jadi kolom ini tidak pernah lengkap. Pengiriman tetap memakai daftar
  -- prefix di `amg_config` seperti yang sudah berjalan.
  ADD COLUMN IF NOT EXISTS kode_amg TEXT;

COMMENT ON COLUMN gardu.ulp      IS 'ULP pemilik gardu. Dipakai menyaring data per role.';
COMMENT ON COLUMN gardu.kode_amg IS 'Kode gardu di AMG (prefix ULP + kode), mis. 44150AM171.';

-- ── 3. Isi ULP untuk baris yang sudah ada ────────────────────────────────────
-- Seluruh 812 kode memakai awalan AM/MM/GS/LA, dan riwayat 1.224 pengukuran
-- menunjukkan keempatnya AMPENAN dengan konsistensi 100%. Jadi pengisian ini
-- bukan tebakan.
UPDATE gardu
SET ulp = 'AMPENAN'
WHERE ulp IS NULL
  AND substring(upper(kode) from '^[A-Z]+') IN ('AM', 'MM', 'GS', 'LA');

-- Sisanya (kalau ada) dibiarkan NULL supaya kelihatan dan bisa diisi lewat impor.

-- ── 4. Kunci & indeks ────────────────────────────────────────────────────────
-- Kolom biasa, BUKAN upper(kode): `upsert(onConflict: "kode")` hanya mengenali
-- indeks unik pada kolomnya persis, indeks ekspresi ditolak. Sudah dikoreksi
-- di gardu-master-state-view.sql kalau skrip ini terlanjur dijalankan.
CREATE UNIQUE INDEX IF NOT EXISTS gardu_kode_unik ON gardu (kode);
CREATE INDEX        IF NOT EXISTS gardu_ulp_idx  ON gardu (ulp);
CREATE INDEX        IF NOT EXISTS gardu_kode_amg_idx ON gardu (kode_amg);

-- ── 5. Periksa hasilnya ──────────────────────────────────────────────────────
--   SELECT ulp, count(*) FROM gardu GROUP BY ulp ORDER BY 2 DESC;
--   -- diharapkan: AMPENAN 812
