import { createElement } from "react";
import { IKON_STROKE, ikonKolom } from "@/lib/ikonUi";

/**
 * Ikon kecil di depan teks kepala kolom, dipilih dari kamus kata
 * (`ikonKolom`). Sebaris dengan teks (bukan flex) supaya perataan kiri/
 * tengah/kanan kolom tidak berubah. Kata tak dikenal = tidak ada ikon.
 * `createElement`: ikonnya diambil dari kamus tetap, bukan komponen yang
 * dibuat saat render.
 */
export default function IkonKolom({ teks }: { teks: string }) {
  const ikon = ikonKolom(teks);
  if (!ikon) return null;
  return createElement(ikon, {
    size: 13,
    strokeWidth: IKON_STROKE,
    className: "inline-block align-[-2px] mr-1.5 text-ink-muted",
    "aria-hidden": true,
  });
}
