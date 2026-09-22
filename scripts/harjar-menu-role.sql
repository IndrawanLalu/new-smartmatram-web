-- =============================================================================
-- Beri akses menu "Pemeliharaan JTM/JTR" ke role yang mengerjakannya
--
-- Menu di aplikasi HP datang dari kolom `roles.menus`, bukan dari kode. Menu
-- baru karena itu tidak muncul di HP siapa pun sampai id-nya dimasukkan ke
-- daftar milik sebuah role — tanpa galat, tanpa tanda, cuma tidak ada.
--
-- Skrip ini SATU BARIS pekerjaan yang sama dengan mencentangnya di halaman
-- Kelola Role. Dipakai kalau webnya belum sempat di-deploy ulang, karena
-- daftar centang di sana baru mengenal "Pemeliharaan JTM/JTR" setelah deploy.
--
-- DIJALANKAN SETELAH `scripts/pemeliharaan-jaringan.sql`. Membuka menunya
-- sebelum tabelnya ada berarti regu membuka layar yang langsung gagal memuat.
--
-- SILAKAN UBAH daftar role di bawah sesuai siapa yang benar-benar mengerjakan
-- pemeliharaan jaringan di unit Bapak. Yang tertulis sekarang cuma dugaan saya:
-- HARJAR yang mengerjakan, admin yang ikut melihat dari HP.
-- =============================================================================

UPDATE public.roles
SET menus = (
      SELECT array_agg(DISTINCT m ORDER BY m)
      FROM unnest(COALESCE(menus, '{}') || ARRAY['harjar']) AS m
    ),
    updated_at = now()
WHERE code IN ('admin', 'HARJAR')
  -- Role yang `menus`-nya masih kosong sengaja TIDAK disentuh di sini kalau
  -- memang mau tetap memakai daftar bawaan dari kode. Hapus baris ini kalau
  -- Bapak ingin HARJAR pindah ke daftar yang diatur dari database.
  AND (menus IS NOT NULL AND array_length(menus, 1) > 0 OR code = 'HARJAR');

-- Periksa hasilnya
SELECT code, label,
       'harjar' = ANY(COALESCE(menus, '{}')) AS bisa_pemeliharaan_jaringan,
       COALESCE(array_length(menus, 1), 0)   AS jumlah_menu,
       menus
FROM public.roles
ORDER BY urutan;
