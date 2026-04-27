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
const cron = require("node-cron");

const PORT = process.env.WA_BOT_PORT || 3001;
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

// ── Realisasi Harian — Cron jam 18.00 WITA ───────────────────────────────────

const SHEETS_ID = "153-gxDh8XrlT1AbNWb5jws0MVc-qD9IQNxxJLRqlKJg";
const SHEETS_KEY = "AIzaSyAZ1aJVdOVCv4Of60ZwPRsabQsgLaBxzQU";
const GROUP_REALISASI = "120363399387396042@g.us";

const BULAN_ID = [
  "januari","februari","maret","april","mei","juni",
  "juli","agustus","september","oktober","november","desember",
];

function parseTanggal(str) {
  if (!str) return null;
  str = str.trim();
  // Format: "01 April 2026"
  const parts = str.split(" ");
  if (parts.length === 3) {
    const m = BULAN_ID.indexOf(parts[1].toLowerCase());
    if (m >= 0) return new Date(parseInt(parts[2]), m, parseInt(parts[0]));
  }
  // Format: "01/04/2026"
  const slash = str.split("/");
  if (slash.length === 3)
    return new Date(parseInt(slash[2]), parseInt(slash[1]) - 1, parseInt(slash[0]));
  return null;
}

function isSameDayWITA(d) {
  if (!d) return false;
  const now = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Makassar" }));
  return d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate();
}

async function fetchRealisasiHarian() {
  const range = encodeURIComponent("Realisasi Harian!A:F");
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${SHEETS_ID}/values/${range}?key=${SHEETS_KEY}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Sheets error: ${res.status}`);
  const json = await res.json();
  const rows = json.values ?? [];
  if (rows.length < 2) return [];
  const headers = rows[0];
  return rows.slice(1).map((row) => {
    const obj = {};
    headers.forEach((h, i) => { obj[h] = row[i] ?? ""; });
    return obj;
  });
}

function buildRealisasiMessage(rows) {
  const now = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Makassar" }));
  const tglStr = now.toLocaleDateString("id-ID", {
    timeZone: "Asia/Makassar",
    weekday: "long",
    day: "2-digit",
    month: "long",
    year: "numeric",
  });

  // Group by Tim Pelaksana
  const byTim = {};
  for (const row of rows) {
    const tim = (row["Tim Pelaksana"] || row["tim_pelaksana"] || "").trim();
    if (!tim) continue;
    if (!byTim[tim]) byTim[tim] = { wo: 0, realisasi: 0 };
    byTim[tim].wo += parseInt(row["wo"] || row["WO"] || "0") || 0;
    byTim[tim].realisasi += parseInt(row["realisasi"] || row["Realisasi"] || "0") || 0;
  }

  const timList = Object.keys(byTim).sort();
  let totalWO = 0;
  let totalReal = 0;

  const lines = [
    `📋 *REALISASI PEKERJAAN HARIAN*`,
    `📅 ${tglStr}`,
    ``,
  ];

  if (timList.length === 0) {
    lines.push(`_Tidak ada data pekerjaan hari ini._`);
  } else {
    // Header kolom
    lines.push(`*Tim Pelaksana*`);
    lines.push(`${"─".repeat(30)}`);
    for (const tim of timList) {
      const { wo, realisasi } = byTim[tim];
      totalWO += wo;
      totalReal += realisasi;
      const pct = wo > 0 ? Math.round((realisasi / wo) * 100) : 0;
      const icon = realisasi >= wo ? "✅" : realisasi > 0 ? "⚠️" : "❌";
      lines.push(`${icon} *${tim}*  WO: ${wo} | Real: ${realisasi} (${pct}%)`);
    }
    lines.push(``);
    const totalPct = totalWO > 0 ? Math.round((totalReal / totalWO) * 100) : 0;
    lines.push(`📊 *Total: WO ${totalWO} | Realisasi ${totalReal} (${totalPct}%)*`);
  }

  lines.push(``);
  lines.push(`_SMART MATARAM — PLN UP3 Mataram_`);
  return lines.join("\n");
}

async function kirimRealisasiHarian() {
  try {
    console.log("[realisasi] Fetch data dari Google Sheets...");
    const allRows = await fetchRealisasiHarian();
    const todayRows = allRows.filter((r) => {
      const tgl = parseTanggal(r["tanggal"] || r["Tanggal"] || "");
      return isSameDayWITA(tgl);
    });

    console.log(`[realisasi] ${todayRows.length} baris hari ini`);
    const message = buildRealisasiMessage(todayRows);
    await client.sendMessage(GROUP_REALISASI, message);
    console.log("[realisasi] ✅ Pesan realisasi harian terkirim");
  } catch (err) {
    console.error("[realisasi] ❌ Gagal kirim:", err.message);
  }
}

// Test manual — hapus setelah selesai testing
app.post("/test-realisasi", async (req, res) => {
  if (!isReady) return res.status(503).json({ error: "Bot belum siap" });
  try {
    await kirimRealisasiHarian();
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Setiap hari jam 18.00 WITA
cron.schedule("0 18 * * *", () => {
  if (!isReady) {
    console.warn("[realisasi] Bot belum siap, skip");
    return;
  }
  kirimRealisasiHarian();
}, { timezone: "Asia/Makassar" });

console.log("⏰ Cron realisasi harian terjadwal: 18.00 WITA");

// ── HTTP Server ───────────────────────────────────────────────────────────────

app.listen(PORT, "127.0.0.1", () => {
  console.log(`🤖 WA Bot service berjalan di port ${PORT}`);
});
