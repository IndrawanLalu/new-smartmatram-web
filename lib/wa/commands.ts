/**
 * SMART MATARAM — WA Command Handler (port dari wa-bot/commands.js).
 * Dipakai oleh app/api/wa-webhook (pesan masuk dari wa-gateway).
 * Logika command dipertahankan sama: #gardu, #beban, #overload, #inspeksi urgent, #rekap, #help.
 */

const SMART_MATARAM_URL = process.env.SMART_MATARAM_URL || "http://localhost:3000";
const AGENT_SECRET = process.env.AGENT_SECRET || "";

async function fetchAgent(params: Record<string, string>) {
  const url = `${SMART_MATARAM_URL}/api/agent?${new URLSearchParams(params)}`;
  const res = await fetch(url, { headers: { "x-agent-secret": AGENT_SECRET } });
  if (!res.ok) throw new Error(`API error ${res.status}`);
  return res.json();
}

// ── Formatters ────────────────────────────────────────────────────────────────
function fmtTanggal(s?: string) {
  if (!s) return "—";
  const [y, m, d] = s.split("-");
  return `${d}-${m}-${y}`;
}
function mapsLink(lat?: number, lng?: number) {
  if (!lat || !lng) return null;
  return `https://maps.google.com/?q=${lat},${lng}`;
}
function bebanBar(pct: number) {
  const filled = Math.round((pct / 100) * 10);
  const bar = "█".repeat(filled) + "░".repeat(10 - filled);
  return `[${bar}] ${Math.round(pct)}%`;
}

/* eslint-disable @typescript-eslint/no-explicit-any */
function formatGardu(g: any) {
  const lines = [
    `⚡ *${g.kode}* — ${g.nama || "—"}`,
    `📍 ${g.alamat || "—"}`,
    `🔌 Penyulang: ${g.feeder || "—"} · ${g.daya || "—"} KVA`,
  ];
  if (g.beban_persen != null) {
    const emo = g.beban_persen >= 80 ? "🔴" : g.beban_persen >= 60 ? "🟡" : "🟢";
    lines.push(`${emo} Beban: ${bebanBar(g.beban_persen)}`);
  }
  if (g.status) lines.push(`📋 Status: ${g.status}`);
  const maps = mapsLink(g.lat, g.lng);
  if (maps) lines.push(`🗺️ Maps: ${maps}`);
  return lines.join("\n");
}

function formatPengukuran(p: any) {
  const emo = p.persen_beban >= 80 ? "🔴" : p.persen_beban >= 60 ? "🟡" : "🟢";
  const lines = [
    `⚡ *${p.no_gardu}* — Pengukuran Terakhir`,
    `📅 ${fmtTanggal(p.tanggal_pengukuran)}${p.jam_pengukuran ? " " + p.jam_pengukuran : ""}`,
    `${emo} Beban: ${bebanBar(p.persen_beban)} (${Math.round(p.beban_kva)} / ${p.kva_trafo} KVA)`,
    `⚙️ Arus R/S/T: ${Math.round(p.total_arus_r)}/${Math.round(p.total_arus_s)}/${Math.round(p.total_arus_t)} A`,
  ];
  if (p.suhu_trafo) {
    const sEmo = p.suhu_trafo > 60 ? "🌡️🔴" : "🌡️";
    lines.push(`${sEmo} Suhu: ${p.suhu_trafo}°C`);
  }
  if (p.petugas_nama) lines.push(`👤 Petugas: ${p.petugas_nama}`);
  if (p.amg_sent_at) lines.push(`✅ Sudah di-AMG`);
  return lines.join("\n");
}

function normalizeGarduQuery(raw: string) {
  return raw.replace(/\b(gardu|trafo|no|nomor|kode)\b/gi, "").replace(/\s+/g, " ").trim().toUpperCase();
}

// ── Command handlers ────────────────────────────────────────────────────────────
function cmdHelp() {
  return (
    "📟 *SMART MATARAM BOT*\n━━━━━━━━━━━━━━━━━━━━\n\n" +
    "🔍 *#gardu <kode/nama/alamat>*\nInfo gardu + lokasi Maps\n» #gardu AM005\n» #gardu ampenan baru\n\n" +
    "⚡ *#beban <kode>*\nData pengukuran terakhir gardu\n» #beban AM005\n\n" +
    "🔴 *#overload*\nGardu overload (≥80%) & suhu tinggi\n\n" +
    "🚨 *#inspeksi urgent*\nTemuan urgent yang belum selesai\n\n" +
    "📊 *#rekap*\nRingkasan data hari ini\n\n" +
    "━━━━━━━━━━━━━━━━━━━━\n_SMART MATARAM — PLN UP3 Mataram_"
  );
}

async function cmdGardu(args: string) {
  const q = normalizeGarduQuery(args);
  if (!q) return "Format: *#gardu <kode/nama/alamat>*\nContoh: #gardu AM005";
  const data = await fetchAgent({ type: "gardu", q });
  if (data.total === 0) return `❌ Gardu *${q}* tidak ditemukan.\nCoba cari dengan kode, nama, atau sebagian alamat.`;
  if (data.total === 1) return formatGardu(data.results[0]) + "\n\n_SMART MATARAM — PLN UP3 Mataram_";
  const list = data.results.slice(0, 8)
    .map((g: any, i: number) => `${i + 1}. *${g.kode}* — ${g.nama || "—"}\n    📍 ${g.alamat || "—"}`).join("\n");
  const more = data.total > 8 ? `\n_...dan ${data.total - 8} lainnya_` : "";
  return `⚡ Ditemukan *${data.total}* gardu untuk "${q}":\n\n${list}${more}\n\n_Perjelas pencarian untuk melihat detail + Maps_`;
}

async function cmdBeban(args: string) {
  const q = normalizeGarduQuery(args);
  if (!q) return "Format: *#beban <kode/nama>*\nContoh: #beban AM005";
  const data = await fetchAgent({ type: "pengukuran", q });
  if (data.total === 0) return `❌ Data pengukuran untuk *${q}* tidak ditemukan.\nPastikan gardu sudah pernah diukur.`;
  if (data.total === 1) return formatPengukuran(data.results[0]) + "\n\n_SMART MATARAM — PLN UP3 Mataram_";
  const list = data.results.map((p: any, i: number) => {
    const emo = p.persen_beban >= 80 ? "🔴" : p.persen_beban >= 60 ? "🟡" : "🟢";
    return `${i + 1}. *${p.no_gardu}* ${emo} ${Math.round(p.persen_beban)}% · ${fmtTanggal(p.tanggal_pengukuran)}`;
  }).join("\n");
  return `⚡ Ditemukan *${data.total}* gardu:\n\n${list}\n\n_Perjelas kode gardu untuk detail_\n\n_SMART MATARAM — PLN UP3 Mataram_`;
}

async function cmdOverload() {
  const data = await fetchAgent({ type: "pengukuran_anomali" });
  const lines = ["📊 *Anomali Pengukuran Gardu*", ""];
  if (data.overload?.length > 0) {
    lines.push(`🔴 *Overload (≥80%)* — ${data.overload.length} gardu:`);
    data.overload.slice(0, 8).forEach((g: any, i: number) => lines.push(`${i + 1}. *${g.no_gardu}* — ${Math.round(g.persen_beban)}% · ${g.penyulang || "—"}`));
    if (data.overload.length > 8) lines.push(`_...dan ${data.overload.length - 8} lainnya_`);
    lines.push("");
  }
  if (data.suhu_tinggi?.length > 0) {
    lines.push(`🌡️ *Suhu Tinggi (>60°C)* — ${data.suhu_tinggi.length} gardu:`);
    data.suhu_tinggi.slice(0, 5).forEach((g: any, i: number) => lines.push(`${i + 1}. *${g.no_gardu}* — ${g.suhu_trafo}°C · ${g.penyulang || "—"}`));
  }
  if (!data.overload?.length && !data.suhu_tinggi?.length) lines.push("✅ Tidak ada anomali saat ini.");
  lines.push("", "_SMART MATARAM — PLN UP3 Mataram_");
  return lines.join("\n");
}

async function cmdInspeksiUrgent() {
  const data = await fetchAgent({ type: "inspeksi_urgent" });
  const lines = ["🔴 *Inspeksi Urgent Belum Selesai*", ""];
  if (data.jaringan?.length > 0) {
    lines.push(`⚡ *Jaringan* (${data.jaringan.length}):`);
    data.jaringan.slice(0, 5).forEach((item: any, i: number) => {
      lines.push(`${i + 1}. ${item.lokasi || "—"} · ${item.penyulang || "—"}`);
      lines.push(`    ${item.temuan || "—"}`);
    });
    if (data.jaringan.length > 5) lines.push(`_...dan ${data.jaringan.length - 5} lainnya_`);
    lines.push("");
  }
  if (data.pohon?.length > 0) {
    lines.push(`🌳 *Pohon* (${data.pohon.length}):`);
    data.pohon.slice(0, 5).forEach((item: any, i: number) => {
      lines.push(`${i + 1}. ${item.lokasi || "—"} · ${item.penyulang || "—"}`);
      lines.push(`    ${item.deskripsi || "—"}`);
    });
    if (data.pohon.length > 5) lines.push(`_...dan ${data.pohon.length - 5} lainnya_`);
  }
  if (!data.jaringan?.length && !data.pohon?.length) lines.push("✅ Tidak ada temuan urgent.");
  lines.push("", "_SMART MATARAM — PLN UP3 Mataram_");
  return lines.join("\n");
}

async function cmdRekap() {
  const data = await fetchAgent({ type: "rekap", periode: "hari_ini" });
  const { inspeksi_jaringan: ij, inspeksi_pohon: ip, pengukuran: pk } = data;
  return [
    `📊 *Rekap ${data.periode || "Hari Ini"}*`, "",
    `⚡ *Inspeksi Jaringan*`, `   Total: ${ij.total} · Urgent: ${ij.urgent} · Selesai: ${ij.selesai}`, "",
    `🌳 *Inspeksi Pohon*`, `   Total: ${ip.total} · Sangat Tinggi: ${ip.sangat_tinggi} · Selesai: ${ip.selesai}`, "",
    `📏 *Pengukuran Gardu*`, `   Total: ${pk.total} ukuran · ${pk.gardu_unik} gardu`,
    `   🔴 Overload: ${pk.overload} · 🌡️ Suhu Tinggi: ${pk.suhu_tinggi}`, "",
    "_SMART MATARAM — PLN UP3 Mataram_",
  ].join("\n");
}

// ── Dispatcher ────────────────────────────────────────────────────────────────
export async function handleCommand(text: string): Promise<string | null> {
  if (!text.startsWith("#")) return null;
  const raw = text.slice(1).trim();
  const lower = raw.toLowerCase();
  const args = raw.replace(/^\S+\s*/, "");

  if (lower === "help" || lower === "bantuan") return cmdHelp();
  if (lower.startsWith("gardu") || lower.startsWith("alamat")) return cmdGardu(raw.replace(/^(gardu|alamat)\s*/i, ""));
  if (lower.startsWith("beban")) return cmdBeban(args);
  if (lower === "overload" || lower === "gardu overload" || lower === "anomali") return cmdOverload();
  if (lower.startsWith("inspeksi urgent") || lower === "urgent") return cmdInspeksiUrgent();
  if (lower === "rekap" || lower === "summary" || lower === "laporan") return cmdRekap();

  return `❓ Perintah *#${raw}* tidak dikenali.\nKetik *#help* untuk daftar perintah.`;
}
