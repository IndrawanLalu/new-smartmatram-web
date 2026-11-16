"use client";

import { useCallback, useEffect, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase-browser";
import { fetchAllRows } from "@/lib/supabasePaginate";
import { useToast } from "@/app/admin/_components/Toast";
import type { AlasanGk } from "@/lib/garduKhusus";

/**
 * Tab Gardu khusus di Master Gardu (scripts/gardu-khusus.sql): yang sudah
 * ditetapkan + usulan dari HP. Dua daftar kecil (ratusan baris paling banyak),
 * ditarik utuh lewat fetchAllRows, disaring ULP di kueri.
 */

export interface GarduKhusus {
  kode: string;
  ulp: string;
  nama: string | null;
  alamat: string | null;
  penyulang: string | null;
  alasan: AlasanGk[];
  keterangan: string | null;
  foto_url: string | null;
  foto_lain: string[];
  sumber: "hp" | "web";
  ditetapkan_oleh: string | null;
  ditetapkan_at: string;
}

export interface UsulanGk {
  id: string;
  kode: string;
  ulp: string;
  nama: string | null;
  alamat: string | null;
  penyulang: string | null;
  alasan: AlasanGk[];
  keterangan: string | null;
  foto_url: string | null;
  foto_lain: string[];
  modul: string | null;
  lat: number | null;
  lng: number | null;
  status: "menunggu" | "disetujui" | "ditolak";
  pengusul_nama: string | null;
  diusulkan_at: string;
  penilai_nama: string | null;
  dinilai_at: string | null;
  alasan_putusan: string | null;
}

export interface GarduPilihGk {
  kode: string;
  ulp: string;
  nama: string | null;
  feeder: string | null;
  /** Tanda AMG `GRD KHUSUS` — hanya petunjuk. */
  amg: boolean;
}

/** Jumlah item WO yang dibatalkan otomatis — dari RPC tetapkan/putuskan. */
interface WoBatal { inspeksi_gardu: number; inspeksi_jtr: number; pemeliharaan_gardu: number }

const ringkasWo = (w: WoBatal | null | undefined) => {
  const n = w ? w.inspeksi_gardu + w.inspeksi_jtr + w.pemeliharaan_gardu : 0;
  return n > 0
    ? ` ${n} item WO terbuka dibatalkan (Inspeksi Gardu ${w!.inspeksi_gardu}, Inspeksi JTR ${w!.inspeksi_jtr}, Pemeliharaan ${w!.pemeliharaan_gardu}).`
    : "";
};

const dilewatiTeks = (d: { gardu: string; sebab: string }[]) =>
  d.length ? ` Dilewati: ${d.slice(0, 5).map((x) => `${x.gardu} (${x.sebab})`).join(", ")}${d.length > 5 ? ", …" : ""}` : "";

/** `ulp` kosong = semua ULP (UP3). */
export function useGarduKhusus(ulp: string, oleh: string) {
  const toast = useToast();
  const [khusus, setKhusus] = useState<GarduKhusus[] | null>(null);
  const [usulan, setUsulan] = useState<UsulanGk[] | null>(null);
  const [galat, setGalat] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    let hidup = true;
    Promise.all([
      fetchAllRows<GarduKhusus>(() => {
        const q = supabaseBrowser.from("gardu_khusus_daftar").select("*");
        return (ulp ? q.eq("ulp", ulp.toUpperCase()) : q).order("ulp").order("kode");
      }),
      fetchAllRows<UsulanGk>(() => {
        const q = supabaseBrowser.from("gardu_khusus_usulan").select("*");
        return (ulp ? q.eq("ulp", ulp.toUpperCase()) : q).order("diusulkan_at", { ascending: false }).order("id");
      }),
    ]).then(
      ([k, u]) => {
        if (!hidup) return;
        setKhusus(k);
        setUsulan(u);
        setGalat(null);
      },
      (e: Error) => { if (hidup) setGalat(e.message); },
    );
    return () => { hidup = false; };
  }, [ulp, nonce]);

  const muatUlang = () => setNonce((n) => n + 1);

  /** Master gardu untuk dipilih (hanya saat modal Tetapkan dibuka). */
  const muatPilihan = useCallback(async (): Promise<GarduPilihGk[]> => {
    const rows = await fetchAllRows<{ kode: string; ulp: string; nama: string | null; feeder: string | null; amg: string | null }>(() => {
      const q = supabaseBrowser.from("gardu").select('kode,ulp,nama,feeder,amg:data_amg->>"GRD KHUSUS"');
      return (ulp ? q.eq("ulp", ulp.toUpperCase()) : q).order("ulp").order("kode").order("id");
    });
    return rows.map((r) => ({ kode: r.kode.trim(), ulp: r.ulp, nama: r.nama, feeder: r.feeder, amg: r.amg?.trim().toUpperCase() === "YA" }));
  }, [ulp]);

  const tetapkan = async (gardu: { kode: string; ulp: string }[], alasan: AlasanGk[], keterangan: string) => {
    const { data, error } = await supabaseBrowser.rpc("tetapkan_gardu_khusus", {
      p_gardu: gardu, p_alasan: alasan, p_keterangan: keterangan || null, p_oleh: oleh,
    });
    if (error) {
      toast.error(error.message);
      return false;
    }
    const h = data as { ditetapkan: number; dilewati: { gardu: string; sebab: string }[]; wo_dibatalkan: WoBatal };
    toast.success(`${h.ditetapkan} gardu ditetapkan gardu khusus.${ringkasWo(h.wo_dibatalkan)}${dilewatiTeks(h.dilewati)}`);
    muatUlang();
    return true;
  };

  const kembalikan = async (gardu: { kode: string; ulp: string }[], alasan: string) => {
    const { data, error } = await supabaseBrowser.rpc("kembalikan_gardu_biasa", { p_gardu: gardu, p_alasan: alasan, p_oleh: oleh });
    if (error) {
      toast.error(error.message);
      return false;
    }
    const h = data as { dikembalikan: number; dilewati: { gardu: string; sebab: string }[] };
    toast.success(`${h.dikembalikan} gardu dikembalikan jadi gardu biasa.${dilewatiTeks(h.dilewati)}`);
    muatUlang();
    return true;
  };

  const putuskan = async (id: string, setuju: boolean, alasan: string) => {
    const { data, error } = await supabaseBrowser.rpc("putuskan_gardu_khusus", {
      p_usulan: id, p_setuju: setuju, p_alasan: alasan || null, p_oleh: oleh,
    });
    if (error) {
      toast.error(error.message);
      return false;
    }
    const h = data as { wo_dibatalkan: WoBatal | null };
    toast.success(setuju ? `Disetujui — gardu kini gardu khusus.${ringkasWo(h.wo_dibatalkan)}` : "Usulan ditolak, dikembalikan ke petugas.");
    muatUlang();
    return true;
  };

  return { khusus, usulan, galat, muatUlang, muatPilihan, tetapkan, kembalikan, putuskan };
}
