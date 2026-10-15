"use client";

import type { LucideIcon } from "lucide-react";
import { ChevronDown, Search, X } from "lucide-react";
import type { ReactNode } from "react";

/**
 * Field saringan seragam: tinggi 40 px, ikon di kiri, radius 12. Pilihan
 * memakai <select> asli (papan ketik & pembaca layar tetap bekerja) dengan
 * panah sendiri.
 */

const KOTAK =
  "h-10 w-full rounded-xl border border-line bg-white shadow-sm text-[13px] text-ink placeholder:text-ink-muted focus:outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/15 transition-colors disabled:bg-surface disabled:text-ink-soft";

interface PilihProps {
  ikon: LucideIcon;
  nilai: string | number;
  onUbah: (v: string) => void;
  label: string;
  lebar?: string;
  disabled?: boolean;
  children: ReactNode;
}

export function PilihField({ ikon: Ikon, nilai, onUbah, label, lebar = "w-[200px]", disabled, children }: PilihProps) {
  return (
    <label className={`relative ${lebar}`}>
      <span className="sr-only">{label}</span>
      <Ikon size={16} strokeWidth={1.75} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-muted pointer-events-none" />
      <select
        value={nilai}
        onChange={(e) => onUbah(e.target.value)}
        disabled={disabled}
        className={`${KOTAK} appearance-none pl-9 pr-9 font-medium`}
      >
        {children}
      </select>
      <ChevronDown size={15} className="absolute right-3 top-1/2 -translate-y-1/2 text-ink-muted pointer-events-none" />
    </label>
  );
}

interface CariProps {
  nilai: string;
  onUbah: (v: string) => void;
  placeholder: string;
  lebar?: string;
}

export function KotakCari({ nilai, onUbah, placeholder, lebar = "flex-1 min-w-[240px] max-w-[440px]" }: CariProps) {
  return (
    <label className={`relative ${lebar}`}>
      <span className="sr-only">{placeholder}</span>
      <Search size={16} strokeWidth={1.75} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-muted pointer-events-none" />
      <input value={nilai} onChange={(e) => onUbah(e.target.value)} placeholder={placeholder} className={`${KOTAK} pl-9 pr-8`} />
      {nilai && (
        <button
          type="button"
          onClick={() => onUbah("")}
          className="absolute right-2.5 top-1/2 -translate-y-1/2 p-0.5 rounded text-ink-muted hover:text-ink"
          aria-label="Kosongkan pencarian"
        >
          <X size={14} />
        </button>
      )}
    </label>
  );
}
