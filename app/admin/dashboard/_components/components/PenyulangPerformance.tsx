"use client";

import { useMemo, useState } from "react";
import { Trophy, TrendingDown, TrendingUp, Award, AlertCircle } from "lucide-react";

interface PenyulangPerformanceProps {
  penyulangCount?: Record<string, number>;
  loading?: boolean;
}

export default function PenyulangPerformance({
  penyulangCount = {},
  loading = false,
}: PenyulangPerformanceProps) {
  const [sortBy, setSortBy] = useState<"worst" | "best">("worst");
  const [showCount, setShowCount] = useState(10);

  const totalGangguan = useMemo(
    () => Object.values(penyulangCount).reduce((s, c) => s + c, 0),
    [penyulangCount]
  );

  const penyulangData = useMemo(() => {
    return Object.entries(penyulangCount)
      .sort((a, b) => sortBy === "worst" ? b[1] - a[1] : a[1] - b[1])
      .slice(0, showCount)
      .map(([name, count], i) => ({ rank: i + 1, name, count }));
  }, [penyulangCount, sortBy, showCount]);

  function getPerformanceClass(count: number) {
    const pct = totalGangguan > 0 ? (count / totalGangguan) * 100 : 0;
    if (pct > 10) return "text-red-600 bg-red-50";
    if (pct > 5) return "text-yellow-700 bg-yellow-50";
    return "text-green-600 bg-green-50";
  }

  function getRankBadge(rank: number): string | number {
    if (sortBy === "best") {
      if (rank === 1) return "🥇";
      if (rank === 2) return "🥈";
      if (rank === 3) return "🥉";
    } else if (rank <= 3) return "⚠️";
    return rank;
  }

  const borderColors = sortBy === "worst"
    ? ["border-l-red-500", "border-l-orange-500", "border-l-yellow-400"]
    : ["border-l-green-500", "border-l-emerald-400", "border-l-emerald-300"];

  if (loading) {
    return (
      <div className="bg-white rounded-xl border border-[#E2E8F0] shadow-sm">
        <div className="h-96 flex items-center justify-center">
          <div className="w-8 h-8 border-4 border-[#E2E8F0] border-t-[#00897B] rounded-full animate-spin" />
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl border border-[#E2E8F0] shadow-sm hover:shadow-md transition-shadow">
      <div className="px-5 pt-5 pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-[#E0F2F1] rounded-lg">
              <Trophy className="w-5 h-5 text-[#00897B]" />
            </div>
            <div>
              <h3 className="text-[#1B2631] text-lg font-bold">Penyulang Performance</h3>
              <p className="text-[#5D6D7E] text-xs mt-1">
                {sortBy === "worst" ? "Penyulang bermasalah" : "Penyulang terbaik"}
              </p>
            </div>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => setSortBy("worst")}
              className={`px-3 py-1 text-xs rounded-lg flex items-center gap-1 transition-all ${
                sortBy === "worst" ? "bg-red-500 text-white" : "bg-[#F4F6F8] text-[#5D6D7E] hover:bg-[#E0F2F1]"
              }`}
            >
              <TrendingDown className="w-3 h-3" /> Terburuk
            </button>
            <button
              onClick={() => setSortBy("best")}
              className={`px-3 py-1 text-xs rounded-lg flex items-center gap-1 transition-all ${
                sortBy === "best" ? "bg-green-600 text-white" : "bg-[#F4F6F8] text-[#5D6D7E] hover:bg-[#E0F2F1]"
              }`}
            >
              <TrendingUp className="w-3 h-3" /> Terbaik
            </button>
          </div>
        </div>
      </div>

      <div className="px-5 pb-5">
        {penyulangData.length === 0 ? (
          <div className="h-64 flex items-center justify-center">
            <p className="text-[#94A3B8]">Tidak ada data penyulang</p>
          </div>
        ) : (
          <div className="space-y-3">
            {sortBy === "worst" && penyulangData[0]?.count > 10 && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-3 flex items-start gap-3">
                <AlertCircle className="w-5 h-5 text-red-500 shrink-0 mt-0.5" />
                <div>
                  <p className="text-red-600 font-medium text-sm">Perhatian Khusus</p>
                  <p className="text-[#5D6D7E] text-xs mt-1">
                    {penyulangData[0].name} memiliki {penyulangData[0].count} gangguan — perlu investigasi mendalam
                  </p>
                </div>
              </div>
            )}

            {sortBy === "best" && penyulangData[0]?.count <= 3 && (
              <div className="bg-green-50 border border-green-200 rounded-lg p-3 flex items-start gap-3">
                <Award className="w-5 h-5 text-green-600 shrink-0 mt-0.5" />
                <div>
                  <p className="text-green-700 font-medium text-sm">Performa Excellent</p>
                  <p className="text-[#5D6D7E] text-xs mt-1">
                    {penyulangData[0].name} hanya {penyulangData[0].count} gangguan — maintain this!
                  </p>
                </div>
              </div>
            )}

            <div className="space-y-2">
              {penyulangData.map((item, i) => {
                const pct = totalGangguan > 0 ? ((item.count / totalGangguan) * 100).toFixed(1) : "0";
                const perfClass = getPerformanceClass(item.count);
                const borderClass = i < 3 ? `border-l-4 ${borderColors[i]}` : "";
                return (
                  <div
                    key={i}
                    className={`bg-[#F4F6F8] hover:bg-[#E0F2F1] border border-[#E2E8F0] rounded-lg p-3 transition-all duration-200 hover:scale-[1.01] ${borderClass}`}
                  >
                    <div className="flex items-center gap-3">
                      <div className={`shrink-0 w-10 h-10 rounded-lg ${perfClass} flex items-center justify-center font-bold text-lg`}>
                        {getRankBadge(item.rank)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-[#1B2631] font-medium text-sm truncate">{item.name}</p>
                        <p className="text-[#5D6D7E] text-xs mt-0.5">{item.count} gangguan • {pct}% dari total</p>
                      </div>
                      <div className={`shrink-0 px-3 py-1 rounded-full ${perfClass} font-bold`}>{item.count}</div>
                    </div>
                    <div className="mt-2 bg-[#E2E8F0] rounded-full h-1.5 overflow-hidden">
                      <div
                        className={`h-full transition-all duration-500 ${sortBy === "worst" ? (parseFloat(pct) > 10 ? "bg-red-500" : parseFloat(pct) > 5 ? "bg-yellow-500" : "bg-green-500") : "bg-green-500"}`}
                        style={{ width: `${Math.min(parseFloat(pct) * 2, 100)}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>

            {Object.keys(penyulangCount).length > showCount && (
              <button
                onClick={() => setShowCount((p) => p + 10)}
                className="w-full py-2 bg-[#F4F6F8] hover:bg-[#E0F2F1] border border-[#E2E8F0] rounded-lg text-[#5D6D7E] text-xs transition-all"
              >
                Tampilkan Lebih Banyak ({Object.keys(penyulangCount).length - showCount} lainnya)
              </button>
            )}

            <div className="grid grid-cols-3 gap-3 pt-4 border-t border-[#E2E8F0]">
              {[
                { label: "Total Penyulang", value: Object.keys(penyulangCount).length },
                { label: "Total Gangguan", value: totalGangguan },
                { label: "Avg per Penyulang", value: Object.keys(penyulangCount).length > 0 ? Math.round(totalGangguan / Object.keys(penyulangCount).length) : 0 },
              ].map(({ label, value }) => (
                <div key={label} className="text-center">
                  <p className="text-[#5D6D7E] text-xs mb-1">{label}</p>
                  <p className="text-[#1B2631] font-bold text-xl">{value}</p>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
