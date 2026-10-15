"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { ArrowDown, ArrowUp, ArrowUpDown, ChevronLeft, ChevronRight, MoreHorizontal } from "lucide-react";
import type { Arah } from "./urutan";
import { IKON_STROKE } from "@/lib/ikonUi";

/**
 * Bagian-bagian tabel seragam (rencana-ui-baru.md §4): wadah kartu, kepala
 * kolom berikon, sel dua baris, menu ⋯ per baris, kaki halaman, keadaan
 * memuat & kosong. Tabelnya sendiri tetap <table> biasa di tiap halaman —
 * kolomnya beda-beda, bagian-bagiannya yang seragam.
 */

export const TD = "px-3 py-3 border-b border-line align-middle text-[12.5px]";

/**
 * Wadah tabel. Area gulirnya SENDIRI (samping & tegak, setinggi layar) supaya
 * kepala tabel bisa menempel: pembungkus `overflow-x-auto` membatalkan
 * `sticky` terhadap gulir halaman (14 Okt 2026). `kaki` (halaman, total)
 * di luar area gulir — selalu terlihat. Tabel di dalamnya wajib
 * `border-separate border-spacing-0`: garis `border-collapse` tidak ikut
 * menempel.
 */
export function KartuTabel({ children, kaki }: { children: ReactNode; kaki?: ReactNode }) {
  return (
    <div className="bg-white rounded-2xl border border-line shadow-card overflow-hidden">
      <div className="overflow-auto max-h-[calc(100vh-var(--topbar-h)-1.5rem)]">{children}</div>
      {kaki && <div className="border-t border-line">{kaki}</div>}
    </div>
  );
}

interface KolomProps {
  ikon?: LucideIcon;
  children?: ReactNode;
  kanan?: boolean;
  lebar?: string;
  /** Kolom yang bisa diurutkan — dari `useUrutan().kolom(k)`. */
  urut?: { arah: Arah | null; onKlik: () => void };
  /** Garis tegas di semua sisi — untuk tabel rekap berbentuk kisi. */
  bergaris?: boolean;
}

export function Kolom({ ikon: Ikon, children, kanan, lebar, urut, bergaris }: KolomProps) {
  const isi = (
    <span className={`inline-flex items-center gap-1.5 ${kanan ? "flex-row-reverse" : ""}`}>
      {Ikon && <Ikon size={14} strokeWidth={IKON_STROKE} className="text-ink-muted" />}
      {children}
      {urut &&
        (urut.arah === "naik" ? (
          <ArrowUp size={13} className="text-brand-600" />
        ) : urut.arah === "turun" ? (
          <ArrowDown size={13} className="text-brand-600" />
        ) : (
          <ArrowUpDown size={12} className="text-ink-muted/60" />
        ))}
    </span>
  );
  return (
    <th
      className={`sticky top-0 z-10 px-3 py-3 bg-brand-50 text-[11.5px] font-semibold whitespace-nowrap ${
        bergaris ? "border border-slate-300" : "border-b border-line"
      } ${
        kanan ? "text-right" : "text-left"
      } ${urut?.arah ? "text-brand-700" : "text-ink-soft"} ${lebar ?? ""}`}
      aria-sort={urut?.arah === "naik" ? "ascending" : urut?.arah === "turun" ? "descending" : undefined}
    >
      {urut ? (
        <button type="button" onClick={urut.onKlik} className="hover:text-brand-700" title="Urutkan">
          {isi}
        </button>
      ) : (
        isi
      )}
    </th>
  );
}

/** Isi sel dua baris: utama tebal + keterangan kecil. */
export function DuaBaris({ utama, bawah }: { utama: ReactNode; bawah?: ReactNode }) {
  return (
    <>
      <p className="font-semibold text-ink leading-snug">{utama}</p>
      {bawah && <p className="text-[11px] text-ink-muted leading-snug">{bawah}</p>}
    </>
  );
}

export interface AksiBaris {
  label: string;
  onPilih: () => void;
  bahaya?: boolean;
}

/** Menu ⋯ di ujung baris. Klik di luar / Esc menutupnya. */
export function MenuBaris({ aksi }: { aksi: AksiBaris[] }) {
  const [buka, setBuka] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!buka) return;
    const tutup = (e: MouseEvent | KeyboardEvent) => {
      if (e instanceof KeyboardEvent ? e.key === "Escape" : !ref.current?.contains(e.target as Node)) setBuka(false);
    };
    document.addEventListener("mousedown", tutup);
    document.addEventListener("keydown", tutup);
    return () => {
      document.removeEventListener("mousedown", tutup);
      document.removeEventListener("keydown", tutup);
    };
  }, [buka]);

  return (
    <div ref={ref} className="relative inline-block" onClick={(e) => e.stopPropagation()}>
      <button
        onClick={() => setBuka((v) => !v)}
        className="p-1.5 rounded-lg text-ink-muted hover:bg-surface hover:text-ink"
        aria-label="Aksi baris"
        aria-expanded={buka}
      >
        <MoreHorizontal size={16} />
      </button>
      {buka && (
        <div className="absolute right-0 top-full mt-1 z-20 min-w-44 rounded-xl border border-line bg-white shadow-float p-1">
          {aksi.map((a) => (
            <button
              key={a.label}
              onClick={() => {
                setBuka(false);
                a.onPilih();
              }}
              className={`w-full text-left rounded-lg px-3 py-2 text-[13px] hover:bg-surface ${a.bahaya ? "text-red-700" : "text-ink"}`}
            >
              {a.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

interface KakiProps {
  hal: number;
  total: number;
  onHal: (h: number) => void;
  ringkas: ReactNode;
}

export function KakiTabel({ hal, total, onHal, ringkas }: KakiProps) {
  return (
    <div className="flex items-center justify-between gap-2 px-4 py-3 text-xs text-ink-soft">
      <span>{ringkas}</span>
      <div className="flex items-center gap-1">
        <button onClick={() => onHal(hal - 1)} disabled={hal <= 1} className="p-1.5 rounded-lg hover:bg-surface disabled:opacity-30" aria-label="Halaman sebelumnya">
          <ChevronLeft size={15} />
        </button>
        <span className="tabular-nums px-1">{hal} / {total}</span>
        <button onClick={() => onHal(hal + 1)} disabled={hal >= total} className="p-1.5 rounded-lg hover:bg-surface disabled:opacity-30" aria-label="Halaman berikutnya">
          <ChevronRight size={15} />
        </button>
      </div>
    </div>
  );
}

/** Baris kerangka selama memuat — bentuk tabel sudah terlihat. */
export function BarisMemuat({ kolom, baris = 8 }: { kolom: number; baris?: number }) {
  return (
    <>
      {Array.from({ length: baris }, (_, i) => (
        <tr key={i}>
          {Array.from({ length: kolom }, (_, j) => (
            <td key={j} className={TD}>
              <div className="h-3 rounded bg-surface animate-pulse" style={{ width: `${40 + ((i * 7 + j * 13) % 50)}%` }} />
            </td>
          ))}
        </tr>
      ))}
    </>
  );
}

export function TabelKosong({ judul, children }: { judul: string; children?: ReactNode }) {
  return (
    <div className="bg-white rounded-2xl border border-line shadow-card p-10 text-center">
      <p className="text-sm font-semibold text-ink">{judul}</p>
      {children && <p className="text-xs text-ink-soft mt-1.5 max-w-md mx-auto">{children}</p>}
    </div>
  );
}
