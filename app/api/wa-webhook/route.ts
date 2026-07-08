import { NextRequest, NextResponse } from "next/server";
import { handleCommand } from "@/lib/wa/commands";
import { gatewaySend } from "@/lib/wa/gateway";

/**
 * Webhook pesan masuk dari wa-gateway (Baileys) — menggantikan client.on("message")
 * di wa-bot lama. Command "#..." diproses handleCommand, balasannya dikirim balik
 * lewat gateway. Verifikasi asal via header X-Webhook-Secret (= WA_WEBHOOK_SECRET).
 */
export async function POST(req: NextRequest) {
  const secret = req.headers.get("x-webhook-secret");
  if (!process.env.WA_WEBHOOK_SECRET || secret !== process.env.WA_WEBHOOK_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const payload = await req.json().catch(() => null);
  if (!payload) return NextResponse.json({ error: "bad payload" }, { status: 400 });

  const from: string = payload.from || "";
  const isGroup: boolean = !!payload.isGroup;
  const text: string = (payload.text || "").trim();

  // Hanya proses command "#..."
  if (!text.startsWith("#")) return NextResponse.json({ skipped: true });

  // Access control (sama seperti wa-bot lama)
  const ALLOWED_GROUPS = new Set((process.env.WA_ALLOWED_GROUPS || "").split(",").filter(Boolean));
  const ALLOWED_DMS = new Set((process.env.WA_ALLOWED_DMS || "").split(",").filter(Boolean));
  const senderNum = from.replace(/@(c\.us|s\.whatsapp\.net)$/, "");
  if (isGroup && ALLOWED_GROUPS.size > 0 && !ALLOWED_GROUPS.has(from)) return NextResponse.json({ skipped: true });
  if (!isGroup && ALLOWED_DMS.size > 0 && !ALLOWED_DMS.has(senderNum)) return NextResponse.json({ skipped: true });

  // Proses & balas di background — respons cepat ke gateway.
  (async () => {
    try {
      const reply = await handleCommand(text);
      if (reply) await gatewaySend({ to: from, text: reply, replyTo: payload.messageId });
    } catch (e) {
      console.error("[wa-webhook] error:", (e as Error).message);
      await gatewaySend({ to: from, text: "⚠️ Terjadi kesalahan saat memproses perintah. Coba lagi." }).catch(() => {});
    }
  })();

  return NextResponse.json({ ok: true });
}
