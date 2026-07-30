-- ============================================================
-- Manajemen Work Order — Pengetatan RLS
-- Jalankan manual di Supabase SQL Editor SETELAH work-order-schema.sql.
--
-- Masalah kebijakan lama (`auth_all_*` USING(true)):
--   setiap akun yang login — termasuk akun petugas lapangan di aplikasi mobile —
--   dapat membaca, mengubah, dan MENGHAPUS baris WO unit mana pun, termasuk
--   memalsukan kolom verified_* / approved_*.
--
-- Kebijakan baru bertumpu pada tabel `user_roles` + `roles`:
--   • baca      → unit sendiri (UP3 lintas unit)
--   • tulis WO  → hanya role ber-flag can_assign (UP3/admin) pada unitnya
--   • item      → pengelola bebas; eksekutor hanya boleh melapor pada barisnya
--                 sendiri (regu = role-nya) dan TIDAK boleh menyentuh kolom
--                 verifikasi/persetujuan.
--
-- Penegakan kolom verifikasi/persetujuan memakai trigger, karena RLS tidak bisa
-- membatasi per-kolom.
--
-- ⚠ SEBELUM MENJALANKAN — uji dulu di project staging / di luar jam kerja.
--   Kebijakan ini ikut mengikat aplikasi mobile petugas (new-smart). Pastikan:
--     1) tiap petugas punya baris user_roles (user_id = auth.uid()) dengan
--        role & unit terisi — kalau kosong, semua query-nya akan tertolak;
--     2) mobile hanya meng-update baris yang regu-nya = role petugas, dan tidak
--        pernah menulis kolom verified_* / approved_* / regu / batch_id.
--   Rollback cepat bila ada yang tertahan:
--     DROP TRIGGER IF EXISTS trg_wo_item_guard ON wo_item;
--     CREATE POLICY "auth_all_wo_item"  ON wo_item  FOR ALL TO authenticated USING (true) WITH CHECK (true);
--     CREATE POLICY "auth_all_wo_batch" ON wo_batch FOR ALL TO authenticated USING (true) WITH CHECK (true);
-- ============================================================

-- ── Fungsi bantu ────────────────────────────────────────────────────────────
-- Diambil dari user_roles milik user yang sedang login.

CREATE OR REPLACE FUNCTION wo_my_role() RETURNS TEXT
LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT role FROM user_roles WHERE user_id = auth.uid() LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION wo_my_unit() RETURNS TEXT
LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT unit FROM user_roles WHERE user_id = auth.uid() LIMIT 1;
$$;

/** TRUE bila role user boleh melihat seluruh unit (UP3). */
CREATE OR REPLACE FUNCTION wo_sees_all() RETURNS BOOLEAN
LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE((SELECT sees_all_units FROM roles WHERE code = wo_my_role()), wo_my_role() = 'UP3');
$$;

/** TRUE bila role user adalah pengelola WO (UP3/admin — flag can_assign). */
CREATE OR REPLACE FUNCTION wo_can_manage() RETURNS BOOLEAN
LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE((SELECT can_assign FROM roles WHERE code = wo_my_role()), wo_my_role() IN ('UP3','admin'));
$$;

CREATE OR REPLACE FUNCTION wo_can_verify() RETURNS BOOLEAN
LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE((SELECT can_verify_wo FROM roles WHERE code = wo_my_role()), FALSE);
$$;

CREATE OR REPLACE FUNCTION wo_can_approve() RETURNS BOOLEAN
LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE((SELECT can_approve_wo FROM roles WHERE code = wo_my_role()), FALSE);
$$;

/** TRUE bila batch berada di unit yang boleh diakses user. */
CREATE OR REPLACE FUNCTION wo_batch_in_scope(p_batch UUID) RETURNS BOOLEAN
LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM wo_batch b
    WHERE b.id = p_batch AND (wo_sees_all() OR b.ulp = wo_my_unit())
  );
$$;

-- ── wo_batch ────────────────────────────────────────────────────────────────

ALTER TABLE wo_batch ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "auth_all_wo_batch"   ON wo_batch;
DROP POLICY IF EXISTS "wo_batch_select"     ON wo_batch;
DROP POLICY IF EXISTS "wo_batch_insert"     ON wo_batch;
DROP POLICY IF EXISTS "wo_batch_update"     ON wo_batch;
DROP POLICY IF EXISTS "wo_batch_delete"     ON wo_batch;

CREATE POLICY "wo_batch_select" ON wo_batch FOR SELECT TO authenticated
  USING (wo_sees_all() OR ulp = wo_my_unit());

CREATE POLICY "wo_batch_insert" ON wo_batch FOR INSERT TO authenticated
  WITH CHECK (wo_can_manage() AND (wo_sees_all() OR ulp = wo_my_unit()));

CREATE POLICY "wo_batch_update" ON wo_batch FOR UPDATE TO authenticated
  USING (wo_can_manage() AND (wo_sees_all() OR ulp = wo_my_unit()))
  WITH CHECK (wo_can_manage() AND (wo_sees_all() OR ulp = wo_my_unit()));

CREATE POLICY "wo_batch_delete" ON wo_batch FOR DELETE TO authenticated
  USING (wo_can_manage() AND (wo_sees_all() OR ulp = wo_my_unit()));

-- ── wo_item ─────────────────────────────────────────────────────────────────

ALTER TABLE wo_item ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "auth_all_wo_item" ON wo_item;
DROP POLICY IF EXISTS "wo_item_select"   ON wo_item;
DROP POLICY IF EXISTS "wo_item_insert"   ON wo_item;
DROP POLICY IF EXISTS "wo_item_update"   ON wo_item;
DROP POLICY IF EXISTS "wo_item_delete"   ON wo_item;

-- Eksekutor hanya melihat barisnya sendiri; pengelola/verifikator lihat se-unit.
CREATE POLICY "wo_item_select" ON wo_item FOR SELECT TO authenticated
  USING (
    wo_batch_in_scope(batch_id)
    AND (wo_can_manage() OR wo_can_verify() OR wo_can_approve() OR regu = wo_my_role())
  );

CREATE POLICY "wo_item_insert" ON wo_item FOR INSERT TO authenticated
  WITH CHECK (wo_can_manage() AND wo_batch_in_scope(batch_id));

CREATE POLICY "wo_item_update" ON wo_item FOR UPDATE TO authenticated
  USING (
    wo_batch_in_scope(batch_id)
    AND (wo_can_manage() OR wo_can_verify() OR wo_can_approve() OR regu = wo_my_role())
  )
  WITH CHECK (wo_batch_in_scope(batch_id));

CREATE POLICY "wo_item_delete" ON wo_item FOR DELETE TO authenticated
  USING (wo_can_manage() AND wo_batch_in_scope(batch_id));

-- ── Trigger: lindungi kolom verifikasi & persetujuan ────────────────────────
-- RLS bekerja per-baris, bukan per-kolom. Tanpa ini, eksekutor yang sah
-- mengubah barisnya sendiri masih bisa mengisi verified_at/approved_at.

CREATE OR REPLACE FUNCTION wo_item_guard_columns() RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_manage  BOOLEAN := wo_can_manage();
  v_verify  BOOLEAN := wo_can_verify();
  v_approve BOOLEAN := wo_can_approve();
BEGIN
  -- Kolom verifikasi: hanya verifikator, approver, atau pengelola.
  IF NOT (v_verify OR v_approve OR v_manage) THEN
    IF NEW.verified_by   IS DISTINCT FROM OLD.verified_by
    OR NEW.verified_role IS DISTINCT FROM OLD.verified_role
    OR NEW.verified_at   IS DISTINCT FROM OLD.verified_at
    OR NEW.sla_ok        IS DISTINCT FROM OLD.sla_ok
    OR NEW.verified_note IS DISTINCT FROM OLD.verified_note THEN
      RAISE EXCEPTION 'Role % tidak berhak mengubah data verifikasi WO', wo_my_role();
    END IF;
  END IF;

  -- Kolom persetujuan: hanya approver atau pengelola.
  IF NOT (v_approve OR v_manage) THEN
    IF NEW.approved_by IS DISTINCT FROM OLD.approved_by
    OR NEW.approved_at IS DISTINCT FROM OLD.approved_at THEN
      RAISE EXCEPTION 'Role % tidak berhak menyetujui WO', wo_my_role();
    END IF;
  END IF;

  -- Eksekutor tidak boleh memindahkan baris ke regu lain atau batch lain.
  IF NOT v_manage THEN
    IF NEW.batch_id IS DISTINCT FROM OLD.batch_id
    OR NEW.regu     IS DISTINCT FROM OLD.regu THEN
      RAISE EXCEPTION 'Role % tidak berhak memindahkan baris WO', wo_my_role();
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_wo_item_guard ON wo_item;
CREATE TRIGGER trg_wo_item_guard
  BEFORE UPDATE ON wo_item
  FOR EACH ROW EXECUTE FUNCTION wo_item_guard_columns();

-- ── Verifikasi cepat setelah dijalankan ─────────────────────────────────────
-- SELECT wo_my_role(), wo_my_unit(), wo_sees_all(), wo_can_manage();
-- SELECT policyname, cmd FROM pg_policies WHERE tablename IN ('wo_batch','wo_item') ORDER BY tablename, cmd;
