import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { MOBILE_MENUS } from "@/lib/roles";

const VALID_MENU_IDS = new Set(MOBILE_MENUS.map((m) => m.id));
const sanitizeMenus = (menus: unknown): string[] =>
  Array.isArray(menus) ? [...new Set(menus.filter((m): m is string => typeof m === "string" && VALID_MENU_IDS.has(m)))] : [];

// service role → bypass RLS
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } },
);

// Role global = konfigurasi tingkat unit induk → hanya UP3 yang boleh menulis.
async function verifyUP3(req: NextRequest) {
  const token = req.headers.get("authorization")?.replace("Bearer ", "");
  if (!token) return null;
  const { data: { user } } = await supabaseAdmin.auth.getUser(token);
  if (!user) return null;
  const { data: role } = await supabaseAdmin
    .from("user_roles").select("role").eq("user_id", user.id).single();
  return role?.role === "UP3" ? user : null;
}

const CODE_RE = /^[A-Z0-9_]{2,30}$/;

interface RolePayload {
  code?: string;
  label?: string;
  platform?: string;
  needs_unit?: boolean;
  is_eksekutor?: boolean;
  sees_all_units?: boolean;
  can_assign?: boolean;
  can_verify_wo?: boolean;
  can_approve_wo?: boolean;
  menus?: string[];
  urutan?: number;
}

// ── POST /api/roles — buat role baru ─────────────────────────────────────────
export async function POST(req: NextRequest) {
  if (!(await verifyUP3(req))) return NextResponse.json({ error: "Hanya UP3 yang boleh mengelola role" }, { status: 401 });

  const body = (await req.json()) as RolePayload;
  const code = (body.code ?? "").trim().toUpperCase();
  const label = (body.label ?? "").trim();

  if (!CODE_RE.test(code)) return NextResponse.json({ error: "Kode role: 2-30 karakter, huruf kapital/angka/underscore" }, { status: 400 });
  if (!label) return NextResponse.json({ error: "Label wajib diisi" }, { status: 400 });

  const { error } = await supabaseAdmin.from("roles").insert({
    code,
    label,
    platform: body.platform ?? "mobile",
    needs_unit: body.needs_unit ?? true,
    is_eksekutor: body.is_eksekutor ?? false,
    sees_all_units: body.sees_all_units ?? false,
    can_assign: body.can_assign ?? false,
    can_verify_wo: body.can_verify_wo ?? false,
    can_approve_wo: body.can_approve_wo ?? false,
    is_system: false,
    menus: sanitizeMenus(body.menus),
    urutan: body.urutan ?? 99,
  });

  if (error) {
    const msg = error.code === "23505" ? `Kode role "${code}" sudah ada` : error.message;
    return NextResponse.json({ error: msg }, { status: 400 });
  }
  return NextResponse.json({ success: true });
}

/**
 * Cari role menurut kodenya, TANPA memedulikan besar-kecil huruf.
 *
 * Kode role di database tidak seragam — `admin`, `inspektor`, dan `manager`
 * huruf kecil, sisanya huruf besar. PATCH dan DELETE dulu membesarkan kodenya
 * sebelum mencari, jadi ketiga role itu SELALU berbunyi "Role tidak ditemukan"
 * dan menunya tidak pernah bisa diubah dari halaman Kelola Role.
 *
 * Tidak memakai `ilike`: kode seperti `INSPEKSI_JTM` mengandung garis bawah,
 * dan garis bawah itu wildcard di LIKE — bisa mencocoki role yang salah.
 * Tabelnya belasan baris, jadi mencocokkan di sini lebih aman dan tetap murah.
 */
async function cariRole(kode: string) {
  const { data } = await supabaseAdmin.from("roles").select("code,is_system");
  return (data ?? []).find((r) => r.code.toLowerCase() === kode.toLowerCase()) ?? null;
}

// ── PATCH /api/roles — ubah role ─────────────────────────────────────────────
export async function PATCH(req: NextRequest) {
  if (!(await verifyUP3(req))) return NextResponse.json({ error: "Hanya UP3 yang boleh mengelola role" }, { status: 401 });

  const body = (await req.json()) as RolePayload;
  const code = (body.code ?? "").trim();
  if (!code) return NextResponse.json({ error: "code wajib diisi" }, { status: 400 });

  const existing = await cariRole(code);
  if (!existing) return NextResponse.json({ error: "Role tidak ditemukan" }, { status: 404 });

  // Partial-tolerant: hanya field yang dikirim yang diubah (mendukung save menus-only dari matriks).
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (typeof body.label === "string") patch.label = body.label.trim();
  if (typeof body.platform === "string") patch.platform = body.platform;
  if (typeof body.urutan === "number") patch.urutan = body.urutan;
  // Akses menu boleh diubah untuk semua role (termasuk sistem)
  if (Array.isArray(body.menus)) patch.menus = sanitizeMenus(body.menus);
  // Flag struktural terkunci untuk role sistem
  if (!existing.is_system) {
    if (typeof body.needs_unit === "boolean") patch.needs_unit = body.needs_unit;
    if (typeof body.is_eksekutor === "boolean") patch.is_eksekutor = body.is_eksekutor;
    if (typeof body.sees_all_units === "boolean") patch.sees_all_units = body.sees_all_units;
    if (typeof body.can_assign === "boolean") patch.can_assign = body.can_assign;
    if (typeof body.can_verify_wo === "boolean") patch.can_verify_wo = body.can_verify_wo;
    if (typeof body.can_approve_wo === "boolean") patch.can_approve_wo = body.can_approve_wo;
  }

  const { error } = await supabaseAdmin.from("roles").update(patch).eq("code", existing.code);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ success: true });
}

// ── DELETE /api/roles — hapus role ───────────────────────────────────────────
export async function DELETE(req: NextRequest) {
  if (!(await verifyUP3(req))) return NextResponse.json({ error: "Hanya UP3 yang boleh mengelola role" }, { status: 401 });

  const { code } = await req.json();
  if (!code) return NextResponse.json({ error: "code wajib diisi" }, { status: 400 });

  const existing = await cariRole(String(code).trim());
  if (!existing) return NextResponse.json({ error: "Role tidak ditemukan" }, { status: 404 });
  if (existing.is_system) return NextResponse.json({ error: "Role sistem tidak bisa dihapus" }, { status: 400 });

  const { error } = await supabaseAdmin.from("roles").delete().eq("code", existing.code);
  if (error) {
    // 23503 = FK violation → masih dipakai user
    const msg = error.code === "23503" ? "Role sedang dipakai user — pindahkan user itu dulu" : error.message;
    return NextResponse.json({ error: msg }, { status: 400 });
  }
  return NextResponse.json({ success: true });
}
