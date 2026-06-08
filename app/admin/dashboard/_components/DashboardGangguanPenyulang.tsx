"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { fetchSheetData } from "@/lib/sheets";
import { useCurrentUser } from "@/app/admin/_context/UserContext";
import {
  Calendar, Download, RefreshCw, Activity, TrendingUp, TrendingDown,
  Clock, Zap, Target, AlertCircle, Filter, Search, ChevronDown,
  MapPin, AlertTriangle, CheckCircle, ArrowUpDown,
} from "lucide-react";

import TrendChart from "./components/TrendChart";
import RootCauseAnalysis from "./components/RootCauseAnalysis";
import HourlyHeatmap from "./components/HourlyHeatmap";
import DurationDistribution from "./components/DurationDistribution";
import UlpRadarChart from "./components/UlpRadarChart";
import PenyulangRadarChart from "./components/PenyulangRadarChart";
import PenyulangPerformance from "./components/PenyulangPerformance";
import {
  FasilitasBreakdown, TechnicalIndicators, GeographicBreakdown,
} from "./components/AdditionalCharts";

type Row = Record<string, string>;

const ULP_STREAK_LIST = ["AMPENAN", "CAKRANEGARA", "GERUNG", "TANJUNG"] as const;

const MONTH_OPTIONS = [
  { value: "ALL", label: "📅 Semua Bulan" },
  ...[
    "Januari", "Februari", "Maret", "April", "Mei", "Juni",
    "Juli", "Agustus", "September", "Oktober", "November", "Desember",
  ].map((m, i) => ({ value: String(i), label: m })),
];

export default function DashboardGangguanPenyulang() {
  const currentYear = new Date().getFullYear();
  const user = useCurrentUser();
  const userUnit = user.unit;

  const [startDate, setStartDate] = useState(() => new Date(currentYear, 0, 1, 12, 0, 0));
  const [endDate, setEndDate] = useState(() => new Date(currentYear, 11, 31, 12, 0, 0));
  const [rawData, setRawData] = useState<Row[]>([]);
  const [selectedULP, setSelectedULP] = useState("ALL");
  const [selectedMonth, setSelectedMonth] = useState("ALL");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [sortConfig, setSortConfig] = useState<{ key: string | null; direction: "asc" | "desc" }>({ key: null, direction: "asc" });

  const ITEMS_PER_PAGE = 10;

  // ─── Utilities ──────────────────────────────────────────────────────────────

  const convertToSeconds = useCallback((timeString: string | undefined): number => {
    if (!timeString) return 0;
    const t = timeString.toString().trim();
    try {
      const main = t.includes(".") ? t.split(".")[0] : t;
      const parts = main.split(":").map((n) => parseInt(n) || 0);
      if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
      if (parts.length === 2) return parts[0] * 60 + parts[1];
      return parts[0] ?? 0;
    } catch { return 0; }
  }, []);

  const parseDate = useCallback((dateString: string | undefined): Date | null => {
    if (!dateString) return null;
    const parts = dateString.toString().trim().split(" ");
    if (parts.length !== 3) return null;
    const monthMap: Record<string, number> = {
      Januari: 0, Februari: 1, Maret: 2, April: 3, Mei: 4, Juni: 5,
      Juli: 6, Agustus: 7, September: 8, Oktober: 9, November: 10, Desember: 11,
    };
    const day = parseInt(parts[0]);
    const month = monthMap[parts[1]];
    const year = parseInt(parts[2]);
    if (isNaN(day) || month === undefined || isNaN(year)) return null;
    return new Date(year, month, day, 12, 0, 0);
  }, []);

  const isDateInRange = useCallback((dateString: string | undefined): boolean => {
    const date = parseDate(dateString);
    if (!date) return false;
    if (selectedMonth !== "ALL") return date.getMonth() === parseInt(selectedMonth);
    return date >= startDate && date <= endDate;
  }, [startDate, endDate, selectedMonth, parseDate]);

  const formatDateForInput = (d: Date) => d.toISOString().split("T")[0];

  // ─── Fetch ───────────────────────────────────────────────────────────────────

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await fetchSheetData("gangguanPenyulang", "A:S");
      if (!Array.isArray(data)) throw new Error("Data yang diterima tidak valid");
      setRawData(data);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(`Gagal memuat data: ${msg}`);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  // ─── ULP Options ─────────────────────────────────────────────────────────────

  const ulpOptions = useMemo(() => {
    if (!rawData.length) return [];
    const firstRow = rawData[0];
    const isHeader = firstRow?.TANGGAL?.toLowerCase().includes("tanggal");
    const rows = isHeader ? rawData.slice(1) : rawData;
    const ulps = new Set<string>();
    rows.forEach((row) => { if (row.ULP?.trim()) ulps.add(row.ULP.trim()); });
    return Array.from(ulps).sort();
  }, [rawData]);

  // ─── Processed Data ──────────────────────────────────────────────────────────

  const processedData = useMemo(() => {
    if (!rawData.length) return { filtered: [] as Row[], metrics: {} as Record<string, unknown>, yoyComparison: {} as Record<string, unknown>, rangeStart: "", rangeEnd: "", ulpStreaks: [] as { ulp: string; days: number; from: string; to: string }[] };

    const firstRow = rawData[0];
    const isHeader = firstRow?.TANGGAL?.toLowerCase().includes("tanggal");
    const dataRows = isHeader ? rawData.slice(1) : rawData;

    const filtered = dataRows.filter((row) => {
      if (!row || typeof row !== "object") return false;
      if (selectedULP !== "ALL") {
        if (!row.ULP) return false;
        if (row.ULP.trim().toUpperCase() !== selectedULP.trim().toUpperCase()) return false;
      }
      return isDateInRange(row.TANGGAL);
    });

    const prevStart = new Date(startDate); prevStart.setFullYear(prevStart.getFullYear() - 1);
    const prevEnd = new Date(endDate); prevEnd.setFullYear(prevEnd.getFullYear() - 1);

    const filteredPrev = dataRows.filter((row) => {
      if (!row) return false;
      if (selectedULP !== "ALL" && row.ULP?.trim().toUpperCase() !== selectedULP.trim().toUpperCase()) return false;
      const d = parseDate(row.TANGGAL);
      return d && d >= prevStart && d <= prevEnd;
    });

    const metrics = {
      totalGangguan: filtered.length,
      totalDurasi: 0,
      fasilitasCount: { "GI/PLTD": 0, RECLOSER: 0, GH: 0 } as Record<string, number>,
      penyebabCount: {} as Record<string, number>,
      ulpCount: {} as Record<string, number>,
      penyulangCount: {} as Record<string, number>,
      indikatorCount: { EF: 0, OC: 0 } as Record<string, number>,
      kodeCount: {} as Record<string, number>,
      hourlyCount: Array(24).fill(0) as number[],
      durasiArray: [] as number[],
      quickRecovery: 0,
      extendedOutage: 0,
      criticalCount: 0,
      dailyCount: Array(7).fill(0) as number[],
      dailyTrend: {} as Record<string, number>,
      monthlyTrend: {} as Record<string, number>,
      avgDurasi: 0,
      reliabilityScore: 100,
    };

    const prevM = { totalGangguan: filteredPrev.length, totalDurasi: 0, durasiArray: [] as number[], quickRecovery: 0, criticalCount: 0 };

    const MONTH_NAMES = ["JANUARI","FEBRUARI","MARET","APRIL","MEI","JUNI","JULI","AGUSTUS","SEPTEMBER","OKTOBER","NOVEMBER","DESEMBER"];

    filtered.forEach((row) => {
      const durasi = convertToSeconds(row.DURASI);
      if (durasi > 0) {
        metrics.totalDurasi += durasi;
        metrics.durasiArray.push(durasi);
        if (durasi <= 300) metrics.quickRecovery++;
        else metrics.extendedOutage++;
        if (durasi > 1800) metrics.criticalCount++;
      }

      const f = row.FASILITAS_PADAM?.toUpperCase() ?? "";
      if (f.includes("GI") || f.includes("PLTD")) metrics.fasilitasCount["GI/PLTD"]++;
      else if (f.includes("RECLOSER")) metrics.fasilitasCount.RECLOSER++;
      else if (f.includes("GH")) metrics.fasilitasCount.GH++;

      const penyebab = (row.PENYEBAB_GANGGUAN || row["PENYEBAB GANGGUAN"] || "UNKNOWN").toUpperCase().trim();
      metrics.penyebabCount[penyebab] = (metrics.penyebabCount[penyebab] || 0) + 1;

      if (row.ULP?.trim()) { const u = row.ULP.trim(); metrics.ulpCount[u] = (metrics.ulpCount[u] || 0) + 1; }
      if (row.PENYULANG_GANGGUAN?.trim()) { const p = row.PENYULANG_GANGGUAN.trim(); metrics.penyulangCount[p] = (metrics.penyulangCount[p] || 0) + 1; }

      if (row.INDIKATOR === "EF") metrics.indikatorCount.EF++;
      else if (row.INDIKATOR === "OC") metrics.indikatorCount.OC++;

      if (row.KODE?.trim()) { const k = row.KODE.trim(); metrics.kodeCount[k] = (metrics.kodeCount[k] || 0) + 1; }

      const jam = (row.JAM_PADAM || row["JAM PADAM"] || "").toString();
      const hour = parseInt(jam.split(":")[0]);
      if (!isNaN(hour) && hour >= 0 && hour < 24) metrics.hourlyCount[hour]++;

      const date = parseDate(row.TANGGAL);
      if (date) {
        metrics.dailyCount[(date.getDay() + 6) % 7]++;
        const dk = date.toISOString().split("T")[0];
        metrics.dailyTrend[dk] = (metrics.dailyTrend[dk] || 0) + 1;
        const mk = `${date.getFullYear()}-${MONTH_NAMES[date.getMonth()]}`;
        metrics.monthlyTrend[mk] = (metrics.monthlyTrend[mk] || 0) + 1;
      }
    });

    filteredPrev.forEach((row) => {
      const d = convertToSeconds(row.DURASI);
      if (d > 0) {
        prevM.totalDurasi += d;
        prevM.durasiArray.push(d);
        if (d <= 300) prevM.quickRecovery++;
        if (d > 1800) prevM.criticalCount++;
      }
    });

    metrics.reliabilityScore = metrics.totalGangguan > 0 ? 100 - (metrics.criticalCount / metrics.totalGangguan) * 100 : 100;
    metrics.avgDurasi = metrics.durasiArray.length > 0 ? metrics.totalDurasi / metrics.durasiArray.length / 60 : 0;

    const prevAvgDurasi = prevM.durasiArray.length > 0 ? prevM.totalDurasi / prevM.durasiArray.length / 60 : 0;
    const prevRelScore = prevM.totalGangguan > 0 ? 100 - (prevM.criticalCount / prevM.totalGangguan) * 100 : 100;
    const prevQrRate = prevM.totalGangguan > 0 ? (prevM.quickRecovery / prevM.totalGangguan) * 100 : 0;
    const currQrRate = metrics.totalGangguan > 0 ? (metrics.quickRecovery / metrics.totalGangguan) * 100 : 0;

    const yoyComparison = {
      totalGangguan: { current: metrics.totalGangguan, previous: prevM.totalGangguan, change: prevM.totalGangguan > 0 ? ((metrics.totalGangguan - prevM.totalGangguan) / prevM.totalGangguan) * 100 : 0 },
      avgDurasi: { current: metrics.avgDurasi, previous: prevAvgDurasi, change: prevAvgDurasi > 0 ? ((metrics.avgDurasi - prevAvgDurasi) / prevAvgDurasi) * 100 : 0 },
      quickRecovery: { current: currQrRate, previous: prevQrRate, change: prevQrRate > 0 ? ((currQrRate - prevQrRate) / prevQrRate) * 100 : 0 },
      reliability: { current: metrics.reliabilityScore, previous: prevRelScore, change: prevRelScore > 0 ? ((metrics.reliabilityScore - prevRelScore) / prevRelScore) * 100 : 0 },
    };

    // ─── Effective date range ────────────────────────────────────────────────────
    // When selectedMonth is active, clamp to actual data range to avoid huge gaps
    const trendKeys = Object.keys(metrics.dailyTrend).sort();
    const rangeStart = selectedMonth !== "ALL" && trendKeys.length > 0
      ? trendKeys[0]
      : formatDateForInput(startDate);
    const rangeEnd = selectedMonth !== "ALL" && trendKeys.length > 0
      ? trendKeys[trendKeys.length - 1]
      : formatDateForInput(endDate);

    // ─── Longest no-gangguan streak per ULP ─────────────────────────────────────
    const ulpsToStreak = selectedULP === "ALL"
      ? (ULP_STREAK_LIST as readonly string[])
      : [selectedULP];

    const gangguanByUlp: Record<string, Set<string>> = {};
    ulpsToStreak.forEach(u => { gangguanByUlp[u] = new Set(); });
    filtered.forEach(row => {
      const ulp = row.ULP?.trim().toUpperCase();
      if (ulp && gangguanByUlp[ulp]) {
        const d = parseDate(row.TANGGAL);
        if (d) gangguanByUlp[ulp].add(d.toISOString().split("T")[0]);
      }
    });

    const todayStr = new Date().toISOString().split("T")[0];
    const streakEnd = rangeEnd > todayStr ? todayStr : rangeEnd;

    const ulpStreaks = ulpsToStreak.map(ulp => {
      const gangguan = gangguanByUlp[ulp];
      let maxDays = 0, maxFrom = "", maxTo = "";
      let streak = 0, streakFrom = "";
      const cur = new Date(rangeStart + "T12:00:00");
      const end = new Date(streakEnd + "T12:00:00");
      while (cur <= end) {
        const key = cur.toISOString().split("T")[0];
        if (!gangguan.has(key)) {
          if (streak === 0) streakFrom = key;
          streak++;
          if (streak > maxDays) { maxDays = streak; maxFrom = streakFrom; maxTo = key; }
        } else {
          streak = 0; streakFrom = "";
        }
        cur.setDate(cur.getDate() + 1);
      }
      return { ulp, days: maxDays, from: maxFrom, to: maxTo };
    }).filter(s => s.days > 0);

    return { filtered, metrics, yoyComparison, rangeStart, rangeEnd: streakEnd, ulpStreaks };
  }, [rawData, selectedULP, selectedMonth, startDate, endDate, isDateInRange, convertToSeconds, parseDate]);

  // ─── Table Logic ─────────────────────────────────────────────────────────────

  const tableData = useMemo(() => {
    let rows = [...(processedData.filtered ?? [])];
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      rows = rows.filter((r) =>
        (r.TANGGAL || "").toLowerCase().includes(q) ||
        (r.ULP || "").toLowerCase().includes(q) ||
        (r.PENYULANG_GANGGUAN || "").toLowerCase().includes(q) ||
        (r.PENYEBAB_GANGGUAN || r["PENYEBAB GANGGUAN"] || "").toLowerCase().includes(q)
      );
    }
    if (sortConfig.key) {
      rows.sort((a, b) => {
        const av = a[sortConfig.key!] || "";
        const bv = b[sortConfig.key!] || "";
        const cmp = av.localeCompare(bv);
        return sortConfig.direction === "asc" ? cmp : -cmp;
      });
    }
    return rows;
  }, [processedData.filtered, searchQuery, sortConfig]);

  const totalPages = Math.ceil(tableData.length / ITEMS_PER_PAGE);
  const pagedData = tableData.slice((currentPage - 1) * ITEMS_PER_PAGE, currentPage * ITEMS_PER_PAGE);

  const handleSort = (key: string) => {
    setSortConfig((prev) =>
      prev.key === key
        ? { key, direction: prev.direction === "asc" ? "desc" : "asc" }
        : { key, direction: "asc" }
    );
    setCurrentPage(1);
  };

  // ─── Export CSV ───────────────────────────────────────────────────────────────

  const handleExport = () => {
    const headers = ["Tanggal", "ULP", "Penyulang", "Fasilitas", "Durasi", "Penyebab"];
    const rows = (processedData.filtered ?? []).map((r) => [
      r.TANGGAL || "", r.ULP || "", r.PENYULANG_GANGGUAN || "",
      r.FASILITAS_PADAM || "", r.DURASI || "",
      r.PENYEBAB_GANGGUAN || r["PENYEBAB GANGGUAN"] || "",
    ]);
    const csv = [headers, ...rows].map((r) => r.join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `dashboard-gangguan-${selectedULP}-${new Date().toISOString().split("T")[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // ─── KPI Card helper ─────────────────────────────────────────────────────────

  function YoyBadge({ change, inverse = false }: { change: number; inverse?: boolean }) {
    const isGood = inverse ? change < 0 : change > 0;
    const pct = Math.abs(change).toFixed(1);
    if (Math.abs(change) < 0.1) return null;
    return (
      <span className={`inline-flex items-center gap-0.5 text-xs font-semibold px-2 py-0.5 rounded-full ${isGood ? "bg-green-900/20 text-green-400" : "bg-red-900/20 text-red-400"}`}>
        {isGood ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
        {pct}%
      </span>
    );
  }

  const { metrics, yoyComparison, rangeStart, rangeEnd, ulpStreaks } = processedData as {
    metrics: Record<string, unknown>;
    yoyComparison: Record<string, { current: number; previous: number; change: number }>;
    rangeStart: string;
    rangeEnd: string;
    ulpStreaks: { ulp: string; days: number; from: string; to: string }[];
  };

  // ─── Render ───────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-linear-to-r from-[#004D40] to-[#00897B] rounded-xl p-6 text-white">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-white/20 rounded-lg">
              <Activity className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-xl font-bold">Dashboard Gangguan Penyulang</h2>
              <p className="text-teal-100 text-sm">
                Analisis gangguan jaringan distribusi {userUnit ? `— ULP ${userUnit}` : "— Semua ULP"}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <button onClick={fetchData} disabled={loading}
              className="flex items-center gap-2 px-3 py-2 bg-white/20 hover:bg-white/30 rounded-lg text-sm transition-colors disabled:opacity-50"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
              Refresh
            </button>
            <button onClick={handleExport}
              className="flex items-center gap-2 px-3 py-2 bg-white/20 hover:bg-white/30 rounded-lg text-sm transition-colors"
            >
              <Download className="w-4 h-4" /> Export CSV
            </button>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-[#162334] rounded-xl border border-[#1e3552] p-4">
        <div className="flex flex-wrap items-end gap-4">
          <div className="flex items-center gap-2">
            <Filter className="w-4 h-4 text-[#94a3b8]" />
            <span className="text-sm font-medium text-[#e2e8f0]">Filter</span>
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-xs text-[#94a3b8]">ULP</label>
            <div className="relative">
              <select
                value={selectedULP}
                onChange={(e) => { setSelectedULP(e.target.value); setCurrentPage(1); }}
                className="appearance-none bg-[#0d1b2a] border border-[#1e3552] rounded-lg px-3 py-2 pr-8 text-sm text-[#e2e8f0] focus:outline-none focus:border-[#00897B] focus:ring-2 focus:ring-[#00897B]/20"
              >
                <option value="ALL">🏢 Semua ULP</option>
                {ulpOptions.map((u) => <option key={u} value={u}>{u}</option>)}
              </select>
              <ChevronDown className="absolute right-2 top-2.5 w-4 h-4 text-[#94a3b8] pointer-events-none" />
            </div>
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-xs text-[#94a3b8]">Bulan</label>
            <div className="relative">
              <select
                value={selectedMonth}
                onChange={(e) => { setSelectedMonth(e.target.value); setCurrentPage(1); }}
                className="appearance-none bg-[#0d1b2a] border border-[#1e3552] rounded-lg px-3 py-2 pr-8 text-sm text-[#e2e8f0] focus:outline-none focus:border-[#00897B] focus:ring-2 focus:ring-[#00897B]/20"
              >
                {MONTH_OPTIONS.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
              </select>
              <ChevronDown className="absolute right-2 top-2.5 w-4 h-4 text-[#94a3b8] pointer-events-none" />
            </div>
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-xs text-[#94a3b8]">Dari Tanggal</label>
            <input
              type="date"
              value={formatDateForInput(startDate)}
              onChange={(e) => { if (e.target.value) { setStartDate(new Date(e.target.value + "T12:00:00")); setCurrentPage(1); } }}
              className="bg-[#0d1b2a] border border-[#1e3552] rounded-lg px-3 py-2 text-sm text-[#e2e8f0] focus:outline-none focus:border-[#00897B] focus:ring-2 focus:ring-[#00897B]/20"
            />
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-xs text-[#94a3b8]">Sampai Tanggal</label>
            <input
              type="date"
              value={formatDateForInput(endDate)}
              onChange={(e) => { if (e.target.value) { setEndDate(new Date(e.target.value + "T12:00:00")); setCurrentPage(1); } }}
              className="bg-[#0d1b2a] border border-[#1e3552] rounded-lg px-3 py-2 text-sm text-[#e2e8f0] focus:outline-none focus:border-[#00897B] focus:ring-2 focus:ring-[#00897B]/20"
            />
          </div>

          <div className="flex gap-2 ml-auto">
            {[
              { label: "Bulan Ini", onClick: () => { const n = new Date(); setStartDate(new Date(n.getFullYear(), n.getMonth(), 1, 12)); setEndDate(new Date(n.getFullYear(), n.getMonth() + 1, 0, 12)); setSelectedMonth("ALL"); } },
              { label: "Tahun Ini", onClick: () => { setStartDate(new Date(currentYear, 0, 1, 12)); setEndDate(new Date(currentYear, 11, 31, 12)); setSelectedMonth("ALL"); } },
            ].map(({ label, onClick }) => (
              <button key={label} onClick={onClick}
                className="px-3 py-2 text-xs bg-[#0a2a26] text-[#00897B] hover:bg-[#B2DFDB] rounded-lg transition-colors font-medium"
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="bg-red-900/20 border border-red-700/30 rounded-xl p-4 flex items-center gap-3">
          <AlertCircle className="w-5 h-5 text-red-400 shrink-0" />
          <p className="text-red-400 text-sm">{error}</p>
          <button onClick={fetchData} className="ml-auto px-3 py-1.5 bg-red-500 text-white rounded-lg text-xs">
            Coba Lagi
          </button>
        </div>
      )}

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          {
            icon: <Activity className="w-5 h-5 text-[#00897B]" />,
            label: "Total Gangguan",
            value: loading ? "..." : (metrics.totalGangguan as number)?.toLocaleString(),
            subLabel: "kejadian",
            yoy: yoyComparison.totalGangguan,
            inverse: true,
            bg: "bg-[#0a2a26]",
          },
          {
            icon: <Clock className="w-5 h-5 text-blue-400" />,
            label: "Avg Durasi",
            value: loading ? "..." : `${Math.round(metrics.avgDurasi as number)} mnt`,
            subLabel: "per kejadian",
            yoy: yoyComparison.avgDurasi,
            inverse: true,
            bg: "bg-blue-900/20",
          },
          {
            icon: <Zap className="w-5 h-5 text-green-400" />,
            label: "Quick Recovery",
            value: loading ? "..." : `${(metrics.totalGangguan as number) > 0 ? (((metrics.quickRecovery as number) / (metrics.totalGangguan as number)) * 100).toFixed(1) : "0"}%`,
            subLabel: "≤ 5 menit",
            yoy: yoyComparison.quickRecovery,
            inverse: false,
            bg: "bg-green-900/20",
          },
          {
            icon: <Target className="w-5 h-5 text-orange-400" />,
            label: "Reliability",
            value: loading ? "..." : `${(metrics.reliabilityScore as number)?.toFixed(1)}%`,
            subLabel: "score",
            yoy: yoyComparison.reliability,
            inverse: false,
            bg: "bg-orange-900/20",
          },
        ].map(({ icon, label, value, subLabel, yoy, inverse, bg }) => (
          <div key={label} className="bg-[#162334] rounded-xl border border-[#1e3552] shadow-sm p-4">
            <div className="flex items-center gap-3 mb-3">
              <div className={`p-2 ${bg} rounded-lg`}>{icon}</div>
              <span className="text-[#94a3b8] text-sm">{label}</span>
            </div>
            <div className="flex items-end justify-between">
              <div>
                <p className="text-[#e2e8f0] text-2xl font-bold">{value}</p>
                <p className="text-[#94A3B8] text-xs mt-0.5">{subLabel}</p>
              </div>
              {!loading && yoy && <YoyBadge change={yoy.change} inverse={inverse} />}
            </div>
            {!loading && yoy && (
              <p className="text-[#94A3B8] text-xs mt-2">
                Tahun lalu: {typeof yoy.previous === "number" ? (label === "Avg Durasi" ? `${Math.round(yoy.previous)} mnt` : label.includes("%") || label.includes("Recovery") || label.includes("Reliab") ? `${yoy.previous.toFixed(1)}%` : yoy.previous.toLocaleString()) : "-"}
              </p>
            )}
          </div>
        ))}
      </div>

      {/* Charts Row 1 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <TrendChart
          dailyTrend={(metrics.dailyTrend as Record<string, number>) ?? {}}
          monthlyTrend={(metrics.monthlyTrend as Record<string, number>) ?? {}}
          rangeStart={rangeStart}
          rangeEnd={rangeEnd}
          ulpStreaks={ulpStreaks}
          loading={loading}
        />
        <RootCauseAnalysis
          penyebabCount={(metrics.penyebabCount as Record<string, number>) ?? {}}
          loading={loading}
        />
      </div>

      {/* Charts Row 2 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <HourlyHeatmap
          hourlyCount={(metrics.hourlyCount as number[]) ?? []}
          dailyCount={(metrics.dailyCount as number[]) ?? []}
          loading={loading}
        />
        <DurationDistribution
          durasiArray={(metrics.durasiArray as number[]) ?? []}
          loading={loading}
        />
      </div>

      {/* Radar Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <UlpRadarChart
          filtered={processedData.filtered}
          loading={loading}
        />
        <PenyulangRadarChart
          filtered={processedData.filtered}
          penyulangCount={(metrics.penyulangCount as Record<string, number>) ?? {}}
          loading={loading}
        />
      </div>

      {/* Charts Row 3 */}
      <PenyulangPerformance
        penyulangCount={(metrics.penyulangCount as Record<string, number>) ?? {}}
        loading={loading}
      />

      {/* Additional Charts */}
      <FasilitasBreakdown
        fasilitasCount={(metrics.fasilitasCount as Record<string, number>) ?? {}}
        loading={loading}
      />
      <TechnicalIndicators
        indikatorCount={(metrics.indikatorCount as Record<string, number>) ?? {}}
        kodeCount={(metrics.kodeCount as Record<string, number>) ?? {}}
        loading={loading}
      />
      <GeographicBreakdown
        ulpCount={(metrics.ulpCount as Record<string, number>) ?? {}}
        userUnit={userUnit}
        loading={loading}
      />

      {/* Data Table */}
      <div className="bg-[#162334] rounded-xl border border-[#1e3552] shadow-sm">
        <div className="px-5 pt-5 pb-3 flex items-center justify-between flex-wrap gap-3">
          <div>
            <h3 className="text-[#e2e8f0] font-bold text-lg">Data Gangguan</h3>
            <p className="text-[#94a3b8] text-sm">{tableData.length} kejadian ditemukan</p>
          </div>
          <div className="relative">
            <Search className="absolute left-3 top-2.5 w-4 h-4 text-[#94A3B8]" />
            <input
              type="text"
              placeholder="Cari data..."
              value={searchQuery}
              onChange={(e) => { setSearchQuery(e.target.value); setCurrentPage(1); }}
              className="pl-9 pr-4 py-2 border border-[#1e3552] rounded-lg text-sm text-[#e2e8f0] focus:outline-none focus:border-[#00897B] focus:ring-2 focus:ring-[#00897B]/20 w-56"
            />
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-[#0a2a26]">
                {[
                  { key: "TANGGAL", label: "Tanggal" },
                  { key: "ULP", label: "ULP" },
                  { key: "PENYULANG_GANGGUAN", label: "Penyulang" },
                  { key: "FASILITAS_PADAM", label: "Fasilitas" },
                  { key: "DURASI", label: "Durasi" },
                  { key: "PENYEBAB_GANGGUAN", label: "Penyebab" },
                  { key: "STATUS", label: "Status" },
                ].map(({ key, label }) => (
                  <th
                    key={key}
                    className="text-left px-4 py-3 text-[#5eead4] font-semibold text-xs cursor-pointer select-none"
                    onClick={() => key !== "STATUS" && handleSort(key)}
                  >
                    <div className="flex items-center gap-1">
                      {label}
                      {key !== "STATUS" && <ArrowUpDown className="w-3 h-3 opacity-50" />}
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={7} className="text-center py-12 text-[#94a3b8]">
                  <div className="flex flex-col items-center gap-2">
                    <div className="w-8 h-8 border-4 border-[#1e3552] border-t-[#00897B] rounded-full animate-spin" />
                    <span>Memuat data...</span>
                  </div>
                </td></tr>
              ) : pagedData.length === 0 ? (
                <tr><td colSpan={7} className="text-center py-12 text-[#94A3B8]">Tidak ada data ditemukan</td></tr>
              ) : pagedData.map((row, i) => {
                const durasi = convertToSeconds(row.DURASI);
                const severity = durasi > 1800 ? "critical" : durasi > 300 ? "medium" : "low";
                return (
                  <tr key={i} className="border-t border-[#1e3552] hover:bg-[#0d1b2a] transition-colors">
                    <td className="px-4 py-3 text-[#e2e8f0]">{row.TANGGAL || "-"}</td>
                    <td className="px-4 py-3">
                      {row.ULP ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-blue-900/20 text-blue-400 rounded-full text-xs">
                          <MapPin className="w-3 h-3" />{row.ULP}
                        </span>
                      ) : "-"}
                    </td>
                    <td className="px-4 py-3 text-[#e2e8f0]">{row.PENYULANG_GANGGUAN || "-"}</td>
                    <td className="px-4 py-3 text-[#94a3b8]">{row.FASILITAS_PADAM || "-"}</td>
                    <td className="px-4 py-3">
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-[#0d1b2a] text-[#94a3b8] rounded-full text-xs">
                        <Clock className="w-3 h-3" />{row.DURASI || "-"}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-[#94a3b8] max-w-[200px] truncate">
                      {row.PENYEBAB_GANGGUAN || row["PENYEBAB GANGGUAN"] || "-"}
                    </td>
                    <td className="px-4 py-3">
                      {severity === "critical" ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-red-900/20 text-red-400 rounded-full text-xs">
                          <AlertTriangle className="w-3 h-3" /> Critical
                        </span>
                      ) : severity === "medium" ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-yellow-900/20 text-yellow-400 rounded-full text-xs">
                          <AlertCircle className="w-3 h-3" /> Medium
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-green-900/20 text-green-400 rounded-full text-xs">
                          <CheckCircle className="w-3 h-3" /> Low
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="px-5 py-4 border-t border-[#1e3552] flex items-center justify-between">
            <p className="text-[#94a3b8] text-sm">
              Halaman {currentPage} dari {totalPages} ({tableData.length} total)
            </p>
            <div className="flex gap-2">
              <button
                disabled={currentPage === 1}
                onClick={() => setCurrentPage((p) => p - 1)}
                className="px-3 py-1.5 text-sm border border-[#1e3552] rounded-lg disabled:opacity-40 hover:bg-[#0d1b2a] transition-colors"
              >
                ← Prev
              </button>
              {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                const page = Math.max(1, Math.min(currentPage - 2, totalPages - 4)) + i;
                return page <= totalPages ? (
                  <button
                    key={page}
                    onClick={() => setCurrentPage(page)}
                    className={`px-3 py-1.5 text-sm rounded-lg transition-colors ${page === currentPage ? "bg-[#00897B] text-white" : "border border-[#1e3552] hover:bg-[#0d1b2a]"}`}
                  >
                    {page}
                  </button>
                ) : null;
              })}
              <button
                disabled={currentPage === totalPages}
                onClick={() => setCurrentPage((p) => p + 1)}
                className="px-3 py-1.5 text-sm border border-[#1e3552] rounded-lg disabled:opacity-40 hover:bg-[#0d1b2a] transition-colors"
              >
                Next →
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
