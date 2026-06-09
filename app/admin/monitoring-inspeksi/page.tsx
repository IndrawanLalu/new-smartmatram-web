"use client";

import dynamic from "next/dynamic";
import { useState, useMemo } from "react";
import { useCurrentUser } from "@/app/admin/_context/UserContext";
import { canSeeAllUnits, UNITS, CATEGORY_CONFIG, type InspeksiCategory } from "@/lib/roles";
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
    <div className="bg-[#162334] rounded-xl border border-[#1e3552] flex items-center justify-center h-[75vh] min-h-[520px]">
      <div className="flex flex-col items-center gap-3 text-[#94a3b8]">
        <div className="w-8 h-8 border-4 border-[#1e3552] border-t-[#00897B] rounded-full animate-spin" />
        <p className="text-sm">Memuat peta...</p>
      </div>
    </div>
  ),
});

// ── Tab Definition ────────────────────────────────────────────────────────────

const TABS = [
  { id: "jaringan", label: "Inspeksi Jaringan", icon: Zap },
  { id: "pohon", label: "Inspeksi Pohon", icon: TreePine },
  { id: "peta", label: "Peta", icon: Map },
  { id: "dashboard", label: "Dashboard", icon: LayoutDashboard },
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
  const [activeTab, setActiveTab] = useState<TabId>("jaringan");
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
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-linear-to-r from-[#004D40] to-[#00897B] text-white rounded-xl p-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold">Monitoring Inspeksi</h1>
            <p className="text-teal-100 text-sm mt-1">
              {canSeeAllUnits(user.role)
                ? "Semua ULP — PLN UP3 Mataram"
                : `ULP ${unitLabel} · ${user.role}`}
            </p>
          </div>
          <div className="flex items-center gap-3 text-sm text-teal-100">
            <div className="bg-white/10 rounded-lg px-3 py-1.5">
              <span className="font-semibold text-white">{jaringanHook.rawData.length}</span> Jaringan
            </div>
            <div className="bg-white/10 rounded-lg px-3 py-1.5">
              <span className="font-semibold text-white">{pohonHook.rawData.length}</span> Pohon
            </div>
            <div className="bg-white/10 rounded-lg px-3 py-1.5">
              <span className="font-semibold text-white">{jaringanMapData.length + pohonMapData.length}</span> Di Peta
            </div>
          </div>
        </div>
      </div>

      {/* KPI Cards */}
      <InspeksiKPI user={user} filterUlp={filterUlp} />

      {/* Filter ULP global (UP3 only) */}
      {canSeeAllUnits(user.role) && (
        <div className="flex items-center gap-3">
          <span className="text-sm text-[#94a3b8] shrink-0">Filter ULP:</span>
          <select
            value={filterUlp}
            onChange={(e) => setFilterUlp(e.target.value)}
            className="border border-[#1e3552] rounded-lg px-3 py-1.5 text-sm text-[#e2e8f0] bg-[#162334] focus:outline-none focus:border-[#00897B] focus:ring-2 focus:ring-[#00897B]/20"
          >
            <option value="">Semua ULP</option>
            {UNITS.map((u) => (
              <option key={u.value} value={u.value}>{u.label}</option>
            ))}
          </select>
        </div>
      )}

      {/* Tab Navigation */}
      <div className="bg-[#162334] rounded-xl border border-[#1e3552] overflow-hidden">
        {/* Tab bar */}
        <div className="flex border-b border-[#1e3552]">
          {TABS.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => setActiveTab(id)}
              className={`flex items-center gap-2 px-5 py-3.5 text-sm font-medium transition-colors border-b-2 -mb-px ${
                activeTab === id
                  ? "border-[#00897B] text-[#00897B]"
                  : "border-transparent text-[#94a3b8] hover:text-[#e2e8f0] hover:bg-gray-50"
              }`}
            >
              <Icon size={15} />
              {label}
              {id === "jaringan" && jaringanUrgentCount > 0 && (
                <span className="ml-1 bg-red-100 text-red-700 text-xs font-semibold px-1.5 py-0.5 rounded-full">
                  {jaringanUrgentCount} urgent
                </span>
              )}
              {id === "pohon" && pohonUrgentCount > 0 && (
                <span className="ml-1 bg-red-100 text-red-700 text-xs font-semibold px-1.5 py-0.5 rounded-full">
                  {pohonUrgentCount} urgent
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Tab Content */}
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
                    className="border border-[#1e3552] rounded-lg px-3 py-1.5 text-sm text-[#e2e8f0] bg-[#162334] focus:outline-none focus:border-[#00897B] focus:ring-2 focus:ring-[#00897B]/20"
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
                  className="border border-[#1e3552] rounded-lg px-3 py-1.5 text-sm text-[#e2e8f0] bg-[#162334] focus:outline-none focus:border-[#00897B] focus:ring-2 focus:ring-[#00897B]/20"
                >
                  <option value="">Semua Penyulang</option>
                  {mapPenyulangOptions.map((p) => (
                    <option key={p} value={p}>{p}</option>
                  ))}
                </select>
                <select
                  value={filterMapCategory}
                  onChange={(e) => setFilterMapCategory(e.target.value)}
                  className="border border-[#1e3552] rounded-lg px-3 py-1.5 text-sm text-[#e2e8f0] bg-[#162334] focus:outline-none focus:border-[#00897B] focus:ring-2 focus:ring-[#00897B]/20"
                >
                  <option value="">Semua Kategori</option>
                  {(Object.keys(CATEGORY_CONFIG) as InspeksiCategory[]).map((c) => (
                    <option key={c} value={c}>{CATEGORY_CONFIG[c].label}</option>
                  ))}
                </select>
                {(filterMapUlp || filterMapPenyulang || filterMapCategory) && (
                  <button
                    onClick={() => { setFilterMapUlp(""); setFilterMapPenyulang(""); setFilterMapCategory(""); }}
                    className="px-3 py-1.5 text-sm text-[#94a3b8] hover:text-[#e2e8f0] border border-[#1e3552] rounded-lg transition-colors"
                  >
                    Reset filter
                  </button>
                )}
              </div>

              {/* Layer toggles */}
              <div className="flex items-center gap-4 flex-wrap">
                <span className="text-sm font-medium text-[#e2e8f0] flex items-center gap-1.5 shrink-0">
                  <Layers size={14} />
                  Tampilkan:
                </span>
                <label className="flex items-center gap-2 cursor-pointer text-sm text-[#e2e8f0]">
                  <input
                    type="checkbox"
                    checked={showJaringanOnMap}
                    onChange={(e) => setShowJaringanOnMap(e.target.checked)}
                    className="accent-[#00897B]"
                  />
                  ⚡ Jaringan ({jaringanMapData.length})
                </label>
                <label className="flex items-center gap-2 cursor-pointer text-sm text-[#e2e8f0]">
                  <input
                    type="checkbox"
                    checked={showPohonOnMap}
                    onChange={(e) => setShowPohonOnMap(e.target.checked)}
                    className="accent-[#00897B]"
                  />
                  🌳 Pohon ({pohonMapData.length})
                </label>
              </div>

              {/* Status filter */}
              <div className="flex items-center gap-3 flex-wrap">
                <span className="text-sm font-medium text-[#e2e8f0] shrink-0">Status:</span>
                {STATUS_LIST.map((status) => (
                  <label key={status} className="flex items-center gap-1.5 cursor-pointer text-sm text-[#e2e8f0]">
                    <input
                      type="checkbox"
                      checked={showStatuses[status]}
                      onChange={(e) =>
                        setShowStatuses((prev) => ({ ...prev, [status]: e.target.checked }))
                      }
                      className="accent-[#00897B]"
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
