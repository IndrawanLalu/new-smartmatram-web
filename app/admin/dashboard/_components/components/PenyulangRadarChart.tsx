"use client";

import { useMemo, useState } from "react";
import { Radar } from "react-chartjs-2";
import {
  Chart as ChartJS, RadialLinearScale, PointElement,
  LineElement, Filler, Tooltip, Legend,
} from "chart.js";
import { GitBranch } from "lucide-react";

ChartJS.register(RadialLinearScale, PointElement, LineElement, Filler, Tooltip, Legend);

type Row = Record<string, string>;

interface PenyulangRadarChartProps {
  filtered: Row[];
  penyulangCount: Record<string, number>;
  loading?: boolean;
}

const TOP_N = 5;
const AXES = ["Frek. Rendah", "Recovery Cepat", "Reliabilitas", "Durasi Singkat", "EF Control"];

const AXIS_DESC: Record<string, string> = {
  "Frek. Rendah":   "Makin sedikit gangguan = makin tinggi",
  "Recovery Cepat": "% gangguan selesai ≤ 5 menit",
  "Reliabilitas":   "% gangguan NON-critical (≤ 30 mnt)",
  "Durasi Singkat": "Makin pendek rata-rata durasi = makin tinggi",
  "EF Control":     "Makin sedikit Earth Fault = makin tinggi",
};

const COLORS = [
  { border: "rgba(239,68,68,1)",    bg: "rgba(239,68,68,0.15)" },
  { border: "rgba(249,115,22,1)",   bg: "rgba(249,115,22,0.15)" },
  { border: "rgba(234,179,8,1)",    bg: "rgba(234,179,8,0.15)" },
  { border: "rgba(168,85,247,1)",   bg: "rgba(168,85,247,0.15)" },
  { border: "rgba(59,130,246,1)",   bg: "rgba(59,130,246,0.15)" },
];

function toSecs(t: string | undefined): number {
  if (!t) return 0;
  try {
    const s = t.includes(".") ? t.split(".")[0] : t;
    const p = s.split(":").map((n) => parseInt(n) || 0);
    if (p.length === 3) return p[0] * 3600 + p[1] * 60 + p[2];
    if (p.length === 2) return p[0] * 60 + p[1];
    return p[0] ?? 0;
  } catch { return 0; }
}

export default function PenyulangRadarChart({ filtered, penyulangCount, loading = false }: PenyulangRadarChartProps) {
  const [mode, setMode] = useState<"worst" | "best">("worst");

  const { topList, scores } = useMemo(() => {
    const sorted = Object.entries(penyulangCount).sort((a, b) => b[1] - a[1]);
    const candidates = mode === "worst" ? sorted.slice(0, TOP_N) : sorted.slice(-TOP_N).reverse();
    const names = candidates.map(([p]) => p);

    type Acc = { count: number; quick: number; critical: number; totalDur: number; durCount: number; ef: number; faultable: number };
    const m: Record<string, Acc> = {};
    names.forEach(n => { m[n] = { count: 0, quick: 0, critical: 0, totalDur: 0, durCount: 0, ef: 0, faultable: 0 }; });

    filtered.forEach(row => {
      const p = row.PENYULANG_GANGGUAN?.trim();
      if (!p || !m[p]) return;
      m[p].count++;
      const dur = toSecs(row.DURASI);
      if (dur > 0) {
        m[p].totalDur += dur;
        m[p].durCount++;
        if (dur <= 300) m[p].quick++;
        if (dur > 1800) m[p].critical++;
      }
      if (row.INDIKATOR === "EF") { m[p].ef++; m[p].faultable++; }
      else if (row.INDIKATOR === "OC") m[p].faultable++;
    });

    const maxCount  = Math.max(...names.map(n => m[n]?.count ?? 0), 1);
    const maxAvgDur = Math.max(...names.map(n => m[n]?.durCount > 0 ? m[n].totalDur / m[n].durCount : 0), 1);

    const sc = names.map(name => {
      const d = m[name];
      if (!d) return [0, 0, 0, 0, 0];
      const freq        = Math.round((1 - d.count / maxCount) * 100);
      const recovery    = d.count > 0 ? Math.round((d.quick / d.count) * 100) : 0;
      const reliability = d.count > 0 ? Math.round((1 - d.critical / d.count) * 100) : 100;
      const avgDur      = d.durCount > 0 ? d.totalDur / d.durCount : 0;
      const durScore    = Math.round((1 - avgDur / maxAvgDur) * 100);
      const efControl   = d.faultable > 0 ? Math.round((1 - d.ef / d.faultable) * 100) : 100;
      return [freq, recovery, reliability, durScore, efControl];
    });

    return { topList: names, scores: sc };
  }, [filtered, penyulangCount, mode]);

  const hasData = topList.length > 0 && topList.some((_, i) => scores[i]?.some(v => v > 0));

  const chartData = {
    labels: AXES,
    datasets: topList.map((name, i) => ({
      label: name,
      data: scores[i] ?? [],
      borderColor: COLORS[i % COLORS.length].border,
      backgroundColor: COLORS[i % COLORS.length].bg,
      borderWidth: 2,
      pointBackgroundColor: COLORS[i % COLORS.length].border,
      pointRadius: 4,
      pointHoverRadius: 6,
    })),
  };

  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    scales: {
      r: {
        beginAtZero: true,
        max: 100,
        ticks: {
          stepSize: 25,
          color: "rgba(255,255,255,0.35)",
          font: { size: 9 },
          backdropColor: "transparent",
        },
        grid:       { color: "rgba(255,255,255,0.1)" },
        angleLines: { color: "rgba(255,255,255,0.1)" },
        pointLabels: {
          color: "rgba(255,255,255,0.8)",
          font: { size: 11, weight: 500 as const },
        },
      },
    },
    plugins: {
      legend: {
        position: "bottom" as const,
        labels: { color: "rgba(255,255,255,0.8)", font: { size: 10 }, padding: 12, usePointStyle: true },
      },
      tooltip: {
        backgroundColor: "rgba(0,0,0,0.85)",
        titleColor: "rgba(255,255,255,1)",
        bodyColor: "rgba(255,255,255,0.9)",
        callbacks: {
          title: (ctx: { label: string }[]) => {
            const axis = ctx[0]?.label as keyof typeof AXIS_DESC;
            return `${axis} — ${AXIS_DESC[axis] ?? ""}`;
          },
          label: (ctx: { dataset: { label: string }; parsed: { r: number } }) =>
            `${ctx.dataset.label}: ${ctx.parsed.r} / 100`,
        },
      },
      datalabels: { display: false },
    },
    animation: { duration: 1500, easing: "easeInOutQuart" as const },
  };

  return (
    <div className="bg-[#162334] rounded-xl border border-[#1e3552] shadow-sm hover:shadow-md transition-shadow">
      <div className="px-5 pt-5 pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-3 rounded-full bg-red-900/20">
              <GitBranch className="w-5 h-5 text-red-400" />
            </div>
            <div>
              <h3 className="text-[#e2e8f0] text-lg font-semibold">Radar Performa Penyulang</h3>
              <p className="text-[#94a3b8] text-sm">
                Top {TOP_N} penyulang {mode === "worst" ? "paling bermasalah" : "terbaik"} — nilai lebih tinggi lebih baik
              </p>
            </div>
          </div>
          <div className="flex gap-1">
            <button
              onClick={() => setMode("worst")}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                mode === "worst"
                  ? "bg-red-500 text-white"
                  : "bg-[#0d1b2a] text-[#94a3b8] hover:bg-[#1e3552]"
              }`}
            >
              Terburuk
            </button>
            <button
              onClick={() => setMode("best")}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                mode === "best"
                  ? "bg-[#00897B] text-white"
                  : "bg-[#0d1b2a] text-[#94a3b8] hover:bg-[#1e3552]"
              }`}
            >
              Terbaik
            </button>
          </div>
        </div>
      </div>

      <div className="px-5 pb-5">
        {loading ? (
          <div className="h-80 flex items-center justify-center">
            <div className="w-8 h-8 border-4 border-[#1e3552] border-t-[#00897B] rounded-full animate-spin" />
          </div>
        ) : !hasData ? (
          <div className="h-80 flex items-center justify-center">
            <p className="text-[#94A3B8]">Tidak ada data untuk periode ini</p>
          </div>
        ) : (
          <div className="h-80">
            <Radar data={chartData} options={chartOptions as any} />
          </div>
        )}
      </div>
    </div>
  );
}
