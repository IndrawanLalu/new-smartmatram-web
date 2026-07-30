"use client";

import { useState } from "react";
import { X, Users, ShieldCheck, CheckCircle2, Trash2, BadgeCheck } from "lucide-react";

interface WoBulkBarProps {
  count: number;
  canManage: boolean;
  canVerify: boolean;
  canApprove: boolean;
  eksekutorRoles: string[];
  verifierRoles: string[];
  onSetRegu: (regu: string | null) => void;
  onSetVerifier: (role: string | null) => void;
  onMarkDone: () => void;
  onVerify: (slaOk: boolean) => void;
  onApprove: () => void;
  onDelete: () => void;
  onClear: () => void;
}

/** Nilai sentinel — `value=""` tak bisa dipakai karena sama dengan placeholder,
 *  sehingga memilih "kosongkan" tidak akan memicu onChange. */
const CLEAR = "__clear";

const ACTION =
  "inline-flex items-center gap-1.5 h-8 px-3 rounded-lg text-xs font-medium bg-white/10 hover:bg-white/20 transition-colors whitespace-nowrap";
const SELECT =
  "h-8 rounded-lg bg-white/10 hover:bg-white/20 border-0 px-2 text-xs font-medium text-white focus:outline-none focus:ring-2 focus:ring-white/40 transition-colors [&>option]:text-ink";

export default function WoBulkBar({
  count,
  canManage,
  canVerify,
  canApprove,
  eksekutorRoles,
  verifierRoles,
  onSetRegu,
  onSetVerifier,
  onMarkDone,
  onVerify,
  onApprove,
  onDelete,
  onClear,
}: WoBulkBarProps) {
  const [askSla, setAskSla] = useState(false);

  return (
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40 animate-slide-up">
      {askSla && (
        <div className="mb-2 flex justify-center gap-2 rounded-2xl bg-white shadow-float border border-line p-2">
          <button
            onClick={() => { onVerify(true); setAskSla(false); }}
            className="px-3 h-8 rounded-lg text-xs font-medium bg-green-600 text-white hover:bg-green-700"
          >
            Sesuai SLA
          </button>
          <button
            onClick={() => { onVerify(false); setAskSla(false); }}
            className="px-3 h-8 rounded-lg text-xs font-medium bg-red-600 text-white hover:bg-red-700"
          >
            Tidak sesuai
          </button>
          <button
            onClick={() => setAskSla(false)}
            className="px-3 h-8 rounded-lg text-xs text-ink-soft hover:bg-surface"
          >
            Batal
          </button>
        </div>
      )}

      <div className="flex items-center gap-2 rounded-2xl bg-navy-900 text-white shadow-float px-3 py-2 max-w-[calc(100vw-2rem)] overflow-x-auto">
        <span className="text-xs font-semibold tabular-nums shrink-0 pl-1">
          {count} dipilih
        </span>
        <span className="w-px h-5 bg-white/20 shrink-0" />

        {canManage && (
          <>
            <label className="flex items-center gap-1.5 shrink-0">
              <Users size={13} className="opacity-60" />
              <select
                aria-label="Tetapkan regu"
                defaultValue=""
                onChange={(e) => {
                  const v = e.target.value;
                  e.currentTarget.value = "";
                  onSetRegu(v === CLEAR ? null : v);
                }}
                className={SELECT}
              >
                <option value="" disabled>Tetapkan regu…</option>
                {eksekutorRoles.map((r) => <option key={r} value={r}>{r}</option>)}
                <option value={CLEAR}>— kosongkan —</option>
              </select>
            </label>

            {verifierRoles.length > 0 && (
              <label className="flex items-center gap-1.5 shrink-0">
                <BadgeCheck size={13} className="opacity-60" />
                <select
                  aria-label="Tetapkan verifikator"
                  defaultValue=""
                  onChange={(e) => {
                    const v = e.target.value;
                    e.currentTarget.value = "";
                    onSetVerifier(v === CLEAR ? null : v);
                  }}
                  className={SELECT}
                >
                  <option value="" disabled>Verifikator…</option>
                  {verifierRoles.map((r) => <option key={r} value={r}>{r}</option>)}
                  <option value={CLEAR}>— kosongkan —</option>
                </select>
              </label>
            )}

            <button onClick={onMarkDone} className={ACTION}>
              <CheckCircle2 size={13} /> Tandai Selesai
            </button>
          </>
        )}

        {canVerify && (
          <button onClick={() => setAskSla((v) => !v)} className={ACTION}>
            <ShieldCheck size={13} /> Verifikasi
          </button>
        )}

        {canApprove && (
          <button onClick={onApprove} className={ACTION}>
            <CheckCircle2 size={13} /> Setujui
          </button>
        )}

        {canManage && (
          <button
            onClick={onDelete}
            className="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg text-xs font-medium bg-red-500/15 text-red-700 hover:bg-red-500/25 transition-colors whitespace-nowrap"
          >
            <Trash2 size={13} /> Hapus
          </button>
        )}

        <span className="w-px h-5 bg-white/20 shrink-0" />
        <button
          onClick={onClear}
          aria-label="Batalkan pilihan"
          className="h-8 w-8 grid place-items-center rounded-lg hover:bg-white/15 shrink-0"
        >
          <X size={15} />
        </button>
      </div>
    </div>
  );
}
