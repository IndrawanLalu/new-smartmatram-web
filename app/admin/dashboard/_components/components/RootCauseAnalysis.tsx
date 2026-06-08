"use client";

import { useMemo } from "react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, Cell,
} from "recharts";
import { AlertCircle, TrendingDown } from "lucide-react";

interface RootCauseAnalysisProps {
  penyebabCount?: Record<string, number>;
  loading?: boolean;
}

const COLORS = [
  "#ef4444", "#f97316", "#f59e0b", "#eab308", "#84cc16",
  "#22c55e", "#10b981", "#14b8a6", "#06b6d4", "#0ea5e9",
];

export default function RootCauseAnalysis({
  penyebabCount = {},
  loading = false,
}: RootCauseAnalysisProps) {
  const causesData = useMemo(() => {
    const sorted = Object.entries(penyebabCount).sort((a, b) => b[1] - a[1]).slice(0, 10);
    const total = sorted.reduce((s, [, c]) => s + c, 0);
    let cumulative = 0;
    return sorted.map(([cause, count]) => {
      cumulative += count;
      const pct = total > 0 ? ((count / total) * 100).toFixed(1) : "0";
      const cumPct = total > 0 ? ((cumulative / total) * 100).toFixed(1) : "0";
      const shortCause = cause.length > 30 ? cause.substring(0, 27) + "..." : cause;
      return {
        cause: shortCause,
        fullCause: cause,
        count,
        percentage: parseFloat(pct),
        cumulative: parseFloat(cumPct),
      };
    });
  }, [penyebabCount]);

  const top3Summary = useMemo(() => {
    if (causesData.length < 3) return null;
    const top3Total = causesData.slice(0, 3).reduce((s, i) => s + i.count, 0);
    const allTotal = Object.values(penyebabCount).reduce((s, c) => s + c, 0);
    return allTotal > 0 ? ((top3Total / allTotal) * 100).toFixed(1) : "0";
  }, [causesData, penyebabCount]);

  if (loading) {
    return (
      <div className="bg-[#162334] rounded-xl border border-[#1e3552] shadow-sm">
        <div className="h-96 flex items-center justify-center">
          <div className="w-8 h-8 border-4 border-[#1e3552] border-t-[#00897B] rounded-full animate-spin" />
        </div>
      </div>
    );
  }

  return (
    <div className="bg-[#162334] rounded-xl border border-[#1e3552] shadow-sm hover:shadow-md transition-shadow">
      <div className="px-5 pt-5 pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-red-900/20 rounded-lg">
              <AlertCircle className="w-5 h-5 text-red-400" />
            </div>
            <div>
              <h3 className="text-[#e2e8f0] text-lg font-bold">Root Cause Analysis</h3>
              <p className="text-[#94a3b8] text-xs mt-1">Top 10 penyebab gangguan</p>
            </div>
          </div>
          {top3Summary && (
            <div className="text-right">
              <p className="text-2xl font-bold text-yellow-600">{top3Summary}%</p>
              <p className="text-[#94a3b8] text-xs">Top 3 causes</p>
            </div>
          )}
        </div>

        {causesData.length > 0 && causesData[0].cumulative <= 80 && (
          <div className="mt-3 flex items-center gap-2 bg-yellow-900/20 border border-yellow-700/30 rounded-lg px-3 py-2">
            <TrendingDown className="w-4 h-4 text-yellow-400" />
            <span className="text-yellow-300 text-xs">
              Pareto Principle: Focus pada top causes untuk impact maksimal
            </span>
          </div>
        )}
      </div>

      <div className="px-5 pb-5">
        {causesData.length === 0 ? (
          <div className="h-80 flex items-center justify-center">
            <p className="text-[#94A3B8]">Tidak ada data penyebab gangguan</p>
          </div>
        ) : (
          <>
            <ResponsiveContainer width="100%" height={400}>
              <BarChart data={causesData} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.08)" />
                <XAxis type="number" stroke="rgba(255,255,255,0.5)" style={{ fontSize: "11px" }} />
                <YAxis
                  type="category"
                  dataKey="cause"
                  stroke="rgba(255,255,255,0.5)"
                  style={{ fontSize: "10px" }}
                  width={120}
                />
                <Tooltip
                  contentStyle={{ background: "rgba(15,23,42,0.95)", border: "1px solid rgba(255,255,255,0.2)", borderRadius: "8px" }}
                  labelStyle={{ color: "white", fontWeight: 600, fontSize: "11px" }}
                  itemStyle={{ color: "#6ee7b7" }}
                />
                <Bar dataKey="count" name="Jumlah" radius={[0, 8, 8, 0]}>
                  {causesData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>

            <div className="mt-4 grid grid-cols-2 gap-2">
              {causesData.slice(0, 4).map((item, i) => (
                <div key={i} className="flex items-center gap-2 text-xs">
                  <div className="w-3 h-3 rounded shrink-0" style={{ backgroundColor: COLORS[i] }} />
                  <span className="text-[#94a3b8] truncate">{item.cause}</span>
                  <span className="text-[#e2e8f0] font-semibold ml-auto">{item.count}</span>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
