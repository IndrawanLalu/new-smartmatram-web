/**
 * Penyusun teks Morning/Evening Brief WA — fusion prediksi ML (daily_feeder_risk)
 * + analitik historis dashboard (lib/gangguanAnalytics). Server-only (supabaseAdmin).
 *
 * Dipakai oleh:
 *  - app/api/morning-brief/send/route.ts     (cron / trigger pipeline, auth CRON_SECRET)
 *  - app/api/morning-brief/preview/route.ts  (preview & kirim manual, auth sesi)
 */
import "server-only";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { fetchSheetData } from "@/lib/sheets";
import { calcRemainingDays, getUrgencyLevel } from "@/lib/roles";
import { normalizeFeeder } from "@/lib/feeder";
import {
  parseGangguanRows, buildFeederContext, buildMonthHighlights,
  type GangguanEvent, type FeederContext,
} from "@/lib/gangguanAnalytics";

// ── Konstanta ───────────────────────────────────────────────────────────────────
function ulpLabel(ulp: string): string {
  const t = ulp.charAt(0).toUpperCase() + ulp.slice(1).toLowerCase();
  return `ULP ${t} · PLN UP3 Mataram`;
}
const OVERLOAD_PCT = 80;
const HIGH_TEMP_C = 60;
const WASPADA_SHOW = 4; // selain semua kritis, tampilkan top-N waspada saja (sisanya diringkas)

// Faktor cuaca identik antar feeder (1 centroid/ULP) → ditampilkan sekali di header.
const WEATHER_FAKTOR = new Set([
  "Cuaca: angin kencang", "Cuaca: curah hujan", "Cuaca: petir", "Pola rawan saat hujan",
]);

const HARI: Record<number, string> = {
  0: "Minggu", 1: "Senin", 2: "Selasa", 3: "Rabu", 4: "Kamis", 5: "Jumat", 6: "Sabtu",
};
const BULAN_SHORT = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];

// ── Date helpers (WITA, evening send → tak ada batas tengah malam) ────────────────
function witaDateStr(offsetDays = 0): string {
  const t = new Date(Date.now() + (8 + offsetDays * 24) * 3600 * 1000);
  return t.toISOString().slice(0, 10);
}
function shortLabel(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  return `${HARI[dt.getDay()]}, ${d} ${BULAN_SHORT[m - 1]}`;
}

// ── Tipe ML ───────────────────────────────────────────────────────────────────
interface RiskBreakdown {
  fitur?: Record<string, number | boolean | null>;
  drivers?: { faktor: string; kontribusi: number }[];
  catatan?: string | null;
}
interface RiskRow {
  penyulang: string;
  tgl: string;
  risk_score: number;
  risk_level: "kritis" | "waspada" | "aman";
  predicted_cause: string | null;
  breakdown: RiskBreakdown | null;
  generated_at: string | null;
}

export interface BriefResult { text: string; date: string; riskTgl: string | null; stale: boolean }

// ── Penyebab "tidak diketahui" (cermin is_unknown_cause Python, ringkas) ──────────
function isUnknownCause(raw: string): boolean {
  const t = raw.toLowerCase().trim();
  if (!t || t === "-") return true;
  return [
    "tidak di temukan", "tidak ditemukan", "temporer", "ar 1x", "ar1x", "ar 1 x",
    "investigasi", "dicoba", "belum diketahui", "tidak diketahui", "normal kembali",
  ].some((k) => t.includes(k));
}

// ── Frasa driver ML & konteks dashboard ──────────────────────────────────────────
function driverPhrase(faktor: string, f: Record<string, number | boolean | null>): string {
  const n = (k: string) => Math.round(Number(f[k] ?? 0));
  switch (faktor) {
    case "Riwayat trip 90 hari": return `trip ${n("trip_90d")}x dalam 90 hari`;
    case "Temuan pohon terbuka": return `${n("temuan_pohon_terbuka")} temuan pohon belum dieksekusi`;
    case "Temuan kritis terbuka": return `${n("temuan_kritis_terbuka")} temuan kritis terbuka`;
    case "Umur temuan tertua": return `temuan tertua ${n("umur_temuan_tertua_hari")} hari`;
    default: return faktor;
  }
}

// Driver spesifik-feeder saja (cuaca dikecualikan — sudah di header section).
function feederDriverPhrases(breakdown: RiskBreakdown | null): string[] {
  const f = breakdown?.fitur ?? {};
  return (breakdown?.drivers ?? [])
    .filter((d) => !WEATHER_FAKTOR.has(d.faktor))
    .slice(0, 2)
    .map((d) => driverPhrase(d.faktor, f));
}

// Ringkasan cuaca ULP untuk tanggal target (1 baris, dari fitur risk mana pun).
function weatherLine(f: Record<string, number | boolean | null>): string | null {
  const wind = Math.round(Number(f.wind_max_kmh ?? 0));
  const precip = Math.round(Number(f.precip_mm ?? 0));
  const parts: string[] = [];
  if (wind > 0) parts.push(`angin ~${wind} km/jam`);
  if (precip > 0) parts.push(`hujan ~${precip}mm`);
  if (f.thunder) parts.push("petir");
  return parts.length ? parts.join(", ") : null;
}

const CAUSE_SHORT: Record<string, string> = {
  "Cuaca (angin/hujan/petir)": "cuaca",
  "Pohon / ROW": "pohon",
  "Aset / Peralatan": "aset",
  "Binatang / Hewan": "binatang",
  "Manusia / Eksternal": "manusia/eksternal",
  "Lain-lain": "lain-lain",
};
function ctxPhrases(ctx: FeederContext | undefined): string[] {
  if (!ctx) return [];
  const out: string[] = [];
  if (ctx.count14d >= 2) out.push(`${ctx.count14d}x gangguan dalam 14 hari`);
  else if (ctx.count30d >= 2) out.push(`${ctx.count30d}x gangguan dalam 30 hari`);
  if (ctx.mtbfDays != null) out.push(`MTBF ~${Math.round(ctx.mtbfDays)} hari`);
  if (ctx.dominantCause) out.push(`tersering: ${CAUSE_SHORT[ctx.dominantCause] ?? ctx.dominantCause}`);
  return out;
}

const SARAN: Record<string, string> = {
  "Cuaca (angin/hujan/petir)": "siaga cuaca — patroli & PDKB, cek titik rawan",
  "Pohon / ROW": "turunkan tim RABAS",
  "Berulang (historis)": "inspeksi menyeluruh (penyulang sering trip)",
  "Aset / temuan": "percepat eksekusi temuan (WO)",
};

// ── Builder utama ────────────────────────────────────────────────────────────────
export async function buildBrief(ulp: string = "AMPENAN"): Promise<BriefResult> {
  const UNIT = ulp;
  const UNIT_LABEL = ulpLabel(ulp);
  const todayStr = witaDateStr(0);
  const tomorrowStr = witaDateStr(1);

  const [
    gangguanRaw, pengResult, pohUrgentResult, riskResult, moeResult,
    jarSelesaiResult, pohSelesaiResult,
  ] = await Promise.all([
    fetchSheetData("gangguanPenyulang", "A:S"),

    supabaseAdmin.from("pengukuran_gardu")
      .select("no_gardu,persen_beban,suhu_trafo,petugas_unit,tanggal_pengukuran")
      .eq("tanggal_pengukuran", todayStr).eq("petugas_unit", UNIT)
      .order("persen_beban", { ascending: false }),

    supabaseAdmin.from("inspeksi_pohon")
      .select("id,status,prediksi_inspektur,tgl_inspeksi,ulp")
      .neq("status", "Selesai").not("prediksi_inspektur", "is", null)
      .lte("prediksi_inspektur", todayStr).eq("ulp", UNIT),

    supabaseAdmin.from("daily_feeder_risk")
      .select("penyulang,tgl,risk_score,risk_level,predicted_cause,breakdown,generated_at")
      .eq("ulp", UNIT).order("tgl", { ascending: false }),

    supabaseAdmin.from("ml_outage_events")
      .select("penyulang,predicted_cause,cause_reason")
      .eq("ulp", UNIT).eq("tgl_gangguan", todayStr),

    supabaseAdmin.from("inspeksi").select("id")
      .eq("ulp", UNIT).eq("status", "Selesai").eq("tgl_eksekusi", todayStr),
    supabaseAdmin.from("inspeksi_pohon").select("id")
      .eq("ulp", UNIT).eq("status", "Selesai").eq("tgl_eksekusi", todayStr),
  ]);

  // ── Analitik dashboard (level feeder) ──────────────────────────────────────────
  const events: GangguanEvent[] = parseGangguanRows(gangguanRaw, { ulp: UNIT });
  const feederCtx = buildFeederContext(events, todayStr);
  const highlights = buildMonthHighlights(events, todayStr);
  const todayGangguan = events.filter((e) => e.date === todayStr);

  // ── ML risk: ambil baris dengan tgl terbaru ────────────────────────────────────
  const allRisk = (riskResult.data ?? []) as RiskRow[];
  const riskTgl = allRisk.length ? allRisk[0].tgl : null;
  const risk = allRisk.filter((r) => r.tgl === riskTgl);
  const stale = riskTgl !== null && riskTgl < tomorrowStr;

  // ── ML cause enrichment (per feeder) ───────────────────────────────────────────
  const moeMap = new Map<string, { predicted_cause: string | null; cause_reason: string | null }>();
  for (const m of (moeResult.data ?? []) as { penyulang: string; predicted_cause: string | null; cause_reason: string | null }[]) {
    const k = normalizeFeeder(m.penyulang);
    if (m.predicted_cause && !moeMap.has(k)) moeMap.set(k, { predicted_cause: m.predicted_cause, cause_reason: m.cause_reason });
  }

  // ── Pengukuran / pohon urgent / pekerjaan ──────────────────────────────────────
  type PengRow = { no_gardu: string | null; persen_beban: number; suhu_trafo: number };
  const pengRows = (pengResult.data ?? []) as PengRow[];
  const overload = pengRows.filter((r) => r.persen_beban >= OVERLOAD_PCT);
  const highTemp = pengRows.filter((r) => r.suhu_trafo > HIGH_TEMP_C);

  type UrgRow = { tgl_inspeksi: string | null; prediksi_inspektur: string | null };
  const urgent = ((pohUrgentResult.data ?? []) as UrgRow[]).filter(
    (r) => getUrgencyLevel(calcRemainingDays(r.tgl_inspeksi ?? "", r.prediksi_inspektur ?? "")) === "SANGAT URGENT"
  );

  const jarSelesai = (jarSelesaiResult.data ?? []).length;
  const pohSelesai = (pohSelesaiResult.data ?? []).length;

  // ── Susun teks ────────────────────────────────────────────────────────────────
  const L: string[] = [];
  L.push(`🌙 *BRIEF SORE · ${shortLabel(todayStr)}*`);
  L.push(`_${UNIT_LABEL}_`);
  L.push("");

  // ─ Section 1: Prediksi besok ─
  const kritis = risk.filter((r) => r.risk_level === "kritis").sort((a, b) => b.risk_score - a.risk_score);
  const waspada = risk.filter((r) => r.risk_level === "waspada").sort((a, b) => b.risk_score - a.risk_score);

  if (riskTgl === null) {
    L.push(`📡 *PREDIKSI RISIKO*`);
    L.push(`⚠️ Belum tersedia — pipeline ML belum dijalankan.`);
  } else {
    L.push(`📡 *PREDIKSI ${shortLabel(riskTgl).toUpperCase()}*`);
    if (kritis.length + waspada.length === 0) {
      L.push(`✅ Tidak ada penyulang berisiko tinggi.`);
    } else {
      L.push(`⚠️ *${kritis.length} KRITIS · ${waspada.length} WASPADA*`);
      L.push(`_Indikasi dini berbasis cuaca + riwayat — bukan kepastian_`);
      const wl = weatherLine(risk[0]?.breakdown?.fitur ?? {});
      if (wl) L.push(`🌦️ Cuaca ${shortLabel(riskTgl)}: ${wl}`);

      const list = [...kritis, ...waspada.slice(0, WASPADA_SHOW)];
      for (const r of list) {
        const emoji = r.risk_level === "kritis" ? "🔴" : "🟡";
        L.push("");
        L.push(`${emoji} *${r.penyulang}* · ${Math.round(r.risk_score)}`);
        const reasons = [
          ...feederDriverPhrases(r.breakdown),
          ...ctxPhrases(feederCtx.get(normalizeFeeder(r.penyulang))),
        ].slice(0, 3);
        if (reasons.length === 0) reasons.push("dominan faktor cuaca (lihat atas)");
        for (const reason of reasons) L.push(`   • ${reason}`);
        const saran = r.predicted_cause ? SARAN[r.predicted_cause] : null;
        if (saran && r.risk_level === "kritis") L.push(`   → ${saran}`);
      }
      const extra = kritis.length + waspada.length - list.length;
      if (extra > 0) L.push(`   _+${extra} waspada lainnya_`);
    }
    if (stale) L.push(`_⚠️ Prediksi terakhir ${shortLabel(riskTgl)} — jalankan pipeline untuk besok_`);
  }
  L.push("");

  // ─ Section 2: Rekap hari ini ─
  L.push(`━━━━━━━━━━━━━━`);
  L.push(`📋 *REKAP HARI INI*`);
  if (todayGangguan.length === 0) {
    L.push(`✅ Tidak ada gangguan`);
  } else {
    L.push(`🔴 Gangguan: *${todayGangguan.length}*`);
    for (const g of todayGangguan) {
      let line = `  • ${g.keypoint} ${g.jam}`;
      if (isUnknownCause(g.penyebabRaw)) {
        const ml = moeMap.get(g.feeder);
        line += ml?.predicted_cause
          ? ` — penyebab blm tercatat _(dugaan ML: ${CAUSE_SHORT[ml.predicted_cause] ?? ml.predicted_cause})_`
          : ` — penyebab blm tercatat`;
      } else {
        line += ` — ${g.penyebabRaw}`;
      }
      L.push(line);
    }
  }
  if (overload.length > 0)
    L.push(`⚡ Gardu overload: *${overload.length}* (${overload.slice(0, 3).map((r) => `${r.no_gardu} ${Math.round(r.persen_beban)}%`).join(", ")})`);
  if (highTemp.length > 0) L.push(`🌡️ Suhu trafo tinggi: *${highTemp.length}*`);
  if (urgent.length > 0) L.push(`🌳 Pohon sangat urgent: *${urgent.length}* menunggu eksekusi`);
  if (jarSelesai + pohSelesai > 0) L.push(`🔧 Inspeksi selesai hari ini: ${jarSelesai} jaringan, ${pohSelesai} pohon`);
  L.push("");

  // ─ Section 3: Sorotan bulan ini ─
  L.push(`━━━━━━━━━━━━━━`);
  L.push(`📊 *SOROTAN BULAN INI*`);
  const delta = highlights.thisMonthTotal - highlights.lastMonthTotal;
  const arrow = delta > 0 ? "⬆️" : delta < 0 ? "⬇️" : "➡️";
  L.push(`Gangguan: *${highlights.thisMonthTotal}* (bln lalu ${highlights.lastMonthTotal}) ${arrow}`);
  if (highlights.recurrence.length > 0)
    L.push(`🔁 Kronis: ${highlights.recurrence.map((r) => `${r.feeder} (${r.maxIn7}x/7hr)`).join(", ")}`);
  if (highlights.pareto.length > 0)
    L.push(`🎯 Terbanyak: ${highlights.pareto.map((p) => `${p.feeder} (${p.count})`).join(", ")}`);
  L.push("");

  L.push(`_Disusun otomatis oleh SMART Mataram_`);

  return { text: L.join("\n"), date: todayStr, riskTgl, stale };
}

// ── Pengirim WA ─────────────────────────────────────────────────────────────────
export async function sendWA(groupId: string, text: string) {
  const url = `${process.env.WA_BOT_URL ?? "http://127.0.0.1:3001"}/send`;
  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ groupId, message: text }),
    });
  } catch {
    throw new Error(`Bot WhatsApp tidak terjangkau di ${url}. Pastikan bot WA berjalan (bot ada di VPS, bukan di komputer lokal).`);
  }
  if (!res.ok) throw new Error(`Bot WhatsApp menolak (HTTP ${res.status}).`);
}

/** Grup WA brief untuk satu ULP (default Ampenan). Fallback ke baris lama 'morning_brief'. */
export async function resolveGroupId(ulp: string = "AMPENAN"): Promise<string | null> {
  const { data } = await supabaseAdmin
    .from("wa_settings").select("group_id")
    .eq("category", "morning_brief").eq("ulp", ulp).eq("enabled", true).maybeSingle();
  if (data?.group_id) return data.group_id;
  // Fallback: skema lama (1 baris global id='morning_brief', ulp NULL) — sebelum migrasi split.
  const { data: legacy } = await supabaseAdmin
    .from("wa_settings").select("group_id").eq("id", "morning_brief").eq("enabled", true).maybeSingle();
  return legacy?.group_id || null;
}

/** Daftar {ulp, groupId} brief per-ULP yang AKTIF — untuk fan-out kirim (spt reminder).
 *  Baris lama global (ulp NULL) diperlakukan sebagai AMPENAN agar tak break saat transisi. */
export async function resolveGroupTargets(): Promise<{ ulp: string; groupId: string }[]> {
  const { data } = await supabaseAdmin
    .from("wa_settings").select("ulp, group_id")
    .eq("category", "morning_brief").eq("enabled", true);
  const seen = new Set<string>();
  const out: { ulp: string; groupId: string }[] = [];
  for (const r of (data ?? []) as { ulp: string | null; group_id: string | null }[]) {
    const ulp = (r.ulp ?? "AMPENAN").toUpperCase();
    if (r.group_id && !seen.has(ulp)) { seen.add(ulp); out.push({ ulp, groupId: r.group_id }); }
  }
  return out;
}

/** Apakah pengiriman otomatis diaktifkan (morning_brief_settings.enabled). */
export async function isSendEnabled(): Promise<boolean> {
  const { data } = await supabaseAdmin
    .from("morning_brief_settings").select("enabled").eq("id", 1).single();
  return !!data?.enabled;
}
