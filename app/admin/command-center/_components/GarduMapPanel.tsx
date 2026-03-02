"use client";

import dynamic from "next/dynamic";
import { Map } from "lucide-react";
import type { GarduMarker } from "../_hooks/useCommandCenter";
import type { PengukuranGardu } from "@/app/admin/pengukuran-gardu/_hooks/usePengukuranGardu";

const MapInner = dynamic(() => import("./_MapInner"), {
  ssr: false,
  loading: () => (
    <div className="flex-1 flex items-center justify-center bg-gray-50 rounded-b-xl">
      <div className="text-center">
        <div className="w-8 h-8 border-4 border-[#E2E8F0] border-t-[#00897B] rounded-full animate-spin mx-auto mb-2" />
        <p className="text-xs text-[#5D6D7E]">Memuat peta...</p>
      </div>
    </div>
  ),
});

interface Props {
  garduList: GarduMarker[];
  latestData: PengukuranGardu[];
}

export default function GarduMapPanel({ garduList, latestData }: Props) {
  return (
    <div className="flex flex-col h-full bg-white rounded-xl border border-[#E2E8F0] overflow-hidden">
      {/* Header */}
      <div className="bg-linear-to-r from-[#004D40] to-[#00897B] px-3 py-2.5 shrink-0 flex items-center gap-2">
        <Map size={13} className="text-teal-200" />
        <span className="text-white text-xs font-bold tracking-wider uppercase">Peta Gardu</span>
        <div className="ml-auto flex items-center gap-3">
          <LegendDot color="#EF4444" label="Overload / Panas" />
          <LegendDot color="#F59E0B" label="Warning" />
          <LegendDot color="#10B981" label="Normal" />
          <LegendDot color="#9CA3AF" label="No Data" />
        </div>
      </div>

      {/* Map */}
      <div className="flex-1 min-h-0">
        <MapInner garduList={garduList} latestData={latestData} />
      </div>
    </div>
  );
}

function LegendDot({ color, label }: { color: string; label: string }) {
  return (
    <div className="flex items-center gap-1">
      <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: color }} />
      <span className="text-[10px] text-teal-100 hidden lg:inline">{label}</span>
    </div>
  );
}
