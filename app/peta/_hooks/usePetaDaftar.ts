"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { supabaseBrowser } from "@/lib/supabase-browser";
import { fetchAllRows } from "@/lib/supabasePaginate";

/**
 * Isi panel kiri: apa saja yang bisa dinyalakan di peta.
 *
 * Dibaca SEKALI saat halaman dibuka, karena daftarnya kecil dan jarang berubah
 * — 2.092 gardu bertitik dan beberapa penyulang, masing-masing beberapa puluh
 * bita. Yang besar bukan daftarnya, melainkan tiang di baliknya; itu baru
 * ditarik saat lapisannya benar-benar dinyalakan.
 *
 * GARDU DIKELOMPOKKAN PER PENYULANG. Dua ribu baris rata bukan daftar, itu
 * tumpukan — dan orang di lapangan tidak pernah mencari "gardu nomor sekian
 * dari dua ribu", dia mencari gardu DI penyulang tertentu. Pengelompokan juga
 * yang membuat pohonnya tetap murah: hanya penyulang yang dibuka yang barisnya
 * digambar, jadi folder Gardu berangkat dari 48 baris, bukan 2.092.
 */

export type Jaringan = "jtm" | "jtr" | "gardu";

export interface Lapisan {
  jaringan: Jaringan;
  kode: string;
  nama: string;
  ulp: string;
  feeder: string;
  jumlahTiang: number;
  latMin: number | null;
  latMaks: number | null;
  lngMin: number | null;
  lngMaks: number | null;
}

/** Satu penyulang beserta gardu di bawahnya. */
export interface Grup {
  feeder: string;
  isi: Lapisan[];
  /** Kotak batas gabungan — supaya "lompat" bisa merangkum seluruh penyulang. */
  latMin: number | null;
  latMaks: number | null;
  lngMin: number | null;
  lngMaks: number | null;
}

function kelompokkan(baris: Lapisan[]): Grup[] {
  const peta = new Map<string, Lapisan[]>();
  for (const l of baris) {
    const k = l.feeder || "(tanpa penyulang)";
    const a = peta.get(k);
    if (a) a.push(l); else peta.set(k, [l]);
  }
  return [...peta.entries()]
    .map(([feeder, isi]) => {
      const t = isi.filter((x) => x.latMin !== null);
      return {
        feeder,
        isi,
        latMin: t.length ? Math.min(...t.map((x) => x.latMin!)) : null,
        latMaks: t.length ? Math.max(...t.map((x) => x.latMaks!)) : null,
        lngMin: t.length ? Math.min(...t.map((x) => x.lngMin!)) : null,
        lngMaks: t.length ? Math.max(...t.map((x) => x.lngMaks!)) : null,
      };
    })
    .sort((a, b) => a.feeder.localeCompare(b.feeder, "id"));
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
          .select("jaringan,kode,nama,ulp,feeder,jumlah_tiang,lat_min,lat_maks,lng_min,lng_maks")
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
          feeder: (r.feeder as string) ?? "(tanpa penyulang)",
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
        pesan.includes("feeder")
          ? "View peta_daftar belum punya kolom feeder — jalankan ulang scripts/peta-jaringan.sql di Supabase."
          : pesan.includes("peta_daftar")
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
   *  Gardu yang belum punya tiang tetap muncul sebagai titik di folder Gardu,
   *  tapi tidak di folder JTR — di situ tidak ada jaringan untuk digambar. */
  const perFolder = useMemo(() => {
    const jtm = daftar.filter((d) => d.jaringan === "jtm");
    const gardu = daftar.filter((d) => d.jaringan === "gardu");
    const jtr = gardu
      .filter((d) => d.jumlahTiang > 0)
      .map((d) => ({ ...d, jaringan: "jtr" as Jaringan }));
    return {
      jtm,
      jtr: kelompokkan(jtr),
      gardu: kelompokkan(gardu),
      jumlahJtr: jtr.length,
      jumlahGardu: gardu.length,
    };
  }, [daftar]);

  /** Sumber kotak cari: rata, lintas folder. Orang yang mengetik "AM005" tidak
   *  sedang memilih kategori — dia sedang mencari sebuah benda. */
  const semuaLapisan = useMemo(
    () => [
      ...daftar.filter((d) => d.jaringan === "jtm"),
      ...daftar
        .filter((d) => d.jaringan === "gardu" && d.jumlahTiang > 0)
        .map((d) => ({ ...d, jaringan: "jtr" as Jaringan })),
      ...daftar.filter((d) => d.jaringan === "gardu"),
    ],
    [daftar],
  );

  return { daftar, perFolder, semuaLapisan, loading, error, muat };
}
