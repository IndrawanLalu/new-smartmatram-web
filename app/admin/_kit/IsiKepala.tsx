"use client";

import type { ReactNode } from "react";
import { createPortal } from "react-dom";
import { useSlot } from "./SlotKerangka";

/**
 * Isi baris bawah kepala halaman (biasanya TabPil). Kepala halaman dibuat
 * kerangka admin dari `_nav.ts` (KepalaOtomatis); halaman hanya menitipkan
 * tabnya ke sana. Selama wadahnya belum terdaftar, tidak dirender apa pun —
 * tab muncul langsung di tempatnya, tanpa melompat. Halaman layar penuh
 * (tanpa kepala): dirender di tempat komponen ini dipasang.
 */
export default function IsiKepala({ children }: { children: ReactNode }) {
  const { kepala, adaKepala } = useSlot();
  if (!adaKepala) return <>{children}</>;
  return kepala ? createPortal(children, kepala) : null;
}
