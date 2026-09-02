"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Angka yang berhitung naik dari 0 ke `target`.
 *
 * Dipakai untuk skor juara: angka yang muncul begitu saja terbaca sebagai
 * label, angka yang berhitung terbaca sebagai hasil pertandingan. Memakai rAF
 * langsung, bukan library — ini satu-satunya gerakan di papan juara yang tidak
 * bisa dikerjakan CSS.
 *
 * Menghormati `prefers-reduced-motion`: nilainya langsung final.
 */
export function useCountUp(target: number, durasiMs = 1100, tundaMs = 0): number {
  const [nilai, setNilai] = useState(0);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    const diam = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

    // Nilai akhir pun dipasang lewat rAF, bukan langsung di badan effect —
    // setState sinkron di sini memicu render berantai (dan ditolak lint React).
    const langkah = (now: number) => {
      if (diam || !Number.isFinite(target)) {
        setNilai(target);
        return;
      }
      const t = Math.min(1, Math.max(0, (now - mulai) / durasiMs));
      // easeOutCubic — cepat di awal, mendarat halus di angka akhir.
      setNilai(target * (1 - Math.pow(1 - t, 3)));
      if (t < 1) rafRef.current = requestAnimationFrame(langkah);
    };

    const mulai = performance.now() + tundaMs;
    rafRef.current = requestAnimationFrame(langkah);

    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    };
  }, [target, durasiMs, tundaMs]);

  return nilai;
}
