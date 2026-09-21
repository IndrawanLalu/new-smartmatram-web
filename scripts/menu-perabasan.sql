-- =============================================================================
-- Beri akses menu "Perabasan" ke role yang mengerjakannya
-- Jalankan kapan saja. Idempoten. TIDAK perlu OTA baru.
--
-- ── KENAPA PERLU ────────────────────────────────────────────────────────────
-- WO sudah terbit, RABAS 2 sudah kebagian dua segmen — tapi di HP tidak ada
-- apa-apa. Penyebabnya bukan WO-nya dan bukan penyaringan regunya: MENUNYA
-- yang tidak pernah muncul.
--
-- Daftar menu HP datang dari kolom `roles.menus`, bukan dari kode. Selama
-- sebuah id menu tidak ada di sana, layarnya terpasang di aplikasi tapi tidak
-- ada pintu masuknya — tanpa galat, tanpa tanda, cuma tidak ada. Persis
-- seperti OTA yang gagal.
--
-- Jebakannya sudah tertulis di `lib/roles.ts`, dan saya tetap masuk ke
-- dalamnya: menunya ditambahkan di `menuConfig.ts` aplikasi HP, tapi tidak
-- didaftarkan di `MOBILE_MENUS` sisi web maupun di `roles.menus`. Berkas ini
-- menutup yang kedua; yang pertama dibetulkan langsung di `lib/roles.ts`.
--
-- Diperiksa 21 Sep 2026 — PERABASAN.menus berisi:
--   petaPohon, gangguan, bebanTrafo, pengukuranGardu, riwayatGardu, scanMeter
-- Tidak ada "perabasan" di situ.
-- =============================================================================

UPDATE public.roles
SET menus = (
      SELECT array_agg(DISTINCT m ORDER BY m)
      FROM unnest(COALESCE(menus, '{}') || ARRAY['perabasan']) AS m
    ),
    updated_at = now()
-- PERABASAN jelas perlu. Admin ULP juga: dia yang memeriksa hasil regu, dan
-- menu yang cuma dimiliki regu tidak bisa dipakai menengok pekerjaannya.
-- SILAKAN UBAH daftar ini kalau di unit Bapak yang merabas bukan cuma mereka.
WHERE code IN ('PERABASAN', 'admin')
  AND NOT ('perabasan' = ANY(COALESCE(menus, '{}')));

-- Periksa hasilnya
SELECT code, label,
       'perabasan' = ANY(COALESCE(menus, '{}')) AS punya_menu_perabasan,
       COALESCE(array_length(menus, 1), 0)      AS jumlah_menu
FROM public.roles
ORDER BY urutan;

-- =============================================================================
-- SESUDAH INI: petugas PERABASAN cukup KELUAR lalu MASUK LAGI di HP.
-- Daftar menu dibaca saat login, bukan tiap layar dibuka — jadi menutup dan
-- membuka aplikasi saja tidak cukup.
--
-- Kalau kelak mau dicabut, lakukan dari Kelola Role di web (menunya sudah
-- terdaftar di sana sesudah web di-deploy), bukan lewat SQL.
-- =============================================================================
