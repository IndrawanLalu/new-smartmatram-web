"use client";

import { useState, useEffect, useMemo } from "react";
import { fetchSheetData } from "@/lib/sheets";
import type { ComputedData } from "./useAdvancedDashboard";

// ── Hardcoded targets 2026 (monthly, index 0=Jan … 11=Des) ───────────────────

const SAIDI_2026: Record<string, number[]> = {
  AMPENAN:     [14.06, 13.97, 12.47, 11.01,  8.57,  7.74,  8.00,  7.99, 10.69, 11.98, 14.62, 14.54],
  CAKRANEGARA: [18.40, 18.27, 16.33, 14.40, 11.21, 10.13, 10.47, 10.46, 13.98, 15.68, 19.14, 19.01],
  TANJUNG:     [17.23, 17.11, 15.28, 13.48, 10.51,  9.48,  9.80,  9.80, 13.09, 14.68, 17.92, 17.80],
  GERUNG:      [14.06, 13.97, 12.48, 11.01,  8.57,  7.75,  7.99,  8.00, 10.69, 11.98, 14.63, 14.54],
  UP3:         [16.17, 16.06, 14.36, 12.65,  9.86,  8.91,  9.19,  9.20, 12.29, 13.78, 16.82, 16.72],
};

const SAIFI_2026: Record<string, number[]> = {
  AMPENAN:     [0.24, 0.23, 0.21, 0.18, 0.15, 0.13, 0.13, 0.13, 0.18, 0.20, 0.25, 0.24],
  CAKRANEGARA: [0.24, 0.25, 0.21, 0.19, 0.15, 0.13, 0.14, 0.14, 0.19, 0.20, 0.26, 0.25],
  TANJUNG:     [0.27, 0.28, 0.24, 0.21, 0.17, 0.15, 0.16, 0.15, 0.21, 0.24, 0.28, 0.28],
  GERUNG:      [0.23, 0.23, 0.21, 0.18, 0.15, 0.12, 0.14, 0.13, 0.18, 0.19, 0.25, 0.24],
  UP3:         [0.25, 0.24, 0.22, 0.19, 0.15, 0.13, 0.14, 0.14, 0.19, 0.21, 0.26, 0.25],
};

const ULP_ORDER = ["AMPENAN", "CAKRANEGARA", "GERUNG", "TANJUNG"] as const;

// Sum monthly targets for months that overlap [start, min(end, today)]
function periodTarget(monthly: number[] | undefined, start: Date, end: Date): number {
  if (!monthly) return 0;
  const today = new Date();
  const effectiveEnd = end > today ? today : end; // jangan hitung bulan yang belum berjalan
  let sum = 0;
  for (let m = 0; m < 12; m++) {
    const mStart = new Date(2026, m, 1);
    const mEnd   = new Date(2026, m + 1, 0, 23, 59, 59);
    if (mStart <= effectiveEnd && mEnd >= start) sum += monthly[m];
  }
  return parseFloat(sum.toFixed(2));
}

// ── Hardcoded pelanggan per ULP (sementara, sampai data sheet tersedia) ──────
// Tambahkan ULP lain di sini saat data siap
const ULP_PELANGGAN_HARDCODE: Partial<Record<string, number>> = {
  AMPENAN: 207391,
  // CAKRANEGARA: 0,
  // GERUNG: 0,
  // TANJUNG: 0,
};

// ── Types ─────────────────────────────────────────────────────────────────────

export interface UlpSaidiSaifi {
  ulp: string;
  pelanggan: number;
  saidi: number;
  saifi: number;
  caidi: number;
  targetSaidi: number; // 0 = no target (outside 2026)
  targetSaifi: number;
}

export interface SaidiSaifiData {
  byUlp: UlpSaidiSaifi[];
  total: UlpSaidiSaifi;
}

interface Options {
  computed: ComputedData | null;
  startDate: Date;
  endDate: Date;
}

// ── Column matching (case-insensitive, trimmed) ───────────────────────────────

function colVal(row: Record<string, string>, ...candidates: string[]): string {
  for (const c of candidates) {
    if (row[c] !== undefined) return row[c];
  }
  const keys = Object.keys(row);
  for (const c of candidates) {
    const found = keys.find((k) => k.trim().toLowerCase() === c.trim().toLowerCase());
    if (found !== undefined) return row[found] ?? "";
  }
  return "";
}

// ── Hook ─────────────────────────────────────────────────────────────────────

export function useSaidiSaifi({ computed, startDate, endDate }: Options) {
  const [keypointRows, setKeypointRows] = useState<Record<string, string>[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchSheetData("KEYPOINT", "A:Z")
      .then((rows) => {
        console.log("[SAIDI] KEYPOINT rows:", rows.length, rows[0] ?? "(empty)");
        setKeypointRows(rows);
      })
      .catch((e) => {
        console.error("[SAIDI] fetch KEYPOINT error:", e);
        setError(e instanceof Error ? e.message : String(e));
      })
      .finally(() => setLoading(false));
  }, []);

  const data = useMemo((): SaidiSaifiData | null => {
    if (!computed || computed.isEmpty || !keypointRows.length) return null;

    // Build lookup: penyulang → N_i, ulp → N_total
    const pNi: Record<string, number> = {};
    const pUlp: Record<string, string> = {};
    const ulpNt: Record<string, number> = {};
    keypointRows.forEach((r) => {
      // KEYPOINT column matches PENYULANG_GANGGUAN in gangguan sheet
      const p   = colVal(r, "KEYPOINT").trim();
      // ULP column (PUL is empty in this sheet)
      const ulp = colVal(r, "ULP", "PUL").trim().toUpperCase();
      const nStr = colVal(r, "JML PELANGGAN", "JML_PELANGGAN", "JUMLAH PELANGGAN", "PELANGGAN");
      const n   = parseInt(nStr.replace(/\D/g, "")) || 0;
      if (p && ulp && n) {
        pNi[p]    = (pNi[p] ?? 0) + n;
        pUlp[p]   = ulp;
        ulpNt[ulp] = (ulpNt[ulp] ?? 0) + n;
      }
    });

    // Override ulpNt dengan hardcode dan normalisasi pNi agar konsisten
    Object.entries(ULP_PELANGGAN_HARDCODE).forEach(([ulp, hardcoded]) => {
      if (!hardcoded) return;
      const fromSheet = ulpNt[ulp] ?? 0;
      ulpNt[ulp] = hardcoded;
      if (fromSheet > 0) {
        const scale = hardcoded / fromSheet;
        Object.keys(pNi).forEach((p) => {
          if (pUlp[p] === ulp) pNi[p] = Math.round(pNi[p] * scale);
        });
      }
    });

    console.log("[SAIDI] ulpNt final:", ulpNt, "| keypoints:", Object.keys(pNi).length);

    // Accumulate SAIDI/SAIFI numerators per ULP
    const acc: Record<string, { sumDurN: number; sumFreqN: number }> = {};
    computed.penyulangStats.forEach(({ penyulang, ulp, freq, totalDurMin }) => {
      const Ni = pNi[penyulang] ?? 0;
      if (!acc[ulp]) acc[ulp] = { sumDurN: 0, sumFreqN: 0 };
      acc[ulp].sumDurN  += totalDurMin * Ni;
      acc[ulp].sumFreqN += freq * Ni;
    });

    const makeRow = (ulp: string, nt: number, sumDurN: number, sumFreqN: number, tKey: string): UlpSaidiSaifi => {
      const saidi = nt > 0 ? parseFloat((sumDurN  / nt).toFixed(2)) : 0;
      const saifi = nt > 0 ? parseFloat((sumFreqN / nt).toFixed(3)) : 0;
      const caidi = saifi > 0 ? parseFloat((saidi / saifi).toFixed(1)) : 0;
      return {
        ulp, pelanggan: nt, saidi, saifi, caidi,
        targetSaidi: periodTarget(SAIDI_2026[tKey], startDate, endDate),
        targetSaifi: periodTarget(SAIFI_2026[tKey], startDate, endDate),
      };
    };

    const byUlp: UlpSaidiSaifi[] = ULP_ORDER.filter((u) => ulpNt[u]).map((u) => {
      const st = acc[u] ?? { sumDurN: 0, sumFreqN: 0 };
      return makeRow(u, ulpNt[u], st.sumDurN, st.sumFreqN, u);
    });

    const totalNt      = Object.values(ulpNt).reduce((s, v) => s + v, 0);
    const totalSumDurN = Object.values(acc).reduce((s, v) => s + v.sumDurN, 0);
    const totalSumFreqN = Object.values(acc).reduce((s, v) => s + v.sumFreqN, 0);
    const total = makeRow("UP3 MATARAM", totalNt, totalSumDurN, totalSumFreqN, "UP3");

    return { byUlp, total };
  }, [computed, keypointRows, startDate, endDate]);

  const noKeypoint = !loading && keypointRows.length === 0;

  return { data, loading, error, noKeypoint };
}
