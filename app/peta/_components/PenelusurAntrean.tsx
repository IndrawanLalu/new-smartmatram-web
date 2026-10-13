"use client";

import type { ReactNode } from "react";
import { ChevronLeft, ChevronRight, X } from "lucide-react";
import { GARIS, PANEL } from "../_ui";

/**
 * Bilah "‹ 3 / 12 › NAMA ×" di tengah atas peta — menelusuri satu daftar
 * (antrean persetujuan JTR/JTM, gardu portal satu tiang) satu per satu.
 */

interface Props {
  ikon: ReactNode;
  jumlah: number;
  /** Nomor urut yang sedang dibuka (1-based). */
  nomor: number;
  label: ReactNode;
  /** Teks bila daftarnya kosong. */
  kosong: string;
  onGeser: (arah: 1 | -1) => void;
  onTutup: () => void;
  labelTutup: string;
  /** Baris kedua — di bawah penelusur lain yang mungkin menyala bersamaan. */
  bawah?: boolean;
}

export default function PenelusurAntrean({ ikon, jumlah, nomor, label, kosong, onGeser, onTutup, labelTutup, bawah }: Props) {
  return (
    <div
      className={`absolute z-[1000] ${bawah ? "top-[6.5rem]" : "top-14"} left-1/2 -translate-x-1/2 flex items-center gap-2 rounded-xl border px-2 py-1.5 text-xs text-[#e2e8f0] shadow-xl`}
      style={{ background: PANEL, borderColor: GARIS }}
    >
      {ikon}
      {jumlah === 0 ? (
        <span>{kosong}</span>
      ) : (
        <>
          <button onClick={() => onGeser(-1)} className="p-1 rounded hover:bg-white/10" aria-label="Sebelumnya"><ChevronLeft size={15} /></button>
          <span className="tabular-nums">
            {nomor} / {jumlah}
            {label}
          </span>
          <button onClick={() => onGeser(1)} className="p-1 rounded hover:bg-white/10" aria-label="Berikutnya"><ChevronRight size={15} /></button>
        </>
      )}
      <button onClick={onTutup} className="p-1 rounded hover:bg-white/10" aria-label={labelTutup}><X size={14} /></button>
    </div>
  );
}
