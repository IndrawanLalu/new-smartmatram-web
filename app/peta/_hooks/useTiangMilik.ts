"use client";

import { useMemo } from "react";
import { kunciMilik, type MilikPenanda } from "@/lib/milikPenanda";
import type { TiangPeta } from "./usePetaIsi";

/**
 * Gardu & peralatan di tiang yang dipakai beberapa penyulang hanya digambar di
 * lapisan pemiliknya; titik pertemuan & yang belum dipilih di semua (10 Okt
 * 2026). Mengembalikan tiang yang siap digambar + tiang yang peralatannya
 * belum dipilih pemiliknya (tanda "?").
 */
export function useTiangMilik(tiang: TiangPeta[], milik: Map<string, MilikPenanda>) {
  const tiangPeta = useMemo(
    () =>
      milik.size === 0
        ? tiang
        : tiang.map((t) =>
            t.jaringan === "jtm" && t.penanda && milik.get(kunciMilik(t.id, t.kelompok))?.tampil === false
              ? { ...t, penanda: null, garduDiTiang: null, namaPeralatan: null }
              : t,
          ),
    [tiang, milik],
  );
  const tandaMilik = useMemo(
    () => [
      ...new Map(
        tiangPeta
          .filter((t) => t.jaringan === "jtm" && t.penanda && milik.get(kunciMilik(t.id, t.kelompok))?.status === "belum")
          .map((t) => [t.id, t]),
      ).values(),
    ],
    [tiangPeta, milik],
  );
  return { tiangPeta, tandaMilik };
}
