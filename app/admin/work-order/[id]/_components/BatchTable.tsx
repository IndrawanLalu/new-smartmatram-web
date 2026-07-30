"use client";

import { useCallback, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, ArrowUp, ArrowDown, SearchX } from "lucide-react";
import { parseLocaleNumber } from "@/lib/parseLocaleNumber";
import { woStage, type WoBatch, type WoColumn, type WoItem } from "../../_types";
import { STAGE_ORDER } from "../../_constants";
import { CARD } from "@/app/admin/_ui";
import WoTableRow from "./WoTableRow";

const PAGE_SIZES = [20, 50, 100];
const SORT_STAGE = "__stage";
const SORT_REGU = "__regu";
const SORT_TGL = "__tgl";

const TH = "px-3 py-2 text-left font-semibold whitespace-nowrap";
const TH_STICKY = "sticky z-30 bg-navy-50 px-3 py-2.5";

interface SortState {
  key: string;
  dir: "asc" | "desc";
}

interface BatchTableProps {
  batch: WoBatch;
  /** Baris yang sudah lewat filter — pengurutan & paginasi diurus di sini. */
  rows: WoItem[];
  itemsTotal: number;
  visibleCols: WoColumn[];
  canManage: boolean;
  eksekutorRoles: string[];
  verifierRoles: string[];
  density: "compact" | "normal";
  selected: Set<string>;
  onSelect: (id: string, checked: boolean) => void;
  onSelectMany: (ids: string[], checked: boolean) => void;
  onUpdateCell: (item: WoItem, colKey: string, value: string) => void;
  onUpdateRegu: (id: string, regu: string | null) => void;
  onUpdateVerifier: (id: string, role: string | null) => void;
  onSetRealisasi: (id: string, date: string | null) => void;
  onOpen: (id: string) => void;
  onDeleteRow: (item: WoItem) => void;
}

export default function BatchTable({
  batch, rows, itemsTotal, visibleCols, canManage,
  eksekutorRoles, verifierRoles, density,
  selected, onSelect, onSelectMany,
  onUpdateCell, onUpdateRegu, onUpdateVerifier, onSetRealisasi, onOpen, onDeleteRow,
}: BatchTableProps) {
  const [sort, setSort] = useState<SortState | null>(null);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(PAGE_SIZES[0]);
  const [editing, setEditing] = useState<{ id: string; key: string } | null>(null);

  const sorted = useMemo(() => {
    if (!sort) return rows;
    const col = batch.columns.find((c) => c.key === sort.key);
    const value = (it: WoItem): string | number => {
      if (sort.key === SORT_STAGE) return STAGE_ORDER.indexOf(woStage(it));
      if (sort.key === SORT_REGU) return it.regu ?? "";
      if (sort.key === SORT_TGL) return it.tgl_realisasi ?? "";
      const raw = it.data[sort.key] ?? "";
      return col?.type === "number" ? (parseLocaleNumber(raw) ?? Number.NEGATIVE_INFINITY) : raw;
    };
    const dir = sort.dir === "asc" ? 1 : -1;
    return [...rows].sort((a, b) => {
      const av = value(a);
      const bv = value(b);
      if (typeof av === "number" && typeof bv === "number") return (av - bv) * dir;
      return String(av).localeCompare(String(bv), "id", { numeric: true }) * dir;
    });
  }, [rows, sort, batch.columns]);

  const totalPages = Math.max(1, Math.ceil(sorted.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const startIdx = (safePage - 1) * pageSize;
  const pageItems = sorted.slice(startIdx, startIdx + pageSize);
  const allPageSelected = pageItems.length > 0 && pageItems.every((it) => selected.has(it.id));

  const toggleSort = useCallback((key: string) => {
    setSort((prev) =>
      prev?.key !== key ? { key, dir: "asc" } : prev.dir === "asc" ? { key, dir: "desc" } : null,
    );
  }, []);

  const handleEdit = useCallback(
    (rowId: string, colKey: string | null, moveNextFrom?: string) => {
      if (moveNextFrom) {
        const i = visibleCols.findIndex((c) => c.key === moveNextFrom);
        const next = visibleCols[i + 1];
        setEditing(next ? { id: rowId, key: next.key } : null);
        return;
      }
      setEditing(colKey ? { id: rowId, key: colKey } : null);
    },
    [visibleCols],
  );

  const sortBtn = (label: string, key: string) => (
    <button
      onClick={() => toggleSort(key)}
      className="inline-flex items-center gap-1 uppercase hover:text-navy-600"
    >
      {label}
      {sort?.key === key && (sort.dir === "asc" ? <ArrowUp size={11} /> : <ArrowDown size={11} />)}
    </button>
  );

  const pad = density === "compact" ? "py-1.5" : "py-2.5";

  return (
    <div className={`${CARD} overflow-hidden`}>
      <div className="overflow-auto max-h-[calc(100vh-24rem)] min-h-[18rem]">
        <table className="w-full text-[13px] border-collapse">
          <thead className="sticky top-0 z-20">
            <tr className="bg-navy-50 text-navy-600 text-[11px] uppercase tracking-wide">
              <th className={`${TH_STICKY} left-0 w-10`}>
                <input
                  type="checkbox"
                  checked={allPageSelected}
                  onChange={() => onSelectMany(pageItems.map((it) => it.id), !allPageSelected)}
                  aria-label="Pilih semua baris di halaman ini"
                  className="w-3.5 h-3.5 rounded border-navy-200 accent-navy-600 cursor-pointer"
                />
              </th>
              <th className={`${TH_STICKY} left-10 w-12 text-left font-semibold`}>No</th>

              {visibleCols.map((c) => (
                <th key={c.key} className={TH}>
                  {sortBtn(
                    c.label +
                      (c.key === batch.measure_column && batch.measure_unit
                        ? ` (${batch.measure_unit})`
                        : ""),
                    c.key,
                  )}
                </th>
              ))}

              <th className={TH}>{sortBtn("Regu", SORT_REGU)}</th>
              <th className={TH}>Verifikator</th>
              <th className="px-3 py-2 text-center font-semibold whitespace-nowrap">
                {sortBtn("Tahap", SORT_STAGE)}
              </th>
              <th className={TH}>{sortBtn("Tgl Realisasi", SORT_TGL)}</th>
              <th className={TH}>Bukti</th>
              <th className="px-3 py-2 w-10" />
            </tr>
          </thead>

          <tbody>
            {pageItems.map((item, idx) => (
              <WoTableRow
                key={item.id}
                item={item}
                no={startIdx + idx + 1}
                batch={batch}
                visibleCols={visibleCols}
                selected={selected.has(item.id)}
                onSelect={onSelect}
                editingKey={editing?.id === item.id ? editing.key : null}
                onEdit={handleEdit}
                canManage={canManage}
                eksekutorRoles={eksekutorRoles}
                verifierRoles={verifierRoles}
                pad={pad}
                onUpdateCell={onUpdateCell}
                onUpdateRegu={onUpdateRegu}
                onUpdateVerifier={onUpdateVerifier}
                onSetRealisasi={onSetRealisasi}
                onOpen={onOpen}
                onDelete={onDeleteRow}
              />
            ))}

            {sorted.length === 0 && (
              <tr>
                <td colSpan={visibleCols.length + 8} className="px-3 py-14 text-center">
                  <SearchX size={28} className="mx-auto text-navy-200" />
                  <p className="mt-2 text-sm text-ink-soft">
                    {itemsTotal === 0
                      ? "Belum ada baris pada WO ini."
                      : "Tidak ada baris yang cocok dengan filter."}
                  </p>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 px-3 py-2.5 border-t border-line text-xs text-ink-soft">
        <span className="tabular-nums">
          {sorted.length === 0
            ? "0 baris"
            : `Menampilkan ${startIdx + 1}–${Math.min(startIdx + pageSize, sorted.length)} dari ${sorted.length}`}
        </span>

        <div className="flex items-center gap-3">
          <label className="flex items-center gap-1.5">
            Baris/hal
            <select
              value={pageSize}
              onChange={(e) => { setPageSize(Number(e.target.value)); setPage(1); }}
              className="rounded-lg border border-line px-1.5 py-1 focus:outline-none focus:border-navy-500"
            >
              {PAGE_SIZES.map((n) => <option key={n} value={n}>{n}</option>)}
            </select>
          </label>

          {totalPages > 1 && (
            <div className="flex items-center gap-2">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={safePage <= 1}
                aria-label="Halaman sebelumnya"
                className="p-1 rounded-lg hover:bg-surface disabled:opacity-30"
              >
                <ChevronLeft size={16} />
              </button>
              <span className="tabular-nums">{safePage} / {totalPages}</span>
              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={safePage >= totalPages}
                aria-label="Halaman berikutnya"
                className="p-1 rounded-lg hover:bg-surface disabled:opacity-30"
              >
                <ChevronRight size={16} />
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
