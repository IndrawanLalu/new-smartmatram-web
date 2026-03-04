import { BarChart2 } from "lucide-react";
import type { PengukuranGardu } from "@/app/admin/pengukuran-gardu/_hooks/usePengukuranGardu";

function barColor(pct: number): string {
  if (pct >= 80) return "bg-red-500";
  if (pct >= 60) return "bg-amber-400";
  return "bg-emerald-500";
}

function textColor(pct: number): string {
  if (pct >= 80) return "text-red-600";
  if (pct >= 60) return "text-amber-600";
  return "text-emerald-600";
}

interface Props {
  latestData: PengukuranGardu[];
  avgBeban: number;
}

export default function BebanStrip({ latestData, avgBeban }: Props) {
  const top8 = [...latestData]
    .sort((a, b) => b.persen_beban - a.persen_beban)
    .slice(0, 8);

  return (
    <div className="bg-[#162334] rounded-xl border border-[#1e3552] overflow-hidden shrink-0">
      {/* Header */}
      <div className="bg-linear-to-r from-[#004D40] to-[#00897B] px-3 py-2 flex items-center gap-2">
        <BarChart2 size={13} className="text-teal-200" />
        <span className="text-white text-xs font-bold tracking-wider uppercase">Beban Gardu Terpantau</span>
        <div className="ml-auto flex items-center gap-3">
          <span className="text-teal-100 text-xs">
            Rata-rata{" "}
            <span className={`font-mono font-bold ${avgBeban >= 80 ? "text-red-300" : avgBeban >= 60 ? "text-amber-300" : "text-emerald-300"}`}>
              {avgBeban.toFixed(1)}%
            </span>
          </span>
          <span className="text-teal-200 text-xs font-mono">{latestData.length} gardu</span>
        </div>
      </div>

      {/* Bars */}
      <div className="px-3 py-2.5 grid grid-cols-1 gap-1.5">
        {top8.length === 0 ? (
          <div className="text-xs text-[#94a3b8] text-center py-3">Belum ada data pengukuran</div>
        ) : (
          top8.map((g) => (
            <div key={g.id} className="flex items-center gap-2">
              <span className="text-[10px] font-mono text-[#94a3b8] w-20 shrink-0 truncate">{g.no_gardu}</span>
              <div className="flex-1 h-3 bg-gray-100 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all ${barColor(g.persen_beban)}`}
                  style={{ width: `${Math.min(g.persen_beban, 100)}%` }}
                />
              </div>
              <span className={`text-[10px] font-mono font-bold w-10 text-right shrink-0 ${textColor(g.persen_beban)}`}>
                {g.persen_beban.toFixed(0)}%
              </span>
              <span className="text-[10px] text-[#94a3b8] font-mono w-14 text-right shrink-0 hidden lg:block">
                {g.beban_kva.toFixed(0)}/{g.kva_trafo} kVA
              </span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
