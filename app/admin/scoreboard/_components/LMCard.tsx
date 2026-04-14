"use client";

import { useState } from "react";
import { Trash2, Plus, Pencil } from "lucide-react";
import type { LeadMeasure, LMItem, RealisasiField, TargetField } from "../_hooks/useScoreboard";
import AddItemModal from "./AddItemModal";
import AddLMModal from "./AddLMModal";

// ── Constants ─────────────────────────────────────────────────────────────────

const WEEKS: { label: string; targetField: TargetField; realisasiField: RealisasiField }[] = [
  { label: "M1", targetField: "target_m1", realisasiField: "realisasi_m1" },
  { label: "M2", targetField: "target_m2", realisasiField: "realisasi_m2" },
  { label: "M3", targetField: "target_m3", realisasiField: "realisasi_m3" },
  { label: "M4", targetField: "target_m4", realisasiField: "realisasi_m4" },
];

// ── Sub-components ────────────────────────────────────────────────────────────

function EditableCell({ value, onSave }: { value: number; onSave: (v: number) => void }) {
  const [editing, setEditing] = useState(false);
  const [local, setLocal] = useState(String(value));

  const commit = () => {
    setEditing(false);
    const parsed = parseFloat(local);
    if (!isNaN(parsed) && parsed !== value) onSave(parsed);
  };

  if (editing) {
    return (
      <input
        autoFocus
        type="number"
        value={local}
        onChange={(e) => setLocal(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); if (e.key === "Escape") setEditing(false); }}
        className="w-14 text-center text-[#1B2631] bg-white border border-[#00897B] rounded px-1 py-0.5 text-sm focus:outline-none focus:ring-1 focus:ring-[#00897B]"
      />
    );
  }
  return (
    <button
      onClick={() => { setLocal(String(value)); setEditing(true); }}
      title="Klik untuk edit"
      className="w-full text-center text-[#1B2631] hover:bg-[#00897B]/10 rounded px-2 py-0.5 text-sm transition-colors font-medium"
    >
      {value}
    </button>
  );
}

function KomitmenEdit({ value, onSave }: { value: string; onSave: (v: string) => void }) {
  const [local, setLocal] = useState(value);
  return (
    <textarea
      value={local}
      onChange={(e) => setLocal(e.target.value)}
      onBlur={() => { if (local !== value) onSave(local); }}
      placeholder="Tulis komitmen minggu depan..."
      className="flex-1 w-full text-xs text-amber-900 bg-transparent resize-none focus:outline-none placeholder-amber-400 leading-relaxed min-h-20"
    />
  );
}

// ── Props ─────────────────────────────────────────────────────────────────────

interface LMCardProps {
  lm: LeadMeasure;
  index: number;
  presentMode?: boolean;
  onDeleteLM: (id: string) => void;
  onUpdateLM: (id: string, nama: string, pic: string, komitmen: string) => Promise<unknown>;
  onAddItem: (lmId: string, nama: string, satuan: string, targets: { m1: number; m2: number; m3: number; m4: number }) => Promise<unknown>;
  onDeleteItem: (id: string) => void;
  onUpdateItemMeta: (id: string, nama_item: string, satuan: string) => Promise<unknown>;
  onUpdateRealisasi: (id: string, field: RealisasiField, value: number) => void;
  onUpdateTarget: (id: string, field: TargetField, value: number) => void;
  onUpdateKomitmen: (id: string, val: string) => void;
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function LMCard({
  lm, index, presentMode, onDeleteLM, onUpdateLM, onAddItem, onDeleteItem, onUpdateItemMeta,
  onUpdateRealisasi, onUpdateTarget, onUpdateKomitmen,
}: LMCardProps) {
  const [showAddItem, setShowAddItem] = useState(false);
  const [showEditLM, setShowEditLM] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  return (
    <>
      <div className="bg-white rounded-xl shadow-sm border border-[#E2E8F0] overflow-hidden">
        {/* Header */}
        <div className="bg-linear-to-r from-[#004D40] to-[#00897B] px-4 py-3 flex items-start justify-between">
          <div>
            <span className="text-white/60 text-xs font-medium uppercase tracking-wider">
              Lead Measure {index + 1}
            </span>
            <p className="text-white font-semibold leading-snug mt-0.5">{lm.nama}</p>
          </div>
          {!presentMode && (
            <div className="flex items-center gap-1 shrink-0 print-hidden">
              {confirmDelete ? (
                <>
                  <span className="text-white/70 text-xs mr-1">Hapus?</span>
                  <button onClick={() => onDeleteLM(lm.id)} className="bg-red-500 text-white text-xs px-2 py-1 rounded font-medium">Ya</button>
                  <button onClick={() => setConfirmDelete(false)} className="bg-white/20 text-white text-xs px-2 py-1 rounded">Batal</button>
                </>
              ) : (
                <>
                  <button onClick={() => setShowEditLM(true)} className="text-white/60 hover:text-white hover:bg-white/10 rounded p-1.5 transition-colors" title="Edit">
                    <Pencil size={13} />
                  </button>
                  <button onClick={() => setConfirmDelete(true)} className="text-white/50 hover:text-white hover:bg-white/10 rounded p-1.5 transition-colors" title="Hapus">
                    <Trash2 size={13} />
                  </button>
                </>
              )}
            </div>
          )}
        </div>

        {/* Body: items table + komitmen */}
        <div className="flex flex-col md:flex-row divide-y md:divide-y-0 md:divide-x divide-[#E2E8F0]">

          {/* Items area */}
          <div className="flex-1 p-4">
            {lm.items.length === 0 ? (
              <p className="text-sm text-gray-400 italic py-2">Belum ada item pekerjaan.</p>
            ) : (
              <div className="space-y-3">
                {lm.items.map((item, idx) => (
                  <ItemTable
                    key={item.id}
                    item={item}
                    index={idx}
                    presentMode={presentMode}
                    onDelete={() => onDeleteItem(item.id)}
                    onUpdateMeta={onUpdateItemMeta}
                    onUpdateRealisasi={onUpdateRealisasi}
                    onUpdateTarget={onUpdateTarget}
                  />
                ))}
              </div>
            )}

            {!presentMode && (
              <button
                onClick={() => setShowAddItem(true)}
                className="mt-4 flex items-center gap-1.5 text-sm text-[#00897B] hover:text-[#004D40] font-medium transition-colors"
              >
                <Plus size={15} /> Tambah Item Pekerjaan
              </button>
            )}
          </div>

          {/* Komitmen + PIC */}
          <div className="md:w-60 p-4 bg-amber-50 flex flex-col">
            <p className="text-xs font-bold text-amber-800 uppercase tracking-wider mb-2">
              Komitmen Minggu Depan
            </p>
            <KomitmenEdit value={lm.komitmen} onSave={(v) => onUpdateKomitmen(lm.id, v)} />
            {lm.pic && (
              <p className="mt-auto pt-3 text-xs text-amber-700 border-t border-amber-200">
                PIC: <span className="font-semibold">{lm.pic}</span>
              </p>
            )}
          </div>
        </div>
      </div>

      {showAddItem && (
        <AddItemModal
          lmNama={lm.nama}
          onClose={() => setShowAddItem(false)}
          onSave={(nama, satuan, targets) => onAddItem(lm.id, nama, satuan, targets)}
        />
      )}

      {showEditLM && (
        <AddLMModal
          initial={{ nama: lm.nama, pic: lm.pic, komitmen: lm.komitmen }}
          onClose={() => setShowEditLM(false)}
          onSave={(nama, pic, komitmen) => onUpdateLM(lm.id, nama, pic, komitmen)}
        />
      )}
    </>
  );
}

// ── ItemTable ─────────────────────────────────────────────────────────────────

function ItemTable({
  item, index, presentMode, onDelete, onUpdateMeta, onUpdateRealisasi, onUpdateTarget,
}: {
  item: LMItem;
  index: number;
  presentMode?: boolean;
  onDelete: () => void;
  onUpdateMeta: (id: string, nama: string, satuan: string) => Promise<unknown>;
  onUpdateRealisasi: (id: string, field: RealisasiField, value: number) => void;
  onUpdateTarget: (id: string, field: TargetField, value: number) => void;
}) {
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [editingMeta, setEditingMeta] = useState(false);
  const [metaNama, setMetaNama] = useState(item.nama_item);
  const [metaSatuan, setMetaSatuan] = useState(item.satuan);

  const saveMeta = () => {
    setEditingMeta(false);
    if (metaNama.trim() && (metaNama !== item.nama_item || metaSatuan !== item.satuan)) {
      onUpdateMeta(item.id, metaNama.trim(), metaSatuan.trim());
    }
  };

  return (
    <div className="border border-[#E2E8F0] rounded-lg overflow-hidden">
      {/* Item header */}
      <div className="bg-[#E0F2F1] px-3 py-1.5 flex justify-between items-center gap-2">
        {editingMeta ? (
          <div className="flex items-center gap-2 flex-1">
            <input
              autoFocus
              value={metaNama}
              onChange={(e) => setMetaNama(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") saveMeta(); if (e.key === "Escape") setEditingMeta(false); }}
              placeholder="Nama pekerjaan"
              className="flex-1 text-sm text-[#1B2631] bg-white border border-[#00897B] rounded px-2 py-0.5 focus:outline-none"
            />
            <input
              value={metaSatuan}
              onChange={(e) => setMetaSatuan(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") saveMeta(); if (e.key === "Escape") setEditingMeta(false); }}
              placeholder="satuan"
              className="w-20 text-sm text-[#1B2631] bg-white border border-[#00897B] rounded px-2 py-0.5 focus:outline-none"
            />
            <button onClick={saveMeta} className="text-xs text-[#00897B] font-semibold hover:text-[#004D40]">Simpan</button>
          </div>
        ) : (
          <span className="text-sm font-medium text-[#004D40] flex-1">
            {index + 1}. {item.nama_item}
            {item.satuan && <span className="ml-1.5 text-xs text-[#00695C] font-normal">({item.satuan})</span>}
          </span>
        )}

        {!editingMeta && !presentMode && (
          <div className="flex items-center gap-1 shrink-0">
            {confirmDelete ? (
              <>
                <span className="text-xs text-gray-500">Hapus?</span>
                <button onClick={onDelete} className="text-xs text-red-600 font-semibold px-1">Ya</button>
                <button onClick={() => setConfirmDelete(false)} className="text-xs text-gray-400 px-1">Batal</button>
              </>
            ) : (
              <>
                <button onClick={() => setEditingMeta(true)} className="text-[#00897B]/60 hover:text-[#00897B] transition-colors p-0.5" title="Edit nama">
                  <Pencil size={11} />
                </button>
                <button onClick={() => setConfirmDelete(true)} className="text-red-300 hover:text-red-500 transition-colors p-0.5" title="Hapus item">
                  <Trash2 size={11} />
                </button>
              </>
            )}
          </div>
        )}
      </div>

      {/* Score table */}
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-[#f0faf9]">
            <th className="text-left px-3 py-1 text-xs text-[#00695C] font-semibold w-1/3" />
            {WEEKS.map((w) => (
              <th key={w.label} className="text-center px-2 py-1 text-xs text-[#00695C] font-bold">{w.label}</th>
            ))}
            <th className="text-center px-2 py-1 text-xs text-[#004D40] font-bold bg-[#b2dfdb]">TOTAL</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td className="px-3 py-1 text-xs text-gray-500 font-medium">TARGET</td>
            {WEEKS.map((w) => (
              <td key={w.label} className="text-center px-1 py-0.5">
                {presentMode ? (
                  <span className="text-sm font-medium text-[#1B2631] px-2">{item[w.targetField] as number}</span>
                ) : (
                  <EditableCell
                    value={item[w.targetField] as number}
                    onSave={(val) => onUpdateTarget(item.id, w.targetField, val)}
                  />
                )}
              </td>
            ))}
            <td className="text-center px-2 py-1 text-sm font-bold text-[#004D40] bg-[#e0f2f1]">
              {WEEKS.reduce((sum, w) => sum + (item[w.targetField] as number), 0)}
            </td>
          </tr>
          <tr className="bg-gray-50">
            <td className="px-3 py-1 text-xs text-gray-500 font-medium">REALISASI</td>
            {WEEKS.map((w) => (
              <td key={w.label} className="text-center px-1 py-0.5">
                {presentMode ? (
                  <span className="text-sm font-medium text-[#1B2631] px-2">{item[w.realisasiField] as number}</span>
                ) : (
                  <EditableCell
                    value={item[w.realisasiField] as number}
                    onSave={(val) => onUpdateRealisasi(item.id, w.realisasiField, val)}
                  />
                )}
              </td>
            ))}
            <td className="text-center px-2 py-1 text-sm font-bold text-[#004D40] bg-[#e0f2f1]">
              {WEEKS.reduce((sum, w) => sum + (item[w.realisasiField] as number), 0)}
            </td>
          </tr>
          <tr>
            <td className="px-3 py-1 text-xs text-gray-500 font-medium">STATUS</td>
            {WEEKS.map((w) => {
              const target = item[w.targetField] as number;
              const realisasi = item[w.realisasiField] as number;
              if (target === 0) return (
                <td key={w.label} className="text-center px-2 py-1.5">
                  <span className="text-gray-300 text-xs">—</span>
                </td>
              );
              const win = realisasi >= target;
              return (
                <td key={w.label} className="text-center px-1 py-1.5">
                  <span className={`text-xs font-bold px-2 py-0.5 rounded text-white ${win ? "bg-green-600" : "bg-red-600"}`}>
                    {win ? "WIN" : "LOSE"}
                  </span>
                </td>
              );
            })}
            {(() => {
              const totalTarget = WEEKS.reduce((s, w) => s + (item[w.targetField] as number), 0);
              const totalReal = WEEKS.reduce((s, w) => s + (item[w.realisasiField] as number), 0);
              if (totalTarget === 0) return <td className="text-center px-2 py-1.5 bg-[#e0f2f1]"><span className="text-gray-300 text-xs">—</span></td>;
              const win = totalReal >= totalTarget;
              return (
                <td className="text-center px-1 py-1.5 bg-[#e0f2f1]">
                  <span className={`text-xs font-bold px-2 py-0.5 rounded text-white ${win ? "bg-green-600" : "bg-red-600"}`}>
                    {win ? "WIN" : "LOSE"}
                  </span>
                </td>
              );
            })()}
          </tr>
        </tbody>
      </table>
    </div>
  );
}
