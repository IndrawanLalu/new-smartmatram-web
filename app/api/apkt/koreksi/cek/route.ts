import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { cekTokenApkt } from "@/lib/apktToken";

export const dynamic = "force-dynamic";

// GET /api/apkt/koreksi/cek?no=G44…&t=<token>
// Dipanggil bookmark "Isi APKT dari Smart" SEBELUM mengisi APKT: koreksinya masih
// ada, belum masuk APKT (mis. dari PC lain), dan waktunya yang TERBARU — antrean di
// papan klip bisa basi bila koreksi diubah sesudah disalin.

const CORS = { "Access-Control-Allow-Origin": "*" };

export async function GET(req: Request) {
  const u = new URL(req.url);
  const no = (u.searchParams.get("no") ?? "").trim();
  if (!/^[A-Z0-9]{5,30}$/.test(no) || !cekTokenApkt(u.searchParams.get("t"))) {
    return new NextResponse(null, { status: 403, headers: CORS });
  }
  const [{ data: k, error }, { data: g }] = await Promise.all([
    supabaseAdmin
      .from("apkt_koreksi")
      .select("no_laporan, waktu_lapor, tgl_penugasan, tgl_perjalanan, tgl_pengerjaan, tgl_nyala_sementara, tgl_nyala, tgl_selesai, rpt_asli, rpt_koreksi, rct_asli, rct_koreksi, apkt_masuk_at")
      .eq("no_laporan", no)
      .maybeSingle(),
    supabaseAdmin.from("apkt_gangguan").select("nama_pelapor").eq("no_laporan", no).maybeSingle(),
  ]);
  if (error) return NextResponse.json({ error: error.message }, { status: 500, headers: CORS });
  if (!k) return NextResponse.json({ ada: false }, { headers: CORS });
  return NextResponse.json(
    {
      ada: true,
      masuk: Boolean(k.apkt_masuk_at),
      item: {
        no: k.no_laporan,
        waktu_lapor: k.waktu_lapor,
        nama_pelapor: g?.nama_pelapor ?? null,
        penugasan: k.tgl_penugasan,
        perjalanan: k.tgl_perjalanan,
        pengerjaan: k.tgl_pengerjaan,
        nyala_sementara: k.tgl_nyala_sementara,
        nyala: k.tgl_nyala,
        selesai: k.tgl_selesai,
        rpt_asli: k.rpt_asli,
        rpt_koreksi: k.rpt_koreksi,
        rct_asli: k.rct_asli,
        rct_koreksi: k.rct_koreksi,
      },
    },
    { headers: CORS },
  );
}
