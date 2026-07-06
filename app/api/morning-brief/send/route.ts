import { NextRequest, NextResponse } from "next/server";
import { buildBrief, sendWA, resolveGroupTargets, isSendEnabled } from "@/lib/morningBrief";

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
    const targets = await resolveGroupTargets();
    if (targets.length === 0) {
      return NextResponse.json({ error: "Belum ada ULP morning brief yang aktif & terkonfigurasi" }, { status: 500 });
    }

    // Fan-out per ULP: tiap ULP dapat brief data-nya sendiri ke group masing-masing.
    const sent: { ulp: string; ok: boolean; stale?: boolean; error?: string }[] = [];
    for (const { ulp, groupId } of targets) {
      try {
        const brief = await buildBrief(ulp);
        await sendWA(groupId, brief.text);
        sent.push({ ulp, ok: true, stale: brief.stale });
      } catch (e) {
        sent.push({ ulp, ok: false, error: String(e) });
      }
    }
    return NextResponse.json({ ok: true, sent });
  } catch (e) {
    console.error("Morning brief send error:", e);
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
