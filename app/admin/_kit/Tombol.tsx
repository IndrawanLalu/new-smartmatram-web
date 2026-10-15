import type { ButtonHTMLAttributes, ReactNode } from "react";

/**
 * Tombol seragam. `utama` = navy terang (#2F55B0 = brand-600) untuk SATU aksi
 * terpenting di layar; `kedua` bergaris; `hantu` tanpa garis.
 */

const DASAR =
  "inline-flex items-center justify-center gap-2 rounded-xl font-semibold transition-colors disabled:opacity-40 disabled:pointer-events-none whitespace-nowrap";

const RAGAM = {
  utama: "bg-brand-600 text-white shadow-sm hover:bg-brand-700 active:bg-brand-800",
  kedua: "bg-white text-ink border border-line hover:border-brand-300 hover:text-brand-700",
  hantu: "text-ink-soft hover:bg-surface hover:text-ink",
} as const;

const UKURAN = { sm: "h-8 px-3 text-xs", md: "h-9 px-4 text-[13px]" } as const;

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  ragam?: keyof typeof RAGAM;
  ukuran?: keyof typeof UKURAN;
  ikon?: ReactNode;
}

export default function Tombol({ ragam = "kedua", ukuran = "md", ikon, className = "", children, ...rest }: Props) {
  return (
    <button {...rest} className={`${DASAR} ${RAGAM[ragam]} ${UKURAN[ukuran]} ${className}`}>
      {ikon}
      {children}
    </button>
  );
}
