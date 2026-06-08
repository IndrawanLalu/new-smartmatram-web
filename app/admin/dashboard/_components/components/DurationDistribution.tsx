"use client";

import { useMemo } from "react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, Cell,
} from "recharts";
import { Timer, Zap, AlertTriangle } from "lucide-react";

interface DurationDistributionProps {
  durasiArray?: number[];
  loading?: boolean;
}

const BUCKETS = [
  { min: 0, max: 300, label: "0-5 min", color: "#10b981" },
  { min: 300, max: 900, label: "5-15 min", color: "#22c55e" },
  { min: 900, max: 1800, label: "15-30 min", color: "#eab308" },
  { min: 1800, max: 3600, label: "30-60 min", color: "#f97316" },
  { min: 3600, max: 7200, label: "1-2 jam", color: "#ef4444" },
  { min: 7200, max: Infinity, label: "> 2 jam", color: "#dc2626" },
];

export default function DurationDistribution({
  durasiArray = [],
  loading = false,
}: DurationDistributionProps) {
  const histogramData = useMemo(() => {
    if (!Array.isArray(durasiArray) || durasiArray.length === 0) return [];
    return BUCKETS.map((b) => {
      const count = durasiArray.filter((d) => d >= b.min && d < b.max).length;
      const pct = durasiArray.length > 0 ? ((count / durasiArray.length) * 100).toFixed(1) : "0";
      return { label: b.label, count, percentage: parseFloat(pct), color: b.color };
    }).filter((i) => i.count > 0);
  }, [durasiArray]);

  const stats = useMemo(() => {
    if (!Array.isArray(durasiArray) || durasiArray.length === 0)
      return { avg: 0, median: 0, max: 0, min: 0 };
    const sorted = [...durasiArray].sort((a, b) => a - b);
    const avg = durasiArray.reduce((s, d) => s + d, 0) / durasiArray.length;
    return {
      avg: Math.round(avg / 60),
      median: Math.round(sorted[Math.floor(sorted.length / 2)] / 60),
      max: Math.round(sorted[sorted.length - 1] / 60),
      min: Math.round(sorted[0] / 60),
    };
  }, [durasiArray]);

  const severity = useMemo(() => ({
    quick: durasiArray.filter((d) => d <= 300).length,
    medium: durasiArray.filter((d) => d > 300 && d <= 1800).length,
    critical: durasiArray.filter((d) => d > 1800).length,
  }), [durasiArray]);

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
            <div className="p-2 bg-blue-900/20 rounded-lg">
              <Timer className="w-5 h-5 text-blue-400" />
            </div>
            <div>
              <h3 className="text-[#e2e8f0] text-lg font-bold">Duration Distribution</h3>
              <p className="text-[#94a3b8] text-xs mt-1">Distribusi lama gangguan</p>
            </div>
          </div>
          {histogramData.length > 0 && (
            <div className="text-right">
              <p className="text-2xl font-bold text-blue-600">{stats.avg}m</p>
              <p className="text-[#94a3b8] text-xs">Rata-rata</p>
            </div>
          )}
        </div>
      </div>

      <div className="px-5 pb-5">
        {histogramData.length === 0 ? (
          <div className="h-80 flex items-center justify-center">
            <p className="text-[#94A3B8]">Tidak ada data durasi</p>
          </div>
        ) : (
          <div className="space-y-4">
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={histogramData}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.08)" />
                <XAxis dataKey="label" stroke="rgba(255,255,255,0.5)" style={{ fontSize: "11px" }} />
                <YAxis stroke="rgba(255,255,255,0.5)" style={{ fontSize: "11px" }} />
                <Tooltip
                  contentStyle={{ background: "rgba(15,23,42,0.95)", border: "1px solid rgba(255,255,255,0.2)", borderRadius: "8px" }}
                  labelStyle={{ color: "white", fontWeight: 600 }}
                  itemStyle={{ color: "#6ee7b7" }}
                />
                <Bar dataKey="count" name="Jumlah" radius={[8, 8, 0, 0]}>
                  {histogramData.map((e, i) => <Cell key={i} fill={e.color} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {[
                { label: "Min", value: `${stats.min}m`, color: "text-green-600" },
                { label: "Median", value: `${stats.median}m`, color: "text-[#e2e8f0]" },
                { label: "Avg", value: `${stats.avg}m`, color: "text-blue-600" },
                { label: "Max", value: `${stats.max}m`, color: "text-red-600" },
              ].map(({ label, value, color }) => (
                <div key={label} className="bg-[#0d1b2a] rounded-lg p-3 border border-[#1e3552]">
                  <p className="text-[#94a3b8] text-xs mb-1">{label}</p>
                  <p className={`${color} font-bold text-xl`}>{value}</p>
                </div>
              ))}
            </div>

            <div className="grid grid-cols-3 gap-3">
              {[
                { label: "Quick Recovery", sublabel: "≤ 5 menit", count: severity.quick, bg: "bg-green-900/20", border: "border-green-700/30", text: "text-green-400", barBg: "bg-green-900/40", barFill: "bg-green-500", icon: <Zap className="w-4 h-4 text-green-400" /> },
                { label: "Medium", sublabel: "5-30 menit", count: severity.medium, bg: "bg-yellow-900/20", border: "border-yellow-700/30", text: "text-yellow-400", barBg: "bg-yellow-900/40", barFill: "bg-yellow-500", icon: <Timer className="w-4 h-4 text-yellow-400" /> },
                { label: "Critical", sublabel: "> 30 menit", count: severity.critical, bg: "bg-red-900/20", border: "border-red-700/30", text: "text-red-400", barBg: "bg-red-900/40", barFill: "bg-red-500", icon: <AlertTriangle className="w-4 h-4 text-red-400" /> },
              ].map(({ label, sublabel, count, bg, border, text, barBg, barFill, icon }) => (
                <div key={label} className={`${bg} border ${border} rounded-lg p-3`}>
                  <div className="flex items-center gap-2 mb-2">{icon}<span className={`${text} text-xs font-medium`}>{label}</span></div>
                  <p className="text-[#e2e8f0] font-bold text-2xl">{count}</p>
                  <p className="text-[#94a3b8] text-xs mt-1">{sublabel}</p>
                  <div className={`mt-2 ${barBg} rounded-full h-2`}>
                    <div
                      className={`${barFill} h-full rounded-full transition-all`}
                      style={{ width: `${durasiArray.length > 0 ? (count / durasiArray.length) * 100 : 0}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
