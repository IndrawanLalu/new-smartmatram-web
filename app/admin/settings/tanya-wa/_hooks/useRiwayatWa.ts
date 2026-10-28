"use client";

import { useCallback, useEffect, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase-browser";

/**
 * Riwayat pertanyaan WA (`wa_tanya_riwayat`, 90 hari) — berhalaman di server,
 * 20 baris. Bawaan: yang tidak dipahami & belum ditangani, bahan "Ajarkan".
 */

export type HasilRiwayat = "dijawab" | "tidak_dipahami" | "pilihan" | "galat";
export type SaringHasil = HasilRiwayat | "semua";

export interface BarisRiwayat {
  id: string;
  waktu: string;
  dari: string | null;
  grup: string | null;
  nama: string | null;
  teks: string;
  teks_rapi: string | null;
  fungsi_kode: string | null;
  saringan: { sisa?: string } | null;
  hasil: HasilRiwayat;
  ditangani: boolean;
}

const PER_HAL = 20;

export function useRiwayatWa() {
  const [hasil, setHasil] = useState<SaringHasil>("tidak_dipahami");
  const [fungsi, setFungsi] = useState("");
  const [sembunyikan, setSembunyikan] = useState(true);
  const [hal, setHal] = useState(1);
  const [baris, setBaris] = useState<BarisRiwayat[]>([]);
  const [total, setTotal] = useState(0);
  const [memuat, setMemuat] = useState(true);
  const [galat, setGalat] = useState<string | null>(null);

  const muat = useCallback(async () => {
    setMemuat(true);
    let q = supabaseBrowser
      .from("wa_tanya_riwayat")
      .select("id,waktu,dari,grup,nama,teks,teks_rapi,fungsi_kode,saringan,hasil,ditangani", { count: "exact" });
    if (hasil !== "semua") q = q.eq("hasil", hasil);
    if (fungsi) q = q.eq("fungsi_kode", fungsi);
    if (sembunyikan) q = q.eq("ditangani", false);
    const { data, count, error } = await q.order("waktu", { ascending: false }).range((hal - 1) * PER_HAL, hal * PER_HAL - 1);
    setGalat(error?.message ?? null);
    setBaris((data ?? []) as BarisRiwayat[]);
    setTotal(count ?? 0);
    setMemuat(false);
  }, [hasil, fungsi, sembunyikan, hal]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- baca ulang saat saringan/halaman berganti
    void muat();
  }, [muat]);

  /** Saringan berganti → kembali ke halaman 1. */
  const saring = {
    hasil, fungsi, sembunyikan,
    setHasil: (v: SaringHasil) => { setHasil(v); setHal(1); },
    setFungsi: (v: string) => { setFungsi(v); setHal(1); },
    setSembunyikan: (v: boolean) => { setSembunyikan(v); setHal(1); },
  };

  async function tandai(id: string, ditangani: boolean): Promise<string | null> {
    const { data, error } = await supabaseBrowser.from("wa_tanya_riwayat").update({ ditangani }).eq("id", id).select("id");
    if (error) return error.message;
    // RLS menolak diam-diam (0 baris) untuk selain UP3.
    if (!data?.length) return "Hanya UP3 yang boleh menandai.";
    setBaris((p) => p.map((b) => (b.id === id ? { ...b, ditangani } : b)));
    return null;
  }

  return { saring, baris, total, hal, setHal, jumlahHal: Math.max(1, Math.ceil(total / PER_HAL)), memuat, galat, tandai };
}

/** Jumlah tidak dipahami yang belum ditangani — angka di tab. */
export function useJumlahBelumDiajarkan() {
  const [n, setN] = useState(0);
  useEffect(() => {
    void supabaseBrowser
      .from("wa_tanya_riwayat")
      .select("id", { count: "exact", head: true })
      .eq("hasil", "tidak_dipahami")
      .eq("ditangani", false)
      .then(({ count }) => setN(count ?? 0));
  }, []);
  return n;
}
