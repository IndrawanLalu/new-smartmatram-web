"use client";

import { Brain } from "lucide-react";
import { CARD, PANEL_HEAD } from "@/app/admin/_ui";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from "recharts";
import { useCauseAnalysis } from "../_hooks/useCauseAnalysis";
import { CAUSE_COLORS, type CauseClass } from "@/lib/causeClass";
import { CHART_OTHER, TOOLTIP_LIGHT } from "@/lib/chartColors";
import type { CurrentUser } from "@/lib/roles";

interface Props {
  user: CurrentUser | null;
}

export default function CauseDonut({ user }: Props) {
  const { slices, unknownTotal, grandTotal, loading } = useCauseAnalysis(user);
  const unknownPct = grandTotal ? Math.round((unknownTotal / grandTotal) * 100) : 0;
  const data = slices.map((s) => ({ ...s, color: CAUSE_COLORS[s.cause as CauseClass] ?? CHART_OTHER }));

  return (
    <div className={`flex flex-col h-full ${CARD}`}>
      <div className={`${PANEL_HEAD}`}>
        <Brain size={14} className="text-white/80" />
        <div className="flex flex-col leading-tight">
          <span className="text-white font-semibold text-xs">Penyebab Gangguan Terurai · Model B</span>
          <span className="text-white/70 text-[10px]">
            {unknownTotal} gangguan tanpa catatan · {unknownPct}% dari {grandTotal} total
          </span>
        </div>
      </div>

      <div className="flex-1 p-3">
        {loading ? (
          <div className="flex items-center justify-center h-full min-h-[180px]">
            <div className="w-5 h-5 border-2 border-line border-t-navy-600 rounded-full animate-spin" />
          </div>
        ) : data.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full min-h-[180px] gap-1 text-center">
            <span className="text-[12px] text-ink-soft">Belum ada hasil prediksi penyebab</span>
            <span className="text-[10px] text-ink-muted">Pipeline ML (Model B) belum berjalan</span>
          </div>
        ) : (
          <div className="flex items-center gap-3 h-full">
            {/* Donut + center label */}
            <div className="relative w-[150px] h-[150px] shrink-0">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={data}
                    dataKey="count"
                    nameKey="cause"
                    cx="50%"
                    cy="50%"
                    innerRadius={48}
                    outerRadius={70}
                    paddingAngle={2}
                    stroke="none"
                    startAngle={90}
                    endAngle={-270}
                    isAnimationActive
                    animationDuration={900}
                  >
                    {data.map((d) => (
                      <Cell key={d.cause} fill={d.color} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={TOOLTIP_LIGHT}
                    formatter={(value, name) => [`${value} kejadian`, name]}
                  />
                </PieChart>
              </ResponsiveContainer>
              <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                <span className="text-2xl font-bold text-accent-deep leading-none">{unknownTotal}</span>
                <span className="text-[9px] text-ink-soft uppercase tracking-wider mt-0.5">terurai</span>
              </div>
            </div>

            {/* Legenda */}
            <div className="flex-1 min-w-0 space-y-1.5">
              {data.map((d) => (
                <div key={d.cause} className="flex items-center gap-2">
                  <span className="shrink-0 h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: d.color }} />
                  <span className="flex-1 text-[12px] text-ink truncate">{d.cause}</span>
                  <span className="text-[12px] font-mono font-bold text-ink">{d.count}</span>
                  <span className="text-[10px] text-ink-muted w-9 text-right">{d.pct}%</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
