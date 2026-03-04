"use client";

import { useMemo } from "react";
import { Calendar } from "lucide-react";
import type { GangguanItem } from "../_hooks/useCommandCenter";

interface Props {
  items: GangguanItem[];
}

const MONTH_NAMES = [
  "Januari", "Februari", "Maret", "April", "Mei", "Juni",
  "Juli", "Agustus", "September", "Oktober", "November", "Desember",
];

const ULP_LIST = ["AMPENAN", "CAKRANEGARA", "GERUNG", "TANJUNG"];

const ULP_COLOR: Record<string, string> = {
  AMPENAN: "#00897B",
  CAKRANEGARA: "#0097A7",
  GERUNG: "#0288D1",
  TANJUNG: "#7B1FA2",
};

export default function GangguanBulanIniCard({ items }: Props) {
  const now = new Date();
  const currentMonth = now.getMonth();
  const currentYear = now.getFullYear();

  const lastMonthIdx = currentMonth === 0 ? 11 : currentMonth - 1;
  const lastMonthYear = currentMonth === 0 ? currentYear - 1 : currentYear;

  const stats = useMemo(() => {
    const ulpsInData = [
      ...new Set(items.map((g) => g.ulp?.trim().toUpperCase()).filter(Boolean) as string[]),
    ];
    const ulpsToShow = ulpsInData.length > 1 ? ULP_LIST : ulpsInData;

    return ulpsToShow.map((ulp) => {
      const thisMonth = items.filter(
        (g) =>
          g.ulp?.trim().toUpperCase() === ulp &&
          g.parsedDate?.getMonth() === currentMonth &&
          g.parsedDate?.getFullYear() === currentYear
      ).length;

      const lastMonth = items.filter(
        (g) =>
          g.ulp?.trim().toUpperCase() === ulp &&
          g.parsedDate?.getMonth() === lastMonthIdx &&
          g.parsedDate?.getFullYear() === lastMonthYear
      ).length;

      return { ulp, thisMonth, lastMonth, delta: thisMonth - lastMonth };
    });
  }, [items, currentMonth, currentYear, lastMonthIdx, lastMonthYear]);

  const maxCount = Math.max(...stats.map((s) => s.thisMonth), 1);
  const totalThisMonth = stats.reduce((sum, s) => sum + s.thisMonth, 0);

  return (
    <div className="bg-white rounded-xl border border-[#E2E8F0] shadow-sm overflow-hidden">
      <div className="bg-linear-to-r from-[#1565C0] to-[#1976D2] px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Calendar size={14} className="text-white/80" />
          <span className="text-white font-semibold text-sm">Gangguan Per ULP</span>
          <span className="text-blue-200 text-xs">· {MONTH_NAMES[currentMonth]} {currentYear}</span>
        </div>
        <span className="font-mono font-bold text-lg text-white">{totalThisMonth}</span>
      </div>

      <div className="p-4 space-y-3">
        {stats.map(({ ulp, thisMonth, lastMonth, delta }) => (
          <div key={ulp}>
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs font-medium text-[#1B2631]">{ulp}</span>
              <div className="flex items-center gap-2 text-xs">
                <span className="font-mono font-bold text-[#1B2631]">{thisMonth}</span>
                <span className="text-[#9CA3AF]">
                  vs {lastMonth} {MONTH_NAMES[lastMonthIdx].slice(0, 3)}
                </span>
                {delta !== 0 && (
                  <span
                    className={`font-semibold ${delta > 0 ? "text-red-500" : "text-emerald-600"}`}
                  >
                    {delta > 0 ? `+${delta}` : delta}
                  </span>
                )}
              </div>
            </div>
            <div className="h-2.5 bg-[#F4F6F8] rounded-full overflow-hidden">
              <div
                className="h-full rounded-full transition-all duration-500"
                style={{
                  width: `${(thisMonth / maxCount) * 100}%`,
                  backgroundColor: ULP_COLOR[ulp] ?? "#00897B",
                }}
              />
            </div>
          </div>
        ))}

        {stats.length === 0 && (
          <p className="text-center text-sm text-[#9CA3AF] py-6">
            Tidak ada data bulan ini
          </p>
        )}

        {/* Legend */}
        <p className="text-[10px] text-[#9CA3AF] text-right pt-1">
          vs bulan lalu ({MONTH_NAMES[lastMonthIdx]})
        </p>
      </div>
    </div>
  );
}
