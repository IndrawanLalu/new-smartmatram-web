"use client";

import type { ReactNode } from "react";
import { ChevronLeft } from "lucide-react";
import { GARIS } from "../_ui";

/**
 * Satu kelompok tombol di atas peta (JTM / JTR / Gardu). Tertutup = satu
 * tombol; diklik = alat-alatnya meluncur keluar ke kiri. Angka antrean tetap
 * terbaca di tombol kelompok, dan titik menandai ada alat yang sedang menyala
 * walau kelompoknya tertutup.
 */

interface Props {
  label: string;
  terbuka: boolean;
  onBuka: () => void;
  /** Jumlah yang menunggu (persetujuan, portal) — 0 = tanpa angka. */
  angka: number;
  warnaAngka: string;
  /** Ada alat di kelompok ini yang sedang menyala. */
  menyala: boolean;
  kelas: string;
  children: ReactNode;
}

export default function MenuKelompok({ label, terbuka, onBuka, angka, warnaAngka, menyala, kelas, children }: Props) {
  return (
    <div className="flex items-center">
      <div
        className={`flex items-center gap-2 py-1 whitespace-nowrap [&>*]:shrink-0 overflow-hidden transition-all duration-300 ease-out ${
          terbuka ? "max-w-[1000px] opacity-100 translate-x-0 pl-1 pr-2" : "max-w-0 opacity-0 translate-x-4 pointer-events-none"
        }`}
        aria-hidden={!terbuka}
      >
        {children}
      </div>
      <button
        onClick={onBuka}
        className={`${kelas} relative ${terbuka ? "ring-1 ring-[#5eead4]" : ""}`}
        style={{ background: terbuka ? "rgba(94,234,212,0.18)" : "rgba(10,22,40,0.85)", borderColor: GARIS }}
        aria-expanded={terbuka}
      >
        <ChevronLeft size={15} className={`transition-transform duration-300 ${terbuka ? "rotate-180" : ""}`} />
        {label}
        {angka > 0 && (
          <span className="ml-0.5 px-1.5 rounded-full text-[#0b1220] text-[11px] font-bold" style={{ background: warnaAngka }}>
            {angka}
          </span>
        )}
        {menyala && !terbuka && (
          <span className="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full bg-[#5eead4] border-2 border-[#0b1220]" />
        )}
      </button>
    </div>
  );
}
