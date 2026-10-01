"use client";

import { useSyncExternalStore } from "react";
import { WARNA } from "../_ui";

/**
 * Warna & simbol peta yang bisa diatur pengguna (panel Lapisan → Warna &
 * simbol). Disimpan di browser ini saja — tampilan, bukan data.
 *
 * Lewat `useSyncExternalStore`, bukan useState+useEffect: peta dan panel
 * membaca satu sumber yang sama, berubah serempak, dan render server memakai
 * bawaan tanpa salah-cocok hidrasi.
 */

export interface GayaPeta {
  jtm: string;
  jtr: string;
  /** Tiang yang menumpang — batangnya milik penyulang/gardu lain. */
  menumpang: string;
  /** Gawang JTR berkabel ≥2. */
  jtrUb: string;
  /** Kabel JTR yang belum jelas datang dari tiang mana. */
  putus: string;
  /** Tanda "!" di tengah gawang yang kabelnya belum jelas. */
  tandaPutus: boolean;
}

export const GAYA_BAWAAN: GayaPeta = {
  jtm: WARNA.jtm,
  jtr: WARNA.jtr,
  menumpang: "#000000",
  jtrUb: WARNA.jtrUb,
  putus: WARNA.putus,
  tandaPutus: true,
};

const KUNCI = "peta-gaya-v1";
const pendengar = new Set<() => void>();
let mentahTerakhir: string | null = null;
let gayaTerakhir: GayaPeta = GAYA_BAWAAN;

function baca(): GayaPeta {
  let mentah: string | null = null;
  try {
    mentah = localStorage.getItem(KUNCI);
  } catch {
    return GAYA_BAWAAN;
  }
  // Objek yang SAMA selama isinya sama — syarat useSyncExternalStore.
  if (mentah === mentahTerakhir) return gayaTerakhir;
  mentahTerakhir = mentah;
  try {
    gayaTerakhir = mentah ? { ...GAYA_BAWAAN, ...(JSON.parse(mentah) as Partial<GayaPeta>) } : GAYA_BAWAAN;
  } catch {
    gayaTerakhir = GAYA_BAWAAN;
  }
  return gayaTerakhir;
}

function langganan(fn: () => void) {
  pendengar.add(fn);
  return () => pendengar.delete(fn);
}

export function aturGaya(ubah: Partial<GayaPeta> | null) {
  try {
    if (ubah === null) localStorage.removeItem(KUNCI);
    else localStorage.setItem(KUNCI, JSON.stringify({ ...baca(), ...ubah }));
  } catch {
    // Penyimpanan diblokir — pengaturan berlaku sampai halaman ditutup saja.
  }
  pendengar.forEach((fn) => fn());
}

export function useGayaPeta(): GayaPeta {
  return useSyncExternalStore(langganan, baca, () => GAYA_BAWAAN);
}
