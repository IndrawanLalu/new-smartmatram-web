"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase-browser";
import { useToast } from "@/app/admin/_components/Toast";
import type { SorotKoreksi } from "./useKoreksiIsian";

/**
 * Gardu janggal di tiang JTM (10 Okt 2026) — `gardu_janggal_peta`
 * (scripts/peta-gardu-janggal.sql). Dibaca saat halaman dibuka supaya angkanya
 * tampil di tombol; isinya beberapa puluh baris.
 *
 *   beda   penyulang di master gardu ≠ penyulang tiang → "Samakan" mengubah
 *          MASTER mengikuti tiang, per kelompok (PAGUTAN → BATU DAWA sekaligus)
 *   ganda  satu kode di beberapa tiang → dibetulkan di panel tiang
 */

export interface GarduJanggal {
  jenis: "beda" | "ganda";
  tiang_id: string;
  tiang_kode: string;
  ulp: string;
  lat: number;
  lng: number;
  gardu_kode: string;
  penyulang_tiang: string | null;
  penyulang_master: string | null;
  /** ganda: tiang lain berkode sama + jaraknya. */
  lain: string | null;
  /** ULP gardu di master — bisa beda dari ULP tiangnya. */
  ulp_master: string | null;
}

/** Satu kelompok "beda": master X → tiang Y di ULP master yang sama. */
export interface KelompokBeda {
  kunci: string;
  master: string | null;
  tiang: string | null;
  ulpMaster: string | null;
  baris: GarduJanggal[];
}

export function useGarduJanggal(ulp: string, oleh: string) {
  const toast = useToast();
  const [baris, setBaris] = useState<GarduJanggal[]>([]);
  const [aktif, setAktif] = useState(false);
  const [sibuk, setSibuk] = useState(false);
  const [ke, setKe] = useState(0);

  useEffect(() => {
    let hidup = true;
    let q = supabaseBrowser
      .from("gardu_janggal_peta")
      .select("jenis,tiang_id,tiang_kode,ulp,lat,lng,gardu_kode,penyulang_tiang,penyulang_master,lain,ulp_master");
    if (ulp) q = q.eq("ulp", ulp.toUpperCase());
    void q.then(({ data }) => {
      if (!hidup) return;
      setBaris(((data ?? []) as GarduJanggal[]).map((r) => ({ ...r, lat: Number(r.lat), lng: Number(r.lng) })));
    });
    return () => { hidup = false; };
  }, [ulp, ke]);

  const muatUlang = useCallback(() => setKe((n) => n + 1), []);

  const beda = useMemo<KelompokBeda[]>(() => {
    const m = new Map<string, KelompokBeda>();
    for (const r of baris) {
      if (r.jenis !== "beda") continue;
      const kunci = `${r.penyulang_master}|${r.penyulang_tiang}|${r.ulp_master}`;
      const k = m.get(kunci) ?? { kunci, master: r.penyulang_master, tiang: r.penyulang_tiang, ulpMaster: r.ulp_master, baris: [] };
      k.baris.push(r);
      m.set(kunci, k);
    }
    return [...m.values()].sort((a, b) => b.baris.length - a.baris.length);
  }, [baris]);

  const ganda = useMemo(() => {
    const m = new Map<string, GarduJanggal[]>();
    for (const r of baris) if (r.jenis === "ganda") m.set(r.gardu_kode, [...(m.get(r.gardu_kode) ?? []), r]);
    return [...m.entries()].map(([kode, b]) => ({ kode, baris: b.sort((x, y) => x.tiang_kode.localeCompare(y.tiang_kode)) }));
  }, [baris]);

  /** Jumlah TIANG janggal (satu tiang bisa beda sekaligus ganda). */
  const jumlah = useMemo(() => new Set(baris.map((r) => r.tiang_id)).size, [baris]);

  const sorot = useMemo<SorotKoreksi[]>(
    () =>
      aktif
        ? [...new Map(baris.map((r) => [r.tiang_id, { id: r.tiang_id, lat: r.lat, lng: r.lng, jenis: "janggal" as const }])).values()]
        : [],
    [aktif, baris],
  );

  /** Master gardu ikut penyulang tiangnya — satu baris atau satu kelompok. */
  const samakan = async (kode: string[], ulpMaster: string, penyulang: string) => {
    setSibuk(true);
    const { data, error } = await supabaseBrowser.rpc("samakan_penyulang_gardu", {
      p_kode: kode, p_ulp: ulpMaster, p_penyulang: penyulang, p_oleh: oleh,
    });
    setSibuk(false);
    if (error) {
      toast.error(error.message);
      return false;
    }
    const d = data as { diubah: number; penyulang: string };
    toast.success(`${d.diubah} gardu di master kini penyulang ${d.penyulang}.`);
    muatUlang();
    return true;
  };

  return { baris, beda, ganda, jumlah, aktif, setAktif, sibuk, sorot, samakan, muatUlang };
}
