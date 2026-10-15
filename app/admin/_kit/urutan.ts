"use client";

import { useMemo, useState } from "react";

/**
 * Urutkan tabel per kolom (klik kepala kolom: naik → turun → urutan bawaan).
 * Urutan bawaan = urutan yang diberikan halaman (mis. per regu → penyulang),
 * jadi kembali ke sana selalu mungkin. Nilai kosong selalu di bawah.
 */

export type Arah = "naik" | "turun";
type Nilai = string | number | null | undefined;

export function useUrutan<T, K extends string>(baris: T[], nilai: Record<K, (b: T) => Nilai>) {
  const [urut, setUrut] = useState<{ kolom: K; arah: Arah } | null>(null);

  const hasil = useMemo(() => {
    if (!urut) return baris;
    const ambil = nilai[urut.kolom];
    const k = urut.arah === "naik" ? 1 : -1;
    return [...baris].sort((a, b) => {
      const x = ambil(a);
      const y = ambil(b);
      const kx = x === null || x === undefined || x === "";
      const ky = y === null || y === undefined || y === "";
      if (kx || ky) return kx === ky ? 0 : kx ? 1 : -1;
      return (typeof x === "number" && typeof y === "number" ? x - y : String(x).localeCompare(String(y), "id")) * k;
    });
    // `nilai` berisi fungsi pengambil yang tetap per halaman.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [baris, urut]);

  /** Status kolom untuk kepala tabel (`Kolom` prop `urut`). */
  const kolom = (k: K) => ({
    arah: urut?.kolom === k ? urut.arah : null,
    onKlik: () =>
      setUrut((u) => (u?.kolom !== k ? { kolom: k, arah: "naik" } : u.arah === "naik" ? { kolom: k, arah: "turun" } : null)),
  });

  return { baris: hasil, kolom };
}
