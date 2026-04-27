import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { fetchSheetData } from "@/lib/sheets";
import type { PengukuranGardu } from "@/app/admin/pengukuran-gardu/_hooks/usePengukuranGardu";
import { calcRemainingDays, getUrgencyLevel } from "@/lib/roles";
import type { InspeksiJaringan } from "@/app/admin/monitoring-inspeksi/_hooks/useInspeksiJaringan";
import type { InspeksiPohon } from "@/app/admin/monitoring-inspeksi/_hooks/useInspeksiPohon";
import type {
  MorningBriefData, GangguanItem, PetugasRekap, EksekutorRekap,
} from "@/app/admin/morning-brief/_hooks/useMorningBrief";

const OVERLOAD_PCT = 80;
const HIGH_TEMP_C = 60;

export const maxDuration = 60;

// ── Constants ─────────────────────────────────────────────────────────────────

const UNIT = "AMPENAN";
const UNIT_LABEL = "ULP Ampenan · PLN UP3 Mataram";

const HARI: Record<number, string> = {
  0: "Minggu", 1: "Senin", 2: "Selasa", 3: "Rabu",
  4: "Kamis", 5: "Jumat", 6: "Sabtu",
};
const BULAN_NAMA: Record<number, string> = {
  0: "Januari", 1: "Februari", 2: "Maret", 3: "April",
  4: "Mei", 5: "Juni", 6: "Juli", 7: "Agustus",
  8: "September", 9: "Oktober", 10: "November", 11: "Desember",
};
const BULAN_ID: Record<string, number> = Object.fromEntries(
  Object.entries(BULAN_NAMA).map(([k, v]) => [v, Number(k)])
);
const EKSEKUSI_STATUSES = ["Selesai", "Dalam Proses"];

// ── Date helpers ──────────────────────────────────────────────────────────────

function getWibDateStr(offsetDays = 0): string {
  const wib = new Date(Date.now() + (7 + offsetDays * 24) * 3600 * 1000);
  return wib.toISOString().slice(0, 10);
}
function wibStartUtc(dateStr: string): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d, -7, 0, 0)).toISOString().slice(0, 19) + "Z";
}
function formatDateLabel(yStr: string): string {
  const [y, m, d] = yStr.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  return `${HARI[dt.getDay()]}, ${d} ${BULAN_NAMA[m - 1]} ${y}`;
}
function formatMonthLabel(yStr: string): string {
  const [y, m] = yStr.split("-").map(Number);
  return `${BULAN_NAMA[m - 1]} ${y}`;
}
function parseIndDate(str: string): Date | null {
  const m1 = str.match(/(\d+)\s+(\w+)\s+(\d{4})/);
  if (m1) {
    const mon = BULAN_ID[m1[2]];
    if (mon !== undefined) return new Date(Number(m1[3]), mon, Number(m1[1]));
  }
  const m2 = str.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (m2) return new Date(Number(m2[3]), Number(m2[2]) - 1, Number(m2[1]));
  return null;
}
function isSameDay(date: Date, yStr: string): boolean {
  const [y, m, d] = yStr.split("-").map(Number);
  return date.getFullYear() === y && date.getMonth() === m - 1 && date.getDate() === d;
}
function isWithinMonth(ds: string | null | undefined, start: string, end: string): boolean {
  return !!ds && ds >= start && ds <= end;
}

// ── Logic helpers ─────────────────────────────────────────────────────────────

function isSelesaiKemarin(tglEks: string | null, status: string, updatedAt: string | undefined, yStr: string, todayStr: string): boolean {
  if (tglEks === yStr) return true;
  if (!tglEks && updatedAt && EKSEKUSI_STATUSES.includes(status)) {
    const ms = new Date(updatedAt).getTime();
    return ms >= new Date(wibStartUtc(yStr)).getTime() && ms < new Date(wibStartUtc(todayStr)).getTime();
  }
  return false;
}
function isSelesaiBulanIni(tglEks: string | null, status: string, updatedAt: string | undefined, monthStart: string, todayStr: string): boolean {
  if (tglEks && tglEks >= monthStart && tglEks <= todayStr) return true;
  if (!tglEks && updatedAt && EKSEKUSI_STATUSES.includes(status)) {
    const ms = new Date(updatedAt).getTime();
    const tomorrow = getWibDateStr(1);
    return ms >= new Date(wibStartUtc(monthStart)).getTime() && ms < new Date(wibStartUtc(tomorrow)).getTime();
  }
  return false;
}

type SlimInspeksi = { eksekutor: string | null; team_name: string | null; tgl_inspeksi: string | null; tgl_eksekusi: string | null; updated_at?: string; status: string };

function buildEksekutorRekap(
  jar: SlimInspeksi[], poh: SlimInspeksi[],
  jarBulan: SlimInspeksi[], pohBulan: SlimInspeksi[],
  yStr: string, todayStr: string, monthStart: string
): EksekutorRekap[] {
  const map: Record<string, EksekutorRekap> = {};
  const add = (rows: SlimInspeksi[], type: "jaringan" | "pohon", isBulan: boolean) => {
    for (const r of rows) {
      const key = r.team_name ?? r.eksekutor ?? "Tidak Ditugaskan";
      if (!map[key]) map[key] = { eksekutor: key, jaringan: 0, pohon: 0, jaringanBulanIni: 0, pohonBulanIni: 0 };
      if (isBulan ? isSelesaiBulanIni(r.tgl_eksekusi, r.status, r.updated_at, monthStart, todayStr) : isSelesaiKemarin(r.tgl_eksekusi, r.status, r.updated_at, yStr, todayStr)) {
        if (type === "jaringan") isBulan ? map[key].jaringanBulanIni++ : map[key].jaringan++;
        else isBulan ? map[key].pohonBulanIni++ : map[key].pohon++;
      }
    }
  };
  add(jar, "jaringan", false); add(poh, "pohon", false);
  add(jarBulan, "jaringan", true); add(pohBulan, "pohon", true);
  return Object.values(map).sort((a, b) => (b.jaringanBulanIni + b.pohonBulanIni) - (a.jaringanBulanIni + a.pohonBulanIni));
}

function buildPetugasRekap(kemarin: PengukuranGardu[], bulan: { petugas_nama: string | null }[]): PetugasRekap[] {
  const mk: Record<string, number> = {};
  const mb: Record<string, number> = {};
  for (const r of kemarin) { const n = r.petugas_nama ?? "—"; mk[n] = (mk[n] ?? 0) + 1; }
  for (const r of bulan) { const n = r.petugas_nama ?? "—"; mb[n] = (mb[n] ?? 0) + 1; }
  const all = new Set([...Object.keys(mk), ...Object.keys(mb)]);
  return Array.from(all).map((nama) => ({ nama, jumlah: mk[nama] ?? 0, jumlahBulanIni: mb[nama] ?? 0 }))
    .sort((a, b) => b.jumlahBulanIni - a.jumlahBulanIni);
}

// ── Data fetch ────────────────────────────────────────────────────────────────

async function fetchData(): Promise<MorningBriefData> {
  const yStr = getWibDateStr(-1);
  const todayStr = getWibDateStr(0);
  const monthStart = `${todayStr.slice(0, 7)}-01`;

  const [
    gangguanRaw, pengResult, jarResult, pohResult, pohUrgentResult,
    pengBulanResult, jarBulanResult, pohBulanResult,
  ] = await Promise.all([
    fetchSheetData("gangguanPenyulang", "A:S"),

    supabaseAdmin.from("pengukuran_gardu").select("*")
      .eq("tanggal_pengukuran", yStr).eq("petugas_unit", UNIT)
      .order("persen_beban", { ascending: false }),

    supabaseAdmin.from("inspeksi").select("*")
      .or(`tgl_inspeksi.eq.${yStr},tgl_eksekusi.eq.${yStr},and(updated_at.gte.${wibStartUtc(yStr)},updated_at.lt.${wibStartUtc(todayStr)},tgl_eksekusi.is.null)`)
      .eq("ulp", UNIT).order("tgl_inspeksi", { ascending: false }),

    supabaseAdmin.from("inspeksi_pohon").select("*")
      .or(`tgl_inspeksi.eq.${yStr},tgl_eksekusi.eq.${yStr},and(updated_at.gte.${wibStartUtc(yStr)},updated_at.lt.${wibStartUtc(todayStr)},tgl_eksekusi.is.null)`)
      .eq("ulp", UNIT).order("tgl_inspeksi", { ascending: false }),

    supabaseAdmin.from("inspeksi_pohon")
      .select("id,deskripsi,penyulang,lokasi,ulp,status,prediksi_inspektur,tgl_inspeksi,tgl_eksekusi,jenis_pohon,created_at,eksekutor,team_name,tingkat_risiko,petugas,inspektor,foto_sebelum_url,foto_lokasi_url,foto_sesudah_url,koordinat,tinggi_pohon,jarak_ke_jaringan,tindakan_rekomendasi")
      .neq("status", "Selesai").not("prediksi_inspektur", "is", null)
      .lte("prediksi_inspektur", todayStr).eq("ulp", UNIT)
      .order("prediksi_inspektur", { ascending: true }),

    supabaseAdmin.from("pengukuran_gardu")
      .select("id,petugas_nama,petugas_unit,tanggal_pengukuran,persen_beban,suhu_trafo,wo_sent_at,amg_sent_at")
      .gte("tanggal_pengukuran", monthStart).lte("tanggal_pengukuran", todayStr).eq("petugas_unit", UNIT),

    supabaseAdmin.from("inspeksi")
      .select("id,eksekutor,team_name,tgl_inspeksi,tgl_eksekusi,updated_at,status,ulp")
      .or(`tgl_inspeksi.gte.${monthStart},tgl_eksekusi.gte.${monthStart},and(updated_at.gte.${wibStartUtc(monthStart)},tgl_eksekusi.is.null)`)
      .eq("ulp", UNIT),

    supabaseAdmin.from("inspeksi_pohon")
      .select("id,eksekutor,team_name,tgl_inspeksi,tgl_eksekusi,updated_at,status,ulp")
      .or(`tgl_inspeksi.gte.${monthStart},tgl_eksekusi.gte.${monthStart},and(updated_at.gte.${wibStartUtc(monthStart)},tgl_eksekusi.is.null)`)
      .eq("ulp", UNIT),
  ]);

  // Gangguan
  const gangguanItems: GangguanItem[] = [];
  const byUlp: Record<string, number> = {};
  let gangguanBulan = 0;
  if (Array.isArray(gangguanRaw)) {
    const today = new Date();
    for (const row of gangguanRaw as Record<string, string>[]) {
      if (!row.TANGGAL) continue;
      const d = parseIndDate(row.TANGGAL);
      if (!d) continue;
      const rowUlp = (row.ULP ?? "").trim().toUpperCase();
      if (rowUlp !== UNIT) continue;
      if (d.getFullYear() === today.getFullYear() && d.getMonth() === today.getMonth()) gangguanBulan++;
      if (!isSameDay(d, yStr)) continue;
      const ulp = row.ULP ?? "-";
      byUlp[ulp] = (byUlp[ulp] ?? 0) + 1;
      gangguanItems.push({
        tanggal: row.TANGGAL, ulp,
        penyulang: row["PENYULANG GANGGUAN"] ?? row.PENYULANG_GANGGUAN ?? "-",
        jamPadam: row["JAM PADAM"] ?? row.JAM_PADAM ?? "-",
        durasi: row.DURASI ?? "-",
        penyebab: row["PENYEBAB GANGGUAN"] ?? row.PENYEBAB_GANGGUAN ?? "-",
      });
    }
  }

  // Pengukuran
  type PengRow = PengukuranGardu & { petugas_nama: string | null };
  type PengBulanRow = { petugas_nama: string | null; persen_beban: number; suhu_trafo: number; wo_sent_at: string | null; amg_sent_at: string | null };
  const pengRows = (pengResult.data ?? []) as PengRow[];
  const pengBulanRows = (pengBulanResult.data ?? []) as PengBulanRow[];
  const overload = pengRows.filter((r) => r.persen_beban >= OVERLOAD_PCT);
  const highTemp = pengRows.filter((r) => r.suhu_trafo > HIGH_TEMP_C);
  const woDone = pengRows.filter((r) => !!r.wo_sent_at);
  const amgDone = pengRows.filter((r) => !!r.amg_sent_at);

  // Inspeksi Jaringan
  type JRow = InspeksiJaringan & { updated_at?: string };
  const jarRows = (jarResult.data ?? []) as JRow[];
  const jarBulanRows = (jarBulanResult.data ?? []) as SlimInspeksi[];
  const newTemuan = jarRows.filter((r) => r.tgl_inspeksi === yStr);
  const selesaiJar = jarRows.filter((r) => isSelesaiKemarin(r.tgl_eksekusi, r.status, r.updated_at, yStr, todayStr));
  const newTemuanJarBulan = jarBulanRows.filter((r) => isWithinMonth(r.tgl_inspeksi, monthStart, todayStr)).length;
  const selesaiJarBulan = jarBulanRows.filter((r) => isSelesaiBulanIni(r.tgl_eksekusi, r.status, r.updated_at, monthStart, todayStr)).length;

  // Inspeksi Pohon
  type PRow = InspeksiPohon & { updated_at?: string };
  const pohRows = (pohResult.data ?? []) as PRow[];
  const pohBulanRows = (pohBulanResult.data ?? []) as SlimInspeksi[];
  const newTemuanPoh = pohRows.filter((r) => r.tgl_inspeksi === yStr);
  const selesaiPoh = pohRows.filter((r) => isSelesaiKemarin(r.tgl_eksekusi, r.status, r.updated_at, yStr, todayStr));
  const newTemuanPohBulan = pohBulanRows.filter((r) => isWithinMonth(r.tgl_inspeksi, monthStart, todayStr)).length;
  const selesaiPohBulan = pohBulanRows.filter((r) => isSelesaiBulanIni(r.tgl_eksekusi, r.status, r.updated_at, monthStart, todayStr)).length;

  const urgentRaw = (pohUrgentResult.data ?? []) as InspeksiPohon[];
  const sanggatUrgent = urgentRaw
    .map((r) => ({ ...r, remainingDays: calcRemainingDays(r.tgl_inspeksi ?? "", r.prediksi_inspektur ?? ""), urgency: getUrgencyLevel(calcRemainingDays(r.tgl_inspeksi ?? "", r.prediksi_inspektur ?? "")) }))
    .filter((r) => r.urgency === "SANGAT URGENT");

  const eksekutorRekap = buildEksekutorRekap(jarRows, pohRows, jarBulanRows, pohBulanRows, yStr, todayStr, monthStart);

  return {
    yesterday: yStr,
    yesterdayLabel: formatDateLabel(yStr),
    monthLabel: formatMonthLabel(todayStr),
    gangguan: { items: gangguanItems, total: gangguanItems.length, totalBulanIni: gangguanBulan, byUlp },
    pengukuran: {
      items: pengRows, total: pengRows.length, totalBulanIni: pengBulanRows.length,
      overload, highTemp, woDone, amgDone,
      overloadBulanIni: pengBulanRows.filter((r) => r.persen_beban >= OVERLOAD_PCT).length,
      highTempBulanIni: pengBulanRows.filter((r) => r.suhu_trafo > HIGH_TEMP_C).length,
      woDoneBulanIni: pengBulanRows.filter((r) => !!r.wo_sent_at).length,
      amgDoneBulanIni: pengBulanRows.filter((r) => !!r.amg_sent_at).length,
      petugasRekap: buildPetugasRekap(pengRows, pengBulanRows),
    },
    inspeksiJaringan: { newTemuan, selesai: selesaiJar, total: jarRows.length, newTemuanBulanIni: newTemuanJarBulan, selesaiBulanIni: selesaiJarBulan },
    inspeksiPohon: { newTemuan: newTemuanPoh, selesai: selesaiPoh, sanggatUrgent, total: pohRows.length, newTemuanBulanIni: newTemuanPohBulan, selesaiBulanIni: selesaiPohBulan },
    eksekusi: {
      byEksekutor: eksekutorRekap,
      totalJaringan: selesaiJar.length, totalPohon: selesaiPoh.length,
      totalJaringanBulanIni: selesaiJarBulan, totalPohonBulanIni: selesaiPohBulan,
    },
    realisasiProbis: { items: [], totalWO: 0, totalRealisasi: 0 },
  };
}

// ── Text formatter ────────────────────────────────────────────────────────────

function formatBriefText(data: MorningBriefData): string {
  const lines: string[] = [];
  lines.push(`☀️ *MORNING BRIEF — ${data.yesterdayLabel.toUpperCase()}*`);
  lines.push(`_${UNIT_LABEL}_`);
  lines.push("");

  const g = data.gangguan;
  lines.push(`🔴 *GANGGUAN PENYULANG*`);
  if (g.items.length === 0) {
    lines.push(`✅ Tidak ada gangguan kemarin`);
  } else {
    lines.push(`Kemarin: *${g.items.length} gangguan*`);
    for (const item of g.items) lines.push(`  • ${item.penyulang} — ${item.jamPadam}, ${item.penyebab}`);
  }
  lines.push(`Bulan ini: ${g.totalBulanIni} gangguan`);
  lines.push("");

  const p = data.pengukuran;
  lines.push(`⚡ *PENGUKURAN GARDU*`);
  lines.push(`Kemarin diukur: *${p.total} gardu*`);
  lines.push(`Overload ≥${OVERLOAD_PCT}%: *${p.overload.length}* (s/d kmrn: ${p.overloadBulanIni})`);
  lines.push(`Suhu >${HIGH_TEMP_C}°C: *${p.highTemp.length}* (s/d kmrn: ${p.highTempBulanIni})`);
  lines.push(`WO Dikirim: *${p.woDone.length}* (bulan ini: ${p.woDoneBulanIni})`);
  lines.push(`AMG di-Input: *${p.amgDone.length}* (bulan ini: ${p.amgDoneBulanIni})`);
  if (p.overload.length > 0) lines.push(`_Overload: ${p.overload.map((r) => `${r.no_gardu} ${r.persen_beban.toFixed(0)}%`).join(", ")}_`);
  lines.push("");

  const e = data.eksekusi;
  lines.push(`🔧 *REKAPITULASI PEKERJAAN*`);
  lines.push(`Kemarin: *${e.totalJaringan + e.totalPohon}* | Bulan ini: *${e.totalJaringanBulanIni + e.totalPohonBulanIni}*`);
  for (const tim of e.byEksekutor) {
    const kmrn = tim.jaringan + tim.pohon;
    const bulan = tim.jaringanBulanIni + tim.pohonBulanIni;
    if (bulan > 0 || kmrn > 0) lines.push(`  • ${tim.eksekutor}: bulan ini ${bulan}, kemarin ${kmrn}`);
  }
  lines.push("");

  const ij = data.inspeksiJaringan;
  lines.push(`🔍 *INSPEKSI JARINGAN*`);
  lines.push(`Temuan kemarin: *${ij.newTemuan.length}* | Selesai: *${ij.selesai.length}*`);
  lines.push(`Bulan ini: ${ij.newTemuanBulanIni} temuan | ${ij.selesaiBulanIni} selesai`);
  lines.push("");

  const ip = data.inspeksiPohon;
  lines.push(`🌳 *INSPEKSI POHON / RABAS*`);
  lines.push(`Temuan kemarin: *${ip.newTemuan.length}* | Selesai: *${ip.selesai.length}*`);
  lines.push(`Bulan ini: ${ip.newTemuanBulanIni} temuan | ${ip.selesaiBulanIni} selesai`);
  if (ip.sanggatUrgent.length > 0) lines.push(`⚠️ Sangat Urgent: *${ip.sanggatUrgent.length} pohon* perlu tindakan`);
  lines.push("");
  lines.push(`_Dibuat otomatis oleh SMART Mataram_`);

  return lines.join("\n");
}

// ── WA sender ─────────────────────────────────────────────────────────────────

async function sendWA(groupId: string, text: string) {
  const res = await fetch(`${process.env.WA_BOT_URL ?? "http://127.0.0.1:3001"}/send`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ groupId, message: text }),
  });
  if (!res.ok) throw new Error(`WA bot error: ${res.status}`);
}

// ── Route handler ─────────────────────────────────────────────────────────────

export async function GET(request: NextRequest) {
  const auth = request.headers.get("authorization");
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: scheduleSettings } = await supabaseAdmin
    .from("morning_brief_settings")
    .select("enabled")
    .eq("id", 1)
    .single();

  if (!scheduleSettings?.enabled) {
    return NextResponse.json({ ok: true, skipped: "disabled" });
  }

  const GROUP_ID = process.env.WA_GROUP_MORNING_BRIEF;
  if (!GROUP_ID) {
    return NextResponse.json({ error: "WA_GROUP_MORNING_BRIEF env var not set" }, { status: 500 });
  }

  try {
    const data = await fetchData();
    const text = formatBriefText(data);
    await sendWA(GROUP_ID, text);
    return NextResponse.json({ ok: true, date: data.yesterday });
  } catch (e) {
    console.error("Morning brief send error:", e);
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
