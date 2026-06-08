"use client";

import { useState, useMemo } from "react";
import {
  Code2,
  Search,
  X,
  ChevronUp,
  ChevronDown,
  ChevronsUpDown,
  FileJson,
  Braces,
} from "lucide-react";

// ── Types ─────────────────────────────────────────────────────────────────────

type Row = Record<string, unknown>;
type SortDir = "asc" | "desc" | null;

// ── Helpers ───────────────────────────────────────────────────────────────────

function cellStr(v: unknown): string {
  if (v === null || v === undefined) return "";
  if (typeof v === "object") return JSON.stringify(v);
  return String(v);
}

function parseInput(raw: string): {
  columns: string[];
  rows: Row[];
  error: string | null;
  type: "array" | "object" | "primitive" | "empty";
} {
  if (!raw.trim()) return { columns: [], rows: [], error: null, type: "empty" };

  try {
    const parsed = JSON.parse(raw);

    if (Array.isArray(parsed)) {
      if (parsed.length === 0) return { columns: [], rows: [], error: null, type: "array" };

      const colOrder: string[] = [];
      const colSeen = new Set<string>();
      for (const item of parsed) {
        if (item && typeof item === "object" && !Array.isArray(item)) {
          for (const k of Object.keys(item as object)) {
            if (!colSeen.has(k)) { colSeen.add(k); colOrder.push(k); }
          }
        }
      }

      if (colOrder.length === 0) {
        return {
          columns: ["value"],
          rows: parsed.map((v) => ({ value: v })),
          error: null,
          type: "array",
        };
      }

      return {
        columns: colOrder,
        rows: parsed.map((item) =>
          item && typeof item === "object" && !Array.isArray(item)
            ? (item as Row)
            : { value: item }
        ),
        error: null,
        type: "array",
      };
    }

    if (typeof parsed === "object" && parsed !== null) {
      return {
        columns: ["key", "value"],
        rows: Object.entries(parsed as Record<string, unknown>).map(([k, v]) => ({ key: k, value: v })),
        error: null,
        type: "object",
      };
    }

    return {
      columns: ["value"],
      rows: [{ value: parsed }],
      error: null,
      type: "primitive",
    };
  } catch (e) {
    return { columns: [], rows: [], error: (e as Error).message, type: "empty" };
  }
}

// ── Cell renderer ─────────────────────────────────────────────────────────────

function Cell({ value }: { value: unknown }) {
  if (value === null || value === undefined) {
    return <span className="text-[#94a3b8] italic text-[11px]">null</span>;
  }
  if (typeof value === "boolean") {
    return (
      <span className={`px-1.5 py-0.5 rounded text-[10px] font-semibold ${value ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-600"}`}>
        {String(value)}
      </span>
    );
  }
  if (typeof value === "number") {
    return <span className="font-mono text-sky-700">{String(value)}</span>;
  }
  if (typeof value === "object") {
    const str = JSON.stringify(value);
    return (
      <span
        className="font-mono text-[11px] text-[#64748b] truncate block max-w-[280px]"
        title={str}
      >
        {str}
      </span>
    );
  }
  return <span className="text-[#1B2631]">{String(value)}</span>;
}

// ── Page ──────────────────────────────────────────────────────────────────────

const PLACEHOLDER = `[\n  { "nama": "Budi", "unit": "AMPENAN", "nilai": 95 },\n  { "nama": "Siti", "unit": "GERUNG",  "nilai": 87 },\n  { "nama": "Andi", "unit": "TANJUNG", "nilai": 78 }\n]`;

export default function JsonToTablePage() {
  const [input, setInput]       = useState("");
  const [search, setSearch]     = useState("");
  const [sortCol, setSortCol]   = useState<string | null>(null);
  const [sortDir, setSortDir]   = useState<SortDir>(null);

  const { columns, rows, error, type } = useMemo(() => parseInput(input), [input]);

  const filtered = useMemo(() => {
    let r = rows;
    if (search.trim()) {
      const q = search.toLowerCase();
      r = r.filter((row) => columns.some((c) => cellStr(row[c]).toLowerCase().includes(q)));
    }
    if (sortCol && sortDir) {
      r = [...r].sort((a, b) => {
        const cmp = cellStr(a[sortCol]).localeCompare(cellStr(b[sortCol]), undefined, {
          numeric: true,
          sensitivity: "base",
        });
        return sortDir === "asc" ? cmp : -cmp;
      });
    }
    return r;
  }, [rows, columns, search, sortCol, sortDir]);

  function handleSort(col: string) {
    if (sortCol !== col) { setSortCol(col); setSortDir("asc"); return; }
    if (sortDir === "asc") { setSortDir("desc"); return; }
    setSortCol(null); setSortDir(null);
  }

  function handleFormat() {
    try { setInput(JSON.stringify(JSON.parse(input), null, 2)); } catch { /* invalid */ }
  }

  function handleClear() {
    setInput(""); setSearch(""); setSortCol(null); setSortDir(null);
  }

  const hasData    = columns.length > 0 && rows.length > 0;
  const inputEmpty = !input.trim();

  const statusText  = inputEmpty ? "Tempel JSON di bawah" : error ? "JSON tidak valid" : `${rows.length} baris · ${columns.length} kolom · ${type}`;
  const statusColor = inputEmpty ? "text-[#94a3b8]" : error ? "text-red-500" : "text-emerald-600";

  return (
    <div className="min-h-screen bg-[#F4F6F8] p-6 space-y-4">

      {/* Header */}
      <div className="bg-linear-to-r from-[#004D40] to-[#00897B] text-white rounded-xl p-6">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-white/20 rounded-lg">
            <Code2 className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-xl font-bold">JSON ke Tabel</h1>
            <p className="text-sm text-white/75 mt-0.5">
              Tempel JSON → langsung jadi tabel yang bisa dicari & diurutkan
            </p>
          </div>
          <div className="ml-auto text-right">
            <p className={`text-sm font-semibold ${inputEmpty ? "text-white/50" : error ? "text-red-300" : "text-emerald-200"}`}>
              {statusText}
            </p>
          </div>
        </div>
      </div>

      {/* Input */}
      <div className="bg-white rounded-xl shadow-sm border border-[#E2E8F0] p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <FileJson className="w-4 h-4 text-[#00897B]" />
            <span className="text-sm font-semibold text-[#1B2631]">Input JSON</span>
          </div>
          <div className="flex items-center gap-2">
            {!inputEmpty && (
              <>
                {!error && (
                  <button
                    onClick={handleFormat}
                    className="px-2.5 py-1 text-xs rounded-lg bg-[#E0F2F1] text-[#00695C] hover:bg-[#00897B] hover:text-white transition-colors font-medium"
                  >
                    Format
                  </button>
                )}
                <button
                  onClick={handleClear}
                  className="p-1 rounded-lg text-[#94a3b8] hover:text-red-500 hover:bg-red-50 transition-colors"
                  title="Hapus"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </>
            )}
          </div>
        </div>

        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={PLACEHOLDER}
          rows={8}
          className="w-full bg-[#0d1b2a] border border-[#1e3552] rounded-lg p-3 font-mono text-xs text-[#e2e8f0] placeholder-[#334155] focus:outline-none focus:border-[#00897B] focus:ring-2 focus:ring-[#00897B]/20 resize-y"
          spellCheck={false}
        />

        {error && (
          <div className="mt-2 flex items-start gap-2 px-3 py-2 bg-red-50 border border-red-200 rounded-lg">
            <div className="w-3.5 h-3.5 rounded-full bg-red-500 shrink-0 mt-0.5" />
            <div>
              <p className="text-xs font-semibold text-red-600">JSON tidak valid</p>
              <p className="text-[11px] text-red-500 font-mono mt-0.5">{error}</p>
            </div>
          </div>
        )}
      </div>

      {/* Table */}
      {hasData && (
        <div className="bg-white rounded-xl shadow-sm border border-[#E2E8F0] overflow-hidden">
          {/* Controls */}
          <div className="flex items-center gap-3 px-4 py-3 border-b border-[#E2E8F0]">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[#94a3b8]" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Cari di semua kolom..."
                className="pl-8 pr-3 py-1.5 text-xs border border-[#E2E8F0] rounded-lg focus:outline-none focus:border-[#00897B] focus:ring-2 focus:ring-[#00897B]/20 w-56 text-[#1B2631] placeholder-[#94a3b8]"
              />
            </div>
            {search && (
              <button onClick={() => setSearch("")} className="p-1 rounded text-[#94a3b8] hover:text-[#1B2631]">
                <X className="w-3 h-3" />
              </button>
            )}
            <span className="text-xs text-[#94a3b8] ml-auto">
              {filtered.length !== rows.length
                ? `${filtered.length} dari ${rows.length} baris`
                : `${rows.length} baris`}{" "}
              · {columns.length} kolom
            </span>
          </div>

          {/* Table */}
          <div className="overflow-auto max-h-[62vh]">
            <table className="w-full text-xs border-collapse">
              <thead className="sticky top-0 z-10">
                <tr>
                  <th className="py-2.5 px-3 text-left text-[#94a3b8] font-semibold bg-[#E0F2F1] border-b border-[#E2E8F0] w-10 select-none">
                    #
                  </th>
                  {columns.map((col) => (
                    <th
                      key={col}
                      onClick={() => handleSort(col)}
                      className="py-2.5 px-3 text-left font-semibold bg-[#E0F2F1] text-[#00695C] border-b border-[#E2E8F0] cursor-pointer hover:bg-[#b2dfdb] transition-colors whitespace-nowrap select-none"
                    >
                      <div className="flex items-center gap-1">
                        <span>{col}</span>
                        {sortCol === col ? (
                          sortDir === "asc" ? (
                            <ChevronUp className="w-3 h-3 text-[#00897B]" />
                          ) : (
                            <ChevronDown className="w-3 h-3 text-[#00897B]" />
                          )
                        ) : (
                          <ChevronsUpDown className="w-3 h-3 text-[#b2dfdb]" />
                        )}
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map((row, i) => (
                  <tr
                    key={i}
                    className="border-t border-[#E2E8F0] hover:bg-[#F4F6F8] transition-colors"
                  >
                    <td className="py-2 px-3 text-[#94a3b8] text-right tabular-nums">{i + 1}</td>
                    {columns.map((col) => (
                      <td key={col} className="py-2 px-3">
                        <Cell value={row[col]} />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>

            {filtered.length === 0 && (
              <div className="py-12 text-center text-sm text-[#94a3b8]">
                Tidak ada hasil yang cocok dengan &quot;{search}&quot;
              </div>
            )}
          </div>
        </div>
      )}

      {/* Empty state */}
      {!hasData && !error && !inputEmpty && (
        <div className="bg-white rounded-xl shadow-sm border border-[#E2E8F0] py-16 flex flex-col items-center gap-3 text-[#94a3b8]">
          <Braces className="w-10 h-10 opacity-30" />
          <p className="text-sm">JSON kosong atau tidak mengandung data</p>
        </div>
      )}

      {!hasData && !error && inputEmpty && (
        <div className="bg-white rounded-xl shadow-sm border border-[#E2E8F0] py-16 flex flex-col items-center gap-3 text-[#94a3b8]">
          <Code2 className="w-10 h-10 opacity-30" />
          <p className="text-sm font-medium">Tempel JSON untuk memulai</p>
          <p className="text-xs opacity-70">Mendukung: array of objects, single object, array primitif</p>
        </div>
      )}

    </div>
  );
}
