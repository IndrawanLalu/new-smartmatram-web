import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { createSupabaseServer } from "@/lib/supabase-server";
import { getCurrentUser } from "@/lib/auth";

// GET — dipakai internal (reminder cron, dll), auth via AGENT_SECRET
export async function GET(req: NextRequest) {
  const secret = req.headers.get("x-agent-secret");
  if (secret !== process.env.AGENT_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { data, error } = await supabaseAdmin
    .from("wa_settings")
    .select("id, label, category, ulp, group_id, enabled")
    .order("category")
    .order("ulp");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data ?? []);
}

// PATCH — update satu setting, hanya UP3 dan admin
export async function PATCH(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user || (user.role !== "UP3" && user.role !== "admin")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id, group_id, enabled } = await req.json() as {
    id: string;
    group_id?: string;
    enabled?: boolean;
  };

  if (!id) return NextResponse.json({ error: "id wajib diisi" }, { status: 400 });

  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (group_id !== undefined) patch.group_id = group_id.trim();
  if (enabled  !== undefined) patch.enabled  = enabled;

  const supabase = await createSupabaseServer();
  const { data, error } = await supabase
    .from("wa_settings")
    .update(patch)
    .eq("id", id)
    .select("id, label, category, ulp, group_id, enabled")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}
