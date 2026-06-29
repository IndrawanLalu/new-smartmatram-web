import { NextResponse } from "next/server";
import { createSupabaseServer } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";

async function getAuth() {
  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  return { supabase, user };
}

// GET /api/apkt/koreksi → semua koreksi (untuk menandai tabel & memuat ulang form)
export async function GET() {
  const { supabase, user } = await getAuth();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data, error } = await supabase
    .from("apkt_koreksi")
    .select("*")
    .order("tgl_koreksi", { ascending: false });
  if (error) return NextResponse.json({ rows: [], error: error.message });
  return NextResponse.json({ rows: data ?? [] });
}

// POST /api/apkt/koreksi  body: { row }  → upsert by no_laporan
export async function POST(req: Request) {
  const { supabase, user } = await getAuth();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const row = (await req.json().catch(() => ({}))).row as Record<string, unknown> | undefined;
  if (!row?.no_laporan) {
    return NextResponse.json({ error: "no_laporan wajib" }, { status: 400 });
  }

  const payload = { ...row, tgl_koreksi: new Date().toISOString() };
  const { data, error } = await supabase
    .from("apkt_koreksi")
    .upsert(payload, { onConflict: "no_laporan" })
    .select("no_laporan")
    .single();

  if (error) {
    return NextResponse.json(
      { error: error.message, hint: "Pastikan scripts/apkt-koreksi-schema.sql sudah dijalankan." },
      { status: 500 },
    );
  }
  return NextResponse.json({ ok: true, no_laporan: data?.no_laporan });
}
