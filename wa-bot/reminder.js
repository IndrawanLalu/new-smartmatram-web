/**
 * SMART MATARAM — Reminder Inspeksi Urgent
 * Kirim pengingat ke group WA setiap 2 jam (07:00–17:00 WITA).
 * Group ID dibaca dari DB via /api/wa-settings — bisa diatur via frontend admin.
 */

const cron             = require("node-cron");
const { MessageMedia } = require("whatsapp-web.js");

const SMART_MATARAM_URL = process.env.SMART_MATARAM_URL || "http://localhost:3000";
const AGENT_SECRET      = process.env.AGENT_SECRET || "";

const MAX_ITEMS     = 5;
const SEND_DELAY_MS = 1500;
const DARI_TANGGAL  = "2026-03-01"; // data sebelum ini diabaikan

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
  if (deskripsi)           lines.push(`📋 ${deskripsi}`);
  if (item.tgl_inspeksi)   lines.push(`📅 ${fmtTanggal(item.tgl_inspeksi)}`);
  if (item.nama_inspektor) lines.push(`👤 ${item.nama_inspektor}`);
  const maps = mapsLink(item.koordinat);
  if (maps) lines.push(`🗺️ ${maps}`);
  lines.push("", "_SMART MATARAM — PLN UP3 Mataram_");
  return lines.join("\n");
}

// ── Fetch group settings dari DB ──────────────────────────────────────────────

async function fetchWaSettings(category) {
  try {
    const url = `${SMART_MATARAM_URL}/api/wa-settings`;
    const res  = await fetch(url, { headers: { "x-agent-secret": AGENT_SECRET } });
    if (!res.ok) throw new Error(`API error ${res.status}`);
    const all = await res.json();
    return all.filter((s) => s.category === category && s.enabled && s.group_id);
  } catch (err) {
    console.error("❌ Reminder: gagal fetch wa-settings:", err.message);
    return [];
  }
}

// ── Fetch inspeksi urgent dari DB ─────────────────────────────────────────────

async function fetchUrgent() {
  try {
    const url = `${SMART_MATARAM_URL}/api/agent?type=inspeksi_urgent&dari_tanggal=${DARI_TANGGAL}`;
    const res  = await fetch(url, { headers: { "x-agent-secret": AGENT_SECRET } });
    if (!res.ok) throw new Error(`API error ${res.status}`);
    return await res.json();
  } catch (err) {
    console.error("❌ Reminder: gagal fetch inspeksi_urgent:", err.message);
    return null;
  }
}

// ── Kirim per ULP ─────────────────────────────────────────────────────────────

async function sendToGroup(client, chatId, items, totalAll) {
  const more = totalAll > MAX_ITEMS ? ` _(dan ${totalAll - MAX_ITEMS} lainnya)_` : "";
  try {
    await client.sendMessage(
      chatId,
      `🚨 *PENGINGAT TEMUAN URGENT*\nAda *${totalAll}* temuan belum diselesaikan${more}:`
    );
    await delay(SEND_DELAY_MS);
  } catch (err) {
    console.error("❌ Reminder: gagal kirim header:", err.message);
    return;
  }

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
      console.warn(`  ⚠️ Foto gagal, kirim teks: ${item.lokasi}:`, err.message);
      try { await client.sendMessage(chatId, caption); } catch (_) {}
    }
    await delay(SEND_DELAY_MS);
  }
}

// ── Main send ─────────────────────────────────────────────────────────────────

async function sendUrgentReminder(client, jenis = "all") {
  const [settingsJaringan, settingsPohon, urgentData] = await Promise.all([
    fetchWaSettings("reminder_jaringan"),
    fetchWaSettings("reminder_pohon"),
    fetchUrgent(),
  ]);

  if (!urgentData) return;

  const rawJaringan = jenis === "pohon"    ? [] : (urgentData.jaringan ?? []);
  const rawPohon    = jenis === "jaringan" ? [] : (urgentData.pohon    ?? []);

  let anySent = false;

  // ── Reminder Jaringan ─────────────────────────────────────────────────────
  for (const setting of settingsJaringan) {
    const ulp    = (setting.ulp ?? "").toUpperCase();
    const chatId = setting.group_id.includes("@g.us") ? setting.group_id : `${setting.group_id}@g.us`;
    const data   = ulp ? rawJaringan.filter((i) => (i.ulp ?? "").toUpperCase() === ulp) : rawJaringan;

    if (data.length === 0) { console.log(`💚 Reminder Jaringan ${ulp}: tidak ada temuan, skip.`); continue; }

    const items = data
      .map((i) => ({ ...i, _type: "jaringan" }))
      .sort((a, b) => new Date(a.tgl_inspeksi) - new Date(b.tgl_inspeksi))
      .slice(0, MAX_ITEMS);

    console.log(`🚨 Reminder Jaringan ${ulp} → ${chatId} (${data.length} temuan)`);
    await sendToGroup(client, chatId, items, data.length);
    await delay(SEND_DELAY_MS * 2);
    anySent = true;
  }

  // ── Reminder Pohon ────────────────────────────────────────────────────────
  for (const setting of settingsPohon) {
    const ulp    = (setting.ulp ?? "").toUpperCase();
    const chatId = setting.group_id.includes("@g.us") ? setting.group_id : `${setting.group_id}@g.us`;
    const data   = ulp ? rawPohon.filter((i) => (i.ulp ?? "").toUpperCase() === ulp) : rawPohon;

    if (data.length === 0) { console.log(`💚 Reminder Pohon ${ulp}: tidak ada temuan, skip.`); continue; }

    const items = data
      .map((i) => ({ ...i, _type: "pohon" }))
      .sort((a, b) => new Date(a.tgl_inspeksi) - new Date(b.tgl_inspeksi))
      .slice(0, MAX_ITEMS);

    console.log(`🚨 Reminder Pohon ${ulp} → ${chatId} (${data.length} temuan)`);
    await sendToGroup(client, chatId, items, data.length);
    await delay(SEND_DELAY_MS * 2);
    anySent = true;
  }

  if (!anySent) console.warn("⚠️ Reminder: tidak ada group reminder aktif di DB.");
}

// ── Cron scheduler ────────────────────────────────────────────────────────────

function startReminderCron(client, getIsReady) {
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
