"use client";

import { useState, useEffect } from "react";
import { supabaseBrowser } from "@/lib/supabase-browser";
import { fetchSheetData } from "@/lib/sheets";
import { type CurrentUser, canSeeAllUnits, calcRemainingDays, getUrgencyLevel } from "@/lib/roles";
import { parseIndonesianDate } from "@/app/admin/dashboard/_hooks/useGangguanData";
import { OVERLOAD_PCT, HIGH_TEMP_C } from "@/app/admin/pengukuran-gardu/_hooks/usePengukuranGardu";
import type { PengukuranGardu } from "@/app/admin/pengukuran-gardu/_hooks/usePengukuranGardu";
import type { InspeksiJaringan } from "@/app/admin/monitoring-inspeksi/_hooks/useInspeksiJaringan";
import type { InspeksiPohon } from "@/app/admin/monitoring-inspeksi/_hooks/useInspeksiPohon";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface GangguanItem {
  tanggal: string;
  ulp: string;
  penyulang: string;
  jamPadam: string;
  durasi: string;
  penyebab: string;
}

export interface PetugasRekap {
  nama: string;
  jumlah: number;        // kemarin
  jumlahBulanIni: number;
}

export interface RealisasiTimDetail {
  jenisPekerjaan: string;
  wo: number;
  realisasi: number;
}

export interface RealisasiTimRow {
  tim: string;
  wo: number;
  realisasi: number;
  detail: RealisasiTimDetail[];
}

export const REALISASI_TIMS = [
  "HARJAR 1",
  "RABAS 1",
  "RABAS 2",
  "RABAS 3",
  "INSPEKSI JTM TIER 1",
  "INSPEKSI JTM TIER 2",
  "MUTASI TRAFO 1",
  "INSPEKSI GARDU 1",
  "INSPEKSI GARDU 2",
  "INSPEKSI JTR 1",
  "PENYEIMBANGAN 1",
  "HARGARDU 1",
  "PENGUKURAN GARDU 1",
] as const;

export interface EksekutorRekap {
  eksekutor: string;
  jaringan: number;
  pohon: number;
  jaringanBulanIni: number;
  pohonBulanIni: number;
}

export interface MorningBriefData {
  yesterday: string;
  yesterdayLabel: string;
  monthLabel: string;   // "Maret 2026"
  gangguan: {
    items: GangguanItem[];
    total: number;
    totalBulanIni: number;
    byUlp: Record<string, number>;
  };
  pengukuran: {
    items: PengukuranGardu[];
    total: number;
    totalBulanIni: number;
    overload: PengukuranGardu[];
    highTemp: PengukuranGardu[];
    woDone: PengukuranGardu[];
    amgDone: PengukuranGardu[];
    overloadBulanIni: number;
    highTempBulanIni: number;
    woDoneBulanIni: number;
    amgDoneBulanIni: number;
    petugasRekap: PetugasRekap[];
  };
  inspeksiJaringan: {
    newTemuan: InspeksiJaringan[];
    selesai: InspeksiJaringan[];
    total: number;
    newTemuanBulanIni: number;
    selesaiBulanIni: number;
  };
  inspeksiPohon: {
    newTemuan: InspeksiPohon[];
    selesai: InspeksiPohon[];
    sanggatUrgent: InspeksiPohon[];
    total: number;
    newTemuanBulanIni: number;
    selesaiBulanIni: number;
  };
  eksekusi: {
    byEksekutor: EksekutorRekap[];
    totalJaringan: number;
    totalPohon: number;
    totalJaringanBulanIni: number;
    totalPohonBulanIni: number;
  };
  realisasiProbis: {
    items: RealisasiTimRow[];
    totalWO: number;
    totalRealisasi: number;
  };
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const HARI: Record<number, string> = {
  0: "Minggu", 1: "Senin", 2: "Selasa", 3: "Rabu",
  4: "Kamis", 5: "Jumat", 6: "Sabtu",
};
const BULAN_NAMA: Record<number, string> = {
  0: "Januari", 1: "Februari", 2: "Maret", 3: "April",
  4: "Mei", 5: "Juni", 6: "Juli", 7: "Agustus",
  8: "September", 9: "Oktober", 10: "November", 11: "Desember",
};

// ── Timezone helpers (WIB = UTC+7) ───────────────────────────────────────────

// Get current date string in WIB (YYYY-MM-DD)
function getWibDateStr(offsetDays = 0): string {
  const now = new Date();
  // Shift to WIB by adding 7 hours
  const wib = new Date(now.getTime() + 7 * 60 * 60 * 1000 + offsetDays * 86400 * 1000);
  return wib.toISOString().slice(0, 10);
}

function getYesterdayStr(): string {
  return getWibDateStr(-1);
}

function getTodayStr(): string {
  return getWibDateStr(0);
}

function addDays(dateStr: string, days: number): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

// Convert WIB midnight of a YYYY-MM-DD date to UTC ISO string
// WIB midnight (00:00+07:00) = 17:00 UTC of the previous calendar day
function wibStartUtc(dateStr: string): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d, -7, 0, 0));
  return dt.toISOString().slice(0, 19) + "Z"; // "YYYY-MM-DDTHH:MM:SSZ"
}

function formatDateLabel(yStr: string): string {
  const [y, m, d] = yStr.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  return `${HARI[dt.getDay()]}, ${d} ${BULAN_NAMA[m - 1]} ${y}`;
}

function formatMonthLabel(todayStr: string): string {
  const [y, m] = todayStr.split("-").map(Number);
  return `${BULAN_NAMA[m - 1]} ${y}`;
}

function isSameDay(date: Date, yStr: string): boolean {
  const [y, m, d] = yStr.split("-").map(Number);
  return date.getFullYear() === y && date.getMonth() === m - 1 && date.getDate() === d;
}

function isWithinMonth(dateStr: string | undefined | null, monthStart: string, todayStr: string): boolean {
  if (!dateStr) return false;
  return dateStr >= monthStart && dateStr <= todayStr;
}

// Parse tanggal sheet format "01 April 2026" atau "01/04/2026" → "YYYY-MM-DD"
function parseTanggalSheet(str: string): string | null {
  const BULAN: Record<string, number> = {
    januari: 1, februari: 2, maret: 3, april: 4, mei: 5, juni: 6,
    juli: 7, agustus: 8, september: 9, oktober: 10, november: 11, desember: 12,
  };
  const parts = str.trim().split(" ");
  if (parts.length === 3) {
    const m = BULAN[parts[1].toLowerCase()];
    if (m) return `${parts[2]}-${String(m).padStart(2, "0")}-${parts[0].padStart(2, "0")}`;
  }
  const slash = str.trim().split("/");
  if (slash.length === 3)
    return `${slash[2]}-${slash[1].padStart(2, "0")}-${slash[0].padStart(2, "0")}`;
  return null;
}

// Status yang dianggap sebagai "pekerjaan dikerjakan"
const EKSEKUSI_STATUSES = ["Selesai", "Dalam Proses"];

function isSelesaiKemarin(
  tglEksekusi: string | null,
  status: string,
  updatedAt: string | undefined,
  yStr: string,
  todayStr: string
): boolean {
  if (tglEksekusi === yStr) return true;
  if (!tglEksekusi && updatedAt && EKSEKUSI_STATUSES.includes(status)) {
    const ms = new Date(updatedAt).getTime();
    return ms >= new Date(wibStartUtc(yStr)).getTime() && ms < new Date(wibStartUtc(todayStr)).getTime();
  }
  return false;
}

function isSelesaiBulanIni(
  tglEksekusi: string | null,
  status: string,
  updatedAt: string | undefined,
  monthStart: string,
  selectedStr: string,
): boolean {
  if (tglEksekusi && tglEksekusi >= monthStart && tglEksekusi <= selectedStr) return true;
  if (!tglEksekusi && updatedAt && EKSEKUSI_STATUSES.includes(status)) {
    const ms = new Date(updatedAt).getTime();
    const nextDay = addDays(selectedStr, 1);
    return ms >= new Date(wibStartUtc(monthStart)).getTime() && ms < new Date(wibStartUtc(nextDay)).getTime();
  }
  return false;
}

// ── Rekap builders ────────────────────────────────────────────────────────────

type SlimInspeksi = { eksekutor: string | null; team_name: string | null; tgl_inspeksi: string | null; tgl_eksekusi: string | null; updated_at?: string; status: string };

function buildEksekutorRekap(
  jaringanKemarin: SlimInspeksi[],
  pohonKemarin: SlimInspeksi[],
  jaringanBulan: SlimInspeksi[],
  pohonBulan: SlimInspeksi[],
  yStr: string,
  todayStr: string,
  monthStart: string
): EksekutorRekap[] {
  const map: Record<string, EksekutorRekap> = {};

  const add = (rows: SlimInspeksi[], type: "jaringan" | "pohon", isBulan: boolean) => {
    for (const r of rows) {
      const key = r.team_name ?? r.eksekutor ?? "Tidak Ditugaskan";
      if (!map[key]) map[key] = { eksekutor: key, jaringan: 0, pohon: 0, jaringanBulanIni: 0, pohonBulanIni: 0 };
      if (isBulan) {
        if (isSelesaiBulanIni(r.tgl_eksekusi, r.status, r.updated_at, monthStart, todayStr)) {
          if (type === "jaringan") map[key].jaringanBulanIni++;
          else map[key].pohonBulanIni++;
        }
      } else {
        if (isSelesaiKemarin(r.tgl_eksekusi, r.status, r.updated_at, yStr, todayStr)) {
          if (type === "jaringan") map[key].jaringan++;
          else map[key].pohon++;
        }
      }
    }
  };

  add(jaringanKemarin, "jaringan", false);
  add(pohonKemarin, "pohon", false);
  add(jaringanBulan, "jaringan", true);
  add(pohonBulan, "pohon", true);

  return Object.values(map).sort(
    (a, b) => (b.jaringanBulanIni + b.pohonBulanIni) - (a.jaringanBulanIni + a.pohonBulanIni)
  );
}

function buildPetugasRekap(
  kemarin: PengukuranGardu[],
  bulanIni: { petugas_nama: string | null }[]
): PetugasRekap[] {
  const mapKemarin: Record<string, number> = {};
  const mapBulan: Record<string, number> = {};

  for (const r of kemarin) {
    const nama = r.petugas_nama ?? "Tidak Diketahui";
    mapKemarin[nama] = (mapKemarin[nama] ?? 0) + 1;
  }
  for (const r of bulanIni) {
    const nama = r.petugas_nama ?? "Tidak Diketahui";
    mapBulan[nama] = (mapBulan[nama] ?? 0) + 1;
  }

  // Union of names from both
  const allNames = new Set([...Object.keys(mapKemarin), ...Object.keys(mapBulan)]);
  return Array.from(allNames)
    .map((nama) => ({
      nama,
      jumlah: mapKemarin[nama] ?? 0,
      jumlahBulanIni: mapBulan[nama] ?? 0,
    }))
    .sort((a, b) => b.jumlahBulanIni - a.jumlahBulanIni);
}

// ── Hook ─────────────────────────────────────────────────────────────────────

export function useMorningBrief(user: CurrentUser, filterUlp = "", selectedDate?: string) {
  const [data, setData] = useState<MorningBriefData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const isUp3 = canSeeAllUnits(user.role);
  const effectiveUnit = isUp3 ? filterUlp : (user.unit ?? "");

  useEffect(() => {
    let cancelled = false;

    async function fetchAll() {
      setLoading(true);
      setError(null);

      const yStr = selectedDate || getYesterdayStr();
      const nextDayStr = addDays(yStr, 1);
      const monthStart = yStr.slice(0, 7) + "-01";

      try {
        const [
          gangguanRaw,
          pengukuranResult,
          jaringanResult,
          pohonResult,
          pohonUrgentResult,
          pengukuranBulanResult,
          jaringanBulanResult,
          pohonBulanResult,
          realisasiRaw,
        ] = await Promise.all([
          // 1. Gangguan (Google Sheets — cached 5 min)
          fetchSheetData("gangguanPenyulang", "A:S"),

          // 2. Pengukuran Gardu kemarin
          (() => {
            let q = supabaseBrowser
              .from("pengukuran_gardu")
              .select("*")
              .eq("tanggal_pengukuran", yStr)
              .order("persen_beban", { ascending: false });
            if (effectiveUnit) q = q.eq("petugas_unit", effectiveUnit);
            return q;
          })(),

          // 3. Inspeksi Jaringan kemarin
          (() => {
            let q = supabaseBrowser
              .from("inspeksi")
              .select("id,category,deskripsi,temuan,status,lokasi,ulp,penyulang,inspektor,nama_inspektor,eksekutor,team_name,keterangan,tgl_inspeksi,tgl_eksekusi,created_at,updated_at")
              .or(
                `tgl_inspeksi.eq.${yStr},tgl_eksekusi.eq.${yStr},` +
                `and(updated_at.gte.${wibStartUtc(yStr)},updated_at.lt.${wibStartUtc(nextDayStr)},tgl_eksekusi.is.null)`
              )
              .order("tgl_inspeksi", { ascending: false });
            if (effectiveUnit) q = q.eq("ulp", effectiveUnit);
            return q;
          })(),

          // 4. Inspeksi Pohon kemarin
          (() => {
            let q = supabaseBrowser
              .from("inspeksi_pohon")
              .select("id,deskripsi,eksekutor,petugas,inspektor,team_name,keterangan,penyulang,lokasi,ulp,status,category,jenis_pohon,tinggi_pohon,jarak_ke_jaringan,tingkat_risiko,prediksi_inspektur,tindakan_rekomendasi,tgl_inspeksi,tgl_eksekusi,created_at,updated_at")
              .or(
                `tgl_inspeksi.eq.${yStr},tgl_eksekusi.eq.${yStr},` +
                `and(updated_at.gte.${wibStartUtc(yStr)},updated_at.lt.${wibStartUtc(nextDayStr)},tgl_eksekusi.is.null)`
              )
              .order("tgl_inspeksi", { ascending: false });
            if (effectiveUnit) q = q.eq("ulp", effectiveUnit);
            return q;
          })(),

          // 5. Pohon sangat urgent
          (() => {
            let q = supabaseBrowser
              .from("inspeksi_pohon")
              .select("id,deskripsi,penyulang,lokasi,ulp,status,prediksi_inspektur,tgl_inspeksi,tgl_eksekusi,jenis_pohon,created_at,eksekutor,team_name,tingkat_risiko,petugas,inspektor,foto_sebelum_url,foto_lokasi_url,foto_sesudah_url,koordinat,tinggi_pohon,jarak_ke_jaringan,tindakan_rekomendasi")
              .neq("status", "Selesai")
              .not("prediksi_inspektur", "is", null)
              .lte("prediksi_inspektur", yStr)
              .order("prediksi_inspektur", { ascending: true });
            if (effectiveUnit) q = q.eq("ulp", effectiveUnit);
            return q;
          })(),

          // 6. Pengukuran bulan ini — termasuk field untuk filter overload/suhu/wo/amg
          (() => {
            let q = supabaseBrowser
              .from("pengukuran_gardu")
              .select("id,petugas_nama,petugas_unit,tanggal_pengukuran,persen_beban,suhu_trafo,wo_sent_at,amg_sent_at")
              .gte("tanggal_pengukuran", monthStart)
              .lte("tanggal_pengukuran", yStr);
            if (effectiveUnit) q = q.eq("petugas_unit", effectiveUnit);
            return q;
          })(),

          // 7. Inspeksi Jaringan bulan ini — field ringan
          (() => {
            let q = supabaseBrowser
              .from("inspeksi")
              .select("id,eksekutor,team_name,tgl_inspeksi,tgl_eksekusi,updated_at,status,ulp")
              .or(
                `tgl_inspeksi.gte.${monthStart},tgl_eksekusi.gte.${monthStart},` +
                `and(updated_at.gte.${wibStartUtc(monthStart)},updated_at.lt.${wibStartUtc(nextDayStr)},tgl_eksekusi.is.null)`
              );
            if (effectiveUnit) q = q.eq("ulp", effectiveUnit);
            return q;
          })(),

          // 8. Inspeksi Pohon bulan ini — field ringan
          (() => {
            let q = supabaseBrowser
              .from("inspeksi_pohon")
              .select("id,eksekutor,team_name,tgl_inspeksi,tgl_eksekusi,updated_at,status,ulp")
              .or(
                `tgl_inspeksi.gte.${monthStart},tgl_eksekusi.gte.${monthStart},` +
                `and(updated_at.gte.${wibStartUtc(monthStart)},updated_at.lt.${wibStartUtc(nextDayStr)},tgl_eksekusi.is.null)`
              );
            if (effectiveUnit) q = q.eq("ulp", effectiveUnit);
            return q;
          })(),

          // 9. Realisasi Probis (Google Sheets)
          fetchSheetData("Realisasi Harian", "A:G"),
        ]);

        if (cancelled) return;

        // ── Process Gangguan ──────────────────────────────────────────────────
        const gangguanItems: GangguanItem[] = [];
        const byUlp: Record<string, number> = {};
        let gangguanBulanIni = 0;

        if (Array.isArray(gangguanRaw)) {
          for (const row of gangguanRaw as Record<string, string>[]) {
            if (!row.TANGGAL) continue;
            const d = parseIndonesianDate(row.TANGGAL);
            if (!d) continue;
            const rowUlp = (row.ULP ?? "").trim().toUpperCase();
            if (effectiveUnit && rowUlp !== effectiveUnit.toUpperCase()) continue;

            // Bulan ini
            const today = new Date();
            if (d.getFullYear() === today.getFullYear() && d.getMonth() === today.getMonth()) {
              gangguanBulanIni++;
            }

            // Kemarin
            if (!isSameDay(d, yStr)) continue;
            const ulp = row.ULP ?? "-";
            byUlp[ulp] = (byUlp[ulp] ?? 0) + 1;
            gangguanItems.push({
              tanggal: row.TANGGAL,
              ulp,
              penyulang: row["PENYULANG GANGGUAN"] ?? row.PENYULANG_GANGGUAN ?? "-",
              jamPadam: row["JAM PADAM"] ?? row.JAM_PADAM ?? "-",
              durasi: row.DURASI ?? "-",
              penyebab: row["PENYEBAB GANGGUAN"] ?? row.PENYEBAB_GANGGUAN ?? "-",
            });
          }
        }

        // ── Process Pengukuran ────────────────────────────────────────────────
        const pengRows = (pengukuranResult.data ?? []) as PengukuranGardu[];
        const overload = pengRows.filter((r) => r.persen_beban >= OVERLOAD_PCT);
        const highTemp = pengRows.filter((r) => r.suhu_trafo > HIGH_TEMP_C);
        const woDone = pengRows.filter((r) => !!r.wo_sent_at);
        const amgDone = pengRows.filter((r) => !!r.amg_sent_at);
        type PengBulanRow = { petugas_nama: string | null; persen_beban: number; suhu_trafo: number; wo_sent_at: string | null; amg_sent_at: string | null };
        const pengBulanRows = (pengukuranBulanResult.data ?? []) as PengBulanRow[];
        const overloadBulanIni = pengBulanRows.filter((r) => r.persen_beban >= OVERLOAD_PCT).length;
        const highTempBulanIni = pengBulanRows.filter((r) => r.suhu_trafo > HIGH_TEMP_C).length;
        const woDoneBulanIni = pengBulanRows.filter((r) => !!r.wo_sent_at).length;
        const amgDoneBulanIni = pengBulanRows.filter((r) => !!r.amg_sent_at).length;
        const petugasRekap = buildPetugasRekap(pengRows, pengBulanRows);

        // ── Process Inspeksi Jaringan ─────────────────────────────────────────
        type JaringanRow = InspeksiJaringan & { updated_at?: string };
        const jaringanRows = (jaringanResult.data ?? []) as JaringanRow[];
        const newTemuan = jaringanRows.filter((r) => r.tgl_inspeksi === yStr);
        const selesaiJaringan = jaringanRows.filter((r) =>
          isSelesaiKemarin(r.tgl_eksekusi, r.status, r.updated_at, yStr, nextDayStr)
        );

        const jaringanBulanRows = (jaringanBulanResult.data ?? []) as SlimInspeksi[];
        const newTemuanJaringanBulan = jaringanBulanRows.filter(
          (r) => r.tgl_inspeksi && isWithinMonth(r.tgl_inspeksi, monthStart, yStr)
        ).length;
        const selesaiJaringanBulan = jaringanBulanRows.filter((r) =>
          isSelesaiBulanIni(r.tgl_eksekusi, r.status, r.updated_at, monthStart, yStr)
        ).length;

        // ── Process Inspeksi Pohon ────────────────────────────────────────────
        type PohonRow = InspeksiPohon & { updated_at?: string };
        const pohonRows = (pohonResult.data ?? []) as PohonRow[];
        const newTemuanPohon = pohonRows.filter((r) => r.tgl_inspeksi === yStr);
        const selesaiPohon = pohonRows.filter((r) =>
          isSelesaiKemarin(r.tgl_eksekusi, r.status, r.updated_at, yStr, nextDayStr)
        );

        const pohonBulanRows = (pohonBulanResult.data ?? []) as SlimInspeksi[];
        const newTemuanPohonBulan = pohonBulanRows.filter(
          (r) => r.tgl_inspeksi && isWithinMonth(r.tgl_inspeksi, monthStart, yStr)
        ).length;
        const selesaiPohonBulan = pohonBulanRows.filter((r) =>
          isSelesaiBulanIni(r.tgl_eksekusi, r.status, r.updated_at, monthStart, yStr)
        ).length;

        // Sangat urgent
        const urgentRaw = (pohonUrgentResult.data ?? []) as InspeksiPohon[];
        const sanggatUrgent = urgentRaw
          .map((r) => ({
            ...r,
            remainingDays: calcRemainingDays(r.tgl_inspeksi ?? "", r.prediksi_inspektur ?? ""),
            urgency: getUrgencyLevel(
              calcRemainingDays(r.tgl_inspeksi ?? "", r.prediksi_inspektur ?? "")
            ),
          }))
          .filter((r) => r.urgency === "SANGAT URGENT");

        // ── Process Realisasi Probis ──────────────────────────────────────────
        const HAS_DETAIL_TIMS = new Set(["HARJAR 1", "RABAS 1", "RABAS 2", "RABAS 3"]);
        type TimAgg = { wo: number; realisasi: number; detail: Record<string, { wo: number; realisasi: number }> };
        const byTim: Record<string, TimAgg> = {};
        if (Array.isArray(realisasiRaw)) {
          for (const row of realisasiRaw as Record<string, string>[]) {
            const tgl = parseTanggalSheet(row["tanggal"] || row["Tanggal"] || "");
            if (tgl !== yStr) continue;
            const tim = (row["Tim Pelaksana"] || row["tim_pelaksana"] || "").trim();
            if (!tim) continue;
            if (!byTim[tim]) byTim[tim] = { wo: 0, realisasi: 0, detail: {} };
            const wo = parseInt(row["wo"] || row["WO"] || "0") || 0;
            const real = parseInt(row["realisasi"] || row["Realisasi"] || "0") || 0;
            byTim[tim].wo += wo;
            byTim[tim].realisasi += real;
            if (HAS_DETAIL_TIMS.has(tim)) {
              const jenis = (row["Jenis Pekerjaan"] || row["jenis_pekerjaan"] || row["JENIS PEKERJAAN"] || "").trim();
              if (jenis) {
                if (!byTim[tim].detail[jenis]) byTim[tim].detail[jenis] = { wo: 0, realisasi: 0 };
                byTim[tim].detail[jenis].wo += wo;
                byTim[tim].detail[jenis].realisasi += real;
              }
            }
          }
        }
        const realisasiItems: RealisasiTimRow[] = REALISASI_TIMS.map((tim) => ({
          tim,
          wo: byTim[tim]?.wo ?? 0,
          realisasi: byTim[tim]?.realisasi ?? 0,
          detail: Object.entries(byTim[tim]?.detail ?? {}).map(([jenisPekerjaan, v]) => ({
            jenisPekerjaan,
            wo: v.wo,
            realisasi: v.realisasi,
          })),
        }));
        const totalWO = realisasiItems.reduce((s, r) => s + r.wo, 0);
        const totalRealisasi = realisasiItems.reduce((s, r) => s + r.realisasi, 0);

        // ── Eksekusi rekap ────────────────────────────────────────────────────
        const eksekutorRekap = buildEksekutorRekap(
          jaringanRows, pohonRows,
          jaringanBulanRows, pohonBulanRows,
          yStr, nextDayStr, monthStart
        );

        setData({
          yesterday: yStr,
          yesterdayLabel: formatDateLabel(yStr),
          monthLabel: formatMonthLabel(yStr),
          gangguan: {
            items: gangguanItems,
            total: gangguanItems.length,
            totalBulanIni: gangguanBulanIni,
            byUlp,
          },
          pengukuran: {
            items: pengRows,
            total: pengRows.length,
            totalBulanIni: pengBulanRows.length,
            overload,
            highTemp,
            woDone,
            amgDone,
            overloadBulanIni,
            highTempBulanIni,
            woDoneBulanIni,
            amgDoneBulanIni,
            petugasRekap,
          },
          inspeksiJaringan: {
            newTemuan,
            selesai: selesaiJaringan,
            total: jaringanRows.length,
            newTemuanBulanIni: newTemuanJaringanBulan,
            selesaiBulanIni: selesaiJaringanBulan,
          },
          inspeksiPohon: {
            newTemuan: newTemuanPohon,
            selesai: selesaiPohon,
            sanggatUrgent,
            total: pohonRows.length,
            newTemuanBulanIni: newTemuanPohonBulan,
            selesaiBulanIni: selesaiPohonBulan,
          },
          eksekusi: {
            byEksekutor: eksekutorRekap,
            totalJaringan: selesaiJaringan.length,
            totalPohon: selesaiPohon.length,
            totalJaringanBulanIni: selesaiJaringanBulan,
            totalPohonBulanIni: selesaiPohonBulan,
          },
          realisasiProbis: { items: realisasiItems, totalWO, totalRealisasi },
        });
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "Gagal memuat data morning brief");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    fetchAll();
    return () => { cancelled = true; };
  }, [user.role, user.unit, effectiveUnit, selectedDate]);

  return { data, loading, error };
}
