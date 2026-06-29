import { NextResponse } from "next/server";
import { createSupabaseServer } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";

interface GangguanRow {
  id?: number | string;
  [key: string]: unknown;
}

// ── Mapping ke kolom DB ─────────────────────────────────────────────────────────
const TEXT_FIELDS = [
  "no_laporan", "pembuat_laporan", "waktu_lapor", "waktu_response", "waktu_recovery",
  "status_akhir", "is_marking", "referensi_marking", "idpel_nometer", "nama_pelapor",
  "alamat_pelapor", "no_telp_pelapor", "keterangan_pelapor", "media", "nama_posko",
  "dispatch_oleh", "diselesaikan_oleh", "penyebab", "tindakan", "kode_gangguan",
  "jenis_gangguan", "ket_batal", "batal_by", "ket_marking",
] as const;

function parseNum(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function parseTglLapor(s: unknown): string | null {
  if (typeof s !== "string" || !s) return null;
  const [d, m, y] = s.split(" ")[0].split("/");
  if (y?.length === 4 && m && d) return `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
  return null;
}

function toDbRow(r: GangguanRow): Record<string, unknown> {
  const out: Record<string, unknown> = {
    apkt_id: String(r.id),
    ulp: "AMPENAN",
    tgl_lapor: parseTglLapor(r.waktu_lapor),
    durasi_dispatch_time: parseNum(r.durasi_dispatch_time),
    durasi_response_time: parseNum(r.durasi_response_time),
    durasi_recovery_time: parseNum(r.durasi_recovery_time),
    durasi_perjalanan_time: parseNum(r.durasi_perjalanan_time),
    jarak_closing: parseNum(r.jarak_closing),
  };
  for (const f of TEXT_FIELDS) {
    const v = r[f];
    out[f] = v === null || v === undefined || v === "" ? null : String(v);
  }
  return out;
}

// GET /api/apkt/gangguan?from=YYYY-MM-DD&to=YYYY-MM-DD → data tersimpan di DB
export async function GET(req: Request) {
  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const from = searchParams.get("from");
  const to = searchParams.get("to");

  // Paginasi: PostgREST default maksimal 1000 baris/query → ambil semua per 1000.
  const PAGE = 1000;
  const all: Record<string, unknown>[] = [];
  for (let start = 0; ; start += PAGE) {
    let q = supabase
      .from("apkt_gangguan")
      .select("*")
      .order("tgl_lapor", { ascending: false })
      .order("no_laporan")
      .range(start, start + PAGE - 1);
    if (from) q = q.gte("tgl_lapor", from);
    if (to) q = q.lte("tgl_lapor", to);

    const { data, error } = await q;
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
  const rows = (body as { rows?: GangguanRow[] }).rows;
  if (!Array.isArray(rows) || rows.length === 0) {
    return NextResponse.json({ error: "rows kosong / format salah" }, { status: 400 });
  }

  // Dedup by apkt_id (data APKT bisa punya id ganda) — keep terakhir.
  const dedup = new Map<string, Record<string, unknown>>();
  for (const r of rows) {
    if (r?.id == null) continue;
    dedup.set(String(r.id), toDbRow(r));
  }
  const dbRows = [...dedup.values()];
  if (dbRows.length === 0) {
    return NextResponse.json({ error: "Tidak ada baris dengan 'id' yang valid" }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("apkt_gangguan")
    .upsert(dbRows, { onConflict: "apkt_id", ignoreDuplicates: false })
    .select("apkt_id");

  if (error) {
    return NextResponse.json(
      { error: error.message, hint: "Pastikan scripts/apkt-gangguan-schema.sql sudah dijalankan di Supabase." },
      { status: 500 },
    );
  }
  return NextResponse.json({
    saved: data?.length ?? dbRows.length,
    received: rows.length,
    deduped: rows.length - dbRows.length,
  });
}
