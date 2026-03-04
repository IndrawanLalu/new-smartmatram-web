"use client";

import { useMemo } from "react";
import { BarChart3 } from "lucide-react";
import type { GangguanItem } from "../_hooks/useCommandCenter";

interface Props {
  items: GangguanItem[];
}

const ULP_LIST = ["AMPENAN", "CAKRANEGARA", "GERUNG", "TANJUNG"];

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
      const delta = thisYear - prevYear;
      return { ulp, thisYear, prevYear, delta };
    });
  }, [items, currentYear, lastYear]);

  const maxCount = Math.max(...stats.map((s) => Math.max(s.thisYear, s.prevYear)), 1);
  const totalThisYear = stats.reduce((sum, s) => sum + s.thisYear, 0);

  return (
    <div className="bg-[#162334] rounded-xl border border-[#1e3552] shadow-sm overflow-hidden">
      <div className="bg-linear-to-r from-[#004D40] to-[#00897B] px-4 py-2.5 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <BarChart3 size={13} className="text-white/70" />
          <span className="text-white font-semibold text-xs">Gangguan Per ULP · {currentYear} vs {lastYear}</span>
        </div>
        <span className="font-mono font-bold text-sm text-white">{totalThisYear}</span>
      </div>

      <div className="px-4 py-3 space-y-3">
        {stats.map(({ ulp, thisYear, prevYear, delta }) => (
          <div key={ulp}>
            <div className="flex items-center justify-between mb-1">
              <span className="text-[11px] font-medium text-[#e2e8f0]">{ulp}</span>
              <div className="flex items-center gap-2 text-[11px]">
                <span className="font-mono font-semibold text-[#e2e8f0]">{thisYear}</span>
                <span
                  className={`font-medium ${
                    delta > 0 ? "text-red-500" : delta < 0 ? "text-emerald-600" : "text-[#9CA3AF]"
                  }`}
                >
                  {delta > 0 ? `↑ +${delta}` : delta < 0 ? `↓ ${delta}` : "—"}
                </span>
              </div>
            </div>
            <div className="space-y-0.5">
              <div className="h-1.5 bg-[#0d1b2a] rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full bg-[#00897B] transition-all duration-500"
                  style={{ width: `${(thisYear / maxCount) * 100}%` }}
                />
              </div>
              <div className="h-1 bg-[#0d1b2a] rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full bg-[#00897B]/30 transition-all duration-500"
                  style={{ width: `${(prevYear / maxCount) * 100}%` }}
                />
              </div>
            </div>
          </div>
        ))}
        {stats.length === 0 && (
          <p className="text-center text-xs text-[#9CA3AF] py-3">Tidak ada data</p>
        )}
        <p className="text-[10px] text-[#9CA3AF] text-right">
          bar tebal = {currentYear} · tipis = {lastYear}
        </p>
      </div>
    </div>
  );
}
