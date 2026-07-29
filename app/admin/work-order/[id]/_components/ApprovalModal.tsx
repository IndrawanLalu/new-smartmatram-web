"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import { X, MapPin, CheckCircle2, ShieldCheck, Undo2, Camera, Clock, Maximize2 } from "lucide-react";
import { woStage, type WoBatch, type WoItem } from "../../_types";
import { STAGE_CONFIG } from "../../_constants";

const LocationMap = dynamic(() => import("../../_components/LocationMap"), { ssr: false });

const fmtDateTime = (iso: string | null) => {
  if (!iso) return "-";
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}`;
};

interface ApprovalModalProps {
  item: WoItem;
  batch: WoBatch;
  currentUserName: string;
  currentUserRole: string;
  canVerify: boolean;
  canApprove: boolean;
  onVerify: (id: string, p: { by: string; role: string; slaOk: boolean; note: string | null }) => void;
  onUnverify: (id: string) => void;
  onApprove: (id: string, by: string) => void;
  onUnapprove: (id: string) => void;
  onClose: () => void;
}

export default function ApprovalModal({
  item,
  batch,
  currentUserName,
  currentUserRole,
  canVerify,
  canApprove,
  onVerify,
  onUnverify,
  onApprove,
  onUnapprove,
  onClose,
}: ApprovalModalProps) {
  const stage = woStage(item);
  const st = STAGE_CONFIG[stage];
  const visibleCols = (batch.columns || []).filter((c) => !c.hidden);
  const title =
    (batch.title_column && item.data[batch.title_column]) ||
    visibleCols.map((c) => item.data[c.key]).find((v) => v?.trim()) ||
    `Baris ${item.urutan + 1}`;

  const eligibleVerifier = canVerify && (!item.verifier_role || item.verifier_role === currentUserRole);
  const showVerifyForm = stage === "Dikerjakan" && eligibleVerifier;
  const showApprove = stage === "Diverifikasi" && canApprove;

  const [slaOk, setSlaOk] = useState<boolean | null>(null);
  const [note, setNote] = useState("");

  const hasGeo = item.selesai_lat != null && item.selesai_lng != null;

  function handleVerify() {
    if (slaOk === null) return;
    onVerify(item.id, { by: currentUserName, role: currentUserRole, slaOk, note: note.trim() || null });
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-lg max-h-[92vh] flex flex-col">
        {/* Header */}
        <div className="flex items-start justify-between gap-3 px-5 py-4 border-b border-[#E2E8F0]">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className={`inline-flex items-center gap-1.5 text-xs font-semibold px-2 py-0.5 rounded-full ${st.cls}`}>
                <span className={`w-1.5 h-1.5 rounded-full ${st.dot}`} /> {st.label}
              </span>
              {item.regu && <span className="text-xs text-[#5D6D7E]">Regu {item.regu}</span>}
            </div>
            <h3 className="font-bold text-[#1B2631] mt-1 truncate">{title}</h3>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 shrink-0"><X size={20} /></button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          {/* Rincian */}
          <div>
            <p className="text-[11px] font-semibold text-[#94A3B8] uppercase tracking-wide mb-2">Rincian</p>
            <div className="rounded-lg border border-[#E2E8F0] divide-y divide-[#EEF2F6]">
              {visibleCols.map((c) => (
                <div key={c.key} className="flex justify-between gap-3 px-3 py-1.5 text-sm">
                  <span className="text-[#5D6D7E]">{c.label}</span>
                  <span className="text-[#1B2631] font-medium text-right">{item.data[c.key] || "-"}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Bukti lapangan */}
          {stage !== "Belum" && (
            <div>
              <p className="text-[11px] font-semibold text-[#94A3B8] uppercase tracking-wide mb-2">Bukti Lapangan</p>
              {item.foto_bukti_url ? (
                <a
                  href={item.foto_bukti_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block relative group rounded-lg overflow-hidden border border-[#E2E8F0]"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={item.foto_bukti_url} alt="Foto bukti" className="w-full max-h-56 object-cover" />
                  <div className="absolute inset-0 bg-black/0 group-hover:bg-black/25 transition-colors flex items-center justify-center">
                    <span className="opacity-0 group-hover:opacity-100 transition-opacity text-white text-xs font-medium flex items-center gap-1 bg-black/50 px-2.5 py-1 rounded-full">
                      <Maximize2 size={12} /> Perbesar
                    </span>
                  </div>
                </a>
              ) : (
                <div className="flex items-center gap-2 text-sm text-[#94A3B8] bg-[#F8FAFB] rounded-lg px-3 py-3">
                  <Camera size={16} /> Tidak ada foto
                </div>
              )}

              {(item.selesai_alamat || hasGeo) && (
                <div className="mt-2 text-sm">
                  <div className="flex items-start gap-1.5 text-[#1B2631]">
                    <MapPin size={15} className="text-[#00897B] mt-0.5 shrink-0" />
                    <span>{item.selesai_alamat || "Alamat belum tersedia"}</span>
                  </div>
                  {hasGeo && (
                    <>
                      <div className="mt-2 overflow-hidden rounded-lg border border-[#E2E8F0]">
                        <LocationMap lat={item.selesai_lat!} lng={item.selesai_lng!} label={item.selesai_alamat ?? undefined} />
                      </div>
                      <a
                        href={`https://maps.google.com/?q=${item.selesai_lat},${item.selesai_lng}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-block mt-1.5 text-xs text-blue-600 hover:underline"
                      >
                        {item.selesai_lat!.toFixed(6)}, {item.selesai_lng!.toFixed(6)} — buka di Google Maps
                      </a>
                    </>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Jejak persetujuan */}
          <div>
            <p className="text-[11px] font-semibold text-[#94A3B8] uppercase tracking-wide mb-2">Jejak</p>
            <div className="space-y-2 text-sm">
              <TrailRow icon={CheckCircle2} tone="blue" title="Dikerjakan" active={!!item.selesai_by}
                sub={item.selesai_by ? `${item.selesai_by} · ${item.tgl_realisasi ?? "-"}` : "Belum dikerjakan"} />
              <TrailRow icon={ShieldCheck} tone="cyan" title="Diverifikasi" active={!!item.verified_at}
                sub={item.verified_at
                  ? `${item.verified_by} (${item.verified_role}) · ${fmtDateTime(item.verified_at)}`
                  : item.verifier_role ? `Menunggu ${item.verifier_role}` : "Menunggu verifikasi"}
                badge={item.verified_at ? (item.sla_ok ? { text: "Sesuai SLA", cls: "bg-green-50 text-green-700" } : { text: "Tidak SLA", cls: "bg-red-50 text-red-600" }) : undefined}
                note={item.verified_note} />
              <TrailRow icon={CheckCircle2} tone="green" title="Disetujui" active={!!item.approved_at}
                sub={item.approved_at ? `${item.approved_by} · ${fmtDateTime(item.approved_at)}` : "Menunggu supervisor"} />
            </div>
          </div>

          {/* Form verifikasi */}
          {showVerifyForm && (
            <div className="rounded-lg border border-cyan-200 bg-cyan-50/50 p-3 space-y-3">
              <p className="text-sm font-semibold text-cyan-800">Verifikasi Pekerjaan</p>
              <div>
                <p className="text-xs text-[#5D6D7E] mb-1.5">Apakah sesuai SLA?</p>
                <div className="flex gap-2">
                  <button onClick={() => setSlaOk(true)} className={`flex-1 px-3 py-2 rounded-lg text-sm font-medium border transition-colors ${slaOk === true ? "bg-green-600 border-green-600 text-white" : "bg-white border-[#E2E8F0] text-[#1B2631] hover:border-green-400"}`}>Sesuai SLA</button>
                  <button onClick={() => setSlaOk(false)} className={`flex-1 px-3 py-2 rounded-lg text-sm font-medium border transition-colors ${slaOk === false ? "bg-red-600 border-red-600 text-white" : "bg-white border-[#E2E8F0] text-[#1B2631] hover:border-red-400"}`}>Tidak Sesuai</button>
                </div>
              </div>
              <textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="Catatan verifikasi (opsional)..."
                className="w-full h-16 rounded-lg border border-[#E2E8F0] px-3 py-2 text-sm focus:outline-none focus:border-[#00897B] resize-none" />
            </div>
          )}
        </div>

        {/* Footer aksi */}
        <div className="flex items-center justify-between gap-2 px-5 py-3 border-t border-[#E2E8F0]">
          <div className="flex gap-2">
            {item.verified_at && (eligibleVerifier || canApprove) && (
              <button onClick={() => { onUnverify(item.id); onClose(); }} className="flex items-center gap-1.5 text-xs text-[#5D6D7E] hover:text-red-600 px-2 py-1.5">
                <Undo2 size={13} /> Batalkan verifikasi
              </button>
            )}
            {item.approved_at && canApprove && (
              <button onClick={() => { onUnapprove(item.id); onClose(); }} className="flex items-center gap-1.5 text-xs text-[#5D6D7E] hover:text-red-600 px-2 py-1.5">
                <Undo2 size={13} /> Batalkan setuju
              </button>
            )}
          </div>
          <div className="flex gap-2">
            <button onClick={onClose} className="px-4 py-2 text-sm text-[#5D6D7E] border border-[#E2E8F0] rounded-lg hover:bg-[#F4F6F8]">Tutup</button>
            {showVerifyForm && (
              <button onClick={handleVerify} disabled={slaOk === null}
                className="flex items-center gap-1.5 px-4 py-2 text-sm bg-cyan-600 text-white rounded-lg font-medium disabled:opacity-40">
                <ShieldCheck size={15} /> Verifikasi
              </button>
            )}
            {showApprove && (
              <button onClick={() => { onApprove(item.id, currentUserName); onClose(); }}
                className="flex items-center gap-1.5 px-4 py-2 text-sm bg-linear-to-r from-[#004D40] to-[#00897B] text-white rounded-lg font-medium">
                <CheckCircle2 size={15} /> Setujui
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function TrailRow({
  icon: Icon, tone, title, sub, active, badge, note,
}: {
  icon: typeof Clock; tone: "blue" | "cyan" | "green"; title: string; sub: string; active: boolean;
  badge?: { text: string; cls: string }; note?: string | null;
}) {
  const toneCls = active
    ? tone === "blue" ? "bg-blue-50 text-blue-600" : tone === "cyan" ? "bg-cyan-50 text-cyan-600" : "bg-green-50 text-green-600"
    : "bg-gray-100 text-gray-300";
  return (
    <div className="flex items-start gap-2.5">
      <div className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 ${toneCls}`}><Icon size={15} /></div>
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <span className={`text-sm font-medium ${active ? "text-[#1B2631]" : "text-[#94A3B8]"}`}>{title}</span>
          {badge && <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${badge.cls}`}>{badge.text}</span>}
        </div>
        <p className="text-xs text-[#5D6D7E]">{sub}</p>
        {note && <p className="text-xs text-[#94A3B8] italic mt-0.5">“{note}”</p>}
      </div>
    </div>
  );
}
