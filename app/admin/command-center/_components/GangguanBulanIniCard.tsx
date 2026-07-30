"use client";

import { useMemo } from "react";
import { CARD } from "@/app/admin/_ui";
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
    <div className={`${CARD}`}>
      <div className="bg-navy-700 px-4 py-2.5 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Calendar size={13} className="text-white/70" />
          <span className="text-white font-semibold text-xs">
            Gangguan Per ULP · {MONTH_NAMES[currentMonth]} {currentYear}
          </span>
        </div>
        <span className="font-mono font-bold text-sm text-white">{totalThisMonth}</span>
      </div>

      <div className="px-4 py-3 space-y-3">
        {stats.map(({ ulp, thisMonth, lastMonth, delta }) => (
          <div key={ulp}>
            <div className="flex items-center justify-between mb-1">
              <span className="text-[11px] font-medium text-ink">{ulp}</span>
              <div className="flex items-center gap-2 text-[11px]">
                <span className="font-mono font-semibold text-ink">{thisMonth}</span>
                <span className="text-ink-soft">vs {lastMonth}</span>
                {delta !== 0 && (
                  <span className={`font-medium ${delta > 0 ? "text-red-500" : "text-emerald-600"}`}>
                    {delta > 0 ? `↑ +${delta}` : `↓ ${delta}`}
                  </span>
                )}
              </div>
            </div>
            <div className="h-1.5 bg-surface rounded-full overflow-hidden">
              <div
                className="h-full rounded-full bg-accent transition-all duration-500"
                style={{ width: `${(thisMonth / maxCount) * 100}%` }}
              />
            </div>
          </div>
        ))}
        {stats.length === 0 && (
          <p className="text-center text-xs text-ink-soft py-3">Tidak ada data bulan ini</p>
        )}
        <p className="text-[10px] text-ink-soft text-right">
          vs {MONTH_NAMES[lastMonthIdx]}
        </p>
      </div>
    </div>
  );
}
