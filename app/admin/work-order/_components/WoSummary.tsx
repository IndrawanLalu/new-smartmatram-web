"use client";

import { useState } from "react";
import { CheckCircle2, Clock, Ruler, Users } from "lucide-react";
import { formatNumberId } from "../_constants";
import { CARD, DISPLAY } from "@/app/admin/_ui";
import { REGU_KOSONG, type WoStats } from "../_lib/woStats";
import StatTile from "@/app/admin/_components/StatTile";
import ReguBar from "./ReguBar";
import WoProgressCard from "./WoProgressCard";
import StageFunnel from "./StageFunnel";

/**
 * Ringkasan realisasi WO — dipakai dashboard periode (lintas WO)
 * maupun dashboard satu WO. Sumber angkanya sama: buildWoStats().
 */
export default function WoSummary({ stats, caption }: { stats: WoStats; caption: string }) {
  return (
    <div className="space-y-4">
      <div className="grid gap-4 lg:grid-cols-2">
        <WoProgressCard stats={stats} caption={caption} />
        <StageFunnel stats={stats} />
      </div>

      {stats.units.map((unit) => {
        const g = stats.volByUnit.get(unit)!;
        const pct = g.total > 0 ? Math.round((g.selesai / g.total) * 100) : 0;
        return (
          <div key={unit} className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <StatTile label={`Total ${unit}`} value={formatNumberId(g.total)} tone="navy" icon={Ruler} />
            <StatTile label={`Selesai ${unit}`} value={formatNumberId(g.selesai)} tone="green" icon={CheckCircle2} />
            <StatTile label={`Sisa ${unit}`} value={formatNumberId(g.total - g.selesai)} tone="attention" icon={Clock} />
            <StatTile label={`Realisasi ${unit}`} value={`${pct}%`} tone="accent" icon={Ruler} />
          </div>
        );
      })}

      <ReguPanel stats={stats} />
    </div>
  );
}

function ReguPanel({ stats }: { stats: WoStats }) {
  const [basis, setBasis] = useState<string>("count");
  const unit = basis !== "count" && stats.units.includes(basis) ? basis : null;

  return (
    <div className={`${CARD} p-5`}>
      <div className="flex items-center justify-between gap-3 mb-4">
        <p className={`${DISPLAY} flex items-center gap-2 text-sm font-bold text-ink`}>
          <Users size={16} className="text-navy-500" /> Realisasi per Regu
        </p>
        {stats.units.length > 0 && (
          <div className="flex gap-0.5 bg-surface rounded-xl p-0.5 text-xs flex-wrap">
            {["count", ...stats.units].map((key) => (
              <button
                key={key}
                onClick={() => setBasis(key)}
                className={`px-2.5 py-1 rounded-lg font-medium transition-colors ${
                  basis === key ? "bg-white text-navy-600 shadow-sm" : "text-ink-soft hover:text-ink"
                }`}
              >
                {key === "count" ? "Jumlah" : key}
              </button>
            ))}
          </div>
        )}
      </div>

      {stats.byRegu.length === 0 ? (
        <p className="text-sm text-ink-soft">Belum ada data.</p>
      ) : (
        <div className="space-y-4">
          {stats.byRegu.map((r) => {
            const rv = unit ? r.vol.get(unit) ?? { total: 0, selesai: 0 } : null;
            const done = rv ? rv.selesai : r.selesai;
            const tot = rv ? rv.total : r.total;
            return (
              <ReguBar
                key={r.regu}
                label={r.regu}
                done={done}
                total={tot}
                pct={tot > 0 ? Math.round((done / tot) * 100) : 0}
                suffix={unit ?? undefined}
                fmt={rv ? formatNumberId : undefined}
                muted={r.regu === REGU_KOSONG}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}
