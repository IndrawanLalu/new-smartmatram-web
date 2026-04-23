import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

// Pakai service role untuk bypass RLS
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
);

// Verifikasi hanya UP3 atau admin yang bisa akses
async function verifyAccess(req: NextRequest) {
  const token = req.headers.get("authorization")?.replace("Bearer ", "");
  if (!token) return null;
  const { data: { user } } = await supabaseAdmin.auth.getUser(token);
  if (!user) return null;
  const { data: role } = await supabaseAdmin
    .from("user_roles").select("role, unit").eq("user_id", user.id).single();
  if (!role || (role.role !== "UP3" && role.role !== "admin")) return null;
  return { user, role };
}

// ── GET /api/users — list semua user dengan role ──────────────────────────────
export async function GET(req: NextRequest) {
  const access = await verifyAccess(req);
  if (!access) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const ulp = searchParams.get("ulp");

  let query = supabaseAdmin
    .from("user_roles")
    .select("id, user_id, name, role, unit, platform, is_active, created_at")
    .order("unit", { ascending: true })
    .order("role", { ascending: true });

  // Admin hanya bisa lihat user di unitnya sendiri
  if (access.role.role === "admin") {
    query = query.eq("unit", access.role.unit);
  } else if (ulp) {
    query = query.eq("unit", ulp);
  }

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Ambil email dari auth.users
  const { data: authUsers } = await supabaseAdmin.auth.admin.listUsers();
  const emailMap = new Map(authUsers.users.map((u) => [u.id, u.email]));

  const users = (data ?? []).map((u) => ({
    ...u,
    email: emailMap.get(u.user_id) ?? "",
  }));

  return NextResponse.json(users);
}

// ── POST /api/users — invite user baru ───────────────────────────────────────
export async function POST(req: NextRequest) {
  const access = await verifyAccess(req);
  if (!access) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { email, password, name, role, unit, platform } = await req.json();

  if (!email || !password || !name || !role) {
    return NextResponse.json({ error: "email, password, name, role wajib diisi" }, { status: 400 });
  }

  // Admin hanya bisa tambah user di unitnya sendiri
  if (access.role.role === "admin" && unit !== access.role.unit) {
    return NextResponse.json({ error: "Tidak bisa tambah user di unit lain" }, { status: 403 });
  }

  // Buat user langsung dengan password (tanpa email invite)
  const { data: invited, error: inviteErr } = await supabaseAdmin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });

  if (inviteErr) return NextResponse.json({ error: inviteErr.message }, { status: 500 });

  // Simpan role
  const { error: roleErr } = await supabaseAdmin.from("user_roles").insert({
    user_id: invited.user.id,
    name,
    role,
    unit: unit || null,
    platform: platform ?? "all",
    is_active: true,
  });

  if (roleErr) return NextResponse.json({ error: roleErr.message }, { status: 500 });

  return NextResponse.json({ success: true, userId: invited.user.id });
}

// ── PATCH /api/users — update role user ──────────────────────────────────────
export async function PATCH(req: NextRequest) {
  const access = await verifyAccess(req);
  if (!access) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id, name, role, unit, platform, is_active } = await req.json();
  if (!id) return NextResponse.json({ error: "id wajib diisi" }, { status: 400 });

  const { error } = await supabaseAdmin
    .from("user_roles")
    .update({ name, role, unit: unit || null, platform, is_active, updated_at: new Date().toISOString() })
    .eq("id", id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}

// ── DELETE /api/users — hapus user ───────────────────────────────────────────
export async function DELETE(req: NextRequest) {
  const access = await verifyAccess(req);
  if (!access) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id, user_id } = await req.json();
  if (!id || !user_id) return NextResponse.json({ error: "id dan user_id wajib diisi" }, { status: 400 });

  // Hapus role dulu
  await supabaseAdmin.from("user_roles").delete().eq("id", id);
  // Hapus auth user
  await supabaseAdmin.auth.admin.deleteUser(user_id);

  return NextResponse.json({ success: true });
}
