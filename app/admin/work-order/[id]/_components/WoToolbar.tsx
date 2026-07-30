"use client";

import {
  Search, X, Download, Plus, Rows3, Rows4, Loader2, ShieldCheck, Table2, Columns3,
} from "lucide-react";
import type { WoStage } from "../../_types";
import { STAGE_CONFIG, STAGE_ORDER } from "../../_constants";
import { CARD, CHIP, CHIP_OFF, CHIP_ON, FIELD } from "@/app/admin/_ui";

export type Density = "compact" | "normal";
export type ViewMode = "tabel" | "kanban";

const VIEWS: { key: ViewMode; label: string; icon: typeof Table2 }[] = [
  { key: "tabel", label: "Tabel", icon: Table2 },
  { key: "kanban", label: "Kanban", icon: Columns3 },
];

interface WoToolbarProps {
  view: ViewMode;
  onView: (v: ViewMode) => void;
  search: string;
  onSearch: (v: string) => void;
  stage: WoStage | null;
  onStage: (s: WoStage | null) => void;
  stageCounts: Record<WoStage, number>;
  /** Di Kanban, chip tahap hanya jadi ringkasan — kolomnya sudah memisah tahap. */
  stageFilterActive: boolean;
  regu: string | null;
  onRegu: (r: string | null) => void;
  reguOptions: string[];
  myQueue: boolean;
  onMyQueue: (v: boolean) => void;
  myQueueCount: number;
  showMyQueue: boolean;
  density: Density;
  onDensity: (d: Density) => void;
  shown: number;
  total: number;
  canManage: boolean;
  onAddRow: () => void;
  onExport: () => void;
  exporting: boolean;
}

export default function WoToolbar({
  view, onView,
  search, onSearch,
  stage, onStage, stageCounts, stageFilterActive,
  regu, onRegu, reguOptions,
  myQueue, onMyQueue, myQueueCount, showMyQueue,
  density, onDensity,
  shown, total,
  canManage, onAddRow,
  onExport, exporting,
}: WoToolbarProps) {
  return (
    <div className={`${CARD} p-3 space-y-3`}>
      {/* Baris 1: view · cari · aksi */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex gap-0.5 rounded-xl bg-surface p-0.5 shrink-0">
          {VIEWS.map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              onClick={() => onView(key)}
              className={`inline-flex items-center gap-1.5 h-8 px-3 rounded-lg text-xs font-semibold transition-colors ${
                view === key ? "bg-white text-navy-600 shadow-sm" : "text-ink-soft hover:text-ink"
              }`}
            >
              <Icon size={14} /> {label}
            </button>
          ))}
        </div>

        <div className="relative flex-1 min-w-[200px]">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-muted" />
          <input
            value={search}
            onChange={(e) => onSearch(e.target.value)}
            placeholder="Cari uraian, penyulang, regu, petugas…"
            aria-label="Cari baris WO"
            className="w-full h-9 pl-9 pr-8 rounded-full border border-line bg-surface text-sm text-ink placeholder:text-ink-muted focus:outline-none focus:bg-white focus:border-navy-500 focus:ring-2 focus:ring-navy-500/15 transition-colors"
          />
          {search && (
            <button
              onClick={() => onSearch("")}
              aria-label="Hapus pencarian"
              className="absolute right-3 top-1/2 -translate-y-1/2 text-ink-muted hover:text-ink"
            >
              <X size={14} />
            </button>
          )}
        </div>

        {reguOptions.length > 0 && (
          <select
            value={regu ?? ""}
            onChange={(e) => onRegu(e.target.value || null)}
            aria-label="Filter regu"
            className={FIELD}
          >
            <option value="">Semua regu</option>
            {reguOptions.map((r) => <option key={r} value={r}>{r}</option>)}
          </select>
        )}

        {showMyQueue && (
          <button
            onClick={() => onMyQueue(!myQueue)}
            className={`${CHIP} ${
              myQueue
                ? "bg-accent border-accent text-white"
                : "bg-accent-tint border-accent/25 text-accent-deep hover:border-accent/50"
            }`}
          >
            <ShieldCheck size={13} /> Perlu saya verifikasi
            <span className="tabular-nums font-bold">{myQueueCount}</span>
          </button>
        )}

        <div className="ml-auto flex items-center gap-1.5">
          {view === "tabel" && (
            <button
              onClick={() => onDensity(density === "compact" ? "normal" : "compact")}
              title={density === "compact" ? "Kerapatan normal" : "Kerapatan padat"}
              aria-label="Ubah kerapatan baris"
              className="h-9 w-9 grid place-items-center rounded-xl border border-line bg-white text-ink-soft hover:bg-surface"
            >
              {density === "compact" ? <Rows3 size={15} /> : <Rows4 size={15} />}
            </button>
          )}
          <button
            onClick={onExport}
            disabled={exporting}
            className="h-9 inline-flex items-center gap-1.5 px-3 rounded-xl border border-line bg-white text-sm font-medium text-ink-soft hover:bg-surface disabled:opacity-50 transition-colors"
          >
            {exporting ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />} Excel
          </button>
          {canManage && (
            <button
              onClick={onAddRow}
              className="h-9 inline-flex items-center gap-1.5 px-3 rounded-xl text-sm font-semibold bg-navy-50 text-navy-600 hover:bg-navy-100 transition-colors"
            >
              <Plus size={14} /> Baris
            </button>
          )}
        </div>
      </div>

      {/* Baris 2: chip tahap + hitungan */}
      <div className="flex flex-wrap items-center gap-1.5">
        {stageFilterActive && (
          <button
            onClick={() => onStage(null)}
            className={`${CHIP} ${stage === null ? CHIP_ON : CHIP_OFF}`}
          >
            Semua <span className="tabular-nums font-bold">{total}</span>
          </button>
        )}

        {STAGE_ORDER.map((s) => {
          const cfg = STAGE_CONFIG[s];
          const active = stageFilterActive && stage === s;
          return (
            <button
              key={s}
              onClick={() => stageFilterActive && onStage(active ? null : s)}
              disabled={!stageFilterActive}
              className={`${CHIP} ${active ? CHIP_ON : CHIP_OFF} ${
                stageFilterActive ? "" : "cursor-default"
              }`}
            >
              <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`} />
              {cfg.label} <span className="tabular-nums font-bold">{stageCounts[s]}</span>
            </button>
          );
        })}

        <span className="ml-auto text-xs text-ink-muted tabular-nums">
          {shown !== total ? `${shown} dari ${total} baris` : `${total} baris`}
        </span>
      </div>
    </div>
  );
}
