"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import { fetchSheetData } from "@/lib/sheets";
import { supabaseBrowser } from "@/lib/supabase-browser";
import { categorizePenyebab } from "@/lib/gangguanCategories";

// ── Helpers ───────────────────────────────────────────────────────────────────

const MONTH_MAP: Record<string, number> = {
  Januari: 0, Februari: 1, Maret: 2, April: 3, Mei: 4, Juni: 5,
  Juli: 6, Agustus: 7, September: 8, Oktober: 9, November: 10, Desember: 11,
};

function parseDateStr(s: string | undefined): Date | null {
  if (!s) return null;
  const parts = s.toString().trim().split(" ");
  if (parts.length !== 3) return null;
  const day   = parseInt(parts[0]);
  const month = MONTH_MAP[parts[1]];
  const year  = parseInt(parts[2]);
  if (isNaN(day) || month === undefined || isNaN(year)) return null;
  return new Date(year, month, day, 12, 0, 0);
}

function daysBetween(a: string, b: string): number {
  return Math.max(
    1,
    Math.floor(
      (new Date(b + "T12:00:00").getTime() - new Date(a + "T12:00:00").getTime()) /
        86400000,
    ),
  );
}

function median(arr: number[]): number {
  if (!arr.length) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  const mid    = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

// ── Types ─────────────────────────────────────────────────────────────────────

export type Trend = "turun" | "naik" | "stabil" | "none";
export type Pola  = "proaktif" | "reaktif";

export interface GangguanEvent {
  date: string;             // YYYY-MM-DD
  keypoint: string | null;  // PENYULANG_GANGGUAN untuk display
  penyebab: string | null;
}

export interface InspeksiDetail {
  tgl_inspeksi: string;           // YYYY-MM-DD
  tgl_eksekusi: string | null;
  status: string;
  type: "jaringan" | "pohon";
  gh: string;                     // nama GH keypoint (inspeksi.penyulang)
  category: string | null;
  pola: Pola;
  lastGangguan: string | null;
  nextGangguan: string | null;
  daysSinceLastGangguan: number | null;
  daysToNextGangguan: number | null;
}

export interface GhChild {
  name: string;
  inspeksiList: InspeksiDetail[];
  total: number;
  selesai: number;
  eksekusiRate: number;
}

export interface PenyulangEffectiveness {
  penyulang: string;        // GI/PLTD name
  ulp: string;
  gangguanCount: number;
  gangguanBefore: number;
  gangguanAfter: number;
  firstSelesai: string | null;
  inspeksiTotal: number;
  eksekusiSelesai: number;
  eksekusiRate: number;
  lastInspeksi: string | null;
  group: "A" | "B" | "C";
  trend: Trend;
  proaktifCount: number;
  reaktifCount: number;
  gangguanEvents: GangguanEvent[];
  inspeksiList: InspeksiDetail[];  // flat — semua GH anak, untuk swimlane
  ghChildren: GhChild[];           // breakdown per GH
  ligaExekusiDates: string[];      // tanggal eksekusi LIGA (YYYY-MM-DD)
}

export interface EffectivenessData {
  byPenyulang: PenyulangEffectiveness[];
  groupA: { count: number; avgGangguan: number };
  groupB: { count: number; avgGangguan: number };
  groupC: { count: number; avgGangguan: number };
  totalPenyulang: number;
  totalGangguan: number;
  reinspectionNeeded: PenyulangEffectiveness[];
  medianGangguan: number;
}

interface RawInspeksiRow {
  penyulang: string | null;
  ulp: string | null;
  status: string | null;
  tgl_inspeksi: string | null;
  tgl_eksekusi: string | null;
  updated_at: string | null;
  category: string | null;
}

interface InspeksiRow extends RawInspeksiRow {
  type: "jaringan" | "pohon";
}

export interface Options {
  startDate: Date;
  endDate: Date;
  selectedULP: string;
}

function computeGroupStats(items: PenyulangEffectiveness[], group: "A" | "B" | "C") {
  const filtered = items.filter((p) => p.group === group);
  const avg =
    filtered.length > 0
      ? filtered.reduce((s, p) => s + p.gangguanCount, 0) / filtered.length
      : 0;
  return { count: filtered.length, avgGangguan: parseFloat(avg.toFixed(1)) };
}

// ── Hook ─────────────────────────────────────────────────────────────────────

export function useInspeksiEffectiveness({ startDate, endDate, selectedULP }: Options) {
  const [keypointRows, setKeypointRows] = useState<Record<string, string>[]>([]);
  const [gangguanRows, setGangguanRows] = useState<Record<string, string>[]>([]);
  const [inspeksiRows, setInspeksiRows] = useState<InspeksiRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState<string | null>(null);
  const [rev, setRev]         = useState(0);

  const refresh = useCallback(() => setRev((r) => r + 1), []);

  useEffect(() => {
    const start = startDate.toISOString().split("T")[0];
    const end   = endDate.toISOString().split("T")[0];

    const fetchAll = async () => {
      setLoading(true);
      setError(null);
      try {
        let q1 = supabaseBrowser
          .from("inspeksi")
          .select("penyulang, ulp, status, tgl_inspeksi, tgl_eksekusi, updated_at, category")
          .gte("tgl_inspeksi", start)
          .lte("tgl_inspeksi", end);
        let q2 = supabaseBrowser
          .from("inspeksi_pohon")
          .select("penyulang, ulp, status, tgl_inspeksi, tgl_eksekusi, updated_at, category")
          .gte("tgl_inspeksi", start)
          .lte("tgl_inspeksi", end);

        if (selectedULP !== "ALL") {
          q1 = q1.eq("ulp", selectedULP);
          q2 = q2.eq("ulp", selectedULP);
        }

        const [keypoint, gangguan, res1, res2] = await Promise.all([
          fetchSheetData("KEYPOINT", "A:Z"),
          fetchSheetData("gangguanPenyulang", "A:Z"),
          q1,
          q2,
        ]);

        setKeypointRows(keypoint);
        setGangguanRows(gangguan);
        setInspeksiRows([
          ...((res1.data ?? []) as RawInspeksiRow[]).map((r) => ({ ...r, type: "jaringan" as const })),
          ...((res2.data ?? []) as RawInspeksiRow[]).map((r) => ({ ...r, type: "pohon"    as const })),
        ]);
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        setLoading(false);
      }
    };
    fetchAll();
  }, [startDate, endDate, selectedULP, rev]);

  const data = useMemo((): EffectivenessData | null => {
    if (!keypointRows.length) return null;

    // ── 1. Base list (GI/PLTD) + mapping GH/RECLOSER → parent GI ─────────────
    // GI/PLTD = unit analisis, GH/RECLOSER = child yang di-inspeksi
    // Kolom PENYULANG di KEYPOINT sheet = nama parent GI untuk setiap GH/RECLOSER
    const baseMap: Record<string, { ulp: string }> = {};
    const ghParentMap: Record<string, string> = {};   // GH name → parent GI name

    keypointRows.forEach((row) => {
      const fasilitas = (row["FASILITAS PADAM"] ?? "").trim().toUpperCase();
      const keypoint  = (row.KEYPOINT ?? "").trim();
      const ulp       = (row.ULP ?? row.PUL ?? "").trim().toUpperCase();
      const penyulang = (row.PENYULANG ?? "").trim(); // parent GI untuk GH/RECLOSER

      if (!keypoint || !fasilitas) return;
      if (selectedULP !== "ALL" && ulp !== selectedULP) return;

      if (fasilitas === "GI/PLTD") {
        if (!baseMap[keypoint]) baseMap[keypoint] = { ulp };
      } else if (fasilitas === "GH" || fasilitas === "RECLOSER") {
        // Map GH/RECLOSER → parent GI
        if (penyulang) ghParentMap[keypoint] = penyulang;
      }
    });

    if (!Object.keys(baseMap).length) return null;

    // ── 2. Gangguan by PENYULANG (GI level) ──────────────────────────────────
    const gangguanMap: Record<string, { events: GangguanEvent[] }> = {};
    gangguanRows.forEach((row) => {
      if (selectedULP !== "ALL" && (row.ULP ?? "").trim().toUpperCase() !== selectedULP) return;
      const d = parseDateStr(row.TANGGAL);
      if (!d || d < startDate || d > endDate) return;
      // PENYULANG = GI/PLTD level
      const feeder = (row.PENYULANG ?? "").trim();
      if (!feeder || !baseMap[feeder]) return;
      const dateStr  = d.toISOString().split("T")[0];
      const keypoint = (row.PENYULANG_GANGGUAN ?? "").trim() || null;
      const rawPb    = (row.PENYEBAB_GANGGUAN || row["PENYEBAB GANGGUAN"] || "").trim();
      const penyebab = rawPb ? categorizePenyebab(rawPb) : null;
      if (!gangguanMap[feeder]) gangguanMap[feeder] = { events: [] };
      gangguanMap[feeder].events.push({ date: dateStr, keypoint, penyebab });
    });

    // ── 3. Inspeksi: GH → parent GI ──────────────────────────────────────────
    type RawRec = Omit<InspeksiDetail, "pola" | "lastGangguan" | "nextGangguan" | "daysSinceLastGangguan" | "daysToNextGangguan">;
    const inspeksiMap: Record<string, {
      total: number;
      selesai: number;
      lastDate: string | null;
      firstSelesai: string | null;
      records: RawRec[];
    }> = {};

    inspeksiRows.forEach((row) => {
      const gh = (row.penyulang ?? "").trim();
      if (!gh) return;
      // Cari parent GI — bisa dari ghParentMap, atau jika gh sendiri adalah GI
      const gi = ghParentMap[gh] ?? (baseMap[gh] ? gh : null);
      if (!gi || !baseMap[gi]) return;

      if (!inspeksiMap[gi])
        inspeksiMap[gi] = { total: 0, selesai: 0, lastDate: null, firstSelesai: null, records: [] };

      const tglInspeksi = (row.tgl_inspeksi ?? "").split("T")[0];
      const status      = row.status ?? "";
      const rawEksekusi = row.tgl_eksekusi ?? (status === "Selesai" ? (row.updated_at ?? null) : null);
      const tglEksekusi = rawEksekusi ? rawEksekusi.split("T")[0] : null;

      inspeksiMap[gi].total++;
      inspeksiMap[gi].records.push({ tgl_inspeksi: tglInspeksi, tgl_eksekusi: tglEksekusi, status, type: row.type, gh, category: row.category ?? null });

      if (status === "Selesai") {
        inspeksiMap[gi].selesai++;
        const completedAt = tglEksekusi ?? tglInspeksi;
        if (completedAt && (!inspeksiMap[gi].firstSelesai || completedAt < inspeksiMap[gi].firstSelesai!)) {
          inspeksiMap[gi].firstSelesai = completedAt;
        }
      }
      if (tglInspeksi && (!inspeksiMap[gi].lastDate || tglInspeksi > inspeksiMap[gi].lastDate!)) {
        inspeksiMap[gi].lastDate = tglInspeksi;
      }
    });

    // ── 4. Build per-GI result ────────────────────────────────────────────────
    const today        = new Date();
    const todayStr     = today.toISOString().split("T")[0];
    const startStr     = startDate.toISOString().split("T")[0];
    const endStr       = endDate.toISOString().split("T")[0];
    const effectiveEnd = endStr < todayStr ? endStr : todayStr;
    const sixMonthsAgo = new Date(today.getFullYear(), today.getMonth() - 6, today.getDate())
      .toISOString().split("T")[0];

    const byPenyulang: PenyulangEffectiveness[] = Object.entries(baseMap).map(([gi, base]) => {
      const g   = gangguanMap[gi];
      const ins = inspeksiMap[gi];

      const sortedEvents    = (g?.events ?? []).slice().sort((a, b) => a.date.localeCompare(b.date));
      const sortedDates     = sortedEvents.map((e) => e.date);
      const gangguanCount   = sortedDates.length;
      const inspeksiTotal   = ins?.total ?? 0;
      const eksekusiSelesai = ins?.selesai ?? 0;
      const eksekusiRate    = inspeksiTotal > 0 ? (eksekusiSelesai / inspeksiTotal) * 100 : 0;
      const lastInspeksi    = ins?.lastDate ?? null;
      const firstSelesai    = ins?.firstSelesai ?? null;
      const group: "A" | "B" | "C" =
        inspeksiTotal === 0 ? "C" : eksekusiRate >= 80 ? "A" : "B";

      // ── Trend ────────────────────────────────────────────────────────────
      let gangguanBefore = 0;
      let gangguanAfter  = 0;
      let trend: Trend   = "none";

      if (firstSelesai && gangguanCount > 0) {
        gangguanBefore = sortedDates.filter((d) => d < firstSelesai).length;
        gangguanAfter  = sortedDates.filter((d) => d >= firstSelesai).length;
        const daysBefore = daysBetween(startStr, firstSelesai);
        const daysAfter  = daysBetween(firstSelesai, effectiveEnd);
        if (daysAfter >= 7) {
          const rateBefore = gangguanBefore / daysBefore;
          const rateAfter  = gangguanAfter  / daysAfter;
          if (rateBefore === 0 && rateAfter === 0) trend = "stabil";
          else if (rateAfter < rateBefore * 0.85)  trend = "turun";
          else if (rateAfter > rateBefore * 1.15)  trend = "naik";
          else                                      trend = "stabil";
        }
      } else if (firstSelesai && gangguanCount === 0) {
        trend = "turun";
      }

      // ── Klasifikasi pola per inspeksi ─────────────────────────────────────
      const inspeksiList: InspeksiDetail[] = (ins?.records ?? [])
        .slice()
        .sort((a, b) => a.tgl_inspeksi.localeCompare(b.tgl_inspeksi))
        .map((rec) => {
          const d               = rec.tgl_inspeksi;
          const gangguanSebelum = sortedDates.filter((gd) => gd < d);
          const lastGangguan    = gangguanSebelum.at(-1) ?? null;
          const pola: Pola      = gangguanSebelum.length > 0 ? "reaktif" : "proaktif";
          const nextGangguan    = sortedDates.find((gd) => gd > d) ?? null;
          return {
            ...rec,
            pola,
            lastGangguan,
            nextGangguan,
            daysSinceLastGangguan: lastGangguan ? daysBetween(lastGangguan, d) : null,
            daysToNextGangguan:    nextGangguan ? daysBetween(d, nextGangguan) : null,
          };
        });

      // Tanggal eksekusi LIGA: tgl_eksekusi jika ada, fallback ke updated_at
      const ligaExekusiDates = [
        ...new Set(
          inspeksiList
            .filter((r) => r.category === "LIGA" && r.tgl_eksekusi)
            .map((r) => r.tgl_eksekusi!)
        ),
      ].sort();

      // ── GH breakdown ──────────────────────────────────────────────────────
      const ghMap: Record<string, InspeksiDetail[]> = {};
      inspeksiList.forEach((ins) => {
        if (!ghMap[ins.gh]) ghMap[ins.gh] = [];
        ghMap[ins.gh].push(ins);
      });
      const ghChildren: GhChild[] = Object.entries(ghMap)
        .map(([name, list]) => ({
          name,
          inspeksiList: list,
          total: list.length,
          selesai: list.filter((i) => i.status === "Selesai").length,
          eksekusiRate: list.length > 0
            ? (list.filter((i) => i.status === "Selesai").length / list.length) * 100
            : 0,
        }))
        .sort((a, b) => a.name.localeCompare(b.name));

      const proaktifCount = inspeksiList.filter((i) => i.pola === "proaktif").length;
      const reaktifCount  = inspeksiList.filter((i) => i.pola === "reaktif").length;

      return {
        penyulang: gi,
        ulp: base.ulp,
        gangguanCount,
        gangguanBefore,
        gangguanAfter,
        firstSelesai,
        inspeksiTotal,
        eksekusiSelesai,
        eksekusiRate,
        lastInspeksi,
        group,
        trend,
        proaktifCount,
        reaktifCount,
        gangguanEvents: sortedEvents,
        inspeksiList,
        ghChildren,
        ligaExekusiDates,
      };
    });

    const medianGangguan = median(byPenyulang.map((p) => p.gangguanCount));
    const totalGangguan  = byPenyulang.reduce((s, p) => s + p.gangguanCount, 0);

    const reinspectionNeeded = byPenyulang
      .filter(
        (p) =>
          p.gangguanCount > medianGangguan &&
          (p.lastInspeksi === null || p.lastInspeksi < sixMonthsAgo),
      )
      .sort((a, b) => b.gangguanCount - a.gangguanCount)
      .slice(0, 10);

    return {
      byPenyulang,
      groupA: computeGroupStats(byPenyulang, "A"),
      groupB: computeGroupStats(byPenyulang, "B"),
      groupC: computeGroupStats(byPenyulang, "C"),
      totalPenyulang: byPenyulang.length,
      totalGangguan,
      reinspectionNeeded,
      medianGangguan,
    };
  }, [keypointRows, gangguanRows, inspeksiRows, startDate, endDate, selectedULP]);

  return { data, loading, error, refresh };
}
