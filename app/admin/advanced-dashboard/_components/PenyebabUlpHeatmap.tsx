"use client";

import { useState } from "react";
import { Grid3x3 } from "lucide-react";
import type { HeatmapRow } from "../_hooks/useAdvancedDashboard";

interface Props {
  rows: HeatmapRow[];
  ulps: string[];
  loading?: boolean;
}

const SECTION_DESC = `Cross-tabulation antara penyebab gangguan dan ULP. Warna lebih merah = kombinasi lebih sering terjadi.
Gunakan ini untuk menentukan program pemeliharaan yang tepat sasaran per area.`;

function getColor(count: number, max: number): string {
  if (count === 0) return "#1e3552";
  const r = count / max;
  if (r > 0.8) return "rgba(239,68,68,0.9)";
  if (r > 0.6) return "rgba(249,115,22,0.8)";
  if (r > 0.4) return "rgba(234,179,8,0.75)";
  if (r > 0.2) return "rgba(34,197,94,0.6)";
  return "rgba(34,197,94,0.3)";
}

function getTextColor(count: number, max: number): string {
  if (count === 0) return "rgba(255,255,255,0.2)";
  const r = count / max;
  return r > 0.3 ? "rgba(255,255,255,0.95)" : "rgba(255,255,255,0.7)";
}

export default function PenyebabUlpHeatmap({ rows, ulps, loading = false }: Props) {
  const [hovered, setHovered] = useState<{ pb: string; ulp: string } | null>(null);
  const globalMax = Math.max(...rows.flatMap((r) => Object.values(r.byUlp)), 1);

  return (
    <div className="bg-[#162334] rounded-xl border border-[#1e3552] shadow-sm">
      <div className="px-5 pt-5 pb-3">
        <div className="flex items-center gap-3 mb-2">
          <div className="p-2 bg-purple-900/20 rounded-lg">
            <Grid3x3 className="w-5 h-5 text-purple-400" />
          </div>
          <div>
            <h3 className="text-[#e2e8f0] font-bold text-lg">Penyebab × ULP Heatmap</h3>
            <p className="text-[#94a3b8] text-xs mt-0.5">Distribusi penyebab gangguan per area ULP</p>
          </div>
        </div>
        <p className="text-[#94a3b8] text-xs leading-relaxed border-l-2 border-purple-500/50 pl-3">{SECTION_DESC}</p>
      </div>

      <div className="px-5 pb-5">
        {loading ? (
          <div className="h-60 flex items-center justify-center">
            <div className="w-8 h-8 border-4 border-[#1e3552] border-t-purple-400 rounded-full animate-spin" />
          </div>
        ) : rows.length === 0 ? (
          <div className="h-60 flex items-center justify-center text-[#94a3b8]">Tidak ada data</div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-xs border-collapse">
                <thead>
                  <tr>
                    <th className="text-left py-2 pr-3 text-[#94a3b8] font-medium min-w-[160px]">Penyebab</th>
                    {ulps.map((u) => (
                      <th key={u} className="px-2 py-2 text-center text-[#94a3b8] font-medium min-w-[80px]">{u}</th>
                    ))}
                    <th className="px-2 py-2 text-center text-[#94a3b8] font-medium">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr key={row.penyebab}>
                      <td className="py-1 pr-3">
                        <span className="text-[#e2e8f0] leading-tight block" title={row.penyebab}>
                          {row.penyebab.length > 22 ? row.penyebab.slice(0, 22) + "…" : row.penyebab}
                        </span>
                      </td>
                      {ulps.map((u) => {
                        const count = row.byUlp[u] || 0;
                        const isHovered = hovered?.pb === row.penyebab && hovered?.ulp === u;
                        return (
                          <td key={u} className="px-1 py-1">
                            <div
                              className="rounded-md flex items-center justify-center h-9 cursor-pointer transition-all duration-150 relative"
                              style={{ backgroundColor: getColor(count, globalMax), transform: isHovered ? "scale(1.08)" : "scale(1)" }}
                              onMouseEnter={() => setHovered({ pb: row.penyebab, ulp: u })}
                              onMouseLeave={() => setHovered(null)}
                            >
                              <span className="font-bold" style={{ color: getTextColor(count, globalMax) }}>{count || ""}</span>
                              {isHovered && count > 0 && (
                                <div className="absolute bottom-full mb-1 left-1/2 -translate-x-1/2 z-20 whitespace-nowrap bg-[#0d1b2a] border border-[#1e3552] rounded px-2 py-1 shadow-xl">
                                  <p className="text-[#e2e8f0] font-semibold">{u}: {count}x</p>
                                  <p className="text-[#94a3b8]">{row.penyebab}</p>
                                </div>
                              )}
                            </div>
                          </td>
                        );
                      })}
                      <td className="px-2 py-1 text-center">
                        <span className="text-[#5eead4] font-bold">{row.total}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="mt-4 flex items-center gap-3">
              <span className="text-[#94a3b8] text-xs">Intensitas:</span>
              <div className="flex gap-1 items-center">
                {["rgba(34,197,94,0.3)", "rgba(34,197,94,0.6)", "rgba(234,179,8,0.75)", "rgba(249,115,22,0.8)", "rgba(239,68,68,0.9)"].map((c, i) => (
                  <div key={i} className="w-6 h-4 rounded" style={{ backgroundColor: c }} />
                ))}
              </div>
              <span className="text-[#94a3b8] text-xs">Rendah → Tinggi</span>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
