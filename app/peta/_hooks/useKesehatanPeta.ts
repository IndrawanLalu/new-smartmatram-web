"use client";

import { useEffect, useMemo, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase-browser";
import { fetchAllRows } from "@/lib/supabasePaginate";

/**
 * Kesehatan gardu dari data ukur (`scripts/peta-kesehatan-gardu.sql`). Dibaca
 * sekali saat lapisannya menyala — satu baris per gardu bertitik yang pernah
 * diukur, jadi ribuan paling banyak — lalu disaring di layar.
 */

export type StatusKesehatan = "merah" | "kuning" | "hijau";
export const WARNA_KESEHATAN: Record<StatusKesehatan, string> = { merah: "#EF4444", kuning: "#F59E0B", hijau: "#22C55E" };

export interface JurusanKesehatan {
  jurusan: string;
  arus: { R: number; S: number; T: number; N: number };
  pangkal: { R: number | null; S: number | null; T: number | null };
  ujung: { R: number | null; S: number | null; T: number | null };
  sumber_ujung: "lapangan" | "formulir" | null;
  jatuh_pct: number | null;
  arus_maks: number;
  jarak_dari_ujung_m: number | null;
  titik_ujung: [number, number] | null;
}

export interface KesehatanGardu {
  kode: string;
  nama: string | null;
  ulp: string;
  feeder: string | null;
  daya: number | null;
  lat: number;
  lng: number;
  tanggal_pengukuran: string;
  persen_beban: number | null;
  beban_kva: number | null;
  unbalance_pct: number | null;
  jatuh_maks_pct: number | null;
  ujung_min: number | null;
  arus_jurusan_maks: number | null;
  jurusan: JurusanKesehatan[];
  beban_lebih: boolean;
  jatuh_lebih: boolean;
  ujung_rendah: boolean;
  jurusan_lebih: boolean;
  calon_sisip: boolean;
  status: StatusKesehatan;
}

export interface SaringKesehatan {
  status: Set<StatusKesehatan>;
  hanyaSisip: boolean;
  hanyaJurusan160: boolean;
}

export function useKesehatanPeta(aktif: boolean, ulp: string, saring: SaringKesehatan) {
  const [semua, setSemua] = useState<KesehatanGardu[]>([]);
  const [galat, setGalat] = useState<string | null>(null);
  const [kunciSelesai, setKunciSelesai] = useState<string | null>(null);
  const kunci = ulp || "SEMUA";
  const sibuk = aktif && kunciSelesai !== kunci;

  useEffect(() => {
    if (!aktif) return;
    let hidup = true;
    const kerja = async () => {
      try {
        const data = await fetchAllRows<KesehatanGardu>(() => {
          const q = supabaseBrowser.from("kesehatan_gardu").select("*").order("kode");
          return ulp ? q.eq("ulp", ulp) : q;
        });
        if (!hidup) return;
        setSemua(data.map((d) => ({ ...d, lat: Number(d.lat), lng: Number(d.lng) })));
        setGalat(null);
      } catch (e) {
        if (!hidup) return;
        const m = e instanceof Error ? e.message : String(e);
        setGalat(m.includes("kesehatan_gardu") ? "View kesehatan_gardu belum ada — jalankan scripts/peta-kesehatan-gardu.sql." : m);
      } finally {
        if (hidup) setKunciSelesai(kunci);
      }
    };
    void kerja();
    return () => { hidup = false; };
  }, [aktif, ulp, kunci]);

  const gardu = useMemo(
    () =>
      aktif
        ? semua.filter(
            (g) =>
              saring.status.has(g.status) &&
              (!saring.hanyaSisip || g.calon_sisip) &&
              (!saring.hanyaJurusan160 || g.jurusan_lebih),
          )
        : [],
    [aktif, semua, saring],
  );

  const hitung = useMemo(
    () => ({
      merah: semua.filter((g) => g.status === "merah").length,
      kuning: semua.filter((g) => g.status === "kuning").length,
      hijau: semua.filter((g) => g.status === "hijau").length,
      sisip: semua.filter((g) => g.calon_sisip).length,
      jurusan160: semua.filter((g) => g.jurusan_lebih).length,
    }),
    [semua],
  );

  return { gardu, semua, hitung, sibuk, galat };
}
