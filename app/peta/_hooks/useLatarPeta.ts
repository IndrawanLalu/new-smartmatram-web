"use client";

import { useSyncExternalStore } from "react";

/**
 * Latar peta, diingat PER MODE di browser ini (tampilan, bukan data): mode
 * biasa bawaannya Peta jalan, Mode SLD bawaannya Kosong gelap — di atas peta
 * jalan atau citra, garis SLD sering tenggelam. Kosong terang untuk tangkapan
 * layar ke laporan/WA (mirip SLD cetak).
 *
 * Pola `useGayaPeta`: `useSyncExternalStore`, jadi render server memakai
 * bawaan tanpa salah-cocok hidrasi. Penyimpanan diblokir → pilihan berlaku
 * sampai halaman ditutup.
 */

export type Latar = "kosong" | "terang" | "pudar" | "jalan" | "citra";
export type ModePeta = "biasa" | "sld";

export const PILIHAN_LATAR: { kode: Latar; label: string }[] = [
  { kode: "kosong", label: "Kosong gelap" },
  { kode: "terang", label: "Kosong terang" },
  { kode: "pudar", label: "Peta jalan pudar" },
  { kode: "jalan", label: "Peta jalan" },
  { kode: "citra", label: "Citra satelit" },
];

const SAH = new Set<string>(PILIHAN_LATAR.map((x) => x.kode));
const BAWAAN: Record<ModePeta, Latar> = { biasa: "jalan", sld: "kosong" };
const cadangan = new Map<ModePeta, Latar>();
const pendengar = new Set<() => void>();
const kunci = (m: ModePeta) => `peta-latar-${m}`;

function baca(m: ModePeta): Latar {
  try {
    const v = localStorage.getItem(kunci(m));
    if (v && SAH.has(v)) return v as Latar;
  } catch {
    // diblokir — pakai cadangan di memori
  }
  return cadangan.get(m) ?? BAWAAN[m];
}

function langganan(fn: () => void) {
  pendengar.add(fn);
  return () => pendengar.delete(fn);
}

/** Warna dasar peta di bawah ubin — yang tampil saat latar kosong. */
export const warnaDasar = (l: Latar) => (l === "terang" ? "#F8FAFC" : "#0b1220");

export function useLatarPeta(mode: ModePeta) {
  const latar = useSyncExternalStore(langganan, () => baca(mode), () => BAWAAN[mode]);
  const atur = (v: Latar) => {
    cadangan.set(mode, v);
    try {
      localStorage.setItem(kunci(mode), v);
    } catch {
      // Penyimpanan diblokir — berlaku sampai halaman ditutup saja.
    }
    pendengar.forEach((fn) => fn());
  };
  return [latar, atur] as const;
}
