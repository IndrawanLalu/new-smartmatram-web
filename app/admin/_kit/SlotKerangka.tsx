"use client";

import { createContext, useContext, useState, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { itemUntuk } from "@/app/admin/_nav";

/**
 * Dua wadah milik kerangka admin yang diisi HALAMAN lewat portal:
 *   topbar  saringan halaman (IsiTopbar)
 *   kepala  baris bawah judul, biasanya tab (IsiKepala)
 *
 * Wadahnya didaftarkan lewat callback ref, bukan dicari dengan
 * getElementById: saat pindah dari halaman layar penuh, kepala halaman dan
 * halaman baru lahir di render yang sama — wadahnya belum ada di DOM ketika
 * halaman merender, dan tab akan nyasar ke isi halaman.
 */

interface Slot {
  topbar: HTMLElement | null;
  kepala: HTMLElement | null;
  /** Halaman ini punya kepala halaman (bukan layar penuh). */
  adaKepala: boolean;
  setTopbar: (el: HTMLElement | null) => void;
  setKepala: (el: HTMLElement | null) => void;
}

const Ctx = createContext<Slot | null>(null);

export function SlotProvider({ children }: { children: ReactNode }) {
  const [topbar, setTopbar] = useState<HTMLElement | null>(null);
  const [kepala, setKepala] = useState<HTMLElement | null>(null);
  const ini = itemUntuk(usePathname());
  const adaKepala = !!ini && !ini.item.layarPenuh;
  return <Ctx.Provider value={{ topbar, kepala, adaKepala, setTopbar, setKepala }}>{children}</Ctx.Provider>;
}

export function useSlot(): Slot {
  const s = useContext(Ctx);
  if (!s) throw new Error("useSlot dipakai di luar SlotProvider (kerangka admin).");
  return s;
}

/** Wadah saringan di topbar. */
export function WadahTopbar() {
  const { setTopbar } = useSlot();
  return <div ref={setTopbar} className="flex-1 min-w-0 flex items-center justify-end gap-2" />;
}
