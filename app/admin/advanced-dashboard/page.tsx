"use client";

import { useState } from "react";
import { RefreshCw, ChevronDown, Filter, AlertCircle } from "lucide-react";
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
import IsiKepala from "@/app/admin/_kit/IsiKepala";
import Tombol from "@/app/admin/_kit/Tombol";

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
    { label: "Total Gangguan", value: computed.totalGangguan.toLocaleString(), sub: "kejadian", color: "text-red-600", bg: "bg-red-50" },
    { label: "Penyulang Terdampak", value: computed.totalPenyulang, sub: "penyulang", color: "text-amber-600", bg: "bg-amber-50" },
    { label: "Avg Durasi", value: `${Math.round(computed.avgDurMin)} mnt`, sub: "per kejadian", color: "text-blue-600", bg: "bg-blue-50" },
    { label: "Quick Recovery", value: `${computed.quickRecoveryPct.toFixed(1)}%`, sub: "≤ 5 menit", color: "text-brand-600", bg: "bg-brand-50" },
  ] : [];

  return (
    <div className="space-y-6 text-ink">
      <IsiKepala>
        <Tombol ukuran="sm" ikon={<RefreshCw size={14} className={loading ? "animate-spin" : ""} />} onClick={refresh} disabled={loading}>
          Refresh
        </Tombol>
      </IsiKepala>

      {/* Filters */}
      <div className="bg-white rounded-xl border border-line p-4">
        <div className="flex flex-wrap items-end gap-4">
          <div className="flex items-center gap-2">
            <Filter className="w-4 h-4 text-ink-soft" />
            <span className="text-sm font-medium text-ink">Filter</span>
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-xs text-ink-soft">ULP</label>
            <div className="relative">
              <select
                value={selectedULP}
                onChange={(e) => setSelectedULP(e.target.value)}
                className="appearance-none bg-white border border-line rounded-lg px-3 py-2 pr-8 text-sm text-ink focus:outline-none focus:border-brand-500"
              >
                {ULP_OPTIONS.map((u) => <option key={u} value={u}>{u === "ALL" ? "🏢 Semua ULP" : u}</option>)}
              </select>
              <ChevronDown className="absolute right-2 top-2.5 w-4 h-4 text-ink-soft pointer-events-none" />
            </div>
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-xs text-ink-soft">Dari</label>
            <input type="date" value={fmt(startDate)}
              onChange={(e) => e.target.value && setStartDate(new Date(e.target.value + "T12:00:00"))}
              className="bg-white border border-line rounded-lg px-3 py-2 text-sm text-ink focus:outline-none focus:border-brand-500"
            />
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-xs text-ink-soft">Sampai</label>
            <input type="date" value={fmt(endDate)}
              onChange={(e) => e.target.value && setEndDate(new Date(e.target.value + "T12:00:00"))}
              className="bg-white border border-line rounded-lg px-3 py-2 text-sm text-ink focus:outline-none focus:border-brand-500"
            />
          </div>

          <div className="flex gap-2 ml-auto">
            {QUICK_RANGES.map(({ label, getRange }) => (
              <button key={label} onClick={() => { const { s, e } = getRange(); setStartDate(s); setEndDate(e); }}
                className="px-3 py-2 text-xs bg-brand-50 text-brand-600 hover:bg-brand-100 rounded-lg transition-colors font-medium"
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 flex items-center gap-3">
          <AlertCircle className="w-5 h-5 text-red-600 shrink-0" />
          <p className="text-red-600 text-sm">{error}</p>
          <button onClick={refresh} className="ml-auto px-3 py-1.5 bg-red-500 text-white rounded-lg text-xs">Coba Lagi</button>
        </div>
      )}

      {/* KPI strip */}
      {(loading || kpis.length > 0) && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {loading ? Array(4).fill(0).map((_, i) => (
            <div key={i} className="bg-white border border-line rounded-xl p-4 animate-pulse h-24" />
          )) : kpis.map(({ label, value, sub, color, bg }) => (
            <div key={label} className="bg-white border border-line rounded-xl p-4">
              <div className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium mb-2 ${bg} ${color}`}>{label}</div>
              <p className={`text-2xl font-black ${color}`}>{value}</p>
              <p className="text-ink-soft text-xs">{sub}</p>
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
      <span className="text-xs font-black text-brand-600 bg-brand-50 border border-brand-200 px-2 py-1 rounded-lg font-mono">{number}</span>
      <div>
        <h4 className="text-ink font-semibold text-sm">{title}</h4>
        <p className="text-ink-soft text-xs">{desc}</p>
      </div>
    </div>
  );
}
