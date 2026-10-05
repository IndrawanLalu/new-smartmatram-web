"use client";

import { useEffect, useMemo, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase-browser";
import { BAWAAN_GARDU, type BarisTempel } from "../_lib/tempelWo";

/**
 * Tempel WO bersatuan gardu cukup kode gardu (keputusan user 5 Okt 2026):
 * alamat, kVA, dan penyulang dibaca dari Master Gardu ULP itu SEBELUM disimpan,
 * supaya pratinjau sudah memperlihatkan isi lampiran yang akan terbit — dan
 * gardu yang tidak ada di master langsung kelihatan, bukan baru ketahuan di
 * hasil simpan. Server (`tempel_wo`) tetap memeriksa ulang dengan aturan sama.
 */

interface MasterGardu {
  kode: string;
  alamat: string | null;
  daya: number | null;
  feeder: string | null;
}

export interface BarisGardu extends BarisTempel {
  /** false = tidak ada di Master Gardu ULP ini (server akan menolaknya). */
  adaDiMaster: boolean;
  /** Master sudah dibaca untuk kode ini (sebelum itu jangan dianggap tidak ada). */
  diperiksa: boolean;
}

const POTONG = 150;

export function useLengkapiGardu(kunci: string, ulp: string, baris: BarisTempel[] | null, aktif: boolean) {
  const [master, setMaster] = useState<Map<string, MasterGardu | null>>(new Map());
  const [memuat, setMemuat] = useState(false);
  const [galat, setGalat] = useState<string | null>(null);

  // Kode ganda di tempelan dihitung sekali.
  const unik = useMemo(() => {
    if (!aktif || !baris) return [];
    const lihat = new Set<string>();
    return baris.filter((b) => {
      const k = b.objek.toUpperCase();
      if (lihat.has(k)) return false;
      lihat.add(k);
      return true;
    });
  }, [baris, aktif]);
  const ganda = (baris?.length ?? 0) - unik.length;

  const belumDicari = useMemo(() => unik.map((b) => b.objek.toUpperCase()).filter((k) => !master.has(k)), [unik, master]);
  const kunciCari = belumDicari.join(",");

  useEffect(() => {
    if (!kunciCari) return;
    let batal = false;
    // Jeda singkat: tempelan diketik/ditempel bertahap tidak memicu banyak kueri.
    const t = setTimeout(async () => {
      setMemuat(true);
      setGalat(null);
      const kode = kunciCari.split(",");
      const hasil = new Map<string, MasterGardu | null>(kode.map((k) => [k, null]));
      try {
        for (let i = 0; i < kode.length; i += POTONG) {
          const { data, error } = await supabaseBrowser
            .from("gardu")
            .select("kode,alamat,daya,feeder")
            .ilike("ulp", ulp)
            .in("kode", kode.slice(i, i + POTONG));
          if (error) throw new Error(error.message);
          for (const g of (data ?? []) as MasterGardu[]) hasil.set(g.kode.toUpperCase(), g);
        }
        if (!batal) setMaster((m) => new Map([...m, ...hasil]));
      } catch (e) {
        if (!batal) setGalat(`Master Gardu belum terbaca: ${e instanceof Error ? e.message : String(e)}`);
      } finally {
        if (!batal) setMemuat(false);
      }
    }, 300);
    return () => {
      batal = true;
      clearTimeout(t);
    };
  }, [kunciCari, ulp]);

  const lengkap = useMemo<BarisGardu[]>(() => {
    const bawaan = BAWAAN_GARDU[kunci];
    return unik.map((b) => {
      const g = master.get(b.objek.toUpperCase());
      return {
        ...b,
        objek: g?.kode ?? b.objek.toUpperCase(),
        // Master menang; isian tempelan hanya kalau master kosong.
        alamat: g?.alamat?.trim() || b.alamat,
        kva: g?.daya ?? b.kva,
        penyulang: g?.feeder ?? b.penyulang,
        keterangan: b.keterangan || bawaan?.keterangan || null,
        pelaksana: b.pelaksana || bawaan?.pelaksana || null,
        adaDiMaster: !!g,
        diperiksa: master.has(b.objek.toUpperCase()),
      };
    });
  }, [unik, master, kunci]);

  return {
    baris: lengkap,
    ganda,
    tidakAda: lengkap.filter((b) => b.diperiksa && !b.adaDiMaster).length,
    // Gagal membaca master tidak mengunci Simpan — server tetap memeriksa.
    memuat: !galat && (memuat || belumDicari.length > 0),
    galat,
  };
}
