"use client";

import Link from "next/link";
import { Trash2, ChevronRight } from "lucide-react";
import type { WoBatchWithStats } from "../_types";

interface BatchCardProps {
  batch: WoBatchWithStats;
  showUlp: boolean;
  onDelete: (id: string) => void;
}

export default function BatchCard({ batch, showUlp, onDelete }: BatchCardProps) {
  const pct = batch.total > 0 ? Math.round((batch.selesai / batch.total) * 100) : 0;

  return (
    <div className="group relative bg-white rounded-xl shadow-sm border border-[#E2E8F0] p-5 hover:border-[#00897B]/50 transition-colors">
      <button
        onClick={() => {
          if (confirm(`Hapus WO "${batch.judul}" beserta semua barisnya?`)) onDelete(batch.id);
        }}
        title="Hapus WO"
        className="absolute top-3 right-3 text-gray-300 hover:text-red-500 transition-colors opacity-0 group-hover:opacity-100"
      >
        <Trash2 size={15} />
      </button>

      <Link href={`/admin/work-order/${batch.id}`} className="block">
        <h3 className="font-semibold text-[#1B2631] pr-6 line-clamp-2">{batch.judul || "(tanpa judul)"}</h3>
        {showUlp && <p className="text-xs text-[#5D6D7E] mt-0.5">ULP {batch.ulp}</p>}

        <div className="mt-4 space-y-1.5">
          <div className="flex items-center justify-between text-xs">
            <span className="text-[#5D6D7E]">Realisasi</span>
            <span className="font-semibold text-[#00695C]">
              {batch.selesai}/{batch.total} · {pct}%
            </span>
          </div>
          <div className="h-2 rounded-full bg-[#E0F2F1] overflow-hidden">
            <div
              className="h-full bg-linear-to-r from-[#004D40] to-[#00897B] rounded-full transition-all"
              style={{ width: `${pct}%` }}
            />
          </div>
        </div>

        <div className="mt-4 flex items-center justify-end text-xs text-[#00897B] font-medium">
          Buka <ChevronRight size={14} />
        </div>
      </Link>
    </div>
  );
}
