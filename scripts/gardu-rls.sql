-- =============================================================================
-- RLS tabel `gardu` — izinkan penulisan dari aplikasi
-- Jalankan manual di Supabase SQL Editor. Idempoten.
--
-- Gejalanya: impor master gagal seluruhnya dengan
--   42501 "new row violates row-level security policy for table gardu"
-- RLS aktif, tapi tidak ada satu pun kebijakan yang mengizinkan INSERT/UPDATE.
-- Membaca sudah jalan (peta Command Center hidup), jadi yang kurang hanya
-- kebijakan tulis.
--
-- Pola sama dengan `anomali_settings` dan `yantek_sla`: peran `authenticated`
-- boleh menulis, dan pembatasan SIAPA yang boleh menyunting ada di UI
-- (tombol Impor Master hanya muncul untuk yang lolos `canManageSettings`).
--
-- Catatan jujur soal batasannya: penjagaan di UI bukan penjagaan sesungguhnya.
-- Siapa pun yang sudah login secara teknis bisa memanggil PostgREST langsung.
-- Untuk master gardu yang dipakai lintas ULP, penjagaan yang benar adalah
-- memindahkan impor ke route server ber-service-role dengan pemeriksaan peran —
-- sama seperti `/api/roles` yang UP3-only. Belum dikerjakan; dicatat di sini
-- supaya tidak terlupakan.
-- =============================================================================

ALTER TABLE gardu ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "gardu_read"  ON gardu;
DROP POLICY IF EXISTS "gardu_write" ON gardu;

CREATE POLICY "gardu_read"
  ON gardu FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "gardu_write"
  ON gardu FOR ALL TO authenticated
  USING (true) WITH CHECK (true);

-- Periksa:
--   SELECT policyname, cmd FROM pg_policies WHERE tablename = 'gardu';
