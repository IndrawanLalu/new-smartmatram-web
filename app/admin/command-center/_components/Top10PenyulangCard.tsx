"use client";

import { useMemo } from "react";
import { Zap } from "lucide-react";
import type { GangguanItem } from "../_hooks/useCommandCenter";

interface Props {
  items: GangguanItem[];
  title: string;
  subtitle: string;
  headerFrom?: string;
  headerTo?: string;
}

// Warna berdasarkan ranking
const RANK_COLORS = ["#EF4444", "#F97316", "#F59E0B", "#00897B"];
function rankColor(idx: number): string {
  return RANK_COLORS[Math.min(idx, RANK_COLORS.length - 1)];
}

export default function Top10PenyulangCard({
  items,
  title,
  subtitle,
  headerFrom = "#004D40",
  headerTo = "#00897B",
}: Props) {
  const top10 = useMemo(() => {
    const map = new Map<string, number>();
    items.forEach((g) => {
      if (!g.penyulang) return;
      const key = g.penyulang.trim().toUpperCase();
      map.set(key, (map.get(key) ?? 0) + 1);
    });
    return [...map.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([penyulang, count], idx) => ({ penyulang, count, rank: idx + 1, color: rankColor(idx) }));
  }, [items]);

  const maxCount = top10[0]?.count ?? 1;

  return (
    <div className="bg-white rounded-xl border border-[#E2E8F0] shadow-sm overflow-hidden">
      <div
        className="px-4 py-3 flex items-center gap-2"
        style={{ background: `linear-gradient(to right, ${headerFrom}, ${headerTo})` }}
      >
        <Zap size={14} className="text-white/80" />
        <span className="text-white font-semibold text-sm">{title}</span>
        <span className="text-white/70 text-xs">· {subtitle}</span>
        <span className="ml-auto font-mono text-xs text-white/60">{items.length} gangguan</span>
      </div>

      <div className="p-4">
        {top10.length === 0 ? (
          <p className="text-center text-sm text-[#9CA3AF] py-6">Tidak ada data</p>
        ) : (
          <div className="space-y-2.5">
            {top10.map(({ penyulang, count, rank, color }) => (
              <div key={penyulang}>
                <div className="flex items-center justify-between mb-1">
                  <div className="flex items-center gap-2 min-w-0">
                    <span
                      className="w-5 h-5 rounded-full text-white text-[10px] font-bold flex items-center justify-center shrink-0"
                      style={{ backgroundColor: color }}
                    >
                      {rank}
                    </span>
                    <span className="text-xs font-medium text-[#1B2631] truncate">{penyulang}</span>
                  </div>
                  <span className="font-mono font-bold text-sm text-[#1B2631] ml-3 shrink-0">
                    {count}x
                  </span>
                </div>
                <div className="h-1.5 bg-[#F4F6F8] rounded-full overflow-hidden ml-7">
                  <div
                    className="h-full rounded-full transition-all duration-500"
                    style={{ width: `${(count / maxCount) * 100}%`, backgroundColor: color }}
                  />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
