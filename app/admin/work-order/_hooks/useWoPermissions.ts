"use client";

import { useMemo } from "react";
import { useCurrentUser } from "@/app/admin/_context/UserContext";
import { useRoles } from "@/app/admin/_hooks/useRoles";
import { canAssignEksekutor, canSeeAllUnits } from "@/lib/roles";
import type { WoBatch } from "../_types";

export interface WoPermissions {
  /** Boleh membuka batch ini (unit sendiri, atau UP3). */
  canView: boolean;
  /**
   * Pengelola WO: edit sel, tetapkan regu/verifikator, tambah/hapus baris,
   * ubah header WO, dan menandai/membatalkan status selesai.
   */
  canManage: boolean;
  /** Verifikator WO (flag `can_verify_wo` di tabel roles). */
  canVerify: boolean;
  /** Approver WO (flag `can_approve_wo`). */
  canApprove: boolean;
}

/**
 * Hak akses satu batch WO. Semua bersumber dari tabel `roles` (data-driven),
 * dikombinasikan dengan kecocokan unit batch vs unit user.
 *
 * Catatan: ini lapisan UI. Penegakan sebenarnya ada di RLS
 * (`scripts/work-order-rls.sql`) — keduanya harus sejalan.
 */
export function useWoPermissions(batch: WoBatch | null): WoPermissions {
  const user = useCurrentUser();
  const { roles } = useRoles();

  return useMemo(() => {
    const myRole = roles.find((r) => r.code === user.role);
    const seesAll = myRole?.sees_all_units ?? canSeeAllUnits(user.role);
    const sameUnit = !batch || seesAll || batch.ulp === user.unit;
    const isManager = myRole?.can_assign ?? canAssignEksekutor(user.role);

    return {
      canView: sameUnit,
      canManage: sameUnit && isManager,
      canVerify: sameUnit && !!myRole?.can_verify_wo,
      canApprove: sameUnit && !!myRole?.can_approve_wo,
    };
  }, [roles, user.role, user.unit, batch]);
}
