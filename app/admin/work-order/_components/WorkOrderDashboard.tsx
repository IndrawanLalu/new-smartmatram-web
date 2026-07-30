"use client";

import { useMemo } from "react";
import { ClipboardList } from "lucide-react";
import { type CurrentUser } from "@/lib/roles";
import { parseLocaleNumber } from "@/lib/parseLocaleNumber";
import { buildWoStats } from "../_lib/woStats";
import { monthLabel } from "../_constants";
import { useWorkOrderDashboard } from "../_hooks/useWorkOrderDashboard";
import WoSummary from "./WoSummary";

interface WorkOrderDashboardProps {
  user: CurrentUser;
  bulan: number;
  tahun: number;
  ulpFilter: string | null;
}

/** Dashboard realisasi lintas seluruh WO pada satu periode. */
export default function WorkOrderDashboard({ user, bulan, tahun, ulpFilter }: WorkOrderDashboardProps) {
  const { items, batchMeta, batchCount, loading } = useWorkOrderDashboard(user, bulan, tahun, ulpFilter);

  const stats = useMemo(
    () =>
      buildWoStats(items, (it) => {
        const meta = batchMeta.get(it.batch_id);
        if (!meta?.measure_column) return null;
        return {
          unit: meta.measure_unit || "kms",
          value: parseLocaleNumber(it.data[meta.measure_column]) ?? 0,
        };
      }),
    [items, batchMeta],
  );

  if (loading) {
    return (
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="h-52 rounded-xl bg-line animate-skeleton" />
        <div className="h-52 rounded-xl bg-line animate-skeleton" />
      </div>
    );
  }

  if (batchCount === 0) {
    return (
      <div className="bg-white rounded-xl shadow-sm border border-line p-12 text-center">
        <ClipboardList size={40} className="mx-auto text-navy-200" />
        <p className="mt-3 text-ink-soft">Belum ada WO untuk periode ini.</p>
      </div>
    );
  }

  return (
    <WoSummary
      stats={stats}
      caption={`${monthLabel(bulan)} ${tahun} · ${batchCount} WO${ulpFilter ? ` · ULP ${ulpFilter}` : ""}`}
    />
  );
}
