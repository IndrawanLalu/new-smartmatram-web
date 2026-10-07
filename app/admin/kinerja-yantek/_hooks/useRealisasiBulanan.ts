"use client";

import { useEffect, useMemo, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase-browser";
import { fetchAllRows } from "@/lib/supabasePaginate";
import { META } from "./useKinerjaYantek";
import { bulanIniWita, keBarisBulanan, rekapBulanan, type BarisBulanan } from "../_lib/realisasiBulanan";

/**
 * Realisasi sebulan per (ulp, kunci, tgl) — `realisasi_bulanan`. Empat ULP ×
 * ±15 jenis × 31 hari bisa melewati 1.000 baris, jadi dibaca lewat paginasi.
 */

export function useRealisasiBulanan(ulp: string) {
  const awal = bulanIniWita();
  const [tahun, gantiTahun] = useState(awal.tahun);
  const [bulan, gantiBulan] = useState(awal.bulan);
  const [baris, setBaris] = useState<BarisBulanan[]>([]);
  const [loading, setLoading] = useState(true);
  const [galat, setGalat] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    let hidup = true;
    fetchAllRows<Record<string, unknown>>(() =>
      supabaseBrowser
        .rpc("realisasi_bulanan", { p_ulp: ulp, p_tahun: tahun, p_bulan: bulan })
        .order("ulp")
        .order("kunci")
        .order("tgl"),
    ).then(
      (rows) => {
        if (!hidup) return;
        setBaris(rows.map(keBarisBulanan));
        setGalat(null);
        setLoading(false);
      },
      // Butir 6: gagal ≠ nol — angka lama dibuang, layar menyatakan gagal.
      (e: Error) => {
        if (!hidup) return;
        setBaris([]);
        setGalat(e.message);
        setLoading(false);
      },
    );
    return () => { hidup = false; };
  }, [ulp, tahun, bulan, nonce]);

  const mulai = () => { setLoading(true); setGalat(null); };
  const setTahun = (t: number) => { mulai(); gantiTahun(t); };
  const setBulan = (b: number) => { mulai(); gantiBulan(b); };
  const muat = () => { mulai(); setNonce((n) => n + 1); };

  const rekap = useMemo(() => rekapBulanan(baris, META), [baris]);

  return { tahun, setTahun, bulan, setBulan, rekap, loading, galat, muat };
}
