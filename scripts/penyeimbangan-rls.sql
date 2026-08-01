-- =============================================================================
-- Fase 0 — Pengetatan RLS penyeimbangan_gardu
--
-- ⚠ JANGAN DIJALANKAN SEBELUM DIBACA & DISETUJUI.
--   Skrip ini MENGUBAH HAK AKSES. Dipisah dari penyeimbangan-mobile-schema.sql
--   supaya migrasi struktur bisa jalan lebih dulu tanpa menyentuh keamanan.
--
-- Keadaan sekarang (dari scripts/penyeimbangan-schema.sql):
--   CREATE POLICY "Allow all for authenticated" ... FOR ALL USING (true)
--   → setiap akun yang login bisa membaca, mengubah, dan MENGHAPUS baris
--     ULP mana pun. Aman selama hanya admin web yang punya akun; berbahaya
--     begitu petugas lapangan memakai aplikasi mobile.
--
-- Catatan penting sebelum menjalankan:
--   • Route server (/api/*) memakai service role → RLS dilewati, tidak terdampak.
--   • Web (supabaseBrowser) dan mobile memakai sesi user → TERDAMPAK.
--   • User tanpa baris user_roles aktif akan kehilangan akses ke tabel ini.
--     Cek dulu:  SELECT COUNT(*) FROM user_roles WHERE is_active;
-- =============================================================================

ALTER TABLE penyeimbangan_gardu ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow all for authenticated" ON penyeimbangan_gardu;

-- ── Baca: unit sendiri; UP3 (sees_all_units) melihat semua ──────────────────
DROP POLICY IF EXISTS penyeimbangan_select ON penyeimbangan_gardu;
CREATE POLICY penyeimbangan_select ON penyeimbangan_gardu
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_roles ur
      JOIN roles r ON r.code = ur.role
      WHERE ur.user_id = auth.uid()
        AND ur.is_active
        AND (r.sees_all_units OR ur.unit = penyeimbangan_gardu.ulp)
    )
  );

-- ── Tulis baru: hanya untuk unit sendiri ────────────────────────────────────
-- Mencegah petugas mengklaim WO milik ULP lain.
DROP POLICY IF EXISTS penyeimbangan_insert ON penyeimbangan_gardu;
CREATE POLICY penyeimbangan_insert ON penyeimbangan_gardu
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_roles ur
      JOIN roles r ON r.code = ur.role
      WHERE ur.user_id = auth.uid()
        AND ur.is_active
        AND (r.sees_all_units OR ur.unit = penyeimbangan_gardu.ulp)
    )
  );

-- ── Ubah: unit sendiri, DAN hanya pekerjaannya sendiri ──────────────────────
-- Petugas lapangan hanya boleh menyunting baris yang ia klaim sendiri.
-- Admin/UP3 (can_assign) boleh menyunting apa pun di cakupan unitnya —
-- mereka yang membetulkan salah input.
DROP POLICY IF EXISTS penyeimbangan_update ON penyeimbangan_gardu;
CREATE POLICY penyeimbangan_update ON penyeimbangan_gardu
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_roles ur
      JOIN roles r ON r.code = ur.role
      WHERE ur.user_id = auth.uid()
        AND ur.is_active
        AND (r.sees_all_units OR ur.unit = penyeimbangan_gardu.ulp)
        AND (r.can_assign OR penyeimbangan_gardu.petugas_uid = auth.uid()::text)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_roles ur
      JOIN roles r ON r.code = ur.role
      WHERE ur.user_id = auth.uid()
        AND ur.is_active
        AND (r.sees_all_units OR ur.unit = penyeimbangan_gardu.ulp)
    )
  );

-- ── Hapus: admin/UP3, ATAU petugas melepas klaimnya sendiri ─────────────────
-- Menghapus rekap yang sudah 'Selesai' berarti menghilangkan bukti pekerjaan,
-- jadi itu tetap hak admin/UP3 saja.
--
-- Tapi petugas HARUS bisa melepas tugas yang telanjur ia ambil (tombol "Lepas"
-- di daftar mobile) — kalau tidak, satu salah klaim mengunci WO itu selamanya
-- dari petugas lain. Karena itu baris berstatus 'Dikerjakan' MILIK SENDIRI
-- boleh dihapus: yang hilang cuma klaim kosong, bukan hasil kerja.
DROP POLICY IF EXISTS penyeimbangan_delete ON penyeimbangan_gardu;
CREATE POLICY penyeimbangan_delete ON penyeimbangan_gardu
  FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_roles ur
      JOIN roles r ON r.code = ur.role
      WHERE ur.user_id = auth.uid()
        AND ur.is_active
        AND (r.sees_all_units OR ur.unit = penyeimbangan_gardu.ulp)
        AND (
          r.can_assign
          OR (
            penyeimbangan_gardu.petugas_uid = auth.uid()::text
            AND penyeimbangan_gardu.status = 'Dikerjakan'
          )
        )
    )
  );

-- Verifikasi setelah dijalankan:
--   SELECT policyname, cmd FROM pg_policies WHERE tablename = 'penyeimbangan_gardu';
--
-- Uji manual yang disarankan sebelum mobile dirilis:
--   1. Login sebagai admin ULP A  → baris ULP B tidak terlihat
--   2. Login sebagai petugas      → tidak bisa menghapus baris apa pun
--   3. Login sebagai UP3          → semua ULP terlihat & bisa dikoreksi
