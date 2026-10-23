"use client";

import { useCallback, useEffect, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase-browser";
import { useToast } from "@/app/admin/_components/Toast";
import type { TiangPeta } from "./usePetaIsi";

/**
 * Pecah segmen di dalam section (X3, `scripts/jtm-section-pecah.sql`): klik
 * tiang di peta = titik potong (klik lagi = batal). Setiap perubahan titik
 * atau nama dipratinjau server (`pecah_segmen` p_uji) — potongan, panjang,
 * section, dan alasan tolaknya datang dari hitungan yang sama dengan saat
 * diterapkan.
 */

export interface BagianPecah {
  no: number;
  /** Potongan pangkal = segmen lama (id, inspeksi & WO-nya tetap). */
  asal: boolean;
  akar_id: string;
  akar_kode: string;
  jumlah_tiang: number;
  panjang_km: number;
  section: string[];
  nama_usul: string;
  nama: string;
  /** Gawang [latInduk, lngInduk, lat, lng]. */
  garis: [number, number, number, number][];
  titik: { lat: number | null; lng: number | null };
}

export interface PratinjauPecah {
  segmen: { id: string; nama: string; penyulang: string; ulp: string };
  bagian: BagianPecah[];
  usul_potong: string[];
  galat: string[];
}

export interface SegmenDipecah { id: string; nama: string }

/** Warna potongan — beda dengan warna section supaya terbaca di atasnya. */
export const WARNA_POTONGAN = ["#FFFFFF", "#22D3EE", "#FDE047", "#F472B6", "#4ADE80", "#FB923C", "#C084FC", "#F87171"];

export function usePecahSegmen(oleh: string) {
  const toast = useToast();
  const [segmen, setSegmen] = useState<SegmenDipecah | null>(null);
  const [potong, setPotong] = useState<string[]>([]);
  const [nama, setNama] = useState<Record<string, string>>({});
  const [hasil, setHasil] = useState<PratinjauPecah | null>(null);
  const [memuat, setMemuat] = useState(false);
  const [menyimpan, setMenyimpan] = useState(false);

  // Pratinjau — ditunda sebentar supaya mengetik nama tidak memanggil server tiap huruf.
  const kunci = segmen ? JSON.stringify([segmen.id, potong, nama]) : "";
  useEffect(() => {
    if (!segmen) return;
    let hidup = true;
    setMemuat(true);
    const t = setTimeout(async () => {
      const { data, error } = await supabaseBrowser.rpc("pecah_segmen", {
        p_segmen: segmen.id, p_potong: potong, p_nama: nama, p_oleh: oleh, p_uji: true,
      });
      if (!hidup) return;
      setMemuat(false);
      if (error) {
        toast.error(error.message.includes("Could not find the function")
          ? "Pecah segmen belum terpasang — jalankan scripts/jtm-section-pecah.sql di Supabase."
          : error.message);
        return;
      }
      setHasil(data as PratinjauPecah);
    }, 350);
    return () => { hidup = false; clearTimeout(t); };
    // `kunci` mewakili segmen + potong + nama.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kunci]);

  const mulai = useCallback((s: SegmenDipecah) => {
    setSegmen(s);
    setPotong([]);
    setNama({});
    setHasil(null);
  }, []);
  const batal = useCallback(() => {
    setSegmen(null);
    setHasil(null);
  }, []);

  const alih = useCallback((t: TiangPeta) => {
    if (t.jaringan !== "jtm") return;
    setPotong((p) => (p.includes(t.id) ? p.filter((x) => x !== t.id) : [...p, t.id]));
  }, []);
  const lepas = (id: string) => setPotong((p) => p.filter((x) => x !== id));
  const pakaiUsulan = () => {
    if (hasil) setPotong((p) => [...p, ...hasil.usul_potong.filter((x) => !p.includes(x))]);
  };
  const aturNama = (kunciNama: string, v: string) => setNama((n) => ({ ...n, [kunciNama]: v }));

  /** true = tersimpan. */
  const terapkan = async () => {
    if (!segmen) return false;
    setMenyimpan(true);
    const { data, error } = await supabaseBrowser.rpc("pecah_segmen", {
      p_segmen: segmen.id, p_potong: potong, p_nama: nama, p_oleh: oleh, p_uji: false,
    });
    setMenyimpan(false);
    if (error) {
      toast.error(error.message);
      return false;
    }
    const baru = ((data as { segmen_baru?: SegmenDipecah[] }).segmen_baru ?? []).length;
    toast.success(`${segmen.nama} dipecah — ${baru} segmen baru.`);
    batal();
    return true;
  };

  return {
    aktif: segmen !== null, segmen, potong, nama, hasil, memuat, menyimpan,
    mulai, batal, alih, lepas, pakaiUsulan, aturNama, terapkan,
  };
}

export type PecahSegmen = ReturnType<typeof usePecahSegmen>;
