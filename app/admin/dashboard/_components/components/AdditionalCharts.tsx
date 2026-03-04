"use client";

import { useMemo } from "react";
import { Doughnut, Bar } from "react-chartjs-2";
import {
  Chart as ChartJS,
  ArcElement, CategoryScale, LinearScale, BarElement,
  Title, Tooltip, Legend,
} from "chart.js";
import ChartDataLabels from "chartjs-plugin-datalabels";
import { Power, MapPin, Zap, Activity } from "lucide-react";

ChartJS.register(ArcElement, CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend, ChartDataLabels);

// ============================================================
// 1. FASILITAS BREAKDOWN
// ============================================================
interface FasilitasBreakdownProps {
  fasilitasCount?: Record<string, number>;
  loading?: boolean;
}

export function FasilitasBreakdown({ fasilitasCount = {}, loading = false }: FasilitasBreakdownProps) {
  const chartData = useMemo(() => ({
    labels: ["GI/PLTD", "RECLOSER", "GH"],
    datasets: [{
      data: [fasilitasCount["GI/PLTD"] ?? 0, fasilitasCount.RECLOSER ?? 0, fasilitasCount.GH ?? 0],
      backgroundColor: ["rgba(34,197,94,0.8)", "rgba(168,85,247,0.8)", "rgba(59,130,246,0.8)"],
      borderColor: ["rgba(34,197,94,1)", "rgba(168,85,247,1)", "rgba(59,130,246,1)"],
      borderWidth: 2,
    }],
  }), [fasilitasCount]);

  const options = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { position: "bottom" as const, labels: { color: "rgba(0,0,0,0.7)", font: { size: 11, weight: 500 }, padding: 15, usePointStyle: true } },
      tooltip: { backgroundColor: "rgba(0,0,0,0.8)", callbacks: { label: (ctx: { label: string; parsed: number; dataset: { data: number[] } }) => { const total = ctx.dataset.data.reduce((a, b) => a + b, 0); const pct = total > 0 ? ((ctx.parsed / total) * 100).toFixed(1) : 0; return `${ctx.label}: ${ctx.parsed} (${pct}%)`; } } },
      datalabels: {
        display: (ctx: { parsed: number }) => ctx.parsed > 0,
        formatter: (value: number, ctx: { dataset: { data: number[] } }) => {
          if (!value) return "";
          const total = ctx.dataset.data.reduce((a, b) => a + b, 0);
          return `${value}\n(${total > 0 ? ((value / total) * 100).toFixed(0) : 0}%)`;
        },
        color: "rgba(255,255,255,0.95)",
        font: { size: 10, weight: "bold" as const },
      },
    },
  };

  if (loading) {
    return (
      <div className="bg-[#162334] rounded-xl border border-[#1e3552] shadow-sm">
        <div className="h-72 flex items-center justify-center">
          <div className="w-8 h-8 border-4 border-[#1e3552] border-t-[#00897B] rounded-full animate-spin" />
        </div>
      </div>
    );
  }

  const hasData = chartData.datasets[0].data.some((v) => v > 0);

  return (
    <div className="bg-[#162334] rounded-xl border border-[#1e3552] shadow-sm hover:shadow-md transition-shadow">
      <div className="px-5 pt-5 pb-3">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-green-50 rounded-lg"><Power className="w-5 h-5 text-green-600" /></div>
          <div>
            <h3 className="text-[#e2e8f0] text-lg font-bold">Fasilitas Padam</h3>
            <p className="text-[#94a3b8] text-xs mt-1">Breakdown by facility type</p>
          </div>
        </div>
      </div>
      <div className="px-5 pb-5">
        {!hasData ? (
          <div className="h-64 flex items-center justify-center"><p className="text-[#94A3B8]">Tidak ada data fasilitas</p></div>
        ) : (
          <div className="h-64"><Doughnut data={chartData} options={options as any} /></div>
        )}
      </div>
    </div>
  );
}

// ============================================================
// 2. TECHNICAL INDICATORS
// ============================================================
interface TechnicalIndicatorsProps {
  indikatorCount?: Record<string, number>;
  kodeCount?: Record<string, number>;
  loading?: boolean;
}

export function TechnicalIndicators({ indikatorCount = {}, kodeCount = {}, loading = false }: TechnicalIndicatorsProps) {
  const indikatorData = useMemo(() => ({
    labels: ["Earth Fault (EF)", "Over Current (OC)"],
    datasets: [{
      data: [indikatorCount.EF ?? 0, indikatorCount.OC ?? 0],
      backgroundColor: ["rgba(239,68,68,0.8)", "rgba(251,191,36,0.8)"],
      borderColor: ["rgba(239,68,68,1)", "rgba(251,191,36,1)"],
      borderWidth: 2,
    }],
  }), [indikatorCount]);

  const kodeData = useMemo(() => {
    const sorted = Object.entries(kodeCount).sort((a, b) => b[1] - a[1]).slice(0, 5);
    return {
      labels: sorted.map(([k]) => k),
      datasets: [{ label: "Jumlah", data: sorted.map(([, c]) => c), backgroundColor: "rgba(59,130,246,0.8)", borderColor: "rgba(59,130,246,1)", borderWidth: 1 }],
    };
  }, [kodeCount]);

  const pieOptions = {
    responsive: true, maintainAspectRatio: false,
    plugins: {
      legend: { position: "bottom" as const, labels: { color: "rgba(0,0,0,0.7)", font: { size: 10, weight: 500 }, padding: 10, usePointStyle: true } },
      datalabels: { display: (ctx: { parsed: number }) => ctx.parsed > 0, formatter: (v: number) => v > 0 ? v : "", color: "rgba(255,255,255,0.95)", font: { size: 10, weight: "bold" as const } },
    },
  };

  const barOptions = {
    responsive: true, maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
      datalabels: {
        display: (ctx: { parsed: { y: number | null } }) => (ctx.parsed?.y ?? 0) > 0,
        formatter: (v: number) => v > 0 ? v : "",
        anchor: "end" as const, align: "top" as const,
        color: "rgba(0,0,0,0.7)", font: { size: 9, weight: "bold" as const },
      },
    },
    scales: {
      x: { ticks: { color: "rgba(0,0,0,0.5)", font: { size: 10 } }, grid: { color: "rgba(0,0,0,0.06)" } },
      y: { ticks: { color: "rgba(0,0,0,0.5)", font: { size: 10 } }, grid: { color: "rgba(0,0,0,0.06)" } },
    },
  };

  if (loading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {[1, 2].map((i) => (
          <div key={i} className="bg-[#162334] rounded-xl border border-[#1e3552] shadow-sm">
            <div className="h-64 flex items-center justify-center">
              <div className="w-8 h-8 border-4 border-[#1e3552] border-t-[#00897B] rounded-full animate-spin" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  const hasIndikator = indikatorData.datasets[0].data.some((v) => v > 0);
  const hasKode = kodeData.datasets[0].data.length > 0;

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      <div className="bg-[#162334] rounded-xl border border-[#1e3552] shadow-sm hover:shadow-md transition-shadow">
        <div className="px-5 pt-5 pb-3">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-red-50 rounded-lg"><Zap className="w-5 h-5 text-red-600" /></div>
            <div><h3 className="text-[#e2e8f0] text-sm font-bold">Fault Indicator</h3><p className="text-[#94a3b8] text-xs mt-1">EF vs OC</p></div>
          </div>
        </div>
        <div className="px-5 pb-5">
          {!hasIndikator ? (
            <div className="h-56 flex items-center justify-center"><p className="text-[#94A3B8]">Tidak ada data indikator</p></div>
          ) : (
            <div className="h-56"><Doughnut data={indikatorData} options={pieOptions as any} /></div>
          )}
        </div>
      </div>

      <div className="bg-[#162334] rounded-xl border border-[#1e3552] shadow-sm hover:shadow-md transition-shadow">
        <div className="px-5 pt-5 pb-3">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-50 rounded-lg"><Activity className="w-5 h-5 text-blue-600" /></div>
            <div><h3 className="text-[#e2e8f0] text-sm font-bold">Fault Code</h3><p className="text-[#94a3b8] text-xs mt-1">Top 5 codes</p></div>
          </div>
        </div>
        <div className="px-5 pb-5">
          {!hasKode ? (
            <div className="h-56 flex items-center justify-center"><p className="text-[#94A3B8]">Tidak ada data kode</p></div>
          ) : (
            <div className="h-56"><Bar data={kodeData} options={barOptions as any} /></div>
          )}
        </div>
      </div>
    </div>
  );
}

// ============================================================
// 3. GEOGRAPHIC BREAKDOWN
// ============================================================
interface GeographicBreakdownProps {
  ulpCount?: Record<string, number>;
  userUnit?: string | null;
  loading?: boolean;
}

export function GeographicBreakdown({ ulpCount = {}, userUnit = null, loading = false }: GeographicBreakdownProps) {
  const chartData = useMemo(() => {
    const sorted = Object.entries(ulpCount).sort((a, b) => b[1] - a[1]);
    return {
      labels: sorted.map(([ulp]) => ulp),
      datasets: [{
        label: "Gangguan",
        data: sorted.map(([, c]) => c),
        backgroundColor: sorted.map(([ulp]) => userUnit && ulp === userUnit ? "rgba(34,197,94,0.8)" : "rgba(0,137,123,0.8)"),
        borderColor: sorted.map(([ulp]) => userUnit && ulp === userUnit ? "rgba(34,197,94,1)" : "rgba(0,137,123,1)"),
        borderWidth: 1,
      }],
    };
  }, [ulpCount, userUnit]);

  const options = {
    responsive: true, maintainAspectRatio: false, indexAxis: "y" as const,
    plugins: {
      legend: { display: false },
      datalabels: {
        display: (ctx: { parsed: { x: number | null } }) => (ctx.parsed?.x ?? 0) > 0,
        formatter: (v: number) => v > 0 ? v : "",
        anchor: "end" as const, align: "right" as const,
        color: "rgba(0,0,0,0.7)", font: { size: 10, weight: "bold" as const },
      },
    },
    scales: {
      x: { ticks: { color: "rgba(0,0,0,0.5)", font: { size: 10 } }, grid: { color: "rgba(0,0,0,0.06)" } },
      y: { ticks: { color: "rgba(0,0,0,0.5)", font: { size: 10 } }, grid: { display: false } },
    },
  };

  if (loading) {
    return (
      <div className="bg-[#162334] rounded-xl border border-[#1e3552] shadow-sm">
        <div className="h-96 flex items-center justify-center">
          <div className="w-8 h-8 border-4 border-[#1e3552] border-t-[#00897B] rounded-full animate-spin" />
        </div>
      </div>
    );
  }

  const hasData = chartData.datasets[0].data.length > 0;

  return (
    <div className="bg-[#162334] rounded-xl border border-[#1e3552] shadow-sm hover:shadow-md transition-shadow">
      <div className="px-5 pt-5 pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-[#0a2a26] rounded-lg"><MapPin className="w-5 h-5 text-[#00897B]" /></div>
            <div>
              <h3 className="text-[#e2e8f0] text-lg font-bold">Geographic Distribution</h3>
              <p className="text-[#94a3b8] text-xs mt-1">Gangguan by ULP</p>
            </div>
          </div>
          {userUnit && (
            <span className="px-3 py-1 bg-green-50 text-green-700 rounded-full text-xs font-medium">Your ULP: {userUnit}</span>
          )}
        </div>
      </div>
      <div className="px-5 pb-5">
        {!hasData ? (
          <div className="h-80 flex items-center justify-center"><p className="text-[#94A3B8]">Tidak ada data ULP</p></div>
        ) : (
          <div className="h-80"><Bar data={chartData} options={options as any} /></div>
        )}
      </div>
    </div>
  );
}
