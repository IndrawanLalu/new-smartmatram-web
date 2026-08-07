"use client";

import { Zap, Gauge, Radio, SearchCheck, ClipboardList, type LucideIcon } from "lucide-react";
import { CHIP, CHIP_OFF } from "@/app/admin/_ui";

/**
 * Tautan lompat antar seksi.
 *
 * Sengaja `<a href="#id">` polos, bukan `router.push` — jangkar asli membuat
 * tombol Kembali browser berfungsi dan tautannya bisa disalin ke orang lain
 * langsung menunjuk seksi yang dimaksud.
 */
export const SEKSI: { id: string; label: string; icon: LucideIcon }[] = [
  { id: "seksi-gangguan", label: "Gangguan", icon: Zap },
  { id: "seksi-gardu", label: "Gardu", icon: Gauge },
  { id: "seksi-apkt", label: "APKT", icon: Radio },
  { id: "seksi-inspeksi", label: "Inspeksi", icon: SearchCheck },
  { id: "seksi-pekerjaan", label: "Pekerjaan", icon: ClipboardList },
];

export default function SeksiNav() {
  return (
    <nav className="flex flex-wrap items-center gap-1.5" aria-label="Lompat ke seksi">
      {SEKSI.map(({ id, label, icon: Icon }) => (
        <a key={id} href={`#${id}`} className={`${CHIP} ${CHIP_OFF}`}>
          <Icon size={12} />
          {label}
        </a>
      ))}
    </nav>
  );
}
