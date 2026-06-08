"use client";

import { CalendarDays, Flame, TrendingUp, Sun } from "lucide-react";
import type { TrendPoint } from "../_hooks/useAdvancedDashboard";

interface Props {
  trendPoints: TrendPoint[];
  loading?: boolean;
}

const DAY_LABELS = ["Sen", "Sel", "Rab", "Kam", "Jum", "Sab", "Min"];
const MONTH_LABELS = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];
const COLOR_SCALE = ["#1a2942", "#0c3535", "#0d5045", "#008068", "#00897B", "#34d399"];

function getCellColor(count: number, max: number): string {
  if (count === 0 || max === 0) return COLOR_SCALE[0];
  return COLOR_SCALE[Math.min(5, Math.ceil((count / max) * 5))];
}

export default function CalendarHeatmap({ trendPoints, loading = false }: Props) {
  if (loading) {
    return <div className="bg-[#162334] rounded-xl border border-[#1e3552] h-52 animate-pulse" />;
  }
  if (!trendPoints.length) return null;

  const maxCount = Math.max(...trendPoints.map((tp) => tp.count), 1);
  const totalGangguan = trendPoints.reduce((s, tp) => s + tp.count, 0);
  const activeDays = trendPoints.filter((tp) => tp.count > 0).length;
  const peakDay = trendPoints.reduce(
    (best, tp) => (tp.count > best.count ? tp : best),
    trendPoints[0],
  );
  const avgPerActiveDay = activeDays > 0 ? (totalGangguan / activeDays).toFixed(1) : "0";

  const first = new Date(trendPoints[0].date + "T12:00:00");
  const startOffset = (first.getDay() + 6) % 7;

  type Cell = { date: string; label: string; count: number } | null;
  const cells: Cell[] = [
    ...Array<null>(startOffset).fill(null),
    ...trendPoints.map((tp) => ({ date: tp.date, label: tp.label, count: tp.count })),
  ];
  while (cells.length % 7 !== 0) cells.push(null);
  const numWeeks = cells.length / 7;
  const weeks: Cell[][] = Array.from({ length: numWeeks }, (_, w) =>
    cells.slice(w * 7, w * 7 + 7),
  );

  const monthMarkers: { weekIdx: number; month: number }[] = [];
  trendPoints.forEach((tp, i) => {
    const d = new Date(tp.date + "T12:00:00");
    if (i === 0 || d.getDate() === 1) {
      const weekIdx = Math.floor((startOffset + i) / 7);
      const last = monthMarkers[monthMarkers.length - 1];
      if (!last || last.weekIdx !== weekIdx)
        monthMarkers.push({ weekIdx, month: d.getMonth() });
    }
  });

  const colTemplate = `40px repeat(${numWeeks}, 1fr)`;

  return (
    <div className="bg-[#162334] rounded-xl border border-[#1e3552] shadow-sm p-5 space-y-5">

      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-teal-900/20 rounded-lg shrink-0">
            <CalendarDays className="w-5 h-5 text-teal-400" />
          </div>
          <div>
            <h3 className="text-[#e2e8f0] font-bold text-lg leading-tight">Calendar Heatmap Gangguan</h3>
            <p className="text-[#94a3b8] text-xs mt-0.5">Intensitas gangguan per hari sepanjang periode</p>
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="text-[#94a3b8] text-[10px]">Sedikit</span>
          {COLOR_SCALE.map((hex, i) => (
            <div key={i} className="w-3.5 h-3.5 rounded-sm" style={{ backgroundColor: hex }} />
          ))}
          <span className="text-[#94a3b8] text-[10px]">Banyak</span>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-[#0d1b2a] border border-[#1e3552] rounded-xl px-4 py-3 flex items-center gap-3">
          <Sun className="w-5 h-5 text-[#00897B] shrink-0" />
          <div>
            <p className="text-[#e2e8f0] font-bold text-xl">{activeDays}</p>
            <p className="text-[#94a3b8] text-xs">hari ada gangguan</p>
          </div>
        </div>
        <div className="bg-red-900/20 border border-red-700/30 rounded-xl px-4 py-3 flex items-center gap-3">
          <Flame className="w-5 h-5 text-red-400 shrink-0" />
          <div>
            <p className="text-red-400 font-bold text-xl">{peakDay.count}</p>
            <p className="text-[#94a3b8] text-xs">puncak {peakDay.label}</p>
          </div>
        </div>
        <div className="bg-amber-900/20 border border-amber-700/30 rounded-xl px-4 py-3 flex items-center gap-3">
          <TrendingUp className="w-5 h-5 text-amber-400 shrink-0" />
          <div>
            <p className="text-amber-400 font-bold text-xl">{avgPerActiveDay}</p>
            <p className="text-[#94a3b8] text-xs">rata-rata / hari aktif</p>
          </div>
        </div>
      </div>

      {/* Calendar grid — full width, dynamic 1fr per week */}
      <div className="space-y-0.75">
        {/* Month labels */}
        <div className="grid" style={{ gridTemplateColumns: colTemplate }}>
          <div />
          {Array.from({ length: numWeeks }, (_, w) => {
            const marker = monthMarkers.find((m) => m.weekIdx === w);
            return (
              <div key={w} className="text-[9px] text-[#94a3b8] text-center overflow-visible whitespace-nowrap pb-1">
                {marker ? MONTH_LABELS[marker.month] : ""}
              </div>
            );
          })}
        </div>

        {/* Day rows */}
        {Array.from({ length: 7 }, (_, day) => (
          <div
            key={day}
            className="grid items-center gap-x-0.75"
            style={{ gridTemplateColumns: colTemplate }}
          >
            <span className="text-[9px] text-[#94a3b8] text-right pr-2 leading-none select-none">
              {day % 2 === 0 ? DAY_LABELS[day] : ""}
            </span>
            {Array.from({ length: numWeeks }, (_, week) => {
              const cell = weeks[week][day];
              return (
                <div
                  key={week}
                  title={cell ? `${cell.date}: ${cell.count} gangguan` : undefined}
                  className="h-4 w-full rounded-sm cursor-default hover:opacity-70 transition-opacity"
                  style={{ backgroundColor: cell ? getCellColor(cell.count, maxCount) : COLOR_SCALE[0] }}
                />
              );
            })}
          </div>
        ))}
      </div>

    </div>
  );
}
