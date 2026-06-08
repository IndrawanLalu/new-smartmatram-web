"use client";

import { useMemo, useState } from "react";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer,
} from "recharts";
import { TrendingUp, Calendar, ShieldCheck } from "lucide-react";

interface UlpStreak {
  ulp: string;
  days: number;
  from: string;
  to: string;
}

interface TrendChartProps {
  dailyTrend?: Record<string, number>;
  monthlyTrend?: Record<string, number>;
  rangeStart?: string;
  rangeEnd?: string;
  ulpStreaks?: UlpStreak[];
  loading?: boolean;
}

function formatStreakDate(dateStr: string): string {
  if (!dateStr) return "-";
  const d = new Date(dateStr + "T12:00:00");
  return d.toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" });
}

export default function TrendChart({
  dailyTrend = {},
  monthlyTrend = {},
  rangeStart,
  rangeEnd,
  ulpStreaks = [],
  loading = false,
}: TrendChartProps) {
  const [viewMode, setViewMode] = useState<"daily" | "monthly">("daily");

  const dailyData = useMemo(() => {
    if (rangeStart && rangeEnd) {
      const result = [];
      const cur = new Date(rangeStart + "T12:00:00");
      const end = new Date(rangeEnd + "T12:00:00");
      while (cur <= end) {
        const key = cur.toISOString().split("T")[0];
        result.push({
          date: cur.toLocaleDateString("id-ID", { day: "2-digit", month: "short" }),
          fullDate: key,
          count: dailyTrend[key] || 0,
        });
        cur.setDate(cur.getDate() + 1);
      }
      return result;
    }
    return Object.keys(dailyTrend)
      .sort()
      .map((date) => ({
        date: new Date(date + "T12:00:00").toLocaleDateString("id-ID", { day: "2-digit", month: "short" }),
        fullDate: date,
        count: dailyTrend[date] || 0,
      }));
  }, [dailyTrend, rangeStart, rangeEnd]);

  const monthlyData = useMemo(() => {
    if (!monthlyTrend || Object.keys(monthlyTrend).length === 0) return [];
    const monthMap: Record<string, string> = {
      JAN: "01", JANUARI: "01", FEB: "02", FEBRUARI: "02",
      MAR: "03", MARET: "03", APR: "04", APRIL: "04",
      MEI: "05", MAY: "05", JUN: "06", JUNI: "06",
      JUL: "07", JULI: "07", AGU: "08", AGUSTUS: "08", AUG: "08",
      SEP: "09", SEPTEMBER: "09", OKT: "10", OKTOBER: "10", OCT: "10",
      NOV: "11", NOVEMBER: "11", DES: "12", DESEMBER: "12", DEC: "12",
    };
    return Object.entries(monthlyTrend)
      .map(([key, count]) => {
        const [year, monthName] = key.split("-");
        const m = monthName?.toUpperCase() ?? "";
        return {
          sortKey: `${year}-${monthMap[m] ?? "01"}`,
          month: `${m.substring(0, 3)} ${year}`,
          count,
        };
      })
      .sort((a, b) => a.sortKey.localeCompare(b.sortKey));
  }, [monthlyTrend]);

  const chartData = viewMode === "daily" ? dailyData : monthlyData;
  const hasData = chartData.length > 0;

  // Thin out X-axis labels when there are many data points
  const xInterval = viewMode === "daily"
    ? Math.max(0, Math.floor(dailyData.length / 14) - 1)
    : 0;

  const trendPercentage = useMemo(() => {
    if (chartData.length < 2) return 0;
    const latest = chartData[chartData.length - 1]?.count ?? 0;
    const previous = chartData[chartData.length - 2]?.count ?? 0;
    if (previous === 0) return 0;
    return (((latest - previous) / previous) * 100).toFixed(1);
  }, [chartData]);

  if (loading) {
    return (
      <div className="bg-[#162334] rounded-xl border border-[#1e3552] shadow-sm">
        <div className="h-80 flex items-center justify-center">
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
            <div className="p-2 bg-[#0a2a26] rounded-lg">
              <TrendingUp className="w-5 h-5 text-[#00897B]" />
            </div>
            <div>
              <h3 className="text-[#e2e8f0] font-bold text-lg">Trend Gangguan</h3>
              <p className="text-[#94a3b8] text-xs mt-1">
                {viewMode === "daily" ? "Harian" : "Bulanan"} distribution
              </p>
            </div>
          </div>
          <div className="flex gap-2">
            {(["daily", "monthly"] as const).map((mode) => (
              <button
                key={mode}
                onClick={() => setViewMode(mode)}
                className={`px-3 py-1 text-xs rounded-lg transition-all ${
                  viewMode === mode
                    ? "bg-[#00897B] text-white"
                    : "bg-[#0d1b2a] text-[#94a3b8] hover:bg-[#0a2a26]"
                }`}
              >
                {mode === "daily" ? "Harian" : "Bulanan"}
              </button>
            ))}
          </div>
        </div>

        {hasData && chartData.length >= 2 && (
          <div className="mt-3 flex items-center gap-2">
            <Calendar className="w-4 h-4 text-[#94a3b8]" />
            <span className="text-[#94a3b8] text-xs">Trend: </span>
            <span className={`text-sm font-bold ${parseFloat(String(trendPercentage)) > 0 ? "text-red-400" : "text-green-400"}`}>
              {parseFloat(String(trendPercentage)) > 0 ? "+" : ""}{trendPercentage}%
            </span>
          </div>
        )}
      </div>

      <div className="px-5 pb-5">
        {!hasData ? (
          <div className="h-64 flex items-center justify-center">
            <p className="text-[#94A3B8]">
              {viewMode === "daily" ? "Tidak ada data harian" : "Tidak ada data bulanan"}
            </p>
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.08)" />
              <XAxis
                dataKey={viewMode === "daily" ? "date" : "month"}
                stroke="rgba(255,255,255,0.5)"
                style={{ fontSize: "11px" }}
                angle={-45}
                textAnchor="end"
                height={80}
                interval={xInterval}
              />
              <YAxis stroke="rgba(255,255,255,0.5)" style={{ fontSize: "11px" }} allowDecimals={false} />
              <Tooltip
                contentStyle={{ background: "rgba(15,23,42,0.95)", border: "1px solid rgba(255,255,255,0.2)", borderRadius: "8px" }}
                labelStyle={{ color: "white", fontWeight: 600 }}
                itemStyle={{ color: "#6ee7b7" }}
              />
              <Legend wrapperStyle={{ color: "rgba(255,255,255,0.8)", fontSize: "12px" }} />
              <Line
                type="monotone"
                dataKey="count"
                name="Jumlah Gangguan"
                stroke="#00897B"
                strokeWidth={2.5}
                dot={false}
                activeDot={{ r: 5, fill: "#00695C" }}
              />
            </LineChart>
          </ResponsiveContainer>
        )}

        {hasData && (
          <div className="mt-3 flex items-center justify-between text-xs text-[#94A3B8]">
            <span>Total periode: {chartData.reduce((s, i) => s + i.count, 0)} gangguan</span>
            <span>{chartData.length} {viewMode === "daily" ? "hari" : "bulan"}</span>
          </div>
        )}

        {/* Longest no-gangguan streak per ULP — daily view only */}
        {viewMode === "daily" && ulpStreaks.length > 0 && (
          <div className="mt-4 pt-4 border-t border-[#1e3552]">
            <div className="flex items-center gap-2 mb-3">
              <ShieldCheck className="w-4 h-4 text-emerald-400" />
              <span className="text-[#94a3b8] text-xs font-medium uppercase tracking-wide">
                Rentang Terpanjang Tanpa Gangguan
              </span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {ulpStreaks.map(({ ulp, days, from, to }) => (
                <div key={ulp} className="bg-[#0d1b2a] border border-[#1e3552] rounded-lg px-4 py-3">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[#5eead4] text-xs font-semibold">{ulp}</span>
                    <span className="text-emerald-400 font-bold text-sm">{days} hari</span>
                  </div>
                  <p className="text-[#94a3b8] text-xs">
                    {formatStreakDate(from)} — {formatStreakDate(to)}
                  </p>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
