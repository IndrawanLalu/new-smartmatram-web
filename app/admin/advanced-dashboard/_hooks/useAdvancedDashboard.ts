"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { fetchSheetData } from "@/lib/sheets";
import { categorizePenyebab } from "@/lib/gangguanCategories";

type Row = Record<string, string>;

const ULP_LIST = ["AMPENAN", "CAKRANEGARA", "GERUNG", "TANJUNG"];

const DAY_SHORT  = ["Min", "Sen", "Sel", "Rab", "Kam", "Jum", "Sab"];
const MONTH_SHORT = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];

function fmtEventDate(dateStr: string): string {
  const d = new Date(dateStr + "T12:00:00");
  return `${DAY_SHORT[d.getDay()]}, ${d.getDate()} ${MONTH_SHORT[d.getMonth()]} ${d.getFullYear()}`;
}

function fmtWindowLabel(start: string, end: string): string {
  const s = new Date(start + "T12:00:00");
  const e = new Date(end + "T12:00:00");
  if (s.getMonth() === e.getMonth() && s.getFullYear() === e.getFullYear())
    return `${s.getDate()}–${e.getDate()} ${MONTH_SHORT[s.getMonth()]} ${s.getFullYear()}`;
  return `${s.getDate()} ${MONTH_SHORT[s.getMonth()]} – ${e.getDate()} ${MONTH_SHORT[e.getMonth()]} ${e.getFullYear()}`;
}

export interface ParetoItem {
  penyulang: string;
  ulp: string;
  count: number;
  cumPct: number;
}

export interface MatrixPoint {
  penyulang: string;
  ulp: string;
  freq: number;
  avgDurMin: number;
  quadrant: "critical" | "frequent" | "long" | "safe";
}

export interface TrendPoint {
  date: string;
  label: string;
  count: number;
  ma7: number;
}

export interface HeatmapRow {
  penyebab: string;
  total: number;
  byUlp: Record<string, number>;
}

export interface MtbfItem {
  penyulang: string;
  ulp: string;
  count: number;
  mtbfDays: number;
  lastGangguan: string;
}

export interface RecurrenceEvent {
  date: string;
  dateLabel: string;
  kategori: string;
}

export interface RecurrenceItem {
  penyulang: string;
  ulp: string;
  count: number;
  maxIn7Days: number;
  worstWindowLabel: string;
  worstWindowEvents: RecurrenceEvent[];
}

export interface UlpRadarPoint {
  ulp: string;
  bebanGangguan: number;
  pemulihanCepat: number;
  durasiPendek: number;
  penyebabDikenal: number;
  bebasUlang: number;
}

export interface MonthKategoriRow {
  kategori: string;
  total: number;
  byMonth: Record<string, number>;
}

export interface PenyulangStatForSaidi {
  penyulang: string;
  ulp: string;
  freq: number;
  totalDurMin: number;
}

export interface ComputedData {
  isEmpty: boolean;
  filtered: Row[];
  paretoItems: ParetoItem[];
  matrixPoints: MatrixPoint[];
  medFreq: number;
  medDur: number;
  trendPoints: TrendPoint[];
  heatmapRows: HeatmapRow[];
  ulpsInData: string[];
  mtbfItems: MtbfItem[];
  totalDays: number;
  recurrenceItems: RecurrenceItem[];
  totalGangguan: number;
  totalPenyulang: number;
  avgDurMin: number;
  quickRecoveryPct: number;
  ulpRadarData: UlpRadarPoint[];
  monthKategoriRows: MonthKategoriRow[];
  monthsInData: string[];
  penyulangStats: PenyulangStatForSaidi[];
}

interface Options {
  startDate: Date;
  endDate: Date;
  selectedULP: string;
}

const MONTH_MAP: Record<string, number> = {
  Januari: 0,
  Februari: 1,
  Maret: 2,
  April: 3,
  Mei: 4,
  Juni: 5,
  Juli: 6,
  Agustus: 7,
  September: 8,
  Oktober: 9,
  November: 10,
  Desember: 11,
};

function toSecs(t: string | undefined): number {
  if (!t) return 0;
  try {
    const s = t.includes(".") ? t.split(".")[0] : t;
    const p = s.split(":").map((n) => parseInt(n) || 0);
    if (p.length === 3) return p[0] * 3600 + p[1] * 60 + p[2];
    if (p.length === 2) return p[0] * 60 + p[1];
    return p[0] ?? 0;
  } catch {
    return 0;
  }
}

function parseDateStr(s: string | undefined): Date | null {
  if (!s) return null;
  const parts = s.toString().trim().split(" ");
  if (parts.length !== 3) return null;
  const day = parseInt(parts[0]);
  const month = MONTH_MAP[parts[1]];
  const year = parseInt(parts[2]);
  if (isNaN(day) || month === undefined || isNaN(year)) return null;
  return new Date(year, month, day, 12, 0, 0);
}

function normArr(arr: number[], invert: boolean): number[] {
  if (!arr.length) return [];
  const mn = Math.min(...arr), mx = Math.max(...arr);
  if (mx === mn) return arr.map(() => 50);
  return arr.map((v) =>
    Math.round(invert ? 100 - ((v - mn) / (mx - mn)) * 100 : ((v - mn) / (mx - mn)) * 100),
  );
}

function median(arr: number[]): number {
  if (!arr.length) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

export function useAdvancedDashboard({
  startDate,
  endDate,
  selectedULP,
}: Options) {
  const [rawData, setRawData] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await fetchSheetData("gangguanPenyulang", "A:S");
      if (!Array.isArray(data)) throw new Error("Data tidak valid");
      setRawData(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const computed = useMemo((): ComputedData | null => {
    if (!rawData.length) return null;

    const firstRow = rawData[0];
    const isHeader = firstRow?.TANGGAL?.toLowerCase().includes("tanggal");
    const dataRows = isHeader ? rawData.slice(1) : rawData;

    const filtered = dataRows.filter((row) => {
      if (!row || typeof row !== "object") return false;
      if (selectedULP !== "ALL") {
        if (row.ULP?.trim().toUpperCase() !== selectedULP) return false;
      }
      const d = parseDateStr(row.TANGGAL);
      return d && d >= startDate && d <= endDate;
    });

    if (!filtered.length)
      return {
        isEmpty: true,
        filtered,
        paretoItems: [],
        matrixPoints: [],
        medFreq: 0,
        medDur: 0,
        trendPoints: [],
        heatmapRows: [],
        ulpsInData: [],
        mtbfItems: [],
        totalDays: 1,
        recurrenceItems: [],
        totalGangguan: 0,
        totalPenyulang: 0,
        avgDurMin: 0,
        quickRecoveryPct: 0,
        ulpRadarData: [],
        monthKategoriRows: [],
        monthsInData: [],
        penyulangStats: [],
      };

    // ── Per-penyulang accumulator ─────────────────────────────────────────────
    type ULPAcc = { count: number; totalDur: number; durCount: number; quick: number; knownCat: number; penyulangKeys: Record<string, true> };
    const ulpAccMap: Record<string, ULPAcc> = {};
    const monthKatAcc: Record<string, Record<string, number>> = {};

    type PEvent = { date: string; rawPenyebab: string };
    type PStat = {
      ulp: string;
      count: number;
      totalDur: number;
      durCount: number;
      quick: number;
      lastDate: string;
      allEvents: PEvent[];
    };
    const pStats: Record<string, PStat> = {};
    const dailyTrend: Record<string, number> = {};
    let totalDurAll = 0, durCountAll = 0, quickAll = 0;

    filtered.forEach((row) => {
      const p = row.PENYULANG_GANGGUAN?.trim();
      const ulp = row.ULP?.trim().toUpperCase() ?? "";
      if (!p) return;
      if (!pStats[p])
        pStats[p] = { ulp, count: 0, totalDur: 0, durCount: 0, quick: 0, lastDate: "", allEvents: [] };
      pStats[p].count++;
      const dur = toSecs(row.DURASI);
      if (dur > 0) {
        pStats[p].totalDur += dur;
        pStats[p].durCount++;
        totalDurAll += dur;
        durCountAll++;
        if (dur <= 300) { pStats[p].quick++; quickAll++; }
      }
      const rawPb = (row.PENYEBAB_GANGGUAN || row["PENYEBAB GANGGUAN"] || "").trim();
      const kat = categorizePenyebab(rawPb);

      // ULP accumulation
      if (!ulpAccMap[ulp]) ulpAccMap[ulp] = { count: 0, totalDur: 0, durCount: 0, quick: 0, knownCat: 0, penyulangKeys: {} };
      ulpAccMap[ulp].count++;
      ulpAccMap[ulp].penyulangKeys[p] = true;
      if (dur > 0) { ulpAccMap[ulp].totalDur += dur; ulpAccMap[ulp].durCount++; }
      if (dur > 0 && dur <= 300) ulpAccMap[ulp].quick++;
      if (kat !== "Belum Ditemukan") ulpAccMap[ulp].knownCat++;

      const d = parseDateStr(row.TANGGAL);
      if (d) {
        const key = d.toISOString().split("T")[0];
        if (!pStats[p].lastDate || key > pStats[p].lastDate) pStats[p].lastDate = key;
        pStats[p].allEvents.push({ date: key, rawPenyebab: rawPb });
        dailyTrend[key] = (dailyTrend[key] || 0) + 1;

        // Month × Kategori accumulation
        const mk = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
        if (!monthKatAcc[kat]) monthKatAcc[kat] = {};
        monthKatAcc[kat][mk] = (monthKatAcc[kat][mk] || 0) + 1;
      }
    });

    // ── Pareto ──────────────────────────────────────────────────────────────
    const sorted = Object.entries(pStats)
      .sort((a, b) => b[1].count - a[1].count)
      .slice(0, 20);
    const paretoTotal = sorted.reduce((s, [, v]) => s + v.count, 0);
    let cum = 0;
    const paretoItems: ParetoItem[] = sorted.map(([p, s]) => {
      cum += s.count;
      return {
        penyulang: p,
        ulp: s.ulp,
        count: s.count,
        cumPct: parseFloat(((cum / paretoTotal) * 100).toFixed(1)),
      };
    });

    // ── Priority Matrix ──────────────────────────────────────────────────────
    const freqArr = Object.values(pStats).map((s) => s.count);
    const durArr = Object.values(pStats).map((s) =>
      s.durCount > 0 ? s.totalDur / s.durCount / 60 : 0,
    );
    const medFreq = median(freqArr);
    const medDur = median(durArr);

    const matrixPoints: MatrixPoint[] = Object.entries(pStats).map(([p, s]) => {
      const freq = s.count;
      const avgDurMin =
        s.durCount > 0
          ? parseFloat((s.totalDur / s.durCount / 60).toFixed(1))
          : 0;
      const quadrant: MatrixPoint["quadrant"] =
        freq >= medFreq && avgDurMin >= medDur
          ? "critical"
          : freq >= medFreq
            ? "frequent"
            : avgDurMin >= medDur
              ? "long"
              : "safe";
      return { penyulang: p, ulp: s.ulp, freq, avgDurMin, quadrant };
    });

    // ── Trend with 7-day MA ──────────────────────────────────────────────────
    const todayStr = new Date().toISOString().split("T")[0];
    const rEnd =
      endDate.toISOString().split("T")[0] > todayStr
        ? todayStr
        : endDate.toISOString().split("T")[0];
    const rStart = startDate.toISOString().split("T")[0];
    const trendPoints: TrendPoint[] = [];
    const cur = new Date(rStart + "T12:00:00");
    const endD = new Date(rEnd + "T12:00:00");
    while (cur <= endD) {
      const key = cur.toISOString().split("T")[0];
      trendPoints.push({
        date: key,
        label: cur.toLocaleDateString("id-ID", {
          day: "2-digit",
          month: "short",
        }),
        count: dailyTrend[key] || 0,
        ma7: 0,
      });
      cur.setDate(cur.getDate() + 1);
    }
    for (let i = 0; i < trendPoints.length; i++) {
      const sl = trendPoints.slice(Math.max(0, i - 6), i + 1);
      trendPoints[i].ma7 = parseFloat(
        (sl.reduce((a, d) => a + d.count, 0) / sl.length).toFixed(2),
      );
    }

    // ── Penyebab × ULP Heatmap (dengan normalisasi kategori) ────────────────
    const pbMap: Record<string, Record<string, number>> = {};
    filtered.forEach((row) => {
      const raw = (
        row.PENYEBAB_GANGGUAN ||
        row["PENYEBAB GANGGUAN"] ||
        "UNKNOWN"
      ).trim();
      const pb = categorizePenyebab(raw);
      const ulp = row.ULP?.trim().toUpperCase() ?? "UNKNOWN";
      if (!pbMap[pb]) pbMap[pb] = {};
      pbMap[pb][ulp] = (pbMap[pb][ulp] || 0) + 1;
    });
    const heatmapRows: HeatmapRow[] = Object.entries(pbMap)
      .map(([pb, byUlp]) => ({
        penyebab: pb,
        total: Object.values(byUlp).reduce((s, c) => s + c, 0),
        byUlp,
      }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 12);

    const ulpsInData =
      selectedULP === "ALL"
        ? ULP_LIST.filter((u) =>
            filtered.some((r) => r.ULP?.trim().toUpperCase() === u),
          )
        : [selectedULP];

    // ── MTBF ─────────────────────────────────────────────────────────────────
    const totalDays = Math.max(
      1,
      Math.ceil((endDate.getTime() - startDate.getTime()) / 86400000),
    );
    const mtbfItems: MtbfItem[] = Object.entries(pStats)
      .map(([p, s]) => ({
        penyulang: p,
        ulp: s.ulp,
        count: s.count,
        mtbfDays: parseFloat((totalDays / s.count).toFixed(1)),
        lastGangguan: s.lastDate,
      }))
      .sort((a, b) => a.mtbfDays - b.mtbfDays)
      .slice(0, 15);

    // ── Recurrence ──────────────────────────────────────────────────────────
    const recurrenceItems: RecurrenceItem[] = Object.entries(pStats)
      .map(([p, s]) => {
        const events = [...s.allEvents].sort((a, b) => a.date.localeCompare(b.date));
        const uniqueDates = [...new Set(events.map((e) => e.date))].sort();
        let maxIn7 = 0, worstStart = "", worstEnd = "";
        for (const d0 of uniqueDates) {
          const we = new Date(d0 + "T12:00:00");
          we.setDate(we.getDate() + 6);
          const weStr = we.toISOString().split("T")[0];
          const inW = events.filter((e) => e.date >= d0 && e.date <= weStr).length;
          if (inW > maxIn7) { maxIn7 = inW; worstStart = d0; worstEnd = weStr; }
        }
        const worstWindowEvents: RecurrenceEvent[] = worstStart
          ? events
              .filter((e) => e.date >= worstStart && e.date <= worstEnd)
              .map((e) => ({ date: e.date, dateLabel: fmtEventDate(e.date), kategori: categorizePenyebab(e.rawPenyebab) }))
          : [];
        return {
          penyulang: p, ulp: s.ulp, count: s.count, maxIn7Days: maxIn7,
          worstWindowLabel: worstStart ? fmtWindowLabel(worstStart, worstEnd) : "-",
          worstWindowEvents,
        };
      })
      .filter((r) => r.maxIn7Days >= 3)
      .sort((a, b) => b.maxIn7Days - a.maxIn7Days)
      .slice(0, 10);

    // ── Month × Kategori ─────────────────────────────────────────────────────
    const monthsInData = [
      ...new Set(Object.values(monthKatAcc).flatMap((bm) => Object.keys(bm))),
    ].sort();
    const monthKategoriRows: MonthKategoriRow[] = Object.entries(monthKatAcc)
      .map(([kategori, byMonth]) => ({
        kategori,
        total: Object.values(byMonth).reduce((s, c) => s + c, 0),
        byMonth,
      }))
      .sort((a, b) => b.total - a.total);

    // ── ULP Radar ─────────────────────────────────────────────────────────────
    const radarUlps = ULP_LIST.filter((u) => ulpAccMap[u]);
    const nc = normArr(radarUlps.map((u) => ulpAccMap[u].count), true);
    const nq = normArr(radarUlps.map((u) => { const s = ulpAccMap[u]; return s.count > 0 ? (s.quick / s.count) * 100 : 0; }), false);
    const nd = normArr(radarUlps.map((u) => { const s = ulpAccMap[u]; return s.durCount > 0 ? s.totalDur / s.durCount / 60 : 0; }), true);
    const nk = normArr(radarUlps.map((u) => { const s = ulpAccMap[u]; return s.count > 0 ? (s.knownCat / s.count) * 100 : 0; }), false);
    const nr = normArr(radarUlps.map((u) => {
      const s = ulpAccMap[u];
      const total = Object.keys(s.penyulangKeys).length;
      const repeaters = recurrenceItems.filter((r) => r.ulp === u).length;
      return total > 0 ? (repeaters / total) * 100 : 0;
    }), true);
    const ulpRadarData: UlpRadarPoint[] = radarUlps.map((u, i) => ({
      ulp: u,
      bebanGangguan: nc[i],
      pemulihanCepat: nq[i],
      durasiPendek: nd[i],
      penyebabDikenal: nk[i],
      bebasUlang: nr[i],
    }));

    return {
      isEmpty: false,
      filtered,
      paretoItems,
      matrixPoints,
      medFreq,
      medDur,
      trendPoints,
      heatmapRows,
      ulpsInData,
      mtbfItems,
      totalDays,
      recurrenceItems,
      totalGangguan: filtered.length,
      totalPenyulang: Object.keys(pStats).length,
      avgDurMin: durCountAll > 0 ? totalDurAll / durCountAll / 60 : 0,
      quickRecoveryPct:
        filtered.length > 0 ? (quickAll / filtered.length) * 100 : 0,
      ulpRadarData,
      monthKategoriRows,
      monthsInData,
      penyulangStats: Object.entries(pStats).map(([p, s]) => ({
        penyulang: p,
        ulp: s.ulp,
        freq: s.count,
        totalDurMin: s.totalDur / 60,
      })),
    };
  }, [rawData, startDate, endDate, selectedULP]);

  return { computed, loading, error, refresh };
}
