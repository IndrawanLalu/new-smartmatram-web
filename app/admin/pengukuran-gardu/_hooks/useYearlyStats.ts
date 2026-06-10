"use client";

import { useState, useEffect } from "react";
import { supabaseBrowser } from "@/lib/supabase-browser";
import { type CurrentUser, canSeeAllUnits } from "@/lib/roles";
import { JENIS_PEMELIHARAAN_OPTIONS } from "../_utils/constants";
import { OVERLOAD_PCT, HIGH_TEMP_C } from "./usePengukuranGardu";
import { detectAnomali, hasActiveCriteria, type AnomalySettings, DEFAULT_SETTINGS } from "../_utils/detectAnomali";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface MonthStat {
  month: number;
  jumlahUkur: number;
  jumlahAnomal: number;
  rataBeban: number;
  byJenis: Record<string, { wo: number; selesai: number }>;
  totalWo: number;
  totalSelesai: number;
  pctSelesai: number;
}

// ── Hook ─────────────────────────────────────────────────────────────────────

export function useYearlyStats(
  user: CurrentUser,
  year: number,
  ulp: string,
  settings: AnomalySettings = DEFAULT_SETTINGS,
) {
  const [stats, setStats] = useState<MonthStat[]>([]);
  const [loading, setLoading] = useState(false);

  const useDynamic = hasActiveCriteria(settings);

  useEffect(() => {
    const startDate = `${year}-01-01`;
    const endDate   = `${year + 1}-01-01`;
    const unitFilter = !canSeeAllUnits(user.role) && user.unit ? user.unit : ulp || null;

    async function run() {
      setLoading(true);
      try {
        // Fetch full row untuk detectAnomali (butuh perjurusan jika max_arus_jurusan aktif)
        let pgQuery = supabaseBrowser
          .from("pengukuran_gardu")
          .select("*")
          .gte("tanggal_pengukuran", startDate)
          .lt("tanggal_pengukuran", endDate);
        if (unitFilter) pgQuery = pgQuery.eq("petugas_unit", unitFilter);

        let psQuery = supabaseBrowser
          .from("penyeimbangan_gardu")
          .select("tgl_penyeimbangan,jenis_pemeliharaan")
          .gte("tgl_penyeimbangan", startDate)
          .lt("tgl_penyeimbangan", endDate);
        if (unitFilter) psQuery = psQuery.eq("ulp", unitFilter);

        const [{ data: pgRows }, { data: psRows }] = await Promise.all([pgQuery, psQuery]);

        type Acc = {
          ukur: number; bebanSum: number; anomali: number;
          woByJenis: Record<string, number>;
          selesaiByJenis: Record<string, number>;
        };
        const emptyJenis = () => Object.fromEntries(JENIS_PEMELIHARAAN_OPTIONS.map(j => [j, 0]));
        const monthMap = new Map<number, Acc>();
        for (let m = 1; m <= 12; m++) {
          monthMap.set(m, { ukur: 0, bebanSum: 0, anomali: 0, woByJenis: emptyJenis(), selesaiByJenis: emptyJenis() });
        }

        for (const row of pgRows ?? []) {
          const m = new Date(row.tanggal_pengukuran).getMonth() + 1;
          const acc = monthMap.get(m)!;
          acc.ukur++;
          acc.bebanSum += row.persen_beban ?? 0;

          // Anomali: gunakan detectAnomali jika kriteria aktif, fallback ke hardcode
          const isAnom = useDynamic
            ? detectAnomali(row, settings).isAnomali
            : ((row.persen_beban ?? 0) >= OVERLOAD_PCT || (row.suhu_trafo ?? 0) > HIGH_TEMP_C);
          if (isAnom) acc.anomali++;

          // WO: pengukuran dengan jenis_pemeliharaan terisi, grouped by tanggal_pengukuran bulan
          if (row.jenis_pemeliharaan && (!useDynamic || isAnom)) {
            if (row.jenis_pemeliharaan in acc.woByJenis) acc.woByJenis[row.jenis_pemeliharaan]++;
          }
        }

        for (const row of psRows ?? []) {
          if (!row.tgl_penyeimbangan || !row.jenis_pemeliharaan) continue;
          const m = new Date(row.tgl_penyeimbangan).getMonth() + 1;
          const acc = monthMap.get(m)!;
          if (row.jenis_pemeliharaan in acc.selesaiByJenis) acc.selesaiByJenis[row.jenis_pemeliharaan]++;
        }

        const result: MonthStat[] = [];
        for (let m = 1; m <= 12; m++) {
          const acc = monthMap.get(m)!;
          const byJenis: Record<string, { wo: number; selesai: number }> = {};
          let totalWo = 0, totalSelesai = 0;
          for (const j of JENIS_PEMELIHARAAN_OPTIONS) {
            byJenis[j] = { wo: acc.woByJenis[j], selesai: acc.selesaiByJenis[j] };
            totalWo     += acc.woByJenis[j];
            totalSelesai += acc.selesaiByJenis[j];
          }
          result.push({
            month: m,
            jumlahUkur:   acc.ukur,
            jumlahAnomal: acc.anomali,
            rataBeban:    acc.ukur > 0 ? Math.round(acc.bebanSum / acc.ukur) : 0,
            byJenis,
            totalWo,
            totalSelesai,
            pctSelesai: totalWo > 0 ? Math.round((totalSelesai / totalWo) * 100) : 0,
          });
        }
        setStats(result);
      } finally {
        setLoading(false);
      }
    }

    run();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user.role, user.unit, year, ulp, useDynamic,
      settings.max_beban_trafo_pct, settings.max_arus_jurusan_a,
      settings.max_unbalance_pct, settings.max_suhu_trafo_c]);

  return { stats, loading };
}
