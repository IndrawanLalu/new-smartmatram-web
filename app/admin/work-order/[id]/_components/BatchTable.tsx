"use client";

import { useMemo, useState } from "react";
import { Plus, Trash2, ChevronLeft, ChevronRight, Camera, MapPin } from "lucide-react";
import { normalizeMeasureCell } from "@/lib/parseLocaleNumber";
import { useRoles } from "@/app/admin/_hooks/useRoles";
import { useCurrentUser } from "@/app/admin/_context/UserContext";
import { woStage, type WoBatch, type WoColumnType } from "../../_types";
import { STAGE_CONFIG } from "../../_constants";
import { useWorkOrderDetail } from "../../_hooks/useWorkOrderDetail";
import ApprovalModal from "./ApprovalModal";
import ConfirmDialog from "@/app/admin/_components/ConfirmDialog";

interface ConfirmState {
  title: string;
  message: React.ReactNode;
  tone?: "danger" | "primary";
  confirmLabel?: string;
  onConfirm: () => void;
}

type Detail = ReturnType<typeof useWorkOrderDetail>;
const PAGE_SIZE = 20;

const inputType = (t: WoColumnType) =>
  t === "number" ? "number" : t === "date" ? "date" : "text";

function EditableCell({
  value,
  type,
  onCommit,
}: {
  value: string;
  type: WoColumnType;
  onCommit: (v: string) => void;
}) {
  const [v, setV] = useState(value);
  return (
    <input
      autoFocus
      type={inputType(type)}
      value={v}
      onChange={(e) => setV(e.target.value)}
      onBlur={() => onCommit(v)}
      onKeyDown={(e) => {
        if (e.key === "Enter") (e.target as HTMLInputElement).blur();
        if (e.key === "Escape") { setV(value); (e.target as HTMLInputElement).blur(); }
      }}
      className="w-full min-w-[90px] px-1.5 py-1 border border-[#00897B] rounded text-[13px] focus:outline-none focus:ring-2 focus:ring-[#00897B]/20"
    />
  );
}

interface BatchTableProps {
  batch: WoBatch;
  detail: Detail;
}

export default function BatchTable({ batch, detail }: BatchTableProps) {
  const {
    items, toggleStatus, setRealisasiDate, updateCell, updateRegu, updateVerifier,
    verifyItem, unverifyItem, approveItem, unapproveItem, addRow, deleteRow,
  } = detail;
  const { eksekutorRoles, verifierRoles, roles } = useRoles();
  const user = useCurrentUser();
  const myRole = roles.find((r) => r.code === user.role);
  const canVerify = !!myRole?.can_verify_wo;
  const canApprove = !!myRole?.can_approve_wo;

  const visibleCols = useMemo(() => batch.columns.filter((c) => !c.hidden), [batch.columns]);
  const [page, setPage] = useState(1);
  const [editing, setEditing] = useState<{ id: string; key: string } | null>(null);
  const [reviewId, setReviewId] = useState<string | null>(null);
  const reviewItem = items.find((it) => it.id === reviewId) ?? null;
  const [confirmDlg, setConfirmDlg] = useState<ConfirmState | null>(null);

  const totalPages = Math.max(1, Math.ceil(items.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const pageItems = items.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);
  const startNo = (safePage - 1) * PAGE_SIZE;

  return (
    <div className="bg-white rounded-xl shadow-sm border border-[#E2E8F0]">
      <div className="overflow-x-auto">
        <table className="w-full text-[13px] border-collapse">
          <thead>
            <tr className="bg-[#E0F2F1] text-[#00695C] text-[11px] uppercase tracking-wide">
              <th className="px-3 py-2.5 text-left font-semibold w-12">No</th>
              {visibleCols.map((c) => (
                <th key={c.key} className="px-3 py-2 text-left font-semibold whitespace-nowrap">
                  {c.label}
                  {c.key === batch.measure_column && batch.measure_unit ? ` (${batch.measure_unit})` : ""}
                </th>
              ))}
              <th className="px-3 py-2 text-left font-semibold">Regu</th>
              <th className="px-3 py-2 text-left font-semibold">Verifikator</th>
              <th className="px-3 py-2 text-center font-semibold">Status</th>
              <th className="px-3 py-2 text-center font-semibold">Tahap</th>
              <th className="px-3 py-2 text-left font-semibold">Tgl Realisasi</th>
              <th className="px-3 py-2 text-left font-semibold">Bukti</th>
              <th className="px-3 py-2 w-10" />
            </tr>
          </thead>
          <tbody>
            {pageItems.map((item, idx) => (
              <tr key={item.id} className="border-t border-[#EEF2F6] hover:bg-[#F8FAFB] transition-colors">
                <td className="px-3 py-1.5 text-xs tabular-nums text-[#94A3B8]">{startNo + idx + 1}</td>

                {visibleCols.map((c) => {
                  const isEditing = editing?.id === item.id && editing.key === c.key;
                  const val = item.data[c.key] ?? "";
                  const isMeasure = c.key === batch.measure_column;
                  return (
                    <td key={c.key} className="px-3 py-1.5 align-top">
                      {isEditing ? (
                        <EditableCell
                          value={val}
                          type={isMeasure ? "text" : c.type}
                          onCommit={(v) => {
                            updateCell(item, c.key, isMeasure ? normalizeMeasureCell(v) : v);
                            setEditing(null);
                          }}
                        />
                      ) : (
                        <span
                          onClick={() => setEditing({ id: item.id, key: c.key })}
                          className="block min-w-[60px] min-h-[24px] cursor-text rounded px-1.5 py-1 hover:bg-[#E0F2F1]/50 whitespace-pre-wrap"
                        >
                          {val || <span className="text-gray-300">—</span>}
                        </span>
                      )}
                    </td>
                  );
                })}

                {/* Regu */}
                <td className="px-3 py-1.5">
                  <select
                    value={item.regu ?? ""}
                    onChange={(e) => updateRegu(item.id, e.target.value || null)}
                    className="text-xs border border-[#E2E8F0] rounded px-1.5 py-1 focus:outline-none focus:border-[#00897B]"
                  >
                    <option value="">—</option>
                    {eksekutorRoles.map((r) => <option key={r} value={r}>{r}</option>)}
                  </select>
                </td>

                {/* Verifikator */}
                <td className="px-3 py-1.5">
                  <select
                    value={item.verifier_role ?? ""}
                    onChange={(e) => updateVerifier(item.id, e.target.value || null)}
                    className="text-xs border border-[#E2E8F0] rounded px-1.5 py-1 focus:outline-none focus:border-[#00897B]"
                  >
                    <option value="">—</option>
                    {verifierRoles.map((r) => <option key={r} value={r}>{r}</option>)}
                  </select>
                </td>

                {/* Status */}
                <td className="px-3 py-1.5 text-center">
                  <button
                    onClick={() => {
                      const toSelesai = item.status !== "Selesai";
                      setConfirmDlg({
                        title: toSelesai ? "Tandai Selesai?" : "Batalkan status Selesai?",
                        message: toSelesai
                          ? "Baris ini akan ditandai selesai."
                          : "Bukti (foto & lokasi) serta verifikasi/persetujuan pada baris ini akan dihapus.",
                        tone: toSelesai ? "primary" : "danger",
                        confirmLabel: toSelesai ? "Tandai Selesai" : "Batalkan",
                        onConfirm: () => toggleStatus(item),
                      });
                    }}
                    title="Klik untuk ubah status"
                    className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold transition-colors ${
                      item.status === "Selesai"
                        ? "bg-green-50 text-green-700 hover:bg-green-100"
                        : "bg-gray-100 text-gray-500 hover:bg-gray-200"
                    }`}
                  >
                    <span className={`w-1.5 h-1.5 rounded-full ${item.status === "Selesai" ? "bg-green-500" : "bg-gray-400"}`} />
                    {item.status}
                  </button>
                </td>

                {/* Tahap — klik untuk tinjau/setujui (modal) */}
                <td className="px-3 py-1.5 text-center">
                  {(() => {
                    const cfg = STAGE_CONFIG[woStage(item)];
                    return (
                      <button
                        onClick={() => setReviewId(item.id)}
                        title="Tinjau / setujui"
                        className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold cursor-pointer ring-1 ring-inset ring-black/5 hover:ring-black/20 hover:shadow-sm transition-all ${cfg.cls}`}
                      >
                        <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`} /> {cfg.label}
                        <ChevronRight size={11} className="opacity-50 -mr-0.5" />
                      </button>
                    );
                  })()}
                </td>

                {/* Tgl realisasi */}
                <td className="px-3 py-1.5">
                  <input
                    type="date"
                    value={item.tgl_realisasi ?? ""}
                    onChange={(e) => setRealisasiDate(item.id, e.target.value || null)}
                    className="text-xs border border-[#E2E8F0] rounded px-1.5 py-1 focus:outline-none focus:border-[#00897B]"
                  />
                </td>

                {/* Bukti dari mobile: foto + lokasi + penyelesai */}
                <td className="px-3 py-1.5">
                  <div className="flex items-center gap-2">
                    {item.foto_bukti_url && (
                      <a href={item.foto_bukti_url} target="_blank" rel="noopener noreferrer" title="Lihat foto bukti" className="text-[#00897B] hover:text-[#004D40]">
                        <Camera size={15} />
                      </a>
                    )}
                    {item.selesai_lat != null && item.selesai_lng != null && (
                      <a href={`https://maps.google.com/?q=${item.selesai_lat},${item.selesai_lng}`} target="_blank" rel="noopener noreferrer" title="Lihat lokasi" className="text-blue-600 hover:text-blue-800">
                        <MapPin size={15} />
                      </a>
                    )}
                    {item.selesai_by && (
                      <span className="text-xs text-[#5D6D7E] truncate max-w-[90px]" title={item.selesai_by}>{item.selesai_by}</span>
                    )}
                    {item.sheet_synced_at && (
                      <span title={`Terkirim ke Sheet ${new Date(item.sheet_synced_at).toLocaleString("id-ID")}`} className="text-[10px] font-semibold text-green-700 bg-green-50 px-1.5 py-0.5 rounded">Sheet ✓</span>
                    )}
                    {!item.foto_bukti_url && !item.selesai_by && !item.sheet_synced_at && <span className="text-gray-300">—</span>}
                  </div>
                </td>

                <td className="px-3 py-1.5 text-center">
                  <button
                    onClick={() =>
                      setConfirmDlg({
                        title: "Hapus baris?",
                        message: "Baris ini akan dihapus permanen.",
                        tone: "danger",
                        confirmLabel: "Hapus",
                        onConfirm: () => deleteRow(item.id),
                      })
                    }
                    className="text-gray-300 hover:text-red-500"
                  >
                    <Trash2 size={14} />
                  </button>
                </td>
              </tr>
            ))}
            {items.length === 0 && (
              <tr>
                <td colSpan={visibleCols.length + 8} className="px-3 py-8 text-center text-[#5D6D7E]">
                  Belum ada baris.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Footer: add row + pagination */}
      <div className="flex items-center justify-between px-3 py-2.5 border-t border-[#E2E8F0]">
        <button
          onClick={addRow}
          className="flex items-center gap-1.5 text-xs font-medium text-[#00695C] bg-[#E0F2F1] hover:bg-[#B2DFDB] px-3 py-1.5 rounded-lg transition-colors"
        >
          <Plus size={13} /> Tambah Baris
        </button>
        {totalPages > 1 && (
          <div className="flex items-center gap-2 text-xs text-[#5D6D7E]">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={safePage <= 1}
              className="p-1 rounded hover:bg-[#F4F6F8] disabled:opacity-30"
            >
              <ChevronLeft size={16} />
            </button>
            <span>{safePage} / {totalPages}</span>
            <button
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={safePage >= totalPages}
              className="p-1 rounded hover:bg-[#F4F6F8] disabled:opacity-30"
            >
              <ChevronRight size={16} />
            </button>
          </div>
        )}
      </div>

      {reviewItem && (
        <ApprovalModal
          item={reviewItem}
          batch={batch}
          currentUserName={user.name}
          currentUserRole={user.role}
          canVerify={canVerify}
          canApprove={canApprove}
          onVerify={verifyItem}
          onUnverify={unverifyItem}
          onApprove={approveItem}
          onUnapprove={unapproveItem}
          onClose={() => setReviewId(null)}
        />
      )}

      {confirmDlg && (
        <ConfirmDialog
          title={confirmDlg.title}
          message={confirmDlg.message}
          tone={confirmDlg.tone}
          confirmLabel={confirmDlg.confirmLabel}
          onConfirm={confirmDlg.onConfirm}
          onClose={() => setConfirmDlg(null)}
        />
      )}
    </div>
  );
}
