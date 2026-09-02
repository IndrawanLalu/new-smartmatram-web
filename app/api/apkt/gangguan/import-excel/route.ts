/**
 * POST /api/apkt/gangguan/import-excel
 * body: FormData dengan satu atau beberapa field `file` (.xlsx dari APKT)
 *
 * Sengaja diproses di server: exceljs berukuran besar dan tidak perlu ikut ke
 * bundel klien, dan file dibaca sekali di tempat yang sama dengan penulisan DB.
 * Tiap file dilaporkan sendiri-sendiri supaya satu file yang salah tidak
 * membatalkan file lain yang sudah benar.
 */

import { NextResponse } from "next/server";
import { createSupabaseServer } from "@/lib/supabase-server";
import { simpanGangguan } from "@/lib/apktGangguan";
import { bacaExcelApkt } from "@/lib/apktExcel";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

/** Batas ukuran satu file — ekspor sebulan penuh pun jauh di bawah ini. */
const MAKS_BYTE = 15 * 1024 * 1024;

interface LaporanFile {
  nama: string;
  dibaca: number;
  disimpan: number;
  ganda: number;
  periode: string | null;
  dari: string | null;
  sampai: string | null;
  error: string | null;
}

export async function POST(req: Request) {
  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const form = await req.formData().catch(() => null);
  const files = form?.getAll("file").filter((f): f is File => f instanceof File) ?? [];
  if (files.length === 0) {
    return NextResponse.json({ error: "Tidak ada file yang dikirim" }, { status: 400 });
  }

  const hasil: LaporanFile[] = [];
  for (const file of files) {
    const kosong = {
      nama: file.name,
      dibaca: 0,
      disimpan: 0,
      ganda: 0,
      periode: null,
      dari: null,
      sampai: null,
    };

    if (file.size > MAKS_BYTE) {
      hasil.push({ ...kosong, error: "File lebih dari 15 MB." });
      continue;
    }

    const baca = await bacaExcelApkt(await file.arrayBuffer());
    if (baca.error) {
      hasil.push({ ...kosong, periode: baca.periode, error: baca.error });
      continue;
    }

    const { saved, error } = await simpanGangguan(supabase, baca.rows);
    hasil.push({
      nama: file.name,
      dibaca: baca.rows.length,
      disimpan: saved,
      ganda: baca.ganda,
      periode: baca.periode,
      dari: baca.dari,
      sampai: baca.sampai,
      error: error
        ? `${error} — pastikan scripts/apkt-gangguan-key-no-laporan.sql sudah dijalankan di Supabase.`
        : null,
    });
  }

  return NextResponse.json({
    files: hasil,
    disimpan: hasil.reduce((s, f) => s + f.disimpan, 0),
    gagal: hasil.filter((f) => f.error).length,
  });
}
