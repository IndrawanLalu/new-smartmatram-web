"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { supabaseBrowser } from "@/lib/supabase-browser";
import { fetchAllRows } from "@/lib/supabasePaginate";

/**
 * Isi panel kiri: apa saja yang bisa dinyalakan di peta.
 *
 * Dibaca SEKALI saat halaman dibuka, karena daftarnya kecil dan jarang berubah
 * — 82 penyulang dan dua ribuan gardu, masing-masing beberapa puluh bita. Yang
 * besar bukan daftarnya, melainkan tiang di baliknya; itu baru ditarik saat
 * lapisannya benar-benar dinyalakan.
 */

export type Jaringan = "jtm" | "jtr" | "gardu";

export interface Lapisan {
  jaringan: Jaringan;
  kode: string;
  nama: string;
  ulp: string;
  jumlahTiang: number;
  latMin: number | null;
  latMaks: number | null;
  lngMin: number | null;
  lngMaks: number | null;
}

export function usePetaDaftar(ulp: string | null) {
  const [daftar, setDaftar] = useState<Lapisan[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const muat = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const baris = await fetchAllRows<Record<string, unknown>>(() => {
        const q = supabaseBrowser
          .from("peta_daftar")
          .select("jaringan,kode,nama,ulp,jumlah_tiang,lat_min,lat_maks,lng_min,lng_maks")
          .order("jaringan")
          .order("kode");
        return ulp ? q.eq("ulp", ulp) : q;
      });

      setDaftar(
        baris.map((r) => ({
          jaringan: r.jaringan as Jaringan,
          kode: r.kode as string,
          nama: (r.nama as string) ?? (r.kode as string),
          ulp: (r.ulp as string) ?? "",
          jumlahTiang: Number(r.jumlah_tiang ?? 0),
          latMin: r.lat_min !== null ? Number(r.lat_min) : null,
          latMaks: r.lat_maks !== null ? Number(r.lat_maks) : null,
          lngMin: r.lng_min !== null ? Number(r.lng_min) : null,
          lngMaks: r.lng_maks !== null ? Number(r.lng_maks) : null,
        })),
      );
    } catch (e) {
      const pesan = e instanceof Error ? e.message : String(e);
      setError(
        pesan.includes("peta_daftar")
          ? "View peta_daftar belum ada — jalankan scripts/peta-jaringan.sql di Supabase."
          : pesan,
      );
      setDaftar([]);
    } finally {
      setLoading(false);
    }
  }, [ulp]);

  useEffect(() => {
    void muat();
  }, [muat]);

  /** Gardu yang sudah punya tiang JTR berdiri sebagai lapisan JTR tersendiri.
   *  Gardu yang belum punya tiang tetap bisa ditampilkan sebagai titik, tapi
   *  tidak muncul di folder JTR — di situ tidak ada jaringan untuk digambar. */
  const perFolder = useMemo(() => {
    const jtm = daftar.filter((d) => d.jaringan === "jtm");
    const gardu = daftar.filter((d) => d.jaringan === "gardu");
    const jtr = gardu
      .filter((d) => d.jumlahTiang > 0)
      .map((d) => ({ ...d, jaringan: "jtr" as Jaringan }));
    return { jtm, jtr, gardu };
  }, [daftar]);

  return { daftar, perFolder, loading, error, muat };
}
