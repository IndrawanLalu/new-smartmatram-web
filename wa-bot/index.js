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

const { Client, LocalAuth, MessageMedia } = require("whatsapp-web.js");
const qrcode = require("qrcode-terminal");
const express = require("express");

const PORT = process.env.WA_BOT_PORT || 3001;
const app = express();
app.use(express.json({ limit: "10mb" }));

// ── WhatsApp Client ──────────────────────────────────────────────────────────

const client = new Client({
  authStrategy: new LocalAuth({ dataPath: "./wa-bot/session" }),
  puppeteer: {
    headless: true,
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
      "--disable-accelerated-2d-canvas",
      "--no-first-run",
      "--no-zygote",
      "--single-process",
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
  console.error("❌ Unhandled rejection:", reason?.message ?? reason);
  process.exit(1);
});

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
    res.status(500).json({ error: err.message });
  }
});

app.listen(PORT, "127.0.0.1", () => {
  console.log(`🤖 WA Bot service berjalan di port ${PORT}`);
});
