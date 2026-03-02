"use client";

import dynamic from "next/dynamic";
import { useState, useMemo } from "react";
import { useCurrentUser } from "@/app/admin/_context/UserContext";
import { canSeeAllUnits } from "@/lib/roles";
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
    <div className="bg-white rounded-xl border border-[#E2E8F0] flex items-center justify-center h-[520px]">
      <div className="flex flex-col items-center gap-3 text-[#5D6D7E]">
        <div className="w-8 h-8 border-4 border-[#E2E8F0] border-t-[#00897B] rounded-full animate-spin" />
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

// ── Page ─────────────────────────────────────────────────────────────────────

export default function MonitoringInspeksiPage() {
  const user = useCurrentUser();
  const [activeTab, setActiveTab] = useState<TabId>("jaringan");
  const [showPohonOnMap, setShowPohonOnMap] = useState(true);
  const [showJaringanOnMap, setShowJaringanOnMap] = useState(true);

  // Hooks shared dengan Map tab — fetch sekali, dipakai di tab peta
  const jaringanHook = useInspeksiJaringan(user);
  const pohonHook = useInspeksiPohon(user);

  // Data berkoordinat untuk peta
  const jaringanMapData = useMemo(
    () => jaringanHook.rawData.filter((d) => d.koordinat),
    [jaringanHook.rawData]
  );
  const pohonMapData = useMemo(
    () => pohonHook.rawData.filter((d) => d.koordinat),
    [pohonHook.rawData]
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
      <InspeksiKPI user={user} />

      {/* Tab Navigation */}
      <div className="bg-white rounded-xl border border-[#E2E8F0] overflow-hidden">
        {/* Tab bar */}
        <div className="flex border-b border-[#E2E8F0]">
          {TABS.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => setActiveTab(id)}
              className={`flex items-center gap-2 px-5 py-3.5 text-sm font-medium transition-colors border-b-2 -mb-px ${
                activeTab === id
                  ? "border-[#00897B] text-[#00897B]"
                  : "border-transparent text-[#5D6D7E] hover:text-[#1B2631] hover:bg-gray-50"
              }`}
            >
              <Icon size={15} />
              {label}
              {id === "jaringan" && jaringanHook.rawData.length > 0 && (
                <span className="ml-1 bg-[#E0F2F1] text-[#00695C] text-xs font-semibold px-1.5 py-0.5 rounded-full">
                  {jaringanHook.rawData.length}
                </span>
              )}
              {id === "pohon" && pohonHook.sanggatUrgentCount > 0 && (
                <span className="ml-1 bg-red-100 text-red-700 text-xs font-semibold px-1.5 py-0.5 rounded-full">
                  {pohonHook.sanggatUrgentCount} urgent
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Tab Content */}
        <div className="p-5">
          {activeTab === "jaringan" && (
            <InspeksiJaringanTab user={user} />
          )}

          {activeTab === "pohon" && (
            <InspeksiPohonTab user={user} />
          )}

          {activeTab === "dashboard" && (
            <InspeksiDashboardTab
              user={user}
              jaringanData={jaringanHook.rawData}
              pohonData={pohonHook.rawData}
            />
          )}

          {activeTab === "peta" && (
            <div className="space-y-4">
              {/* Layer toggles */}
              <div className="flex items-center gap-4">
                <span className="text-sm font-medium text-[#1B2631] flex items-center gap-1.5">
                  <Layers size={14} />
                  Tampilkan:
                </span>
                <label className="flex items-center gap-2 cursor-pointer text-sm text-[#1B2631]">
                  <input
                    type="checkbox"
                    checked={showJaringanOnMap}
                    onChange={(e) => setShowJaringanOnMap(e.target.checked)}
                    className="accent-[#00897B]"
                  />
                  ⚡ Jaringan ({jaringanMapData.length})
                </label>
                <label className="flex items-center gap-2 cursor-pointer text-sm text-[#1B2631]">
                  <input
                    type="checkbox"
                    checked={showPohonOnMap}
                    onChange={(e) => setShowPohonOnMap(e.target.checked)}
                    className="accent-[#00897B]"
                  />
                  🌳 Pohon ({pohonMapData.length})
                </label>

                {/* Legend */}
                <div className="ml-auto flex items-center gap-3 text-xs text-[#5D6D7E]">
                  {[
                    { color: "bg-red-500", label: "Urgent / Temuan" },
                    { color: "bg-blue-500", label: "Ditugaskan" },
                    { color: "bg-yellow-400", label: "Dalam Proses" },
                    { color: "bg-green-500", label: "Selesai" },
                  ].map(({ color, label }) => (
                    <span key={label} className="flex items-center gap-1">
                      <span className={`w-2.5 h-2.5 rounded-full ${color}`} />
                      {label}
                    </span>
                  ))}
                </div>
              </div>

              <InspeksiMap
                jaringanData={jaringanMapData}
                pohonData={pohonMapData}
                showJaringan={showJaringanOnMap}
                showPohon={showPohonOnMap}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
