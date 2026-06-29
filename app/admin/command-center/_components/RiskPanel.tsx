"use client";

import { useState } from "react";
import { ShieldAlert } from "lucide-react";
import type { FeederRisk } from "../_hooks/useFeederRisk";
import RiskDetailModal from "./RiskDetailModal";

const LEVEL_STYLE = {
  kritis: {
    border: "border-l-red-500",
    bg: "bg-red-900/20",
    score: "text-red-400",
    bar: "bg-red-500",
    dot: "bg-red-500",
    ping: "bg-red-400",
  },
  waspada: {
    border: "border-l-amber-500",
    bg: "bg-amber-900/10",
    score: "text-amber-400",
    bar: "bg-amber-400",
    dot: "bg-amber-500",
    ping: "bg-amber-400",
  },
  aman: {
    border: "border-l-emerald-700",
    bg: "bg-emerald-900/5",
    score: "text-emerald-400",
    bar: "bg-emerald-500",
    dot: "bg-emerald-500",
    ping: "bg-emerald-400",
  },
} as const;

interface Props {
  riskData: FeederRisk[];
  dateTgl: string | null;
  loading: boolean;
  criticalCount: number;
  waspCount: number;
}

export default function RiskPanel({ riskData, dateTgl, loading, criticalCount, waspCount }: Props) {
  const [selected, setSelected] = useState<FeederRisk | null>(null);
  const hasCritical = criticalCount > 0;

  return (
    <>
      <div className="flex flex-col h-full bg-[#162334] rounded-xl border border-[#1e3552] overflow-hidden">
        {/* Header */}
        <div
          className={`bg-linear-to-r from-[#0d1f38] to-[#0a2a3a] px-3 py-2.5 shrink-0 flex items-center gap-2 ${hasCritical ? "animate-pulse" : ""}`}
        >
          <ShieldAlert size={13} className={hasCritical ? "text-red-400" : "text-[#5eead4]"} />
          <span className="text-white text-xs font-bold tracking-wider uppercase">Prediksi Risiko H+1</span>
          {dateTgl && (
            <span className="text-[#5eead4]/60 text-[9px] font-mono">
              {new Date(dateTgl + "T00:00:00").toLocaleDateString("id-ID", { day: "numeric", month: "short" })}
            </span>
          )}
          {riskData.length > 0 && (
            <div className="ml-auto flex items-center gap-1">
              {criticalCount > 0 && (
                <span className="bg-red-600/80 text-white text-[10px] font-mono font-bold px-1.5 py-0.5 rounded">
                  🔴 {criticalCount}
                </span>
              )}
              {waspCount > 0 && (
                <span className="bg-amber-600/60 text-white text-[10px] font-mono font-bold px-1.5 py-0.5 rounded">
                  🟡 {waspCount}
                </span>
              )}
            </div>
          )}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-2 space-y-0.5">
          {loading && (
            <div className="flex items-center justify-center h-14">
              <div className="w-4 h-4 border-2 border-[#1e3552] border-t-[#5eead4] rounded-full animate-spin" />
            </div>
          )}

          {!loading && riskData.length === 0 && (
            <div className="flex flex-col items-center justify-center h-14 gap-1 px-2 text-center">
              <span className="text-[11px] text-[#94a3b8]">Tidak ada data prediksi hari ini</span>
              <span className="text-[10px] text-[#475569]">Pipeline ML belum berjalan</span>
            </div>
          )}

          {riskData.map((r) => {
            const s = LEVEL_STYLE[r.risk_level];
            return (
              <button
                key={r.id}
                onClick={() => setSelected(r)}
                className={`w-full flex items-center gap-2 pl-2 pr-2 py-1 rounded-r-lg border-l-2 text-left hover:brightness-125 transition-all ${s.border} ${s.bg}`}
              >
                {/* Dot */}
                <span className="relative flex shrink-0 h-1.5 w-1.5">
                  {r.risk_level !== "aman" && (
                    <span className={`animate-ping absolute inline-flex h-full w-full rounded-full ${s.ping} opacity-75`} />
                  )}
                  <span className={`relative inline-flex rounded-full h-1.5 w-1.5 ${s.dot}`} />
                </span>

                {/* Name + cause */}
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-semibold text-[#e2e8f0] truncate leading-tight">
                    {r.penyulang}
                  </div>
                  {r.predicted_cause && (
                    <div className="text-[9px] text-[#64748b] truncate leading-tight">{r.predicted_cause}</div>
                  )}
                </div>

                {/* Score + bar */}
                <div className="shrink-0 text-right">
                  <div className={`text-[10px] font-mono font-bold leading-tight ${s.score}`}>
                    {r.risk_score.toFixed(0)}
                  </div>
                  <div className="w-10 h-1 bg-[#1e3552] rounded-full overflow-hidden mt-0.5">
                    <div
                      className={`h-full rounded-full ${s.bar}`}
                      style={{ width: `${r.risk_score}%` }}
                    />
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {selected && <RiskDetailModal risk={selected} onClose={() => setSelected(null)} />}
    </>
  );
}
