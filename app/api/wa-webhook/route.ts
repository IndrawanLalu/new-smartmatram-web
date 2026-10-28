import { NextRequest, NextResponse } from "next/server";
import { handleCommand } from "@/lib/wa/commands";
import { handlePenormalanReport } from "@/lib/wa/handleLaporan";
import { isPenormalanReport } from "@/lib/wa/parsePenormalan";
import { gatewayBotId, gatewaySend } from "@/lib/wa/gateway";
import { bacaPanggilan, bolehTanya } from "@/lib/wa/tanya/panggilan";
import { tanya } from "@/lib/wa/tanya/jawab";

/**
 * Webhook pesan masuk dari wa-gateway (Baileys) — menggantikan client.on("message")
 * di wa-bot lama. Tiga jalur:
 *   1. Command "#..."                → handleCommand (baca data)
 *   2. Laporan "INFO REALTIME PENORMALAN GANGGUAN" (auto-deteksi, tanpa "#") → handlePenormalanReport (tulis)
 *   3. Tanya Jawab (@smart di grup / semua chat pribadi) → lib/wa/tanya (rencana-tanya-jawab-wa.md)
 * Balasannya dikirim balik lewat gateway. Verifikasi asal via X-Webhook-Secret (= WA_WEBHOOK_SECRET).
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

  const isCommand = text.startsWith("#");
  const isLaporan = isPenormalanReport(text);
  const pertanyaan =
    isCommand || isLaporan ? null : bacaPanggilan({ from, isGroup, text, raw: payload.raw }, isGroup ? await gatewayBotId() : []);
  if (!isCommand && !isLaporan && pertanyaan === null) return NextResponse.json({ skipped: true });

  // Access control (sama seperti wa-bot lama) — berlaku untuk kedua jalur.
  const ALLOWED_GROUPS = new Set((process.env.WA_ALLOWED_GROUPS || "").split(",").filter(Boolean));
  const ALLOWED_DMS = new Set((process.env.WA_ALLOWED_DMS || "").split(",").filter(Boolean));
  const senderNum = from.replace(/@(c\.us|s\.whatsapp\.net)$/, "");
  if (isGroup && ALLOWED_GROUPS.size > 0 && !ALLOWED_GROUPS.has(from)) return NextResponse.json({ skipped: true });
  if (!isGroup && ALLOWED_DMS.size > 0 && !ALLOWED_DMS.has(senderNum)) return NextResponse.json({ skipped: true });
  const pengirim: string = payload.participant || from;
  if (pertanyaan !== null && !bolehTanya(pengirim)) return NextResponse.json({ skipped: true });

  // Proses & balas di background — respons cepat ke gateway.
  (async () => {
    try {
      const reply = isLaporan
        ? await handlePenormalanReport(text, { from, messageId: payload.messageId })
        : isCommand
          ? await handleCommand(text)
          : (await tanya(pertanyaan!, { dari: pengirim, grup: isGroup ? from : null, nama: payload.pushName ?? null }, true)).balasan;
      if (typeof reply === "string") await gatewaySend({ to: from, text: reply, replyTo: payload.messageId });
      else if (reply) await gatewaySend({ to: from, mediaUrl: reply.mediaUrl, caption: reply.caption, replyTo: payload.messageId });
    } catch (e) {
      console.error("[wa-webhook] error:", (e as Error).message);
      await gatewaySend({ to: from, text: "⚠️ Terjadi kesalahan saat memproses pesan. Coba lagi." }).catch(() => {});
    }
  })();

  return NextResponse.json({ ok: true });
}
