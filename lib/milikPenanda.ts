"use client";

import { useCallback, useEffect, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase-browser";

/**
 * Pemilik penanda (gardu / peralatan) di tiang yang dipakai beberapa penyulang
 * — view `jtm_pemilik_penanda` (scripts/jtm-peralatan-tiang-bersama.sql).
 *
 * Satu peralatan = satu pemilik: di lapisan penyulang lain tiang itu tampil
 * sebagai tiang biasa. Titik pertemuan dan yang belum dipilih pemiliknya
 * tampil di semua. Tiang satu penyulang tidak ada di view → tampil seperti
 * biasa. Isinya beberapa baris saja, jadi dibaca sekali per halaman.
 */

export type StatusMilik = "gardu" | "pertemuan" | "dipilih" | "belum";

export interface MilikPenanda {
  status: StatusMilik;
  /** Penyulang pemilik (yang menghitungnya). */
  pemilik: string;
  tampil: boolean;
}

export const kunciMilik = (tiangId: string, penyulang: string) => `${tiangId}|${penyulang.toUpperCase()}`;

/** Penanda tiang ini digambar di lapisan penyulang itu? */
export const penandaTampil = (m: Map<string, MilikPenanda>, tiangId: string, penyulang: string) =>
  m.get(kunciMilik(tiangId, penyulang))?.tampil ?? true;

export async function bacaMilikPenanda(): Promise<Map<string, MilikPenanda>> {
  const { data } = await supabaseBrowser.from("jtm_pemilik_penanda").select("tiang_id,penyulang,status,pemilik,tampil");
  return new Map(
    ((data ?? []) as { tiang_id: string; penyulang: string; status: StatusMilik; pemilik: string; tampil: boolean }[]).map(
      (r) => [kunciMilik(r.tiang_id, r.penyulang), { status: r.status, pemilik: r.pemilik, tampil: r.tampil }],
    ),
  );
}

export function useMilikPenanda() {
  const [milik, setMilik] = useState<Map<string, MilikPenanda>>(new Map());
  const [ke, setKe] = useState(0);

  useEffect(() => {
    let hidup = true;
    void bacaMilikPenanda().then((m) => hidup && setMilik(m));
    return () => { hidup = false; };
  }, [ke]);

  const muatUlang = useCallback(() => setKe((n) => n + 1), []);
  return { milik, muatUlang };
}
