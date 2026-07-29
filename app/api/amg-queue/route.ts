import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";

// User klik "Kirim ke AMG" → tandai antre. Agen lokal (smart-agent) yang mengirim.
export async function POST(req: NextRequest) {
  const token = req.headers.get("authorization")?.replace("Bearer ", "");
  if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { data: { user } } = await supabaseAdmin.auth.getUser(token);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = (await req.json()) as { pengukuranId?: string; pengukuranIds?: string[] };
  const ids = body.pengukuranIds ?? (body.pengukuranId ? [body.pengukuranId] : []);
  if (ids.length === 0) return NextResponse.json({ error: "pengukuranId(s) wajib" }, { status: 400 });

  const { error } = await supabaseAdmin
    .from("pengukuran_gardu")
    .update({ amg_queued_at: new Date().toISOString(), amg_sent_at: null, amg_error: null })
    .in("id", ids);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, queued: ids.length });
}
