"use client";

import { useCallback, useEffect, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase-browser";
import type { TiangPeta } from "./usePetaIsi";

/**
 * Lapisan "Tiang dibatalkan" + Pulihkan (T1, `scripts/jtm-tambah-pulihkan-tiang.sql`).
 * Tiang JTM yang dibatalkan admin/regu digambar kelabu; diklik → Pulihkan:
 * induknya induk lama, atau tiang yang diklik di peta kalau induk lama sudah
 * tidak aktif. Datanya hanya dibaca selama lapisan menyala.
 */

export interface TiangBatal {
  id: string;
  kode: string;
  penyulang: string | null;
  lat: number;
  lng: number;
  induk_id: string | null;
  /** Alasan pembatalan (batalkan_tiang menulisnya ke catatan). */
  catatan: string | null;
  aktif_sampai: string | null;
}

export interface Pulih {
  t: TiangBatal;
  /** Induk yang akan dipakai; null = induk lama (dicek di server). */
  induk: { id: string; kode: string } | null;
  /** Menunggu klik tiang induk di peta. */
  pilihInduk: boolean;
}

const KOLOM = "id,kode,penyulang,lat,lng,induk_id,catatan,aktif_sampai";
const HALAMAN = 1000;

export function useTiangBatal(ulp: string) {
  const [aktif, setAktif] = useState(false);
  const [daftar, setDaftar] = useState<TiangBatal[]>([]);
  const [ke, setKe] = useState(0);
  const [pulih, setPulih] = useState<Pulih | null>(null);

  useEffect(() => {
    if (!aktif) return;
    let hidup = true;
    void (async () => {
      const semua: TiangBatal[] = [];
      for (let mulai = 0; ; mulai += HALAMAN) {
        let q = supabaseBrowser
          .from("tiang")
          .select(KOLOM)
          .eq("status_hidup", "batal")
          .is("gardu_kode", null)
          .not("lat", "is", null)
          .order("id")
          .range(mulai, mulai + HALAMAN - 1);
        if (ulp) q = q.eq("ulp", ulp);
        const { data, error } = await q;
        if (error || !hidup) return;
        semua.push(...((data ?? []) as TiangBatal[]));
        if ((data ?? []).length < HALAMAN) break;
      }
      if (hidup) setDaftar(semua);
    })();
    return () => { hidup = false; };
  }, [aktif, ulp, ke]);

  const muatUlang = useCallback(() => setKe((n) => n + 1), []);
  const buka = useCallback((t: TiangBatal) => setPulih({ t, induk: null, pilihInduk: false }), []);
  /** Klik tiang di peta selama menunggu induk. Stabil — dipakai `pilihTiang`. */
  const pilihInduk = useCallback(
    (t: TiangPeta) => setPulih((p) => (p && t.jaringan === "jtm" ? { ...p, induk: { id: t.id, kode: t.kode }, pilihInduk: false } : p)),
    [],
  );

  return {
    aktif, setAktif, daftar, muatUlang,
    pulih, setPulih, buka, pilihInduk,
    menungguInduk: !!pulih?.pilihInduk,
  };
}

export type LapisanTiangBatal = ReturnType<typeof useTiangBatal>;
