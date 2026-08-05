"use client";

import Link from "next/link";
import { ArrowUpRight, type LucideIcon } from "lucide-react";
import { CARD_LIFT, DISPLAY, EYEBROW } from "@/app/admin/_ui";

interface DomainCardProps {
  icon: LucideIcon;
  title: string;
  /** Angka utama kartu — satu saja, supaya mata tahu ke mana harus jatuh. */
  value: string | number;
  unit?: string;
  href: string;
  hrefLabel: string;
  children: React.ReactNode;
}

export default function DomainCard({
  icon: Icon, title, value, unit, href, hrefLabel, children,
}: DomainCardProps) {
  return (
    <div className={`${CARD_LIFT} flex flex-col p-4`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5">
            <Icon size={13} className="text-ink-muted shrink-0" />
            <p className={`${EYEBROW} truncate`}>{title}</p>
          </div>
          <p className={`${DISPLAY} text-[26px] font-bold leading-tight text-ink mt-1`}>
            {value}
            {unit && <span className="text-sm font-semibold text-ink-muted ml-1">{unit}</span>}
          </p>
        </div>
        <Link
          href={href}
          className="shrink-0 inline-flex items-center gap-1 text-[11px] font-medium text-navy-600 hover:text-navy-500 transition-colors"
        >
          {hrefLabel}
          <ArrowUpRight size={12} />
        </Link>
      </div>

      <div className="mt-3 flex-1">{children}</div>
    </div>
  );
}

// ── Primitif isi kartu ───────────────────────────────────────────────────────

export interface BarRow {
  label: string;
  value: number;
  /** Hex eksplisit; kalau kosong memakai navy sebagai nada netral. */
  color?: string;
}

/**
 * Daftar batang proporsional. Dipakai untuk sebaran status, top penyulang, dan
 * sebaran beban — bentuk yang sama, jadi tidak dibuat tiga komponen berbeda.
 */
export function BarList({ rows, suffix = "" }: { rows: BarRow[]; suffix?: string }) {
  if (rows.length === 0) {
    return <p className="text-[11px] text-ink-muted">Belum ada data pada periode ini.</p>;
  }
  const max = Math.max(...rows.map((r) => r.value), 1);

  return (
    <div className="space-y-1.5">
      {rows.map((r) => (
        <div key={r.label} className="flex items-center gap-2">
          <span className="w-[38%] shrink-0 text-[11px] text-ink-soft truncate" title={r.label}>
            {r.label}
          </span>
          <div className="flex-1 h-1.5 rounded-full bg-surface overflow-hidden">
            <div
              className="h-full rounded-full"
              style={{ width: `${(r.value / max) * 100}%`, backgroundColor: r.color ?? "#2A4A9C" }}
            />
          </div>
          <span className="w-11 shrink-0 text-right text-[11px] font-mono font-semibold text-ink">
            {r.value.toLocaleString("id-ID", { maximumFractionDigits: 1 })}
            {suffix}
          </span>
        </div>
      ))}
    </div>
  );
}

/** Baris angka pendukung di kaki kartu. */
export function MiniStats({ items }: { items: { label: string; value: string | number }[] }) {
  return (
    <div className="mt-3 pt-3 border-t border-line grid grid-cols-3 gap-2">
      {items.map((it) => (
        <div key={it.label} className="min-w-0">
          <p className="text-[10px] text-ink-muted truncate">{it.label}</p>
          <p className="text-[13px] font-semibold text-ink truncate">{it.value}</p>
        </div>
      ))}
    </div>
  );
}
