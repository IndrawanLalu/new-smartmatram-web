"use client";

import { usePathname } from "next/navigation";
import { itemUntuk } from "@/app/admin/_nav";
import KepalaHalaman from "./KepalaHalaman";
import { useSlot } from "./SlotKerangka";

/**
 * Kepala halaman untuk SEMUA halaman admin, dibaca dari `_nav.ts` (ikon,
 * nama, keterangan) — satu sumber, jadi tidak ada halaman yang lupa memasang
 * judulnya atau menulisnya berbeda dari menu. Halaman menitipkan tabnya ke
 * wadah di bawah judul lewat `IsiKepala`. Halaman layar penuh tanpa kepala.
 */
export default function KepalaOtomatis() {
  const ini = itemUntuk(usePathname());
  const { setKepala } = useSlot();
  if (!ini || ini.item.layarPenuh) return null;
  const { item } = ini;
  return (
    <KepalaHalaman
      ikon={item.icon}
      judul={item.label}
      keterangan={item.keterangan ?? ""}
      bawah={<div ref={setKepala} className="empty:hidden" />}
    />
  );
}
