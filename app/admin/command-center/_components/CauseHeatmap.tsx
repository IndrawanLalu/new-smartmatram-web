"use client";

import { CalendarDays } from "lucide-react";
import { useCauseSeasonality } from "../_hooks/useCauseSeasonality";
import { CAUSE_COLORS } from "@/lib/causeClass";
import type { CurrentUser } from "@/lib/roles";

const MONTHS = ["J", "F", "M", "A", "M", "J", "J", "A", "S", "O", "N", "D"];

function rgba(hex: string, alpha: number): string {
  const h = hex.replace("#", "");
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

interface Props {
  user: CurrentUser | null;
}

export default function CauseHeatmap({ user }: Props) {
  const { rows, maxCell, grandTotal, loading } = useCauseSeasonality(user);

  return (
    <div className="bg-[#162334] rounded-xl border border-[#1e3552] shadow-sm overflow-hidden">
      <div className="bg-linear-to-r from-[#004D40] to-[#00897B] px-4 py-2.5 flex items-center gap-2">
        <CalendarDays size={14} className="text-white/80" />
        <div className="flex flex-col leading-tight">
          <span className="text-white font-semibold text-xs">Pola Musiman Penyebab Gangguan</span>
          <span className="text-white/70 text-[10px]">
            {grandTotal} kejadian · 2022–2026 · gelap = lebih sering
          </span>
        </div>
      </div>

      <div className="p-4">
        {loading ? (
          <div className="flex items-center justify-center h-28">
            <div className="w-5 h-5 border-2 border-[#1e3552] border-t-[#5eead4] rounded-full animate-spin" />
          </div>
        ) : grandTotal === 0 ? (
          <div className="flex items-center justify-center h-28 text-[12px] text-[#94a3b8]">
            Belum ada data event
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-separate border-spacing-1">
              <thead>
                <tr>
                  <th className="w-28" />
                  {MONTHS.map((m, i) => (
                    <th key={i} className="text-[10px] font-mono text-[#64748b] font-normal text-center w-7">
                      {m}
                    </th>
                  ))}
                  <th className="text-[10px] text-[#64748b] font-normal text-right pl-2 w-12">Total</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => {
                  const color = CAUSE_COLORS[row.cause];
                  return (
                    <tr key={row.cause}>
                      <td className="text-[11px] text-[#cbd5e1] pr-2 whitespace-nowrap">
                        <span className="inline-flex items-center gap-1.5">
                          <span className="h-2 w-2 rounded-sm shrink-0" style={{ backgroundColor: color }} />
                          {row.cause.replace(" (angin/hujan/petir)", "")}
                        </span>
                      </td>
                      {row.months.map((v, i) => {
                        const intensity = v === 0 ? 0 : 0.15 + 0.85 * (v / maxCell);
                        return (
                          <td key={i} className="p-0">
                            <div
                              className="h-7 rounded flex items-center justify-center text-[9px] font-mono"
                              style={{
                                backgroundColor: v === 0 ? "#0d1b2a" : rgba(color, intensity),
                                color: intensity > 0.55 ? "#0a1628" : "#94a3b8",
                              }}
                              title={`${row.cause} · bulan ${i + 1}: ${v}`}
                            >
                              {v > 0 ? v : ""}
                            </div>
                          </td>
                        );
                      })}
                      <td className="text-[11px] font-mono font-bold text-[#e2e8f0] text-right pl-2">
                        {row.total}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
