"use client";

import { useMemo } from "react";
import { parseLocaleNumber } from "@/lib/parseLocaleNumber";
import { buildWoStats } from "../../_lib/woStats";
import { monthLabel } from "../../_constants";
import type { WoBatch, WoItem } from "../../_types";
import WoSummary from "../../_components/WoSummary";

/** Dashboard realisasi untuk satu WO. */
export default function BatchDashboard({ batch, items }: { batch: WoBatch; items: WoItem[] }) {
  const stats = useMemo(() => {
    const col = batch.measure_column;
    const unit = batch.measure_unit || "kms";
    return buildWoStats(items, (it) =>
      col ? { unit, value: parseLocaleNumber(it.data[col]) ?? 0 } : null,
    );
  }, [items, batch.measure_column, batch.measure_unit]);

  return (
    <WoSummary
      stats={stats}
      caption={`${monthLabel(batch.bulan)} ${batch.tahun} · ULP ${batch.ulp}`}
    />
  );
}
