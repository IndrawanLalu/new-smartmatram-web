import { NextRequest, NextResponse } from "next/server";
import { gatewayEnabled, gatewaySend } from "@/lib/wa/gateway";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { fetchAllRows } from "@/lib/supabasePaginate";

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

// ── Temuan JTM berkategori Urgent yang BELUM ditugaskan ─────────────────────
// (rencana-notif-temuan-jtm.md, keputusan 3). Satu pesan ringkas per grup,
// bukan satu pesan per temuan — temuan JTM bisa puluhan per ULP.
const ISIAN_POHON = new Set(["vegetasi", "jenis_pohon", "posisi_pohon"]);
const MAX_BARIS_JTM = 15;

async function jtmUrgentBelumDitugaskan() {
  const [temuan, kategori] = await Promise.all([
    fetchAllRows<any>(() =>
      supabaseAdmin
        .from("jtm_temuan")
        .select("tiang_id,tiang_kode,penyulang,ulp,item_kode,item_nama,bagian,sirkit_segmen_id,nilai_label,nilai,inspeksi_jtm_id,ditemukan_pada")
        .eq("status_tugas", "Belum ditugaskan")
        .order("tiang_id").order("item_kode").order("bagian"),
    ),
    fetchAllRows<any>(() =>
      supabaseAdmin
        .from("jtm_kategori_temuan")
        .select("inspeksi_id,tiang_id,item_kode,bagian,sirkit_segmen_id")
        .eq("kategori_temuan", "Urgent")
        .order("inspeksi_id").order("tiang_id").order("item_kode"),
    ),
  ]);
  const kunci = (x: any, insp: string) => `${insp}|${x.tiang_id}|${x.item_kode}|${x.bagian ?? "-"}|${x.sirkit_segmen_id ?? ""}`;
  const urgent = new Set(kategori.map((k) => kunci(k, k.inspeksi_id)));
  return temuan.filter((t) => urgent.has(kunci(t, t.inspeksi_jtm_id)));
}

async function sendJtmReminder(jenis: string, settingsJaringan: any[], settingsPohon: any[]) {
  let daftar: any[];
  try {
    daftar = await jtmUrgentBelumDitugaskan();
  } catch (err) {
    console.error("[wa-reminder] gagal membaca temuan JTM:", (err as Error).message);
    return;
  }
  const kirimKe = async (settings: any[], pohon: boolean) => {
    for (const setting of settings) {
      const ulp = (setting.ulp ?? "").toUpperCase();
      const data = daftar
        .filter((t) => ISIAN_POHON.has(t.item_kode) === pohon && (!ulp || (t.ulp ?? "").toUpperCase() === ulp))
        .sort((a, b) => +new Date(a.ditemukan_pada) - +new Date(b.ditemukan_pada));
      if (data.length === 0) continue;
      const chatId = setting.group_id.includes("@g.us") ? setting.group_id : `${setting.group_id}@g.us`;
      const baris = data.slice(0, MAX_BARIS_JTM).map((t) =>
        `• *${t.tiang_kode}* (${t.penyulang ?? "-"}) — ${t.item_nama}${t.bagian && t.bagian !== "-" ? ` ${t.bagian}` : ""}: ${t.nilai_label ?? t.nilai ?? "-"} · ${fmtTanggal(String(t.ditemukan_pada).slice(0, 10))}`,
      );
      await gatewaySend({
        to: chatId,
        text: [
          `🚨 *PENGINGAT TEMUAN URGENT JTM${pohon ? " — POHON" : ""}*`,
          `Ada *${data.length}* temuan urgent dari inspeksi JTM yang *belum ditugaskan*:`,
          "",
          ...baris,
          data.length > MAX_BARIS_JTM
            ? `_(dan ${data.length - MAX_BARIS_JTM} lainnya — lihat tab Temuan di Inspeksi JTM)_`
            : null,
          "",
          "_SMART MATARAM — PLN UP3 Mataram_",
        ].filter((x) => x !== null).join("\n"),
      });
      await delay(SEND_DELAY_MS * 2);
    }
  };
  if (jenis !== "pohon") await kirimKe(settingsJaringan, false);
  if (jenis !== "jaringan") await kirimKe(settingsPohon, true);
}

async function sendUrgentReminder(jenis = "all") {
  const [settingsJaringan, settingsPohon, urgentData] = await Promise.all([
    fetchWaSettings("reminder_jaringan"),
    fetchWaSettings("reminder_pohon"),
    fetchUrgent(),
  ]);
  // Gagal membaca tugas lama tidak boleh ikut menghentikan pengingat temuan JTM.
  const rawJaringan = !urgentData || jenis === "pohon" ? [] : (urgentData.jaringan ?? []);
  const rawPohon = !urgentData || jenis === "jaringan" ? [] : (urgentData.pohon ?? []);

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
  await sendJtmReminder(jenis, settingsJaringan, settingsPohon);
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
