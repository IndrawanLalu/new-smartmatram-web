import { NextRequest, NextResponse } from "next/server";
import { gatewayEnabled, gatewaySend } from "@/lib/wa/gateway";

/**
 * Reminder inspeksi urgent — pengganti wa-bot/reminder.js (cron di dalam bot).
 * Dipicu cron VPS (mis. cron-job / crontab) jam 08,11,15,18 WITA:
 *   POST /api/wa-reminder  header X-Cron-Secret: <CRON_SECRET>   (opsional ?jenis=all|jaringan|pohon)
 * Kirim lewat wa-gateway (teks + foto).
 */
/* eslint-disable @typescript-eslint/no-explicit-any */

const SMART_MATARAM_URL = process.env.SMART_MATARAM_URL || "http://localhost:3000";
const AGENT_SECRET = process.env.AGENT_SECRET || "";
const MAX_ITEMS = 5;
const SEND_DELAY_MS = 1500;
const DARI_TANGGAL = "2026-03-01";

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

function fmtTanggal(s?: string) {
  if (!s) return "—";
  const [y, m, d] = s.split("-");
  return `${d}-${m}-${y}`;
}
function mapsLink(koordinat?: string) {
  if (!koordinat) return null;
  const parts = String(koordinat).split(",");
  if (parts.length < 2) return null;
  const lat = parseFloat(parts[0].trim());
  const lng = parseFloat(parts[1].trim());
  if (isNaN(lat) || isNaN(lng)) return null;
  return `https://maps.google.com/?q=${lat},${lng}`;
}
function formatCaption(item: any, type: string) {
  const isJaringan = type === "jaringan";
  const emo = isJaringan ? "⚡" : "🌳";
  const label = isJaringan ? "URGENT" : "SANGAT TINGGI";
  const deskripsi = isJaringan ? item.temuan : item.deskripsi;
  const lines = [`${emo} *${label}*`, `📍 ${item.lokasi || "—"} · ${item.penyulang || "—"}`];
  if (deskripsi) lines.push(`📋 ${deskripsi}`);
  if (item.tgl_inspeksi) lines.push(`📅 ${fmtTanggal(item.tgl_inspeksi)}`);
  if (item.nama_inspektor) lines.push(`👤 ${item.nama_inspektor}`);
  const maps = mapsLink(item.koordinat);
  if (maps) lines.push(`🗺️ ${maps}`);
  lines.push("", "_SMART MATARAM — PLN UP3 Mataram_");
  return lines.join("\n");
}

async function fetchWaSettings(category: string) {
  try {
    const res = await fetch(`${SMART_MATARAM_URL}/api/wa-settings`, { headers: { "x-agent-secret": AGENT_SECRET } });
    if (!res.ok) throw new Error(`API error ${res.status}`);
    const all = await res.json();
    return all.filter((s: any) => s.category === category && s.enabled && s.group_id);
  } catch (err) {
    console.error("[wa-reminder] gagal fetch wa-settings:", (err as Error).message);
    return [];
  }
}
async function fetchUrgent() {
  try {
    const res = await fetch(`${SMART_MATARAM_URL}/api/agent?type=inspeksi_urgent&dari_tanggal=${DARI_TANGGAL}`, {
      headers: { "x-agent-secret": AGENT_SECRET },
    });
    if (!res.ok) throw new Error(`API error ${res.status}`);
    return await res.json();
  } catch (err) {
    console.error("[wa-reminder] gagal fetch inspeksi_urgent:", (err as Error).message);
    return null;
  }
}

async function sendToGroup(chatId: string, items: any[], totalAll: number) {
  const more = totalAll > MAX_ITEMS ? ` _(dan ${totalAll - MAX_ITEMS} lainnya)_` : "";
  await gatewaySend({ to: chatId, text: `🚨 *PENGINGAT TEMUAN URGENT*\nAda *${totalAll}* temuan belum diselesaikan${more}:` });
  await delay(SEND_DELAY_MS);
  for (const item of items) {
    const caption = formatCaption(item, item._type);
    const photoUrl = item.foto_sesudah_url || item.foto_sebelum_url;
    try {
      if (photoUrl) await gatewaySend({ to: chatId, mediaUrl: photoUrl, caption });
      else await gatewaySend({ to: chatId, text: caption });
    } catch {
      await gatewaySend({ to: chatId, text: caption }).catch(() => {});
    }
    await delay(SEND_DELAY_MS);
  }
}

async function sendUrgentReminder(jenis = "all") {
  const [settingsJaringan, settingsPohon, urgentData] = await Promise.all([
    fetchWaSettings("reminder_jaringan"),
    fetchWaSettings("reminder_pohon"),
    fetchUrgent(),
  ]);
  if (!urgentData) return;

  const rawJaringan = jenis === "pohon" ? [] : (urgentData.jaringan ?? []);
  const rawPohon = jenis === "jaringan" ? [] : (urgentData.pohon ?? []);

  for (const setting of settingsJaringan) {
    const ulp = (setting.ulp ?? "").toUpperCase();
    const chatId = setting.group_id.includes("@g.us") ? setting.group_id : `${setting.group_id}@g.us`;
    const data = ulp ? rawJaringan.filter((i: any) => (i.ulp ?? "").toUpperCase() === ulp) : rawJaringan;
    if (data.length === 0) continue;
    const items = data.map((i: any) => ({ ...i, _type: "jaringan" }))
      .sort((a: any, b: any) => +new Date(a.tgl_inspeksi) - +new Date(b.tgl_inspeksi)).slice(0, MAX_ITEMS);
    await sendToGroup(chatId, items, data.length);
    await delay(SEND_DELAY_MS * 2);
  }
  for (const setting of settingsPohon) {
    const ulp = (setting.ulp ?? "").toUpperCase();
    const chatId = setting.group_id.includes("@g.us") ? setting.group_id : `${setting.group_id}@g.us`;
    const data = ulp ? rawPohon.filter((i: any) => (i.ulp ?? "").toUpperCase() === ulp) : rawPohon;
    if (data.length === 0) continue;
    const items = data.map((i: any) => ({ ...i, _type: "pohon" }))
      .sort((a: any, b: any) => +new Date(a.tgl_inspeksi) - +new Date(b.tgl_inspeksi)).slice(0, MAX_ITEMS);
    await sendToGroup(chatId, items, data.length);
    await delay(SEND_DELAY_MS * 2);
  }
}

export async function POST(req: NextRequest) {
  const secret = req.headers.get("x-cron-secret") || new URL(req.url).searchParams.get("secret");
  if (!process.env.CRON_SECRET || secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!gatewayEnabled()) {
    return NextResponse.json({ error: "gateway tidak aktif (WA_USE_GATEWAY)" }, { status: 503 });
  }
  const jenis = new URL(req.url).searchParams.get("jenis") || "all";
  await sendUrgentReminder(jenis);
  return NextResponse.json({ ok: true, jenis });
}
