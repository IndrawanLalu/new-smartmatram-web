"use client";

import { useMemo, useState } from "react";
import { ChevronUp, ChevronDown, ChevronsUpDown, Search, X } from "lucide-react";
import { CARD, FIELD } from "@/app/admin/_ui";
import { STAR_BG, STAR_TEXT, type PetugasStat, type SortDir } from "../_lib/yantek";

interface RekapTabProps {
  stats: PetugasStat[];
  grandTotal: { totalWO: number; rTotals: number[]; avgRating: number | null };
}

function Th({ label, k, sortKey, sortDir, onSort, center }: {
  label: string; k: string; sortKey: string; sortDir: SortDir;
  onSort: (k: string) => void; center?: boolean;
}) {
  return (
    <th
      onClick={() => onSort(k)}
      className="py-2.5 px-3 bg-navy-50 text-navy-600 font-semibold border-b border-line cursor-pointer hover:bg-navy-100 transition-colors whitespace-nowrap select-none"
    >
      <div className={`flex items-center gap-1 ${center ? "justify-center" : ""}`}>
        <span>{label}</span>
        {sortKey === k
          ? sortDir === "asc"
            ? <ChevronUp className="w-3 h-3 text-navy-600" />
            : <ChevronDown className="w-3 h-3 text-navy-600" />
          : <ChevronsUpDown className="w-3 h-3 text-ink-muted" />}
      </div>
    </th>
  );
}

export default function RekapTab({ stats, grandTotal }: RekapTabProps) {
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState("totalWO");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  const filteredStats = useMemo(() => {
    const s = search.trim()
      ? stats.filter((x) => x.petugas.toLowerCase().includes(search.toLowerCase()))
      : [...stats];
    s.sort((a, b) => {
      let diff = 0;
      if (sortKey === "petugas") diff = a.petugas.localeCompare(b.petugas);
      else if (sortKey === "avgRating") diff = (a.avgRating ?? -1) - (b.avgRating ?? -1);
      else if (sortKey.startsWith("r") && sortKey.length === 2)
        diff = a.r[parseInt(sortKey[1])] - b.r[parseInt(sortKey[1])];
      else diff =
        ((a as unknown as Record<string, number>)[sortKey] ?? 0) -
        ((b as unknown as Record<string, number>)[sortKey] ?? 0);
      return sortDir === "asc" ? diff : -diff;
    });
    return s;
  }, [stats, search, sortKey, sortDir]);

  function handleSort(k: string) {
    if (sortKey !== k) { setSortKey(k); setSortDir("desc"); return; }
    setSortDir((d) => (d === "desc" ? "asc" : "desc"));
  }

  return (
    <div className={`${CARD} overflow-hidden`}>
      <div className="flex items-center gap-3 px-4 py-3 border-b border-line">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-ink-muted" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Cari nama petugas..."
            className={`${FIELD} pl-8 w-56 text-xs`}
          />
        </div>
        {search && (
          <button onClick={() => setSearch("")} className="p-1 rounded text-ink-muted hover:text-ink">
            <X className="w-3 h-3" />
          </button>
        )}
        <span className="text-xs text-ink-muted ml-auto">{filteredStats.length} petugas</span>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-xs border-collapse">
          <thead className="sticky top-0 z-10">
            <tr>
              <th className="py-2.5 px-3 text-left bg-navy-50 text-navy-600 font-semibold border-b border-line w-8">#</th>
              <Th label="Nama Petugas" k="petugas" {...{ sortKey, sortDir, onSort: handleSort }} />
              <Th label="Total WO" k="totalWO" {...{ sortKey, sortDir, onSort: handleSort }} center />
              {[1, 2, 3, 4, 5].map((s) => (
                <Th key={s} label={`★${s}`} k={`r${s}`} {...{ sortKey, sortDir, onSort: handleSort }} center />
              ))}
              <Th label="Avg ★" k="avgRating" {...{ sortKey, sortDir, onSort: handleSort }} center />
            </tr>
          </thead>
          <tbody>
            {filteredStats.map((s, i) => {
              const isWarn = s.r[1] > 0 || s.r[2] > 0;
              return (
                <tr key={s.petugas} className={`border-t border-line transition-colors ${isWarn ? "bg-red-50 hover:bg-red-100/70" : "hover:bg-surface"}`}>
                  <td className="py-2.5 px-3 text-ink-muted text-right tabular-nums">{i + 1}</td>
                  <td className={`py-2.5 px-3 font-semibold whitespace-nowrap ${isWarn ? "text-red-700" : "text-ink"}`}>{s.petugas}</td>
                  <td className="py-2.5 px-3 text-center font-mono font-bold text-ink">{s.totalWO}</td>
                  {[1, 2, 3, 4, 5].map((si) => {
                    const cnt = s.r[si];
                    const pct = s.totalWO > 0 ? (cnt / s.totalWO) * 100 : 0;
                    return (
                      <td key={si} className="py-2 px-2 text-center">
                        {cnt > 0 ? (
                          <div className="flex items-center justify-center gap-1">
                            <span className={`inline-block min-w-5.5 px-1.5 py-0.5 rounded font-bold text-[11px] ${STAR_TEXT[si]}`} style={{ backgroundColor: STAR_BG[si] }}>{cnt}</span>
                            <span className="text-[10px] text-ink-muted tabular-nums">{pct.toFixed(0)}%</span>
                          </div>
                        ) : <span className="text-ink-muted">—</span>}
                      </td>
                    );
                  })}
                  <td className="py-2.5 px-3 text-center">
                    {s.avgRating !== null
                      ? <span className={`font-bold text-sm ${s.avgRating >= 4.5 ? "text-emerald-600" : s.avgRating >= 3.5 ? "text-lime-600" : s.avgRating >= 2.5 ? "text-amber-600" : "text-red-600"}`}>
                          {s.avgRating.toFixed(2)}
                        </span>
                      : <span className="text-ink-muted">—</span>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="border-t-2 border-line px-4 py-2.5 flex items-center gap-6 text-xs text-ink-soft bg-surface flex-wrap">
        <span className="font-bold text-ink">Total</span>
        <span>
          <span className="font-bold text-ink tabular-nums">{grandTotal.totalWO}</span>
          <span className="text-ink-muted ml-1">WO</span>
        </span>
        {[1, 2, 3, 4, 5].map((si) => {
          const cnt = grandTotal.rTotals[si];
          const pct = grandTotal.totalWO > 0 ? (cnt / grandTotal.totalWO) * 100 : 0;
          return cnt > 0 ? (
            <span key={si} className="flex items-center gap-1">
              <span className={`font-bold tabular-nums ${STAR_TEXT[si]}`}>{cnt}</span>
              <span className="text-ink-muted">★{si}</span>
              <span className="text-ink-muted text-[10px]">({pct.toFixed(0)}%)</span>
            </span>
          ) : null;
        })}
        {grandTotal.avgRating !== null && (
          <span className="ml-auto">
            Avg: <span className="font-bold text-ink">{grandTotal.avgRating.toFixed(2)}</span> ★
          </span>
        )}
      </div>
    </div>
  );
}
