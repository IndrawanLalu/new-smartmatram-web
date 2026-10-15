"use client";

import { useState, useMemo } from "react";
import {
  RefreshCw,
  Filter,
  ChevronDown,
  AlertCircle,
  CheckCircle2,
  Clock,
  TrendingDown,
  TrendingUp,
  AlertTriangle,
  Minus,
  ArrowUpDown,
  Search,
} from "lucide-react";
import { useCurrentUser } from "@/app/admin/_context/UserContext";
import { useInspeksiEffectiveness } from "./_hooks/useInspeksiEffectiveness";
import type { PenyulangEffectiveness, Trend } from "./_hooks/useInspeksiEffectiveness";
import EffectivenessScatter from "./_components/EffectivenessScatter";
import PenyulangDetailModal from "./_components/PenyulangDetailModal";
import IsiKepala from "@/app/admin/_kit/IsiKepala";
import Tombol from "@/app/admin/_kit/Tombol";

// ── Constants ────────────────────────────────────────────────────────────────

const ULP_OPTIONS = ["ALL", "AMPENAN", "CAKRANEGARA", "GERUNG", "TANJUNG"];
const CURRENT_YEAR = new Date().getFullYear();

const QUICK_RANGES = [
  {
    label: "Bulan Ini",
    getRange: () => {
      const n = new Date();
      return { s: new Date(n.getFullYear(), n.getMonth(), 1, 12), e: new Date(n.getFullYear(), n.getMonth() + 1, 0, 12) };
    },
  },
  {
    label: "3 Bulan",
    getRange: () => {
      const n = new Date();
      return { s: new Date(n.getFullYear(), n.getMonth() - 2, 1, 12), e: new Date(n.getFullYear(), n.getMonth() + 1, 0, 12) };
    },
  },
  {
    label: "Tahun Ini",
    getRange: () => ({ s: new Date(CURRENT_YEAR, 0, 1, 12), e: new Date(CURRENT_YEAR, 11, 31, 12) }),
  },
];

const GROUP_CONFIG = {
  A: {
    label: "Efektif",
    sub: "Eksekusi ≥ 80%",
    color: "text-emerald-600",
    bg: "bg-emerald-50",
    border: "border-emerald-500/30",
    icon: CheckCircle2,
  },
  B: {
    label: "Parsial",
    sub: "Eksekusi < 80%",
    color: "text-amber-600",
    bg: "bg-amber-50",
    border: "border-amber-500/30",
    icon: AlertTriangle,
  },
  C: {
    label: "Belum Diinspeksi",
    sub: "Tidak ada inspeksi",
    color: "text-ink-muted",
    bg: "bg-slate-800/40",
    border: "border-slate-500/30",
    icon: Minus,
  },
} as const;

const TREND_CONFIG: Record<Trend, { label: string; color: string; bg: string; icon: typeof TrendingDown | typeof TrendingUp | typeof Minus }> = {
  turun:  { label: "Turun",  color: "text-emerald-600", bg: "bg-emerald-50", icon: TrendingDown },
  naik:   { label: "Naik",   color: "text-red-600",     bg: "bg-red-50",     icon: TrendingUp },
  stabil: { label: "Stabil", color: "text-blue-600",    bg: "bg-blue-50",    icon: Minus },
  none:   { label: "—",      color: "text-ink-muted",   bg: "bg-transparent",    icon: Minus },
};

type SortKey = "gangguanCount" | "eksekusiRate" | "inspeksiTotal" | "penyulang";

function fmt(d: Date) { return d.toISOString().split("T")[0]; }

function fmtShortDate(s: string | null): string {
  if (!s) return "—";
  const d = new Date(s + "T12:00:00");
  return d.toLocaleDateString("id-ID", { day: "2-digit", month: "short", year: "numeric" });
}

// ── Sub-components ────────────────────────────────────────────────────────────

function GroupCard({
  group,
  count,
  avgGangguan,
  totalPenyulang,
}: {
  group: "A" | "B" | "C";
  count: number;
  avgGangguan: number;
  totalPenyulang: number;
}) {
  const cfg = GROUP_CONFIG[group];
  const Icon = cfg.icon;
  const pct = totalPenyulang > 0 ? ((count / totalPenyulang) * 100).toFixed(0) : "0";
  return (
    <div className={`rounded-xl border p-4 bg-white ${cfg.border}`}>
      <div className="flex items-center justify-between mb-3">
        <div className={`flex items-center gap-2 px-2.5 py-1 rounded-full text-xs font-bold ${cfg.bg} ${cfg.color}`}>
          <Icon className="w-3.5 h-3.5" />
          Grup {group}: {cfg.label}
        </div>
        <span className="text-ink-muted text-xs">{pct}% penyulang</span>
      </div>
      <p className="text-xs text-ink-muted mb-1">{cfg.sub}</p>
      <p className={`text-3xl font-black ${cfg.color} leading-none mb-1`}>{count}</p>
      <p className="text-ink-soft text-xs mb-3">penyulang</p>
      <div className="border-t border-line pt-2 flex items-center justify-between">
        <span className="text-xs text-ink-muted">Rata-rata gangguan</span>
        <span className={`text-sm font-bold ${cfg.color}`}>{avgGangguan}</span>
      </div>
    </div>
  );
}

function TrendBadge({ trend }: { trend: Trend }) {
  const cfg = TREND_CONFIG[trend];
  const Icon = cfg.icon;
  if (trend === "none") return <span className="text-ink-muted text-xs">—</span>;
  return (
    <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold ${cfg.bg} ${cfg.color}`}>
      <Icon className="w-3 h-3" />
      {cfg.label}
    </span>
  );
}

function GroupBadge({ group }: { group: "A" | "B" | "C" }) {
  const cfg = GROUP_CONFIG[group];
  return (
    <span className={`inline-flex px-1.5 py-0.5 rounded text-[10px] font-bold ${cfg.bg} ${cfg.color}`}>
      {group}
    </span>
  );
}

function DetailTableRow({ row, rank, onClick }: { row: PenyulangEffectiveness; rank: number; onClick: () => void }) {
  const hasSelesai = row.firstSelesai !== null;

  return (
    <tr
      className="border-t border-line hover:bg-surface/60 transition-colors cursor-pointer group"
      onClick={onClick}
    >
      {/* # */}
      <td className="py-2.5 px-3 text-ink-muted text-xs">{rank}</td>

      {/* Penyulang */}
      <td className="py-2.5 px-3">
        <p className="text-xs font-semibold text-ink group-hover:text-brand-700 transition-colors leading-tight">{row.penyulang}</p>
        <p className="text-[10px] text-ink-muted">{row.ulp}</p>
      </td>

      {/* Grup */}
      <td className="py-2.5 px-3 text-center">
        <GroupBadge group={row.group} />
      </td>

      {/* Inspeksi / Selesai */}
      <td className="py-2.5 px-3 text-center">
        {row.inspeksiTotal > 0 ? (
          <div>
            <span className="text-xs font-semibold text-ink">
              {row.eksekusiSelesai}/{row.inspeksiTotal}
            </span>
            <div className="mt-0.5 h-1 bg-line rounded-full overflow-hidden w-16 mx-auto">
              <div
                className="h-full rounded-full"
                style={{
                  width: `${row.eksekusiRate}%`,
                  backgroundColor: row.eksekusiRate >= 80 ? "#10b981" : row.eksekusiRate >= 50 ? "#f59e0b" : "#ef4444",
                }}
              />
            </div>
            <span className="text-[10px] text-ink-muted">{row.eksekusiRate.toFixed(0)}%</span>
          </div>
        ) : (
          <span className="text-[10px] text-ink-muted">Belum diinspeksi</span>
        )}
      </td>

      {/* Total gangguan */}
      <td className="py-2.5 px-3 text-center">
        <span className="text-sm font-black text-red-600">{row.gangguanCount}</span>
      </td>

      {/* Sebelum inspeksi */}
      <td className="py-2.5 px-3 text-center">
        {hasSelesai ? (
          <span className="text-xs text-amber-700 font-semibold">{row.gangguanBefore}</span>
        ) : (
          <span className="text-[10px] text-ink-muted">—</span>
        )}
      </td>

      {/* Setelah inspeksi */}
      <td className="py-2.5 px-3 text-center">
        {hasSelesai ? (
          <span className={`text-xs font-semibold ${row.gangguanAfter < row.gangguanBefore ? "text-emerald-600" : row.gangguanAfter > row.gangguanBefore ? "text-red-600" : "text-ink-soft"}`}>
            {row.gangguanAfter}
          </span>
        ) : (
          <span className="text-[10px] text-ink-muted">—</span>
        )}
      </td>

      {/* Pertama selesai */}
      <td className="py-2.5 px-3 text-center text-[10px] text-ink-soft">
        {fmtShortDate(row.firstSelesai)}
      </td>

      {/* Pola inspeksi */}
      <td className="py-2.5 px-3 text-center">
        {row.inspeksiTotal === 0 ? (
          <span className="text-[10px] text-ink-muted">—</span>
        ) : (
          <div className="flex flex-col items-center gap-0.5">
            {row.proaktifCount > 0 && (
              <span className="text-[10px] font-semibold text-emerald-600">
                {row.proaktifCount}P
              </span>
            )}
            {row.reaktifCount > 0 && (
              <span className="text-[10px] font-semibold text-amber-600">
                {row.reaktifCount}R
              </span>
            )}
          </div>
        )}
      </td>

      {/* Trend */}
      <td className="py-2.5 px-3 text-center">
        <TrendBadge trend={row.trend} />
      </td>
    </tr>
  );
}

function SectionLabel({ number, title, desc }: { number: string; title: string; desc: string }) {
  return (
    <div className="flex items-center gap-3 mb-3">
      <span className="text-xs font-black text-brand-600 bg-brand-50 border border-brand-200 px-2 py-1 rounded-lg font-mono">
        {number}
      </span>
      <div>
        <h4 className="text-ink font-semibold text-sm">{title}</h4>
        <p className="text-ink-soft text-xs">{desc}</p>
      </div>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function EfektifitasInspeksiPage() {
  const user = useCurrentUser();
  const [startDate, setStartDate] = useState(() => new Date(CURRENT_YEAR, 0, 1, 12));
  const [endDate, setEndDate]     = useState(() => new Date(CURRENT_YEAR, 11, 31, 12));
  const [selectedULP, setSelectedULP] = useState(user.unit ?? "ALL");
  const [sortKey, setSortKey]     = useState<SortKey>("gangguanCount");
  const [filterGroup, setFilterGroup] = useState<"ALL" | "A" | "B" | "C">("ALL");
  const [search, setSearch]       = useState("");
  const [detailPenyulang, setDetailPenyulang] = useState<PenyulangEffectiveness | null>(null);

  const { data, loading, error, refresh } = useInspeksiEffectiveness({ startDate, endDate, selectedULP });

  const MONTH_ID = ["Jan","Feb","Mar","Apr","Mei","Jun","Jul","Agu","Sep","Okt","Nov","Des"];
  const periodLabel = (() => {
    const s = startDate;
    const e = endDate;
    if (s.getFullYear() === e.getFullYear() && s.getMonth() === 0 && e.getMonth() === 11)
      return `Tahun ${s.getFullYear()}`;
    if (s.getFullYear() === e.getFullYear() && s.getMonth() === e.getMonth())
      return `${MONTH_ID[s.getMonth()]} ${s.getFullYear()}`;
    return `${MONTH_ID[s.getMonth()]} ${s.getFullYear()} — ${MONTH_ID[e.getMonth()]} ${e.getFullYear()}`;
  })();

  // Derived: filtered + sorted table rows
  const tableRows = useMemo(() => {
    if (!data) return [];
    let rows = [...data.byPenyulang];
    if (filterGroup !== "ALL") rows = rows.filter((r) => r.group === filterGroup);
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      rows = rows.filter((r) => r.penyulang.toLowerCase().includes(q) || r.ulp.toLowerCase().includes(q));
    }
    rows.sort((a, b) => {
      if (sortKey === "penyulang") return a.penyulang.localeCompare(b.penyulang);
      if (sortKey === "eksekusiRate") return b.eksekusiRate - a.eksekusiRate;
      if (sortKey === "inspeksiTotal") return b.inspeksiTotal - a.inspeksiTotal;
      return b.gangguanCount - a.gangguanCount;
    });
    return rows;
  }, [data, sortKey, filterGroup, search]);

  const insight = (() => {
    if (!data || !data.groupA.count || !data.groupC.count) return null;
    const diff = data.groupC.avgGangguan - data.groupA.avgGangguan;
    if (diff <= 0) return null;
    const pct = ((diff / data.groupC.avgGangguan) * 100).toFixed(0);
    return { diff: diff.toFixed(1), pct };
  })();

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
              <select value={selectedULP} onChange={(e) => setSelectedULP(e.target.value)}
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

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 flex items-center gap-3">
          <AlertCircle className="w-5 h-5 text-red-600 shrink-0" />
          <p className="text-red-600 text-sm">{error}</p>
        </div>
      )}

      {/* ── Section 01: Group Overview ── */}
      <div>
        <SectionLabel number="01" title="Klasifikasi Penyulang"
          desc="Pengelompokan berdasarkan status inspeksi & tingkat eksekusi temuan"
        />
        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {Array(3).fill(0).map((_, i) => (
              <div key={i} className="h-40 bg-white rounded-xl border border-line animate-pulse" />
            ))}
          </div>
        ) : !data ? (
          <div className="bg-white rounded-xl border border-line p-8 text-center text-ink-muted text-sm">
            Tidak ada data gangguan untuk periode ini
          </div>
        ) : (
          <div className="space-y-4">
            {insight && (
              <div className="flex items-center gap-3 bg-brand-50 border border-brand-200 rounded-xl px-4 py-3">
                <TrendingDown className="w-5 h-5 text-emerald-600 shrink-0" />
                <p className="text-sm text-ink">
                  Penyulang Grup A (inspeksi efektif) rata-rata{" "}
                  <span className="font-bold text-emerald-600">{data.groupA.avgGangguan}</span> gangguan vs Grup C{" "}
                  <span className="font-bold text-ink-muted">{data.groupC.avgGangguan}</span> gangguan —{" "}
                  <span className="font-bold text-emerald-600">{insight.pct}% lebih sedikit</span>.
                </p>
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {(["A", "B", "C"] as const).map((g) => (
                <GroupCard key={g} group={g}
                  count={data[`group${g}`].count}
                  avgGangguan={data[`group${g}`].avgGangguan}
                  totalPenyulang={data.totalPenyulang}
                />
              ))}
            </div>

            <div className="bg-white rounded-xl border border-line px-4 py-3 flex flex-wrap gap-4 text-xs text-ink-soft">
              <span>Total penyulang: <span className="text-ink font-semibold">{data.totalPenyulang}</span></span>
              <span>Total gangguan: <span className="text-red-600 font-semibold">{data.totalGangguan}</span></span>
              <span>Total inspeksi: <span className="text-ink font-semibold">{data.byPenyulang.reduce((s, p) => s + p.inspeksiTotal, 0)}</span></span>
              <span>Total selesai: <span className="text-emerald-600 font-semibold">{data.byPenyulang.reduce((s, p) => s + p.eksekusiSelesai, 0)}</span></span>
            </div>
          </div>
        )}
      </div>

      {/* ── Section 02: Detail Per Penyulang ── */}
      {!loading && data && (
        <div>
          <SectionLabel number="02" title="Detail Per Penyulang"
            desc="Gangguan sebelum & sesudah inspeksi selesai pertama — tren dihitung berdasarkan rate harian"
          />
          <div className="bg-white rounded-xl border border-line">
            {/* Toolbar */}
            <div className="p-4 border-b border-line flex flex-wrap gap-3 items-center">
              {/* Search */}
              <div className="relative">
                <Search className="absolute left-2.5 top-2.5 w-3.5 h-3.5 text-ink-muted" />
                <input
                  type="text"
                  placeholder="Cari penyulang..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-8 pr-3 py-2 text-xs bg-white border border-line rounded-lg text-ink focus:outline-none focus:border-brand-500 w-44"
                />
              </div>

              {/* Group filter */}
              <div className="flex items-center gap-1">
                {(["ALL", "A", "B", "C"] as const).map((g) => (
                  <button key={g}
                    onClick={() => setFilterGroup(g)}
                    className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                      filterGroup === g
                        ? "bg-brand-600 text-white"
                        : "bg-white text-ink-muted hover:text-ink border border-line"
                    }`}
                  >
                    {g === "ALL" ? "Semua" : `Grup ${g}`}
                  </button>
                ))}
              </div>

              {/* Sort */}
              <div className="relative ml-auto">
                <ArrowUpDown className="absolute left-2.5 top-2.5 w-3.5 h-3.5 text-ink-muted" />
                <select value={sortKey} onChange={(e) => setSortKey(e.target.value as SortKey)}
                  className="pl-8 pr-3 py-2 text-xs bg-white border border-line rounded-lg text-ink focus:outline-none focus:border-brand-500 appearance-none"
                >
                  <option value="gangguanCount">Urutkan: Gangguan terbanyak</option>
                  <option value="eksekusiRate">Urutkan: Eksekusi tertinggi</option>
                  <option value="inspeksiTotal">Urutkan: Inspeksi terbanyak</option>
                  <option value="penyulang">Urutkan: Nama penyulang</option>
                </select>
              </div>
            </div>

            {/* Table */}
            <div className="overflow-x-auto">
              <table className="w-full min-w-[860px] text-xs border-collapse">
                <thead>
                  <tr className="bg-white border-b border-line">
                    <th className="text-left py-3 px-3 text-ink-muted font-semibold w-8">#</th>
                    <th className="text-left py-3 px-3 text-ink-soft font-semibold">Penyulang</th>
                    <th className="text-center py-3 px-3 text-ink-soft font-semibold">Grup</th>
                    <th className="text-center py-3 px-3 text-ink-soft font-semibold">
                      Inspeksi/<br />Selesai
                    </th>
                    <th className="text-center py-3 px-3 text-red-600 font-semibold">Total<br />Gangguan</th>
                    <th className="text-center py-3 px-3 text-amber-600 font-semibold">
                      Sebelum<br />Inspeksi
                    </th>
                    <th className="text-center py-3 px-3 text-emerald-600 font-semibold">
                      Setelah<br />Inspeksi
                    </th>
                    <th className="text-center py-3 px-3 text-ink-soft font-semibold">Tgl Selesai<br />Pertama</th>
                    <th className="text-center py-3 px-3 text-ink-soft font-semibold">Pola<br />Inspeksi</th>
                    <th className="text-center py-3 px-3 text-ink-soft font-semibold">Tren</th>
                  </tr>
                </thead>
                <tbody>
                  {tableRows.length === 0 ? (
                    <tr>
                      <td colSpan={9} className="py-8 text-center text-ink-muted text-sm">
                        Tidak ada data yang cocok
                      </td>
                    </tr>
                  ) : (
                    tableRows.map((row, i) => (
                      <DetailTableRow key={row.penyulang} row={row} rank={i + 1} onClick={() => setDetailPenyulang(row)} />
                    ))
                  )}
                </tbody>
              </table>
            </div>

            <div className="px-4 py-2.5 border-t border-line text-[10px] text-ink-muted flex items-center justify-between">
              <span>
                {tableRows.length} dari {data.totalPenyulang} penyulang ·
                Tren dihitung dari rate gangguan/hari sebelum vs sesudah inspeksi selesai pertama (perlu ≥7 hari data pasca inspeksi)
              </span>
              <span className="text-brand-600">Klik baris untuk detail →</span>
            </div>
          </div>
        </div>
      )}

      {/* ── Section 03: Scatter Chart ── */}
      {!loading && data && (
        <div>
          <SectionLabel number="03" title="Korelasi Inspeksi vs Gangguan"
            desc="Semakin tinggi % eksekusi selesai, idealnya semakin sedikit gangguan"
          />
          <div className="bg-white rounded-xl border border-line p-5">
            <EffectivenessScatter data={data.byPenyulang} medianGangguan={data.medianGangguan} />
          </div>
        </div>
      )}

      {/* ── Section 04: Re-inspection List ── */}
      {!loading && data && data.reinspectionNeeded.length > 0 && (
        <div>
          <SectionLabel number="04" title="Perlu Re-inspeksi Segera"
            desc="Penyulang dengan gangguan tinggi namun inspeksi sudah > 6 bulan atau belum pernah"
          />
          <div className="bg-white rounded-xl border border-line overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full min-w-max text-xs border-collapse">
                <thead>
                  <tr className="bg-white border-b border-line">
                    <th className="text-left py-3 px-3 text-ink-muted font-semibold w-10">#</th>
                    <th className="text-left py-3 px-3 text-ink-soft font-semibold">Penyulang</th>
                    <th className="text-center py-3 px-3 text-red-600 font-semibold">Gangguan</th>
                    <th className="text-center py-3 px-3 text-ink-soft font-semibold">Eksekusi</th>
                    <th className="text-center py-3 px-3 text-ink-soft font-semibold">Inspeksi Terakhir</th>
                    <th className="text-center py-3 px-3 text-ink-soft font-semibold">Alasan</th>
                  </tr>
                </thead>
                <tbody>
                  {data.reinspectionNeeded.map((row, i) => {
                    const urgency = row.lastInspeksi === null ? "Belum pernah"
                      : row.eksekusiRate < 50 ? "Eksekusi rendah"
                      : "Inspeksi lama";
                    const urgencyColor = row.lastInspeksi === null
                      ? "text-red-600 bg-red-50"
                      : row.eksekusiRate < 50
                      ? "text-amber-600 bg-amber-50"
                      : "text-blue-600 bg-blue-50";
                    return (
                      <tr key={row.penyulang} className="border-t border-line hover:bg-white transition-colors">
                        <td className="py-2.5 px-3">
                          <span className="w-5 h-5 rounded-full bg-line text-ink-soft text-[10px] font-bold flex items-center justify-center">
                            {i + 1}
                          </span>
                        </td>
                        <td className="py-2.5 px-3">
                          <p className="text-xs font-semibold text-ink">{row.penyulang}</p>
                          <p className="text-[10px] text-ink-muted">{row.ulp}</p>
                        </td>
                        <td className="py-2.5 px-3 text-center">
                          <span className="text-sm font-bold text-red-600">{row.gangguanCount}</span>
                        </td>
                        <td className="py-2.5 px-3 text-center text-xs text-ink-soft">
                          {row.inspeksiTotal > 0
                            ? `${row.eksekusiSelesai}/${row.inspeksiTotal} (${row.eksekusiRate.toFixed(0)}%)`
                            : <span className="text-ink-muted">—</span>}
                        </td>
                        <td className="py-2.5 px-3 text-center">
                          <div className="flex items-center justify-center gap-1 text-xs text-ink-soft">
                            <Clock className="w-3 h-3" />
                            {fmtShortDate(row.lastInspeksi)}
                          </div>
                        </td>
                        <td className="py-2.5 px-3 text-center">
                          <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${urgencyColor}`}>
                            {urgency}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div className="px-4 py-2.5 border-t border-line text-[10px] text-ink-muted">
              Threshold: gangguan &gt; median ({data.medianGangguan}) DAN inspeksi terakhir &gt; 6 bulan lalu
            </div>
          </div>
        </div>
      )}

      {loading && (
        <div className="space-y-4">
          {Array(2).fill(0).map((_, i) => (
            <div key={i} className="h-48 bg-white rounded-xl border border-line animate-pulse" />
          ))}
        </div>
      )}

      {/* Detail modal */}
      {detailPenyulang && (
        <PenyulangDetailModal
          penyulang={detailPenyulang}
          user={user}
          periodLabel={periodLabel}
          onClose={() => setDetailPenyulang(null)}
        />
      )}
    </div>
  );
}
