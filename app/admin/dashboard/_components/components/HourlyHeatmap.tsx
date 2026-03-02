"use client";

import { useMemo } from "react";
import { Clock, Sun, Moon } from "lucide-react";

interface HourlyHeatmapProps {
  hourlyCount?: number[];
  loading?: boolean;
}

const INTENSITY_COLORS: Record<number, string> = {
  0: "#E2E8F0",
  1: "rgba(34,197,94,0.25)",
  2: "rgba(34,197,94,0.5)",
  3: "rgba(251,191,36,0.7)",
  4: "rgba(249,115,22,0.85)",
  5: "rgba(239,68,68,1)",
};

function getIntensity(count: number, maxCount: number) {
  if (count === 0) return 0;
  const r = count / maxCount;
  if (r > 0.8) return 5;
  if (r > 0.6) return 4;
  if (r > 0.4) return 3;
  if (r > 0.2) return 2;
  return 1;
}

function getTimePeriod(hour: number) {
  if (hour >= 6 && hour < 12) return "Pagi";
  if (hour >= 12 && hour < 18) return "Siang";
  if (hour >= 18) return "Malam";
  return "Dini Hari";
}

export default function HourlyHeatmap({ hourlyCount = [], loading = false }: HourlyHeatmapProps) {
  const safe = useMemo(() => {
    if (!Array.isArray(hourlyCount) || hourlyCount.length !== 24) return Array(24).fill(0) as number[];
    return hourlyCount;
  }, [hourlyCount]);

  const maxCount = useMemo(() => Math.max(...safe, 1), [safe]);

  const peakHours = useMemo(() =>
    safe
      .map((count, hour) => ({ hour, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 3)
      .filter((i) => i.count > 0),
    [safe]
  );

  const timePeriodStats = useMemo(() => {
    const stats: Record<string, number> = { "Dini Hari": 0, Pagi: 0, Siang: 0, Malam: 0 };
    safe.forEach((count, h) => { stats[getTimePeriod(h)] += count; });
    return stats;
  }, [safe]);

  const hasData = safe.some((c) => c > 0);

  if (loading) {
    return (
      <div className="bg-white rounded-xl border border-[#E2E8F0] shadow-sm">
        <div className="h-64 flex items-center justify-center">
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
            <div className="p-2 bg-blue-50 rounded-lg">
              <Clock className="w-5 h-5 text-blue-600" />
            </div>
            <div>
              <h3 className="text-[#1B2631] text-lg font-bold">24-Hour Pattern</h3>
              <p className="text-[#5D6D7E] text-xs mt-1">Distribusi gangguan per jam</p>
            </div>
          </div>
          {peakHours.length > 0 && (
            <div className="text-right">
              <p className="text-2xl font-bold text-red-600">
                {String(peakHours[0].hour).padStart(2, "0")}:00
              </p>
              <p className="text-[#5D6D7E] text-xs">Peak hour</p>
            </div>
          )}
        </div>
      </div>

      <div className="px-5 pb-5">
        {!hasData ? (
          <div className="h-48 flex items-center justify-center">
            <p className="text-[#94A3B8]">Tidak ada data hourly</p>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="grid grid-cols-12 gap-2">
              {safe.map((count, hour) => {
                const intensity = getIntensity(count, maxCount);
                return (
                  <div
                    key={hour}
                    className="group relative aspect-square rounded-lg cursor-pointer transition-all duration-200 hover:scale-110 hover:shadow-lg"
                    style={{ backgroundColor: INTENSITY_COLORS[intensity] }}
                  >
                    <div className="absolute inset-0 flex items-center justify-center">
                      <span className={`text-[10px] font-bold ${intensity >= 4 ? "text-white/90" : "text-[#5D6D7E]"}`}>
                        {String(hour).padStart(2, "0")}
                      </span>
                    </div>
                    <div className="absolute bottom-full mb-2 left-1/2 -translate-x-1/2 hidden group-hover:block z-10">
                      <div className="bg-slate-900/95 border border-white/20 rounded-lg px-3 py-2 shadow-xl whitespace-nowrap">
                        <p className="text-white font-bold text-sm">
                          {String(hour).padStart(2, "0")}:00 — {String(hour + 1).padStart(2, "0")}:00
                        </p>
                        <p className="text-emerald-300 text-xs">{count} gangguan</p>
                        <p className="text-white/60 text-xs">{getTimePeriod(hour)}</p>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="flex items-center gap-4">
              <span className="text-[#5D6D7E] text-xs">Intensitas:</span>
              <div className="flex gap-2">
                {[0, 1, 2, 3, 4, 5].map((level) => (
                  <div
                    key={level}
                    className="w-6 h-6 rounded border border-[#E2E8F0]"
                    style={{ backgroundColor: INTENSITY_COLORS[level] }}
                  />
                ))}
              </div>
              <span className="text-[#94A3B8] text-xs ml-auto">0 → {maxCount} gangguan</span>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {[
                { label: "Dini Hari", time: "00:00 - 06:00", icon: <Moon className="w-4 h-4 text-blue-600" /> },
                { label: "Pagi", time: "06:00 - 12:00", icon: <Sun className="w-4 h-4 text-yellow-600" /> },
                { label: "Siang", time: "12:00 - 18:00", icon: <Sun className="w-4 h-4 text-orange-500" /> },
                { label: "Malam", time: "18:00 - 24:00", icon: <Moon className="w-4 h-4 text-[#00897B]" /> },
              ].map(({ label, time, icon }) => (
                <div key={label} className="bg-[#F4F6F8] rounded-lg p-3 border border-[#E2E8F0]">
                  <div className="flex items-center gap-2 mb-1">{icon}<span className="text-[#5D6D7E] text-xs">{label}</span></div>
                  <p className="text-[#1B2631] font-bold text-lg">{timePeriodStats[label]}</p>
                  <p className="text-[#94A3B8] text-xs">{time}</p>
                </div>
              ))}
            </div>

            {peakHours.length > 0 && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-3">
                <p className="text-red-700 font-medium text-sm mb-2">🔥 Peak Hours:</p>
                <div className="space-y-1">
                  {peakHours.map((item, i) => (
                    <div key={i} className="flex items-center justify-between text-xs">
                      <span className="text-[#1B2631]">#{i + 1} • {String(item.hour).padStart(2, "0")}:00</span>
                      <span className="text-red-600 font-bold">{item.count} gangguan</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
