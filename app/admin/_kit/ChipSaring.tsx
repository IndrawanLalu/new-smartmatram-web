"use client";

import type { ReactNode } from "react";
import { NADA_UI, type NadaStatus } from "@/lib/statusUi";

/**
 * Chip saringan berangka (status, regu …). Satu terpilih; angka tampil
 * redup supaya labelnya yang memimpin. `peringatan` = lencana amber kecil
 * di dalam chip (mis. "3 menunggu"). `nada` = titik warna status yang SAMA
 * dengan pil di tabel — chip sekaligus legenda (14 Okt 2026). Garis chip
 * abu tegas, navy hanya saat disentuh; navy penuh = yang terpilih.
 */

export interface ItemChip<K extends string> {
  kunci: K;
  label: string;
  angka?: number | null;
  ikon?: ReactNode;
  peringatan?: string | null;
  judul?: string;
  nada?: NadaStatus;
}

interface Props<K extends string> {
  item: ItemChip<K>[];
  aktif: K;
  onPilih: (k: K) => void;
}

export default function ChipSaring<K extends string>({ item, aktif, onPilih }: Props<K>) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      {item.map(({ kunci, label, angka, ikon, peringatan, judul, nada }) => {
        const on = kunci === aktif;
        return (
          <button
            key={kunci}
            onClick={() => onPilih(kunci)}
            title={judul}
            className={`inline-flex items-center gap-1.5 h-8 px-3.5 rounded-full text-xs font-semibold border transition-colors whitespace-nowrap ${
              on
                ? "bg-brand-600 border-brand-600 text-white"
                : "bg-white border-slate-300 text-ink-soft hover:border-brand-400 hover:text-brand-700"
            }`}
          >
            {nada && <span className={`w-2 h-2 rounded-full ${NADA_UI[nada].titik} ${on ? "ring-2 ring-white/70" : ""}`} />}
            {ikon}
            {label}
            {angka !== undefined && angka !== null && (
              <span className={`tabular-nums font-medium ${on ? "text-white/75" : "text-ink-muted"}`}>{angka}</span>
            )}
            {peringatan && (
              <span className={`tabular-nums text-[10px] px-1.5 rounded-full ${on ? "bg-white/20" : "bg-amber-100 text-amber-800"}`}>
                {peringatan}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
