import { NextRequest, NextResponse } from "next/server";
import { buildBrief, sendWA, resolveGroupId, isSendEnabled } from "@/lib/morningBrief";

export const maxDuration = 60;

// Dipanggil oleh cron / trigger pipeline (auth CRON_SECRET).
export async function GET(request: NextRequest) {
  const auth = request.headers.get("authorization");
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // ?dry=1 → bangun & kembalikan teks tanpa kirim (preview/tes), lewati gate enabled/group
  const dry = new URL(request.url).searchParams.get("dry") === "1";

  try {
    if (dry) {
      const brief = await buildBrief();
      return NextResponse.json({ ok: true, dry: true, ...brief });
    }

    if (!(await isSendEnabled())) {
      return NextResponse.json({ ok: true, skipped: "disabled" });
    }
    const groupId = await resolveGroupId();
    if (!groupId) {
      return NextResponse.json({ error: "Group WA morning brief belum dikonfigurasi" }, { status: 500 });
    }

    const brief = await buildBrief();
    await sendWA(groupId, brief.text);
    return NextResponse.json({ ok: true, date: brief.date, riskTgl: brief.riskTgl, stale: brief.stale });
  } catch (e) {
    console.error("Morning brief send error:", e);
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
