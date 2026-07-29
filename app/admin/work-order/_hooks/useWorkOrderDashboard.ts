"use client";

import { useCallback, useEffect, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase-browser";
import { type CurrentUser, canSeeAllUnits } from "@/lib/roles";

export interface DashItem {
  batch_id: string;
  regu: string | null;
  status: string;
  data: Record<string, string>;
  verified_at: string | null;
  approved_at: string | null;
  sla_ok: boolean | null;
}

export interface BatchMeta {
  measure_column: string | null;
  measure_unit: string | null;
}

/** Ambil semua item WO pada satu periode (lintas batch) + meta ukuran per batch. */
export function useWorkOrderDashboard(
  user: CurrentUser,
  bulan: number,
  tahun: number,
  ulpFilter: string | null,
) {
  const [items, setItems] = useState<DashItem[]>([]);
  const [batchMeta, setBatchMeta] = useState<Map<string, BatchMeta>>(new Map());
  const [batchCount, setBatchCount] = useState(0);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);

    let q = supabaseBrowser
      .from("wo_batch")
      .select("id, measure_column, measure_unit")
      .eq("bulan", bulan)
      .eq("tahun", tahun);

    if (!canSeeAllUnits(user.role)) {
      if (user.unit) q = q.eq("ulp", user.unit);
    } else if (ulpFilter) {
      q = q.eq("ulp", ulpFilter);
    }

    const { data: batches } = await q;
    const list = batches ?? [];
    const meta = new Map<string, BatchMeta>();
    for (const b of list) meta.set(b.id, { measure_column: b.measure_column, measure_unit: b.measure_unit });

    let rows: DashItem[] = [];
    if (list.length) {
      const { data } = await supabaseBrowser
        .from("wo_item")
        .select("batch_id, regu, status, data, verified_at, approved_at, sla_ok")
        .in("batch_id", list.map((b) => b.id));
      rows = (data as DashItem[]) ?? [];
    }

    setBatchMeta(meta);
    setBatchCount(list.length);
    setItems(rows);
    setLoading(false);
  }, [user, bulan, tahun, ulpFilter]);

  useEffect(() => {
    void load();
  }, [load]);

  return { items, batchMeta, batchCount, loading };
}
