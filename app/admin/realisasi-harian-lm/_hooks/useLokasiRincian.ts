"use client";

import { useEffect, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase-browser";
import type { ItemLm } from "@/app/admin/kinerja-yantek/_lib/lm4dx";

/**
 * Alamat, titik, dan foto untuk daftar rincian Realisasi Harian LM — dibaca
 * hanya untuk pekerjaan yang sedang dibuka:
 *   • pekerjaan bergardu (objek = kode gardu) → master `gardu`
 *   • Pemeliharaan Jaringan → `pemeliharaan_jaringan_daftar` (alamat, titik,
 *     foto sesudah, jumlah item)
 * Inspeksi JTM / Perabasan berobjek segmen: tanpa titik tunggal.
 */

export const KUNCI_BERGARDU = new Set(["jtr", "hargardu", "pengukuran", "penyeimbangan", "igardu1", "igardu2", "optimasi"]);
const POTONG = 200;

export interface Lokasi {
  alamat: string | null;
  lat: number | null;
  lng: number | null;
  foto: string | null;
  jumlahItem: number | null;
}

const angka = (v: unknown) => (v === null || v === undefined || v === "" ? null : Number(v));
export const kunciGardu = (ulp: string, kode: string) => `${ulp.toUpperCase()}|${kode.toUpperCase()}`;

export function useLokasiRincian(item: ItemLm[]) {
  const [gardu, setGardu] = useState<Map<string, Lokasi>>(new Map());
  const [harjtm, setHarjtm] = useState<Map<string, Lokasi>>(new Map());
  const [galat, setGalat] = useState<string | null>(null);

  useEffect(() => {
    let hidup = true;
    const kode = [...new Set(item.filter((x) => KUNCI_BERGARDU.has(x.kunci) && x.objek).map((x) => x.objek!.toUpperCase()))];
    const idHarjtm = [...new Set(item.filter((x) => x.kunci === "harjtm" && x.sumberId).map((x) => x.sumberId!))];
    (async () => {
      try {
        const g = new Map<string, Lokasi>();
        for (let i = 0; i < kode.length; i += POTONG) {
          const { data, error } = await supabaseBrowser
            .from("gardu").select("kode,ulp,alamat,lat,lng").in("kode", kode.slice(i, i + POTONG));
          if (error) throw new Error(error.message);
          for (const r of data ?? []) {
            g.set(kunciGardu(String(r.ulp ?? ""), String(r.kode)), {
              alamat: r.alamat ?? null, lat: angka(r.lat), lng: angka(r.lng), foto: null, jumlahItem: null,
            });
          }
        }
        const h = new Map<string, Lokasi>();
        for (let i = 0; i < idHarjtm.length; i += POTONG) {
          const { data, error } = await supabaseBrowser
            .from("pemeliharaan_jaringan_daftar")
            .select("id,alamat,lat,lng,foto_sesudah_url,jumlah_item")
            .in("id", idHarjtm.slice(i, i + POTONG));
          if (error) throw new Error(error.message);
          for (const r of data ?? []) {
            h.set(String(r.id), {
              alamat: r.alamat ?? null, lat: angka(r.lat), lng: angka(r.lng),
              foto: r.foto_sesudah_url || null, jumlahItem: angka(r.jumlah_item),
            });
          }
        }
        if (!hidup) return;
        setGardu(g);
        setHarjtm(h);
      } catch (e) {
        if (hidup) setGalat(`Alamat/titik gagal dibaca: ${e instanceof Error ? e.message : String(e)}`);
      }
    })();
    return () => { hidup = false; };
  }, [item]);

  const lokasi = (x: ItemLm): Lokasi | null =>
    x.kunci === "harjtm"
      ? harjtm.get(x.sumberId ?? "") ?? null
      : KUNCI_BERGARDU.has(x.kunci) && x.objek ? gardu.get(kunciGardu(x.ulp, x.objek)) ?? null : null;

  return { lokasi, galat };
}
