"use client";

import { useEffect, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase-browser";

/**
 * Pengukuran yang DITAHAN dari AMG (`tahan_amg`: sedang dikembalikan ke
 * petugas, atau tegangan ujung belum disetujui sejak aturannya berlaku —
 * `scripts/amg-tahan-dikembalikan.sql`) → Map id → alasan. Server tetap
 * gerbang yang sebenarnya; ini supaya tombol & centang tidak tampak bisa
 * dipakai lalu baru ditolak setelah ditekan.
 *
 * `muatUlang` diganti nilainya untuk memaksa baca ulang (mis. pindah tab
 * setelah menyetujui tegangan ujung). Selama membaca ulang, hasil lama tetap
 * dipakai supaya centang tidak berkedip aktif.
 */
export function useTahanAmg(ids: string[], muatUlang: string | number = 0) {
  const kunci = ids.join(",");
  const [hasil, setHasil] = useState<{ kunci: string; peta: Map<string, string> }>({ kunci: "", peta: new Map() });

  useEffect(() => {
    if (!kunci) return;
    let hidup = true;
    supabaseBrowser.rpc("tahan_amg", { p_ids: kunci.split(",") }).then(({ data, error }) => {
      if (!hidup) return;
      // Galat (termasuk fungsi belum terpasang) = tidak menandai apa pun;
      // gerbang di server tetap menolak saat ditekan.
      const peta = new Map<string, string>();
      if (!error) for (const r of (data ?? []) as { id: string; alasan: string }[]) peta.set(r.id, r.alasan);
      setHasil({ kunci, peta });
    });
    return () => { hidup = false; };
  }, [kunci, muatUlang]);

  return kunci && hasil.kunci === kunci ? hasil.peta : KOSONG;
}

const KOSONG = new Map<string, string>();

/** Label singkat untuk lencana tabel. */
export const labelTahan = (alasan: string) => (alasan.includes("disetujui") ? "UJUNG BELUM DISETUJUI" : "MENUNGGU TEG. UJUNG");
