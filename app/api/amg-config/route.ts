import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } },
);

async function verifyAccess(req: NextRequest) {
  const token = req.headers.get("authorization")?.replace("Bearer ", "");
  if (!token) return null;
  const { data: { user } } = await supabaseAdmin.auth.getUser(token);
  if (!user) return null;
  const { data: role } = await supabaseAdmin
    .from("user_roles").select("role, unit").eq("user_id", user.id).single();
  if (!role || (role.role !== "UP3" && role.role !== "admin")) return null;
  return role as { role: string; unit: string | null };
}

// GET /api/amg-config — daftar config (UP3: semua, admin: unit sendiri). Password TIDAK dikembalikan.
export async function GET(req: NextRequest) {
  const access = await verifyAccess(req);
  if (!access) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let q = supabaseAdmin.from("amg_config").select("ulp, username, password, kode_prefixes, amg_url, updated_at");
  if (access.role === "admin" && access.unit) q = q.eq("ulp", access.unit);
  const { data, error } = await q;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const rows = (data ?? []).map((r) => ({
    ulp: r.ulp,
    username: r.username,
    kode_prefixes: r.kode_prefixes,
    amg_url: r.amg_url,
    updated_at: r.updated_at,
    hasPassword: !!r.password,   // jangan bocorkan password ke UI
  }));
  return NextResponse.json(rows);
}

// PATCH /api/amg-config — upsert satu ULP. Password hanya diubah bila dikirim (non-kosong).
/**
 * Rapikan URL AMG sebelum disimpan.
 *
 * Agen memakainya langsung: fetch(`${base}/index.php/...`). Tanpa skema, Node
 * melempar `TypeError: Failed to parse URL from 10.33.1.77/...`, dan baris itu
 * gagal berulang tanpa henti karena antrean agen tidak punya batas percobaan.
 * Skema http:// ditambahkan bila belum ada; garis miring di ujung dibuang agar
 * tidak menjadi `//index.php`.
 */
function normalizeAmgUrl(raw: string | undefined): string | null {
  const v = (raw ?? "").trim();
  if (!v) return null;
  const withScheme = /^https?:\/\//i.test(v) ? v : `http://${v}`;
  return withScheme.replace(/\/+$/, "");
}

export async function PATCH(req: NextRequest) {
  const access = await verifyAccess(req);
  if (!access) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json() as {
    ulp?: string; username?: string; password?: string; kode_prefixes?: string; amg_url?: string;
  };
  const ulp = (body.ulp ?? "").trim();
  if (!ulp) return NextResponse.json({ error: "ulp wajib" }, { status: 400 });
  if (access.role === "admin" && access.unit && ulp !== access.unit) {
    return NextResponse.json({ error: "Tidak boleh mengubah ULP lain" }, { status: 403 });
  }

  const patch: Record<string, unknown> = {
    ulp,
    username: (body.username ?? "").trim(),
    kode_prefixes: (body.kode_prefixes ?? "44150,44151").trim(),
    amg_url: normalizeAmgUrl(body.amg_url),
    updated_at: new Date().toISOString(),
  };
  if (body.password && body.password.length > 0) patch.password = body.password;

  // Upsert: jika password tidak dikirim, jangan timpa yang lama
  const { data: existing } = await supabaseAdmin.from("amg_config").select("ulp").eq("ulp", ulp).maybeSingle();
  const { error } = existing
    ? await supabaseAdmin.from("amg_config").update(patch).eq("ulp", ulp)
    : await supabaseAdmin.from("amg_config").insert({ password: "", ...patch });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
