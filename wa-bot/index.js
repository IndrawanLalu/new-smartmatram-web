/**
 * SMART MATARAM — WhatsApp Bot Service
 * Jalankan via PM2: pm2 start wa-bot/index.js --name wa-bot
 *
 * Pertama kali: scan QR code yang muncul di terminal dengan HP.
 * Session tersimpan otomatis, tidak perlu scan lagi setelah itu.
 *
 * Endpoints:
 *   POST /send    — kirim pesan (text atau gambar+caption) ke group
 *   GET  /groups  — list semua group WA (untuk cari group ID)
 *   GET  /health  — cek status bot
 */

require("dotenv").config();
const { Client, LocalAuth, MessageMedia } = require("whatsapp-web.js");
const qrcode  = require("qrcode-terminal");
const express = require("express");
const { handleCommand }      = require("./commands");
const { startReminderCron }  = require("./reminder");

const PORT          = process.env.WA_BOT_PORT || 3001;
const ALLOWED_GROUPS = new Set((process.env.WA_ALLOWED_GROUPS || "").split(",").filter(Boolean));
const ALLOWED_DMS    = new Set((process.env.WA_ALLOWED_DMS    || "").split(",").filter(Boolean));

const app = express();
app.use(express.json({ limit: "10mb" }));

// ── WhatsApp Client ──────────────────────────────────────────────────────────

const client = new Client({
  authStrategy: new LocalAuth({ dataPath: "./wa-bot/session" }),
  puppeteer: {
    headless: true,
    executablePath: "/usr/bin/google-chrome-stable",
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
      "--disable-accelerated-2d-canvas",
      "--no-first-run",
      "--no-zygote",
      "--disable-gpu",
    ],
  },
});

let isReady = false;

client.on("qr", (qr) => {
  console.log("\n📱 Scan QR code berikut dengan WhatsApp di HP:\n");
  qrcode.generate(qr, { small: true });
  console.log("\nBuka WA → Linked Devices → Link a Device\n");
});

client.on("authenticated", () => {
  console.log("✅ WhatsApp authenticated!");
});

client.on("ready", () => {
  console.log("✅ WhatsApp Bot siap digunakan!");
  isReady = true;
  startReminderCron(client, () => isReady);
});

// ── Incoming message handler ─────────────────────────────────────────────────

client.on("message", async (msg) => {
  const text = (msg.body ?? "").trim();
  if (!text.startsWith("#")) return;

  // Access control — group atau DM
  const isGroup   = msg.from.endsWith("@g.us");
  const senderNum = msg.from.replace("@c.us", "");
  if (isGroup  && ALLOWED_GROUPS.size > 0 && !ALLOWED_GROUPS.has(msg.from)) return;
  if (!isGroup && ALLOWED_DMS.size    > 0 && !ALLOWED_DMS.has(senderNum))   return;

  console.log(`📨 Command dari ${msg.from}: ${text}`);

  try {
    const chat = await msg.getChat();
    await chat.sendStateTyping();
    const reply = await handleCommand(text);
    if (reply) await msg.reply(reply);
  } catch (err) {
    console.error("❌ Error handle command:", err.message);
    await msg.reply("⚠️ Terjadi kesalahan saat memproses perintah. Coba lagi.").catch(() => {});
  }
});

client.on("disconnected", (reason) => {
  console.log("❌ WhatsApp disconnect:", reason, "— exit untuk PM2 restart");
  isReady = false;
  process.exit(1);
});

client.on("auth_failure", (msg) => {
  console.error("❌ Auth gagal:", msg, "— exit untuk PM2 restart");
  process.exit(1);
});

// Tangkap Chrome crash (unhandledRejection) dan exit agar PM2 restart bersih
process.on("unhandledRejection", (reason) => {
  const msg = reason?.message ?? String(reason);
  // Error transient saat Chrome startup — abaikan, bukan fatal
  if (msg.includes("main frame too early") || msg.includes("Session closed") || msg.includes("Target closed")) {
    console.warn("⚠️ Transient Chrome error (diabaikan):", msg);
    return;
  }
  console.error("❌ Unhandled rejection:", msg);
  process.exit(1);
});

// ── Heartbeat — deteksi zombie state (Chrome hidup tapi WA mati) ──────────────
// whatsapp-web.js tidak emit "disconnected" saat Chrome/sesi jadi stale.
// Tanpa ini, bot stuck: isReady=true tapi sendMessage selalu gagal.
setInterval(async () => {
  if (!isReady) return;
  try {
    const state = await client.getState();
    if (state !== "CONNECTED") {
      console.error(`❌ Heartbeat: state = ${state} (bukan CONNECTED) — exit untuk PM2 restart`);
      process.exit(1);
    }
    console.log(`💓 Heartbeat OK — state: ${state}`);
  } catch (err) {
    console.error("❌ Heartbeat gagal:", err.message, "— exit untuk PM2 restart");
    process.exit(1);
  }
}, 5 * 60 * 1000); // setiap 5 menit

client.initialize();

// ── HTTP API ─────────────────────────────────────────────────────────────────

// Health check
app.get("/health", (req, res) => {
  res.json({ ready: isReady, timestamp: new Date().toISOString() });
});

// List semua group — jalankan sekali untuk cari group ID
app.get("/groups", async (req, res) => {
  if (!isReady) return res.status(503).json({ error: "Bot belum siap" });
  try {
    const chats = await client.getChats();
    const groups = chats
      .filter((c) => c.isGroup)
      .map((c) => ({ id: c.id._serialized, name: c.name, participants: c.participants?.length }))
      .sort((a, b) => a.name.localeCompare(b.name));
    res.json(groups);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Kirim pesan ke group
// Body: { groupId, message, imageUrl? }
app.post("/send", async (req, res) => {
  if (!isReady) return res.status(503).json({ error: "Bot belum siap" });

  const { groupId, message, imageUrl } = req.body;

  if (!groupId || !message) {
    return res.status(400).json({ error: "groupId dan message wajib diisi" });
  }

  const chatId = groupId.includes("@g.us") ? groupId : `${groupId}@g.us`;

  try {
    if (imageUrl) {
      // Kirim gambar + caption
      const media = await MessageMedia.fromUrl(imageUrl, { unsafeMime: true });
      await client.sendMessage(chatId, media, { caption: message });
    } else {
      // Kirim teks saja
      await client.sendMessage(chatId, message);
    }

    console.log(`✅ Pesan terkirim ke ${chatId}`);
    res.json({ success: true });
  } catch (err) {
    console.error("❌ Gagal kirim pesan:", err.message);
    // Jika error berasal dari koneksi Chrome/WA yang mati, exit agar PM2 restart
    const isConnErr = ["Session closed", "Target closed", "Protocol error", "net::ERR", "Navigation", "Execution context"].some(
      (s) => err.message.includes(s)
    );
    if (isConnErr) {
      res.status(503).json({ error: "Bot terputus, sedang restart..." });
      setTimeout(() => process.exit(1), 500); // beri waktu response terkirim dulu
      return;
    }
    res.status(500).json({ error: err.message });
  }
});

// Trigger reminder manual — untuk testing
app.post("/test-reminder", async (req, res) => {
  if (!isReady) return res.status(503).json({ error: "Bot belum siap" });
  const { sendUrgentReminder } = require("./reminder");
  const jenis = req.query.jenis ?? "all"; // "all" | "jaringan" | "pohon"
  await sendUrgentReminder(client, jenis);
  res.json({ ok: true, jenis });
});

// ── HTTP Server ───────────────────────────────────────────────────────────────

app.listen(PORT, "127.0.0.1", () => {
  console.log(`🤖 WA Bot service berjalan di port ${PORT}`);
});
