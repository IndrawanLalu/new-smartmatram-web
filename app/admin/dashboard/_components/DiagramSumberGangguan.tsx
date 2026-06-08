"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { Doughnut } from "react-chartjs-2";
import {
  Chart as ChartJS,
  ArcElement, CategoryScale, LinearScale,
  Title, Tooltip, Legend,
} from "chart.js";
import ChartDataLabels from "chartjs-plugin-datalabels";
import { fetchSheetData } from "@/lib/sheets";
import { useCurrentUser } from "@/app/admin/_context/UserContext";
import {
  Power, Clock, Shield, AlertCircle, RefreshCw,
  TrendingDown, TrendingUp, Target, Timer, Zap, Activity,
} from "lucide-react";

ChartJS.register(ArcElement, CategoryScale, LinearScale, Title, Tooltip, Legend, ChartDataLabels);

interface DiagramSumberGangguanProps {
  startDate?: Date | null;
  endDate?: Date | null;
}

type Row = Record<string, string>;

interface Analytics {
  totalGangguan: number;
  avgDurasi: number;
  maxDurasi: number;
  minDurasi: number;
  totalDurasiDetik: number;
  gangguanPerHari: number;
  reliabilityScore: number;
  fastRecoveryRate: number;
  criticalCount: number;
}

const MONTH_MAP: Record<string, number> = {
  Januari: 0, Februari: 1, Maret: 2, April: 3, Mei: 4, Juni: 5,
  Juli: 6, Agustus: 7, September: 8, Oktober: 9, November: 10, Desember: 11,
};

function convertToSeconds(t: string | undefined): number {
  if (!t) return 0;
  try {
    const main = t.includes(".") ? t.split(".")[0] : t;
    const parts = main.split(":").map((n) => parseInt(n) || 0);
    if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
    if (parts.length === 2) return parts[0] * 60 + parts[1];
    return parts[0] ?? 0;
  } catch { return 0; }
}

function formatDuration(s: number): string {
  if (!s || isNaN(s)) return "0s";
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) return `${h}j ${m}m`;
  if (m > 0) return `${m}m ${sec}s`;
  return `${sec}s`;
}

function parseDate(s: string | undefined): Date | null {
  if (!s) return null;
  const parts = s.trim().split(" ");
  if (parts.length !== 3) return null;
  const day = parseInt(parts[0]);
  const month = MONTH_MAP[parts[1]];
  const year = parseInt(parts[2]);
  if (isNaN(day) || month === undefined || isNaN(year)) return null;
  if (day < 1 || day > 31 || year < 1900 || year > 2100) return null;
  return new Date(year, month, day);
}

export default function DiagramSumberGangguan({ startDate, endDate }: DiagramSumberGangguanProps) {
  const user = useCurrentUser();
  const userUnit = user.unit;

  const [facilityData, setFacilityData] = useState([0, 0]);
  const [durationData, setDurationData] = useState([0, 0]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastFetch, setLastFetch] = useState<Date | null>(null);
  const [analytics, setAnalytics] = useState<Analytics>({
    totalGangguan: 0, avgDurasi: 0, maxDurasi: 0, minDurasi: 0,
    totalDurasiDetik: 0, gangguanPerHari: 0, reliabilityScore: 0,
    fastRecoveryRate: 0, criticalCount: 0,
  });

  const processData = useCallback((rows: Row[]) => {
    if (!Array.isArray(rows)) return;
    const firstRow = rows[0];
    const isHeader = firstRow && typeof firstRow.tanggal === "string" && firstRow.tanggal.toLowerCase().includes("tanggal");
    const data = isHeader ? rows.slice(1) : rows;

    let giCount = 0, recloserCount = 0, padamLebih = 0, padamKurang = 0;
    let totalDurasi = 0, validCount = 0, criticalCount = 0;
    const durasiArr: number[] = [];

    data.forEach((row) => {
      if (!row) return;
      if (userUnit && row.ULP) {
        if (row.ULP.trim().toUpperCase() !== userUnit.toUpperCase()) return;
      } else if (userUnit) return;

      if (startDate && endDate) {
        const d = parseDate(row.TANGGAL);
        if (!d || d < startDate || d > endDate) return;
      }

      validCount++;

      const f = row.FASILITAS_PADAM?.trim().toUpperCase();
      if (f === "GI/PLTD" || f === "GI" || f === "PLTD") giCount++;
      else if (f === "RECLOSER") recloserCount++;

      const durasiVal = row.DURASI || row.Durasi || row.durasi || row.DURATION;
      const secs = convertToSeconds(durasiVal);

      if (secs > 0) {
        totalDurasi += secs;
        durasiArr.push(secs);
        if (secs > 300) padamLebih++;
        else padamKurang++;
        if (secs > 1800) criticalCount++;
      }
    });

    const periodDays = startDate && endDate
      ? Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)) || 1
      : 365;

    const avgDurasi = validCount > 0 ? totalDurasi / validCount : 0;
    const maxDurasi = durasiArr.length > 0 ? Math.max(...durasiArr) : 0;
    const minDurasi = durasiArr.length > 0 ? Math.min(...durasiArr) : 0;
    const fastRecoveryRate = validCount > 0 ? (padamKurang / validCount) * 100 : 0;
    const reliabilityScore = 100 - (criticalCount / Math.max(validCount, 1)) * 100;

    setFacilityData([giCount, recloserCount]);
    setDurationData([padamLebih, padamKurang]);
    setAnalytics({
      totalGangguan: validCount, avgDurasi, maxDurasi, minDurasi,
      totalDurasiDetik: totalDurasi, gangguanPerHari: validCount / periodDays,
      reliabilityScore, fastRecoveryRate, criticalCount,
    });
  }, [userUnit, startDate, endDate]);

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const raw = await fetchSheetData("gangguanPenyulang", "A:S");
      if (!Array.isArray(raw)) throw new Error("Data tidak valid");
      processData(raw);
      setLastFetch(new Date());
    } catch (err) {
      setError(`Gagal memuat analisis sumber gangguan: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setLoading(false);
    }
  }, [processData]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const facilityChartData = useMemo(() => ({
    labels: ["GI/PLTD", "RECLOSER"],
    datasets: [{
      data: facilityData,
      backgroundColor: ["rgba(34,197,94,0.8)", "rgba(168,85,247,0.8)"],
      borderColor: ["rgba(34,197,94,1)", "rgba(168,85,247,1)"],
      borderWidth: 2,
    }],
  }), [facilityData]);

  const durationChartData = useMemo(() => ({
    labels: ["> 5 Menit", "≤ 5 Menit"],
    datasets: [{
      data: durationData,
      backgroundColor: ["rgba(239,68,68,0.8)", "rgba(34,197,94,0.8)"],
      borderColor: ["rgba(239,68,68,1)", "rgba(34,197,94,1)"],
      borderWidth: 2,
    }],
  }), [durationData]);

  const chartOptions = useMemo(() => ({
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { position: "bottom" as const, labels: { color: "rgba(255,255,255,0.8)", font: { size: 11, weight: 500 }, padding: 15, usePointStyle: true } },
      tooltip: {
        backgroundColor: "rgba(0,0,0,0.8)",
        titleColor: "rgba(255,255,255,1)",
        bodyColor: "rgba(255,255,255,0.9)",
        borderColor: "rgba(34,197,94,0.5)",
        borderWidth: 1,
        cornerRadius: 8,
        callbacks: {
          label: (ctx: { label: string; parsed: number; dataset: { data: number[] } }) => {
            const total = ctx.dataset.data.reduce((a, b) => a + b, 0);
            const pct = total > 0 ? ((ctx.parsed / total) * 100).toFixed(1) : 0;
            return `${ctx.label}: ${ctx.parsed} (${pct}%)`;
          },
        },
      },
      datalabels: {
        display: (ctx: { parsed: number }) => ctx.parsed > 0,
        formatter: (value: number, ctx: { dataset: { data: number[] } }) => {
          const total = ctx.dataset.data.reduce((a, b) => a + b, 0);
          const pct = total > 0 ? ((value / total) * 100).toFixed(0) : 0;
          return value > 0 ? `${value}\n(${pct}%)` : "";
        },
        color: "rgba(255,255,255,0.9)",
        font: { size: 10, weight: "bold" as const },
        textAlign: "center" as const,
      },
    },
    animation: { duration: 1500, easing: "easeInOutQuart" as const },
  }), []);

  function getRelColor(score: number) {
    if (score >= 90) return "text-green-400";
    if (score >= 75) return "text-yellow-400";
    return "text-red-400";
  }

  function getRelIcon(score: number) {
    if (score >= 90) return <Shield className="w-5 h-5 text-green-400" />;
    if (score >= 75) return <Target className="w-5 h-5 text-yellow-400" />;
    return <AlertCircle className="w-5 h-5 text-red-400" />;
  }

  if (error) {
    return (
      <div className="bg-red-900/20 border border-red-700/30 rounded-xl p-8 text-center">
        <Power className="w-12 h-12 text-red-400 mx-auto mb-3" />
        <h3 className="text-[#e2e8f0] font-semibold mb-2">Error Analisis</h3>
        <p className="text-red-400 text-sm mb-4">{error}</p>
        <button onClick={fetchData} disabled={loading} className="inline-flex items-center gap-2 px-4 py-2 bg-red-500 hover:bg-red-600 text-white rounded-lg text-sm disabled:opacity-50">
          <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} /> Coba Lagi
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Main Card */}
      <div className="bg-[#162334] rounded-xl border border-[#1e3552] shadow-sm">
        <div className="px-5 pt-5 pb-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-3 rounded-full bg-[#0a2a26]">
                <Activity className="w-6 h-6 text-[#00897B]" />
              </div>
              <div>
                <h3 className="text-[#e2e8f0] text-lg font-semibold">Analisis Sumber Gangguan</h3>
                <p className="text-[#94a3b8] text-sm">
                  Fasilitas & durasi padam{userUnit && ` — ${userUnit}`}
                  {startDate && endDate && ` (${startDate.toLocaleDateString("id-ID")} — ${endDate.toLocaleDateString("id-ID")})`}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              {loading && <div className="w-5 h-5 border-2 border-[#1e3552] border-t-[#00897B] rounded-full animate-spin" />}
              <button onClick={fetchData} disabled={loading} className="p-2 rounded-full bg-[#162334] hover:bg-[#1e3552] text-[#94a3b8] disabled:opacity-50 transition-colors">
                <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
              </button>
            </div>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-4">
            {[
              { label: "Total Gangguan", value: loading ? "..." : analytics.totalGangguan.toLocaleString(), color: "text-emerald-600" },
              { label: "Rata-rata Durasi", value: loading ? "..." : formatDuration(Math.round(analytics.avgDurasi)), color: "text-cyan-600" },
              { label: "Per Hari", value: loading ? "..." : analytics.gangguanPerHari.toFixed(1), color: "text-amber-600" },
              { label: "Reliabilitas", value: loading ? "..." : `${analytics.reliabilityScore.toFixed(0)}%`, color: getRelColor(analytics.reliabilityScore) },
            ].map(({ label, value, color }) => (
              <div key={label} className="text-center p-3 rounded-lg bg-[#0d1b2a] border border-[#1e3552]">
                <div className={`text-xl font-bold ${color}`}>{value}</div>
                <div className="text-xs text-[#94a3b8]">{label}</div>
              </div>
            ))}
          </div>
        </div>

        <div className="px-5 pb-5">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-3">
              <h4 className="text-[#94a3b8] text-sm font-medium flex items-center gap-2">
                <Power className="w-4 h-4" /> Fasilitas Padam
              </h4>
              <div className="h-48">
                {loading ? (
                  <div className="h-full flex items-center justify-center">
                    <div className="w-8 h-8 border-4 border-[#1e3552] border-t-[#00897B] rounded-full animate-spin" />
                  </div>
                ) : (
                  <Doughnut data={facilityChartData} options={chartOptions as any} />
                )}
              </div>
            </div>
            <div className="space-y-3">
              <h4 className="text-[#94a3b8] text-sm font-medium flex items-center gap-2">
                <Clock className="w-4 h-4" /> Durasi Padam
              </h4>
              <div className="h-48">
                {loading ? (
                  <div className="h-full flex items-center justify-center">
                    <div className="w-8 h-8 border-4 border-[#1e3552] border-t-[#00897B] rounded-full animate-spin" />
                  </div>
                ) : (
                  <Doughnut data={durationChartData} options={chartOptions as any} />
                )}
              </div>
            </div>
          </div>

          {!loading && lastFetch && (
            <div className="mt-4 p-3 rounded-lg bg-[#0d1b2a] border border-[#1e3552]">
              <div className="flex items-center justify-between text-[#94a3b8] text-sm">
                <div className="flex items-center gap-2">
                  <Clock className="w-4 h-4" />
                  <span>Data diperbarui: {lastFetch.toLocaleDateString("id-ID", { day: "2-digit", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" })}</span>
                </div>
                {userUnit && <span className="text-xs bg-[#1e3552] text-[#94a3b8] px-2 py-1 rounded">Unit: {userUnit}</span>}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Analytics Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-[#162334] rounded-xl border border-[#1e3552] shadow-sm hover:shadow-md transition-shadow p-5">
          <div className="flex items-center gap-2 mb-3 text-sm font-medium text-[#e2e8f0]">
            {getRelIcon(analytics.reliabilityScore)} Performa Sistem
          </div>
          <div className="space-y-3">
            {[
              { label: "Fast Recovery Rate", value: `${analytics.fastRecoveryRate.toFixed(1)}%`, color: "text-green-400" },
              { label: "Critical Incidents", value: analytics.criticalCount.toLocaleString(), color: "text-red-400" },
              { label: "Reliability Score", value: `${analytics.reliabilityScore.toFixed(1)}%`, color: getRelColor(analytics.reliabilityScore) },
            ].map(({ label, value, color }) => (
              <div key={label} className="flex justify-between items-center">
                <span className="text-[#94a3b8] text-xs">{label}</span>
                <span className={`${color} font-semibold text-sm`}>{loading ? "..." : value}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-[#162334] rounded-xl border border-[#1e3552] shadow-sm hover:shadow-md transition-shadow p-5">
          <div className="flex items-center gap-2 mb-3 text-sm font-medium text-[#e2e8f0]">
            <Timer className="w-4 h-4" /> Analisis Durasi
          </div>
          <div className="space-y-3">
            {[
              { label: "Durasi Terpendek", value: formatDuration(analytics.minDurasi), color: "text-green-400" },
              { label: "Durasi Terpanjang", value: formatDuration(analytics.maxDurasi), color: "text-red-400" },
              { label: "Total Downtime", value: formatDuration(analytics.totalDurasiDetik), color: "text-amber-600" },
            ].map(({ label, value, color }) => (
              <div key={label} className="flex justify-between items-center">
                <span className="text-[#94a3b8] text-xs">{label}</span>
                <span className={`${color} font-semibold text-sm`}>{loading ? "..." : value}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-[#162334] rounded-xl border border-[#1e3552] shadow-sm hover:shadow-md transition-shadow p-5">
          <div className="flex items-center gap-2 mb-3 text-sm font-medium text-[#e2e8f0]">
            <Zap className="w-4 h-4" /> Dampak Gangguan
          </div>
          <div className="space-y-3">
            <div className="flex justify-between items-center">
              <span className="text-[#94a3b8] text-xs">Quick Recovery</span>
              <div className="flex items-center gap-1">
                <TrendingUp className="w-3 h-3 text-green-500" />
                <span className="text-green-400 font-semibold text-sm">{loading ? "..." : durationData[1].toLocaleString()}</span>
              </div>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-[#94a3b8] text-xs">Extended Outage</span>
              <div className="flex items-center gap-1">
                <TrendingDown className="w-3 h-3 text-red-500" />
                <span className="text-red-400 font-semibold text-sm">{loading ? "..." : durationData[0].toLocaleString()}</span>
              </div>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-[#94a3b8] text-xs">System Health</span>
              <span className={`font-semibold text-sm ${analytics.reliabilityScore >= 90 ? "text-green-400" : analytics.reliabilityScore >= 75 ? "text-amber-400" : "text-red-400"}`}>
                {loading ? "..." : analytics.reliabilityScore >= 90 ? "Excellent" : analytics.reliabilityScore >= 75 ? "Good" : "Needs Attention"}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
