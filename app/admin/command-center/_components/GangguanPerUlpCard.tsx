"use client";

import { useMemo } from "react";
import { BarChart3, TrendingUp, TrendingDown, Minus } from "lucide-react";
import type { GangguanItem } from "../_hooks/useCommandCenter";

interface Props {
  items: GangguanItem[];
}

const ULP_LIST = ["AMPENAN", "CAKRANEGARA", "GERUNG", "TANJUNG"];

const ULP_SHORT: Record<string, string> = {
  AMPENAN: "AMP",
  CAKRANEGARA: "CKR",
  GERUNG: "GRG",
  TANJUNG: "TNJ",
};

const ULP_COLOR: Record<string, string> = {
  AMPENAN: "#00897B",
  CAKRANEGARA: "#0097A7",
  GERUNG: "#0288D1",
  TANJUNG: "#7B1FA2",
};

export default function GangguanPerUlpCard({ items }: Props) {
  const now = new Date();
  const currentYear = now.getFullYear();
  const lastYear = currentYear - 1;

  const stats = useMemo(() => {
    const ulpsInData = [
      ...new Set(items.map((g) => g.ulp?.trim().toUpperCase()).filter(Boolean) as string[]),
    ];
    const ulpsToShow = ulpsInData.length > 1 ? ULP_LIST : ulpsInData;

    return ulpsToShow.map((ulp) => {
      const thisYear = items.filter(
        (g) => g.ulp?.trim().toUpperCase() === ulp && g.parsedDate?.getFullYear() === currentYear
      ).length;
      const prevYear = items.filter(
        (g) => g.ulp?.trim().toUpperCase() === ulp && g.parsedDate?.getFullYear() === lastYear
      ).length;
      return { ulp, thisYear, prevYear, delta: thisYear - prevYear };
    });
  }, [items, currentYear, lastYear]);

  const maxCount = Math.max(...stats.map((s) => Math.max(s.thisYear, s.prevYear)), 1);
  const totalThisYear = stats.reduce((sum, s) => sum + s.thisYear, 0);

  return (
    <div className="bg-white rounded-xl border border-[#E2E8F0] shadow-sm overflow-hidden">
      <div className="bg-linear-to-r from-[#004D40] to-[#00897B] px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <BarChart3 size={14} className="text-white/80" />
          <span className="text-white font-semibold text-sm">Gangguan Per ULP</span>
          <span className="text-teal-200 text-xs">· {currentYear} vs {lastYear}</span>
        </div>
        <span className="font-mono font-bold text-lg text-white">{totalThisYear}</span>
      </div>

      <div className="p-4 space-y-4">
        {stats.map(({ ulp, thisYear, prevYear, delta }) => (
          <div key={ulp}>
            <div className="flex items-center justify-between mb-1.5">
              <div className="flex items-center gap-2">
                <span
                  className="w-7 h-5 rounded text-white text-[10px] font-bold flex items-center justify-center shrink-0"
                  style={{ backgroundColor: ULP_COLOR[ulp] ?? "#00897B" }}
                >
                  {ULP_SHORT[ulp] ?? ulp.slice(0, 3)}
                </span>
                <span className="text-xs font-medium text-[#1B2631]">{ulp}</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="font-mono font-bold text-sm text-[#1B2631]">{thisYear}</span>
                {delta > 0 ? (
                  <span className="flex items-center gap-0.5 text-[10px] font-semibold text-red-600 bg-red-50 px-1.5 py-0.5 rounded-full">
                    <TrendingUp size={9} />+{delta}
                  </span>
                ) : delta < 0 ? (
                  <span className="flex items-center gap-0.5 text-[10px] font-semibold text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded-full">
                    <TrendingDown size={9} />{delta}
                  </span>
                ) : (
                  <span className="flex items-center gap-0.5 text-[10px] font-semibold text-gray-500 bg-gray-100 px-1.5 py-0.5 rounded-full">
                    <Minus size={9} />sama
                  </span>
                )}
              </div>
            </div>

            {/* Dual bar: tahun ini (solid) + tahun lalu (faded) */}
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <span className="text-[10px] text-[#5D6D7E] w-8 text-right shrink-0">{currentYear}</span>
                <div className="flex-1 h-2 bg-[#F4F6F8] rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all duration-500"
                    style={{ width: `${(thisYear / maxCount) * 100}%`, backgroundColor: ULP_COLOR[ulp] ?? "#00897B" }}
                  />
                </div>
                <span className="text-[10px] font-mono text-[#5D6D7E] w-6">{thisYear}</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-[10px] text-[#9CA3AF] w-8 text-right shrink-0">{lastYear}</span>
                <div className="flex-1 h-2 bg-[#F4F6F8] rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full opacity-35 transition-all duration-500"
                    style={{ width: `${(prevYear / maxCount) * 100}%`, backgroundColor: ULP_COLOR[ulp] ?? "#00897B" }}
                  />
                </div>
                <span className="text-[10px] font-mono text-[#9CA3AF] w-6">{prevYear}</span>
              </div>
            </div>
          </div>
        ))}

        {stats.length === 0 && (
          <p className="text-center text-sm text-[#9CA3AF] py-6">Tidak ada data</p>
        )}
      </div>
    </div>
  );
}
