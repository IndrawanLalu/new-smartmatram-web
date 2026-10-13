"use client";

import { useState } from "react";
import { useIsianPeta } from "./useIsianPeta";
import type { useKoreksiIsian } from "./useKoreksiIsian";
import type { TiangPeta } from "./usePetaIsi";

/**
 * Nilai isian JTM yang ditulis di tiap tiang: ukuran atau jenis kabel (12 Okt
 * 2026), atau isian yang sedang dikoreksi selama mode Koreksi isian aktif
 * (10 Okt 2026).
 */

/** Isian JTM yang bisa ditulis di tiap tiang dari menu JTM. */
export const TULIS_ISIAN = [
  { kode: "ukuran_konduktor", nama: "Ukuran kabel", judul: "Tulis ukuran konduktor JTM di tiap tiang, berwarna per ukuran — yang beda sendiri langsung terlihat" },
  { kode: "jenis_konduktor", nama: "Jenis kabel", judul: "Tulis jenis konduktor JTM (MVTIC, A3C …) di tiap tiang, berwarna per jenis" },
];

export function useTulisIsian(koreksi: ReturnType<typeof useKoreksiIsian>, tiang: TiangPeta[]) {
  const [tulis, setTulis] = useState<string | null>(null);
  const tampil = tulis !== null;
  const item = koreksi.aktif ? koreksi.item : (tulis ?? "ukuran_konduktor");
  const nama = koreksi.aktif
    ? (koreksi.daftarItem.find((x) => x.kode === koreksi.item)?.nama ?? "Isian")
    : (TULIS_ISIAN.find((x) => x.kode === item)?.nama ?? "Isian");
  const peta = useIsianPeta(tampil, item, tiang, koreksi.versi);
  return { tulis, setTulis, tampil, nama, peta };
}
