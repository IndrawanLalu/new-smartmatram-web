"use client";

import { useCallback, useEffect, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase-browser";
import type { AlasanWo } from "../_lib/kandidatWo";

/**
 * Pratinjau WO Pengukuran per ULP dari database (`pratinjau_wo_pengukuran`,
 * rencana-pengukuran.sql) — fungsi yang sama dengan Terbitkan & penerbitan
 * otomatis, jadi yang tampil di sini persis yang akan terbit.
 *
 *   kelompok 'wo'        akan masuk WO bila diterbitkan sekarang (kosong bila
 *                        WO bulan itu sudah terbit)
 *   kelompok 'pengingat' sudah masuk waktu ukur, tidak ada / tidak akan masuk WO
 */

export interface BarisPratinjau {
  ulp: string;
  kode_gardu: string;
  nama: string | null;
  alamat: string | null;
  penyulang: string | null;
  kva_master: number | null;
  alasan: AlasanWo;
  tgl_ukur_terakhir: string | null;
  umur_bulan: number | null;
  persen_beban: number | null;
  masuk_waktu: boolean;
  kelompok: "wo" | "pengingat";
  urutan: number;
}

export function usePratinjauWo(daftarUlp: string[], tahun: number, bulan: number) {
  const [perUlp, setPerUlp] = useState<Map<string, BarisPratinjau[]>>(new Map());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const kunci = daftarUlp.join(",");

  const muat = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const ulp = kunci.split(",").filter(Boolean);
      const hasil = await Promise.all(
        ulp.map(async (u) => {
          const { data, error: e } = await supabaseBrowser.rpc("pratinjau_wo_pengukuran", {
            p_ulp: u, p_tahun: tahun, p_bulan: bulan,
          });
          if (e) throw new Error(e.message);
          return [u, ((data ?? []) as Omit<BarisPratinjau, "ulp">[]).map((r) => ({ ...r, ulp: u }))] as const;
        }),
      );
      setPerUlp(new Map(hasil));
    } catch (e) {
      const m = e instanceof Error ? e.message : String(e);
      setError(m.includes("Could not find the function") ? "Penyusun WO belum terpasang — jalankan scripts/rencana-pengukuran.sql di Supabase." : m);
      setPerUlp(new Map());
    } finally {
      setLoading(false);
    }
  }, [kunci, tahun, bulan]);

  useEffect(() => { void muat(); }, [muat]);

  return { perUlp, loading, error, muat };
}
