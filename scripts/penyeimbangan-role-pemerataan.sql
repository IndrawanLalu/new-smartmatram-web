-- =============================================================================
-- Fase 0 — Role petugas Pemerataan Beban
-- Jalankan manual di Supabase SQL Editor. Idempoten.
--
-- Bisa juga dibuat lewat UI Kelola Role (halaman Manajemen User, khusus UP3).
-- Skrip ini disediakan supaya hasilnya sama persis dan bisa diulang di
-- lingkungan lain tanpa mengklik satu per satu.
-- =============================================================================

INSERT INTO roles (
  code, label, platform,
  needs_unit, is_eksekutor, sees_all_units, can_assign,
  can_verify_wo, can_approve_wo, is_system,
  menus, urutan
)
VALUES (
  'PEMERATAAN', 'Pemerataan Beban', 'mobile',
  true,   -- needs_unit    : tugas selalu dibatasi ULP petugas
  false,  -- is_eksekutor  : lihat catatan di bawah
  false,  -- sees_all_units
  false,  -- can_assign
  false, false,
  false,  -- is_system     : role kustom, boleh disunting/dihapus dari UI
  ARRAY['penyeimbangan', 'riwayatGardu', 'scanMeter'],
  15
)
ON CONFLICT (code) DO NOTHING;

-- Catatan `is_eksekutor = false` (berbeda dari rancangan awal):
--
-- Flag itu otomatis memberi role menu **Work Order** di mobile (lihat komentar
-- MOBILE_MENUS di lib/roles.ts: "WO otomatis untuk role ber-flag is_eksekutor").
-- Modul Work Order adalah sistem WO batch yang berbeda dari WO gardu.
--
-- Tugas petugas pemerataan TIDAK datang dari sana — datangnya dari
-- pengukuran_gardu.jenis_pemeliharaan = 'PEMERATAAN BEBAN'. Kalau flag ini
-- dinyalakan, mereka mendapat satu tab Work Order yang selamanya kosong.
--
-- Kalau nanti pemerataan memang mau dimasukkan ke modul Work Order, ubah flag
-- ini lewat UI Kelola Role — tidak perlu skrip lagi.

-- Verifikasi:
--   SELECT code, label, platform, needs_unit, is_eksekutor, menus
--   FROM roles WHERE code = 'PEMERATAAN';
