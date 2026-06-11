"use client";

import { useState, useEffect, useCallback } from "react";
import { supabaseBrowser } from "@/lib/supabase-browser";
import { getNominalCurrent } from "@/app/admin/pengukuran-gardu/_hooks/usePengukuranGardu";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface WeekBounds {
  label: string;    // "M1"
  startDay: number; // day of month
  endDay: number;   // day of month
  endDate: string;  // "YYYY-MM-DD" — used for query boundary
}

export interface WeekStats {
  diukur: number;     // unique gardu terpantau sampai akhir minggu ini
  overload: number;   // persen_beban >= 80
  overbalast: number; // maxArus >= I_nominal AND persen_beban < 80
  total: number;      // overload + overbalast
}

export interface WeekDelta {
  overload: number;
  overbalast: number;
  total: number;
}

export interface OverloadMonitorData {
  bounds: [WeekBounds, WeekBounds, WeekBounds, WeekBounds];
  weeks: [WeekStats, WeekStats, WeekStats, WeekStats];
  deltas: [null, WeekDelta, WeekDelta, WeekDelta];
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function pad(n: number) {
  return String(n).padStart(2, "0");
}

/**
 * Hitung batas 4 minggu dalam bulan menggunakan ISO 8601:
 * - Minggu dimulai hari Senin, berakhir hari Minggu
 * - M1: hari ke-1 s.d. Minggu pertama
 * - M2: Senin berikutnya s.d. Minggu kedua
 * - M3: Senin berikutnya s.d. Minggu ketiga
 * - M4: Senin berikutnya s.d. akhir bulan
 */
function getWeekBounds(year: number, month: number): [WeekBounds, WeekBounds, WeekBounds, WeekBounds] {
  const daysInMonth = new Date(year, month, 0).getDate();

  // Kumpulkan hari Minggu (getDay() === 0) yang ada di bulan ini, maksimal 3
  const sundays: number[] = [];
  for (let d = 1; d <= daysInMonth; d++) {
    if (new Date(year, month - 1, d).getDay() === 0) {
      sundays.push(d);
      if (sundays.length === 3) break;
    }
  }

  // Pastikan kita punya 3 titik akhir minggu sebelum hari terakhir bulan
  // (setiap bulan selalu punya ≥ 4 hari Minggu, jadi ≥ 3 tersedia)
  const ends: [number, number, number, number] = [
    sundays[0] ?? daysInMonth,
    sundays[1] ?? daysInMonth,
    sundays[2] ?? daysInMonth,
    daysInMonth,
  ];

  const starts: [number, number, number, number] = [
    1,
    ends[0] + 1,
    ends[1] + 1,
    ends[2] + 1,
  ];

  return [0, 1, 2, 3].map((i) => ({
    label:    `M${i + 1}`,
    startDay: starts[i],
    endDay:   ends[i],
    endDate:  `${year}-${pad(month)}-${pad(ends[i])}`,
  })) as [WeekBounds, WeekBounds, WeekBounds, WeekBounds];
}

interface RawRow {
  no_gardu: string;
  tanggal_pengukuran: string;
  persen_beban: number;
  kva_trafo: number;
  total_arus_r: number;
  total_arus_s: number;
  total_arus_t: number;
}

function computeWeekStats(rows: RawRow[], endDate: string): WeekStats {
  // Ambil pengukuran s.d. endDate, lalu ambil terbaru per gardu
  const filtered = rows.filter((r) => r.tanggal_pengukuran <= endDate);

  // rows sudah sort DESC dari query — iterate sekali, ambil pertama per gardu
  const latest = new Map<string, RawRow>();
  for (const row of filtered) {
    if (!latest.has(row.no_gardu)) latest.set(row.no_gardu, row);
  }

  let overload = 0;
  let overbalast = 0;
  for (const row of latest.values()) {
    if (row.persen_beban >= 80) {
      overload++;
    } else {
      const iNominal = getNominalCurrent(row.kva_trafo);
      const maxArus = Math.max(row.total_arus_r, row.total_arus_s, row.total_arus_t);
      if (maxArus >= iNominal) overbalast++;
    }
  }

  return { diukur: latest.size, overload, overbalast, total: overload + overbalast };
}

// ── Hook ─────────────────────────────────────────────────────────────────────

export function useOverloadMonitor(bulan: number, tahun: number, ulp: string) {
  const [data, setData] = useState<OverloadMonitorData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      // Ambil data 12 bulan ke belakang s.d. akhir bulan yang dipilih
      // (kumulatif per minggu — cukup 12 bulan, data lebih lama tidak relevan)
      const bounds = getWeekBounds(tahun, bulan);
      const lastDayOfMonth = bounds[3].endDate; // akhir M4 = akhir bulan
      const prevYear = bulan === 1 ? tahun - 1 : tahun;
      const prevMonth = bulan === 1 ? 12 : bulan - 1;
      const lowerBound = `${prevYear}-${pad(prevMonth)}-01`;

      let query = supabaseBrowser
        .from("pengukuran_gardu")
        .select("no_gardu,tanggal_pengukuran,persen_beban,kva_trafo,total_arus_r,total_arus_s,total_arus_t")
        .gte("tanggal_pengukuran", lowerBound)
        .lte("tanggal_pengukuran", lastDayOfMonth)
        .order("tanggal_pengukuran", { ascending: false });

      if (ulp) query = query.eq("petugas_unit", ulp);

      const { data: rows, error: err } = await query;
      if (err) throw err;

      const all = (rows ?? []) as RawRow[];

      const w1 = computeWeekStats(all, bounds[0].endDate);
      const w2 = computeWeekStats(all, bounds[1].endDate);
      const w3 = computeWeekStats(all, bounds[2].endDate);
      const w4 = computeWeekStats(all, bounds[3].endDate);

      const delta = (a: WeekStats, b: WeekStats): WeekDelta => ({
        overload:   b.overload   - a.overload,
        overbalast: b.overbalast - a.overbalast,
        total:      b.total      - a.total,
      });

      setData({
        bounds,
        weeks:  [w1, w2, w3, w4],
        deltas: [null, delta(w1, w2), delta(w2, w3), delta(w3, w4)],
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Gagal mengambil data");
    } finally {
      setLoading(false);
    }
  }, [bulan, tahun, ulp]);

  useEffect(() => { fetchData(); }, [fetchData]);

  return { data, loading, error, refresh: fetchData };
}
