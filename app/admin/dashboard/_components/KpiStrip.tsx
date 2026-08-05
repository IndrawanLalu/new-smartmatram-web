"use client";

import { Zap, SearchCheck, ClipboardList, Gauge, Scale, Users } from "lucide-react";
import StatTile from "@/app/admin/_components/StatTile";
import { CARD } from "@/app/admin/_ui";
import type { Kpi, MonthPoint } from "../_hooks/useDashboardOverview";

interface KpiStripProps {
  kpi: {
    gangguan: Kpi;
    inspeksi: Kpi;
    gardu: Kpi;
    pemerataan: Kpi;
  };
  wo: { pct: number; total: number; selesai: number };
  produktivitas: { petugasAktif: number; totalPetugas: number };
  tren: MonthPoint[];
  prevLabel: string;
  loading: boolean;
}

/** Sparkline diambil dari enam bulan terakhir — cukup untuk memberi arah tanpa
 *  membuat garis jadi ramai di kotak selebar 64px. */
const tail = (tren: MonthPoint[], field: "gangguan" | "inspeksi" | "gardu") =>
  tren.slice(-6).map((p) => p[field]);

const round1 = (n: number | null) => (n === null ? null : Math.round(n * 10) / 10);

export default function KpiStrip({
  kpi, wo, produktivitas, tren, prevLabel, loading,
}: KpiStripProps) {
  if (loading) {
    return (
      <div className="grid gap-3 grid-cols-2 md:grid-cols-3 xl:grid-cols-6">
        {Array.from({ length: 6 }, (_, i) => (
          <div key={i} className={`${CARD} h-[104px] animate-pulse`} />
        ))}
      </div>
    );
  }

  const delta = (k: Kpi, upIsGood: boolean) => {
    const pct = round1(k.deltaPct);
    return pct === null ? undefined : { pct, vs: prevLabel, upIsGood };
  };

  return (
    <div className="grid gap-3 grid-cols-2 md:grid-cols-3 xl:grid-cols-6">
      {/* Gangguan naik = buruk — satu-satunya KPI di baris ini yang begitu. */}
      <StatTile
        label="Gangguan"
        value={kpi.gangguan.value}
        icon={Zap}
        tone="attention"
        delta={delta(kpi.gangguan, false)}
        trend={tail(tren, "gangguan")}
      />
      <StatTile
        label="Inspeksi Baru"
        value={kpi.inspeksi.value}
        icon={SearchCheck}
        tone="navy"
        delta={delta(kpi.inspeksi, true)}
        trend={tail(tren, "inspeksi")}
      />
      <StatTile
        label="Work Order Selesai"
        value={`${wo.pct}%`}
        icon={ClipboardList}
        tone={wo.pct >= 80 ? "green" : "navy"}
        hint={`${wo.selesai} dari ${wo.total} baris`}
      />
      <StatTile
        label="Gardu Diukur"
        value={kpi.gardu.value}
        icon={Gauge}
        tone="navy"
        delta={delta(kpi.gardu, true)}
        trend={tail(tren, "gardu")}
      />
      <StatTile
        label="Pemerataan Beban"
        value={kpi.pemerataan.value}
        icon={Scale}
        tone="accent"
        delta={delta(kpi.pemerataan, true)}
        hint="gardu diseimbangkan"
      />
      <StatTile
        label="Petugas Aktif"
        value={produktivitas.petugasAktif}
        icon={Users}
        tone="accent"
        hint={`dari ${produktivitas.totalPetugas} petugas aktif`}
      />
    </div>
  );
}
