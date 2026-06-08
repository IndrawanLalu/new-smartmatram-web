"use client";

import { useState } from "react";
import { BrainCircuit, RefreshCw, ChevronDown, Filter, AlertCircle } from "lucide-react";
import { useCurrentUser } from "@/app/admin/_context/UserContext";
import { useAdvancedDashboard } from "./_hooks/useAdvancedDashboard";
import ParetoChart from "./_components/ParetoChart";
import PriorityMatrix from "./_components/PriorityMatrix";
import TrendWithMA from "./_components/TrendWithMA";
import PenyebabUlpHeatmap from "./_components/PenyebabUlpHeatmap";
import MtbfCard from "./_components/MtbfCard";
import RecurrenceCard from "./_components/RecurrenceCard";
import SaidiSaifiCard from "./_components/SaidiSaifiCard";
import UlpRadarAdvanced from "./_components/UlpRadarAdvanced";
import CalendarHeatmap from "./_components/CalendarHeatmap";
import MonthKategoriHeatmap from "./_components/MonthKategoriHeatmap";
import RecommendationsCard from "./_components/RecommendationsCard";
import PenyulangWatchlist from "./_components/PenyulangWatchlist";
import { useRecommendations } from "./_hooks/useRecommendations";
import { usePenyulangWatchlist } from "./_hooks/usePenyulangWatchlist";
import { useSaidiSaifi } from "./_hooks/useSaidiSaifi";

const ULP_OPTIONS = ["ALL", "AMPENAN", "CAKRANEGARA", "GERUNG", "TANJUNG"];

const CURRENT_YEAR = new Date().getFullYear();

const QUICK_RANGES = [
  { label: "Bulan Ini", getRange: () => { const n = new Date(); return { s: new Date(n.getFullYear(), n.getMonth(), 1, 12), e: new Date(n.getFullYear(), n.getMonth() + 1, 0, 12) }; } },
  { label: "3 Bulan", getRange: () => { const n = new Date(); return { s: new Date(n.getFullYear(), n.getMonth() - 2, 1, 12), e: new Date(n.getFullYear(), n.getMonth() + 1, 0, 12) }; } },
  { label: "Tahun Ini", getRange: () => ({ s: new Date(CURRENT_YEAR, 0, 1, 12), e: new Date(CURRENT_YEAR, 11, 31, 12) }) },
];

function fmt(d: Date) { return d.toISOString().split("T")[0]; }

export default function AdvancedDashboardPage() {
  const user = useCurrentUser();
  const [startDate, setStartDate] = useState(() => new Date(CURRENT_YEAR, 0, 1, 12));
  const [endDate, setEndDate]     = useState(() => new Date(CURRENT_YEAR, 11, 31, 12));
  const [selectedULP, setSelectedULP] = useState(user.unit ?? "ALL");

  const { computed, loading, error, refresh } = useAdvancedDashboard({ startDate, endDate, selectedULP });
  const recommendations = useRecommendations(computed);
  const watchlist = usePenyulangWatchlist(computed);
  const { data: saidiData, loading: saidiLoading, noKeypoint } = useSaidiSaifi({ computed, startDate, endDate });

  const kpis = computed && !computed.isEmpty ? [
    { label: "Total Gangguan", value: computed.totalGangguan.toLocaleString(), sub: "kejadian", color: "text-red-400", bg: "bg-red-900/20" },
    { label: "Penyulang Terdampak", value: computed.totalPenyulang, sub: "penyulang", color: "text-amber-400", bg: "bg-amber-900/20" },
    { label: "Avg Durasi", value: `${Math.round(computed.avgDurMin)} mnt`, sub: "per kejadian", color: "text-blue-400", bg: "bg-blue-900/20" },
    { label: "Quick Recovery", value: `${computed.quickRecoveryPct.toFixed(1)}%`, sub: "≤ 5 menit", color: "text-[#00897B]", bg: "bg-[#0a2a26]" },
  ] : [];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-linear-to-r from-[#004D40] to-[#00897B] rounded-xl p-6 text-white">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-white/20 rounded-lg">
              <BrainCircuit className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-xl font-bold">Advanced Analytics Dashboard</h2>
              <p className="text-teal-100 text-sm">
                Analisis mendalam & pengambilan keputusan manajemen{user.unit ? ` — ULP ${user.unit}` : ""}
              </p>
            </div>
          </div>
          <button onClick={refresh} disabled={loading}
            className="flex items-center gap-2 px-3 py-2 bg-white/20 hover:bg-white/30 rounded-lg text-sm transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </button>
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
                onChange={(e) => setSelectedULP(e.target.value)}
                className="appearance-none bg-[#0d1b2a] border border-[#1e3552] rounded-lg px-3 py-2 pr-8 text-sm text-[#e2e8f0] focus:outline-none focus:border-[#00897B]"
              >
                {ULP_OPTIONS.map((u) => <option key={u} value={u}>{u === "ALL" ? "🏢 Semua ULP" : u}</option>)}
              </select>
              <ChevronDown className="absolute right-2 top-2.5 w-4 h-4 text-[#94a3b8] pointer-events-none" />
            </div>
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-xs text-[#94a3b8]">Dari</label>
            <input type="date" value={fmt(startDate)}
              onChange={(e) => e.target.value && setStartDate(new Date(e.target.value + "T12:00:00"))}
              className="bg-[#0d1b2a] border border-[#1e3552] rounded-lg px-3 py-2 text-sm text-[#e2e8f0] focus:outline-none focus:border-[#00897B]"
            />
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-xs text-[#94a3b8]">Sampai</label>
            <input type="date" value={fmt(endDate)}
              onChange={(e) => e.target.value && setEndDate(new Date(e.target.value + "T12:00:00"))}
              className="bg-[#0d1b2a] border border-[#1e3552] rounded-lg px-3 py-2 text-sm text-[#e2e8f0] focus:outline-none focus:border-[#00897B]"
            />
          </div>

          <div className="flex gap-2 ml-auto">
            {QUICK_RANGES.map(({ label, getRange }) => (
              <button key={label} onClick={() => { const { s, e } = getRange(); setStartDate(s); setEndDate(e); }}
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
          <button onClick={refresh} className="ml-auto px-3 py-1.5 bg-red-500 text-white rounded-lg text-xs">Coba Lagi</button>
        </div>
      )}

      {/* KPI strip */}
      {(loading || kpis.length > 0) && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {loading ? Array(4).fill(0).map((_, i) => (
            <div key={i} className="bg-[#162334] border border-[#1e3552] rounded-xl p-4 animate-pulse h-24" />
          )) : kpis.map(({ label, value, sub, color, bg }) => (
            <div key={label} className="bg-[#162334] border border-[#1e3552] rounded-xl p-4">
              <div className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium mb-2 ${bg} ${color}`}>{label}</div>
              <p className={`text-2xl font-black ${color}`}>{value}</p>
              <p className="text-[#94a3b8] text-xs">{sub}</p>
            </div>
          ))}
        </div>
      )}

      {/* ── Rekomendasi (paling atas) ── */}
      <RecommendationsCard recommendations={recommendations} loading={loading} />

      {/* ── Penyulang Watchlist ── */}
      <PenyulangWatchlist items={watchlist} loading={loading} />

      {/* ── Section 0: ULP Radar ── */}
      <div>
        <SectionLabel number="00" title="Performa ULP" desc="Perbandingan 5 dimensi kesehatan jaringan antar ULP" />
        <UlpRadarAdvanced data={computed?.ulpRadarData ?? []} loading={loading} />
      </div>

      {/* ── Section 1: SAIDI / SAIFI ── */}
      <SaidiSaifiCard
        data={saidiData}
        loading={loading || saidiLoading}
        selectedULP={selectedULP}
        noKeypoint={noKeypoint}
      />

      {/* ── Section 2: Pareto + Priority Matrix ── */}
      <div>
        <SectionLabel number="01" title="Fokus Perbaikan" desc="Temukan penyulang yang paling butuh perhatian" />
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
          <ParetoChart items={computed?.paretoItems ?? []} loading={loading} />
          <PriorityMatrix
            points={computed?.matrixPoints ?? []}
            medFreq={computed?.medFreq ?? 0}
            medDur={computed?.medDur ?? 0}
            loading={loading}
          />
        </div>
      </div>

      {/* ── Section 3: Trend + MA ── */}
      <div>
        <SectionLabel number="02" title="Deteksi Anomali" desc="Identifikasi lonjakan gangguan di luar pola normal" />
        <TrendWithMA points={computed?.trendPoints ?? []} loading={loading} />
      </div>

      {/* ── Section 4: Heatmap + MTBF ── */}
      <div>
        <SectionLabel number="03" title="Root Cause & Predictive" desc="Penyebab dominan per area dan sinyal pemeliharaan" />
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
          <PenyebabUlpHeatmap
            rows={computed?.heatmapRows ?? []}
            ulps={computed?.ulpsInData ?? []}
            loading={loading}
          />
          <MtbfCard
            items={computed?.mtbfItems ?? []}
            totalDays={computed?.totalDays ?? 1}
            loading={loading}
          />
        </div>
      </div>

      {/* ── Section 5: Recurrence ── */}
      <div>
        <SectionLabel number="04" title="Masalah Kronis" desc="Penyulang yang gangguan berulang dalam jendela 7 hari" />
        <RecurrenceCard items={computed?.recurrenceItems ?? []} loading={loading} />
      </div>

      {/* ── Section 6: Calendar + Month×Kategori ── */}
      <div>
        <SectionLabel number="05" title="Distribusi Waktu" desc="Pola kalender harian dan tren musiman per kategori penyebab" />
        <div className="space-y-4">
          <CalendarHeatmap trendPoints={computed?.trendPoints ?? []} loading={loading} />
          <MonthKategoriHeatmap
            rows={computed?.monthKategoriRows ?? []}
            monthKeys={computed?.monthsInData ?? []}
            loading={loading}
          />
        </div>
      </div>
    </div>
  );
}

function SectionLabel({ number, title, desc }: { number: string; title: string; desc: string }) {
  return (
    <div className="flex items-center gap-3 mb-3">
      <span className="text-xs font-black text-[#00897B] bg-[#0a2a26] border border-[#00897B]/30 px-2 py-1 rounded-lg font-mono">{number}</span>
      <div>
        <h4 className="text-[#e2e8f0] font-semibold text-sm">{title}</h4>
        <p className="text-[#94a3b8] text-xs">{desc}</p>
      </div>
    </div>
  );
}
