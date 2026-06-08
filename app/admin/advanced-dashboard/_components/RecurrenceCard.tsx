"use client";

import { Repeat2, ShieldAlert, CalendarRange } from "lucide-react";
import type { RecurrenceItem } from "../_hooks/useAdvancedDashboard";

interface Props {
  items: RecurrenceItem[];
  loading?: boolean;
}

const SECTION_DESC = `Penyulang yang mengalami ≥ 3 gangguan dalam satu jendela 7 hari — indikator masalah kronis.
Ditampilkan window terburuk beserta tanggal dan kategori penyebab masing-masing kejadian.`;

function getSeverityConfig(maxIn7: number) {
  if (maxIn7 >= 6) return { label: "SANGAT KRITIS", headerClass: "bg-red-900/30 border-red-500/40", badgeClass: "bg-red-500 text-white" };
  if (maxIn7 >= 4) return { label: "KRITIS",        headerClass: "bg-orange-900/30 border-orange-500/40", badgeClass: "bg-orange-500 text-white" };
  return               { label: "WASPADA",           headerClass: "bg-amber-900/20 border-amber-500/30",  badgeClass: "bg-amber-500 text-white" };
}

// Warna per kategori agar konsisten
const KATEGORI_COLORS: Record<string, string> = {
  "Binatang":          "bg-emerald-900/30 text-emerald-300 border-emerald-700/40",
  "Layangan":          "bg-sky-900/30 text-sky-300 border-sky-700/40",
  "Pohon / Vegetasi":  "bg-green-900/30 text-green-300 border-green-700/40",
  "Petir / Cuaca":     "bg-blue-900/30 text-blue-300 border-blue-700/40",
  "Kabel / Konduktor": "bg-yellow-900/30 text-yellow-300 border-yellow-700/40",
  "Trafo":             "bg-purple-900/30 text-purple-300 border-purple-700/40",
  "FCO / Fuse":        "bg-pink-900/30 text-pink-300 border-pink-700/40",
  "Tiang":             "bg-orange-900/30 text-orange-300 border-orange-700/40",
  "Overload / Beban":  "bg-red-900/30 text-red-300 border-red-700/40",
  "Hubung Singkat":    "bg-rose-900/30 text-rose-300 border-rose-700/40",
  "Human Error":       "bg-indigo-900/30 text-indigo-300 border-indigo-700/40",
  "Peralatan":         "bg-cyan-900/30 text-cyan-300 border-cyan-700/40",
  "Komponent":         "bg-violet-900/30 text-violet-300 border-violet-700/40",
  "Belum Ditemukan":   "bg-[#1e3552] text-[#94a3b8] border-[#1e3552]",
};

function kategoriColor(k: string) {
  return KATEGORI_COLORS[k] ?? "bg-[#1e3552] text-[#94a3b8] border-[#1e3552]";
}

export default function RecurrenceCard({ items, loading = false }: Props) {
  return (
    <div className="bg-[#162334] rounded-xl border border-[#1e3552] shadow-sm">
      <div className="px-5 pt-5 pb-3">
        <div className="flex items-center gap-3 mb-2">
          <div className="p-2 bg-red-900/20 rounded-lg">
            <Repeat2 className="w-5 h-5 text-red-400" />
          </div>
          <div>
            <h3 className="text-[#e2e8f0] font-bold text-lg">Deteksi Repeat Offender</h3>
            <p className="text-[#94a3b8] text-xs mt-0.5">Penyulang dengan gangguan berulang dalam 7 hari</p>
          </div>
        </div>
        <p className="text-[#94a3b8] text-xs leading-relaxed border-l-2 border-red-500/50 pl-3">{SECTION_DESC}</p>
      </div>

      <div className="px-5 pb-5">
        {loading ? (
          <div className="h-40 flex items-center justify-center">
            <div className="w-8 h-8 border-4 border-[#1e3552] border-t-red-400 rounded-full animate-spin" />
          </div>
        ) : items.length === 0 ? (
          <div className="h-40 flex flex-col items-center justify-center gap-2">
            <ShieldAlert className="w-10 h-10 text-green-400/50" />
            <p className="text-green-400 text-sm font-medium">Tidak ada repeat offender</p>
            <p className="text-[#94a3b8] text-xs">Tidak ada penyulang dengan ≥ 3 gangguan dalam 7 hari</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {items.map((item) => {
              const { label, headerClass, badgeClass } = getSeverityConfig(item.maxIn7Days);
              return (
                <div key={item.penyulang} className={`rounded-xl border overflow-hidden ${headerClass}`}>
                  {/* Header */}
                  <div className="px-4 py-3 flex items-start justify-between gap-2">
                    <div>
                      <p className="font-bold text-[#e2e8f0] text-base">{item.penyulang}</p>
                      <p className="text-[#94a3b8] text-xs mt-0.5">{item.ulp} · {item.count} total gangguan periode ini</p>
                    </div>
                    <span className={`text-[10px] font-bold px-2 py-1 rounded-lg shrink-0 ${badgeClass}`}>
                      {label}
                    </span>
                  </div>

                  {/* Worst window summary */}
                  <div className="mx-4 mb-3 bg-[#0d1b2a]/70 border border-[#1e3552] rounded-lg px-3 py-2 flex items-center gap-2">
                    <CalendarRange className="w-4 h-4 text-amber-400 shrink-0" />
                    <div>
                      <p className="text-amber-300 text-xs font-semibold">
                        Window terburuk: {item.worstWindowLabel}
                      </p>
                      <p className="text-[#94a3b8] text-[10px]">{item.maxIn7Days} gangguan dalam 7 hari</p>
                    </div>
                  </div>

                  {/* Event list in worst window */}
                  <div className="px-4 pb-3 space-y-1.5">
                    {item.worstWindowEvents.map((ev, i) => (
                      <div key={`${ev.date}-${i}`} className="flex items-center gap-2">
                        <span className="text-[#94a3b8] text-[10px] w-4 shrink-0">#{i + 1}</span>
                        <span className="text-[#e2e8f0] text-xs shrink-0 min-w-35">{ev.dateLabel}</span>
                        <span className={`text-[10px] font-medium px-2 py-0.5 rounded border truncate ${kategoriColor(ev.kategori)}`}>
                          {ev.kategori}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
