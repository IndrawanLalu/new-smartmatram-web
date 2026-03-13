"use client";

import dynamic from "next/dynamic";
import { useCurrentUser } from "@/app/admin/_context/UserContext";
import { canSeeAllUnits, UNITS } from "@/lib/roles";
import {
  usePengukuranGardu,
  OVERLOAD_PCT,
  UNDERLOAD_PCT,
  HIGH_CURRENT_A,
  HIGH_TEMP_C,
  getNominalCurrent,
  type PengukuranGardu,
} from "./_hooks/usePengukuranGardu";
import {
  Gauge,
  AlertTriangle,
  TrendingUp,
  TrendingDown,
  Thermometer,
  Zap,
  RefreshCw,
  Search,
  ChevronLeft,
  ChevronRight,
  Download,
} from "lucide-react";
import { useState, useMemo, useEffect } from "react";
import GarduDetailModal from "./_components/GarduDetailModal";
import EditPengukuranModal from "./_components/EditPengukuranModal";
import FilterGarduTab from "./_components/FilterGarduTab";

// Chart via dynamic import (recharts tidak SSR-friendly)
const BebanBarChart = dynamic(() => import("./_components/BebanBarChart"), {
  ssr: false,
  loading: () => (
    <div className="h-[300px] flex items-center justify-center text-[#94a3b8] text-sm">
      <div className="w-6 h-6 border-4 border-[#1e3552] border-t-[#00897B] rounded-full animate-spin mr-2" />
      Memuat chart...
    </div>
  ),
});

// ── Constants ─────────────────────────────────────────────────────────────────

const MONTHS = [
  "Januari", "Februari", "Maret", "April", "Mei", "Juni",
  "Juli", "Agustus", "September", "Oktober", "November", "Desember",
];

const INPUT_CLASS =
  "border border-[#1e3552] rounded-lg px-3 py-1.5 text-sm text-[#e2e8f0] focus:outline-none focus:border-[#00897B] focus:ring-2 focus:ring-[#00897B]/20 bg-[#162334]";

const PAGE_SIZE = 20;

// ── Download CSV ───────────────────────────────────────────────────────────────

function downloadCSV(rows: PengukuranGardu[], filename: string) {
  // Kumpulkan semua jurusan unik dari seluruh data
  const jurusanKeys = [...new Set(
    rows.flatMap((r) => Object.keys(r.perjurusan ?? {}))
  )].sort();

  const jurusanHeaders = jurusanKeys.flatMap((k) => [
    `Jur ${k} Arus R (A)`, `Jur ${k} Arus S (A)`, `Jur ${k} Arus T (A)`, `Jur ${k} Arus N (A)`,
    `Jur ${k} Teg Ujung R (V)`, `Jur ${k} Teg Ujung S (V)`, `Jur ${k} Teg Ujung T (V)`,
  ]);

  const headers = [
    "No. Gardu", "Penyulang", "Alamat", "KVA Trafo",
    "% Beban", "Beban KVA",
    "Arus R (A)", "Arus S (A)", "Arus T (A)", "Arus N (A)",
    "Teg R-N (V)", "Teg S-N (V)", "Teg T-N (V)",
    "Suhu (°C)", "Tanggal Ukur", "Petugas", "Unit",
    ...jurusanHeaders,
  ];

  const csvRows = rows.map((r) => {
    const jurusanValues = jurusanKeys.flatMap((k) => {
      const j = r.perjurusan?.[k];
      return [
        Math.round(j?.arus?.R ?? 0), Math.round(j?.arus?.S ?? 0),
        Math.round(j?.arus?.T ?? 0), Math.round(j?.arus?.N ?? 0),
        Math.round(j?.tegangan?.R ?? 0), Math.round(j?.tegangan?.S ?? 0), Math.round(j?.tegangan?.T ?? 0),
      ];
    });
    return [
      r.no_gardu, r.penyulang ?? "", r.alamat ?? "", r.kva_trafo,
      Math.round(r.persen_beban), Math.round(r.beban_kva),
      Math.round(r.total_arus_r), Math.round(r.total_arus_s), Math.round(r.total_arus_t), Math.round(r.total_arus_n),
      Math.round(r.total_teg_rn), Math.round(r.total_teg_sn), Math.round(r.total_teg_tn),
      r.suhu_trafo, r.tanggal_pengukuran, r.petugas_nama ?? "", r.petugas_unit,
      ...jurusanValues,
    ].map((v) => `"${v}"`).join(",");
  });

  const csv = [headers.join(","), ...csvRows].join("\n");
  const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

// ── Sub-components ────────────────────────────────────────────────────────────

function KPICard({
  label,
  value,
  sub,
  icon: Icon,
  variant = "default",
}: {
  label: string;
  value: number | string;
  sub: string;
  icon: React.ElementType;
  variant?: "default" | "danger" | "warning" | "success" | "info";
}) {
  const styles = {
    default: { card: "border-[#1e3552]", icon: "bg-[#0a2a26] text-[#5eead4]", value: "text-[#e2e8f0]" },
    danger:  { card: "border-red-200 bg-red-50/50", icon: "bg-red-100 text-red-600", value: "text-red-700" },
    warning: { card: "border-amber-200 bg-amber-50/50", icon: "bg-amber-100 text-amber-600", value: "text-amber-700" },
    success: { card: "border-green-200 bg-green-50/50", icon: "bg-green-100 text-green-600", value: "text-green-700" },
    info:    { card: "border-blue-200 bg-blue-50/50", icon: "bg-blue-100 text-blue-600", value: "text-blue-700" },
  }[variant];

  return (
    <div className={`bg-[#162334] rounded-xl border p-4 flex items-center gap-4 ${styles.card}`}>
      <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${styles.icon}`}>
        <Icon size={18} />
      </div>
      <div className="min-w-0">
        <p className="text-xs text-[#94a3b8] truncate">{label}</p>
        <p className={`text-2xl font-bold leading-tight ${styles.value}`}>{value}</p>
        <p className="text-xs text-[#94a3b8]">{sub}</p>
      </div>
    </div>
  );
}

function BebanBadge({ pct }: { pct: number }) {
  const cfg =
    pct >= OVERLOAD_PCT
      ? { cls: "bg-red-100 text-red-700", label: "Overload" }
      : pct >= 60
      ? { cls: "bg-amber-100 text-amber-700", label: "Normal" }
      : pct >= UNDERLOAD_PCT
      ? { cls: "bg-green-100 text-green-700", label: "Normal" }
      : { cls: "bg-gray-100 text-gray-600", label: "Rendah" };

  return (
    <div className="flex items-center gap-1.5">
      <div className="w-20 bg-gray-100 rounded-full h-1.5">
        <div
          className={`h-1.5 rounded-full ${pct >= OVERLOAD_PCT ? "bg-red-500" : pct >= 60 ? "bg-amber-500" : "bg-green-500"}`}
          style={{ width: `${Math.min(pct, 100)}%` }}
        />
      </div>
      <span className={`text-xs font-semibold px-1.5 py-0.5 rounded-full ${cfg.cls}`}>
        {Math.round(pct)}%
      </span>
    </div>
  );
}

function ArusCell({ r, s, t, kva }: { r: number; s: number; t: number; kva?: number }) {
  const iNom = kva ? getNominalCurrent(kva) : null;

  const phaseCls = (v: number) => {
    if (v > HIGH_CURRENT_A) return "text-red-600 font-bold";
    if (iNom && v >= iNom) return "text-red-500 font-semibold";
    if (iNom && v >= iNom * 0.9) return "text-amber-400 font-semibold";
    return "text-[#94a3b8]";
  };

  const hasHighAbs = Math.max(r, s, t) > HIGH_CURRENT_A;
  const hasPhaseAlert = iNom ? Math.max(r, s, t) >= iNom * 0.9 : false;

  return (
    <div className="text-xs font-mono flex items-center justify-center gap-0.5">
      <span title="R" className={phaseCls(r)}>{Math.round(r)}</span>
      <span className="text-[#1e3552]">/</span>
      <span title="S" className={phaseCls(s)}>{Math.round(s)}</span>
      <span className="text-[#1e3552]">/</span>
      <span title="T" className={phaseCls(t)}>{Math.round(t)}</span>
      {hasHighAbs && <AlertTriangle size={10} className="ml-1 text-red-500 shrink-0" />}
      {!hasHighAbs && hasPhaseAlert && <AlertTriangle size={10} className="ml-1 text-amber-400 shrink-0" />}
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function PengukuranGarduPage() {
  const user = useCurrentUser();
  const [activeTab, setActiveTab] = useState<"rekap" | "filter">("rekap");
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [selectedRow, setSelectedRow] = useState<PengukuranGardu | null>(null);
  const [editRow, setEditRow] = useState<PengukuranGardu | null>(null);

  // Centralized ESC: tutup edit dulu, baru detail
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (editRow) setEditRow(null);
      else if (selectedRow) setSelectedRow(null);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [editRow, selectedRow]);

  const {
    data,
    latestData,
    loading,
    error,
    filter,
    setFilter,
    overloadData,
    underloadData,
    highTempData,
    highCurrentItems,
    phaseOverloadItems,
    alertGarduIds,
    penyulangOptions,
    avgBeban,
    bebanChartData,
    refresh,
  } = usePengukuranGardu(user);

  const now = new Date();
  const years = useMemo(
    () => Array.from({ length: 4 }, (_, i) => now.getFullYear() - 1 + i),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );

  const showUlpFilter = canSeeAllUnits(user.role);

  // Client-side search dalam rekap tabel (dari latestData — satu gardu satu baris)
  const filteredData = useMemo(() => {
    if (!search) return latestData;
    const q = search.toLowerCase();
    return latestData.filter(
      (d) =>
        d.no_gardu?.toLowerCase().includes(q) ||
        d.penyulang?.toLowerCase().includes(q) ||
        d.alamat?.toLowerCase().includes(q) ||
        d.petugas_nama?.toLowerCase().includes(q)
    );
  }, [latestData, search]);

  const paginatedData = useMemo(
    () => filteredData.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE),
    [filteredData, page]
  );
  const totalPages = Math.ceil(filteredData.length / PAGE_SIZE);

  return (
    <>
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-linear-to-r from-[#004D40] to-[#00897B] text-white rounded-xl p-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold">Dashboard Pengukuran Gardu</h1>
            <p className="text-teal-100 text-sm mt-1">
              {canSeeAllUnits(user.role)
                ? "Semua ULP — PLN UP3 Mataram"
                : `ULP ${user.unit} · ${user.role}`}
            </p>
          </div>
          <div className="flex items-center gap-3 text-sm text-teal-100">
            <div className="bg-white/10 rounded-lg px-3 py-1.5">
              <span className="font-semibold text-white">{latestData.length}</span> Gardu
              {data.length > latestData.length && (
                <span className="ml-1 opacity-70">({data.length} pengukuran)</span>
              )}
            </div>
            <div className="bg-white/10 rounded-lg px-3 py-1.5">
              Rata-rata beban:{" "}
              <span className={`font-semibold ${avgBeban >= OVERLOAD_PCT ? "text-red-300" : "text-white"}`}>
                {avgBeban}%
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Tab Switcher */}
      <div className="flex gap-1 bg-[#0d1b2a] border border-[#1e3552] rounded-lg p-1 w-fit">
        {(["rekap", "filter"] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-1.5 rounded-md text-xs font-medium transition-colors ${
              activeTab === tab
                ? "bg-[#00897B] text-white"
                : "text-[#94a3b8] hover:text-[#e2e8f0]"
            }`}
          >
            {tab === "rekap" ? "Rekap Bulanan" : "Filter Pengukuran"}
          </button>
        ))}
      </div>

      {activeTab === "filter" && <FilterGarduTab user={user} />}

      {activeTab === "rekap" && <>
      {/* Filter Bar */}
      <div className="bg-[#162334] rounded-xl border border-[#1e3552] p-4 flex flex-wrap items-center gap-3">
        <span className="text-sm font-medium text-[#e2e8f0]">Periode:</span>
        <select
          value={filter.month}
          onChange={(e) => { setFilter((f) => ({ ...f, month: Number(e.target.value) })); setPage(1); }}
          className={INPUT_CLASS}
        >
          {MONTHS.map((m, i) => <option key={i} value={i + 1}>{m}</option>)}
        </select>
        <select
          value={filter.year}
          onChange={(e) => { setFilter((f) => ({ ...f, year: Number(e.target.value) })); setPage(1); }}
          className={INPUT_CLASS}
        >
          {years.map((y) => <option key={y} value={y}>{y}</option>)}
        </select>

        {showUlpFilter && (
          <select
            value={filter.ulp}
            onChange={(e) => { setFilter((f) => ({ ...f, ulp: e.target.value, penyulang: "" })); setPage(1); }}
            className={INPUT_CLASS}
          >
            <option value="">Semua ULP</option>
            {UNITS.map((u) => <option key={u.value} value={u.value}>{u.label}</option>)}
          </select>
        )}

        <select
          value={filter.penyulang}
          onChange={(e) => { setFilter((f) => ({ ...f, penyulang: e.target.value })); setPage(1); }}
          className={INPUT_CLASS}
        >
          <option value="">Semua Penyulang</option>
          {penyulangOptions.map((p) => <option key={p} value={p}>{p}</option>)}
        </select>

        <button
          onClick={() => refresh()}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[#1e3552] text-sm text-[#94a3b8] hover:bg-gray-50 transition-colors ml-auto"
        >
          <RefreshCw size={14} />
          Refresh
        </button>
      </div>

      {/* Error */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-red-700 text-sm">
          Gagal memuat data: {error}
        </div>
      )}

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
        <KPICard label="Total Pengukuran" value={loading ? "—" : data.length} sub={`${MONTHS[filter.month - 1]} ${filter.year}`} icon={Gauge} />
        <KPICard label="Trafo Overload" value={loading ? "—" : overloadData.length} sub={`beban ≥ ${OVERLOAD_PCT}%`} icon={TrendingUp} variant={overloadData.length > 0 ? "danger" : "default"} />
        <KPICard label="Trafo Underload" value={loading ? "—" : underloadData.length} sub={`beban < ${UNDERLOAD_PCT}%`} icon={TrendingDown} variant={underloadData.length > 0 ? "warning" : "default"} />
        <KPICard label={`Jurusan >${HIGH_CURRENT_A}A`} value={loading ? "—" : highCurrentItems.length} sub="jurusan arus tinggi" icon={Zap} variant={highCurrentItems.length > 0 ? "danger" : "default"} />
        <KPICard label="Overload 1 Fasa" value={loading ? "—" : phaseOverloadItems.length} sub="arus > I-nominal" icon={AlertTriangle} variant={phaseOverloadItems.filter(d => d.level === "overload").length > 0 ? "danger" : phaseOverloadItems.length > 0 ? "warning" : "default"} />
        <KPICard label={`Suhu Trafo >${HIGH_TEMP_C}°C`} value={loading ? "—" : highTempData.length} sub="suhu tinggi" icon={Thermometer} variant={highTempData.length > 0 ? "warning" : "default"} />
      </div>

      {/* ── Alert Section ──────────────────────────────────────────────────── */}
      {!loading && (overloadData.length > 0 || highCurrentItems.length > 0 || highTempData.length > 0 || phaseOverloadItems.length > 0) && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">

          {/* Overload trafo */}
          {overloadData.length > 0 && (
            <div className="bg-[#162334] rounded-xl border border-red-200 overflow-hidden">
              <div className="px-5 py-3 bg-red-50 border-b border-red-100 flex items-center gap-2">
                <TrendingUp size={16} className="text-red-600" />
                <h3 className="font-semibold text-red-700 text-sm">
                  Trafo Overload ({overloadData.length})
                </h3>
              </div>
              <div className="divide-y divide-[#E2E8F0] max-h-64 overflow-y-auto">
                {overloadData.map((d) => (
                  <div key={d.id} className="px-5 py-3 flex items-center justify-between">
                    <div>
                      <p className="text-sm font-semibold text-[#e2e8f0]">{d.no_gardu}</p>
                      <p className="text-xs text-[#94a3b8]">
                        {d.penyulang ?? "—"} · {d.kva_trafo} KVA · {d.tanggal_pengukuran}
                      </p>
                    </div>
                    <span className="text-lg font-bold text-red-600">{Math.round(d.persen_beban)}%</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Jurusan arus tinggi */}
          {highCurrentItems.length > 0 && (
            <div className="bg-[#162334] rounded-xl border border-red-200 overflow-hidden">
              <div className="px-5 py-3 bg-red-50 border-b border-red-100 flex items-center gap-2">
                <Zap size={16} className="text-red-600" />
                <h3 className="font-semibold text-red-700 text-sm">
                  Jurusan Arus &gt;{HIGH_CURRENT_A}A ({highCurrentItems.length})
                </h3>
              </div>
              <div className="overflow-x-auto max-h-64 overflow-y-auto">
                <table className="w-full text-xs">
                  <thead className="bg-red-50 sticky top-0">
                    <tr>
                      <th className="text-left px-4 py-2 text-red-700 font-semibold">Gardu</th>
                      <th className="text-left px-4 py-2 text-red-700 font-semibold">Jur.</th>
                      <th className="text-center px-4 py-2 text-red-700 font-semibold">R (A)</th>
                      <th className="text-center px-4 py-2 text-red-700 font-semibold">S (A)</th>
                      <th className="text-center px-4 py-2 text-red-700 font-semibold">T (A)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {highCurrentItems.map((item, i) => (
                      <tr key={i} className={i % 2 === 0 ? "bg-[#162334]" : "bg-red-50/30"}>
                        <td className="px-4 py-2 font-medium text-[#e2e8f0]">{item.no_gardu}</td>
                        <td className="px-4 py-2 font-bold text-red-600">{item.jurusan}</td>
                        <td className={`px-4 py-2 text-center font-mono ${item.arus_r > HIGH_CURRENT_A ? "text-red-600 font-bold" : "text-[#94a3b8]"}`}>
                          {Math.round(item.arus_r)}
                        </td>
                        <td className={`px-4 py-2 text-center font-mono ${item.arus_s > HIGH_CURRENT_A ? "text-red-600 font-bold" : "text-[#94a3b8]"}`}>
                          {Math.round(item.arus_s)}
                        </td>
                        <td className={`px-4 py-2 text-center font-mono ${item.arus_t > HIGH_CURRENT_A ? "text-red-600 font-bold" : "text-[#94a3b8]"}`}>
                          {Math.round(item.arus_t)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Overload 1 fasa */}
          {phaseOverloadItems.length > 0 && (
            <div className="bg-[#162334] rounded-xl border border-orange-200 overflow-hidden">
              <div className="px-5 py-3 bg-orange-50 border-b border-orange-100 flex items-center gap-2">
                <AlertTriangle size={16} className="text-orange-600" />
                <h3 className="font-semibold text-orange-700 text-sm">
                  Overload 1 Fasa ({phaseOverloadItems.length})
                </h3>
                <span className="text-xs text-orange-500 ml-auto">arus total &gt; 90% I-nominal</span>
              </div>
              <div className="overflow-x-auto max-h-64 overflow-y-auto">
                <table className="w-full text-xs">
                  <thead className="bg-orange-50 sticky top-0">
                    <tr>
                      <th className="text-left px-4 py-2 text-orange-700 font-semibold">Gardu</th>
                      <th className="text-center px-4 py-2 text-orange-700 font-semibold">KVA</th>
                      <th className="text-center px-4 py-2 text-orange-700 font-semibold">I-Nom (A)</th>
                      <th className="text-center px-4 py-2 text-orange-700 font-semibold">R (A)</th>
                      <th className="text-center px-4 py-2 text-orange-700 font-semibold">S (A)</th>
                      <th className="text-center px-4 py-2 text-orange-700 font-semibold">T (A)</th>
                      <th className="text-center px-4 py-2 text-orange-700 font-semibold">% Nom</th>
                      <th className="text-center px-4 py-2 text-orange-700 font-semibold">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {phaseOverloadItems.map((item, i) => {
                      const iNom = item.i_nominal;
                      const cellCls = (v: number) =>
                        v >= iNom ? "text-red-600 font-bold" :
                        v >= iNom * 0.9 ? "text-amber-600 font-bold" : "text-[#94a3b8]";
                      return (
                        <tr key={item.id} className={i % 2 === 0 ? "bg-[#162334]" : "bg-orange-50/20"}>
                          <td className="px-4 py-2 font-medium text-[#e2e8f0]">{item.no_gardu}</td>
                          <td className="px-4 py-2 text-center text-[#94a3b8]">{item.kva_trafo}</td>
                          <td className="px-4 py-2 text-center text-[#94a3b8]">{Math.round(iNom)}</td>
                          <td className={`px-4 py-2 text-center font-mono ${cellCls(item.arus_r)}`}>{Math.round(item.arus_r)}</td>
                          <td className={`px-4 py-2 text-center font-mono ${cellCls(item.arus_s)}`}>{Math.round(item.arus_s)}</td>
                          <td className={`px-4 py-2 text-center font-mono ${cellCls(item.arus_t)}`}>{Math.round(item.arus_t)}</td>
                          <td className={`px-4 py-2 text-center font-mono font-semibold ${item.level === "overload" ? "text-red-600" : "text-amber-600"}`}>
                            {Math.round(item.pct_nominal)}%
                          </td>
                          <td className="px-4 py-2 text-center">
                            <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${item.level === "overload" ? "bg-red-100 text-red-700" : "bg-amber-100 text-amber-700"}`}>
                              {item.level === "overload" ? "Overload" : "Warning"}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Suhu tinggi */}
          {highTempData.length > 0 && (
            <div className="bg-[#162334] rounded-xl border border-amber-200 overflow-hidden">
              <div className="px-5 py-3 bg-amber-50 border-b border-amber-100 flex items-center gap-2">
                <Thermometer size={16} className="text-amber-600" />
                <h3 className="font-semibold text-amber-700 text-sm">
                  Suhu Trafo &gt;{HIGH_TEMP_C}°C ({highTempData.length})
                </h3>
              </div>
              <div className="divide-y divide-[#E2E8F0] max-h-64 overflow-y-auto">
                {highTempData.map((d) => (
                  <div key={d.id} className="px-5 py-3 flex items-center justify-between">
                    <div>
                      <p className="text-sm font-semibold text-[#e2e8f0]">{d.no_gardu}</p>
                      <p className="text-xs text-[#94a3b8]">
                        {d.penyulang ?? "—"} · Beban {Math.round(d.persen_beban)}% · {d.tanggal_pengukuran}
                      </p>
                    </div>
                    <span className="text-lg font-bold text-amber-600">{d.suhu_trafo}°C</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Distribusi Beban Chart ─────────────────────────────────────────── */}
      <div className="bg-[#162334] rounded-xl border border-[#1e3552] overflow-hidden">
        <div className="px-5 py-4 border-b border-[#1e3552] flex items-center justify-between">
          <div>
            <h3 className="font-semibold text-[#e2e8f0]">Distribusi % Beban Trafo</h3>
            <p className="text-xs text-[#94a3b8] mt-0.5">Top 20 gardu dengan beban tertinggi</p>
          </div>
          <div className="flex items-center gap-4 text-xs text-[#94a3b8]">
            <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-sm bg-red-500 inline-block" /> Overload ≥80%</span>
            <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-sm bg-amber-500 inline-block" /> ≥60%</span>
            <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-sm bg-[#00897B] inline-block" /> Normal</span>
          </div>
        </div>
        <div className="p-5">
          {loading ? (
            <div className="h-[300px] flex items-center justify-center">
              <div className="w-6 h-6 border-4 border-[#1e3552] border-t-[#00897B] rounded-full animate-spin" />
            </div>
          ) : (
            <BebanBarChart data={bebanChartData} />
          )}
        </div>
      </div>

      {/* ── Rekap Tabel ───────────────────────────────────────────────────── */}
      <div className="bg-[#162334] rounded-xl border border-[#1e3552] overflow-hidden">
        <div className="px-5 py-4 border-b border-[#1e3552] flex items-center gap-3">
          <div className="relative flex-1 max-w-72">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#94a3b8]" />
            <input
              type="text"
              placeholder="Cari no. gardu, penyulang, alamat..."
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1); }}
              className="border border-[#1e3552] rounded-lg pl-8 pr-3 py-1.5 text-sm w-full focus:outline-none focus:border-[#00897B] focus:ring-2 focus:ring-[#00897B]/20"
            />
          </div>
          <p className="text-sm text-[#94a3b8] ml-auto">
            {loading ? "Memuat..." : `${filteredData.length} gardu`}
          </p>
          <button
            onClick={() =>
              downloadCSV(
                filteredData,
                `pengukuran_gardu_${MONTHS[filter.month - 1]}_${filter.year}.csv`
              )
            }
            disabled={filteredData.length === 0}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-linear-to-r from-[#004D40] to-[#00897B] text-white text-sm hover:opacity-90 transition-opacity disabled:opacity-40"
          >
            <Download size={14} />
            Download CSV
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-[#0a2a26]">
                <th className="text-left px-4 py-3 text-xs text-[#5eead4] font-semibold whitespace-nowrap">No. Gardu</th>
                <th className="text-left px-4 py-3 text-xs text-[#5eead4] font-semibold">Penyulang</th>
                <th className="text-left px-4 py-3 text-xs text-[#5eead4] font-semibold">Alamat</th>
                <th className="text-center px-4 py-3 text-xs text-[#5eead4] font-semibold">KVA</th>
                <th className="text-left px-4 py-3 text-xs text-[#5eead4] font-semibold min-w-32">% Beban</th>
                <th className="text-center px-4 py-3 text-xs text-[#5eead4] font-semibold">Beban KVA</th>
                <th className="text-center px-4 py-3 text-xs text-[#5eead4] font-semibold whitespace-nowrap">Arus R/S/T (A)</th>
                <th className="text-center px-4 py-3 text-xs text-[#5eead4] font-semibold">Suhu (°C)</th>
                <th className="text-left px-4 py-3 text-xs text-[#5eead4] font-semibold whitespace-nowrap">Tgl Ukur</th>
                <th className="text-left px-4 py-3 text-xs text-[#5eead4] font-semibold">Petugas</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i} className={i % 2 === 0 ? "bg-[#162334]" : "bg-gray-50/50"}>
                    {Array.from({ length: 10 }).map((_, j) => (
                      <td key={j} className="px-4 py-3">
                        <div className="h-4 bg-gray-100 animate-pulse rounded" />
                      </td>
                    ))}
                  </tr>
                ))
              ) : paginatedData.length === 0 ? (
                <tr>
                  <td colSpan={10} className="text-center py-12 text-[#94a3b8] text-sm">
                    Tidak ada data pengukuran untuk periode ini
                  </td>
                </tr>
              ) : (
                paginatedData.map((row, i) => {
                  const hasAlert = alertGarduIds.has(row.id);
                  const isOverload = row.persen_beban >= OVERLOAD_PCT;
                  const isHighTemp = row.suhu_trafo > HIGH_TEMP_C;
                  return (
                    <tr
                      key={row.id}
                      onClick={() => setSelectedRow(row)}
                      className={`cursor-pointer hover:bg-teal-50/30 transition-colors ${i % 2 === 0 ? "bg-[#162334]" : "bg-gray-50/30"} ${hasAlert ? "border-l-2 border-l-red-400" : ""}`}
                    >
                      <td className="px-4 py-3 whitespace-nowrap">
                        <span className="font-semibold text-[#e2e8f0]">{row.no_gardu}</span>
                        {hasAlert && <AlertTriangle size={12} className="inline ml-1 text-red-500" />}
                        {row.wo_sent_at && (
                          <span className="ml-1.5 text-[10px] bg-teal-900/40 text-teal-400 border border-teal-500/30 px-1.5 py-0.5 rounded-full font-semibold align-middle">
                            WO
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-[#94a3b8]">{row.penyulang ?? "—"}</td>
                      <td className="px-4 py-3 text-[#94a3b8] max-w-40 truncate">{row.alamat ?? "—"}</td>
                      <td className="px-4 py-3 text-center text-[#e2e8f0] font-medium">{row.kva_trafo}</td>
                      <td className="px-4 py-3">
                        <BebanBadge pct={row.persen_beban} />
                      </td>
                      <td className="px-4 py-3 text-center text-[#94a3b8]">{Math.round(row.beban_kva)}</td>
                      <td className="px-4 py-3 text-center">
                        <ArusCell r={row.total_arus_r} s={row.total_arus_s} t={row.total_arus_t} kva={row.kva_trafo} />
                      </td>
                      <td className={`px-4 py-3 text-center font-mono font-medium ${isHighTemp ? "text-amber-600" : "text-[#94a3b8]"}`}>
                        {row.suhu_trafo}
                        {isHighTemp && "🌡"}
                      </td>
                      <td className="px-4 py-3 text-[#94a3b8] whitespace-nowrap">{row.tanggal_pengukuran}</td>
                      <td className="px-4 py-3 text-[#94a3b8] truncate max-w-32">{row.petugas_nama ?? "—"}</td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {totalPages > 1 && (
          <div className="px-5 py-3 border-t border-[#1e3552] flex items-center justify-between">
            <p className="text-xs text-[#94a3b8]">Halaman {page} dari {totalPages}</p>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
                className="w-8 h-8 flex items-center justify-center rounded-lg border border-[#1e3552] text-[#94a3b8] hover:bg-gray-50 disabled:opacity-40 transition-colors"
              >
                <ChevronLeft size={14} />
              </button>
              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
                className="w-8 h-8 flex items-center justify-center rounded-lg border border-[#1e3552] text-[#94a3b8] hover:bg-gray-50 disabled:opacity-40 transition-colors"
              >
                <ChevronRight size={14} />
              </button>
            </div>
          </div>
        )}
      </div>
      </>}
    </div>

    <GarduDetailModal
      row={selectedRow}
      onClose={() => setSelectedRow(null)}
      onEdit={setEditRow}
      allData={data}
      onRefresh={refresh}
    />
    <EditPengukuranModal
      row={editRow}
      onClose={() => setEditRow(null)}
      onSaved={() => { setEditRow(null); setSelectedRow(null); refresh(); }}
    />
    </>
  );
}
