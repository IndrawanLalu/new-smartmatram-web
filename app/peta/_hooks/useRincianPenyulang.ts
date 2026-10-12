"use client";

import { useEffect, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase-browser";
import { fetchAllRows } from "@/lib/supabasePaginate";
import { muatLabel, type LabelIsian, type RekapSegmen } from "./useSegmenPeta";

/**
 * Rincian satu penyulang JTM = gabungan segmen-segmennya (12 Okt 2026), untuk
 * kartu yang terbuka saat nama penyulang di folder JTM diklik.
 *
 * Master: jumlah dari `segmen_ringkas` (segmen bertiang, sama dengan pohon).
 * Hasil inspeksi: baris subtotal penyulang `rekap_data_jtm` (segmen_id kosong)
 * — dihitung di server, sama dengan tab Rekap Data, jadi tiang yang tercatat
 * di dua segmen tidak terhitung dua kali.
 */

export interface MasterPenyulang {
  segmen: number;
  panjangKm: number;
  tiang: number;
  bentang: number;
  bentangTanpaTitik: number;
}

interface Keadaan {
  kunci: string;
  kode: string;
  ulp: string;
  master: MasterPenyulang;
  rekap: RekapSegmen | null;
  segmenDinilai: number;
  label: LabelIsian | null;
}

interface BarisRekap extends RekapSegmen {
  segmen_id: string | null;
}

async function muat(kode: string, ulp: string, kunci: string): Promise<Keadaan> {
  const [segmen, rekap, label] = await Promise.all([
    fetchAllRows<{ panjang_km: number; jumlah_tiang: number; jumlah_gawang: number; gawang_tanpa_titik: number }>(() =>
      supabaseBrowser
        .from("segmen_ringkas")
        .select("panjang_km,jumlah_tiang,jumlah_gawang,gawang_tanpa_titik,segmen_id")
        .eq("status", "aktif")
        .eq("ulp", ulp)
        .eq("penyulang", kode)
        .gt("jumlah_tiang", 0)
        .order("segmen_id"),
    ),
    supabaseBrowser.rpc("rekap_data_jtm", { p_ulp: ulp }).eq("penyulang", kode.toUpperCase()),
    muatLabel().catch(() => null),
  ]);
  if (rekap.error) throw new Error(rekap.error.message);

  const baris = (rekap.data ?? []) as BarisRekap[];
  const sub = baris.find((b) => b.segmen_id === null) ?? null;
  return {
    kunci,
    kode,
    ulp,
    master: {
      segmen: segmen.length,
      panjangKm: segmen.reduce((n, s) => n + Number(s.panjang_km), 0),
      tiang: segmen.reduce((n, s) => n + Number(s.jumlah_tiang), 0),
      bentang: segmen.reduce((n, s) => n + Number(s.jumlah_gawang), 0),
      bentangTanpaTitik: segmen.reduce((n, s) => n + Number(s.gawang_tanpa_titik), 0),
    },
    rekap: sub ? { ...sub, kms: Number(sub.kms), gardu_kva: Number(sub.gardu_kva) } : null,
    segmenDinilai: baris.filter((b) => b.segmen_id !== null && b.tiang > 0).length,
    label,
  };
}

export function useRincianPenyulang(p: { kode: string; ulp: string } | null) {
  const kunci = p ? `${p.ulp}|${p.kode}` : null;
  const [isi, setIsi] = useState<Keadaan | null>(null);
  const [galat, setGalat] = useState<{ kunci: string; pesan: string } | null>(null);

  useEffect(() => {
    if (!p || !kunci) return;
    let hidup = true;
    muat(p.kode, p.ulp, kunci).then(
      (k) => hidup && setIsi(k),
      (e: Error) => hidup && setGalat({ kunci, pesan: e.message }),
    );
    return () => { hidup = false; };
    // p dibaca lewat kuncinya — objek baru dengan isi sama tidak memuat ulang.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kunci]);

  // Isi penyulang sebelumnya tidak boleh tampil sesaat di penyulang yang baru.
  const kini = kunci && isi?.kunci === kunci ? isi : null;
  return {
    kode: p?.kode ?? "",
    ulp: p?.ulp ?? "",
    master: kini?.master ?? null,
    rekap: kini?.rekap ?? null,
    segmenDinilai: kini?.segmenDinilai ?? 0,
    label: kini?.label ?? null,
    memuat: !!kunci && !kini && galat?.kunci !== kunci,
    galat: galat?.kunci === kunci ? galat.pesan : null,
  };
}

export type RincianPenyulangPeta = ReturnType<typeof useRincianPenyulang>;
