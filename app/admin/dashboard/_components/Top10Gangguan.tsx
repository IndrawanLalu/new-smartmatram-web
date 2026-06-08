"use client";

import { useMemo } from "react";
import { Bar } from "react-chartjs-2";
import {
  Chart as ChartJS,
  CategoryScale, LinearScale, BarElement,
  Title, Tooltip, Legend,
} from "chart.js";
import ChartDataLabels from "chartjs-plugin-datalabels";
import { format } from "date-fns";
import { useTop10Gangguan } from "../_hooks/useTop10Gangguan";
import { Trophy, Zap, BarChart3, RefreshCw, AlertTriangle } from "lucide-react";

ChartJS.register(CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend, ChartDataLabels);

interface Top10GangguanProps {
  startDate?: Date | null;
  endDate?: Date | null;
}

export default function Top10Gangguan({ startDate, endDate }: Top10GangguanProps) {
  const {
    gangguanTerbanyak, totalGangguan, avgGangguan, topPenyulang,
    totalPenyulang, loading, error, lastFetch, refresh, userUnit,
  } = useTop10Gangguan({
    startDate: startDate ?? undefined,
    endDate: endDate ?? undefined,
    filterByUnit: true,
    top: 10,
    autoRefresh: true,
    refreshInterval: 300000,
  });

  const { colors, backgroundColors } = useMemo(() => {
    const cs: string[] = [];
    const bgs: string[] = [];
    for (let i = 0; i < gangguanTerbanyak.length; i++) {
      const intensity = 1 - (i / gangguanTerbanyak.length) * 0.7;
      cs.push(`rgba(0,137,123,${intensity})`);
      bgs.push(`rgba(0,137,123,${intensity * 0.8})`);
    }
    return { colors: cs, backgroundColors: bgs };
  }, [gangguanTerbanyak.length]);

  const chartData = useMemo(() => ({
    labels: gangguanTerbanyak.map(([p]) => p),
    datasets: [{
      label: "Kali Gangguan",
      data: gangguanTerbanyak.map(([, c]) => c),
      borderColor: colors,
      backgroundColor: backgroundColors,
      borderWidth: 2,
      borderRadius: 6,
      borderSkipped: false,
    }],
  }), [gangguanTerbanyak, colors, backgroundColors]);

  const chartOptions = useMemo(() => ({
    responsive: true,
    maintainAspectRatio: false,
    indexAxis: "y" as const,
    layout: { padding: { top: 10, bottom: 10, left: 10, right: 30 } },
    scales: {
      x: {
        grid: { color: "rgba(255,255,255,0.08)" },
        ticks: { color: "rgba(255,255,255,0.6)", font: { size: 11, weight: "500" as const }, stepSize: 1 },
        beginAtZero: true,
      },
      y: {
        grid: { display: false },
        ticks: {
          color: "rgba(255,255,255,0.6)",
          font: { size: 11, weight: "500" as const },
          padding: 10,
          maxRotation: 0,
          callback: function (this: unknown, value: string | number) {
            const chart = this as { getLabelForValue: (v: number) => string };
            const label = chart.getLabelForValue(value as number);
            return label.length > 15 ? label.substring(0, 15) + "..." : label;
          },
        },
      },
    },
    plugins: {
      legend: { display: false },
      tooltip: {
        backgroundColor: "rgba(0,0,0,0.8)",
        titleColor: "rgba(255,255,255,1)",
        bodyColor: "rgba(255,255,255,0.9)",
        borderColor: "rgba(0,137,123,0.5)",
        borderWidth: 1,
        cornerRadius: 8,
        callbacks: {
          title: (ctx: { label: string }[]) => ctx[0].label,
          label: (ctx: { parsed: { x: number | null } }) => `${ctx.parsed.x ?? 0} kali gangguan`,
        },
      },
      datalabels: {
        display: (ctx: { parsed: { x: number | null } }) => (ctx.parsed?.x ?? 0) > 0,
        anchor: "end" as const, align: "right" as const, offset: 4,
        formatter: (v: number) => v > 0 ? `${v}x` : "",
        color: "rgba(255,255,255,0.95)",
        font: { size: 10, weight: "bold" as const },
        backgroundColor: "rgba(0,0,0,0.6)",
        borderRadius: 4,
        padding: { top: 2, bottom: 2, left: 4, right: 4 },
      },
    },
    animation: { duration: 2000, easing: "easeInOutQuart" as const },
  }), []);

  if (error) {
    return (
      <div className="bg-red-900/20 border border-red-700/30 rounded-xl p-8 text-center">
        <BarChart3 className="w-12 h-12 text-red-400 mx-auto mb-3" />
        <h3 className="text-[#e2e8f0] font-semibold mb-2">Error Memuat Top 10</h3>
        <p className="text-red-400 text-sm mb-4">{error}</p>
        <button onClick={refresh} disabled={loading} className="inline-flex items-center gap-2 px-4 py-2 bg-red-500 hover:bg-red-600 text-white rounded-lg text-sm disabled:opacity-50">
          <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} /> Coba Lagi
        </button>
      </div>
    );
  }

  return (
    <div className="bg-[#162334] rounded-xl border border-[#1e3552] shadow-sm">
      <div className="px-5 pt-5 pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-3 rounded-full bg-[#0a2a26]">
              <Trophy className="w-6 h-6 text-[#00897B]" />
            </div>
            <div>
              <h3 className="text-[#e2e8f0] text-lg font-semibold">Top 10 Penyulang Bermasalah</h3>
              <p className="text-[#94a3b8] text-sm">
                {startDate && endDate
                  ? `Periode ${format(startDate, "dd MMM")} — ${format(endDate, "dd MMM yyyy")}`
                  : "Semua data"
                }{userUnit && ` — ${userUnit}`}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {loading && <div className="w-5 h-5 border-2 border-[#1e3552] border-t-[#00897B] rounded-full animate-spin" />}
            <button onClick={refresh} disabled={loading} className="p-2 rounded-full bg-[#162334] hover:bg-[#1e3552] text-[#94a3b8] disabled:opacity-50 transition-colors">
              <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
            </button>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-4 mt-4">
          {[
            { label: "Penyulang", value: loading ? "..." : totalPenyulang, color: "text-amber-600" },
            { label: "Total Gangguan", value: loading ? "..." : totalGangguan.toLocaleString(), color: "text-[#00897B]" },
            { label: "Rata-rata", value: loading ? "..." : avgGangguan, color: "text-orange-600" },
          ].map(({ label, value, color }) => (
            <div key={label} className="text-center p-3 rounded-lg bg-[#0d1b2a] border border-[#1e3552]">
              <div className={`text-2xl font-bold ${color}`}>{value}</div>
              <div className="text-xs text-[#94a3b8]">{label}</div>
            </div>
          ))}
        </div>

        {!loading && topPenyulang && (
          <div className="mt-4 p-3 rounded-lg bg-red-900/20 border border-red-700/30">
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-red-400" />
              <div>
                <p className="text-red-400 font-medium text-sm">
                  Penyulang Terbermasalah: <span className="font-bold">{topPenyulang[0]}</span>
                </p>
                <p className="text-red-400 text-xs">{topPenyulang[1]} kali gangguan dalam periode ini</p>
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="px-5 pb-5">
        <div className="h-80">
          {loading ? (
            <div className="h-full flex items-center justify-center">
              <div className="text-center">
                <div className="w-12 h-12 border-4 border-[#1e3552] border-t-[#00897B] rounded-full animate-spin mx-auto mb-4" />
                <p className="text-slate-400">Memuat data ranking...</p>
              </div>
            </div>
          ) : gangguanTerbanyak.length === 0 ? (
            <div className="h-full flex items-center justify-center">
              <div className="text-center">
                <Zap className="w-16 h-16 text-slate-300 mx-auto mb-4" />
                <p className="text-slate-500">Tidak ada data gangguan</p>
                <p className="text-slate-400 text-sm">pada periode yang dipilih</p>
              </div>
            </div>
          ) : (
            <Bar data={chartData} options={chartOptions as any} />
          )}
        </div>

        {!loading && gangguanTerbanyak.length > 0 && (
          <div className="mt-4 p-3 rounded-lg bg-[#0d1b2a] border border-[#1e3552]">
            <div className="flex items-center justify-between text-[#94a3b8] text-sm">
              <span>Intensitas warna menunjukkan ranking gangguan</span>
              <div className="text-xs">
                Diperbarui: {lastFetch ? lastFetch.toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" }) : "Belum ada data"}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
