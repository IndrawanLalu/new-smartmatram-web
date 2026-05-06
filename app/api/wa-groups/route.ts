import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";

export async function GET() {
  const user = await getCurrentUser();
  if (!user || (user.role !== "UP3" && user.role !== "admin")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
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
