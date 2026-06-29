"use client";

import { useEffect, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase-browser";
import type { CurrentUser } from "@/lib/roles";
import { CAUSE_CLASSES, classifyCause, type CauseClass } from "@/lib/causeClass";

export interface SeasonRow {
  cause: CauseClass;
  months: number[]; // 12 elemen (Jan..Des)
  total: number;
}

export interface SeasonalityResult {
  rows: SeasonRow[];
  monthTotals: number[]; // total per bulan (untuk skala)
  maxCell: number; // nilai sel terbesar (untuk intensitas warna)
  grandTotal: number;
}

const EMPTY: SeasonalityResult = { rows: [], monthTotals: Array(12).fill(0), maxCell: 0, grandTotal: 0 };

/**
 * Matrix bulan × kelas penyebab dari SEMUA event.
 * Penyebab efektif = predicted_cause (Model B) jika ada, selain itu klasifikasi
 * kata kunci dari kolom penyebab. Mengungkap pola musiman (mis. cuaca memuncak Des–Feb).
 */
export function useCauseSeasonality(user: CurrentUser | null) {
  const [result, setResult] = useState<SeasonalityResult>(EMPTY);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function run() {
      setLoading(true);
      const PAGE = 1000;
      let start = 0;
      const events: { penyebab: string | null; predicted_cause: string | null; tgl_gangguan: string | null }[] = [];
      while (true) {
        let q = supabaseBrowser
          .from("ml_outage_events")
          .select("penyebab, predicted_cause, tgl_gangguan")
          .range(start, start + PAGE - 1);
        if (user?.unit) q = q.eq("ulp", user.unit);
        const { data } = await q;
        const batch = data ?? [];
        events.push(...(batch as typeof events));
        if (batch.length < PAGE) break;
        start += PAGE;
      }

      const matrix = new Map<CauseClass, number[]>();
      CAUSE_CLASSES.forEach((c) => matrix.set(c, Array(12).fill(0)));
      const monthTotals = Array(12).fill(0);
      let grandTotal = 0;

      for (const e of events) {
        const tgl = e.tgl_gangguan;
        if (!tgl || tgl.length < 7) continue;
        const month = Number(tgl.slice(5, 7)) - 1;
        if (month < 0 || month > 11) continue;
        const cause = (e.predicted_cause as CauseClass) ?? classifyCause(e.penyebab);
        const arr = matrix.get(cause) ?? matrix.get("Lain-lain")!;
        arr[month] += 1;
        monthTotals[month] += 1;
        grandTotal += 1;
      }

      const rows: SeasonRow[] = CAUSE_CLASSES.map((cause) => {
        const months = matrix.get(cause)!;
        return { cause, months, total: months.reduce((s, n) => s + n, 0) };
      });
      const maxCell = Math.max(1, ...rows.flatMap((r) => r.months));

      setResult({ rows, monthTotals, maxCell, grandTotal });
      setLoading(false);
    }
    run();
  }, [user]);

  return { ...result, loading };
}
