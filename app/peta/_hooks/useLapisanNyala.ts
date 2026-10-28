"use client";

import { useCallback, useMemo, useState } from "react";
import { type CurrentUser, canSeeAllUnits } from "@/lib/roles";
import type { Jaringan } from "./usePetaDaftar";

/**
 * ULP dan lapisan yang menyala di peta. Kunci lapisan `jaringan:KODE`
 * (`jtm:AMPENAN`, `jtr:AM263`, `gardu:…`, `pohon:…`).
 */

/** Dibuka dari tabel (/peta?jtr=AM263&ulp=AMPENAN): lapisan JTR gardu itu
 *  langsung menyala, peta menuju gardunya, panelnya terbuka. */
export interface AwalPeta {
  jtr?: string;
  ulp?: string;
  /** Dibuka dari WO Perabasan ("Lihat di peta"): lapisan pohon langsung menyala. */
  pohon?: boolean;
  /** `/peta?mode=sld` (juga tujuan alamat lama Peta SLD): Mode SLD menyala. */
  sld?: boolean;
  /** Dibuka dari Analisis JTR (/peta?rencana=GS219&jurusan=B): lapisan JTR
   *  gardu itu menyala, rencana perbaikannya digambar. */
  rencana?: { gardu: string; jurusan: string; opsi?: string };
  /** Survey Jaringan Baru (/peta?survey=<id|baru>). */
  survey?: string;
  /** Dibuka dari persetujuan Inspeksi JTM (/peta?jtm=<id>&segmen=<id>&penyulang=…):
   *  panel persetujuannya terbuka; kalau sudah tidak menunggu, segmen itu saja. */
  jtm?: { inspeksi: string; segmen: string; penyulang: string };
}

export function useLapisanNyala(user: CurrentUser, awal?: AwalPeta) {
  const [ulp, setUlp] = useState(
    canSeeAllUnits(user.role) ? (awal?.ulp?.toUpperCase() ?? "") : (user.unit ?? ""),
  );
  const [nyala, setNyala] = useState<Set<string>>(
    () => new Set([awal?.jtr, awal?.rencana?.gardu].filter(Boolean).map((k) => `jtr:${k!.toUpperCase()}`)),
  );

  // Kunci `pohon:` milik lapisan pohon (usePohonPeta), bukan jaringan yang
  // tiangnya dimuat — dikeluarkan supaya mencentang pohon tidak memuat ulang peta.
  const pilihan = useMemo(
    () =>
      [...nyala]
        .filter((k) => !k.startsWith("pohon:"))
        .map((k) => {
          const [jaringan, ...sisa] = k.split(":");
          return { jaringan: jaringan as Jaringan, kode: sisa.join(":") };
        }),
    [nyala],
  );

  /** Menyalakan satu lapisan (mis. dari antrean) tanpa memadamkan yang lain. */
  const nyalakan = useCallback((kunci: string) => setNyala((s) => new Set(s).add(kunci)), []);

  const alih = useCallback((jaringan: Jaringan, kode: string) => {
    setNyala((s) => {
      const b = new Set(s);
      const k = `${jaringan}:${kode}`;
      if (b.has(k)) b.delete(k); else b.add(k);
      return b;
    });
  }, []);

  /** Menyalakan atau memadamkan satu penyulang penuh sekaligus. */
  const alihBanyak = useCallback((jaringan: Jaringan, kode: string[], menyala: boolean) => {
    setNyala((s) => {
      const b = new Set(s);
      for (const k of kode) {
        if (menyala) b.add(`${jaringan}:${k}`);
        else b.delete(`${jaringan}:${k}`);
      }
      return b;
    });
  }, []);

  const hanya = useCallback((jaringan: Jaringan, kode: string | string[]) => {
    const daftar = Array.isArray(kode) ? kode : [kode];
    setNyala(new Set(daftar.map((k) => `${jaringan}:${k}`)));
  }, []);

  /** Menyalakan banyak kunci sekaligus (mis. semua penyulang pohon). */
  const tambah = useCallback((kunci: string[]) => setNyala((s) => new Set([...s, ...kunci])), []);

  const pohonAktif = [...nyala].some((k) => k.startsWith("pohon:"));
  const padamkanPohon = () => setNyala((s) => new Set([...s].filter((k) => !k.startsWith("pohon:"))));

  /** Ganti ULP: semua lapisan dipadamkan (milik ULP lama). */
  const gantiUlp = (v: string) => {
    setUlp(v);
    setNyala(new Set());
  };

  return {
    ulp, gantiUlp, nyala, pilihan, nyalakan, tambah, alih, alihBanyak, hanya, pohonAktif, padamkanPohon,
    adaGarduPilihan: pilihan.some((p) => p.jaringan === "gardu"),
    adaJaringan: pilihan.some((p) => p.jaringan !== "gardu"),
  };
}
