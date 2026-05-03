/**
 * SMART MATARAM — Reminder Inspeksi Urgent
 * Kirim pengingat ke group WA setiap 2 jam (07:00–17:00 WITA).
 * Setiap temuan dikirim satu per satu dengan foto + keterangan.
 */

const cron           = require("node-cron");
const { MessageMedia } = require("whatsapp-web.js");

const SMART_MATARAM_URL = process.env.SMART_MATARAM_URL || "http://localhost:3000";
const AGENT_SECRET      = process.env.AGENT_SECRET || "";
const GROUP_ID          = (process.env.WA_ALLOWED_GROUPS || "").split(",").filter(Boolean)[0];

const MAX_ITEMS = 5;
const SEND_DELAY_MS = 1500;

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtTanggal(s) {
  if (!s) return "—";
  const [y, m, d] = s.split("-");
  return `${d}-${m}-${y}`;
}

function mapsLink(koordinat) {
  if (!koordinat) return null;
  const parts = String(koordinat).split(",");
  if (parts.length < 2) return null;
  const lat = parseFloat(parts[0].trim());
  const lng = parseFloat(parts[1].trim());
  if (isNaN(lat) || isNaN(lng)) return null;
  return `https://maps.google.com/?q=${lat},${lng}`;
}

function delay(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function formatCaption(item, type) {
  const isJaringan = type === "jaringan";
  const emo        = isJaringan ? "⚡" : "🌳";
  const label      = isJaringan ? "URGENT" : "SANGAT TINGGI";
  const deskripsi  = isJaringan ? item.temuan : item.deskripsi;

  const lines = [
    `${emo} *${label}*`,
    `📍 ${item.lokasi || "—"} · ${item.penyulang || "—"}`,
  ];
  if (deskripsi)          lines.push(`📋 ${deskripsi}`);
  if (item.tgl_inspeksi)  lines.push(`📅 ${fmtTanggal(item.tgl_inspeksi)}`);
  if (item.nama_inspektor) lines.push(`👤 ${item.nama_inspektor}`);
  const maps = mapsLink(item.koordinat);
  if (maps) lines.push(`🗺️ ${maps}`);
  lines.push("", "_SMART MATARAM — PLN UP3 Mataram_");
  return lines.join("\n");
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

  const rawJaringan = jenis === "pohon"    ? [] : (data.jaringan ?? []);
  const rawPohon    = jenis === "jaringan" ? [] : (data.pohon    ?? []);

  // Gabung, tandai tipe, urutkan paling lama dulu, ambil max 5
  const items = [
    ...rawJaringan.map((i) => ({ ...i, _type: "jaringan" })),
    ...rawPohon.map((i)    => ({ ...i, _type: "pohon" })),
  ]
    .sort((a, b) => new Date(a.tgl_inspeksi) - new Date(b.tgl_inspeksi))
    .slice(0, MAX_ITEMS);

  if (items.length === 0) {
    console.log("💚 Reminder: tidak ada temuan urgent, skip kirim.");
    return;
  }

  const totalAll = rawJaringan.length + rawPohon.length;
  const chatId   = GROUP_ID.includes("@g.us") ? GROUP_ID : `${GROUP_ID}@g.us`;

  // Header
  try {
    const more = totalAll > MAX_ITEMS ? ` _(dan ${totalAll - MAX_ITEMS} lainnya)_` : "";
    await client.sendMessage(
      chatId,
      `🚨 *PENGINGAT TEMUAN URGENT*\nAda *${totalAll}* temuan belum diselesaikan${more}:`
    );
    await delay(SEND_DELAY_MS);
  } catch (err) {
    console.error("❌ Reminder: gagal kirim header:", err.message);
    return;
  }

  // Kirim satu per satu
  for (const item of items) {
    const caption  = formatCaption(item, item._type);
    const photoUrl = item.foto_sesudah_url || item.foto_sebelum_url;

    try {
      if (photoUrl) {
        const media = await MessageMedia.fromUrl(photoUrl, { unsafeMime: true });
        await client.sendMessage(chatId, media, { caption });
      } else {
        await client.sendMessage(chatId, caption);
      }
      console.log(`  ✅ Terkirim: ${item._type} — ${item.lokasi}`);
    } catch (err) {
      console.warn(`  ⚠️ Gagal kirim item ${item.lokasi}:`, err.message);
      // Tetap lanjut ke item berikutnya
      try { await client.sendMessage(chatId, caption); } catch (_) {}
    }

    await delay(SEND_DELAY_MS);
  }

  console.log(`🚨 Reminder selesai — ${items.length}/${totalAll} terkirim ke ${chatId}`);
}

// ── Cron scheduler ────────────────────────────────────────────────────────────

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
