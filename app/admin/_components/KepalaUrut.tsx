"use client";

import { ArrowDown, ArrowUp } from "lucide-react";

/**
 * Kepala kolom tanggal yang bisa diklik untuk mengurutkan: terbaru dulu ⇄
 * terlama dulu. Dipakai tabel-tabel halaman PDKB.
 */

export type ArahUrut = "baru" | "lama";

/** Tanggal → angka untuk diurutkan; kosong / tak terbaca selalu di bawah. */
export const nilaiTanggal = (s: string | null | undefined) => {
  const n = s ? Date.parse(s) : NaN;
  return Number.isNaN(n) ? null : n;
};

export const urutTanggal = <T,>(baris: T[], ambil: (b: T) => string | null | undefined, arah: ArahUrut) =>
  [...baris].sort((a, b) => {
    const x = nilaiTanggal(ambil(a));
    const y = nilaiTanggal(ambil(b));
    if (x === null || y === null) return x === y ? 0 : x === null ? 1 : -1;
    return arah === "baru" ? y - x : x - y;
  });

/** Tampilan tanggal yang aman untuk data lama (teks tak terbaca → apa adanya). */
export const tglAman = (s: string | null | undefined) => {
  if (!s) return "—";
  const n = nilaiTanggal(s);
  return n === null ? s : new Date(n).toLocaleDateString("id-ID", { day: "2-digit", month: "short", year: "numeric" });
};

interface Props {
  label: string;
  arah: ArahUrut;
  onUbah: (a: ArahUrut) => void;
  className: string;
}

export default function KepalaUrut({ label, arah, onUbah, className }: Props) {
  return (
    <th className={className} aria-sort={arah === "baru" ? "descending" : "ascending"}>
      <button
        type="button"
        onClick={() => onUbah(arah === "baru" ? "lama" : "baru")}
        className="inline-flex items-center gap-1 hover:text-brand-700"
        title={arah === "baru" ? "Terbaru dulu — klik untuk terlama dulu" : "Terlama dulu — klik untuk terbaru dulu"}
      >
        {label}
        {arah === "baru" ? <ArrowDown size={12} /> : <ArrowUp size={12} />}
      </button>
    </th>
  );
}

/** Hari ini (WITA), YYYY-MM-DD. */
export const hariIniWita = () => new Date(Date.now() + 8 * 3600 * 1000).toISOString().slice(0, 10);

/** Tanggal WITA (YYYY-MM-DD) dari ISO waktu UTC; tanggal polos dibiarkan. */
export const tglWita = (s: string | null | undefined) => {
  if (!s) return "";
  if (s.length <= 10) return s;
  const n = Date.parse(s);
  return Number.isNaN(n) ? s.slice(0, 10) : new Date(n + 8 * 3600 * 1000).toISOString().slice(0, 10);
};
