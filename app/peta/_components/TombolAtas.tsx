"use client";

import type { ReactNode } from "react";
import { GARIS } from "../_ui";

/**
 * Tombol di bilah atas peta. Menyala = bercincin dan berlatar warna nadanya;
 * lencana = jumlah yang menunggu (0 = tanpa lencana). Dulu pola kelas + gaya
 * ini ditulis ulang di tiap tombol.
 */

export const TOMBOL_ATAS =
  "h-9 px-3 rounded-xl text-[#e2e8f0] text-sm font-medium backdrop-blur-sm flex items-center gap-2 border hover:bg-white/5";

/** Latar tombol yang padam — juga dipakai bilah keadaan & tautan Kembali. */
export const GAYA_PADAM = { background: "rgba(10,22,40,0.85)", borderColor: GARIS };

const NADA = {
  teal: { cincin: "ring-1 ring-[#00897B]", latar: "rgba(0,137,123,0.35)", lencana: "bg-[#00897B]" },
  mint: { cincin: "ring-1 ring-[#5eead4]", latar: "rgba(94,234,212,0.2)", lencana: "bg-[#5eead4]" },
  biru: { cincin: "ring-1 ring-[#60A5FA]", latar: "rgba(96,165,250,0.25)", lencana: "bg-[#60A5FA]" },
  kuning: { cincin: "ring-1 ring-[#FACC15]", latar: "rgba(250,204,21,0.25)", lencana: "bg-[#FACC15]" },
  ungu: { cincin: "ring-1 ring-[#c084fc]", latar: "rgba(192,132,252,0.25)", lencana: "bg-[#c084fc]" },
  jingga: { cincin: "ring-1 ring-[#F59E0B]", latar: "rgba(245,158,11,0.25)", lencana: "bg-[#F59E0B]" },
} as const;

export type NadaTombol = keyof typeof NADA;

interface Props {
  ikon: ReactNode;
  children: ReactNode;
  onClick: () => void;
  aktif?: boolean;
  nada?: NadaTombol;
  lencana?: number;
  title?: string;
  disabled?: boolean;
}

export default function TombolAtas({ ikon, children, onClick, aktif = false, nada = "teal", lencana = 0, title, disabled }: Props) {
  const n = NADA[nada];
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`${TOMBOL_ATAS} ${aktif ? n.cincin : ""}`}
      style={{ ...GAYA_PADAM, background: aktif ? n.latar : GAYA_PADAM.background }}
      title={title}
    >
      {ikon} {children}
      {lencana > 0 && (
        <span className={`ml-0.5 px-1.5 rounded-full ${n.lencana} text-[#0b1220] text-[11px] font-bold`}>{lencana}</span>
      )}
    </button>
  );
}
