"use client";

import {
  LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer, ReferenceLine,
} from "recharts";
import { TrendingUp, AlertTriangle } from "lucide-react";
import { useMemo } from "react";
import type { TrendPoint } from "../_hooks/useAdvancedDashboard";

interface Props {
  points: TrendPoint[];
  loading?: boolean;
}

const SECTION_DESC = `Tren harian gangguan dilengkapi Moving Average 7-hari (MA7) untuk menghilangkan noise.
Lonjakan jauh di atas MA7 mengindikasikan anomali atau kejadian luar biasa yang perlu investigasi.`;

export default function TrendWithMA({ points, loading = false }: Props) {
  const stats = useMemo(() => {
    if (!points.length) return null;
    const counts = points.map((p) => p.count);
    const avg = counts.reduce((s, c) => s + c, 0) / counts.length;
    const threshold = avg * 2.5;
    const anomalies = points.filter((p) => p.count >= threshold && p.count > 0);
    const maxDay = points.reduce((a, b) => (b.count > a.count ? b : a), points[0]);
    return { avg: parseFloat(avg.toFixed(1)), threshold: parseFloat(threshold.toFixed(1)), anomalies, maxDay };
  }, [points]);

  const xInterval = Math.max(0, Math.floor(points.length / 14) - 1);

  return (
    <div className="bg-white rounded-xl border border-line shadow-sm">
      <div className="px-5 pt-5 pb-3">
        <div className="flex items-center gap-3 mb-2">
          <div className="p-2 bg-brand-50 rounded-lg">
            <TrendingUp className="w-5 h-5 text-brand-600" />
          </div>
          <div>
            <h3 className="text-ink font-bold text-lg">Tren Harian + Moving Average 7-Hari</h3>
            <p className="text-ink-soft text-xs mt-0.5">Deteksi anomali dan pola lonjakan gangguan</p>
          </div>
        </div>
        <p className="text-ink-soft text-xs leading-relaxed border-l-2 border-brand-300 pl-3">{SECTION_DESC}</p>

        {!loading && stats && (
          <div className="mt-3 flex flex-wrap gap-3">
            <div className="bg-white border border-line rounded-lg px-3 py-2">
              <p className="text-ink font-bold">{stats.avg}</p>
              <p className="text-ink-soft text-xs">rata-rata/hari</p>
            </div>
            <div className="bg-white border border-line rounded-lg px-3 py-2">
              <p className="text-brand-700 font-bold">{stats.maxDay.count}</p>
              <p className="text-ink-soft text-xs">puncak: {stats.maxDay.label}</p>
            </div>
            {stats.anomalies.length > 0 && (
              <div className="bg-orange-50 border border-orange-200 rounded-lg px-3 py-2 flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-orange-600" />
                <div>
                  <p className="text-orange-600 font-bold">{stats.anomalies.length}</p>
                  <p className="text-ink-soft text-xs">hari anomali (&gt;{stats.threshold}x)</p>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      <div className="px-5 pb-5">
        {loading ? (
          <div className="h-72 flex items-center justify-center">
            <div className="w-8 h-8 border-4 border-line border-t-brand-600 rounded-full animate-spin" />
          </div>
        ) : points.length === 0 ? (
          <div className="h-72 flex items-center justify-center text-ink-soft">Tidak ada data</div>
        ) : (
          <>
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={points} margin={{ top: 5, right: 20, bottom: 60, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(15,26,46,0.08)" />
                <XAxis dataKey="label" stroke="rgba(15,26,46,0.35)" style={{ fontSize: "10px" }} angle={-45} textAnchor="end" height={70} interval={xInterval} tick={{ fill: "rgba(15,26,46,0.65)" }} />
                <YAxis stroke="rgba(15,26,46,0.35)" style={{ fontSize: "10px" }} tick={{ fill: "rgba(15,26,46,0.65)" }} allowDecimals={false} />
                <Tooltip
                  contentStyle={{ background: "#ffffff", border: "1px solid #e4e8f0", borderRadius: "8px" }}
                  labelStyle={{ color: "#0f1a2e", fontWeight: 600 }}
                  itemStyle={{ fontSize: "12px" }}
                />
                <Legend wrapperStyle={{ color: "rgba(15,26,46,0.65)", fontSize: "11px", paddingTop: "4px" }} />
                {stats && <ReferenceLine y={stats.threshold} stroke="rgba(249,115,22,0.5)" strokeDasharray="4 4" label={{ value: "Batas Anomali", fill: "rgba(249,115,22,0.7)", fontSize: 9 }} />}
                <Line type="monotone" dataKey="count" name="Gangguan Harian" stroke="rgba(94,234,212,0.6)" strokeWidth={1.5} dot={false} />
                <Line type="monotone" dataKey="ma7" name="MA 7 Hari" stroke="#2f55b0" strokeWidth={2.5} dot={false} strokeDasharray="0" />
              </LineChart>
            </ResponsiveContainer>

            {stats && stats.anomalies.length > 0 && (
              <div className="mt-3 bg-orange-50 border border-orange-200 rounded-lg p-3">
                <p className="text-orange-700 text-xs font-medium mb-1">Hari Anomali (gangguan &gt; {stats.threshold}x rata-rata):</p>
                <div className="flex flex-wrap gap-2">
                  {stats.anomalies.slice(0, 8).map((a) => (
                    <span key={a.date} className="text-xs px-2 py-0.5 bg-orange-900/40 border border-orange-700/40 rounded text-orange-700">
                      {a.label} ({a.count}x)
                    </span>
                  ))}
                  {stats.anomalies.length > 8 && <span className="text-xs text-ink-soft">+{stats.anomalies.length - 8} lainnya</span>}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
