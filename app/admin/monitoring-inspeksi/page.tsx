"use client";

import dynamic from "next/dynamic";
import { useState, useMemo } from "react";
import { useCurrentUser } from "@/app/admin/_context/UserContext";
import { canSeeAllUnits, UNITS, CATEGORY_CONFIG, type InspeksiCategory } from "@/lib/roles";
import { BTN_GHOST, CARD, DISPLAY, FIELD } from "@/app/admin/_ui";
import InspeksiKPI from "./_components/InspeksiKPI";
import InspeksiJaringanTab from "./_components/InspeksiJaringanTab";
import InspeksiPohonTab from "./_components/InspeksiPohonTab";
import InspeksiDashboardTab from "./_components/InspeksiDashboardTab";
import { useInspeksiJaringan } from "./_hooks/useInspeksiJaringan";
import { useInspeksiPohon } from "./_hooks/useInspeksiPohon";
import { Zap, TreePine, Map, Layers, LayoutDashboard } from "lucide-react";

// Map hanya di-render saat tab peta aktif, dengan dynamic import SSR: false
const InspeksiMap = dynamic(() => import("./_components/InspeksiMap"), {
  ssr: false,
  loading: () => (
    <div className="bg-white rounded-xl border border-line flex items-center justify-center h-[75vh] min-h-[520px]">
      <div className="flex flex-col items-center gap-3 text-ink-soft">
        <div className="w-8 h-8 border-4 border-line border-t-navy-600 rounded-full animate-spin" />
        <p className="text-sm">Memuat peta...</p>
      </div>
    </div>
  ),
});

// ── Tab Definition ────────────────────────────────────────────────────────────

const TABS = [
  { id: "dashboard", label: "Dashboard", icon: LayoutDashboard },
  { id: "jaringan", label: "Inspeksi Jaringan", icon: Zap },
  { id: "pohon", label: "Inspeksi Pohon", icon: TreePine },
  { id: "peta", label: "Peta", icon: Map },
] as const;

type TabId = (typeof TABS)[number]["id"];

const STATUS_LIST = ["Temuan", "Perlu Tindakan", "Ditugaskan", "Dalam Proses", "Selesai"] as const;

const STATUS_COLOR: Record<string, string> = {
  Temuan: "#ef4444",
  "Perlu Tindakan": "#f97316",
  Ditugaskan: "#3b82f6",
  "Dalam Proses": "#eab308",
  Selesai: "#22c55e",
};

// ── Page ─────────────────────────────────────────────────────────────────────

export default function MonitoringInspeksiPage() {
  const user = useCurrentUser();
  const [activeTab, setActiveTab] = useState<TabId>("dashboard");
  const [showPohonOnMap, setShowPohonOnMap] = useState(true);
  const [showJaringanOnMap, setShowJaringanOnMap] = useState(true);
  const [filterUlp, setFilterUlp] = useState("");
  // Filter khusus tab Peta (independen dari tab lain)
  const [filterMapUlp, setFilterMapUlp] = useState("");
  const [filterMapPenyulang, setFilterMapPenyulang] = useState("");
  const [filterMapCategory, setFilterMapCategory] = useState("");
  const [showStatuses, setShowStatuses] = useState<Record<string, boolean>>({
    Temuan: true,
    "Perlu Tindakan": true,
    Ditugaskan: true,
    "Dalam Proses": true,
    Selesai: true,
  });

  // Hooks shared dengan Map tab — fetch sekali, dipakai di tab peta
  const jaringanHook = useInspeksiJaringan(user);
  const pohonHook = useInspeksiPohon(user);

  // Badge jaringan urgent — kategori Emergency/Urgent, belum selesai, ikut filterUlp
  const jaringanUrgentCount = useMemo(
    () => jaringanHook.rawData.filter(
      (d) => (d.category === "Emergency" || d.category === "Urgent") &&
             d.status !== "Selesai" &&
             (!filterUlp || d.ulp === filterUlp)
    ).length,
    [jaringanHook.rawData, filterUlp]
  );

  // Badge pohon urgent — ikut filterUlp global
  const pohonUrgentCount = useMemo(
    () => pohonHook.rawData.filter(
      (d) => d.tingkat_risiko === "Sangat Tinggi" &&
             d.status !== "Selesai" &&
             (!filterUlp || d.ulp === filterUlp)
    ).length,
    [pohonHook.rawData, filterUlp]
  );

  // Penyulang unik untuk filter peta (gabungan jaringan + pohon)
  const mapPenyulangOptions = useMemo(() => {
    const all = [
      ...jaringanHook.rawData.map((d) => d.penyulang),
      ...pohonHook.rawData.map((d) => d.penyulang),
    ];
    return [...new Set(all.filter(Boolean))].sort() as string[];
  }, [jaringanHook.rawData, pohonHook.rawData]);

  // Data berkoordinat untuk peta — filter ULP (tab lain) + filter map independen
  const jaringanMapData = useMemo(
    () => jaringanHook.rawData.filter((d) =>
      d.koordinat &&
      (!filterUlp || d.ulp === filterUlp) &&
      (!filterMapUlp || d.ulp === filterMapUlp) &&
      (!filterMapPenyulang || d.penyulang === filterMapPenyulang) &&
      (!filterMapCategory || d.category === filterMapCategory)
    ),
    [jaringanHook.rawData, filterUlp, filterMapUlp, filterMapPenyulang, filterMapCategory]
  );
  const pohonMapData = useMemo(
    () => pohonHook.rawData.filter((d) =>
      d.koordinat &&
      (!filterUlp || d.ulp === filterUlp) &&
      (!filterMapUlp || d.ulp === filterMapUlp) &&
      (!filterMapPenyulang || d.penyulang === filterMapPenyulang) &&
      (!filterMapCategory || d.category === filterMapCategory)
    ),
    [pohonHook.rawData, filterUlp, filterMapUlp, filterMapPenyulang, filterMapCategory]
  );

  const activeStatuses = useMemo(
    () => STATUS_LIST.filter((s) => showStatuses[s]),
    [showStatuses]
  );

  const unitLabel = user.unit ?? "Semua Unit";

  return (
    <div className="space-y-6 text-ink">
      {/* Header */}
      <header className="rounded-2xl bg-navy-600 px-6 py-5 text-white shadow-card">
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
          <div>
            <h1 className={`${DISPLAY} text-2xl font-extrabold`}>Monitoring Inspeksi</h1>
            <p className="text-white/60 text-sm mt-0.5">
              {canSeeAllUnits(user.role)
                ? "Semua ULP — PLN UP3 Mataram"
                : `ULP ${unitLabel} · ${user.role}`}
            </p>
          </div>
          <div className="flex items-center gap-2 text-xs">
            {[
              { n: jaringanHook.rawData.length, l: "Jaringan" },
              { n: pohonHook.rawData.length, l: "Pohon" },
              { n: jaringanMapData.length + pohonMapData.length, l: "Di Peta" },
            ].map(({ n, l }) => (
              <div key={l} className="rounded-xl bg-white/12 px-3 py-2 text-center">
                <p className={`${DISPLAY} text-lg font-bold leading-none`}>{n}</p>
                <p className="text-white/60 mt-0.5">{l}</p>
              </div>
            ))}
          </div>
        </div>
      </header>

      {/* KPI Cards */}
      <InspeksiKPI user={user} filterUlp={filterUlp} />

      {/* Satu baris kendali: filter unit + pindah tab */}
      <div className={`${CARD} p-3 flex flex-wrap items-center gap-2`}>
        {canSeeAllUnits(user.role) && (
          <select
            value={filterUlp}
            onChange={(e) => setFilterUlp(e.target.value)}
            aria-label="Filter unit layanan"
            className={FIELD}
          >
            <option value="">Semua ULP</option>
            {UNITS.map((u) => (
              <option key={u.value} value={u.value}>{u.label}</option>
            ))}
          </select>
        )}

        <div className="ml-auto flex flex-wrap gap-1 rounded-xl bg-surface p-1">
          {TABS.map(({ id, label, icon: Icon }) => {
            const urgent =
              id === "jaringan" ? jaringanUrgentCount : id === "pohon" ? pohonUrgentCount : 0;
            return (
              <button
                key={id}
                onClick={() => setActiveTab(id)}
                className={`flex items-center gap-2 h-9 px-3.5 rounded-lg text-sm font-semibold transition-colors ${
                  activeTab === id
                    ? "bg-white text-navy-600 shadow-sm"
                    : "text-ink-soft hover:text-ink"
                }`}
              >
                <Icon size={15} />
                {label}
                {urgent > 0 && (
                  <span className="rounded-full bg-red-50 px-1.5 py-0.5 text-[10px] font-bold tabular-nums text-red-700">
                    {urgent}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Tab Content */}
      <div className={`${CARD} overflow-hidden`}>
        <div className="p-5">
          {activeTab === "jaringan" && (
            <InspeksiJaringanTab user={user} filterUlp={filterUlp} />
          )}

          {activeTab === "pohon" && (
            <InspeksiPohonTab user={user} filterUlp={filterUlp} />
          )}

          {activeTab === "dashboard" && (
            <InspeksiDashboardTab
              user={user}
              jaringanData={jaringanHook.rawData}
              pohonData={pohonHook.rawData}
            />
          )}

          {activeTab === "peta" && (
            <div className="space-y-3">
              {/* Filter baris atas: ULP + Penyulang + Kategori */}
              <div className="flex flex-wrap gap-2">
                {canSeeAllUnits(user.role) && (
                  <select
                    value={filterMapUlp}
                    onChange={(e) => { setFilterMapUlp(e.target.value); setFilterMapPenyulang(""); }}
                    className={FIELD}
                  >
                    <option value="">Semua ULP</option>
                    {UNITS.map((u) => (
                      <option key={u.value} value={u.value}>{u.label}</option>
                    ))}
                  </select>
                )}
                <select
                  value={filterMapPenyulang}
                  onChange={(e) => setFilterMapPenyulang(e.target.value)}
                  className={FIELD}
                >
                  <option value="">Semua Penyulang</option>
                  {mapPenyulangOptions.map((p) => (
                    <option key={p} value={p}>{p}</option>
                  ))}
                </select>
                <select
                  value={filterMapCategory}
                  onChange={(e) => setFilterMapCategory(e.target.value)}
                  className={FIELD}
                >
                  <option value="">Semua Kategori</option>
                  {(Object.keys(CATEGORY_CONFIG) as InspeksiCategory[]).map((c) => (
                    <option key={c} value={c}>{CATEGORY_CONFIG[c].label}</option>
                  ))}
                </select>
                {(filterMapUlp || filterMapPenyulang || filterMapCategory) && (
                  <button
                    onClick={() => { setFilterMapUlp(""); setFilterMapPenyulang(""); setFilterMapCategory(""); }}
                    className={BTN_GHOST}
                  >
                    Reset filter
                  </button>
                )}
              </div>

              {/* Layer toggles */}
              <div className="flex items-center gap-4 flex-wrap">
                <span className="text-sm font-medium text-ink flex items-center gap-1.5 shrink-0">
                  <Layers size={14} />
                  Tampilkan:
                </span>
                <label className="flex items-center gap-2 cursor-pointer text-sm text-ink">
                  <input
                    type="checkbox"
                    checked={showJaringanOnMap}
                    onChange={(e) => setShowJaringanOnMap(e.target.checked)}
                    className="accent-navy-600"
                  />
                  ⚡ Jaringan ({jaringanMapData.length})
                </label>
                <label className="flex items-center gap-2 cursor-pointer text-sm text-ink">
                  <input
                    type="checkbox"
                    checked={showPohonOnMap}
                    onChange={(e) => setShowPohonOnMap(e.target.checked)}
                    className="accent-navy-600"
                  />
                  🌳 Pohon ({pohonMapData.length})
                </label>
              </div>

              {/* Status filter */}
              <div className="flex items-center gap-3 flex-wrap">
                <span className="text-sm font-medium text-ink shrink-0">Status:</span>
                {STATUS_LIST.map((status) => (
                  <label key={status} className="flex items-center gap-1.5 cursor-pointer text-sm text-ink">
                    <input
                      type="checkbox"
                      checked={showStatuses[status]}
                      onChange={(e) =>
                        setShowStatuses((prev) => ({ ...prev, [status]: e.target.checked }))
                      }
                      className="accent-navy-600"
                    />
                    <span
                      className="w-2 h-2 rounded-full shrink-0"
                      style={{ background: STATUS_COLOR[status] }}
                    />
                    {status}
                  </label>
                ))}
              </div>

              <InspeksiMap
                jaringanData={jaringanMapData}
                pohonData={pohonMapData}
                showJaringan={showJaringanOnMap}
                showPohon={showPohonOnMap}
                activeStatuses={activeStatuses}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
