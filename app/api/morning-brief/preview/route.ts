import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { buildBrief, sendWA, resolveGroupId } from "@/lib/morningBrief";

export const maxDuration = 60;

// GET — preview teks brief (auth sesi, read-only). Untuk panel di halaman.
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const brief = await buildBrief();
    return NextResponse.json({ ok: true, ...brief });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}

// POST — kirim brief ke grup WA sekarang (admin / UP3 only).
export async function POST() {
  const user = await getCurrentUser();
  if (!user || (user.role !== "UP3" && user.role !== "admin")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const groupId = await resolveGroupId();
    if (!groupId) {
      return NextResponse.json({ error: "Grup WA morning brief belum dikonfigurasi" }, { status: 400 });
    }
    const brief = await buildBrief();
    await sendWA(groupId, brief.text);
    return NextResponse.json({ ok: true, date: brief.date, riskTgl: brief.riskTgl, stale: brief.stale });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
