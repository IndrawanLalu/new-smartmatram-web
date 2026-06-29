"use client";

import { useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { Map as MapIcon, CheckSquare, Square } from "lucide-react";
import type { GarduMarker } from "../_hooks/useCommandCenter";
import type { PengukuranGardu } from "@/app/admin/pengukuran-gardu/_hooks/usePengukuranGardu";
import type { FeederRisk } from "../_hooks/useFeederRisk";
import type { FeederRiskInfo } from "./_MapInner";
import { normalizeFeeder } from "@/lib/feeder";

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
  riskData: FeederRisk[];
}

type Mode = "beban" | "risiko";

export default function GarduMapPanel({ garduList, latestData, riskData }: Props) {
  const [showAll, setShowAll] = useState(false);
  const [mode, setMode] = useState<Mode>("beban");

  const alertCount = latestData.filter(
    (d) => d.persen_beban >= 60 || d.suhu_trafo > 60
  ).length;

  // Map feeder ternormalisasi → info risiko H+1 (untuk mode risiko).
  const feederRisk = useMemo(() => {
    const m = new Map<string, FeederRiskInfo>();
    riskData.forEach((r) => {
      m.set(normalizeFeeder(r.penyulang), {
        level: r.risk_level,
        score: r.risk_score,
        penyulang: r.penyulang,
        predicted_cause: r.predicted_cause,
      });
    });
    return m;
  }, [riskData]);

  // Jumlah gardu yang feeder-nya berisiko (untuk badge header).
  const riskGarduCount = useMemo(() => {
    let kritis = 0;
    let waspada = 0;
    garduList.forEach((g) => {
      const info = feederRisk.get(normalizeFeeder(g.feeder));
      if (info?.level === "kritis") kritis += 1;
      else if (info?.level === "waspada") waspada += 1;
    });
    return { kritis, waspada };
  }, [garduList, feederRisk]);

  return (
    <div className="flex flex-col h-full bg-[#0d1b2a] rounded-xl border border-gray-800 overflow-hidden">
      {/* Header */}
      <div className="px-3 py-2 shrink-0 flex items-center gap-2 border-b border-gray-800">
        <MapIcon size={13} className="text-[#00897B]" />
        <span className="text-gray-300 text-xs font-bold tracking-wider uppercase">Peta Gardu</span>

        {/* Toggle mode */}
        <div className="flex items-center rounded-md bg-[#162334] border border-gray-800 p-0.5">
          <ModeButton active={mode === "beban"} onClick={() => setMode("beban")}>Beban</ModeButton>
          <ModeButton active={mode === "risiko"} onClick={() => setMode("risiko")}>Risiko H+1</ModeButton>
        </div>

        {mode === "beban" && !showAll && alertCount > 0 && (
          <span className="animate-pulse font-mono text-[10px] bg-red-500/20 text-red-400 px-1.5 py-0.5 rounded">
            {alertCount} alert
          </span>
        )}
        {mode === "risiko" && (riskGarduCount.kritis > 0 || riskGarduCount.waspada > 0) && (
          <span className="font-mono text-[10px] bg-amber-500/15 text-amber-400 px-1.5 py-0.5 rounded">
            {riskGarduCount.kritis + riskGarduCount.waspada} gardu berisiko
          </span>
        )}

        <div className="ml-auto flex items-center gap-3">
          {mode === "beban" && showAll && (
            <div className="flex items-center gap-2.5">
              <LegendDot color="#EF4444" label="Overload" />
              <LegendDot color="#F59E0B" label="Warning" />
              <LegendDot color="#10B981" label="Normal" />
              <LegendDot color="#4B5563" label="No data" />
            </div>
          )}
          {mode === "risiko" && (
            <div className="flex items-center gap-2.5">
              <LegendDot color="#EF4444" label="Kritis" />
              <LegendDot color="#F59E0B" label="Waspada" />
              <LegendDot color="#10B981" label="Aman" />
            </div>
          )}
          {mode === "beban" && (
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
          )}
        </div>
      </div>

      {/* Map */}
      <div className="flex-1 min-h-0 relative">
        <MapInner
          garduList={garduList}
          latestData={latestData}
          showAll={showAll}
          mode={mode}
          feederRisk={feederRisk}
        />
        {/* Empty state overlay */}
        {mode === "beban" && !showAll && alertCount === 0 && latestData.length > 0 && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-[400]">
            <div className="bg-emerald-900/80 border border-emerald-700 text-emerald-300 text-xs font-medium px-4 py-2 rounded-full backdrop-blur-sm">
              ✓ Semua gardu dalam kondisi normal
            </div>
          </div>
        )}
        {mode === "risiko" && riskGarduCount.kritis === 0 && riskGarduCount.waspada === 0 && riskData.length > 0 && (
          <div className="absolute top-2 left-1/2 -translate-x-1/2 pointer-events-none z-[400]">
            <div className="bg-emerald-900/80 border border-emerald-700 text-emerald-300 text-[11px] font-medium px-3 py-1 rounded-full backdrop-blur-sm">
              ✓ Semua feeder bergardu aman besok
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function ModeButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`px-2 py-0.5 text-[10px] font-semibold rounded transition-colors ${
        active ? "bg-[#00897B] text-white" : "text-gray-400 hover:text-gray-200"
      }`}
    >
      {children}
    </button>
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
