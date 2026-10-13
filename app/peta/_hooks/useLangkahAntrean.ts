"use client";

import { useCallback, useState } from "react";

/**
 * Posisi dalam satu daftar yang ditelusuri satu per satu (antrean persetujuan,
 * gardu portal). Maju/mundur berputar; `buka` dipanggil untuk tiap butir yang
 * dituju. Daftar boleh berubah panjang di tengah jalan — nomor dijepit.
 */
export function useLangkahAntrean<T>(daftar: T[], buka: (x: T) => void) {
  const [pos, setPos] = useState(0);
  const n = daftar.length;

  const geser = (arah: 1 | -1) => {
    if (n === 0) return;
    const i = (pos + arah + n) % n;
    setPos(i);
    buka(daftar[i]);
  };
  /** Mulai dari butir pertama (saat penelusur dinyalakan). */
  const keAwal = () => {
    if (n === 0) return;
    setPos(0);
    buka(daftar[0]);
  };

  /** Menandai butir ke-i tanpa membukanya (dibuka dari tempat lain). Stabil —
   *  dipakai klik penanda di peta yang di-memo. */
  const tandai = useCallback((i: number) => setPos(Math.max(0, i)), []);

  return {
    geser,
    keAwal,
    tandai,
    nomor: Math.min(pos + 1, n),
    kini: n > 0 ? daftar[Math.min(pos, n - 1)] : undefined,
  };
}
