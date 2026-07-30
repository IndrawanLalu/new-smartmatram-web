"use client";

import { useCallback, useEffect, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase-browser";
import { fetchAllRows } from "@/lib/supabasePaginate";
import { useToast } from "@/app/admin/_components/Toast";
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

/** Sama seperti DashItem tanpa JSONB `data` — dipakai bila tak ada kolom ukuran. */
type BaseRow = Omit<DashItem, "data">;

/** Ambil semua item WO pada satu periode (lintas batch) + meta ukuran per batch. */
export function useWorkOrderDashboard(
  user: CurrentUser,
  bulan: number,
  tahun: number,
  ulpFilter: string | null,
) {
  const toast = useToast();
  const [items, setItems] = useState<DashItem[]>([]);
  const [batchMeta, setBatchMeta] = useState<Map<string, BatchMeta>>(new Map());
  const [batchCount, setBatchCount] = useState(0);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
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

      const { data: batches, error } = await q;
      if (error) throw new Error(error.message);

      const list = batches ?? [];
      const meta = new Map<string, BatchMeta>();
      for (const b of list) {
        meta.set(b.id, { measure_column: b.measure_column, measure_unit: b.measure_unit });
      }

      // JSONB `data` hanya ditarik kalau ada batch yang memakai kolom ukuran —
      // kalau tidak, payload-nya sia-sia.
      let rows: DashItem[] = [];
      if (list.length) {
        const ids = list.map((b) => b.id);
        if (list.some((b) => b.measure_column)) {
          rows = await fetchAllRows<DashItem>(() =>
            supabaseBrowser
              .from("wo_item")
              .select("batch_id, regu, status, verified_at, approved_at, sla_ok, data")
              .in("batch_id", ids)
              .order("id", { ascending: true }),
          );
        } else {
          const base = await fetchAllRows<BaseRow>(() =>
            supabaseBrowser
              .from("wo_item")
              .select("batch_id, regu, status, verified_at, approved_at, sla_ok")
              .in("batch_id", ids)
              .order("id", { ascending: true }),
          );
          rows = base.map((r) => ({ ...r, data: {} }));
        }
      }

      setBatchMeta(meta);
      setBatchCount(list.length);
      setItems(rows);
    } catch (e) {
      toast.error(`Gagal memuat dashboard WO: ${e instanceof Error ? e.message : e}`);
      setItems([]);
      setBatchCount(0);
    } finally {
      setLoading(false);
    }
  }, [user, bulan, tahun, ulpFilter, toast]);

  useEffect(() => {
    void load();
  }, [load]);

  return { items, batchMeta, batchCount, loading };
}
