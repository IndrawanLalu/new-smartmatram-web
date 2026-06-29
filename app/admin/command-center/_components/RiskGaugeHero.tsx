"use client";

import { Activity, TrendingUp } from "lucide-react";
import {
  RadialBarChart, RadialBar, PolarAngleAxis,
  AreaChart, Area, ResponsiveContainer,
} from "recharts";
import type { FeederRisk } from "../_hooks/useFeederRisk";

interface TrendPoint {
  label: string;
  count: number;
}

interface Props {
  riskData: FeederRisk[];
  dateTgl: string | null;
  trend: TrendPoint[];
  loading: boolean;
}

function levelColor(level: FeederRisk["risk_level"]): string {
  if (level === "kritis") return "#ef4444";
  if (level === "waspada") return "#f59e0b";
  return "#10b981";
}

export default function RiskGaugeHero({ riskData, dateTgl, trend, loading }: Props) {
  const top = riskData[0];
  const color = top ? levelColor(top.risk_level) : "#10b981";
  const score = top?.risk_score ?? 0;
  const top5 = riskData.slice(0, 5);
  const besok = dateTgl
    ? new Date(dateTgl + "T00:00:00").toLocaleDateString("id-ID", { weekday: "long", day: "numeric", month: "long" })
    : null;

  return (
    <div className="flex flex-col h-full bg-[#162334] rounded-xl border border-[#1e3552] shadow-sm overflow-hidden">
      <div className="bg-linear-to-r from-[#0d1f38] to-[#0a2a3a] px-4 py-2.5 flex items-center gap-2 shrink-0">
        <Activity size={14} className="text-[#5eead4]" />
        <span className="text-white font-bold text-xs tracking-wider uppercase">Smart Predictive Engine</span>
        {besok && <span className="ml-auto text-[#5eead4]/70 text-[10px] font-mono">Prediksi {besok}</span>}
      </div>

      {loading ? (
        <div className="flex-1 flex items-center justify-center min-h-[200px]">
          <div className="w-6 h-6 border-2 border-[#1e3552] border-t-[#5eead4] rounded-full animate-spin" />
        </div>
      ) : !top ? (
        <div className="flex-1 flex flex-col items-center justify-center min-h-[200px] gap-1 text-center px-4">
          <span className="text-[12px] text-[#94a3b8]">Belum ada prediksi risiko</span>
          <span className="text-[10px] text-[#475569]">Pipeline ML belum berjalan</span>
        </div>
      ) : (
        <div className="flex-1 grid grid-cols-1 sm:grid-cols-[180px_1fr] gap-3 p-3">
          {/* Gauge */}
          <div className="flex flex-col items-center justify-center">
            <div className="relative w-[160px] h-[130px]">
              <ResponsiveContainer width="100%" height="100%">
                <RadialBarChart
                  innerRadius="72%"
                  outerRadius="100%"
                  data={[{ value: score }]}
                  startAngle={220}
                  endAngle={-40}
                >
                  <PolarAngleAxis type="number" domain={[0, 100]} angleAxisId={0} tick={false} />
                  <RadialBar
                    dataKey="value"
                    cornerRadius={10}
                    fill={color}
                    background={{ fill: "#0d1b2a" }}
                    angleAxisId={0}
                    isAnimationActive
                    animationDuration={1000}
                  />
                </RadialBarChart>
              </ResponsiveContainer>
              <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none pb-3">
                <span className="text-4xl font-bold leading-none" style={{ color }}>
                  {score.toFixed(0)}
                </span>
                <span className="text-[9px] text-[#94a3b8] uppercase tracking-widest mt-1">skor risiko</span>
              </div>
            </div>
            <div className="text-center mt-1">
              <div className="text-sm font-bold text-[#e2e8f0] leading-tight">{top.penyulang}</div>
              <div className="text-[10px] text-[#94a3b8]">
                {top.ulp}
                {top.predicted_cause && <> · {top.predicted_cause}</>}
              </div>
            </div>
          </div>

          {/* Top-5 + tren */}
          <div className="flex flex-col min-w-0 gap-2">
            <div className="space-y-1">
              {top5.map((r, i) => {
                const c = levelColor(r.risk_level);
                return (
                  <div key={r.id} className="flex items-center gap-2">
                    <span className="text-[10px] font-mono text-[#475569] w-3 shrink-0">{i + 1}</span>
                    <span className="flex-1 text-[11px] text-[#cbd5e1] truncate">{r.penyulang}</span>
                    <div className="w-16 h-1.5 bg-[#0d1b2a] rounded-full overflow-hidden shrink-0">
                      <div className="h-full rounded-full" style={{ width: `${r.risk_score}%`, backgroundColor: c }} />
                    </div>
                    <span className="text-[10px] font-mono font-bold w-6 text-right shrink-0" style={{ color: c }}>
                      {r.risk_score.toFixed(0)}
                    </span>
                  </div>
                );
              })}
            </div>

            <div className="mt-auto">
              <div className="flex items-center gap-1 text-[9px] text-[#64748b] uppercase tracking-wider mb-0.5">
                <TrendingUp size={10} /> Gangguan 30 hari
              </div>
              <div className="h-[52px]">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={trend} margin={{ top: 2, right: 2, bottom: 0, left: 2 }}>
                    <defs>
                      <linearGradient id="trendFill" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#5eead4" stopOpacity={0.5} />
                        <stop offset="100%" stopColor="#5eead4" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <Area
                      type="monotone"
                      dataKey="count"
                      stroke="#5eead4"
                      strokeWidth={1.5}
                      fill="url(#trendFill)"
                      isAnimationActive
                      animationDuration={900}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
