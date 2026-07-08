import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { gatewayEnabled, gatewayListGroups } from "@/lib/wa/gateway";

export async function GET() {
  const user = await getCurrentUser();
  if (!user || (user.role !== "UP3" && user.role !== "admin")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Jalur BARU: wa-gateway (map {id,nama} → {id,name} agar UI lama tetap jalan)
  if (gatewayEnabled()) {
    try {
      const groups = await gatewayListGroups();
      return NextResponse.json(groups.map((g) => ({ id: g.id, name: g.nama })));
    } catch (e) {
      return NextResponse.json({ error: (e as Error).message }, { status: 503 });
    }
  }

  const botUrl = process.env.WA_BOT_URL ?? "http://localhost:3001";
  try {
    const res = await fetch(`${botUrl}/groups`, { signal: AbortSignal.timeout(10000) });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      return NextResponse.json({ error: err.error ?? "Bot error" }, { status: res.status });
    }
    const groups = await res.json();
    return NextResponse.json(groups);
  } catch {
    return NextResponse.json({ error: "Tidak bisa terhubung ke WA Bot" }, { status: 503 });
  }
}
