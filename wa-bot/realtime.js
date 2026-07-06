/**
 * SMART MATARAM — Notifikasi Temuan Urgent REALTIME (anti-putus)
 * ---------------------------------------------------------------------------
 * Pengganti jalur webhook Supabase → /api/wa-notify.
 *
 * wa-bot subscribe LANGSUNG ke Supabase Realtime (postgres_changes) lalu kirim
 * WA via client.sendMessage(). Sepenuhnya self-contained di VPS — TIDAK butuh
 * Supabase Cloud menjangkau URL publik app, TIDAK butuh secret webhook. Jadi
 * kebal terhadap "secret drift" / ganti domain yang tadinya membuat notif mati
 * diam-diam (401 senyap).
 *
 * Pemicu:
 *   - inspeksi        category = "Urgent"        → group kategori "jaringan"
 *   - inspeksi_pohon  tingkat_risiko = "Sangat Tinggi" → group kategori "perabasan"
 * Group ID dibaca dari tabel wa_settings (per-ULP), sama seperti jalur lama.
 *
 * Backstop: reminder.js tetap mengirim ulang temuan urgent yang belum selesai
 * setiap jam 08/11/15/18 WITA — jadi kalau ada event realtime yang terlewat
 * (mis. bot sempat down), reminder akan menyusulkannya.
 *
 * AKTIVASI (lihat wa-bot/REALTIME-NOTIF.md):
 *   1. set env WA_REALTIME_ENABLED=true
 *   2. NONAKTIFKAN webhook Supabase (hapus/disable trigger) agar tidak dobel kirim
 */

const path = require("path");
// Muat kredensial Supabase dari .env.local milik app (VPS: /var/www/smart-mataram/.env.local).
// dotenv tidak menimpa env yang sudah ada, jadi aman dipanggil ganda.
require("dotenv").config({ path: path.resolve(process.cwd(), ".env.local") });

const { createClient }  = require("@supabase/supabase-js");
const { MessageMedia }  = require("whatsapp-web.js");

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || "";
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";

let started = false; // cegah double-subscribe jika event "ready" terpicu >1x

// ── Dedupe — hindari dobel kirim (INSERT lalu UPDATE beruntun / event ganda) ──
const recentlySent = new Map(); // key -> timestamp
const DEDUPE_TTL_MS = 5 * 60 * 1000;

function alreadySent(key) {
  const now = Date.now();
  for (const [k, t] of recentlySent) if (now - t > DEDUPE_TTL_MS) recentlySent.delete(k);
  if (recentlySent.has(key)) return true;
  recentlySent.set(key, now);
  return false;
}

// ── Format pesan (selaras dgn app/api/wa-notify) ─────────────────────────────

function fmtWaktu() {
  return new Date().toLocaleString("id-ID", {
    timeZone: "Asia/Makassar",
    dateStyle: "full",
    timeStyle: "short",
  });
}

function buildJaringanMessage(r) {
  return [
    `🚨⚡ *TEMUAN JARINGAN — URGENT*`,
    ``,
    `📅 *Waktu:* ${fmtWaktu()} WITA`,
    `🏢 *ULP:* ${r.ulp ?? "-"}`,
    `⚡ *Penyulang:* ${r.penyulang ?? "-"}`,
    `📍 *Lokasi:* ${r.lokasi ?? "-"}`,
    `🔧 *Temuan:* ${r.temuan ?? "-"}`,
    r.keterangan ? `📝 *Keterangan:* ${r.keterangan}` : null,
    `👤 *Inspektor:* ${r.nama_inspektor ?? "-"}`,
    ``,
    `⚠️ *Perlu tindakan segera oleh tim Jaringan!*`,
    ``,
    `_SMART MATARAM — PLN UP3 Mataram_`,
  ].filter(Boolean).join("\n");
}

function buildPohonMessage(r) {
  // Catatan: tabel inspeksi_pohon TIDAK punya kolom `temuan` — pakai `deskripsi`.
  return [
    `🚨🌳 *TEMUAN POHON — RISIKO SANGAT TINGGI*`,
    ``,
    `📅 *Waktu:* ${fmtWaktu()} WITA`,
    `🏢 *ULP:* ${r.ulp ?? "-"}`,
    `⚡ *Penyulang:* ${r.penyulang ?? "-"}`,
    `📍 *Lokasi:* ${r.lokasi ?? "-"}`,
    `🌳 *Temuan:* ${r.deskripsi ?? "-"}`,
    r.keterangan ? `📝 *Keterangan:* ${r.keterangan}` : null,
    `👤 *Inspektor:* ${r.nama_inspektor ?? "-"}`,
    ``,
    `⚠️ *Perlu tindakan segera oleh tim PERABASAN!*`,
    ``,
    `_SMART MATARAM — PLN UP3 Mataram_`,
  ].filter(Boolean).join("\n");
}

// ── Ambil group_id per-ULP dari wa_settings ──────────────────────────────────

async function getGroupId(supabase, category, ulp) {
  const { data, error } = await supabase
    .from("wa_settings")
    .select("group_id")
    .eq("category", category)
    .eq("ulp", ulp)
    .eq("enabled", true)
    .maybeSingle();
  if (error) { console.error("❌ Realtime: gagal baca wa_settings:", error.message); return ""; }
  return data?.group_id || "";
}

// ── Kirim ke WA ──────────────────────────────────────────────────────────────

async function sendNotif(client, groupId, message, imageUrl) {
  const chatId = groupId.includes("@g.us") ? groupId : `${groupId}@g.us`;
  try {
    if (imageUrl) {
      const media = await MessageMedia.fromUrl(imageUrl, { unsafeMime: true });
      await client.sendMessage(chatId, media, { caption: message });
    } else {
      await client.sendMessage(chatId, message);
    }
    console.log(`✅ Realtime: notif terkirim ke ${chatId}`);
  } catch (err) {
    console.error(`❌ Realtime: gagal kirim ke ${chatId}:`, err.message);
  }
}

// ── Handler event per tabel ──────────────────────────────────────────────────

async function handleInspeksi(client, supabase, payload) {
  const r   = payload.new;
  const old = payload.old || {};
  if (!r || r.category !== "Urgent") return;
  // UPDATE: hanya notif saat transisi MENJADI Urgent (hindari spam tiap edit).
  if (payload.eventType === "UPDATE" && old.category === "Urgent") return;
  if (alreadySent(`insp_${r.id}`)) return;

  const ulp     = (r.ulp || "").toUpperCase();
  const groupId = await getGroupId(supabase, "jaringan", ulp);
  if (!groupId) { console.warn(`⚠️ Realtime: group Jaringan ULP ${ulp} belum dikonfigurasi`); return; }

  const imageUrl = r.foto_sebelum_url || r.foto_lokasi_url || undefined;
  await sendNotif(client, groupId, buildJaringanMessage(r), imageUrl);
}

async function handlePohon(client, supabase, payload) {
  const r   = payload.new;
  const old = payload.old || {};
  if (!r || r.tingkat_risiko !== "Sangat Tinggi") return;
  if (payload.eventType === "UPDATE" && old.tingkat_risiko === "Sangat Tinggi") return;
  if (alreadySent(`pohon_${r.id}`)) return;

  const ulp     = (r.ulp || "").toUpperCase();
  const groupId = await getGroupId(supabase, "perabasan", ulp);
  if (!groupId) { console.warn(`⚠️ Realtime: group PERABASAN ULP ${ulp} belum dikonfigurasi`); return; }

  const imageUrl = r.foto_sebelum_url || r.foto_lokasi_url || undefined;
  await sendNotif(client, groupId, buildPohonMessage(r), imageUrl);
}

// ── Start listener ───────────────────────────────────────────────────────────

function startRealtimeListener(client, getIsReady) {
  if (process.env.WA_REALTIME_ENABLED !== "true") {
    console.log("ℹ️ Realtime listener NONAKTIF (set WA_REALTIME_ENABLED=true untuk mengaktifkan).");
    return;
  }
  if (started) return; // guard double-subscribe
  if (!SUPABASE_URL || !SUPABASE_KEY) {
    console.error("❌ Realtime: NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY tidak ditemukan — listener tidak dijalankan.");
    return;
  }
  started = true;

  const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const guard = (handler) => (payload) => {
    if (!getIsReady()) { console.warn("⏭️ Realtime: bot belum siap, event dilewati (akan disusul reminder)."); return; }
    Promise.resolve(handler(client, supabase, payload)).catch((err) =>
      console.error("❌ Realtime: error handler:", err.message)
    );
  };

  supabase
    .channel("wa-urgent-notif")
    .on("postgres_changes", { event: "INSERT", schema: "public", table: "inspeksi" },        guard(handleInspeksi))
    .on("postgres_changes", { event: "UPDATE", schema: "public", table: "inspeksi" },        guard(handleInspeksi))
    .on("postgres_changes", { event: "INSERT", schema: "public", table: "inspeksi_pohon" },  guard(handlePohon))
    .on("postgres_changes", { event: "UPDATE", schema: "public", table: "inspeksi_pohon" },  guard(handlePohon))
    .subscribe((status) => {
      console.log(`📡 Realtime listener: ${status}`);
      if (status === "SUBSCRIBED") console.log("✅ Realtime notif aktif — inspeksi (Urgent) & inspeksi_pohon (Sangat Tinggi).");
    });
}

module.exports = { startRealtimeListener };
