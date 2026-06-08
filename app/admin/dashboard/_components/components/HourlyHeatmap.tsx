"use client";

import { useMemo, useState } from "react";
import { Clock, Sun, Moon, CalendarDays } from "lucide-react";

interface HourlyHeatmapProps {
  hourlyCount?: number[];
  dailyCount?: number[];
  loading?: boolean;
}

const INTENSITY_COLORS: Record<number, string> = {
  0: "#1e3552",
  1: "rgba(34,197,94,0.25)",
  2: "rgba(34,197,94,0.5)",
  3: "rgba(251,191,36,0.7)",
  4: "rgba(249,115,22,0.85)",
  5: "rgba(239,68,68,1)",
};

const DAY_NAMES = ["Sen", "Sel", "Rab", "Kam", "Jum", "Sab", "Min"];
const DAY_FULL  = ["Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu", "Minggu"];

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

export default function HourlyHeatmap({ hourlyCount = [], dailyCount = [], loading = false }: HourlyHeatmapProps) {
  const [tab, setTab] = useState<"hour" | "day">("hour");

  const safe = useMemo(() => {
    if (!Array.isArray(hourlyCount) || hourlyCount.length !== 24) return Array(24).fill(0) as number[];
    return hourlyCount;
  }, [hourlyCount]);

  const safeDaily = useMemo(() => {
    if (!Array.isArray(dailyCount) || dailyCount.length !== 7) return Array(7).fill(0) as number[];
    return dailyCount;
  }, [dailyCount]);

  const maxCount      = useMemo(() => Math.max(...safe, 1), [safe]);
  const maxDailyCount = useMemo(() => Math.max(...safeDaily, 1), [safeDaily]);

  const peakHours = useMemo(() =>
    safe.map((count, hour) => ({ hour, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 3)
      .filter((i) => i.count > 0),
    [safe]
  );

  const peakDays = useMemo(() =>
    safeDaily.map((count, idx) => ({ idx, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 3)
      .filter((i) => i.count > 0),
    [safeDaily]
  );

  const timePeriodStats = useMemo(() => {
    const stats: Record<string, number> = { "Dini Hari": 0, Pagi: 0, Siang: 0, Malam: 0 };
    safe.forEach((count, h) => { stats[getTimePeriod(h)] += count; });
    return stats;
  }, [safe]);

  const weekdayWeekendStats = useMemo(() => ({
    weekday: safeDaily.slice(0, 5).reduce((a, b) => a + b, 0),
    weekend: safeDaily.slice(5).reduce((a, b) => a + b, 0),
  }), [safeDaily]);

  const hasHourData  = safe.some((c) => c > 0);
  const hasDayData   = safeDaily.some((c) => c > 0);

  if (loading) {
    return (
      <div className="bg-[#162334] rounded-xl border border-[#1e3552] shadow-sm">
        <div className="h-64 flex items-center justify-center">
          <div className="w-8 h-8 border-4 border-[#1e3552] border-t-[#00897B] rounded-full animate-spin" />
        </div>
      </div>
    );
  }

  return (
    <div className="bg-[#162334] rounded-xl border border-[#1e3552] shadow-sm hover:shadow-md transition-shadow">
      <div className="px-5 pt-5 pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-900/20 rounded-lg">
              {tab === "hour" ? <Clock className="w-5 h-5 text-blue-400" /> : <CalendarDays className="w-5 h-5 text-blue-400" />}
            </div>
            <div>
              <h3 className="text-[#e2e8f0] text-lg font-bold">
                {tab === "hour" ? "24-Hour Pattern" : "Day Pattern"}
              </h3>
              <p className="text-[#94a3b8] text-xs mt-1">
                {tab === "hour" ? "Distribusi gangguan per jam" : "Distribusi gangguan per hari"}
              </p>
            </div>
          </div>
          <div className="flex gap-1">
            <button
              onClick={() => setTab("hour")}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                tab === "hour"
                  ? "bg-blue-500 text-white"
                  : "bg-[#0d1b2a] text-[#94a3b8] hover:bg-[#1e3552]"
              }`}
            >
              Per Jam
            </button>
            <button
              onClick={() => setTab("day")}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                tab === "day"
                  ? "bg-blue-500 text-white"
                  : "bg-[#0d1b2a] text-[#94a3b8] hover:bg-[#1e3552]"
              }`}
            >
              Per Hari
            </button>
          </div>
        </div>
      </div>

      <div className="px-5 pb-5">
        {/* ── Hour tab ── */}
        {tab === "hour" && (
          !hasHourData ? (
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
                        <span className={`text-[10px] font-bold ${intensity >= 4 ? "text-white/90" : "text-[#94a3b8]"}`}>
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
                <span className="text-[#94a3b8] text-xs">Intensitas:</span>
                <div className="flex gap-2">
                  {[0, 1, 2, 3, 4, 5].map((level) => (
                    <div
                      key={level}
                      className="w-6 h-6 rounded border border-[#1e3552]"
                      style={{ backgroundColor: INTENSITY_COLORS[level] }}
                    />
                  ))}
                </div>
                <span className="text-[#94A3B8] text-xs ml-auto">0 → {maxCount} gangguan</span>
              </div>

              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {[
                  { label: "Dini Hari", time: "00:00 - 06:00", icon: <Moon className="w-4 h-4 text-blue-400" /> },
                  { label: "Pagi",      time: "06:00 - 12:00", icon: <Sun className="w-4 h-4 text-yellow-400" /> },
                  { label: "Siang",     time: "12:00 - 18:00", icon: <Sun className="w-4 h-4 text-orange-400" /> },
                  { label: "Malam",     time: "18:00 - 24:00", icon: <Moon className="w-4 h-4 text-[#00897B]" /> },
                ].map(({ label, time, icon }) => (
                  <div key={label} className="bg-[#0d1b2a] rounded-lg p-3 border border-[#1e3552]">
                    <div className="flex items-center gap-2 mb-1">{icon}<span className="text-[#94a3b8] text-xs">{label}</span></div>
                    <p className="text-[#e2e8f0] font-bold text-lg">{timePeriodStats[label]}</p>
                    <p className="text-[#94A3B8] text-xs">{time}</p>
                  </div>
                ))}
              </div>

              {peakHours.length > 0 && (
                <div className="bg-red-900/20 border border-red-700/30 rounded-lg p-3">
                  <p className="text-red-300 font-medium text-sm mb-2">🔥 Peak Hours:</p>
                  <div className="space-y-1">
                    {peakHours.map((item, i) => (
                      <div key={i} className="flex items-center justify-between text-xs">
                        <span className="text-[#e2e8f0]">#{i + 1} • {String(item.hour).padStart(2, "0")}:00</span>
                        <span className="text-red-400 font-bold">{item.count} gangguan</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )
        )}

        {/* ── Day tab ── */}
        {tab === "day" && (
          !hasDayData ? (
            <div className="h-48 flex items-center justify-center">
              <p className="text-[#94A3B8]">Tidak ada data harian</p>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="grid grid-cols-7 gap-2">
                {safeDaily.map((count, idx) => {
                  const intensity = getIntensity(count, maxDailyCount);
                  const isWeekend = idx >= 5;
                  return (
                    <div
                      key={idx}
                      className="group relative rounded-xl cursor-pointer transition-all duration-200 hover:scale-105 hover:shadow-lg"
                      style={{ backgroundColor: INTENSITY_COLORS[intensity] }}
                    >
                      <div className="flex flex-col items-center justify-center py-5 gap-1">
                        <span className={`text-[11px] font-semibold ${isWeekend ? "text-amber-300" : intensity >= 4 ? "text-white/80" : "text-[#94a3b8]"}`}>
                          {DAY_NAMES[idx]}
                        </span>
                        <span className={`text-xl font-bold ${intensity >= 4 ? "text-white" : "text-[#e2e8f0]"}`}>
                          {count}
                        </span>
                      </div>
                      <div className="absolute bottom-full mb-2 left-1/2 -translate-x-1/2 hidden group-hover:block z-10">
                        <div className="bg-slate-900/95 border border-white/20 rounded-lg px-3 py-2 shadow-xl whitespace-nowrap">
                          <p className="text-white font-bold text-sm">{DAY_FULL[idx]}</p>
                          <p className="text-emerald-300 text-xs">{count} gangguan</p>
                          <p className="text-white/60 text-xs">{isWeekend ? "Hari libur" : "Hari kerja"}</p>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="flex items-center gap-4">
                <span className="text-[#94a3b8] text-xs">Intensitas:</span>
                <div className="flex gap-2">
                  {[0, 1, 2, 3, 4, 5].map((level) => (
                    <div
                      key={level}
                      className="w-6 h-6 rounded border border-[#1e3552]"
                      style={{ backgroundColor: INTENSITY_COLORS[level] }}
                    />
                  ))}
                </div>
                <span className="text-[#94A3B8] text-xs ml-auto">0 → {maxDailyCount} gangguan</span>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="bg-[#0d1b2a] rounded-lg p-3 border border-[#1e3552]">
                  <p className="text-[#94a3b8] text-xs mb-1">Hari Kerja (Sen–Jum)</p>
                  <p className="text-[#e2e8f0] font-bold text-2xl">{weekdayWeekendStats.weekday}</p>
                  <p className="text-[#94A3B8] text-xs">total gangguan</p>
                </div>
                <div className="bg-[#0d1b2a] rounded-lg p-3 border border-[#1e3552]">
                  <p className="text-amber-400 text-xs mb-1">Hari Libur (Sab–Min)</p>
                  <p className="text-[#e2e8f0] font-bold text-2xl">{weekdayWeekendStats.weekend}</p>
                  <p className="text-[#94A3B8] text-xs">total gangguan</p>
                </div>
              </div>

              {peakDays.length > 0 && (
                <div className="bg-red-900/20 border border-red-700/30 rounded-lg p-3">
                  <p className="text-red-300 font-medium text-sm mb-2">🔥 Peak Days:</p>
                  <div className="space-y-1">
                    {peakDays.map((item, i) => (
                      <div key={i} className="flex items-center justify-between text-xs">
                        <span className="text-[#e2e8f0]">#{i + 1} • {DAY_FULL[item.idx]}</span>
                        <span className="text-red-400 font-bold">{item.count} gangguan</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )
        )}
      </div>
    </div>
  );
}
