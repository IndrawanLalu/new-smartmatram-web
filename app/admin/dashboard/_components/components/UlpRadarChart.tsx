"use client";

import { useMemo } from "react";
import { Radar } from "react-chartjs-2";
import {
  Chart as ChartJS, RadialLinearScale, PointElement,
  LineElement, Filler, Tooltip, Legend,
} from "chart.js";
import { Globe2 } from "lucide-react";

ChartJS.register(RadialLinearScale, PointElement, LineElement, Filler, Tooltip, Legend);

type Row = Record<string, string>;

interface UlpRadarChartProps {
  filtered: Row[];
  loading?: boolean;
}

const ULP_LIST = ["AMPENAN", "CAKRANEGARA", "GERUNG", "TANJUNG"];

const AXES = ["Frek. Rendah", "Recovery Cepat", "Reliabilitas", "Durasi Singkat", "EF Control"];

const COLORS = [
  { border: "rgba(0,137,123,1)",   bg: "rgba(0,137,123,0.15)" },
  { border: "rgba(59,130,246,1)",  bg: "rgba(59,130,246,0.15)" },
  { border: "rgba(168,85,247,1)",  bg: "rgba(168,85,247,0.15)" },
  { border: "rgba(249,115,22,1)",  bg: "rgba(249,115,22,0.15)" },
];

const AXIS_DESC: Record<string, string> = {
  "Frek. Rendah":   "Makin sedikit gangguan = makin tinggi",
  "Recovery Cepat": "% gangguan selesai ≤ 5 menit",
  "Reliabilitas":   "% gangguan NON-critical (≤ 30 mnt)",
  "Durasi Singkat": "Makin pendek rata-rata durasi = makin tinggi",
  "EF Control":     "Makin sedikit Earth Fault = makin tinggi",
};

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

export default function UlpRadarChart({ filtered, loading = false }: UlpRadarChartProps) {
  const scores = useMemo(() => {
    type Acc = { count: number; quick: number; critical: number; totalDur: number; durCount: number; ef: number; faultable: number };
    const m: Record<string, Acc> = {};
    ULP_LIST.forEach(u => { m[u] = { count: 0, quick: 0, critical: 0, totalDur: 0, durCount: 0, ef: 0, faultable: 0 }; });

    filtered.forEach(row => {
      const ulp = row.ULP?.trim().toUpperCase();
      if (!ulp || !m[ulp]) return;
      m[ulp].count++;
      const dur = toSecs(row.DURASI);
      if (dur > 0) {
        m[ulp].totalDur += dur;
        m[ulp].durCount++;
        if (dur <= 300) m[ulp].quick++;
        if (dur > 1800) m[ulp].critical++;
      }
      if (row.INDIKATOR === "EF") { m[ulp].ef++; m[ulp].faultable++; }
      else if (row.INDIKATOR === "OC") m[ulp].faultable++;
    });

    const maxCount  = Math.max(...ULP_LIST.map(u => m[u].count), 1);
    const maxAvgDur = Math.max(...ULP_LIST.map(u => m[u].durCount > 0 ? m[u].totalDur / m[u].durCount : 0), 1);

    return ULP_LIST.map(ulp => {
      const d = m[ulp];
      const freq        = Math.round((1 - d.count / maxCount) * 100);
      const recovery    = d.count > 0 ? Math.round((d.quick / d.count) * 100) : 0;
      const reliability = d.count > 0 ? Math.round((1 - d.critical / d.count) * 100) : 100;
      const avgDur      = d.durCount > 0 ? d.totalDur / d.durCount : 0;
      const durScore    = Math.round((1 - avgDur / maxAvgDur) * 100);
      const efControl   = d.faultable > 0 ? Math.round((1 - d.ef / d.faultable) * 100) : 100;
      return [freq, recovery, reliability, durScore, efControl];
    });
  }, [filtered]);

  const hasData = ULP_LIST.some((u, i) => scores[i]?.some(v => v > 0));

  const chartData = {
    labels: AXES,
    datasets: ULP_LIST.map((ulp, i) => ({
      label: ulp,
      data: scores[i] ?? [],
      borderColor: COLORS[i].border,
      backgroundColor: COLORS[i].bg,
      borderWidth: 2,
      pointBackgroundColor: COLORS[i].border,
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
        labels: { color: "rgba(255,255,255,0.8)", font: { size: 11 }, padding: 15, usePointStyle: true },
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
        <div className="flex items-center gap-3">
          <div className="p-3 rounded-full bg-[#0a2a26]">
            <Globe2 className="w-5 h-5 text-[#00897B]" />
          </div>
          <div>
            <h3 className="text-[#e2e8f0] text-lg font-semibold">Radar Performa ULP</h3>
            <p className="text-[#94a3b8] text-sm">Profil keandalan per unit — nilai lebih tinggi lebih baik</p>
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
