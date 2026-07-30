"use client";

import { useRef, useState } from "react";
import { Trash2, ChevronRight, Camera, MapPin } from "lucide-react";
import { normalizeMeasureCell } from "@/lib/parseLocaleNumber";
import { woStage, type WoBatch, type WoColumn, type WoColumnType, type WoItem } from "../../_types";
import { STAGE_CONFIG } from "../../_constants";

const inputType = (t: WoColumnType) => (t === "number" ? "number" : t === "date" ? "date" : "text");

/** Sel edit: Enter simpan · Tab simpan+lanjut · Escape benar-benar batal. */
function EditableCell({
  value,
  type,
  onCommit,
  onCancel,
}: {
  value: string;
  type: WoColumnType;
  onCommit: (v: string, moveNext: boolean) => void;
  onCancel: () => void;
}) {
  const [v, setV] = useState(value);
  const cancelled = useRef(false);
  const moveNext = useRef(false);

  return (
    <input
      autoFocus
      type={inputType(type)}
      value={v}
      onChange={(e) => setV(e.target.value)}
      onBlur={() => {
        if (cancelled.current || v === value) onCancel();
        else onCommit(v, moveNext.current);
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter") e.currentTarget.blur();
        if (e.key === "Tab") { moveNext.current = true; e.preventDefault(); e.currentTarget.blur(); }
        if (e.key === "Escape") { cancelled.current = true; e.currentTarget.blur(); }
      }}
      className="w-full min-w-[90px] px-1.5 py-1 border border-navy-500 rounded text-[13px] bg-white focus:outline-none focus:ring-2 focus:ring-navy-500/15"
    />
  );
}

/** Dropdown ringkas tanpa chrome native — hanya muncul saat hover/fokus. */
function InlineSelect({
  value,
  options,
  onChange,
  placeholder,
  label,
}: {
  value: string;
  options: string[];
  onChange: (v: string) => void;
  placeholder: string;
  label: string;
}) {
  return (
    <select
      value={value}
      aria-label={label}
      onChange={(e) => onChange(e.target.value)}
      className={`w-full max-w-[8.5rem] appearance-none rounded-md border border-transparent bg-transparent px-1.5 py-1 text-xs hover:border-line hover:bg-white focus:border-navy-500 focus:bg-white focus:outline-none transition-colors ${
        value ? "text-ink font-medium" : "text-ink-muted"
      }`}
    >
      <option value="">{placeholder}</option>
      {options.map((o) => (
        <option key={o} value={o}>{o}</option>
      ))}
    </select>
  );
}

interface WoTableRowProps {
  item: WoItem;
  no: number;
  batch: WoBatch;
  visibleCols: WoColumn[];
  selected: boolean;
  onSelect: (id: string, checked: boolean) => void;
  editingKey: string | null;
  /** `moveNextFrom` diisi saat commit via Tab → parent membuka kolom berikutnya. */
  onEdit: (rowId: string, colKey: string | null, moveNextFrom?: string) => void;
  canManage: boolean;
  eksekutorRoles: string[];
  verifierRoles: string[];
  pad: string;
  onUpdateCell: (item: WoItem, colKey: string, value: string) => void;
  onUpdateRegu: (id: string, regu: string | null) => void;
  onUpdateVerifier: (id: string, role: string | null) => void;
  onSetRealisasi: (id: string, date: string | null) => void;
  onOpen: (id: string) => void;
  onDelete: (item: WoItem) => void;
}

export default function WoTableRow({
  item, no, batch, visibleCols, selected, onSelect,
  editingKey, onEdit, canManage, eksekutorRoles, verifierRoles, pad,
  onUpdateCell, onUpdateRegu, onUpdateVerifier, onSetRealisasi, onOpen, onDelete,
}: WoTableRowProps) {
  const cfg = STAGE_CONFIG[woStage(item)];
  const stickyBg = selected ? "bg-navy-50" : "bg-white group-hover:bg-surface";

  return (
    <tr className={`group border-t border-line transition-colors ${selected ? "bg-navy-50/60" : "hover:bg-surface"}`}>
      <td className={`sticky left-0 z-10 w-10 px-3 ${pad} ${stickyBg} transition-colors`}>
        <input
          type="checkbox"
          checked={selected}
          onChange={(e) => onSelect(item.id, e.target.checked)}
          aria-label={`Pilih baris ${no}`}
          className="w-3.5 h-3.5 rounded border-navy-200 accent-navy-600 cursor-pointer"
        />
      </td>
      <td className={`sticky left-10 z-10 w-12 px-3 ${pad} text-xs tabular-nums text-ink-muted ${stickyBg} transition-colors`}>
        {no}
      </td>

      {visibleCols.map((c) => {
        const isEditing = editingKey === c.key;
        const val = item.data[c.key] ?? "";
        const isMeasure = c.key === batch.measure_column;
        return (
          <td key={c.key} className={`px-3 ${pad} align-top`}>
            {isEditing ? (
              <EditableCell
                value={val}
                type={isMeasure ? "text" : c.type}
                onCancel={() => onEdit(item.id, null)}
                onCommit={(v, moveNext) => {
                  onUpdateCell(item, c.key, isMeasure ? normalizeMeasureCell(v) : v);
                  onEdit(item.id, null, moveNext ? c.key : undefined);
                }}
              />
            ) : (
              <span
                onClick={canManage ? () => onEdit(item.id, c.key) : undefined}
                className={`block min-w-[60px] min-h-[22px] rounded px-1.5 py-0.5 whitespace-pre-wrap ${
                  c.type === "number" ? "tabular-nums" : ""
                } ${canManage ? "cursor-text hover:bg-navy-50" : ""}`}
              >
                {val || <span className="text-gray-300">—</span>}
              </span>
            )}
          </td>
        );
      })}

      {/* Regu */}
      <td className={`px-3 ${pad}`}>
        {canManage ? (
          <InlineSelect
            label="Regu"
            value={item.regu ?? ""}
            options={eksekutorRoles}
            placeholder="—"
            onChange={(v) => onUpdateRegu(item.id, v || null)}
          />
        ) : (
          <span className="text-xs text-ink">{item.regu || <span className="text-gray-300">—</span>}</span>
        )}
      </td>

      {/* Verifikator */}
      <td className={`px-3 ${pad}`}>
        {canManage ? (
          <InlineSelect
            label="Verifikator"
            value={item.verifier_role ?? ""}
            options={verifierRoles}
            placeholder="—"
            onChange={(v) => onUpdateVerifier(item.id, v || null)}
          />
        ) : (
          <span className="text-xs text-ink">
            {item.verifier_role || <span className="text-gray-300">—</span>}
          </span>
        )}
      </td>

      {/* Tahap — pintu masuk ke drawer tinjau/setujui */}
      <td className={`px-3 ${pad} text-center`}>
        <button
          onClick={() => onOpen(item.id)}
          title="Tinjau / setujui"
          className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold cursor-pointer ring-1 ring-inset ring-black/5 hover:ring-black/20 hover:shadow-sm transition-all ${cfg.cls}`}
        >
          <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`} /> {cfg.label}
          <ChevronRight size={11} className="opacity-50 -mr-0.5" />
        </button>
      </td>

      {/* Tgl realisasi */}
      <td className={`px-3 ${pad}`}>
        {canManage ? (
          <input
            type="date"
            value={item.tgl_realisasi ?? ""}
            aria-label="Tanggal realisasi"
            onChange={(e) => onSetRealisasi(item.id, e.target.value || null)}
            className="text-xs border border-transparent hover:border-line rounded-md px-1.5 py-1 bg-transparent hover:bg-white focus:border-navy-500 focus:bg-white focus:outline-none transition-colors"
          />
        ) : (
          <span className="text-xs tabular-nums text-ink">
            {item.tgl_realisasi || <span className="text-gray-300">—</span>}
          </span>
        )}
      </td>

      {/* Bukti dari mobile */}
      <td className={`px-3 ${pad}`}>
        <div className="flex items-center gap-2">
          {item.foto_bukti_url && (
            <a
              href={item.foto_bukti_url}
              target="_blank"
              rel="noopener noreferrer"
              title="Lihat foto bukti"
              className="text-accent hover:text-accent-deep"
            >
              <Camera size={15} />
            </a>
          )}
          {item.selesai_lat != null && item.selesai_lng != null && (
            <a
              href={`https://maps.google.com/?q=${item.selesai_lat},${item.selesai_lng}`}
              target="_blank"
              rel="noopener noreferrer"
              title="Lihat lokasi"
              className="text-blue-600 hover:text-blue-800"
            >
              <MapPin size={15} />
            </a>
          )}
          {item.selesai_by && (
            <span className="text-xs text-ink-soft truncate max-w-[90px]" title={item.selesai_by}>
              {item.selesai_by}
            </span>
          )}
          {item.sheet_synced_at && (
            <span
              title={`Terkirim ke Sheet ${new Date(item.sheet_synced_at).toLocaleString("id-ID")}`}
              className="text-[10px] font-semibold text-green-700 bg-green-50 px-1.5 py-0.5 rounded"
            >
              Sheet ✓
            </span>
          )}
          {!item.foto_bukti_url && !item.selesai_by && !item.sheet_synced_at && (
            <span className="text-gray-300">—</span>
          )}
        </div>
      </td>

      <td className={`px-3 ${pad} text-center`}>
        {canManage && (
          <button
            onClick={() => onDelete(item)}
            aria-label={`Hapus baris ${no}`}
            className="text-gray-300 hover:text-red-500 opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity"
          >
            <Trash2 size={14} />
          </button>
        )}
      </td>
    </tr>
  );
}
