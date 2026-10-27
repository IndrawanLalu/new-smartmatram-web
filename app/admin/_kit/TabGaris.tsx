"use client";

import type { ReactNode } from "react";
import { CARD } from "@/app/admin/_ui";

/**
 * Bilah tab bergaris bawah di dalam menu WO — bentuk WO Inspeksi JTM (26 Okt
 * 2026): Daftar WO · Susun WO · … Saringan (ULP, tier) di `kanan`.
 */

export interface ItemTabGaris<K extends string> {
  kunci: K;
  label: string;
  ikon?: ReactNode;
  /** Angka kecil di belakang label; 0/undefined = tidak tampil. */
  angka?: number;
}

interface Props<K extends string> {
  tab: ItemTabGaris<K>[];
  aktif: K;
  onPilih: (k: K) => void;
  kanan?: ReactNode;
}

export default function TabGaris<K extends string>({ tab, aktif, onPilih, kanan }: Props<K>) {
  return (
    <div className={`${CARD} px-4 pt-2 flex flex-wrap items-end justify-between gap-x-4 gap-y-2`}>
      <div className="flex flex-wrap gap-1" role="tablist">
        {tab.map((t) => (
          <button
            key={t.kunci}
            role="tab"
            aria-selected={aktif === t.kunci}
            onClick={() => onPilih(t.kunci)}
            className={`inline-flex items-center gap-1.5 px-3 py-2.5 -mb-px border-b-2 text-[13px] font-semibold transition-colors ${
              aktif === t.kunci ? "border-brand-600 text-brand-700" : "border-transparent text-ink-soft hover:text-ink"
            }`}
          >
            {t.ikon}
            {t.label}
            {!!t.angka && <span className="tabular-nums text-[10px] font-bold px-1.5 rounded-full bg-surface text-ink-soft">{t.angka}</span>}
          </button>
        ))}
      </div>
      {kanan && <div className="flex flex-wrap items-center gap-2 pb-2">{kanan}</div>}
    </div>
  );
}
