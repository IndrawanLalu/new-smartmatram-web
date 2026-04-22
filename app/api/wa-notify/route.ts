import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServer } from "@/lib/supabase-server";

const WA_BOT_URL = process.env.WA_BOT_URL ?? "http://127.0.0.1:3001";
const WA_GROUP_ID = process.env.WA_GROUP_ID ?? "";

// ── Format pesan WA ───────────────────────────────────────────────────────────

function buildMessage(data: {
  temuan: string;
  ulp: string;
  penyulang: string;
  lokasi: string;
  urgency: string;
  petugasNama: string;
  kategori?: string;
  keterangan?: string;
}) {
  const tgl = new Date().toLocaleString("id-ID", {
    timeZone: "Asia/Makassar",
    dateStyle: "full",
    timeStyle: "short",
  });

  const urgencyIcon = data.urgency === "Sangat Urgent" ? "🚨🚨" : "⚠️";

  return [
    `${urgencyIcon} *TEMUAN ${data.urgency.toUpperCase()} — INSPEKSI POHON*`,
    ``,
    `📅 *Waktu:* ${tgl} WITA`,
    `🏢 *ULP:* ${data.ulp}`,
    `⚡ *Penyulang:* ${data.penyulang}`,
    `📍 *Lokasi:* ${data.lokasi}`,
    data.kategori ? `🏷️ *Kategori:* ${data.kategori}` : null,
    `🌳 *Temuan:* ${data.temuan}`,
    data.keterangan ? `📝 *Keterangan:* ${data.keterangan}` : null,
    `👤 *Inspektor:* ${data.petugasNama}`,
    ``,
    `⚡ *Perlu tindakan segera oleh tim PERABASAN!*`,
    ``,
    `_SMART MATARAM — PLN UP3 Mataram_`,
  ]
    .filter(Boolean)
    .join("\n");
}

// ── POST /api/wa-notify ───────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  // Pastikan user sudah login
  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  if (!WA_GROUP_ID) {
    return NextResponse.json({ error: "WA_GROUP_ID belum dikonfigurasi di .env" }, { status: 500 });
  }

  const body = await req.json() as {
    temuan: string;
    ulp: string;
    penyulang: string;
    lokasi: string;
    urgency: string;
    petugasNama: string;
    imageUrl?: string;
    kategori?: string;
    keterangan?: string;
  };

  const message = buildMessage(body);

  try {
    const res = await fetch(`${WA_BOT_URL}/send`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        groupId: WA_GROUP_ID,
        message,
        imageUrl: body.imageUrl ?? null,
      }),
    });

    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error ?? "WA bot error");
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    console.error("[wa-notify] Error:", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
