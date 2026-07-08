import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { gatewayEnabled, gatewaySend } from "@/lib/wa/gateway";

const WA_BOT_URL = process.env.WA_BOT_URL ?? "http://127.0.0.1:3001";

// ── Fetch group ID dari DB ────────────────────────────────────────────────────

async function getGroupId(category: string, ulp: string): Promise<string> {
  const { data } = await supabaseAdmin
    .from("wa_settings")
    .select("group_id")
    .eq("category", category)
    .eq("ulp", ulp)
    .eq("enabled", true)
    .single();
  return data?.group_id ?? "";
}

// ── Format pesan ──────────────────────────────────────────────────────────────

function buildPohonMessage(data: Record<string, string>) {
  const tgl = new Date().toLocaleString("id-ID", {
    timeZone: "Asia/Makassar",
    dateStyle: "full",
    timeStyle: "short",
  });
  return [
    `🚨🌳 *TEMUAN POHON — RISIKO SANGAT TINGGI*`,
    ``,
    `📅 *Waktu:* ${tgl} WITA`,
    `🏢 *ULP:* ${data.ulp}`,
    `⚡ *Penyulang:* ${data.penyulang ?? "-"}`,
    `📍 *Lokasi:* ${data.lokasi ?? "-"}`,
    `🌳 *Temuan:* ${data.temuan ?? "-"}`,
    data.keterangan ? `📝 *Keterangan:* ${data.keterangan}` : null,
    `👤 *Inspektor:* ${data.nama_inspektor ?? "-"}`,
    ``,
    `⚠️ *Perlu tindakan segera oleh tim PERABASAN!*`,
    ``,
    `_SMART MATARAM — PLN UP3 Mataram_`,
  ].filter(Boolean).join("\n");
}

function buildJaringanMessage(data: Record<string, string>) {
  const tgl = new Date().toLocaleString("id-ID", {
    timeZone: "Asia/Makassar",
    dateStyle: "full",
    timeStyle: "short",
  });
  return [
    `🚨⚡ *TEMUAN JARINGAN — URGENT*`,
    ``,
    `📅 *Waktu:* ${tgl} WITA`,
    `🏢 *ULP:* ${data.ulp}`,
    `⚡ *Penyulang:* ${data.penyulang ?? "-"}`,
    `📍 *Lokasi:* ${data.lokasi ?? "-"}`,
    `🔧 *Temuan:* ${data.temuan ?? "-"}`,
    data.keterangan ? `📝 *Keterangan:* ${data.keterangan}` : null,
    `👤 *Inspektor:* ${data.nama_inspektor ?? "-"}`,
    ``,
    `⚠️ *Perlu tindakan segera oleh tim Jaringan!*`,
    ``,
    `_SMART MATARAM — PLN UP3 Mataram_`,
  ].filter(Boolean).join("\n");
}

// ── Helper kirim ke WA Bot dengan retry ──────────────────────────────────────

async function sendWAWithRetry(
  groupId: string,
  message: string,
  imageUrl?: string,
  maxRetries = 5,
  delayMs = 5000,
) {
  if (!groupId) return;
  // Jalur BARU: wa-gateway
  if (gatewayEnabled()) {
    for (let i = 0; i < maxRetries; i++) {
      try {
        await gatewaySend({ to: groupId, text: message, mediaUrl: imageUrl });
        console.log(`[wa-notify] Pesan terkirim via gateway (percobaan ${i + 1})`);
        return;
      } catch (e) {
        console.warn(`[wa-notify] gateway gagal (${(e as Error).message}), retry ${i + 1}/${maxRetries}...`);
      }
      await new Promise((r) => setTimeout(r, delayMs));
    }
    console.error(`[wa-notify] Gagal kirim via gateway setelah ${maxRetries}x`);
    return;
  }
  // Jalur LAMA: wa-bot
  for (let i = 0; i < maxRetries; i++) {
    try {
      const res = await fetch(`${WA_BOT_URL}/send`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ groupId, message, imageUrl: imageUrl ?? null }),
      });
      if (res.ok) {
        console.log(`[wa-notify] Pesan terkirim (percobaan ${i + 1})`);
        return;
      }
      console.warn(`[wa-notify] Bot response ${res.status}, retry ${i + 1}/${maxRetries}...`);
    } catch {
      console.warn(`[wa-notify] Bot tidak bisa dihubungi, retry ${i + 1}/${maxRetries}...`);
    }
    await new Promise((r) => setTimeout(r, delayMs));
  }
  console.error(`[wa-notify] Gagal kirim setelah ${maxRetries}x percobaan`);
}

// ── POST /api/wa-notify — dipanggil oleh Supabase Webhook ────────────────────

export async function POST(req: NextRequest) {
  const secret = req.headers.get("x-webhook-secret");
  if (secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const { type, table, record } = body as {
    type: string;
    table: string;
    record: Record<string, string>;
  };

  if (type !== "INSERT" && type !== "UPDATE") return NextResponse.json({ skipped: true });

  const ulp      = (record.ulp ?? "").toUpperCase();
  const imageUrl = record.foto_sebelum_url || record.foto_lokasi_url || undefined;

  let groupId: string;
  let message: string;

  if (table === "inspeksi_pohon" && record.tingkat_risiko === "Sangat Tinggi") {
    groupId = await getGroupId("perabasan", ulp);
    if (!groupId) {
      console.warn(`[wa-notify] Group PERABASAN untuk ULP ${ulp} belum dikonfigurasi`);
      return NextResponse.json({ skipped: true, reason: "group not configured" });
    }
    message = buildPohonMessage(record);
  } else if (table === "inspeksi" && record.category === "Urgent") {
    groupId = await getGroupId("jaringan", ulp);
    if (!groupId) {
      console.warn(`[wa-notify] Group Jaringan untuk ULP ${ulp} belum dikonfigurasi`);
      return NextResponse.json({ skipped: true, reason: "group not configured" });
    }
    message = buildJaringanMessage(record);
  } else {
    return NextResponse.json({ skipped: true });
  }

  sendWAWithRetry(groupId, message, imageUrl).catch((err) =>
    console.error("[wa-notify] Background send error:", err)
  );

  return NextResponse.json({ success: true });
}
