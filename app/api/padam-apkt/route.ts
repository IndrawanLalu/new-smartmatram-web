import { NextResponse } from "next/server";
import { createSupabaseServer } from "@/lib/supabase-server";

interface PadamApktRow {
  no_laporan: string;
  ulp: string | null;
  penyulang: string | null;
  lokasi_titik_gangguan: string | null;
  tgl_padam: string | null;
  jam_padam: string | null;
  tgl_nyala_sementara: string | null;
  jam_nyala_sementara: string | null;
  tgl_nyala: string | null;
  jam_nyala: string | null;
  fasilitas: string | null;
  sub_fasilitas: string | null;
  equipment: string | null;
  event_damage: string | null;
  cause: string | null;
  group_cause: string | null;
  weather: string | null;
  jml_pelanggan_padam: number | null;
  lama_padam_jam: number | null;
  jam_x_pelanggan_padam: number | null;
  penyebab_padam: string | null;
  ens: number | null;
  ampere: string | null;
  keterangan: string | null;
  lokasi_gangguan: string | null;
  section_gangguan: string | null;
  pembatas_section: string | null;
  no_tiang_gangguan: string | null;
  rele_proteksi: string | null;
  besar_arus_ampere: string | null;
}

async function getAuth() {
  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  return { supabase, user };
}

// GET /api/padam-apkt?year=2026&month=06        → rows
// GET /api/padam-apkt?ulp-list=true             → distinct ULP values
export async function GET(req: Request) {
  const { supabase, user } = await getAuth();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const year    = searchParams.get("year");
  const month   = searchParams.get("month");
  const ulp     = searchParams.get("ulp");
  const ulpList = searchParams.get("ulp-list");

  if (ulpList === "true") {
    const { data, error } = await supabase
      .from("padam_apkt")
      .select("ulp")
      .not("ulp", "is", null)
      .order("ulp");
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    const distinct = [...new Set((data ?? []).map((r) => r.ulp as string))].sort();
    return NextResponse.json(distinct);
  }

  let query = supabase
    .from("padam_apkt")
    .select("*")
    .order("tgl_padam", { ascending: false })
    .order("no_laporan");

  if (year && month) {
    const from = `${year}-${month}-01`;
    const next = month === "12"
      ? `${+year + 1}-01-01`
      : `${year}-${String(+month + 1).padStart(2, "0")}-01`;
    query = query.gte("tgl_padam", from).lt("tgl_padam", next);
  } else if (year) {
    query = query.gte("tgl_padam", `${year}-01-01`).lte("tgl_padam", `${year}-12-31`);
  }

  if (ulp) query = query.eq("ulp", ulp);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data ?? []);
}

// POST /api/padam-apkt  body: { rows: PadamApktRow[] }
export async function POST(req: Request) {
  const { supabase, user } = await getAuth();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json() as { rows: PadamApktRow[] };
  if (!Array.isArray(body.rows) || body.rows.length === 0)
    return NextResponse.json({ error: "rows wajib diisi" }, { status: 400 });

  // Dedup dalam batch — keep last occurrence per unique key
  const deduped = new Map<string, PadamApktRow>();
  for (const row of body.rows) {
    const key = `${row.no_laporan}||${row.ulp ?? ""}||${row.penyulang ?? ""}||${row.tgl_padam ?? ""}`;
    deduped.set(key, row);
  }
  const rows = [...deduped.values()];

  const { data, error } = await supabase
    .from("padam_apkt")
    .upsert(rows, {
      onConflict: "no_laporan,ulp,penyulang,tgl_padam",
      ignoreDuplicates: false,
    })
    .select("id");

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, count: data?.length ?? rows.length, dedupCount: body.rows.length - rows.length });
}

// DELETE /api/padam-apkt?year=2026&month=06  → hapus semua data bulan itu
export async function DELETE(req: Request) {
  const { supabase, user } = await getAuth();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const year  = searchParams.get("year");
  const month = searchParams.get("month");
  if (!year || !month)
    return NextResponse.json({ error: "year dan month wajib diisi" }, { status: 400 });

  const from = `${year}-${month}-01`;
  const next = month === "12"
    ? `${+year + 1}-01-01`
    : `${year}-${String(+month + 1).padStart(2, "0")}-01`;

  const { error } = await supabase
    .from("padam_apkt")
    .delete()
    .gte("tgl_padam", from)
    .lt("tgl_padam", next);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

// PATCH /api/padam-apkt  body: { id, status_gangguan, analisis_keterangan, ref_gangguan }
export async function PATCH(req: Request) {
  const { supabase, user } = await getAuth();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json() as {
    id: string;
    status_gangguan: string | null;
    analisis_keterangan: string | null;
    ref_gangguan: unknown | null;
  };

  const { id, status_gangguan, analisis_keterangan, ref_gangguan } = body;
  if (!id) return NextResponse.json({ error: "id wajib diisi" }, { status: 400 });

  const { error } = await supabase
    .from("padam_apkt")
    .update({ status_gangguan, analisis_keterangan, ref_gangguan })
    .eq("id", id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
