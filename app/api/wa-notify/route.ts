import { NextRequest, NextResponse } from "next/server";

const WA_BOT_URL = process.env.WA_BOT_URL ?? "http://127.0.0.1:3001";

// ── Group ID mapping per ULP ──────────────────────────────────────────────────
const GROUP_PERABASAN: Record<string, string> = {
  AMPENAN:    process.env.WA_GROUP_PERABASAN_AMPENAN    ?? "",
  CAKRANEGARA: process.env.WA_GROUP_PERABASAN_CAKRANEGARA ?? "",
  GERUNG:     process.env.WA_GROUP_PERABASAN_GERUNG     ?? "",
  TANJUNG:    process.env.WA_GROUP_PERABASAN_TANJUNG    ?? "",
};

const GROUP_JARINGAN: Record<string, string> = {
  AMPENAN:    process.env.WA_GROUP_JARINGAN_AMPENAN    ?? "",
  CAKRANEGARA: process.env.WA_GROUP_JARINGAN_CAKRANEGARA ?? "",
  GERUNG:     process.env.WA_GROUP_JARINGAN_GERUNG     ?? "",
  TANJUNG:    process.env.WA_GROUP_JARINGAN_TANJUNG    ?? "",
};

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
  // Verifikasi secret dari Supabase webhook
  const secret = req.headers.get("x-webhook-secret");
  if (secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();

  // Supabase webhook payload: { type, table, record, old_record }
  const { type, table, record } = body as {
    type: string;
    table: string;
    record: Record<string, string>;
  };

  // Hanya proses INSERT dan UPDATE
  if (type !== "INSERT" && type !== "UPDATE") return NextResponse.json({ skipped: true });

  const ulp = (record.ulp ?? "").toUpperCase();
  const imageUrl = record.foto_sebelum_url || record.foto_lokasi_url || undefined;

  let groupId: string | undefined;
  let message: string | undefined;

  if (table === "inspeksi_pohon" && record.tingkat_risiko === "Sangat Tinggi") {
    groupId = GROUP_PERABASAN[ulp];
    if (!groupId) {
      console.warn(`[wa-notify] Group PERABASAN untuk ULP ${ulp} belum dikonfigurasi`);
      return NextResponse.json({ skipped: true, reason: "group not configured" });
    }
    message = buildPohonMessage(record);
  } else if (table === "inspeksi" && record.category === "Urgent") {
    groupId = GROUP_JARINGAN[ulp];
    if (!groupId) {
      console.warn(`[wa-notify] Group Jaringan untuk ULP ${ulp} belum dikonfigurasi`);
      return NextResponse.json({ skipped: true, reason: "group not configured" });
    }
    message = buildJaringanMessage(record);
  } else {
    return NextResponse.json({ skipped: true });
  }

  // Langsung return 200 ke Supabase, proses kirim WA di background dengan retry
  sendWAWithRetry(groupId, message, imageUrl).catch((err) =>
    console.error("[wa-notify] Background send error:", err)
  );

  return NextResponse.json({ success: true });
}
