"use client";

import { useState } from "react";
import Link from "next/link";
import { Trash2, ChevronRight } from "lucide-react";
import ConfirmDialog from "@/app/admin/_components/ConfirmDialog";
import { CARD_LIFT, DISPLAY } from "@/app/admin/_ui";
import type { WoBatchWithStats } from "../_types";

interface BatchCardProps {
  batch: WoBatchWithStats;
  showUlp: boolean;
  onDelete: (id: string) => void;
}

export default function BatchCard({ batch, showUlp, onDelete }: BatchCardProps) {
  const [confirming, setConfirming] = useState(false);
  const pct = batch.total > 0 ? Math.round((batch.selesai / batch.total) * 100) : 0;

  return (
    <>
      <div className={`${CARD_LIFT} group relative p-5`}>
        <button
          onClick={() => setConfirming(true)}
          title="Hapus WO"
          aria-label={`Hapus WO ${batch.judul}`}
          className="absolute top-3 right-3 z-10 text-gray-300 hover:text-red-500 transition-colors opacity-0 group-hover:opacity-100 focus:opacity-100"
        >
          <Trash2 size={15} />
        </button>

        <Link href={`/admin/work-order/${batch.id}`} className="block">
          <h3 className={`${DISPLAY} font-bold text-ink pr-6 line-clamp-2`}>
            {batch.judul || "(tanpa judul)"}
          </h3>
          {showUlp && <p className="text-xs text-ink-soft mt-0.5">ULP {batch.ulp}</p>}

          <div className="mt-4 space-y-1.5">
            <div className="flex items-center justify-between text-xs">
              <span className="text-ink-soft">Realisasi</span>
              <span className="font-semibold text-navy-600 tabular-nums">
                {batch.selesai}/{batch.total} · {pct}%
              </span>
            </div>
            <div className="h-2 rounded-full bg-navy-100 overflow-hidden">
              <div
                className="h-full bg-navy-600 rounded-full transition-all duration-500"
                style={{ width: `${pct}%` }}
              />
            </div>
          </div>

          <div className="mt-4 flex items-center justify-end text-xs text-navy-600 font-medium">
            Buka <ChevronRight size={14} />
          </div>
        </Link>
      </div>

      {confirming && (
        <ConfirmDialog
          title="Hapus Work Order?"
          message={
            <>
              <b>{batch.judul || "(tanpa judul)"}</b> beserta {batch.total} barisnya — termasuk bukti
              foto, verifikasi, dan persetujuan — akan dihapus permanen.
            </>
          }
          tone="danger"
          confirmLabel="Hapus WO"
          onConfirm={() => onDelete(batch.id)}
          onClose={() => setConfirming(false)}
        />
      )}
    </>
  );
}
