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
  if (maxIn7 >= 6) return { label: "SANGAT KRITIS", headerClass: "bg-red-100 border-red-500/40", badgeClass: "bg-red-500 text-white" };
  if (maxIn7 >= 4) return { label: "KRITIS",        headerClass: "bg-orange-100 border-orange-500/40", badgeClass: "bg-orange-500 text-white" };
  return               { label: "WASPADA",           headerClass: "bg-amber-50 border-amber-500/30",  badgeClass: "bg-amber-500 text-white" };
}

// Warna per kategori agar konsisten
const KATEGORI_COLORS: Record<string, string> = {
  "Binatang":          "bg-emerald-100 text-emerald-700 border-emerald-700/40",
  "Layangan":          "bg-sky-100 text-sky-700 border-sky-700/40",
  "Pohon / Vegetasi":  "bg-green-100 text-green-700 border-green-700/40",
  "Petir / Cuaca":     "bg-blue-100 text-blue-700 border-blue-700/40",
  "Kabel / Konduktor": "bg-yellow-100 text-yellow-700 border-yellow-700/40",
  "Trafo":             "bg-purple-100 text-purple-700 border-purple-700/40",
  "FCO / Fuse":        "bg-pink-100 text-pink-700 border-pink-700/40",
  "Tiang":             "bg-orange-100 text-orange-700 border-orange-700/40",
  "Overload / Beban":  "bg-red-100 text-red-700 border-red-700/40",
  "Hubung Singkat":    "bg-rose-100 text-rose-700 border-rose-700/40",
  "Human Error":       "bg-indigo-100 text-indigo-700 border-indigo-700/40",
  "Peralatan":         "bg-cyan-100 text-cyan-700 border-cyan-700/40",
  "Komponent":         "bg-violet-100 text-violet-700 border-violet-700/40",
  "Belum Ditemukan":   "bg-line text-ink-soft border-line",
};

function kategoriColor(k: string) {
  return KATEGORI_COLORS[k] ?? "bg-line text-ink-soft border-line";
}

export default function RecurrenceCard({ items, loading = false }: Props) {
  return (
    <div className="bg-white rounded-xl border border-line shadow-sm">
      <div className="px-5 pt-5 pb-3">
        <div className="flex items-center gap-3 mb-2">
          <div className="p-2 bg-red-50 rounded-lg">
            <Repeat2 className="w-5 h-5 text-red-600" />
          </div>
          <div>
            <h3 className="text-ink font-bold text-lg">Deteksi Repeat Offender</h3>
            <p className="text-ink-soft text-xs mt-0.5">Penyulang dengan gangguan berulang dalam 7 hari</p>
          </div>
        </div>
        <p className="text-ink-soft text-xs leading-relaxed border-l-2 border-red-500/50 pl-3">{SECTION_DESC}</p>
      </div>

      <div className="px-5 pb-5">
        {loading ? (
          <div className="h-40 flex items-center justify-center">
            <div className="w-8 h-8 border-4 border-line border-t-red-400 rounded-full animate-spin" />
          </div>
        ) : items.length === 0 ? (
          <div className="h-40 flex flex-col items-center justify-center gap-2">
            <ShieldAlert className="w-10 h-10 text-green-600" />
            <p className="text-green-600 text-sm font-medium">Tidak ada repeat offender</p>
            <p className="text-ink-soft text-xs">Tidak ada penyulang dengan ≥ 3 gangguan dalam 7 hari</p>
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
                      <p className="font-bold text-ink text-base">{item.penyulang}</p>
                      <p className="text-ink-soft text-xs mt-0.5">{item.ulp} · {item.count} total gangguan periode ini</p>
                    </div>
                    <span className={`text-[10px] font-bold px-2 py-1 rounded-lg shrink-0 ${badgeClass}`}>
                      {label}
                    </span>
                  </div>

                  {/* Worst window summary */}
                  <div className="mx-4 mb-3 bg-white border border-line rounded-lg px-3 py-2 flex items-center gap-2">
                    <CalendarRange className="w-4 h-4 text-amber-600 shrink-0" />
                    <div>
                      <p className="text-amber-700 text-xs font-semibold">
                        Window terburuk: {item.worstWindowLabel}
                      </p>
                      <p className="text-ink-soft text-[10px]">{item.maxIn7Days} gangguan dalam 7 hari</p>
                    </div>
                  </div>

                  {/* Event list in worst window */}
                  <div className="px-4 pb-3 space-y-1.5">
                    {item.worstWindowEvents.map((ev, i) => (
                      <div key={`${ev.date}-${i}`} className="flex items-center gap-2">
                        <span className="text-ink-soft text-[10px] w-4 shrink-0">#{i + 1}</span>
                        <span className="text-ink text-xs shrink-0 min-w-35">{ev.dateLabel}</span>
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
