import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { FUNGSI } from "@/lib/wa/tanya/fungsi";
import { segarkanBahan } from "@/lib/wa/tanya/jawab";

/**
 * Bagian fungsi Tanya Jawab WA yang hidup di KODE (saringan, wajib, waktu
 * bawaan) — hanya dibaca halaman web. Sekaligus memastikan fungsi baru sudah
 * punya baris di tabel (benih) sebelum halaman membaca tabelnya.
 */
export async function GET() {
  if (!(await getCurrentUser())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    await segarkanBahan();
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
  return NextResponse.json(
    FUNGSI.map((f) => ({ kode: f.kode, saringan: f.saringan, wajib: f.wajib ?? [] })),
  );
}
