"use client";

import { useMemo, useState } from "react";
import { ClipboardList, ListChecks, CheckCircle2, Clock, Percent, Ruler, Users, ShieldCheck } from "lucide-react";
import { type CurrentUser } from "@/lib/roles";
import { parseLocaleNumber } from "@/lib/parseLocaleNumber";
import { formatNumberId } from "../_constants";
import { useWorkOrderDashboard } from "../_hooks/useWorkOrderDashboard";
import StatTile from "./StatTile";
import ReguBar from "./ReguBar";
import SectionLabel from "./SectionLabel";

interface WorkOrderDashboardProps {
  user: CurrentUser;
  bulan: number;
  tahun: number;
  ulpFilter: string | null;
}

interface ReguAgg {
  regu: string;
  total: number;
  selesai: number;
  vol: Map<string, { total: number; selesai: number }>;
}

export default function WorkOrderDashboard({ user, bulan, tahun, ulpFilter }: WorkOrderDashboardProps) {
  const { items, batchMeta, batchCount, loading } = useWorkOrderDashboard(user, bulan, tahun, ulpFilter);

  const stats = useMemo(() => {
    const volByUnit = new Map<string, { total: number; selesai: number }>();
    const reguMap = new Map<string, ReguAgg>();
    let selesai = 0, verified = 0, approved = 0, slaOk = 0, slaNot = 0;

    for (const it of items) {
      const done = it.status === "Selesai";
      if (done) selesai += 1;
      if (it.verified_at) { verified += 1; if (it.sla_ok === true) slaOk += 1; else if (it.sla_ok === false) slaNot += 1; }
      if (it.approved_at) approved += 1;

      const meta = batchMeta.get(it.batch_id);
      const unit = meta?.measure_column ? meta.measure_unit || "kms" : null;
      const v = meta?.measure_column ? parseLocaleNumber(it.data[meta.measure_column]) ?? 0 : 0;

      const rkey = it.regu ?? "Belum ditugaskan";
      const r = reguMap.get(rkey) ?? { regu: rkey, total: 0, selesai: 0, vol: new Map() };
      r.total += 1;
      if (done) r.selesai += 1;

      if (unit) {
        const g = volByUnit.get(unit) ?? { total: 0, selesai: 0 };
        g.total += v;
        if (done) g.selesai += v;
        volByUnit.set(unit, g);

        const rv = r.vol.get(unit) ?? { total: 0, selesai: 0 };
        rv.total += v;
        if (done) rv.selesai += v;
        r.vol.set(unit, rv);
      }
      reguMap.set(rkey, r);
    }

    const total = items.length;
    return {
      total,
      selesai,
      belum: total - selesai,
      pct: total ? Math.round((selesai / total) * 100) : 0,
      verified,
      approved,
      approvedPct: total ? Math.round((approved / total) * 100) : 0,
      slaOk,
      slaNot,
      units: [...volByUnit.keys()],
      volByUnit,
      perRegu: [...reguMap.values()].sort((a, b) => b.total - a.total),
    };
  }, [items, batchMeta]);

  const [basis, setBasis] = useState<string>("count");
  const activeUnit = basis !== "count" && stats.units.includes(basis) ? basis : null;

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <div className="w-8 h-8 border-4 border-[#E2E8F0] border-t-[#00897B] rounded-full animate-spin" />
      </div>
    );
  }

  if (batchCount === 0) {
    return (
      <div className="bg-white rounded-xl shadow-sm border border-[#E2E8F0] p-12 text-center">
        <ClipboardList size={40} className="mx-auto text-[#B2DFDB]" />
        <p className="mt-3 text-[#5D6D7E]">Belum ada WO untuk periode ini.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Ringkasan jumlah WO */}
      <div>
        <SectionLabel icon={ListChecks}>Berdasarkan Jumlah WO · {batchCount} WO periode ini</SectionLabel>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <StatTile label="Total Baris" value={stats.total} tone="slate" icon={ListChecks} />
          <StatTile label="Selesai" value={stats.selesai} tone="green" icon={CheckCircle2} />
          <StatTile label="Belum" value={stats.belum} tone="orange" icon={Clock} />
          <StatTile label="Realisasi" value={`${stats.pct}%`} tone="teal" icon={Percent} />
        </div>
      </div>

      {/* Volume per satuan (mis. kms) */}
      {stats.units.map((unit) => {
        const g = stats.volByUnit.get(unit)!;
        const pct = g.total > 0 ? Math.round((g.selesai / g.total) * 100) : 0;
        return (
          <div key={unit}>
            <SectionLabel icon={Ruler}>Berdasarkan Volume ({unit})</SectionLabel>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              <StatTile label={`Total ${unit}`} value={formatNumberId(g.total)} tone="slate" icon={Ruler} />
              <StatTile label={`Selesai ${unit}`} value={formatNumberId(g.selesai)} tone="green" icon={CheckCircle2} />
              <StatTile label={`Sisa ${unit}`} value={formatNumberId(g.total - g.selesai)} tone="orange" icon={Clock} />
              <StatTile label="Realisasi" value={`${pct}%`} tone="teal" icon={Percent} />
            </div>
          </div>
        );
      })}

      {/* Alur persetujuan */}
      <div>
        <SectionLabel icon={ShieldCheck}>Alur Persetujuan</SectionLabel>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <StatTile label="Dikerjakan" value={stats.selesai} tone="slate" icon={CheckCircle2} />
          <StatTile label="Diverifikasi" value={stats.verified} tone="teal" icon={ShieldCheck} />
          <StatTile label="Disetujui" value={stats.approved} tone="green" icon={CheckCircle2} />
          <StatTile label="Realisasi Disetujui" value={`${stats.approvedPct}%`} tone="teal" icon={Percent} />
        </div>
        {stats.verified > 0 && (
          <p className="text-xs text-[#5D6D7E] mt-2">
            SLA: <b className="text-green-600">{stats.slaOk} sesuai</b> · <b className="text-red-600">{stats.slaNot} tidak sesuai</b>
          </p>
        )}
      </div>

      {/* Per regu (lintas semua WO bulan ini) */}
      <div className="bg-white rounded-xl shadow-sm border border-[#E2E8F0] p-5">
        <div className="flex items-center justify-between gap-3 mb-4">
          <p className="flex items-center gap-2 text-sm font-semibold text-[#1B2631]">
            <Users size={16} className="text-[#00897B]" /> Realisasi per Regu
          </p>
          {stats.units.length > 0 && (
            <div className="flex gap-0.5 bg-[#F4F6F8] rounded-lg p-0.5 text-xs flex-wrap">
              {["count", ...stats.units].map((key) => (
                <button
                  key={key}
                  onClick={() => setBasis(key)}
                  className={`px-2.5 py-1 rounded-md font-medium transition-colors ${
                    basis === key ? "bg-white text-[#00695C] shadow-sm" : "text-[#5D6D7E] hover:text-[#1B2631]"
                  }`}
                >
                  {key === "count" ? "Jumlah" : key}
                </button>
              ))}
            </div>
          )}
        </div>

        {stats.perRegu.length === 0 ? (
          <p className="text-sm text-[#5D6D7E]">Belum ada data.</p>
        ) : (
          <div className="space-y-4">
            {stats.perRegu.map((r) => {
              const rv = activeUnit ? r.vol.get(activeUnit) ?? { total: 0, selesai: 0 } : null;
              const done = rv ? rv.selesai : r.selesai;
              const tot = rv ? rv.total : r.total;
              const pct = tot > 0 ? Math.round((done / tot) * 100) : 0;
              return (
                <ReguBar
                  key={r.regu}
                  label={r.regu}
                  done={done}
                  total={tot}
                  pct={pct}
                  suffix={activeUnit ?? undefined}
                  fmt={rv ? formatNumberId : undefined}
                  muted={r.regu === "Belum ditugaskan"}
                />
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
