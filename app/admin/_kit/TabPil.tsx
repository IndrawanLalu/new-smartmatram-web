"use client";

import type { LucideIcon } from "lucide-react";

/**
 * Tab halaman berbentuk pil: aktif = navy terang penuh, lainnya putih
 * bergaris. Angka opsional (mis. segmen belum ditugaskan) tampil sebagai
 * lencana kecil — merah bila `angkaMasalah`, amber bila `angkaTunggu`
 * (menunggu persetujuan).
 */

export interface ItemTab<K extends string> {
  kunci: K;
  label: string;
  ikon: LucideIcon;
  angka?: number;
  angkaMasalah?: boolean;
  angkaTunggu?: boolean;
}

interface Props<K extends string> {
  tab: ItemTab<K>[];
  aktif: K;
  onPilih: (k: K) => void;
}

export default function TabPil<K extends string>({ tab, aktif, onPilih }: Props<K>) {
  return (
    <div className="flex flex-wrap gap-2" role="tablist">
      {tab.map(({ kunci, label, ikon: Ikon, angka, angkaMasalah, angkaTunggu }) => {
        const on = kunci === aktif;
        return (
          <button
            key={kunci}
            role="tab"
            aria-selected={on}
            onClick={() => onPilih(kunci)}
            className={`inline-flex items-center gap-2 h-9 px-4 rounded-full text-[13px] font-semibold border transition-colors ${
              on
                ? "bg-brand-600 border-brand-600 text-white shadow-sm"
                : "bg-white border-line text-ink-soft hover:border-brand-300 hover:text-brand-700"
            }`}
          >
            <Ikon size={15} strokeWidth={1.75} />
            {label}
            {!!angka && (
              <span
                className={`tabular-nums text-[10px] font-bold px-1.5 rounded-full ${
                  on
                    ? "bg-white/20 text-white"
                    : angkaMasalah
                      ? "bg-red-100 text-red-700"
                      : angkaTunggu
                        ? "bg-amber-100 text-amber-800"
                        : "bg-surface text-ink-soft"
                }`}
              >
                {angka}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
