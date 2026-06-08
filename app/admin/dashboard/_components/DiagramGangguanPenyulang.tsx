"use client";

import { useState, useEffect, useCallback, useMemo } from "react";

const CURRENT_YEAR = new Date().getFullYear();
const PREVIOUS_YEAR = CURRENT_YEAR - 1;
import { Line } from "react-chartjs-2";
import {
  Chart as ChartJS,
  CategoryScale, LinearScale, PointElement, LineElement,
  Title, Tooltip, Legend, Filler,
} from "chart.js";
import ChartDataLabels from "chartjs-plugin-datalabels";
import { fetchSheetData } from "@/lib/sheets";
import { TrendingUp, Calendar, BarChart3, RefreshCw } from "lucide-react";
import { useCurrentUser } from "@/app/admin/_context/UserContext";

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend, Filler, ChartDataLabels);

const MONTH_MAP: Record<string, number> = {
  Januari: 0, Februari: 1, Maret: 2, April: 3, Mei: 4, Juni: 5,
  Juli: 6, Agustus: 7, September: 8, Oktober: 9, November: 10, Desember: 11,
};

type Row = Record<string, string>;

export default function DiagramGangguanPenyulang() {
  const user = useCurrentUser();
  const userUnit = user.unit;

  const [tahunIni, setTahunIni] = useState<number[]>(Array(12).fill(0));
  const [tahunLalu, setTahunLalu] = useState<number[]>(Array(12).fill(0));
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastFetch, setLastFetch] = useState<Date | null>(null);

  const parseDate = useCallback((s: string | undefined): Date | null => {
    if (!s) return null;
    const parts = s.trim().split(" ");
    if (parts.length !== 3) return null;
    const day = parseInt(parts[0]);
    const month = MONTH_MAP[parts[1]];
    const year = parseInt(parts[2]);
    if (isNaN(day) || month === undefined || isNaN(year)) return null;
    if (day < 1 || day > 31 || year < 1900 || year > 2100) return null;
    return new Date(year, month, day);
  }, []);

  const processData = useCallback((rows: Row[]) => {
    if (!Array.isArray(rows)) return { tahunIni: Array(12).fill(0), tahunLalu: Array(12).fill(0) };
    const firstRow = rows[0];
    const isHeader = firstRow && typeof firstRow.ulp === "string" && (firstRow.ulp.toLowerCase().includes("ulp") || firstRow.ulp.toLowerCase().includes("unit"));
    const data = isHeader ? rows.slice(1) : rows;

    const ti = Array(12).fill(0) as number[];
    const tl = Array(12).fill(0) as number[];

    data.forEach((item) => {
      if (!item || typeof item !== "object") return;
      if (userUnit && item.ULP) {
        if (item.ULP.trim().toUpperCase() !== userUnit.toUpperCase()) return;
      } else if (userUnit) return;

      const d = parseDate(item.TANGGAL);
      if (!d) return;
      const m = d.getMonth();
      const y = d.getFullYear();
      if (y === CURRENT_YEAR) ti[m]++;
      else if (y === PREVIOUS_YEAR) tl[m]++;
    });

    return { tahunIni: ti, tahunLalu: tl };
  }, [userUnit, parseDate, CURRENT_YEAR, PREVIOUS_YEAR]);

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const raw = await fetchSheetData("gangguanPenyulang", "A:S");
      if (!Array.isArray(raw)) throw new Error("Data tidak valid");
      const { tahunIni: ti, tahunLalu: tl } = processData(raw);
      setTahunIni(ti);
      setTahunLalu(tl);
      setLastFetch(new Date());
    } catch (err) {
      setError(`Gagal memuat data chart: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setLoading(false);
    }
  }, [processData]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const totalIni = useMemo(() => tahunIni.reduce((s, v) => s + v, 0), [tahunIni]);
  const totalLalu = useMemo(() => tahunLalu.reduce((s, v) => s + v, 0), [tahunLalu]);
  const pctChange = useMemo(() => {
    if (totalLalu === 0) return totalIni > 0 ? 100 : 0;
    return ((totalIni - totalLalu) / totalLalu) * 100;
  }, [totalIni, totalLalu]);

  const chartData = useMemo(() => ({
    labels: ["Jan","Feb","Mar","Apr","Mei","Jun","Jul","Agu","Sep","Okt","Nov","Des"],
    datasets: [
      {
        label: `Tahun Ini (${CURRENT_YEAR})`,
        data: tahunIni,
        borderColor: "rgba(0,137,123,1)",
        backgroundColor: "rgba(0,137,123,0.1)",
        borderWidth: 3,
        fill: true,
        tension: 0.4,
        pointBackgroundColor: "rgba(0,137,123,1)",
        pointBorderColor: "rgba(255,255,255,1)",
        pointBorderWidth: 2,
        pointRadius: 6,
        pointHoverRadius: 8,
      },
      {
        label: `Tahun Lalu (${PREVIOUS_YEAR})`,
        data: tahunLalu,
        borderColor: "rgba(16,185,129,1)",
        backgroundColor: "rgba(16,185,129,0.1)",
        borderWidth: 3,
        fill: true,
        tension: 0.4,
        pointBackgroundColor: "rgba(16,185,129,1)",
        pointBorderColor: "rgba(255,255,255,1)",
        pointBorderWidth: 2,
        pointRadius: 6,
        pointHoverRadius: 8,
      },
    ],
  }), [CURRENT_YEAR, PREVIOUS_YEAR, tahunIni, tahunLalu]);

  const chartOptions = useMemo(() => ({
    responsive: true,
    maintainAspectRatio: false,
    layout: { padding: { top: 20, bottom: 10, left: 10, right: 10 } },
    scales: {
      x: { grid: { color: "rgba(255,255,255,0.08)" }, ticks: { color: "rgba(255,255,255,0.6)", font: { size: 12, weight: 500 } } },
      y: { grid: { color: "rgba(255,255,255,0.08)" }, ticks: { color: "rgba(255,255,255,0.6)", font: { size: 12, weight: 500 }, stepSize: 1 }, beginAtZero: true },
    },
    plugins: {
      legend: { position: "top" as const, labels: { color: "rgba(255,255,255,0.8)", font: { size: 13, weight: 600 }, usePointStyle: true, pointStyle: "circle", padding: 20 } },
      tooltip: {
        backgroundColor: "rgba(0,0,0,0.8)",
        titleColor: "rgba(255,255,255,1)",
        bodyColor: "rgba(255,255,255,0.9)",
        borderColor: "rgba(0,137,123,0.5)",
        borderWidth: 1,
        cornerRadius: 8,
        displayColors: true,
        callbacks: {
          title: (ctx: { label: string }[]) => `Bulan ${ctx[0].label}`,
          label: (ctx: { dataset: { label: string }; parsed: { y: number } }) => `${ctx.dataset.label}: ${ctx.parsed.y} gangguan`,
        },
      },
      datalabels: {
        display: (ctx: { parsed: { y: number } }) => ctx.parsed?.y > 0,
        anchor: "end" as const, align: "top" as const, offset: 4,
        formatter: (v: number) => v > 0 ? v : "",
        color: "rgba(255,255,255,0.95)",
        font: { size: 10, weight: "bold" as const },
        backgroundColor: "rgba(0,0,0,0.7)",
        borderRadius: 4,
        padding: { top: 2, bottom: 2, left: 4, right: 4 },
      },
    },
    interaction: { intersect: false, mode: "index" as const },
    animation: { duration: 2000, easing: "easeInOutQuart" as const },
  }), []);

  if (error) {
    return (
      <div className="bg-red-900/20 border border-red-700/30 rounded-xl p-8 text-center">
        <BarChart3 className="w-12 h-12 text-red-400 mx-auto mb-3" />
        <h3 className="text-[#e2e8f0] font-semibold mb-2">Error Memuat Chart</h3>
        <p className="text-red-400 text-sm mb-4">{error}</p>
        <button onClick={fetchData} disabled={loading} className="inline-flex items-center gap-2 px-4 py-2 bg-red-500 hover:bg-red-600 text-white rounded-lg text-sm disabled:opacity-50">
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
              <TrendingUp className="w-6 h-6 text-[#00897B]" />
            </div>
            <div>
              <h3 className="text-[#e2e8f0] text-lg font-semibold">Gangguan Penyulang</h3>
              <p className="text-[#94a3b8] text-sm">Trend bulanan tahun ini vs tahun lalu{userUnit && ` — ${userUnit}`}</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {loading && <div className="w-5 h-5 border-2 border-[#1e3552] border-t-[#00897B] rounded-full animate-spin" />}
            <button onClick={fetchData} disabled={loading} className="p-2 rounded-full bg-[#162334] hover:bg-[#1e3552] text-[#94a3b8] disabled:opacity-50 transition-colors">
              <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
            </button>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-4 mt-4">
          {[
            { label: "Total Tahun Ini", value: loading ? "..." : totalIni.toLocaleString(), color: "text-[#00897B]" },
            { label: "Total Tahun Lalu", value: loading ? "..." : totalLalu.toLocaleString(), color: "text-emerald-600" },
            { label: "Perubahan", value: loading ? "..." : `${pctChange > 0 ? "+" : ""}${pctChange.toFixed(1)}%`, color: pctChange > 0 ? "text-red-400" : pctChange < 0 ? "text-emerald-400" : "text-[#94a3b8]" },
          ].map(({ label, value, color }) => (
            <div key={label} className="text-center p-3 rounded-lg bg-[#0d1b2a] border border-[#1e3552]">
              <div className={`text-2xl font-bold ${color}`}>{value}</div>
              <div className="text-xs text-[#94a3b8]">{label}</div>
            </div>
          ))}
        </div>
      </div>

      <div className="px-5 pb-5">
        <div className="h-80">
          {loading ? (
            <div className="h-full flex items-center justify-center">
              <div className="text-center">
                <div className="w-12 h-12 border-4 border-[#1e3552] border-t-[#00897B] rounded-full animate-spin mx-auto mb-4" />
                <p className="text-[#94a3b8]">Memuat data chart...</p>
              </div>
            </div>
          ) : (
            <Line data={chartData} options={chartOptions as any} />
          )}
        </div>

        {!loading && lastFetch && (
          <div className="mt-4 p-3 rounded-lg bg-[#0d1b2a] border border-[#1e3552]">
            <div className="flex items-center justify-between text-[#94a3b8] text-sm">
              <div className="flex items-center gap-2">
                <Calendar className="w-4 h-4" />
                <span>Data diperbarui: {lastFetch.toLocaleDateString("id-ID", { day: "2-digit", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" })}</span>
              </div>
              {userUnit && <span className="text-xs bg-[#1e3552] text-[#94a3b8] px-2 py-1 rounded">Unit: {userUnit}</span>}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
