/**
 * SMART MATARAM — Reminder Inspeksi Urgent
 * Kirim pengingat ke group WA setiap 2 jam (07:00–17:00 WITA)
 * untuk temuan urgent (jaringan) dan sangat tinggi (pohon) yang belum selesai.
 */

const cron     = require("node-cron");
const { MessageMedia } = require("whatsapp-web.js");

const SMART_MATARAM_URL = process.env.SMART_MATARAM_URL || "http://localhost:3000";
const AGENT_SECRET      = process.env.AGENT_SECRET || "";
const GROUP_ID          = (process.env.WA_ALLOWED_GROUPS || "").split(",").filter(Boolean)[0];

const MAX_PHOTOS = 3;

// ── Formatter ─────────────────────────────────────────────────────────────────

function fmtTanggal(s) {
  if (!s) return "—";
  const [y, m, d] = s.split("-");
  return `${d}-${m}-${y}`;
}

function buildReminderText(jaringan, pohon) {
  const total = (jaringan?.length ?? 0) + (pohon?.length ?? 0);
  const lines = [
    `🚨 *PENGINGAT TEMUAN URGENT*`,
    `Ada *${total}* temuan yang belum diselesaikan:`,
    "",
  ];

  if (jaringan?.length > 0) {
    lines.push(`⚡ *Jaringan — Urgent* (${jaringan.length}):`);
    jaringan.slice(0, 5).forEach((item, i) => {
      lines.push(`${i + 1}. ${item.lokasi || "—"} · ${item.penyulang || "—"}`);
      if (item.temuan) lines.push(`    📋 ${item.temuan}`);
      if (item.tgl_inspeksi) lines.push(`    📅 ${fmtTanggal(item.tgl_inspeksi)}`);
    });
    if (jaringan.length > 5) lines.push(`_...dan ${jaringan.length - 5} lainnya_`);
    lines.push("");
  }

  if (pohon?.length > 0) {
    lines.push(`🌳 *Pohon — Sangat Tinggi* (${pohon.length}):`);
    pohon.slice(0, 5).forEach((item, i) => {
      lines.push(`${i + 1}. ${item.lokasi || "—"} · ${item.penyulang || "—"}`);
      if (item.deskripsi) lines.push(`    📋 ${item.deskripsi}`);
      if (item.tgl_inspeksi) lines.push(`    📅 ${fmtTanggal(item.tgl_inspeksi)}`);
    });
    if (pohon.length > 5) lines.push(`_...dan ${pohon.length - 5} lainnya_`);
  }

  lines.push("", "⚠️ _Mohon segera ditindaklanjuti!_");
  lines.push("_SMART MATARAM — PLN UP3 Mataram_");
  return lines.join("\n");
}

// ── Photo collector ───────────────────────────────────────────────────────────

function collectPhotoUrls(jaringan, pohon) {
  const urls = [];
  for (const item of [...(jaringan ?? []), ...(pohon ?? [])]) {
    const url = item.foto_sesudah_url || item.foto_sebelum_url;
    if (url && urls.length < MAX_PHOTOS) urls.push(url);
    if (urls.length >= MAX_PHOTOS) break;
  }
  return urls;
}

// ── Main send ─────────────────────────────────────────────────────────────────

async function sendUrgentReminder(client, jenis = "all") {
  if (!GROUP_ID) {
    console.warn("⚠️ Reminder: WA_ALLOWED_GROUPS tidak diset, skip.");
    return;
  }

  let data;
  try {
    const url = `${SMART_MATARAM_URL}/api/agent?type=inspeksi_urgent`;
    const res  = await fetch(url, { headers: { "x-agent-secret": AGENT_SECRET } });
    if (!res.ok) throw new Error(`API error ${res.status}`);
    data = await res.json();
  } catch (err) {
    console.error("❌ Reminder: gagal fetch inspeksi_urgent:", err.message);
    return;
  }

  const jaringan = jenis === "pohon"    ? [] : data.jaringan;
  const pohon    = jenis === "jaringan" ? [] : data.pohon;
  const total = (jaringan?.length ?? 0) + (pohon?.length ?? 0);

  if (total === 0) {
    console.log("💚 Reminder: tidak ada temuan urgent, skip kirim.");
    return;
  }

  const chatId = GROUP_ID.includes("@g.us") ? GROUP_ID : `${GROUP_ID}@g.us`;
  const text   = buildReminderText(jaringan, pohon);
  const photos = collectPhotoUrls(jaringan, pohon);

  try {
    if (photos.length > 0) {
      // Kirim foto pertama + caption teks
      const media = await MessageMedia.fromUrl(photos[0], { unsafeMime: true });
      await client.sendMessage(chatId, media, { caption: text });

      // Foto tambahan tanpa caption
      for (let i = 1; i < photos.length; i++) {
        try {
          const m = await MessageMedia.fromUrl(photos[i], { unsafeMime: true });
          await client.sendMessage(chatId, m);
        } catch (e) {
          console.warn(`⚠️ Reminder: gagal kirim foto ${i + 1}:`, e.message);
        }
      }
    } else {
      await client.sendMessage(chatId, text);
    }
    console.log(`🚨 Reminder terkirim ke ${chatId} — ${total} temuan urgent.`);
  } catch (err) {
    console.error("❌ Reminder: gagal kirim pesan:", err.message);
  }
}

// ── Cron scheduler ─────────────────────────────────────────────────────────────

function startReminderCron(client, getIsReady) {
  // Setiap 2 jam: 07, 09, 11, 13, 15, 17 WITA
  cron.schedule(
    "0 7,9,11,13,15,17 * * *",
    async () => {
      if (!getIsReady()) {
        console.log("⏭️ Reminder: bot belum siap, skip.");
        return;
      }
      console.log("⏰ Reminder cron triggered.");
      await sendUrgentReminder(client);
    },
    { timezone: "Asia/Makassar" }
  );

  console.log("⏰ Reminder cron aktif — jam 07, 09, 11, 13, 15, 17 WITA.");
}

module.exports = { startReminderCron, sendUrgentReminder };
