"use client";

import { useEffect, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase-browser";
import { bacaBahanRencana, keGawang, keJurusan, type JurusanJtr } from "@/app/admin/pengukuran-gardu/_hooks/useAnalisisJtr";
import { buatRencana, type PeranTitik, type Rencana } from "@/app/admin/pengukuran-gardu/_lib/rencanaJtr";

/**
 * Rencana perbaikan JTR di peta — dibuka dari Analisis JTR ("Lihat di peta",
 * /peta?rencana=GS219&jurusan=B). Rencananya DIHITUNG ULANG di sini dengan
 * `buatRencana` yang sama, bukan dikirim lewat alamat: hasil peta dan tabel
 * tidak bisa berbeda, dan alamatnya tetap pendek.
 */

export interface TitikRencana {
  tiang_id: string;
  kode: string | null;
  peran: PeranTitik;
  lat: number;
  lng: number;
}

/** Gawang yang pindah — garis tiang → hulunya, untuk disorot. */
export type GarisPindah = [[number, number], [number, number]];

export interface RencanaPeta {
  r: JurusanJtr;
  rencana: Rencana | null;
  titik: TitikRencana[];
  pindah: GarisPindah[];
  /** Semua tiang jurusan itu — untuk membingkai peta. */
  semua: { lat: number; lng: number }[];
}

export function useRencanaPeta(awal: { gardu: string; jurusan: string } | null) {
  const [buka, setBuka] = useState(awal);
  const [data, setData] = useState<RencanaPeta | null>(null);
  const [galat, setGalat] = useState<string | null>(null);

  useEffect(() => {
    if (!buka) return;
    let batal = false;
    (async () => {
      const g = buka.gardu.toUpperCase();
      const [baris, gw, bahan] = await Promise.all([
        supabaseBrowser.from("analisis_jtr_jurusan").select("*").eq("gardu_kode", g).eq("jurusan", buka.jurusan).maybeSingle(),
        supabaseBrowser.from("analisis_jtr_gawang").select("*").eq("gardu_kode", g).eq("jurusan", buka.jurusan),
        bacaBahanRencana(),
      ]);
      if (baris.error || gw.error) throw baris.error ?? gw.error;
      if (!baris.data) throw new Error(`${g} jurusan ${buka.jurusan} tidak ada di Analisis JTR.`);
      const gawang = (gw.data ?? []).map(keGawang);
      const ids = gawang.map((x) => x.tiang_id);
      const koord = new Map<string, { lat: number; lng: number }>();
      for (let i = 0; i < ids.length; i += 150) {
        const { data: t, error } = await supabaseBrowser.from("tiang").select("id,lat,lng").in("id", ids.slice(i, i + 150));
        if (error) throw error;
        for (const x of t ?? []) if (x.lat !== null && x.lng !== null) koord.set(x.id, { lat: Number(x.lat), lng: Number(x.lng) });
      }
      const r = keJurusan(baris.data);
      const rencana = buatRencana(r, gawang, bahan.pengaturan, bahan.kha);
      const hulu = new Map(gawang.map((x) => [x.tiang_id, x.hulu_id]));
      const pindah: GarisPindah[] = [];
      for (const id of rencana?.pindah ?? []) {
        const a = koord.get(id);
        const h = hulu.get(id);
        const b = h ? koord.get(h) : undefined;
        if (a && b) pindah.push([[b.lat, b.lng], [a.lat, a.lng]]);
      }
      const titik = (rencana?.titik ?? []).flatMap((t) => {
        const k = koord.get(t.tiang_id);
        return k ? [{ ...t, ...k }] : [];
      });
      if (!batal) setData({ r, rencana, titik, pindah, semua: [...koord.values()] });
    })().catch((e: Error) => {
      if (!batal) setGalat(e.message);
    });
    return () => {
      batal = true;
    };
  }, [buka]);

  const tutup = () => {
    setBuka(null);
    setData(null);
    setGalat(null);
  };

  return { aktif: buka !== null, buka, data, galat, tutup };
}

export type RencanaPetaState = ReturnType<typeof useRencanaPeta>;
