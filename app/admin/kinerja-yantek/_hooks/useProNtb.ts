"use client";

import { useEffect, useMemo, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase-browser";
import { hariIniWita } from "../_lib/realisasiHarian";
import { susunBaris, type ItemPro, type KolomJenis } from "../_lib/proNtb";
import { ambilDataPro } from "../_lib/ambilProNtb";

/** Data Copy to PRO NTB — isinya disusun `ambilDataPro` (sama dengan cek PRO NTB di server). */

export function useProNtb(ulpAwal: string) {
  const [ulp, gantiUlp] = useState(ulpAwal);
  const [dari, gantiDari] = useState(hariIniWita);
  const [sampai, gantiSampai] = useState(hariIniWita);
  const [item, setItem] = useState<ItemPro[]>([]);
  const [alamat, setAlamat] = useState<Map<string, string>>(new Map());
  const [jenis, setJenis] = useState<Map<string, KolomJenis>>(new Map());
  const [loading, setLoading] = useState(true);
  const [galat, setGalat] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    let hidup = true;
    (async () => {
      try {
        const d = await ambilDataPro(supabaseBrowser, ulp, dari, sampai);
        if (!hidup) return;
        setItem(d.item);
        setAlamat(d.alamat);
        setJenis(d.jenis);
        setGalat(null);
      } catch (e) {
        if (!hidup) return;
        setItem([]);
        setGalat(e instanceof Error ? e.message : String(e));
      }
      if (hidup) setLoading(false);
    })();
    return () => { hidup = false; };
  }, [ulp, dari, sampai, nonce]);

  // "Memuat" dinyalakan oleh PEMICUNYA, bukan di dalam efek.
  const mulai = () => { setLoading(true); setGalat(null); };
  const muat = () => { mulai(); setNonce((n) => n + 1); };
  const setUlp = (u: string) => { mulai(); gantiUlp(u); };
  const setDari = (t: string) => { if (t) { mulai(); gantiDari(t); if (t > sampai) gantiSampai(t); } };
  const setSampai = (t: string) => { if (t) { mulai(); gantiSampai(t); if (t < dari) gantiDari(t); } };

  const baris = useMemo(() => susunBaris(item, jenis, alamat), [item, jenis, alamat]);

  return { ulp, setUlp, dari, setDari, sampai, setSampai, baris, jenis, loading, galat, muat };
}
