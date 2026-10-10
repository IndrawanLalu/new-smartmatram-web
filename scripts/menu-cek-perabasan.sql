-- =============================================================================
-- Menu HP "Cek Perabasan" (10 Okt 2026) — rencana-cek-perabasan.md C2
--
-- Dibuka untuk admin ULP, UP3, dan peran ber-izin verifikasi WO
-- (roles.can_verify_wo: Staff Teknik, TL Teknik, Koordinator). Sama dengan
-- mencentangnya di Kelola Role. Menu lama "Perabasan" tidak disentuh.
-- Hak sebenarnya tetap dijaga server (wajib_boleh_cek_perabasan).
-- roles.menus = TEXT[].
-- =============================================================================

UPDATE public.roles
SET menus = array_append(COALESCE(menus, '{}'::text[]), 'cekPerabasan'),
    updated_at = now()
WHERE (code IN ('admin', 'UP3') OR can_verify_wo)
  AND NOT ('cekPerabasan' = ANY (COALESCE(menus, '{}'::text[])));

-- Periksa:
-- SELECT code, 'cekPerabasan' = ANY (menus) AS cek FROM roles ORDER BY urutan;
