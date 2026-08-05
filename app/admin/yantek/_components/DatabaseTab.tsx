"use client";

import { useState, useMemo } from "react";
import { FileJson, CalendarDays, Loader2, X } from "lucide-react";
import { MONTHS_ID, DAY_NAME, type DateSummary, type YantekRow } from "../_lib/yantek";

// Dipisah dari page.tsx (2026-08-05) — isinya sama, warnanya dipindah ke token navy.

interface DatabaseTabProps {
  dates: DateSummary[];
  rowCache: Record<string, YantekRow[]>;
  filterYear: string;
  filterMonth: string;
  onDelete: (date: string) => Promise<void>;
  onSelectMonth: (year: string, month: string) => void;
}



export default function DatabaseTab({ dates, rowCache, filterYear, filterMonth, onDelete, onSelectMonth }: DatabaseTabProps) {
  const [deletingDate, setDeletingDate] = useState<string | null>(null);

  // Kelompokkan dates per tahun-bulan
  const byMonth = useMemo(() => {
    const map = new Map<string, DateSummary[]>();
    for (const d of dates) {
      const key = d.date.slice(0, 7); // YYYY-MM
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(d);
    }
    return [...map.entries()].sort((a, b) => b[0].localeCompare(a[0]));
  }, [dates]);

  // Filter sesuai filterYear + filterMonth
  const visibleMonths = useMemo(() => {
    return byMonth.filter(([key]) => {
      const [y, m] = key.split("-");
      if (filterYear && y !== filterYear) return false;
      if (filterMonth && m !== filterMonth) return false;
      return true;
    });
  }, [byMonth, filterYear, filterMonth]);

  if (dates.length === 0) {
    return (
      <div className="bg-white rounded-xl border border-line py-14 flex flex-col items-center gap-3 text-ink-muted">
        <FileJson className="w-10 h-10 opacity-20" />
        <p className="text-sm font-medium">Belum ada data tersimpan</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {visibleMonths.length === 0 && (
        <div className="bg-white rounded-xl border border-line py-10 flex items-center justify-center text-ink-muted text-sm">
          Tidak ada data untuk periode yang dipilih
        </div>
      )}

      {visibleMonths.map(([monthKey, monthDates]) => {
        const [y, m] = monthKey.split("-");
        const monthLabel = `${MONTHS_ID[parseInt(m) - 1]} ${y}`;
        const totalWO = monthDates.reduce((a, d) => a + d.count, 0);

        return (
          <div key={monthKey} className="bg-white rounded-xl shadow-sm border border-line overflow-hidden">
            {/* Month header */}
            <div className="flex items-center justify-between px-4 py-3 bg-navy-50 border-b border-line">
              <div className="flex items-center gap-2">
                <CalendarDays className="w-4 h-4 text-navy-600" />
                <span className="text-sm font-bold text-navy-700">{monthLabel}</span>
                <span className="text-xs text-navy-600 font-medium">{monthDates.length} tanggal · {totalWO} WO</span>
              </div>
              <button
                onClick={() => onSelectMonth(y, m)}
                className="text-xs px-2.5 py-1 rounded-lg bg-navy-600 text-white hover:bg-navy-700 transition-colors font-semibold"
              >
                Lihat Rekap →
              </button>
            </div>

            {/* Table */}
            <div className="overflow-x-auto">
              <table className="w-full text-xs border-collapse">
                <thead>
                  <tr className="bg-surface">
                    <th className="py-2 px-3 text-left text-ink-soft font-semibold border-b border-line w-8">#</th>
                    <th className="py-2 px-3 text-left text-ink-soft font-semibold border-b border-line">Tanggal</th>
                    <th className="py-2 px-3 text-left text-ink-soft font-semibold border-b border-line">Hari</th>
                    <th className="py-2 px-3 text-center text-ink-soft font-semibold border-b border-line">Jumlah WO</th>
                    <th className="py-2 px-3 text-left text-ink-soft font-semibold border-b border-line">Disimpan</th>
                    <th className="py-2 px-3 text-center text-ink-soft font-semibold border-b border-line">Aksi</th>
                  </tr>
                </thead>
                <tbody>
                  {[...monthDates].sort((a, b) => a.date.localeCompare(b.date)).map((d, i) => {
                    const [dy, dm, dd] = d.date.split("-");
                    const dayName = DAY_NAME[new Date(`${dy}-${dm}-${dd}`).getDay()];
                    const savedAt = d.savedAt ? new Date(d.savedAt) : null;
                    const rows = rowCache[d.date] ?? [];
                    const avgRating = rows.length > 0
                      ? (() => {
                          const rated = rows.filter(r => r.rating != null);
                          if (!rated.length) return null;
                          return rated.reduce((a, r) => a + Number(r.rating), 0) / rated.length;
                        })()
                      : null;

                    return (
                      <tr key={d.date} className={`border-t border-line ${i % 2 === 0 ? "bg-white" : "bg-surface/60"} hover:bg-navy-50/40 transition-colors`}>
                        <td className="py-2.5 px-3 text-ink-muted text-right tabular-nums">{i + 1}</td>
                        <td className="py-2.5 px-3 font-semibold text-ink whitespace-nowrap">
                          {dd}/{dm}/{dy}
                        </td>
                        <td className="py-2.5 px-3 text-ink-soft">{dayName}</td>
                        <td className="py-2.5 px-3 text-center">
                          <span className="font-bold text-ink tabular-nums">{d.count}</span>
                          <span className="text-ink-muted ml-1">WO</span>
                        </td>
                        <td className="py-2.5 px-3 text-ink-muted whitespace-nowrap">
                          {savedAt
                            ? `${savedAt.toLocaleDateString("id-ID", { day:"2-digit", month:"short" })} ${savedAt.toLocaleTimeString("id-ID", { hour:"2-digit", minute:"2-digit" })}`
                            : "—"}
                          {avgRating !== null && (
                            <span className={`ml-2 text-[10px] font-semibold px-1.5 py-0.5 rounded ${avgRating >= 4.5 ? "bg-emerald-50 text-emerald-600" : avgRating >= 3.5 ? "bg-lime-50 text-lime-700" : avgRating >= 2.5 ? "bg-amber-50 text-amber-600" : "bg-red-50 text-red-600"}`}>
                              ★ {avgRating.toFixed(1)}
                            </span>
                          )}
                        </td>
                        <td className="py-2.5 px-3 text-center">
                          <button
                            onClick={async () => {
                              if (!confirm(`Hapus data ${d.label}?`)) return;
                              setDeletingDate(d.date);
                              await onDelete(d.date);
                              setDeletingDate(null);
                            }}
                            disabled={deletingDate === d.date}
                            className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-ink-muted hover:text-red-500 hover:bg-red-50 disabled:opacity-40 transition-colors text-[11px]"
                          >
                            {deletingDate === d.date
                              ? <Loader2 className="w-3 h-3 animate-spin" />
                              : <X className="w-3 h-3" />}
                            Hapus
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 border-line bg-surface">
                    <td colSpan={3} className="py-2 px-3 text-xs font-bold text-ink-soft">Total {monthLabel}</td>
                    <td className="py-2 px-3 text-center text-xs font-bold text-ink">{totalWO} WO</td>
                    <td colSpan={2} />
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        );
      })}
    </div>
  );
}
