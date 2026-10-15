"use client";

import { usePathname } from "next/navigation";
import { itemUntuk } from "@/app/admin/_nav";

/**
 * Kiri topbar: nama kelompok menu — penanda "sedang di bagian mana", jadi
 * tegas: tinta penuh, huruf display, garis navy di depannya (14 Okt 2026).
 * Halaman layar penuh (tanpa kepala halaman) ikut menyebut nama halamannya.
 */
export default function GrupTopbar() {
  const ini = itemUntuk(usePathname());
  if (!ini) return null;
  return (
    <p className="flex items-center gap-2.5 font-display text-[14.5px] font-bold tracking-tight text-ink whitespace-nowrap">
      <span className="w-1 h-5 rounded-full bg-brand-600" aria-hidden />
      {ini.grup.label}
      {ini.item.layarPenuh && <span className="font-semibold text-ink-soft">· {ini.item.label}</span>}
    </p>
  );
}
