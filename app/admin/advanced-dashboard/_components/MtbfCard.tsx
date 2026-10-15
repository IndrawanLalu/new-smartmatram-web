"use client";

import { Timer } from "lucide-react";
import type { MtbfItem } from "../_hooks/useAdvancedDashboard";

interface Props {
  items: MtbfItem[];
  totalDays: number;
  loading?: boolean;
}

const SECTION_DESC = `MTBF (Mean Time Between Failures) — rata-rata hari antara dua gangguan berturut-turut pada penyulang yang sama.
MTBF rendah = penyulang sering bermasalah secara kronis → kandidat prioritas predictive maintenance.`;

function getMtbfColor(mtbf: number) {
  if (mtbf <= 3) return { bar: "#ef4444", badge: "bg-red-50 text-red-600 border-red-200" };
  if (mtbf <= 7) return { bar: "#f59e0b", badge: "bg-amber-50 text-amber-600 border-amber-200" };
  if (mtbf <= 14) return { bar: "#22c55e", badge: "bg-green-50 text-green-600 border-green-200" };
  return { bar: "#2f55b0", badge: "bg-brand-50 text-brand-700 border-line" };
}

export default function MtbfCard({ items, totalDays, loading = false }: Props) {
  const maxMtbf = items.length > 0 ? Math.max(...items.map((i) => i.mtbfDays)) : 1;

  return (
    <div className="bg-white rounded-xl border border-line shadow-sm">
      <div className="px-5 pt-5 pb-3">
        <div className="flex items-center gap-3 mb-2">
          <div className="p-2 bg-blue-50 rounded-lg">
            <Timer className="w-5 h-5 text-blue-600" />
          </div>
          <div>
            <h3 className="text-ink font-bold text-lg">MTBF per Penyulang</h3>
            <p className="text-ink-soft text-xs mt-0.5">Mean Time Between Failures — periode analisis: {totalDays} hari</p>
          </div>
        </div>
        <p className="text-ink-soft text-xs leading-relaxed border-l-2 border-blue-500/50 pl-3">{SECTION_DESC}</p>

        <div className="mt-3 flex flex-wrap gap-2 text-xs">
          {[
            { color: "bg-red-400",   label: "≤ 3 hari — Kritis" },
            { color: "bg-amber-400", label: "≤ 7 hari — Waspada" },
            { color: "bg-green-400", label: "≤ 14 hari — Perhatian" },
            { color: "bg-brand-600", label: "> 14 hari — Baik" },
          ].map(({ color, label }) => (
            <div key={label} className="flex items-center gap-1.5">
              <span className={`w-2.5 h-2.5 rounded-full ${color}`} />
              <span className="text-ink-soft">{label}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="px-5 pb-5">
        {loading ? (
          <div className="h-60 flex items-center justify-center">
            <div className="w-8 h-8 border-4 border-line border-t-blue-400 rounded-full animate-spin" />
          </div>
        ) : items.length === 0 ? (
          <div className="h-60 flex items-center justify-center text-ink-soft">Tidak ada data</div>
        ) : (
          <div className="space-y-2 max-h-80 overflow-y-auto pr-1">
            {items.map((item, i) => {
              const { bar, badge } = getMtbfColor(item.mtbfDays);
              const barWidth = Math.max(2, (item.mtbfDays / maxMtbf) * 100);
              return (
                <div key={item.penyulang} className="bg-white border border-line rounded-lg px-3 py-2">
                  <div className="flex items-center justify-between mb-1.5">
                    <div className="flex items-center gap-2">
                      <span className="text-ink-soft text-xs w-5">#{i + 1}</span>
                      <span className="text-ink text-sm font-medium">{item.penyulang}</span>
                      <span className="text-ink-soft text-[10px]">{item.ulp}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-ink-soft text-xs">{item.count}x gangguan</span>
                      <span className={`text-xs font-bold px-2 py-0.5 rounded border ${badge}`}>
                        {item.mtbfDays} hari
                      </span>
                    </div>
                  </div>
                  <div className="h-1.5 bg-line rounded-full overflow-hidden">
                    <div className="h-full rounded-full transition-all" style={{ width: `${barWidth}%`, backgroundColor: bar }} />
                  </div>
                  {item.lastGangguan && (
                    <p className="text-ink-soft text-[10px] mt-1">
                      Gangguan terakhir: {new Date(item.lastGangguan + "T12:00:00").toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" })}
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
