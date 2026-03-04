"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import { Map, CheckSquare, Square } from "lucide-react";
import type { GarduMarker } from "../_hooks/useCommandCenter";
import type { PengukuranGardu } from "@/app/admin/pengukuran-gardu/_hooks/usePengukuranGardu";

const MapInner = dynamic(() => import("./_MapInner"), {
  ssr: false,
  loading: () => (
    <div className="flex-1 flex items-center justify-center bg-[#0d1b2a] rounded-b-xl">
      <div className="text-center">
        <div className="w-8 h-8 border-4 border-gray-700 border-t-[#00897B] rounded-full animate-spin mx-auto mb-2" />
        <p className="text-xs text-gray-500">Memuat peta...</p>
      </div>
    </div>
  ),
});

interface Props {
  garduList: GarduMarker[];
  latestData: PengukuranGardu[];
}

export default function GarduMapPanel({ garduList, latestData }: Props) {
  const [showAll, setShowAll] = useState(false);

  const alertCount = latestData.filter(
    (d) => d.persen_beban >= 60 || d.suhu_trafo > 60
  ).length;

  return (
    <div className="flex flex-col h-full bg-[#0d1b2a] rounded-xl border border-gray-800 overflow-hidden">
      {/* Header */}
      <div className="px-3 py-2 shrink-0 flex items-center gap-2 border-b border-gray-800">
        <Map size={13} className="text-[#00897B]" />
        <span className="text-gray-300 text-xs font-bold tracking-wider uppercase">Peta Gardu</span>
        {!showAll && alertCount > 0 && (
          <span className="animate-pulse font-mono text-[10px] bg-red-500/20 text-red-400 px-1.5 py-0.5 rounded">
            {alertCount} alert
          </span>
        )}

        <div className="ml-auto flex items-center gap-3">
          {showAll && (
            <div className="flex items-center gap-2.5">
              <LegendDot color="#EF4444" label="Overload" />
              <LegendDot color="#F59E0B" label="Warning" />
              <LegendDot color="#10B981" label="Normal" />
              <LegendDot color="#4B5563" label="No data" />
            </div>
          )}
          <button
            onClick={() => setShowAll((v) => !v)}
            className="flex items-center gap-1 text-[10px] text-gray-400 hover:text-gray-200 transition-colors"
          >
            {showAll ? (
              <CheckSquare size={12} className="text-[#00897B]" />
            ) : (
              <Square size={12} />
            )}
            Semua gardu
          </button>
        </div>
      </div>

      {/* Map */}
      <div className="flex-1 min-h-0 relative">
        <MapInner garduList={garduList} latestData={latestData} showAll={showAll} />
        {/* Empty state overlay */}
        {!showAll && alertCount === 0 && latestData.length > 0 && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-[400]">
            <div className="bg-emerald-900/80 border border-emerald-700 text-emerald-300 text-xs font-medium px-4 py-2 rounded-full backdrop-blur-sm">
              ✓ Semua gardu dalam kondisi normal
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function LegendDot({ color, label }: { color: string; label: string }) {
  return (
    <div className="flex items-center gap-1">
      <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: color }} />
      <span className="text-[10px] text-gray-500 hidden xl:inline">{label}</span>
    </div>
  );
}
