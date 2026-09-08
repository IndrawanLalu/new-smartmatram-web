"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { supabaseBrowser } from "@/lib/supabase-browser";
import { fetchAllRows } from "@/lib/supabasePaginate";
import { type CurrentUser, canSeeAllUnits } from "@/lib/roles";

// Satu sumber data tiang untuk tab Peta dan tab Hasil Inspeksi. Dua hook yang
// menarik tabel yang sama akan cepat berselisih isinya begitu salah satu diubah.

const KOLOM =
  "id,kode,gardu_kode,ulp,jurusan,induk_id,lat,lng,jenis,tinggi,kondisi,aks_suspension,aks_large_angle,aks_dead_end,jamperan,andongan,tarikan_sr,arde_kondisi,arde_nilai_ohm,stay_jenis,stay_kondisi,rawan_row,underbuild_tm,catatan_perbaikan,dikonfirmasi_at,dikonfirmasi_oleh,created_at,tiang_konduktor!tiang_konduktor_tiang_id_fkey(nomor,jenis,ukuran,kondisi)";

export interface KonduktorBaris {
  nomor: number;
  jenis: string | null;
  ukuran: string | null;
  kondisi: string | null;
}

export interface TiangBaris {
  id: string;
  kode: string;
  gardu_kode: string;
  ulp: string;
  jurusan: string | null;
  induk_id: string | null;
  lat: number | null;
  lng: number | null;
  jenis: string | null;
  tinggi: number | null;
  kondisi: string | null;
  aks_suspension: string | null;
  aks_large_angle: string | null;
  aks_dead_end: string | null;
  jamperan: { jenis?: string; kondisi?: string }[] | null;
  andongan: string | null;
  tarikan_sr: number | null;
  arde_kondisi: string | null;
  arde_nilai_ohm: number | null;
  stay_jenis: string | null;
  stay_kondisi: string | null;
  rawan_row: string[] | null;
  underbuild_tm: boolean;
  catatan_perbaikan: string | null;
  dikonfirmasi_at: string | null;
  dikonfirmasi_oleh: string | null;
  created_at: string;
  tiang_konduktor: KonduktorBaris[] | null;

  // Diisi di sini dari master gardu — `tiang` tidak menyimpan penyulang sendiri
  // supaya tidak ada dua tempat yang bisa berselisih.
  penyulang: string | null;
  gardu_nama: string | null;
  gardu_lat: number | null;
  gardu_lng: number | null;
}

const angka = (v: unknown): number | null => {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) && n !== 0 ? n : null;
};

export function useTiangJtr(user: CurrentUser) {
  const [baris, setBaris] = useState<TiangBaris[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const unit = canSeeAllUnits(user.role) ? null : (user.unit ?? null);

  const muat = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [tiang, gardu] = await Promise.all([
        fetchAllRows<Omit<TiangBaris, "penyulang" | "gardu_nama" | "gardu_lat" | "gardu_lng">>(
          () => {
            let b = supabaseBrowser
              .from("tiang")
              .select(KOLOM)
              .eq("status_hidup", "aktif")
              .not("gardu_kode", "is", null);
            if (unit) b = b.eq("ulp", unit);
            return b.order("id");
          },
        ),
        fetchAllRows<{ kode: string; ulp: string; nama: string | null; feeder: string | null; lat: unknown; lng: unknown }>(
          () => {
            let b = supabaseBrowser.from("gardu").select("kode,ulp,nama,feeder,lat,lng");
            if (unit) b = b.eq("ulp", unit);
            return b.order("kode");
          },
        ),
      ]);

      const petaGardu = new Map(
        gardu.map((g) => [`${g.kode.toUpperCase()}|${g.ulp.toUpperCase()}`, g]),
      );

      setBaris(
        tiang.map((t) => {
          const g = petaGardu.get(`${t.gardu_kode.toUpperCase()}|${t.ulp.toUpperCase()}`);
          return {
            ...t,
            lat: angka(t.lat),
            lng: angka(t.lng),
            penyulang: g?.feeder ?? null,
            gardu_nama: g?.nama ?? null,
            gardu_lat: angka(g?.lat),
            gardu_lng: angka(g?.lng),
          };
        }),
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Gagal memuat data tiang");
    } finally {
      setLoading(false);
    }
  }, [unit]);

  useEffect(() => {
    void muat();
  }, [muat]);

  const penyulangList = useMemo(
    () => [...new Set(baris.map((b) => b.penyulang).filter(Boolean))].sort() as string[],
    [baris],
  );

  const garduList = useMemo(
    () => [...new Set(baris.map((b) => b.gardu_kode))].sort(),
    [baris],
  );

  return { baris, penyulangList, garduList, loading, error, muat };
}

/** Tanggal yang dipakai sebagai "kapan tiang ini diperiksa". */
export const tanggalPeriksa = (t: TiangBaris) => t.dikonfirmasi_at ?? t.created_at;
