"use client";

import Link from "next/link";
import { AlertTriangle, ChevronRight, CircleCheck } from "lucide-react";
import { CARD, EYEBROW } from "@/app/admin/_ui";
import type { AgendaItem } from "../_hooks/useDashboardOverview";

/** Merah dikunci untuk hal yang benar-benar bermasalah, amber untuk yang perlu
 *  diperhatikan. Tidak ada nada ketiga — begitu semua pil berwarna, tidak ada
 *  lagi yang menonjol. */
const TONE = {
  kritis: {
    wrap: "border-red-200 bg-red-50 hover:border-red-300",
    text: "text-red-700",
    sub: "text-red-600/80",
  },
  waspada: {
    wrap: "border-attention/25 bg-attention-tint hover:border-attention/40",
    text: "text-attention",
    sub: "text-attention/75",
  },
} as const;

interface ActionBarProps {
  items: AgendaItem[];
  loading: boolean;
}

export default function ActionBar({ items, loading }: ActionBarProps) {
  if (loading) {
    return (
      <div className={`${CARD} p-4`}>
        <p className={EYEBROW}>Butuh Tindakan</p>
        <div className="mt-2.5 flex gap-2">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="h-14 flex-1 rounded-xl bg-surface animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className={`${CARD} p-4`}>
      <div className="flex items-center gap-2">
        <AlertTriangle size={14} className="text-attention" />
        <p className={EYEBROW}>Butuh Tindakan</p>
      </div>

      {items.length === 0 ? (
        <div className="mt-2.5 flex items-center gap-2 rounded-xl border border-green-200 bg-green-50 px-3 py-3">
          <CircleCheck size={16} className="text-green-700 shrink-0" />
          <p className="text-sm text-green-700">
            Tidak ada anomali atau tunggakan pada periode ini.
          </p>
        </div>
      ) : (
        <div className="mt-2.5 grid gap-2 grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {items.map((it) => {
            const t = TONE[it.tone];
            return (
              <Link
                key={it.id}
                href={it.href}
                className={`group flex items-center gap-2 rounded-xl border px-3 py-2.5 transition-colors ${t.wrap}`}
              >
                <div className="min-w-0 flex-1">
                  <p className={`text-sm font-semibold leading-tight ${t.text}`}>{it.label}</p>
                  <p className={`text-[11px] leading-snug truncate ${t.sub}`}>{it.detail}</p>
                </div>
                <ChevronRight
                  size={14}
                  className={`shrink-0 opacity-0 group-hover:opacity-100 transition-opacity ${t.text}`}
                />
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
