"use client";

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import {
  X, MapPin, CheckCircle2, ShieldCheck, Undo2, Camera, Clock,
  Maximize2, ChevronUp, ChevronDown, RotateCcw,
} from "lucide-react";
import { woStage, type WoBatch, type WoItem } from "../../_types";
import { STAGE_CONFIG, fmtDate, fmtDateTime } from "../../_constants";

const LocationMap = dynamic(() => import("@/app/admin/_components/LocationMap"), { ssr: false });

interface ApprovalDrawerProps {
  item: WoItem;
  batch: WoBatch;
  currentUserName: string;
  currentUserRole: string;
  canManage: boolean;
  canVerify: boolean;
  canApprove: boolean;
  position: { index: number; total: number };
  onPrev: () => void;
  onNext: () => void;
  onToggleStatus: (item: WoItem) => void;
  onVerify: (id: string, p: { by: string; role: string; slaOk: boolean; note: string | null }) => void;
  onUnverify: (id: string) => void;
  onApprove: (id: string, by: string) => void;
  onUnapprove: (id: string) => void;
  onClose: () => void;
}

export default function ApprovalDrawer({
  item, batch, currentUserName, currentUserRole,
  canManage, canVerify, canApprove,
  position, onPrev, onNext,
  onToggleStatus, onVerify, onUnverify, onApprove, onUnapprove, onClose,
}: ApprovalDrawerProps) {
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

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
        return;
      }
      // Pintasan navigasi tidak boleh aktif saat user sedang mengetik catatan.
      const el = e.target as HTMLElement | null;
      if (el && /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName)) return;
      if (e.key === "ArrowDown" || e.key === "j") onNext();
      if (e.key === "ArrowUp" || e.key === "k") onPrev();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, onNext, onPrev]);

  const hasGeo = item.selesai_lat != null && item.selesai_lng != null;

  function handleVerify() {
    if (slaOk === null) return;
    onVerify(item.id, { by: currentUserName, role: currentUserRole, slaOk, note: note.trim() || null });
    onNext();
  }

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-black/40 animate-fade-in" onClick={onClose} />

      <aside
        role="dialog"
        aria-modal="true"
        aria-label={`Detail baris: ${title}`}
        className="relative w-full max-w-[27rem] h-full bg-white shadow-2xl flex flex-col animate-slide-left"
      >
        {/* Header */}
        <div className="px-5 py-4 border-b border-line">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[11px] text-ink-muted tabular-nums">
              Baris {position.index + 1} dari {position.total}
            </span>
            <div className="flex items-center gap-1">
              <button
                onClick={onPrev}
                disabled={position.index === 0}
                aria-label="Baris sebelumnya"
                title="Baris sebelumnya (↑)"
                className="h-7 w-7 grid place-items-center rounded-lg text-ink-soft hover:bg-surface disabled:opacity-30"
              >
                <ChevronUp size={16} />
              </button>
              <button
                onClick={onNext}
                disabled={position.index >= position.total - 1}
                aria-label="Baris berikutnya"
                title="Baris berikutnya (↓)"
                className="h-7 w-7 grid place-items-center rounded-lg text-ink-soft hover:bg-surface disabled:opacity-30"
              >
                <ChevronDown size={16} />
              </button>
              <button
                onClick={onClose}
                aria-label="Tutup"
                className="h-7 w-7 grid place-items-center rounded-lg text-gray-400 hover:bg-surface hover:text-gray-600 ml-1"
              >
                <X size={17} />
              </button>
            </div>
          </div>

          <div className="flex items-center gap-2 mt-2">
            <span className={`inline-flex items-center gap-1.5 text-xs font-semibold px-2 py-0.5 rounded-full ${st.cls}`}>
              <span className={`w-1.5 h-1.5 rounded-full ${st.dot}`} /> {st.label}
            </span>
            {item.regu && <span className="text-xs text-ink-soft">Regu {item.regu}</span>}
          </div>
          <h3 className="font-bold text-ink mt-1.5 leading-snug">{title}</h3>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">
          {/* Rincian */}
          <section>
            <p className="text-[11px] font-semibold text-ink-muted uppercase tracking-wide mb-2">Rincian</p>
            <dl className="rounded-lg border border-line divide-y divide-line">
              {visibleCols.map((c) => (
                <div key={c.key} className="flex justify-between gap-3 px-3 py-1.5 text-sm">
                  <dt className="text-ink-soft shrink-0">{c.label}</dt>
                  <dd className="text-ink font-medium text-right break-words">
                    {item.data[c.key] || "-"}
                    {c.key === batch.measure_column && batch.measure_unit && item.data[c.key]
                      ? ` ${batch.measure_unit}`
                      : ""}
                  </dd>
                </div>
              ))}
            </dl>
          </section>

          {/* Bukti lapangan */}
          {stage !== "Belum" && (
            <section>
              <p className="text-[11px] font-semibold text-ink-muted uppercase tracking-wide mb-2">Bukti Lapangan</p>
              {item.foto_bukti_url ? (
                <a
                  href={item.foto_bukti_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block relative group rounded-lg overflow-hidden border border-line"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={item.foto_bukti_url} alt="Foto bukti pekerjaan" className="w-full max-h-56 object-cover" />
                  <div className="absolute inset-0 group-hover:bg-black/25 transition-colors flex items-center justify-center">
                    <span className="opacity-0 group-hover:opacity-100 transition-opacity text-white text-xs font-medium flex items-center gap-1 bg-black/50 px-2.5 py-1 rounded-full">
                      <Maximize2 size={12} /> Perbesar
                    </span>
                  </div>
                </a>
              ) : (
                <div className="flex items-center gap-2 text-sm text-ink-muted bg-surface rounded-lg px-3 py-3">
                  <Camera size={16} /> Tidak ada foto
                </div>
              )}

              {item.catatan_petugas && (
                <p className="mt-2 text-sm text-ink-soft bg-surface rounded-lg px-3 py-2 italic">
                  “{item.catatan_petugas}”
                </p>
              )}

              {(item.selesai_alamat || hasGeo) && (
                <div className="mt-2 text-sm">
                  <div className="flex items-start gap-1.5 text-ink">
                    <MapPin size={15} className="text-accent mt-0.5 shrink-0" />
                    <span>{item.selesai_alamat || "Alamat belum tersedia"}</span>
                  </div>
                  {hasGeo && (
                    <>
                      <div className="mt-2 overflow-hidden rounded-lg border border-line">
                        <LocationMap
                          lat={item.selesai_lat!}
                          lng={item.selesai_lng!}
                          label={item.selesai_alamat ?? undefined}
                        />
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
            </section>
          )}

          {/* Jejak persetujuan */}
          <section>
            <p className="text-[11px] font-semibold text-ink-muted uppercase tracking-wide mb-2">Jejak</p>
            <div className="space-y-2 text-sm">
              <TrailRow
                icon={CheckCircle2} tone="blue" title="Dikerjakan" active={item.status === "Selesai"}
                sub={item.status === "Selesai"
                  ? `${item.selesai_by ?? "Admin"} · ${fmtDate(item.tgl_realisasi)}`
                  : "Belum dikerjakan"}
              />
              <TrailRow
                icon={ShieldCheck} tone="cyan" title="Diverifikasi" active={!!item.verified_at}
                sub={item.verified_at
                  ? `${item.verified_by} (${item.verified_role}) · ${fmtDateTime(item.verified_at)}`
                  : item.verifier_role ? `Menunggu ${item.verifier_role}` : "Menunggu verifikasi"}
                badge={item.verified_at
                  ? item.sla_ok
                    ? { text: "Sesuai SLA", cls: "bg-green-50 text-green-700" }
                    : { text: "Tidak SLA", cls: "bg-red-50 text-red-600" }
                  : undefined}
                note={item.verified_note}
              />
              <TrailRow
                icon={CheckCircle2} tone="green" title="Disetujui" active={!!item.approved_at}
                sub={item.approved_at
                  ? `${item.approved_by} · ${fmtDateTime(item.approved_at)}`
                  : "Menunggu supervisor"}
              />
            </div>
          </section>

          {/* Form verifikasi */}
          {showVerifyForm && (
            <section className="rounded-lg border border-cyan-200 bg-cyan-50/50 p-3 space-y-3">
              <p className="text-sm font-semibold text-cyan-800">Verifikasi Pekerjaan</p>
              <div>
                <p className="text-xs text-ink-soft mb-1.5">Apakah sesuai SLA?</p>
                <div className="flex gap-2">
                  <button
                    onClick={() => setSlaOk(true)}
                    className={`flex-1 px-3 py-2 rounded-lg text-sm font-medium border transition-colors ${
                      slaOk === true
                        ? "bg-green-600 border-green-600 text-white"
                        : "bg-white border-line text-ink hover:border-green-400"
                    }`}
                  >
                    Sesuai SLA
                  </button>
                  <button
                    onClick={() => setSlaOk(false)}
                    className={`flex-1 px-3 py-2 rounded-lg text-sm font-medium border transition-colors ${
                      slaOk === false
                        ? "bg-red-600 border-red-600 text-white"
                        : "bg-white border-line text-ink hover:border-red-400"
                    }`}
                  >
                    Tidak Sesuai
                  </button>
                </div>
              </div>
              <textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Catatan verifikasi (opsional)…"
                className="w-full h-16 rounded-lg border border-line px-3 py-2 text-sm focus:outline-none focus:border-navy-500 resize-none"
              />
            </section>
          )}
        </div>

        {/* Footer aksi */}
        <div className="border-t border-line px-5 py-3 space-y-2">
          <div className="flex flex-wrap gap-x-3 gap-y-1">
            {canManage && (
              <button
                onClick={() => onToggleStatus(item)}
                className="inline-flex items-center gap-1.5 text-xs text-ink-soft hover:text-accent-deep"
              >
                {item.status === "Selesai" ? <RotateCcw size={13} /> : <CheckCircle2 size={13} />}
                {item.status === "Selesai" ? "Batalkan status selesai" : "Tandai selesai"}
              </button>
            )}
            {item.verified_at && (eligibleVerifier || canApprove) && (
              <button
                onClick={() => onUnverify(item.id)}
                className="inline-flex items-center gap-1.5 text-xs text-ink-soft hover:text-red-600"
              >
                <Undo2 size={13} /> Batalkan verifikasi
              </button>
            )}
            {item.approved_at && canApprove && (
              <button
                onClick={() => onUnapprove(item.id)}
                className="inline-flex items-center gap-1.5 text-xs text-ink-soft hover:text-red-600"
              >
                <Undo2 size={13} /> Batalkan setuju
              </button>
            )}
          </div>

          <div className="flex gap-2">
            <button
              onClick={onClose}
              className="flex-1 px-4 py-2 text-sm text-ink-soft border border-line rounded-lg hover:bg-surface"
            >
              Tutup
            </button>
            {showVerifyForm && (
              <button
                onClick={handleVerify}
                disabled={slaOk === null}
                className="flex-1 inline-flex items-center justify-center gap-1.5 px-4 py-2 text-sm bg-cyan-600 text-white rounded-lg font-medium disabled:opacity-40 hover:bg-cyan-700 transition-colors"
              >
                <ShieldCheck size={15} /> Verifikasi
              </button>
            )}
            {showApprove && (
              <button
                onClick={() => { onApprove(item.id, currentUserName); onNext(); }}
                className="flex-1 inline-flex items-center justify-center gap-1.5 px-4 py-2 text-sm bg-navy-600 hover:bg-navy-500 text-white rounded-lg font-medium"
              >
                <CheckCircle2 size={15} /> Setujui
              </button>
            )}
          </div>
        </div>
      </aside>
    </div>
  );
}

function TrailRow({
  icon: Icon, tone, title, sub, active, badge, note,
}: {
  icon: typeof Clock;
  tone: "blue" | "cyan" | "green";
  title: string;
  sub: string;
  active: boolean;
  badge?: { text: string; cls: string };
  note?: string | null;
}) {
  const toneCls = active
    ? tone === "blue"
      ? "bg-blue-50 text-blue-600"
      : tone === "cyan"
        ? "bg-cyan-50 text-cyan-600"
        : "bg-green-50 text-green-600"
    : "bg-gray-100 text-gray-300";

  return (
    <div className="flex items-start gap-2.5">
      <div className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 ${toneCls}`}>
        <Icon size={15} />
      </div>
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <span className={`text-sm font-medium ${active ? "text-ink" : "text-ink-muted"}`}>{title}</span>
          {badge && (
            <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${badge.cls}`}>{badge.text}</span>
          )}
        </div>
        <p className="text-xs text-ink-soft">{sub}</p>
        {note && <p className="text-xs text-ink-muted italic mt-0.5">“{note}”</p>}
      </div>
    </div>
  );
}
