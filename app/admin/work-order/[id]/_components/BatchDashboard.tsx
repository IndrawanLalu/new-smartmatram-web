"use client";

import { useMemo, useState } from "react";
import { ListChecks, CheckCircle2, Clock, Percent, Ruler, Users, ShieldCheck } from "lucide-react";
import { parseLocaleNumber } from "@/lib/parseLocaleNumber";
import { formatNumberId } from "../../_constants";
import type { WoBatch, WoItem } from "../../_types";
import StatTile from "../../_components/StatTile";
import ReguBar from "../../_components/ReguBar";
import SectionLabel from "../../_components/SectionLabel";

interface BatchDashboardProps {
  batch: WoBatch;
  items: WoItem[];
}

export default function BatchDashboard({ batch, items }: BatchDashboardProps) {
  const measureCol = batch.measure_column;
  const unit = batch.measure_unit || "kms";
  const hasMeasure = !!measureCol;

  const stats = useMemo(() => {
    const measureOf = (it: WoItem) =>
      measureCol ? parseLocaleNumber(it.data[measureCol]) ?? 0 : 0;

    let volTotal = 0;
    let volSelesai = 0;
    const map = new Map<string, { total: number; selesai: number; volTotal: number; volSelesai: number }>();

    for (const it of items) {
      const v = measureOf(it);
      volTotal += v;
      const done = it.status === "Selesai";
      if (done) volSelesai += v;

      const key = it.regu ?? "Belum ditugaskan";
      const s = map.get(key) ?? { total: 0, selesai: 0, volTotal: 0, volSelesai: 0 };
      s.total += 1;
      s.volTotal += v;
      if (done) { s.selesai += 1; s.volSelesai += v; }
      map.set(key, s);
    }

    const total = items.length;
    const selesai = items.filter((i) => i.status === "Selesai").length;
    const verified = items.filter((i) => i.verified_at).length;
    const approved = items.filter((i) => i.approved_at).length;
    const slaOk = items.filter((i) => i.verified_at && i.sla_ok === true).length;
    const slaNot = items.filter((i) => i.verified_at && i.sla_ok === false).length;
    const byRegu = [...map.entries()]
      .map(([regu, s]) => ({ regu, ...s }))
      .sort((a, b) => b.total - a.total);

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
      volTotal,
      volSelesai,
      volPct: volTotal > 0 ? Math.round((volSelesai / volTotal) * 100) : 0,
      byRegu,
    };
  }, [items, measureCol]);

  const [basis, setBasis] = useState<"count" | "measure">(hasMeasure ? "measure" : "count");
  const useMeasure = hasMeasure && basis === "measure";

  return (
    <div className="space-y-6">
      {/* Tiles: jumlah WO */}
      <div>
        <SectionLabel icon={ListChecks}>Berdasarkan Jumlah WO</SectionLabel>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <StatTile label="Total WO" value={stats.total} tone="slate" icon={ListChecks} />
          <StatTile label="Selesai" value={stats.selesai} tone="green" icon={CheckCircle2} />
          <StatTile label="Belum" value={stats.belum} tone="orange" icon={Clock} />
          <StatTile label="Realisasi" value={`${stats.pct}%`} tone="teal" icon={Percent} />
        </div>
      </div>

      {/* Tiles: volume/kms */}
      {hasMeasure && (
        <div>
          <SectionLabel icon={Ruler}>Berdasarkan Volume ({unit})</SectionLabel>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <StatTile label={`Total ${unit}`} value={formatNumberId(stats.volTotal)} tone="slate" icon={Ruler} />
            <StatTile label={`Selesai ${unit}`} value={formatNumberId(stats.volSelesai)} tone="green" icon={CheckCircle2} />
            <StatTile label={`Sisa ${unit}`} value={formatNumberId(stats.volTotal - stats.volSelesai)} tone="orange" icon={Clock} />
            <StatTile label="Realisasi" value={`${stats.volPct}%`} tone="teal" icon={Percent} />
          </div>
        </div>
      )}

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

      {/* Per regu */}
      <div className="bg-white rounded-xl shadow-sm border border-[#E2E8F0] p-5">
        <div className="flex items-center justify-between gap-3 mb-4">
          <p className="flex items-center gap-2 text-sm font-semibold text-[#1B2631]">
            <Users size={16} className="text-[#00897B]" /> Realisasi per Regu
          </p>
          {hasMeasure && (
            <div className="flex gap-0.5 bg-[#F4F6F8] rounded-lg p-0.5 text-xs">
              {([
                { key: "measure", label: unit },
                { key: "count", label: "Jumlah" },
              ] as const).map(({ key, label }) => (
                <button
                  key={key}
                  onClick={() => setBasis(key)}
                  className={`px-2.5 py-1 rounded-md font-medium transition-colors ${
                    basis === key ? "bg-white text-[#00695C] shadow-sm" : "text-[#5D6D7E] hover:text-[#1B2631]"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          )}
        </div>

        {stats.byRegu.length === 0 ? (
          <p className="text-sm text-[#5D6D7E]">Belum ada data.</p>
        ) : (
          <div className="space-y-4">
            {stats.byRegu.map((r) => {
              const done = useMeasure ? r.volSelesai : r.selesai;
              const tot = useMeasure ? r.volTotal : r.total;
              const pct = tot > 0 ? Math.round((done / tot) * 100) : 0;
              return (
                <ReguBar
                  key={r.regu}
                  label={r.regu}
                  done={done}
                  total={tot}
                  pct={pct}
                  suffix={useMeasure ? unit : undefined}
                  fmt={useMeasure ? formatNumberId : undefined}
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
