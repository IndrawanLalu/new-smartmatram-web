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
 *
 * Klik tiang PERCABANGAN (27 Okt 2026, `scripts/jtm-pecah-arah.sql`) membuka
 * pilihan arah: potong hanya ke arah tertentu (potongan berpangkal di tiang
 * percabangan) atau semua arah sekaligus seperti titik potong biasa.
 */

export interface BagianPecah {
  no: number;
  /** Potongan pangkal = segmen lama (id, inspeksi & WO-nya tetap). */
  asal: boolean;
  akar_id: string;
  akar_kode: string;
  /** Kunci nama & tombol batal: "asal", id tiang potong, atau id tiang arah. Kosong = SQL lama. */
  kunci?: string;
  /** Potongan per arah: kode tiang pertama arah itu. */
  arah_kode?: string | null;
  jumlah_tiang: number;
  panjang_km: number;
  section: string[];
  nama_usul: string;
  nama: string;
  /** Gawang [latInduk, lngInduk, lat, lng]. */
  garis: [number, number, number, number][];
  titik: { lat: number | null; lng: number | null };
}

export interface ArahCabang { id: string; kode: string; jumlah_tiang: number }

/** Tiang ber-anak ≥2 di dalam segmen. */
export interface Percabangan { id: string; kode: string; arah: ArahCabang[] }

export interface PratinjauPecah {
  segmen: { id: string; nama: string; penyulang: string; ulp: string };
  bagian: BagianPecah[];
  usul_potong: string[];
  /** Tidak ada = SQL pecah per arah belum dijalankan. */
  percabangan?: Percabangan[];
  galat: string[];
}

export interface SegmenDipecah { id: string; nama: string }

/** Warna potongan — beda dengan warna section supaya terbaca di atasnya. */
export const WARNA_POTONGAN = ["#FFFFFF", "#22D3EE", "#FDE047", "#F472B6", "#4ADE80", "#FB923C", "#C084FC", "#F87171"];

/** p_arah hanya dikirim bila dipakai — SQL lama (tanpa p_arah) tetap jalan untuk potong biasa. */
const denganArah = (arah: string[]) => (arah.length ? { p_arah: arah } : {});

export function usePecahSegmen(oleh: string) {
  const toast = useToast();
  const [segmen, setSegmen] = useState<SegmenDipecah | null>(null);
  const [potong, setPotong] = useState<string[]>([]);
  const [arah, setArah] = useState<string[]>([]);
  /** Percabangan yang baru diklik — panel menanyakan arahnya. */
  const [simpang, setSimpang] = useState<Percabangan | null>(null);
  const [nama, setNama] = useState<Record<string, string>>({});
  const [hasil, setHasil] = useState<PratinjauPecah | null>(null);
  const [memuat, setMemuat] = useState(false);
  const [menyimpan, setMenyimpan] = useState(false);

  // Pratinjau — ditunda sebentar supaya mengetik nama tidak memanggil server tiap huruf.
  const kunci = segmen ? JSON.stringify([segmen.id, potong, arah, nama]) : "";
  useEffect(() => {
    if (!segmen) return;
    let hidup = true;
    setMemuat(true);
    const t = setTimeout(async () => {
      const { data, error } = await supabaseBrowser.rpc("pecah_segmen", {
        p_segmen: segmen.id, p_potong: potong, p_nama: nama, p_oleh: oleh, p_uji: true, ...denganArah(arah),
      });
      if (!hidup) return;
      setMemuat(false);
      if (error) {
        toast.error(error.message.includes("Could not find the function")
          ? arah.length
            ? "Pecah per arah belum terpasang — jalankan scripts/jtm-pecah-arah.sql di Supabase."
            : "Pecah segmen belum terpasang — jalankan scripts/jtm-section-pecah.sql di Supabase."
          : error.message);
        return;
      }
      setHasil(data as PratinjauPecah);
    }, 350);
    return () => { hidup = false; clearTimeout(t); };
    // `kunci` mewakili segmen + potong + arah + nama.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kunci]);

  const mulai = useCallback((s: SegmenDipecah) => {
    setSegmen(s);
    setPotong([]);
    setArah([]);
    setSimpang(null);
    setNama({});
    setHasil(null);
  }, []);
  const batal = useCallback(() => {
    setSegmen(null);
    setHasil(null);
    setSimpang(null);
  }, []);

  const percabangan = hasil?.percabangan;
  const alih = useCallback((t: TiangPeta) => {
    if (t.jaringan !== "jtm") return;
    // Percabangan yang belum dipotong → tanya arahnya dulu.
    const c = percabangan?.find((x) => x.id === t.id);
    if (c && !potong.includes(t.id)) {
      setSimpang(c);
      return;
    }
    setPotong((p) => (p.includes(t.id) ? p.filter((x) => x !== t.id) : [...p, t.id]));
  }, [percabangan, potong]);
  /** Dari pilihan arah: `null` = semua arah (titik potong biasa di percabangan). */
  const potongArah = (pilih: string[] | null) => {
    if (!simpang) return;
    if (pilih === null) {
      setArah((a) => a.filter((x) => !simpang.arah.some((c) => c.id === x)));
      setPotong((p) => (p.includes(simpang.id) ? p : [...p, simpang.id]));
    } else {
      setArah((a) => [...a.filter((x) => !simpang.arah.some((c) => c.id === x)), ...pilih]);
    }
    setSimpang(null);
  };
  const lepas = (id: string) => {
    setPotong((p) => p.filter((x) => x !== id));
    setArah((a) => a.filter((x) => x !== id));
  };
  const pakaiUsulan = () => {
    if (hasil) setPotong((p) => [...p, ...hasil.usul_potong.filter((x) => !p.includes(x))]);
  };
  const aturNama = (kunciNama: string, v: string) => setNama((n) => ({ ...n, [kunciNama]: v }));

  /** true = tersimpan. */
  const terapkan = async () => {
    if (!segmen) return false;
    setMenyimpan(true);
    const { data, error } = await supabaseBrowser.rpc("pecah_segmen", {
      p_segmen: segmen.id, p_potong: potong, p_nama: nama, p_oleh: oleh, p_uji: false, ...denganArah(arah),
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
    aktif: segmen !== null, segmen, potong, arah, nama, hasil, memuat, menyimpan, simpang,
    mulai, batal, alih, lepas, pakaiUsulan, aturNama, terapkan, potongArah, tutupSimpang: () => setSimpang(null),
  };
}

export type PecahSegmen = ReturnType<typeof usePecahSegmen>;
