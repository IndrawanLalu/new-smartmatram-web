"use client";

import { Brain } from "lucide-react";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from "recharts";
import { useCauseAnalysis } from "../_hooks/useCauseAnalysis";
import { CAUSE_COLORS, type CauseClass } from "@/lib/causeClass";
import type { CurrentUser } from "@/lib/roles";

interface Props {
  user: CurrentUser | null;
}

export default function CauseDonut({ user }: Props) {
  const { slices, unknownTotal, grandTotal, loading } = useCauseAnalysis(user);
  const unknownPct = grandTotal ? Math.round((unknownTotal / grandTotal) * 100) : 0;
  const data = slices.map((s) => ({ ...s, color: CAUSE_COLORS[s.cause as CauseClass] ?? "#64748b" }));

  return (
    <div className="flex flex-col h-full bg-[#162334] rounded-xl border border-[#1e3552] shadow-sm overflow-hidden">
      <div className="bg-linear-to-r from-[#004D40] to-[#00897B] px-4 py-2.5 flex items-center gap-2 shrink-0">
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
            <div className="w-5 h-5 border-2 border-[#1e3552] border-t-[#5eead4] rounded-full animate-spin" />
          </div>
        ) : data.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full min-h-[180px] gap-1 text-center">
            <span className="text-[12px] text-[#94a3b8]">Belum ada hasil prediksi penyebab</span>
            <span className="text-[10px] text-[#475569]">Pipeline ML (Model B) belum berjalan</span>
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
                    contentStyle={{
                      background: "#0d1b2a",
                      border: "1px solid #1e3552",
                      borderRadius: 8,
                      fontSize: 11,
                      color: "#e2e8f0",
                    }}
                    formatter={(value, name) => [`${value} kejadian`, name]}
                  />
                </PieChart>
              </ResponsiveContainer>
              <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                <span className="text-2xl font-bold text-[#5eead4] leading-none">{unknownTotal}</span>
                <span className="text-[9px] text-[#94a3b8] uppercase tracking-wider mt-0.5">terurai</span>
              </div>
            </div>

            {/* Legenda */}
            <div className="flex-1 min-w-0 space-y-1.5">
              {data.map((d) => (
                <div key={d.cause} className="flex items-center gap-2">
                  <span className="shrink-0 h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: d.color }} />
                  <span className="flex-1 text-[12px] text-[#e2e8f0] truncate">{d.cause}</span>
                  <span className="text-[12px] font-mono font-bold text-[#e2e8f0]">{d.count}</span>
                  <span className="text-[10px] text-[#64748b] w-9 text-right">{d.pct}%</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
