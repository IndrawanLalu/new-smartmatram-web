"use client";

import { useCallback, useEffect, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase-browser";
import { type CurrentUser, canSeeAllUnits } from "@/lib/roles";
import type { WoBatch, WoBatchWithStats, WoColumn, WoSheetSync } from "../_types";

export interface CreateBatchInput {
  ulp: string;
  bulan: number;
  tahun: number;
  judul: string;
  columns: WoColumn[];
  reguColumn: string | null;
  verifierColumn: string | null;
  titleColumn: string | null;
  measureColumn: string | null;
  measureUnit: string | null;
  sheetId: string | null;
  sheetTab: string | null;
  sheetSync: WoSheetSync | null;
  rows: {
    data: Record<string, string>;
    regu: string | null;
    verifierRole: string | null;
    sheetKey: Record<string, string> | null;
  }[];
}

const CHUNK = 500;

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

/** Daftar batch WO untuk satu periode (bulan/tahun) + agregat progres. */
export function useWorkOrderBatches(
  user: CurrentUser,
  bulan: number,
  tahun: number,
  ulpFilter: string | null,
) {
  const [batches, setBatches] = useState<WoBatchWithStats[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    let q = supabaseBrowser
      .from("wo_batch")
      .select("*")
      .eq("bulan", bulan)
      .eq("tahun", tahun)
      .order("created_at", { ascending: false });

    if (!canSeeAllUnits(user.role)) {
      if (user.unit) q = q.eq("ulp", user.unit);
    } else if (ulpFilter) {
      q = q.eq("ulp", ulpFilter);
    }

    const { data } = await q;
    const list = (data ?? []) as WoBatch[];

    // Agregat progres per batch dalam satu query
    const statByBatch = new Map<string, { total: number; selesai: number }>();
    if (list.length) {
      const { data: items } = await supabaseBrowser
        .from("wo_item")
        .select("batch_id, status")
        .in("batch_id", list.map((b) => b.id));
      for (const it of items ?? []) {
        const s = statByBatch.get(it.batch_id) ?? { total: 0, selesai: 0 };
        s.total += 1;
        if (it.status === "Selesai") s.selesai += 1;
        statByBatch.set(it.batch_id, s);
      }
    }

    setBatches(
      list.map((b) => ({
        ...b,
        total: statByBatch.get(b.id)?.total ?? 0,
        selesai: statByBatch.get(b.id)?.selesai ?? 0,
      })),
    );
    setLoading(false);
  }, [user, bulan, tahun, ulpFilter]);

  useEffect(() => {
    void load();
  }, [load]);

  const createBatch = useCallback(
    async (input: CreateBatchInput): Promise<string> => {
      const batchId = crypto.randomUUID();
      const { error } = await supabaseBrowser.from("wo_batch").insert({
        id: batchId,
        ulp: input.ulp,
        bulan: input.bulan,
        tahun: input.tahun,
        judul: input.judul,
        columns: input.columns,
        regu_column: input.reguColumn,
        verifier_column: input.verifierColumn,
        title_column: input.titleColumn,
        measure_column: input.measureColumn,
        measure_unit: input.measureUnit,
        sheet_id: input.sheetId,
        sheet_tab: input.sheetTab,
        sheet_sync: input.sheetSync,
        created_by: user.id,
      });
      if (error) throw error;

      const items = input.rows.map((r, i) => ({
        id: crypto.randomUUID(),
        batch_id: batchId,
        data: r.data,
        regu: r.regu,
        verifier_role: r.verifierRole,
        sheet_key: r.sheetKey,
        status: "Belum",
        urutan: i,
      }));
      for (const part of chunk(items, CHUNK)) {
        const { error: itemErr } = await supabaseBrowser.from("wo_item").insert(part);
        if (itemErr) throw itemErr;
      }

      await load();
      return batchId;
    },
    [user, load],
  );

  const deleteBatch = useCallback(async (id: string) => {
    setBatches((prev) => prev.filter((b) => b.id !== id));
    await supabaseBrowser.from("wo_batch").delete().eq("id", id);
  }, []);

  return { batches, loading, reload: load, createBatch, deleteBatch };
}
