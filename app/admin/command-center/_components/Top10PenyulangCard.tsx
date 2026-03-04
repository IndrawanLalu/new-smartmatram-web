"use client";

import { useMemo } from "react";
import { Zap } from "lucide-react";
import type { GangguanItem } from "../_hooks/useCommandCenter";

interface Props {
  items: GangguanItem[];
  title: string;
  subtitle: string;
}

export default function Top10PenyulangCard({ items, title, subtitle }: Props) {
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
      .map(([penyulang, count], idx) => ({ penyulang, count, rank: idx + 1 }));
  }, [items]);

  const maxCount = top10[0]?.count ?? 1;

  return (
    <div className="bg-white rounded-xl border border-[#E2E8F0] shadow-sm overflow-hidden">
      <div className="bg-linear-to-r from-[#004D40] to-[#00897B] px-4 py-2.5 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Zap size={13} className="text-white/70" />
          <span className="text-white font-semibold text-xs">{title}</span>
          <span className="text-teal-200/80 text-xs">· {subtitle}</span>
        </div>
        <span className="text-white/60 font-mono text-xs">{items.length} data</span>
      </div>

      <div className="px-4 py-3">
        {top10.length === 0 ? (
          <p className="text-center text-xs text-[#9CA3AF] py-3">Tidak ada data</p>
        ) : (
          <div className="space-y-2">
            {top10.map(({ penyulang, count, rank }) => (
              <div key={penyulang} className="flex items-center gap-2">
                <span className="text-[10px] font-mono text-[#9CA3AF] w-4 text-right shrink-0">
                  {rank}
                </span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between mb-0.5">
                    <span className="text-[11px] font-medium text-[#1B2631] truncate">{penyulang}</span>
                    <span className="font-mono text-[11px] font-semibold text-[#1B2631] ml-2 shrink-0">{count}x</span>
                  </div>
                  <div className="h-1 bg-[#F4F6F8] rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full bg-[#00897B] transition-all duration-500"
                      style={{ width: `${(count / maxCount) * 100}%`, opacity: rank === 1 ? 1 : 0.5 + (0.5 * (10 - rank) / 9) }}
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
