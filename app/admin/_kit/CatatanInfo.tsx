import { Info } from "lucide-react";
import type { ReactNode } from "react";

/** Baris keterangan kecil berikon (i) — aturan daftar, cara membaca angka. */
export default function CatatanInfo({ children }: { children: ReactNode }) {
  return (
    <p className="flex items-start gap-2 text-[11.5px] text-ink-soft leading-relaxed">
      <Info size={14} strokeWidth={1.75} className="mt-px shrink-0 text-brand-500" />
      <span>{children}</span>
    </p>
  );
}
