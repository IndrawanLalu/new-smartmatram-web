-- =============================================================================
-- Beri akses menu "Pemeliharaan Gardu" ke role yang mengerjakannya
--
-- Menu di aplikasi HP datang dari kolom `roles.menus`, bukan dari kode. Menu
-- baru karena itu tidak muncul di HP siapa pun sampai id-nya dimasukkan ke
-- daftar milik sebuah role — tanpa galat, tanpa tanda, cuma tidak ada.
--
-- Skrip ini SATU BARIS pekerjaan yang sama dengan mencentangnya di halaman
-- Kelola Role. Dipakai kalau webnya belum sempat di-deploy ulang, karena
-- daftar centang di sana baru mengenal "Pemeliharaan Gardu" setelah deploy.
--
-- SILAKAN UBAH daftar role di bawah sesuai siapa yang benar-benar mengerjakan
-- pemeliharaan gardu di unit Bapak. Yang tertulis sekarang cuma dugaan saya.
-- =============================================================================

UPDATE public.roles
SET menus = (
      SELECT array_agg(DISTINCT m ORDER BY m)
      FROM unnest(COALESCE(menus, '{}') || ARRAY['hargardu']) AS m
    ),
    updated_at = now()
WHERE code IN ('admin', 'HARGAR')
  -- Role yang `menus`-nya masih kosong sengaja TIDAK disentuh di sini kalau
  -- memang mau tetap memakai daftar bawaan dari kode. Hapus baris ini kalau
  -- Bapak ingin HARGAR pindah ke daftar yang diatur dari database.
  AND (menus IS NOT NULL AND array_length(menus, 1) > 0 OR code = 'HARGAR');

-- Periksa hasilnya
SELECT code, label,
       'hargardu' = ANY(COALESCE(menus, '{}')) AS bisa_pemeliharaan_gardu,
       COALESCE(array_length(menus, 1), 0)     AS jumlah_menu,
       menus
FROM public.roles
ORDER BY urutan;
