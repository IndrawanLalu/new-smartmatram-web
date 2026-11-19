import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { cekTokenApkt } from "@/lib/apktToken";

export const dynamic = "force-dynamic";

// GET /api/apkt/koreksi/masuk?no=G44…&t=<token>
// Dipanggil bookmark "Isi APKT dari Smart" dari halaman APKT (asal lain, tanpa
// sesi Smart) setelah APKT selesai menyimpan sebuah laporan. Hanya menandai
// koreksi yang sudah ada; laporan itu lalu tidak ikut antrean berikutnya.

const CORS = { "Access-Control-Allow-Origin": "*" };

export async function GET(req: Request) {
  const u = new URL(req.url);
  const no = (u.searchParams.get("no") ?? "").trim();
  if (!/^[A-Z0-9]{5,30}$/.test(no) || !cekTokenApkt(u.searchParams.get("t"))) {
    return new NextResponse(null, { status: 403, headers: CORS });
  }
  const { error } = await supabaseAdmin
    .from("apkt_koreksi")
    .update({ apkt_masuk_at: new Date().toISOString() })
    .eq("no_laporan", no)
    .is("apkt_masuk_at", null);
  return NextResponse.json({ ok: !error }, { status: error ? 500 : 200, headers: CORS });
}
