"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase-browser";
import { useToast } from "@/app/admin/_components/Toast";
import { jarakMeter } from "@/lib/geo";
import type { TiangPeta } from "./usePetaIsi";

/**
 * Mode geser titik: banyak tiang diseret dulu, lalu disimpan SEKALI dengan
 * satu alasan (`scripts/peta-geser-banyak.sql`). Menggeser satu per satu
 * berarti mengetik alasan yang sama berkali-kali untuk satu jalur yang meleset.
 *
 * Geseran yang belum disimpan hanya hidup di layar ini — keluar halaman
 * diperingatkan peramban, tidak diingat.
 */

export interface GeserTiang {
  id: string;
  kode: string;
  asal: [number, number];
  baru: [number, number];
}

/** Di bawah ini dianggap belum diseret — klik tanpa sengaja bergeser sentimeter. */
const MIN_GESER_M = 0.1;

export const jarakGeser = (g: GeserTiang) => jarakMeter(g.asal[0], g.asal[1], g.baru[0], g.baru[1]);

export function useGeserBanyak(oleh: string) {
  const toast = useToast();
  const [aktif, setAktif] = useState(false);
  const [daftar, setDaftar] = useState<GeserTiang[]>([]);

  const tergeser = useMemo(() => daftar.filter((g) => jarakGeser(g) >= MIN_GESER_M), [daftar]);

  // Peringatan peramban saat menutup/memuat ulang halaman dengan geseran tertunda.
  useEffect(() => {
    if (tergeser.length === 0) return;
    const tahan = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", tahan);
    return () => window.removeEventListener("beforeunload", tahan);
  }, [tergeser.length]);

  // Stabil: dipakai di dalam `onPilihTiang` peta, yang `Isi`-nya di-memo —
  // fungsi baru tiap render berarti ribuan tiang digambar ulang.
  /** Klik tiang di mode geser: munculkan pegangan seretnya. */
  const pilih = useCallback(
    (t: TiangPeta) =>
      setDaftar((d) =>
        d.some((g) => g.id === t.id) ? d : [...d, { id: t.id, kode: t.kode, asal: [t.lat, t.lng], baru: [t.lat, t.lng] }],
      ),
    [],
  );

  const seret = useCallback(
    (id: string, lat: number, lng: number) =>
      setDaftar((d) => d.map((g) => (g.id === id ? { ...g, baru: [lat, lng] } : g))),
    [],
  );

  const buang = (id: string) => setDaftar((d) => d.filter((g) => g.id !== id));

  const keluar = () => {
    setAktif(false);
    setDaftar([]);
  };

  const simpan = async (alasan: string) => {
    const { data, error } = await supabaseBrowser.rpc("geser_titik_tiang_banyak", {
      p_isi: tergeser.map((g) => ({ id: g.id, lat: g.baru[0], lng: g.baru[1] })),
      p_alasan: alasan,
      p_oleh: oleh,
    });
    if (error) {
      toast.error(
        error.message.includes("Could not find the function")
          ? "Geser banyak belum terpasang — jalankan scripts/peta-geser-banyak.sql di Supabase."
          : error.message,
      );
      return false;
    }
    toast.success(`${(data as { jumlah: number }).jumlah} tiang digeser.`);
    setDaftar([]);
    return true;
  };

  return { aktif, mulai: () => setAktif(true), daftar, tergeser, pilih, seret, buang, keluar, simpan };
}
