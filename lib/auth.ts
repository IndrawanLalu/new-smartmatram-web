import { createSupabaseServer } from "@/lib/supabase-server";
import { createClient } from "@supabase/supabase-js";
import { type CurrentUser, type Role, type Unit } from "@/lib/roles";

/**
 * Admin client (service_role) — hanya untuk server-side, bypass RLS.
 * Dipakai untuk lookup user_roles saja.
 */
function createAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

/**
 * Ambil data user yang sedang login + role & unit dari tabel user_roles.
 * Gunakan di Server Components dan Server Actions.
 *
 * @returns CurrentUser atau null jika belum login
 */
export async function getCurrentUser(): Promise<CurrentUser | null> {
  // Auth check pakai anon client (session dari cookie)
  const supabase = await createSupabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  // Role lookup pakai service_role — bypass RLS agar selalu terbaca
  const admin = createAdminClient();
  const { data: roleData } = await admin
    .from("user_roles")
    .select("role, unit, name, platform, is_active")
    .eq("user_id", user.id)
    .single();

  return {
    id: user.id,
    email: user.email ?? "",
    name: roleData?.name || user.email?.split("@")[0] || "User",
    role: (roleData?.role as Role) ?? "inspektor",
    unit: (roleData?.unit as Unit) ?? null,
    platform: roleData?.platform ?? "all",
    is_active: roleData?.is_active ?? true,
  };
}
