import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { canSeeAllUnits } from "@/lib/roles";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { bacaSheetPro, idSpreadsheet } from "@/lib/proNtbSheet";

export const dynamic = "force-dynamic";

/**
 * Cek ke spreadsheet PRO NTB (8 Nov 2026, scripts/pro-ntb-sheet.sql) — BACA SAJA.
 * GET  ?ulp=AMPENAN&dari=…&sampai=… → baris tab WO di rentang itu
 * POST { ulp, link }               → simpan spreadsheet ULP (UP3 / admin ULP itu)
 */

async function izinUlp(ulp: string) {
  const me = await getCurrentUser();
  if (!me) return { galat: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  if (!ulp || ulp === "SEMUA") return { galat: NextResponse.json({ error: "Pilih satu ULP — tiap ULP punya spreadsheet sendiri." }, { status: 400 }) };
  if (!canSeeAllUnits(me.role) && (me.unit ?? "").toUpperCase() !== ulp.toUpperCase()) {
    return { galat: NextResponse.json({ error: "Spreadsheet ULP lain." }, { status: 403 }) };
  }
  return { me };
}

export async function GET(req: Request) {
  const q = new URL(req.url).searchParams;
  const ulp = (q.get("ulp") ?? "").toUpperCase();
  const r = await izinUlp(ulp);
  if ("galat" in r) return r.galat;
  const dari = q.get("dari") ?? "", sampai = q.get("sampai") ?? "";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dari) || !/^\d{4}-\d{2}-\d{2}$/.test(sampai)) {
    return NextResponse.json({ error: "Rentang tanggal tidak sah." }, { status: 400 });
  }
  const { data, error } = await supabaseAdmin.from("pro_ntb_sheet").select("spreadsheet_id").eq("ulp", ulp).maybeSingle();
  if (error) {
    const hint = /pro_ntb_sheet/.test(error.message) ? " — jalankan scripts/pro-ntb-sheet.sql di Supabase." : "";
    return NextResponse.json({ error: error.message + hint }, { status: 500 });
  }
  if (!data) return NextResponse.json({ spreadsheetId: null, baris: [] });
  try {
    return NextResponse.json({ spreadsheetId: data.spreadsheet_id, baris: await bacaSheetPro(data.spreadsheet_id, dari, sampai) });
  } catch (e) {
    return NextResponse.json({ spreadsheetId: data.spreadsheet_id, error: (e as Error).message }, { status: 502 });
  }
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const ulp = String(body.ulp ?? "").toUpperCase();
  const r = await izinUlp(ulp);
  if ("galat" in r) return r.galat;
  if (r.me.role !== "UP3" && r.me.role !== "admin") return NextResponse.json({ error: "Hanya UP3 dan admin." }, { status: 403 });
  const id = idSpreadsheet(String(body.link ?? ""));
  if (!id) return NextResponse.json({ error: "Link spreadsheet tidak dikenali." }, { status: 400 });
  const { error } = await supabaseAdmin.from("pro_ntb_sheet")
    .upsert({ ulp, spreadsheet_id: id, updated_at: new Date().toISOString(), updated_by: r.me.name ?? r.me.email });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ spreadsheetId: id });
}
