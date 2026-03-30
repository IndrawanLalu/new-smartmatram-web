import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase-admin";

export interface MorningBriefSettings {
  send_hour_wita: number;
  enabled: boolean;
}

export async function GET() {
  const { data, error } = await supabaseAdmin
    .from("morning_brief_settings")
    .select("send_hour_wita, enabled")
    .eq("id", 1)
    .single();

  if (error || !data) {
    return NextResponse.json<MorningBriefSettings>({ send_hour_wita: 8, enabled: true });
  }
  return NextResponse.json<MorningBriefSettings>(data);
}

export async function PUT(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user || (user.role !== "UP3" && user.role !== "admin")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await request.json() as Partial<MorningBriefSettings>;
  const { enabled } = body;

  if (enabled === undefined || typeof enabled !== "boolean") {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  const { error } = await supabaseAdmin
    .from("morning_brief_settings")
    .upsert({ id: 1, send_hour_wita: 8, enabled, updated_at: new Date().toISOString() });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
