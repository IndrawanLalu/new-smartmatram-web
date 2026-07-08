import { NextRequest, NextResponse } from "next/server";
import type { RealisasiTimRow } from "@/app/admin/morning-brief/_hooks/useMorningBrief";
import { gatewayEnabled, gatewaySend } from "@/lib/wa/gateway";

const WA_BOT_URL = process.env.WA_BOT_URL ?? "http://127.0.0.1:3001";

const BULAN_NAMA: Record<number, string> = {
  0: "Januari", 1: "Februari", 2: "Maret", 3: "April",
  4: "Mei", 5: "Juni", 6: "Juli", 7: "Agustus",
  8: "September", 9: "Oktober", 10: "November", 11: "Desember",
};
const HARI: Record<number, string> = {
  0: "Minggu", 1: "Senin", 2: "Selasa", 3: "Rabu",
  4: "Kamis", 5: "Jumat", 6: "Sabtu",
};

function buildMessage(items: RealisasiTimRow[], dateLabel: string): string {
  const totalWO = items.reduce((s, r) => s + r.wo, 0);
  const totalReal = items.reduce((s, r) => s + r.realisasi, 0);
  const totalPct = totalWO > 0 ? Math.round((totalReal / totalWO) * 100) : 0;

  const lines = [
    `📋 *REALISASI PROBIS HARIAN*`,
    `📅 ${dateLabel}`,
    ``,
  ];

  for (const { tim, wo, realisasi } of items) {
    const pct = wo > 0 ? Math.round((realisasi / wo) * 100) : 0;
    const icon = wo === 0 ? "—" : realisasi >= wo ? "✅" : realisasi > 0 ? "⚠️" : "❌";
    lines.push(`${icon} *${tim}*  WO: ${wo} | Real: ${realisasi}${wo > 0 ? ` (${pct}%)` : ""}`);
  }

  lines.push(``);
  lines.push(`📊 *Total: WO ${totalWO} | Realisasi ${totalReal} (${totalPct}%)*`);
  lines.push(``);
  lines.push(`_SMART MATARAM — PLN UP3 Mataram_`);
  return lines.join("\n");
}

export async function POST(req: NextRequest) {
  const { items, groupId } = await req.json() as {
    items: RealisasiTimRow[];
    groupId: string;
  };

  if (!groupId || !items?.length) {
    return NextResponse.json({ error: "groupId dan items wajib diisi" }, { status: 400 });
  }

  const now = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Makassar" }));
  // Ambil kemarin karena morning brief = data kemarin
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  const dateLabel = `${HARI[yesterday.getDay()]}, ${yesterday.getDate()} ${BULAN_NAMA[yesterday.getMonth()]} ${yesterday.getFullYear()}`;

  const message = buildMessage(items, dateLabel);

  // Jalur BARU: wa-gateway
  if (gatewayEnabled()) {
    try {
      await gatewaySend({ to: groupId, text: message });
      return NextResponse.json({ success: true });
    } catch (e) {
      return NextResponse.json({ error: `Gateway error: ${(e as Error).message}` }, { status: 502 });
    }
  }

  // Jalur LAMA: wa-bot
  try {
    const res = await fetch(`${WA_BOT_URL}/send`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ groupId, message }),
    });
    if (!res.ok) {
      const body = await res.text();
      return NextResponse.json({ error: `Bot error: ${body}` }, { status: 502 });
    }
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: "WA Bot tidak bisa dihubungi" }, { status: 503 });
  }
}
