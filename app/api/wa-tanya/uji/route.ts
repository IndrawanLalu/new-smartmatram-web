import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { segarkanBahan, tanya } from "@/lib/wa/tanya/jawab";

/**
 * Uji coba Tanya Jawab WA dari web: pengurai & fungsi yang SAMA dengan
 * webhook, tapi tidak dicatat ke riwayat dan tidak mengirim WA. Cache kata
 * dibuang dulu supaya perubahan yang baru disimpan langsung terpakai.
 * Pengirim = akun web, jadi balasan nomor atas pilihan (seri) juga bisa dicoba.
 */
export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (user.role !== "UP3" && user.role !== "admin") return NextResponse.json({ error: "Hanya UP3 dan admin" }, { status: 403 });

  const body = (await req.json().catch(() => ({}))) as { teks?: unknown; grup?: unknown };
  const teks = typeof body.teks === "string" ? body.teks.trim() : "";
  if (!teks) return NextResponse.json({ error: "Pertanyaan kosong" }, { status: 400 });
  const grup = typeof body.grup === "string" && body.grup ? body.grup : null;

  await segarkanBahan().catch(() => {});
  const h = await tanya(teks, { dari: `uji:${user.id}`, grup, nama: user.name ?? null }, false);
  return NextResponse.json(h);
}
