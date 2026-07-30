import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } },
);

const WEBHOOK_URL = process.env.WO_SHEET_WEBHOOK_URL;
const SECRET = process.env.WO_SHEET_SECRET;

// Format tgl_realisasi (ISO "YYYY-MM-DD") → "D/MM/YYYY" (sesuai gaya Sheet).
function fmtSheetDate(iso: string | null): string {
  if (!iso) return "";
  const [y, m, d] = iso.slice(0, 10).split("-");
  return `${Number(d)}/${m}/${y}`;
}

async function verifyUser(req: NextRequest) {
  const token = req.headers.get("authorization")?.replace("Bearer ", "");
  if (!token) return null;
  const { data: { user } } = await supabaseAdmin.auth.getUser(token);
  return user ?? null;
}

// POST /api/wo-sheet-sync  { batchId }
export async function POST(req: NextRequest) {
  if (!(await verifyUser(req))) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!WEBHOOK_URL || !SECRET) {
    return NextResponse.json({ error: "Integrasi Sheet belum dikonfigurasi (WO_SHEET_WEBHOOK_URL / WO_SHEET_SECRET)" }, { status: 400 });
  }

  const { batchId } = await req.json();
  if (!batchId) return NextResponse.json({ error: "batchId wajib" }, { status: 400 });

  const { data: batch } = await supabaseAdmin
    .from("wo_batch")
    .select("sheet_id, sheet_tab, sheet_sync")
    .eq("id", batchId)
    .single();

  if (!batch?.sheet_id || !batch?.sheet_tab || !batch?.sheet_sync) {
    return NextResponse.json({ error: "WO ini tidak tertaut ke Google Sheet" }, { status: 400 });
  }

  const writeMap: Record<string, string> = batch.sheet_sync.write ?? {};

  // Baris yang sudah selesai (punya tgl_realisasi) + punya kunci Sheet
  const { data: items } = await supabaseAdmin
    .from("wo_item")
    .select("id, sheet_key, tgl_realisasi, verified_by, approved_by, status")
    .eq("batch_id", batchId)
    .eq("status", "Selesai")
    .not("sheet_key", "is", null);

  const rows = (items ?? [])
    .filter((it) => it.sheet_key)
    .map((it) => {
      const set: Record<string, string> = {};
      for (const [sheetCol, field] of Object.entries(writeMap)) {
        const raw = (it as Record<string, unknown>)[field];
        set[sheetCol] = field === "tgl_realisasi" ? fmtSheetDate(raw as string) : (raw as string) ?? "";
      }
      return { id: it.id, key: it.sheet_key, set };
    });

  if (rows.length === 0) return NextResponse.json({ ok: true, updated: 0 });

  let result: { ok?: boolean; updated?: number; matchedIds?: string[]; error?: string };
  try {
    const res = await fetch(WEBHOOK_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ secret: SECRET, spreadsheetId: batch.sheet_id, tab: batch.sheet_tab, rows }),
    });
    result = await res.json();
  } catch (e) {
    return NextResponse.json({ error: `Gagal menghubungi Sheet: ${e instanceof Error ? e.message : e}` }, { status: 502 });
  }

  if (!result.ok) return NextResponse.json({ error: result.error ?? "Sheet menolak" }, { status: 502 });

  // Tandai terkirim — HANYA baris yang benar-benar ketemu di Sheet.
  // (Skrip lama belum mengirim matchedIds; fallback ke semua baris terkirim.)
  const matchedIds = Array.isArray(result.matchedIds) ? result.matchedIds : rows.map((r) => r.id);
  const now = new Date().toISOString();

  if (matchedIds.length > 0) {
    for (let i = 0; i < matchedIds.length; i += 200) {
      await supabaseAdmin
        .from("wo_item")
        .update({ sheet_synced_at: now })
        .in("id", matchedIds.slice(i, i + 200));
    }
  }

  return NextResponse.json({
    ok: true,
    updated: result.updated ?? matchedIds.length,
    skipped: rows.length - matchedIds.length,
    syncedAt: now,
  });
}
