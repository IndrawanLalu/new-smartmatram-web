"use client";

import { useCallback, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase-browser";
import { useToast } from "@/app/admin/_components/Toast";

/**
 * Simulasi "kalau alat hubung ini dibuka" (`scripts/peta-simulasi-buka.sql`).
 * Hanya membaca — boleh dijalankan siapa pun yang membuka peta.
 */

/** Penanda yang merupakan alat hubung — yang bisa dibuka. PENG & gardu bukan. */
export const PENANDA_ALAT = new Set(["lbs", "lbsm", "recloser", "pmt", "fco"]);

export interface GarduPadam {
  kode: string;
  nama: string | null;
  daya: number | null;
  lat: number;
  lng: number;
  beban_kva: number | null;
  persen_beban: number | null;
  tgl_ukur: string | null;
  tiang_kode: string;
}

export interface HasilSimulasi {
  alat: { id: string; kode: string; penanda: string; penyulang: string | null; lat: number; lng: number };
  jumlah_tiang: number;
  panjang_km: number;
  bentang: [number, number, number, number][];
  gardu: GarduPadam[];
  total_kva: number;
  total_beban_kva: number;
  gardu_tanpa_pasangan: string[];
  alat_hilir: { kode: string; penanda: string; lat: number; lng: number }[];
  batas: [number, number, number, number] | null;
}

export function useSimulasiBuka() {
  const toast = useToast();
  const [hasil, setHasil] = useState<HasilSimulasi | null>(null);
  const [sibuk, setSibuk] = useState(false);

  const jalankan = useCallback(
    async (tiangId: string) => {
      setSibuk(true);
      const { data, error } = await supabaseBrowser.rpc("simulasi_buka_alat", { p_tiang_id: tiangId });
      setSibuk(false);
      if (error) {
        toast.error(
          error.message.includes("Could not find the function")
            ? "Fungsi simulasi belum ada — jalankan scripts/peta-simulasi-buka.sql di Supabase."
            : error.message,
        );
        return null;
      }
      const h = data as HasilSimulasi;
      setHasil(h);
      return h;
    },
    [toast],
  );

  return { hasil, sibuk, jalankan, tutup: () => setHasil(null) };
}
