import { NextResponse } from "next/server";
import { createSupabaseServer } from "@/lib/supabase-server";
import {
  dedupNoLaporan,
  KOLOM_TAMPIL,
  simpanGangguan,
  toDbRow,
} from "@/lib/apktGangguan";

export const dynamic = "force-dynamic";

const HINT = "Pastikan scripts/apkt-gangguan-key-no-laporan.sql sudah dijalankan di Supabase.";

// GET /api/apkt/gangguan?from=YYYY-MM-DD&to=YYYY-MM-DD → data tersimpan di DB
export async function GET(req: Request) {
  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const from = searchParams.get("from");
  const to = searchParams.get("to");

  // Hanya kolom yang dipakai layar — lihat KOLOM_TAMPIL. Sebulan data turun
  // dari 1,84 MB ke ~1,0 MB tanpa mengubah apa pun yang terlihat.
  const kolom = KOLOM_TAMPIL.join(",");

  // Paginasi: PostgREST default maksimal 1000 baris/query → ambil semua per 1000.
  const PAGE = 1000;
  const all: Record<string, unknown>[] = [];
  for (let start = 0; ; start += PAGE) {
    let q = supabase
      .from("apkt_gangguan")
      .select(kolom)
      .order("tgl_lapor", { ascending: false })
      .order("no_laporan")
      .range(start, start + PAGE - 1);
    if (from) q = q.gte("tgl_lapor", from);
    if (to) q = q.lte("tgl_lapor", to);

    // Daftar kolomnya dirakit saat berjalan, jadi bentuk barisnya tidak bisa
    // disimpulkan dari tipe tabel — sebutkan sendiri, setelah semua filter.
    const { data, error } = await q.returns<Record<string, unknown>[]>();
    if (error) return NextResponse.json({ rows: [], error: error.message });
    const batch = data ?? [];
    all.push(...batch);
    if (batch.length < PAGE) break;
  }
  return NextResponse.json({ rows: all });
}

// POST /api/apkt/gangguan  body: { rows: GangguanRow[] }  → simpan (upsert) ke DB
export async function POST(req: Request) {
  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const rows = (body as { rows?: Record<string, unknown>[] }).rows;
  if (!Array.isArray(rows) || rows.length === 0) {
    return NextResponse.json({ error: "rows kosong / format salah" }, { status: 400 });
  }

  // Kunci baris = no_laporan. Field "id" dari APKT hanya nomor urut hasil
  // query (mulai dari 0 tiap tarikan), jadi tidak bisa dipakai sebagai kunci.
  const dbRows = dedupNoLaporan(rows.map(toDbRow));
  if (dbRows.length === 0) {
    return NextResponse.json(
      { error: "Tidak ada baris dengan 'no_laporan' yang valid" },
      { status: 400 },
    );
  }

  const { saved, error } = await simpanGangguan(supabase, dbRows);
  if (error) return NextResponse.json({ error, hint: HINT }, { status: 500 });

  return NextResponse.json({
    saved,
    received: rows.length,
    deduped: rows.length - dbRows.length,
  });
}
