import { NextResponse } from "next/server";
import { createSupabaseServer } from "@/lib/supabase-server";
import fs from "fs/promises";
import path from "path";

const DATA_DIR = path.join(process.cwd(), "data", "yantek");

async function ensureDir() {
  await fs.mkdir(DATA_DIR, { recursive: true });
}

async function checkAuth() {
  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  return user;
}

// ── GET ───────────────────────────────────────────────────────────────────────
// ?date=2026-05-29  → rows untuk tanggal itu
// ?all=true         → semua rows dari semua tanggal
// (kosong)          → daftar tanggal + jumlah baris

export async function GET(req: Request) {
  const user = await checkAuth();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  await ensureDir();
  const { searchParams } = new URL(req.url);
  const date = searchParams.get("date");
  const all  = searchParams.get("all");

  // Kembalikan rows 1 tanggal
  if (date) {
    const filePath = path.join(DATA_DIR, `${date}.json`);
    try {
      const raw = await fs.readFile(filePath, "utf-8");
      return NextResponse.json(JSON.parse(raw));
    } catch {
      return NextResponse.json({ label: date, rows: [], savedAt: null });
    }
  }

  // Kembalikan semua rows gabungan
  if (all === "true") {
    const files = (await fs.readdir(DATA_DIR)).filter(f => f.endsWith(".json")).sort();
    const rows: unknown[] = [];
    for (const f of files) {
      try {
        const raw = await fs.readFile(path.join(DATA_DIR, f), "utf-8");
        const parsed = JSON.parse(raw) as { rows?: unknown[] };
        rows.push(...(parsed.rows ?? []));
      } catch { /* skip corrupt file */ }
    }
    return NextResponse.json({ rows });
  }

  // Kembalikan daftar tanggal + row count
  let files: string[] = [];
  try {
    files = (await fs.readdir(DATA_DIR)).filter(f => f.endsWith(".json")).sort();
  } catch { /* dir belum ada */ }

  const summary = await Promise.all(
    files.map(async (f) => {
      const date = f.replace(".json", "");
      try {
        const raw  = await fs.readFile(path.join(DATA_DIR, f), "utf-8");
        const data = JSON.parse(raw) as { label?: string; rows?: unknown[]; savedAt?: number };
        return { date, label: data.label ?? date, count: data.rows?.length ?? 0, savedAt: data.savedAt ?? null };
      } catch {
        return { date, label: date, count: 0, savedAt: null };
      }
    }),
  );

  return NextResponse.json(summary);
}

// ── POST ──────────────────────────────────────────────────────────────────────
// Body: { date, label, rows }
// Tulis / timpa file data/yantek/{date}.json

export async function POST(req: Request) {
  const user = await checkAuth();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  await ensureDir();

  const body = await req.json() as { date: string; label: string; rows: unknown[] };
  const { date, label, rows } = body;

  if (!date || !Array.isArray(rows)) {
    return NextResponse.json({ error: "date dan rows wajib diisi" }, { status: 400 });
  }

  const filePath = path.join(DATA_DIR, `${date}.json`);
  await fs.writeFile(filePath, JSON.stringify({ label, rows, savedAt: Date.now() }), "utf-8");

  return NextResponse.json({ ok: true, date, count: rows.length });
}

// ── DELETE ────────────────────────────────────────────────────────────────────
// ?date=2026-05-29  → hapus file tanggal itu

export async function DELETE(req: Request) {
  const user = await checkAuth();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const date = searchParams.get("date");
  if (!date) return NextResponse.json({ error: "date wajib diisi" }, { status: 400 });

  const filePath = path.join(DATA_DIR, `${date}.json`);
  try {
    await fs.unlink(filePath);
  } catch { /* file tidak ada, ok */ }

  return NextResponse.json({ ok: true });
}
