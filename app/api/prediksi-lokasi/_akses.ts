import { getCurrentUser } from "@/lib/auth";
import { canSeeAllUnits, type CurrentUser } from "@/lib/roles";

/** Pengguna + unit yang boleh dilihat (UP3 semua) + boleh mengisi lokasi temuan (UP3/admin). */
export async function akses(): Promise<{ me: CurrentUser; unit: string | null; bolehIsi: boolean } | null> {
  const me = await getCurrentUser();
  if (!me) return null;
  return { me, unit: canSeeAllUnits(me.role) ? null : me.unit, bolehIsi: me.role === "UP3" || me.role === "admin" };
}
