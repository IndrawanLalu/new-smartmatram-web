"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { CARD, BTN_PRIMARY } from "@/app/admin/_ui";
import { useCurrentUser } from "@/app/admin/_context/UserContext";
import { canSeeAllUnits, UNITS } from "@/lib/roles";
import { antreKeAmg } from "./_lib/amgQueue";
import { downloadXlsx } from "./_utils/downloadXlsx";
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
  AlertTriangle,
  RefreshCw,
  Search,
  ChevronLeft,
  ChevronRight,
  Download,
  Send,
  X,
  CheckSquare2,
  Square,
  Loader2,
  CheckCircle2,
  XCircle,
  LayoutDashboard,
  TableProperties,
  SlidersHorizontal,
  Scale,
  Database,
  ClipboardList,
} from "lucide-react";
import { useState, useMemo, useEffect } from "react";
import GarduDetailModal from "./_components/GarduDetailModal";
import EditPengukuranModal from "./_components/EditPengukuranModal";
import FilterGarduTab from "./_components/FilterGarduTab";
import PenyeimbanganTab from "./_components/PenyeimbanganTab";
import WoPengukuranTab from "./_components/WoPengukuranTab";
import AlertDetailModal from "./_components/AlertDetailModal";
import AnomalySettingsPanel from "./_components/AnomalySettingsPanel";
import { useYearlyStats } from "./_hooks/useYearlyStats";
import { useAnomalySettings } from "@/app/admin/_hooks/useAnomalySettings";
import { detectAnomali, hasThresholdCriteria } from "@/lib/anomaliGardu";

const BebanBarChart      = dynamic(() => import("./_components/BebanBarChart"),      { ssr: false });
const PenyulangDistChart = dynamic(() => import("./_components/PenyulangDistChart"), { ssr: false });
const YearlyStatsTable   = dynamic(() => import("./_components/YearlyStatsTable"),   { ssr: false });
const DistribusiBebanDonut = dynamic(() => import("./_components/DistribusiBebanDonut"), { ssr: false });

// ── Constants ─────────────────────────────────────────────────────────────────

const MONTHS = [
  "Januari", "Februari", "Maret", "April", "Mei", "Juni",
  "Juli", "Agustus", "September", "Oktober", "November", "Desember",
];

const TABS = [
  { key: "dashboard",      label: "Dashboard",            icon: LayoutDashboard },
  { key: "data-gardu",     label: "Data Gardu → pindah",  icon: Database },
  { key: "realisasi",      label: "Realisasi Pengukuran", icon: TableProperties },
  { key: "filter",         label: "Filter Pengukuran",    icon: SlidersHorizontal },
  { key: "penyeimbangan",  label: "Tindak Lanjut Anomali", icon: Scale },
  { key: "wo-pengukuran",  label: "WO Pengukuran",        icon: ClipboardList },
] as const;

type TabKey = typeof TABS[number]["key"];

const INPUT_CLASS =
  "border border-line rounded-lg px-3 py-1.5 text-sm text-ink focus:outline-none focus:border-navy-500 focus:ring-2 focus:ring-navy-500/15 bg-white";

const PAGE_SIZE = 20;

/** Penyulang yang digambar di kartu distribusi. Ada 32 penyulang di keempat ULP
 *  (23 di Ampenan saja) — semuanya sekaligus di kartu sepertiga baris membuat
 *  nama pada sumbu X saling menimpa. Datanya sudah terurut dari overload
 *  terbanyak, jadi yang dipotong adalah yang paling tidak mendesak. */
const PENYULANG_TAMPIL = 10;

function fmtTanggal(s: string): string {
  const [y, m, d] = s.split("-");
  return `${d}-${m}-${y}`;
}

// ── Sub-components ────────────────────────────────────────────────────────────

function BebanBadge({ pct }: { pct: number }) {
  const cfg =
    pct >= OVERLOAD_PCT   ? { cls: "bg-red-50 text-red-600",    bar: "bg-red-500" } :
    pct >= 60             ? { cls: "bg-amber-50 text-amber-600", bar: "bg-amber-500" } :
    pct >= UNDERLOAD_PCT  ? { cls: "bg-green-50 text-green-700", bar: "bg-green-500" } :
                            { cls: "bg-slate-100 text-ink-soft",       bar: "bg-ink-muted" };
  return (
    <div className="flex items-center gap-1.5">
      <div className="w-20 bg-surface rounded-full h-1.5">
        <div className={`h-1.5 rounded-full ${cfg.bar}`} style={{ width: `${Math.min(pct, 100)}%` }} />
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
    if (v > HIGH_CURRENT_A)           return "text-red-500 font-bold";
    if (iNom && v >= iNom)            return "text-red-600 font-semibold";
    if (iNom && v >= iNom * 0.9)      return "text-amber-600 font-semibold";
    return "text-ink-soft";
  };
  const hasHighAbs   = Math.max(r, s, t) > HIGH_CURRENT_A;
  const hasPhaseAlert = iNom ? Math.max(r, s, t) >= iNom * 0.9 : false;
  return (
    <div className="text-xs font-mono flex items-center justify-center gap-0.5">
      <span title="R" className={phaseCls(r)}>{Math.round(r)}</span>
      <span className="text-line">/</span>
      <span title="S" className={phaseCls(s)}>{Math.round(s)}</span>
      <span className="text-line">/</span>
      <span title="T" className={phaseCls(t)}>{Math.round(t)}</span>
      {hasHighAbs && <AlertTriangle size={10} className="ml-1 text-red-500 shrink-0" />}
      {!hasHighAbs && hasPhaseAlert && <AlertTriangle size={10} className="ml-1 text-amber-600 shrink-0" />}
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function PengukuranGarduPage() {
  const user = useCurrentUser();
  const [activeTab, setActiveTab] = useState<TabKey>("dashboard");
  const [page, setPage]           = useState(1);
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch]           = useState("");
  const [selectedRow, setSelectedRow] = useState<PengukuranGardu | null>(null);
  const [editRow, setEditRow]         = useState<PengukuranGardu | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [amgStatus, setAmgStatus]     = useState<Record<string, "sending" | "ok" | "error">>({});
  const [isBulkSending, setIsBulkSending] = useState(false);
  const [showTable, setShowTable]     = useState(false);

  useEffect(() => {
    const t = setTimeout(() => { setSearch(searchInput); setPage(1); }, 1000);
    return () => clearTimeout(t);
  }, [searchInput]);

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
    data, latestData, latestPengukuran, loading, error,
    filter, setFilter,
    overloadData, underloadData, highTempData, highCurrentItems, phaseOverloadItems,
    alertGarduIds, penyulangOptions, avgBeban, bebanChartData, penyulangChartData, bebanValues,
    refresh, patchRow, fetchAndPatchRow, deleteRow,
  } = usePengukuranGardu(user);

  // Reset tampilan tabel Realisasi saat filter berubah — paksa user klik "Tampilkan" ulang
  useEffect(() => {
    setShowTable(false);
  }, [filter.month, filter.year, filter.ulp, filter.penyulang]);

  type AlertModalKey = "overload" | "underload" | "highCurrent" | "phaseOverload" | "highTemp";
  const [alertModal, setAlertModal] = useState<AlertModalKey | null>(null);

  // ULP aktif untuk settings: non-UP3 pakai unit, UP3 pakai filter atau 'ALL'
  const activeUlp = canSeeAllUnits(user.role) ? (filter.ulp || "ALL") : (user.unit ?? "ALL");

  const {
    settings: anomalySettings,
    loading: settingsLoading,
    saving: settingsSaving,
    savedAt: settingsSavedAt,
    save: saveSettings,
    reset: resetSettings,
  } = useAnomalySettings(activeUlp);

  // activeCriteria: hanya true jika ada threshold aktif (bukan sekadar KVA range filter)
  // KVA-only tidak bisa menghasilkan anomali, jadi jangan tampilkan summary bar
  const activeCriteria = hasThresholdCriteria(anomalySettings);

  // Gardu yang match kriteria anomali dari settings
  const anomaliData = useMemo(
    () => latestData.filter((d) => detectAnomali(d, anomalySettings).isAnomali),
    [latestData, anomalySettings]
  );

  const { stats: yearlyStats, loading: yearlyLoading } = useYearlyStats(user, filter.year, filter.ulp, anomalySettings);

  const now   = new Date();
  const years = useMemo(() => Array.from({ length: 4 }, (_, i) => now.getFullYear() - 1 + i), []);  // eslint-disable-line react-hooks/exhaustive-deps

  const showUlpFilter = canSeeAllUnits(user.role);

  // Tabel Realisasi mendaftar catatan pengukuran saja. Hasil pemerataan tetap
  // di luar sini — ia tidak punya baris di `pengukuran_gardu`, jadi tidak bisa
  // disunting, dihapus, maupun dikirim ke AMG. Kondisinya tetap ikut seluruh
  // perhitungan beban lewat `latestData`.
  const filteredData = useMemo(() => {
    if (!search) return latestPengukuran;
    const q = search.toLowerCase();
    return latestPengukuran.filter(
      (d) =>
        d.no_gardu?.toLowerCase().includes(q) ||
        d.penyulang?.toLowerCase().includes(q) ||
        d.alamat?.toLowerCase().includes(q) ||
        d.petugas_nama?.toLowerCase().includes(q)
    );
  }, [latestPengukuran, search]);

  const paginatedData = useMemo(
    () => filteredData.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE),
    [filteredData, page]
  );
  const totalPages   = Math.ceil(filteredData.length / PAGE_SIZE);
  const pageIds      = useMemo(() => paginatedData.map((r) => r.id), [paginatedData]);
  const allPageSelected = pageIds.length > 0 && pageIds.every((id) => selectedIds.has(id));

  function toggleSelect(e: React.MouseEvent, id: string) {
    e.stopPropagation();
    setSelectedIds((prev) => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  }

  function toggleSelectAll(e: React.MouseEvent) {
    e.stopPropagation();
    setSelectedIds((prev) => {
      const n = new Set(prev);
      allPageSelected ? pageIds.forEach((id) => n.delete(id)) : pageIds.forEach((id) => n.add(id));
      return n;
    });
  }

  function clearSelection() { setSelectedIds(new Set()); setAmgStatus({}); }

  async function handleBulkAmg() {
    if (isBulkSending) return;
    const ids = Array.from(selectedIds);
    setIsBulkSending(true);
    setAmgStatus(Object.fromEntries(ids.map((id) => [id, "sending"])));
    try {
      const err = await antreKeAmg(ids);
      if (err) {
        setAmgStatus(Object.fromEntries(ids.map((id) => [id, "error"])));
        alert(err);
      } else {
        setAmgStatus(Object.fromEntries(ids.map((id) => [id, "ok"])));
        ids.forEach((id) => patchRow(id, { amg_queued_at: new Date().toISOString(), amg_sent_at: null, amg_error: null }));
      }
    } finally {
      setIsBulkSending(false);
    }
  }

  const periodLabel = filter.month === 0
    ? `Semua Bulan ${filter.year}`
    : `${MONTHS[filter.month - 1]} ${filter.year}`;

  return (
    <>
    <div className="space-y-4 text-ink">

      {/* ── Filter Bar — shared semua tab ───────────────────────────────────── */}
      {/* Blok header navy dihapus: judulnya sudah ada di topbar (`PageTitle`),
          cakupan ULP-nya sudah dinyatakan oleh penyaring di bilah ini, dan
          jumlah gardu + rata-ratanya sudah jadi kartu KPI pertama di tab
          Dashboard. Yang tersisa hanyalah ~90px tinggi yang tidak membawa
          satu pun keterangan baru. Dua angkanya dipindah ke ujung bilah ini
          supaya tetap terlihat dari tab mana pun. */}
      <div className="bg-white rounded-xl border border-line p-4 flex flex-wrap items-center gap-3">
        <span className="text-sm font-medium text-ink-soft">Periode:</span>
        <select
          value={filter.month}
          onChange={(e) => { setFilter((f) => ({ ...f, month: Number(e.target.value) })); setPage(1); }}
          className={INPUT_CLASS}
        >
          <option value={0}>Semua Bulan</option>
          {MONTHS.map((m, i) => <option key={i} value={i + 1}>{m}</option>)}
        </select>
        <select
          value={filter.year}
          onChange={(e) => { setFilter((f) => ({ ...f, year: Number(e.target.value) })); setPage(1); }}
          className={INPUT_CLASS}
        >
          {years.map((y) => <option key={y} value={y}>{y}</option>)}
        </select>
        {showUlpFilter ? (
          <select
            value={filter.ulp}
            onChange={(e) => { setFilter((f) => ({ ...f, ulp: e.target.value, penyulang: "" })); setPage(1); }}
            className={INPUT_CLASS}
          >
            <option value="">Semua ULP</option>
            {UNITS.map((u) => <option key={u.value} value={u.value}>{u.label}</option>)}
          </select>
        ) : (
          // Pengguna ULP tidak punya penyaring unit, jadi tanpa ini tidak ada
          // apa pun di layar yang menyebut data siapa yang sedang dilihat.
          <span className="h-9 flex items-center rounded-lg bg-surface border border-line px-3 text-sm font-medium text-ink-soft">
            ULP {user.unit}
          </span>
        )}
        <select
          value={filter.penyulang}
          onChange={(e) => { setFilter((f) => ({ ...f, penyulang: e.target.value })); setPage(1); }}
          className={INPUT_CLASS}
        >
          <option value="">Semua Penyulang</option>
          {penyulangOptions.map((p) => <option key={p} value={p}>{p}</option>)}
        </select>
        <div className="ml-auto flex items-center gap-3">
          <span className="text-sm text-ink-soft">
            <span className="font-bold text-ink">{latestData.length}</span> gardu
            {data.length > latestData.length && (
              <span className="text-ink-muted"> · {data.length} pengukuran</span>
            )}
          </span>
          <span className="text-sm text-ink-soft">
            Rata-rata{" "}
            <span className={`font-bold ${avgBeban >= OVERLOAD_PCT ? "text-red-600" : "text-ink"}`}>
              {avgBeban}%
            </span>
          </span>
          <button
            onClick={() => refresh()}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-line text-sm text-ink-soft hover:text-ink hover:bg-surface transition-colors"
          >
            <RefreshCw size={14} />
            Refresh
          </button>
        </div>
      </div>

      {/* ── Kriteria Anomali ────────────────────────────────────────────────── */}
      <AnomalySettingsPanel
        settings={anomalySettings}
        loading={settingsLoading}
        saving={settingsSaving}
        savedAt={settingsSavedAt}
        ulpLabel={activeUlp === "ALL" ? "Semua ULP" : `ULP ${activeUlp}`}
        onSave={saveSettings}
        onReset={resetSettings}
      />

      {/* ── Tab Switcher ────────────────────────────────────────────────────── */}
      <div className="flex gap-1 rounded-xl border border-line bg-white p-1 shadow-card">
        {TABS.map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            onClick={() => setActiveTab(key)}
            className={`flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
              activeTab === key
                ? "bg-navy-600 text-white shadow-sm"
                : "text-ink-soft hover:text-ink hover:bg-surface"
            }`}
          >
            <Icon size={15} className="shrink-0" />
            <span className="hidden sm:inline">{label}</span>
          </button>
        ))}
      </div>

      {/* ── Error ───────────────────────────────────────────────────────────── */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-red-600 text-sm">
          Gagal memuat data: {error}
        </div>
      )}

      {/* ════════════════════════════════════════════════════════════════════ */}
      {/* TAB: DASHBOARD                                                       */}
      {/* ════════════════════════════════════════════════════════════════════ */}
      {activeTab === "dashboard" && (
        <div className="space-y-4">

          {/* ── Compact KPI Tiles ─────────────────────────────────────────── */}
          <div className="grid grid-cols-3 lg:grid-cols-6 gap-2">
            {/* Total Gardu — tidak clickable */}
            <div className="bg-white border border-line rounded-xl px-4 py-3 flex flex-col justify-between">
              <p className="text-2xl font-bold text-ink leading-none">
                {loading ? "—" : latestData.length}
              </p>
              <div className="mt-1.5">
                <p className="text-xs text-ink-soft leading-tight">Total Gardu</p>
                <p className="text-[10px] text-ink-muted mt-0.5">rata-rata {loading ? "—" : avgBeban}%</p>
              </div>
            </div>

            {/* Alert tiles — clickable */}
            {[
              {
                key: "overload" as const,
                label: "Trafo Overload",
                sub: `beban ≥ ${OVERLOAD_PCT}%`,
                count: overloadData.length,
                variant: overloadData.length > 0 ? "danger" : "ok",
              },
              {
                key: "underload" as const,
                label: "Trafo Underload",
                sub: `beban < ${UNDERLOAD_PCT}%`,
                count: underloadData.length,
                variant: underloadData.length > 0 ? "warning" : "ok",
              },
              {
                key: "highCurrent" as const,
                label: `Jurusan >${HIGH_CURRENT_A}A`,
                sub: "arus jurusan tinggi",
                count: highCurrentItems.length,
                variant: highCurrentItems.length > 0 ? "danger" : "ok",
              },
              {
                key: "phaseOverload" as const,
                label: "Overload 1 Fasa",
                sub: "arus > I-nominal",
                count: phaseOverloadItems.length,
                variant: phaseOverloadItems.some(d => d.level === "overload") ? "danger"
                       : phaseOverloadItems.length > 0 ? "warning" : "ok",
              },
              {
                key: "highTemp" as const,
                label: `Suhu >${HIGH_TEMP_C}°C`,
                sub: "suhu trafo tinggi",
                count: highTempData.length,
                variant: highTempData.length > 0 ? "warning" : "ok",
              },
            ].map(({ key, label, sub, count, variant }) => {
              const style = variant === "danger"  ? { card: "border-red-200",   val: "text-red-600",   dot: "bg-red-500"   }
                          : variant === "warning" ? { card: "border-amber-200", val: "text-amber-600", dot: "bg-amber-500" }
                          :                        { card: "border-line",      val: "text-ink", dot: "bg-emerald-600" };
              return (
                <button
                  key={key}
                  onClick={() => setAlertModal(key)}
                  disabled={loading}
                  className={`bg-white border rounded-xl px-4 py-3 text-left hover:bg-surface transition-colors group disabled:cursor-default ${style.card}`}
                >
                  <div className="flex items-center justify-between mb-1.5">
                    <p className={`text-2xl font-bold leading-none ${style.val}`}>
                      {loading ? "—" : count}
                    </p>
                    <span className={`w-2 h-2 rounded-full ${style.dot} ${variant !== "ok" && count > 0 ? "animate-pulse" : ""}`} />
                  </div>
                  <p className="text-xs text-ink-soft leading-tight">{label}</p>
                  <p className="text-[10px] text-ink-muted mt-0.5">{sub}</p>
                </button>
              );
            })}
          </div>

          {/* ── Anomali Kriteria summary bar ──────────────────────────────── */}
          {activeCriteria && !loading && (
            <div className="flex items-center gap-3 bg-accent-tint border border-accent/25 rounded-xl px-5 py-3">
              <span className="text-sm font-semibold text-accent-deep">
                Anomali berdasarkan kriteria:
              </span>
              <span className="text-2xl font-bold text-accent-deep">{anomaliData.length}</span>
              <span className="text-xs text-ink-soft">gardu</span>
              <span className="mx-1 text-line">·</span>
              <span className="text-xs text-emerald-600 font-medium">
                {latestData.filter(d => !!d.jenis_pemeliharaan).length} sudah di-WO
              </span>
              <span className="text-xs text-ink-soft">·</span>
              <span className="text-xs text-red-600 font-medium">
                {anomaliData.filter(d => !d.jenis_pemeliharaan).length} belum di-WO
              </span>
              <button
                onClick={() => setActiveTab("penyeimbangan")}
                className="ml-auto text-xs px-3 py-1 rounded-lg border border-navy-300 text-navy-600 hover:bg-navy-50 transition-colors"
              >
                Tindak Lanjut →
              </button>
            </div>
          )}

          {/* ── Charts Row ────────────────────────────────────────────────── */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">

            {/* Bar chart top 10 beban */}
            <div className="bg-white rounded-xl border border-line overflow-hidden">
              <div className="px-5 py-3 border-b border-line">
                <h3 className="text-sm font-semibold text-ink">Top 10 — % Beban Trafo</h3>
                <p className="text-xs text-ink-soft mt-0.5">{periodLabel} · klik bar untuk detail</p>
              </div>
              <div className="p-4">
                {loading ? (
                  <div className="h-72 flex items-center justify-center">
                    <div className="w-6 h-6 border-4 border-line border-t-navy-600 rounded-full animate-spin" />
                  </div>
                ) : (
                  <BebanBarChart
                    data={bebanChartData}
                    onBarClick={(id) => {
                      const row = latestData.find(r => r.id === id);
                      if (row) setSelectedRow(row);
                    }}
                  />
                )}
              </div>
            </div>

            {/* Distribusi beban seluruh gardu */}
            <div className="bg-white rounded-xl border border-line overflow-hidden">
              <div className="px-5 py-3 border-b border-line">
                <h3 className="text-sm font-semibold text-ink">Distribusi Beban Trafo</h3>
                <p className="text-xs text-ink-soft mt-0.5">
                  {periodLabel} · batas 20% dan 80% sama dengan kartu di atas
                </p>
              </div>
              <div className="p-4 h-72">
                {loading ? (
                  <div className="h-full flex items-center justify-center">
                    <div className="w-6 h-6 border-4 border-line border-t-navy-600 rounded-full animate-spin" />
                  </div>
                ) : (
                  <DistribusiBebanDonut beban={bebanValues} />
                )}
              </div>
            </div>

            {/* Distribusi per penyulang */}
            <div className="bg-white rounded-xl border border-line overflow-hidden">
              <div className="px-5 py-3 border-b border-line">
                <h3 className="text-sm font-semibold text-ink">Top 10 Penyulang</h3>
                <p className="text-xs text-ink-soft mt-0.5">
                  Overload terbanyak
                  {penyulangChartData.length > PENYULANG_TAMPIL && ` · dari ${penyulangChartData.length} penyulang`}
                </p>
              </div>
              <div className="p-4 h-72">
                {loading ? (
                  <div className="h-full flex items-center justify-center">
                    <div className="w-6 h-6 border-4 border-line border-t-navy-600 rounded-full animate-spin" />
                  </div>
                ) : (
                  <PenyulangDistChart data={penyulangChartData} maks={PENYULANG_TAMPIL} />
                )}
              </div>
            </div>
          </div>

          {/* ── Rekap Tahunan ─────────────────────────────────────────────── */}
          <YearlyStatsTable
            stats={yearlyStats}
            loading={yearlyLoading}
            currentMonth={filter.month === 0 ? -1 : filter.month}
          />
        </div>
      )}

      {/* ════════════════════════════════════════════════════════════════════ */}
      {/* TAB: REALISASI PENGUKURAN                                           */}
      {/* ════════════════════════════════════════════════════════════════════ */}
      {activeTab === "realisasi" && (
        <div className="bg-white rounded-xl border border-line overflow-hidden">
          {/* Toolbar */}
          <div className="px-5 py-4 border-b border-line flex items-center gap-3">
            <div className="relative flex-1 max-w-72">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-soft" />
              <input
                type="text"
                placeholder="Cari no. gardu, penyulang, alamat..."
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                disabled={!showTable}
                className="border border-line rounded-lg pl-8 pr-3 py-1.5 text-sm w-full text-ink bg-white focus:outline-none focus:border-navy-500 focus:ring-2 focus:ring-navy-500/15 disabled:opacity-40 disabled:cursor-not-allowed"
              />
            </div>
            {showTable && (
              <p className="text-sm text-ink-soft">
                {loading ? "Memuat..." : `${filteredData.length} gardu`}
              </p>
            )}
            <div className="flex items-center gap-2 ml-auto">
              {showTable && (
                <button
                  onClick={() =>
                    downloadXlsx(
                      filteredData,
                      `Pengukuran_Gardu_${filter.month === 0 ? "Semua" : `${MONTHS[filter.month - 1]}_${filter.year}`}.xlsx`
                    )
                  }
                  disabled={filteredData.length === 0}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-navy-600 text-white text-sm hover:opacity-90 transition-opacity disabled:opacity-40"
                >
                  <Download size={14} />
                  Download XLSX
                </button>
              )}
              {!showTable && (
                <button
                  onClick={() => setShowTable(true)}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-navy-600 text-white text-sm font-semibold hover:opacity-90 transition-opacity"
                >
                  <TableProperties size={14} />
                  Tampilkan Data
                </button>
              )}
            </div>
          </div>

          {/* Empty state — belum ditampilkan */}
          {!showTable && (
            <div className="flex flex-col items-center gap-2 py-16 text-ink-muted">
              <TableProperties size={32} className="opacity-40" />
              <p className="text-sm">Data pengukuran belum ditampilkan.</p>
              <p className="text-xs text-ink-muted">Atur filter periode di atas, lalu klik <strong className="text-ink-soft">Tampilkan Data</strong>.</p>
            </div>
          )}

          {/* Table */}
          {showTable && <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-navy-50">
                  <th className="px-3 py-3 w-8" onClick={toggleSelectAll}>
                    <div className="flex items-center justify-center cursor-pointer text-accent-deep">
                      {allPageSelected ? <CheckSquare2 size={15} /> : <Square size={15} />}
                    </div>
                  </th>
                  <th className="text-left px-4 py-3 text-xs text-accent-deep font-semibold whitespace-nowrap">No. Gardu</th>
                  <th className="text-left px-4 py-3 text-xs text-accent-deep font-semibold">Penyulang</th>
                  <th className="text-left px-4 py-3 text-xs text-accent-deep font-semibold">Alamat</th>
                  <th className="text-center px-4 py-3 text-xs text-accent-deep font-semibold">KVA</th>
                  <th className="text-left px-4 py-3 text-xs text-accent-deep font-semibold min-w-32">% Beban</th>
                  <th className="text-center px-4 py-3 text-xs text-accent-deep font-semibold">Beban KVA</th>
                  <th className="text-center px-4 py-3 text-xs text-accent-deep font-semibold whitespace-nowrap">Arus R/S/T (A)</th>
                  <th className="text-center px-4 py-3 text-xs text-accent-deep font-semibold">Suhu (°C)</th>
                  <th className="text-left px-4 py-3 text-xs text-accent-deep font-semibold whitespace-nowrap">Tgl Ukur</th>
                  <th className="text-left px-4 py-3 text-xs text-accent-deep font-semibold">Petugas</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  Array.from({ length: 5 }).map((_, i) => (
                    <tr key={i}>
                      {Array.from({ length: 11 }).map((_, j) => (
                        <td key={j} className="px-4 py-3">
                          <div className="h-4 bg-line animate-pulse rounded" />
                        </td>
                      ))}
                    </tr>
                  ))
                ) : paginatedData.length === 0 ? (
                  <tr>
                    <td colSpan={11} className="text-center py-12 text-ink-soft text-sm">
                      Tidak ada data pengukuran untuk periode ini
                    </td>
                  </tr>
                ) : (
                  paginatedData.map((row, i) => {
                    const hasAlert  = alertGarduIds.has(row.id);
                    const isHighTemp = row.suhu_trafo > HIGH_TEMP_C;
                    return (
                      <tr
                        key={row.id}
                        onClick={() => setSelectedRow(row)}
                        className={`cursor-pointer hover:bg-navy-50 transition-colors ${i % 2 === 0 ? "bg-white" : "bg-white"} ${hasAlert ? "border-l-2 border-l-red-400" : ""} ${selectedIds.has(row.id) ? "bg-navy-50" : ""}`}
                      >
                        <td className="px-3 py-3 w-8" onClick={(e) => toggleSelect(e, row.id)}>
                          <div className="flex items-center justify-center cursor-pointer text-accent-deep">
                            {amgStatus[row.id] === "sending" ? <Loader2 size={14} className="animate-spin text-blue-700" /> :
                             amgStatus[row.id] === "ok"      ? <CheckCircle2 size={14} className="text-green-700" /> :
                             amgStatus[row.id] === "error"   ? <XCircle size={14} className="text-red-600" /> :
                             selectedIds.has(row.id)         ? <CheckSquare2 size={14} /> : <Square size={14} className="text-line" />}
                          </div>
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          <span className="font-semibold text-ink">{row.no_gardu}</span>
                          {hasAlert && <AlertTriangle size={12} className="inline ml-1 text-red-500" />}
                          {row.wo_sent_at && (
                            <span className="ml-1.5 text-[10px] bg-navy-50 text-navy-600 border border-navy-200 px-1.5 py-0.5 rounded-full font-semibold align-middle">WO</span>
                          )}
                          {row.amg_sent_at && (
                            <span className="ml-1 text-[10px] bg-sky-50 text-sky-700 border border-sky-200 px-1.5 py-0.5 rounded-full font-semibold align-middle">
                              AMG
                            </span>
                          )}
                          {!row.amg_sent_at && row.amg_queued_at && !row.amg_error && (
                            <span className="ml-1 text-[10px] bg-amber-50 text-amber-700 border border-amber-200 px-1.5 py-0.5 rounded-full font-semibold align-middle">
                              ANTRIAN
                            </span>
                          )}
                          {!row.amg_sent_at && row.amg_queued_at && row.amg_error && (
                            <span
                              title={row.amg_error}
                              className="ml-1 text-[10px] bg-red-50 text-red-700 border border-red-200 px-1.5 py-0.5 rounded-full font-semibold align-middle"
                            >
                              AMG GAGAL{(row.amg_attempts ?? 0) >= 3 ? " 3×" : ""}
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-ink-soft">{row.penyulang ?? "—"}</td>
                        <td className="px-4 py-3 text-ink-soft max-w-40 truncate">{row.alamat ?? "—"}</td>
                        <td className="px-4 py-3 text-center text-ink font-medium">{row.kva_trafo}</td>
                        <td className="px-4 py-3"><BebanBadge pct={row.persen_beban} /></td>
                        <td className="px-4 py-3 text-center text-ink-soft">{Math.round(row.beban_kva)}</td>
                        <td className="px-4 py-3 text-center">
                          <ArusCell r={row.total_arus_r} s={row.total_arus_s} t={row.total_arus_t} kva={row.kva_trafo} />
                        </td>
                        <td className={`px-4 py-3 text-center font-mono font-medium ${isHighTemp ? "text-amber-600" : "text-ink-soft"}`}>
                          {row.suhu_trafo}{isHighTemp && " 🌡"}
                        </td>
                        <td className="px-4 py-3 text-ink-soft whitespace-nowrap">{fmtTanggal(row.tanggal_pengukuran)}</td>
                        <td className="px-4 py-3 text-ink-soft truncate max-w-32">{row.petugas_nama ?? "—"}</td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>}

          {/* Pagination */}
          {showTable && totalPages > 1 && (
            <div className="px-5 py-3 border-t border-line flex items-center justify-between">
              <p className="text-xs text-ink-soft">Halaman {page} dari {totalPages} · {filteredData.length} gardu</p>
              <div className="flex items-center gap-2">
                <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1}
                  className="w-8 h-8 flex items-center justify-center rounded-lg border border-line text-ink-soft hover:bg-line disabled:opacity-40 transition-colors">
                  <ChevronLeft size={14} />
                </button>
                <button onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page === totalPages}
                  className="w-8 h-8 flex items-center justify-center rounded-lg border border-line text-ink-soft hover:bg-line disabled:opacity-40 transition-colors">
                  <ChevronRight size={14} />
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ════════════════════════════════════════════════════════════════════ */}
      {/* TAB: FILTER PENGUKURAN                                              */}
      {/* ════════════════════════════════════════════════════════════════════ */}
      {activeTab === "filter" && <FilterGarduTab user={user} />}

      {/* ════════════════════════════════════════════════════════════════════ */}
      {/* TAB: PENYEIMBANGAN BEBAN                                            */}
      {/* ════════════════════════════════════════════════════════════════════ */}
      {activeTab === "penyeimbangan" && (
        <PenyeimbanganTab
          latestData={latestData}
          anomaliData={anomaliData}
          settings={anomalySettings}
          hasActiveCriteria={activeCriteria}
          ulp={canSeeAllUnits(user.role) ? filter.ulp : (user.unit ?? "")}
          onPatchRow={patchRow}
        />
      )}

      {/* ════════════════════════════════════════════════════════════════════ */}
      {/* TAB: DATA GARDU                                                    */}
      {/* ════════════════════════════════════════════════════════════════════ */}
      {/* Tab ini sengaja disisakan sebagai penunjuk jalan, bukan dihapus
          begitu saja: orang yang sudah hafal Data Gardu ada di sini akan
          mencarinya beberapa minggu lagi. Bisa dibuang kalau sudah terbiasa. */}
      {activeTab === "data-gardu" && (
        <div className={`${CARD} p-10 flex flex-col items-center gap-3 text-center`}>
          <Database size={34} className="text-ink-muted" />
          <p className="text-ink font-semibold">Data Gardu pindah ke halaman sendiri</p>
          <p className="text-sm text-ink-soft max-w-md">
            Master gardu dipakai semua modul — pengukuran, inspeksi JTR, pemeliharaan
            gardu — jadi dia bukan lagi bagian dari halaman pengukuran. Impor master,
            tambah gardu, dan ekspornya semua pindah ke sana.
          </p>
          <Link href="/admin/master-gardu" className={BTN_PRIMARY}>
            Buka Master Gardu
          </Link>
        </div>
      )}

      {/* ════════════════════════════════════════════════════════════════════ */}
      {/* TAB: WO PENGUKURAN                                                  */}
      {/* ════════════════════════════════════════════════════════════════════ */}
      {activeTab === "wo-pengukuran" && (
        <WoPengukuranTab
          user={user}
          ulp={canSeeAllUnits(user.role) ? filter.ulp : (user.unit ?? "")}
        />
      )}

    </div>

    {/* ── Floating Bulk AMG Toolbar ──────────────────────────────────────── */}
    {selectedIds.size > 0 && (
      <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 bg-white border border-line rounded-2xl shadow-2xl px-5 py-3">
        {isBulkSending ? (
          <>
            <Loader2 size={16} className="animate-spin text-blue-700 shrink-0" />
            <span className="text-sm text-ink">Memasukkan ke antrean...</span>
          </>
        ) : Object.keys(amgStatus).length > 0 ? (
          <>
            <CheckCircle2 size={16} className="text-amber-600 shrink-0" />
            <span className="text-sm text-ink">
              <span className="text-amber-700 font-semibold">{Object.values(amgStatus).filter((s) => s === "ok").length} masuk antrean</span>
              {Object.values(amgStatus).filter((s) => s === "error").length > 0 && (
                <span className="text-red-600 font-semibold ml-2">{Object.values(amgStatus).filter((s) => s === "error").length} gagal</span>
              )}
              <span className="text-ink-soft ml-2">· agen lokal akan mengirim</span>
            </span>
            <button onClick={clearSelection} className="ml-2 p-1 rounded-lg hover:bg-line text-ink-soft"><X size={14} /></button>
          </>
        ) : (
          <>
            <span className="text-sm font-medium text-ink">{selectedIds.size} gardu dipilih</span>
            <button onClick={handleBulkAmg}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-navy-600 text-white text-xs font-semibold hover:opacity-90 transition-opacity">
              <Send size={13} /> Kirim ke AMG
            </button>
            <button onClick={clearSelection} className="p-1 rounded-lg hover:bg-line text-ink-soft"><X size={14} /></button>
          </>
        )}
      </div>
    )}

    <GarduDetailModal
      key={selectedRow?.id}
      row={selectedRow}
      onClose={() => setSelectedRow(null)}
      onEdit={setEditRow}
      allData={data}
      onPatchRow={patchRow}
      onDeleteRow={async (id) => { await deleteRow(id); if (selectedRow?.id === id) setSelectedRow(null); }}
    />
    <EditPengukuranModal
      row={editRow}
      onClose={() => setEditRow(null)}
      onSaved={(id) => { setEditRow(null); setSelectedRow(null); fetchAndPatchRow(id); }}
    />

    {/* ── Alert Detail Modals ─────────────────────────────────────────────── */}
    {alertModal === "overload" && (
      <AlertDetailModal title="Trafo Overload" count={overloadData.length}
        colorClass="text-red-600" borderClass="border-red-200" onClose={() => setAlertModal(null)}>
        <div className="divide-y divide-line">
          {overloadData.map((d) => (
            <button key={d.id} onClick={() => { setSelectedRow(d); setAlertModal(null); }}
              className="w-full px-5 py-3 flex items-center justify-between hover:bg-white transition-colors text-left">
              <div>
                <p className="text-sm font-semibold text-ink">{d.no_gardu}</p>
                <p className="text-xs text-ink-soft">{d.penyulang ?? "—"} · {d.kva_trafo} kVA · {fmtTanggal(d.tanggal_pengukuran)}</p>
              </div>
              <span className="text-xl font-bold text-red-600 shrink-0">{Math.round(d.persen_beban)}%</span>
            </button>
          ))}
        </div>
      </AlertDetailModal>
    )}

    {alertModal === "underload" && (
      <AlertDetailModal title="Trafo Underload" count={underloadData.length}
        colorClass="text-amber-600" borderClass="border-amber-200" onClose={() => setAlertModal(null)}>
        <div className="divide-y divide-line">
          {underloadData.map((d) => (
            <button key={d.id} onClick={() => { setSelectedRow(d); setAlertModal(null); }}
              className="w-full px-5 py-3 flex items-center justify-between hover:bg-white transition-colors text-left">
              <div>
                <p className="text-sm font-semibold text-ink">{d.no_gardu}</p>
                <p className="text-xs text-ink-soft">{d.penyulang ?? "—"} · {d.kva_trafo} kVA · {fmtTanggal(d.tanggal_pengukuran)}</p>
              </div>
              <span className="text-xl font-bold text-amber-600 shrink-0">{Math.round(d.persen_beban)}%</span>
            </button>
          ))}
        </div>
      </AlertDetailModal>
    )}

    {alertModal === "highCurrent" && (
      <AlertDetailModal title={`Jurusan Arus >${HIGH_CURRENT_A}A`} count={highCurrentItems.length}
        colorClass="text-red-600" borderClass="border-red-200" onClose={() => setAlertModal(null)}>
        <table className="w-full text-xs">
          <thead className="bg-red-50 sticky top-0">
            <tr>
              {["Gardu","Jurusan","R (A)","S (A)","T (A)"].map(h => (
                <th key={h} className="px-4 py-2.5 text-red-600 font-semibold text-left first:text-left text-center first:text-left">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {highCurrentItems.map((item, i) => (
              <tr key={i} className={i % 2 === 0 ? "bg-surface" : "bg-red-50/60"}>
                <td className="px-4 py-2.5 font-semibold text-ink">{item.no_gardu}</td>
                <td className="px-4 py-2.5 font-bold text-red-600 text-center">{item.jurusan}</td>
                {[item.arus_r, item.arus_s, item.arus_t].map((v, vi) => (
                  <td key={vi} className={`px-4 py-2.5 text-center font-mono ${v > HIGH_CURRENT_A ? "text-red-600 font-bold" : "text-ink-soft"}`}>
                    {Math.round(v)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </AlertDetailModal>
    )}

    {alertModal === "phaseOverload" && (
      <AlertDetailModal title="Overload 1 Fasa" count={phaseOverloadItems.length}
        colorClass="text-amber-600" borderClass="border-amber-200" onClose={() => setAlertModal(null)}>
        <table className="w-full text-xs">
          <thead className="bg-amber-50 sticky top-0">
            <tr>
              {["Gardu","KVA","I-Nom","R","S","T","% Nom","Status"].map(h => (
                <th key={h} className="px-3 py-2.5 text-amber-600 font-semibold text-center first:text-left">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {phaseOverloadItems.map((item, i) => {
              const iNom = item.i_nominal;
              const cls  = (v: number) => v >= iNom ? "text-red-600 font-bold" : v >= iNom * 0.9 ? "text-amber-600 font-bold" : "text-ink-soft";
              return (
                <tr key={item.id} className={i % 2 === 0 ? "bg-surface" : "bg-amber-50/60"}>
                  <td className="px-3 py-2.5 font-semibold text-ink">{item.no_gardu}</td>
                  <td className="px-3 py-2.5 text-center text-ink-soft">{item.kva_trafo}</td>
                  <td className="px-3 py-2.5 text-center text-ink-soft">{Math.round(iNom)}</td>
                  <td className={`px-3 py-2.5 text-center font-mono ${cls(item.arus_r)}`}>{Math.round(item.arus_r)}</td>
                  <td className={`px-3 py-2.5 text-center font-mono ${cls(item.arus_s)}`}>{Math.round(item.arus_s)}</td>
                  <td className={`px-3 py-2.5 text-center font-mono ${cls(item.arus_t)}`}>{Math.round(item.arus_t)}</td>
                  <td className={`px-3 py-2.5 text-center font-mono font-semibold ${item.level === "overload" ? "text-red-600" : "text-amber-600"}`}>
                    {Math.round(item.pct_nominal)}%
                  </td>
                  <td className="px-3 py-2.5 text-center">
                    <span className={`px-2 py-0.5 rounded-full font-semibold ${item.level === "overload" ? "bg-red-50 text-red-600" : "bg-amber-50 text-amber-600"}`}>
                      {item.level === "overload" ? "Overload" : "Warning"}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </AlertDetailModal>
    )}

    {alertModal === "highTemp" && (
      <AlertDetailModal title={`Suhu Trafo >${HIGH_TEMP_C}°C`} count={highTempData.length}
        colorClass="text-amber-600" borderClass="border-amber-200" onClose={() => setAlertModal(null)}>
        <div className="divide-y divide-line">
          {highTempData.map((d) => (
            <button key={d.id} onClick={() => { setSelectedRow(d); setAlertModal(null); }}
              className="w-full px-5 py-3 flex items-center justify-between hover:bg-white transition-colors text-left">
              <div>
                <p className="text-sm font-semibold text-ink">{d.no_gardu}</p>
                <p className="text-xs text-ink-soft">{d.penyulang ?? "—"} · Beban {Math.round(d.persen_beban)}% · {fmtTanggal(d.tanggal_pengukuran)}</p>
              </div>
              <span className="text-xl font-bold text-amber-600 shrink-0">{d.suhu_trafo}°C</span>
            </button>
          ))}
        </div>
      </AlertDetailModal>
    )}
    </>
  );
}
