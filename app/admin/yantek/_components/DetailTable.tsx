"use client";

import { useState, useMemo } from "react";
import { Search, X } from "lucide-react";
import { DETAIL_COLS, STAR_TEXT, STAR_BG, type YantekRow } from "../_lib/yantek";

// Dipisah dari page.tsx (2026-08-05) — isinya sama, warnanya dipindah ke token navy.

export default function DetailTable({ rows }: { rows: YantekRow[] }) {
  const [search, setSearch] = useState("");
  const cols = DETAIL_COLS.filter(c => rows.some(r => r[c] !== undefined));

  const filtered = useMemo(() => {
    if (!search.trim()) return rows;
    const q = search.toLowerCase();
    return rows.filter(r => cols.some(c => String(r[c] ?? "").toLowerCase().includes(q)));
  }, [rows, cols, search]);

  return (
    <div className="bg-white rounded-xl shadow-sm border border-line overflow-hidden">
      <div className="flex items-center gap-3 px-4 py-3 border-b border-line">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-ink-muted" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Cari..."
            className="pl-8 pr-3 py-1.5 text-xs border border-line rounded-lg focus:outline-none focus:border-navy-500 w-52 text-ink placeholder-ink-muted" />
        </div>
        {search && <button onClick={() => setSearch("")} className="p-1 rounded text-ink-muted hover:text-ink"><X className="w-3 h-3" /></button>}
        <span className="text-xs text-ink-muted ml-auto">{filtered.length} baris</span>
      </div>
      <div className="overflow-auto max-h-[60vh]">
        <table className="w-full text-xs border-collapse">
          <thead className="sticky top-0 z-10">
            <tr>
              <th className="py-2.5 px-3 text-left bg-navy-50 text-navy-600 font-semibold border-b border-line w-8">#</th>
              {cols.map(c => (
                <th key={c as string} className="py-2.5 px-3 text-left bg-navy-50 text-navy-600 font-semibold border-b border-line whitespace-nowrap">
                  {c as string}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.map((row, i) => (
              <tr key={i} className="border-t border-line hover:bg-surface transition-colors">
                <td className="py-2 px-3 text-ink-muted text-right tabular-nums">{i + 1}</td>
                {cols.map(c => (
                  <td key={c as string} className="py-2 px-3 whitespace-nowrap">
                    {c === "rating"
                      ? row.rating !== null && row.rating !== undefined
                        ? <span className={`px-1.5 py-0.5 rounded text-[11px] font-bold ${STAR_TEXT[Math.min(Math.max(Number(row.rating),0),5)]}`} style={{backgroundColor:STAR_BG[Math.min(Math.max(Number(row.rating),0),5)]}}>★ {row.rating}</span>
                        : <span className="text-ink-muted italic text-[11px]">—</span>
                      : row[c] === null || row[c] === undefined
                        ? <span className="text-ink-muted italic text-[11px]">—</span>
                        : <span className="text-ink">{String(row[c])}</span>}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
