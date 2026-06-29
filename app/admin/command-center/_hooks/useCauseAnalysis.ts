"use client";

import { useEffect, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase-browser";
import type { CurrentUser } from "@/lib/roles";

export interface CauseSlice {
  cause: string;
  count: number;
  pct: number;
}

/**
 * Ringkasan hasil Model B: rekonstruksi penyebab gangguan yang tercatat
 * "tidak ditemukan / temporer". Unknown = baris yang punya predicted_cause
 * (Model B hanya mengisi baris unknown).
 */
export function useCauseAnalysis(user: CurrentUser | null) {
  const [slices, setSlices] = useState<CauseSlice[]>([]);
  const [unknownTotal, setUnknownTotal] = useState(0);
  const [grandTotal, setGrandTotal] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function run() {
      setLoading(true);

      let totalQ = supabaseBrowser
        .from("ml_outage_events")
        .select("id", { count: "exact", head: true });
      if (user?.unit) totalQ = totalQ.eq("ulp", user.unit);
      const { count: total } = await totalQ;

      let q = supabaseBrowser
        .from("ml_outage_events")
        .select("predicted_cause")
        .not("predicted_cause", "is", null);
      if (user?.unit) q = q.eq("ulp", user.unit);
      const { data } = await q;

      const rows = (data ?? []) as { predicted_cause: string }[];
      const map = new Map<string, number>();
      rows.forEach((r) => map.set(r.predicted_cause, (map.get(r.predicted_cause) ?? 0) + 1));

      const unknown = rows.length;
      const arr: CauseSlice[] = [...map.entries()]
        .map(([cause, count]) => ({
          cause,
          count,
          pct: unknown ? Math.round((count / unknown) * 100) : 0,
        }))
        .sort((a, b) => b.count - a.count);

      setSlices(arr);
      setUnknownTotal(unknown);
      setGrandTotal(total ?? 0);
      setLoading(false);
    }
    run();
  }, [user]);

  return { slices, unknownTotal, grandTotal, loading };
}
