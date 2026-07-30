"use client";

import { Activity, TrendingUp } from "lucide-react";
import { CARD, PANEL_HEAD } from "@/app/admin/_ui";
import {
  RadialBarChart, RadialBar, PolarAngleAxis,
  AreaChart, Area, ResponsiveContainer,
} from "recharts";
import { SURFACE, STATUS_COLOR, CHART_SERIES } from "@/lib/chartColors";
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
  if (level === "kritis") return STATUS_COLOR.kritis;
  if (level === "waspada") return STATUS_COLOR.waspada;
  return STATUS_COLOR.aman;
}

export default function RiskGaugeHero({ riskData, dateTgl, trend, loading }: Props) {
  const top = riskData[0];
  const color = top ? levelColor(top.risk_level) : STATUS_COLOR.aman;
  const score = top?.risk_score ?? 0;
  const top5 = riskData.slice(0, 5);
  const besok = dateTgl
    ? new Date(dateTgl + "T00:00:00").toLocaleDateString("id-ID", { weekday: "long", day: "numeric", month: "long" })
    : null;

  return (
    <div className={`flex flex-col h-full ${CARD}`}>
      <div className={`${PANEL_HEAD}`}>
        <Activity size={14} className="text-accent-deep" />
        <span className="text-white font-bold text-xs tracking-wider uppercase">Smart Predictive Engine</span>
        {besok && <span className="ml-auto text-accent-deep/70 text-[10px] font-mono">Prediksi {besok}</span>}
      </div>

      {loading ? (
        <div className="flex-1 flex items-center justify-center min-h-[200px]">
          <div className="w-6 h-6 border-2 border-line border-t-navy-600 rounded-full animate-spin" />
        </div>
      ) : !top ? (
        <div className="flex-1 flex flex-col items-center justify-center min-h-[200px] gap-1 text-center px-4">
          <span className="text-[12px] text-ink-soft">Belum ada prediksi risiko</span>
          <span className="text-[10px] text-ink-muted">Pipeline ML belum berjalan</span>
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
                    background={{ fill: SURFACE.page }}
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
                <span className="text-[9px] text-ink-soft uppercase tracking-widest mt-1">skor risiko</span>
              </div>
            </div>
            <div className="text-center mt-1">
              <div className="text-sm font-bold text-ink leading-tight">{top.penyulang}</div>
              <div className="text-[10px] text-ink-soft">
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
                    <span className="text-[10px] font-mono text-ink-muted w-3 shrink-0">{i + 1}</span>
                    <span className="flex-1 text-[11px] text-ink truncate">{r.penyulang}</span>
                    <div className="w-16 h-1.5 bg-surface rounded-full overflow-hidden shrink-0">
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
              <div className="flex items-center gap-1 text-[9px] text-ink-muted uppercase tracking-wider mb-0.5">
                <TrendingUp size={10} /> Gangguan 30 hari
              </div>
              <div className="h-[52px]">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={trend} margin={{ top: 2, right: 2, bottom: 0, left: 2 }}>
                    <defs>
                      <linearGradient id="trendFill" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor={CHART_SERIES[1]} stopOpacity={0.5} />
                        <stop offset="100%" stopColor={CHART_SERIES[1]} stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <Area
                      type="monotone"
                      dataKey="count"
                      stroke={CHART_SERIES[1]}
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
