"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase-browser";

/**
 * Kalender rabas per penyulang / segmen (scripts/perabasan-kalender.sql,
 * 11 Nov 2026). Satu panggilan RPC; dikelompokkan per penyulang di sini.
 *
 * Dirabas = segmen DIVERIFIKASI, bulan = tanggal mulai dirabas. Usulan WO
 * bulan depan = segmen yang sudah lewat siklus rabas ULP-nya (bawaan 2 bulan),
 * tidak sedang dipegang WO, dan tidak dalam masa garansi.
 */

export const SIKLUS_BAWAAN = 2;

export interface SegmenKalender {
  id: string;
  ulp: string;
  penyulang: string;
  nama: string;
  km: number | null;
  terakhir: string | null;
  terakhir_regu: string | null;
  /** Bulan (1–12) tahun terpilih segmen ini dirabas (diverifikasi). */
  rabas: number[];
  /** Bulan WO tahun terpilih yang belum diverifikasi. */
  wo: number[];
  wo_aktif: string | null;
  garansi_sampai: string | null;
  /** Diturunkan di sini. */
  usulan: boolean;
}

export interface PenyulangKalender {
  kunci: string;
  ulp: string;
  penyulang: string;
  km: number;
  segmen: SegmenKalender[];
  /** % km penyulang yang dirabas per bulan (indeks 0 = Januari). */
  persen: number[];
  /** Ada segmen yang di-WO-kan di bulan itu tapi belum diverifikasi. */
  adaWo: boolean[];
  terakhir: string | null;
  usulanKm: number;
  usulanSegmen: number;
}

interface Jawab { bulan_depan: string; siklus: Record<string, number>; segmen: Omit<SegmenKalender, "usulan">[] }

const selisihBulan = (dari: string, ke: string) =>
  (Number(ke.slice(0, 4)) * 12 + Number(ke.slice(5, 7))) - (Number(dari.slice(0, 4)) * 12 + Number(dari.slice(5, 7)));

export function useKalenderPerabasan(ulp: string, tahun: number) {
  const [jawab, setJawab] = useState<Jawab | null>(null);
  const [galat, setGalat] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    let hidup = true;
    supabaseBrowser.rpc("perabasan_kalender", { p_ulp: ulp, p_tahun: tahun }).then(({ data, error }) => {
      if (!hidup) return;
      setGalat(error ? error.message : null);
      setJawab(error ? null : (data as Jawab));
    });
    return () => { hidup = false; };
  }, [ulp, tahun, nonce]);

  const siklusUlp = useCallback((u: string) => jawab?.siklus[u] ?? SIKLUS_BAWAAN, [jawab]);

  const penyulang = useMemo<PenyulangKalender[]>(() => {
    if (!jawab) return [];
    const kelompok = new Map<string, PenyulangKalender>();
    for (const s0 of jawab.segmen) {
      const usulan = !s0.wo_aktif && !s0.garansi_sampai &&
        (!s0.terakhir || selisihBulan(s0.terakhir, jawab.bulan_depan) >= siklusUlp(s0.ulp));
      const s: SegmenKalender = { ...s0, km: s0.km === null ? null : Number(s0.km), usulan };
      const k = `${s.ulp}|${s.penyulang}`;
      const p = kelompok.get(k) ?? {
        kunci: k, ulp: s.ulp, penyulang: s.penyulang, km: 0, segmen: [], persen: [], adaWo: [], terakhir: null, usulanKm: 0, usulanSegmen: 0,
      };
      p.segmen.push(s);
      p.km += s.km ?? 0;
      if (s.terakhir && (!p.terakhir || s.terakhir > p.terakhir)) p.terakhir = s.terakhir;
      if (usulan) { p.usulanKm += s.km ?? 0; p.usulanSegmen += 1; }
      kelompok.set(k, p);
    }
    return [...kelompok.values()].map((p) => ({
      ...p,
      km: Math.round(p.km * 100) / 100,
      usulanKm: Math.round(p.usulanKm * 100) / 100,
      persen: Array.from({ length: 12 }, (_, i) => {
        const km = p.segmen.filter((s) => s.rabas.includes(i + 1)).reduce((a, s) => a + (s.km ?? 0), 0);
        const n = p.segmen.filter((s) => s.rabas.includes(i + 1)).length;
        // Segmen tanpa panjang tetap terhitung: pakai jumlah segmen bila km nol.
        return p.km > 0 ? Math.round((km / p.km) * 100) : Math.round((n / p.segmen.length) * 100);
      }),
      adaWo: Array.from({ length: 12 }, (_, i) => p.segmen.some((s) => s.wo.includes(i + 1))),
    }));
  }, [jawab, siklusUlp]);

  const simpanSiklus = async (u: string, bulan: number, oleh: string) => {
    const { error } = await supabaseBrowser.rpc("simpan_perabasan_siklus", { p_ulp: u, p_bulan: bulan, p_oleh: oleh });
    if (error) throw new Error(error.message);
    setNonce((n) => n + 1);
  };

  return {
    loading: !jawab && !galat,
    galat,
    penyulang,
    bulanDepan: jawab?.bulan_depan ?? null,
    siklusUlp,
    simpanSiklus,
  };
}
