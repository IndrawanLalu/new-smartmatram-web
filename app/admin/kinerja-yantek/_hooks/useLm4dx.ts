"use client";

import { useEffect, useMemo, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase-browser";
import { fetchAllRows } from "@/lib/supabasePaginate";
import { hariIniWita } from "../_lib/realisasiHarian";
import { susunMatriks, type BarisLm, type ItemLm, type Kategori } from "../_lib/lm4dx";

/**
 * Data Copy to LM 4DX: daftar baris (`lm4dx_baris`), kategori Pemeliharaan
 * Jaringan, dan `realisasi_rentang` sebulan — kode kategori tiap catatan
 * Pemeliharaan Jaringan dibaca lewat `sumber_id`.
 */

const POTONG = 200;

/** Id inspeksi JTM yang Tier 1 + drone (jtm-tier1-drone.sql). */
async function ambilDrone(id: string[]) {
  const ada = new Set<string>();
  for (let i = 0; i < id.length; i += POTONG) {
    const { data, error } = await supabaseBrowser
      .from("inspeksi_jtm")
      .select("id")
      .in("id", id.slice(i, i + POTONG))
      .eq("drone", true);
    if (error) throw new Error(error.message);
    for (const r of data ?? []) ada.add(String(r.id));
  }
  return ada;
}

async function ambilKodeKategori(id: string[]) {
  const peta = new Map<string, string>();
  for (let i = 0; i < id.length; i += POTONG) {
    const { data, error } = await supabaseBrowser
      .from("pemeliharaan_jaringan_daftar")
      .select("id,kategori")
      .in("id", id.slice(i, i + POTONG));
    if (error) throw new Error(error.message);
    for (const r of data ?? []) if (r.kategori) peta.set(String(r.id), r.kategori);
  }
  return peta;
}

const akhirBulan = (bulan: string) => {
  const [y, m] = bulan.split("-").map(Number);
  return `${bulan}-${String(new Date(y, m, 0).getDate()).padStart(2, "0")}`;
};

export function useLm4dx(ulpAwal: string) {
  const [ulp, gantiUlp] = useState(ulpAwal);
  const [bulan, gantiBulan] = useState(() => hariIniWita().slice(0, 7));
  const [baris, setBaris] = useState<BarisLm[]>([]);
  const [kategori, setKategori] = useState<Kategori[]>([]);
  const [item, setItem] = useState<ItemLm[]>([]);
  const [loading, setLoading] = useState(true);
  const [galat, setGalat] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    let hidup = true;
    (async () => {
      try {
        const [rows, daftar, kat] = await Promise.all([
          fetchAllRows<Record<string, unknown>>(() =>
            supabaseBrowser
              .rpc("realisasi_rentang", { p_ulp: ulp, p_dari: `${bulan}-01`, p_sampai: akhirBulan(bulan) })
              .order("tgl")
              .order("sumber")
              .order("sumber_id"),
          ),
          supabaseBrowser.from("lm4dx_baris").select("id,urutan,uraian,sumber").order("urutan"),
          supabaseBrowser.from("pemeliharaan_jaringan_ref").select("kode,label").order("urutan"),
        ]);
        if (daftar.error) throw new Error(`Daftar baris LM 4DX gagal dibaca: ${daftar.error.message}`);
        if (kat.error) throw new Error(kat.error.message);
        // Tegangan ujung bukan realisasi pengukuran (sama dengan Rekap Kinerja).
        const pakai = rows.filter((r) => r.bagian !== "ujung");
        const idHarjtm = pakai.filter((r) => r.kunci === "harjtm" && r.sumber_id).map((r) => String(r.sumber_id));
        const idJtm = pakai.filter((r) => r.kunci === "jtm" && r.sumber_id).map((r) => String(r.sumber_id));
        const [kodeKat, drone] = await Promise.all([ambilKodeKategori(idHarjtm), ambilDrone(idJtm)]);
        if (!hidup) return;
        setItem(pakai.map((r) => ({
          tgl: r.tgl as string,
          kunci: r.kunci as string,
          km: r.km === null || r.km === undefined ? null : Number(r.km),
          kategori: r.sumber_id ? kodeKat.get(String(r.sumber_id)) ?? null : null,
          drone: drone.has(String(r.sumber_id)),
          // Baris JTM realisasi_rentang: rincian = penyulang.
          penyulang: r.kunci === "jtm" ? ((r.rincian as string | null) ?? null) : null,
        })));
        setBaris(daftar.data as BarisLm[]);
        setKategori(kat.data as Kategori[]);
        setGalat(null);
      } catch (e) {
        if (!hidup) return;
        setItem([]);
        setGalat(e instanceof Error ? e.message : String(e));
      }
      if (hidup) setLoading(false);
    })();
    return () => { hidup = false; };
  }, [ulp, bulan, nonce]);

  const mulai = () => { setLoading(true); setGalat(null); };
  const muat = () => { mulai(); setNonce((n) => n + 1); };
  const setUlp = (u: string) => { mulai(); gantiUlp(u); };
  const setBulan = (b: string) => { if (b) { mulai(); gantiBulan(b); } };

  const matriks = useMemo(() => susunMatriks(baris, item), [baris, item]);
  const namaKategori = useMemo(() => new Map(kategori.map((k) => [k.kode, k.label])), [kategori]);

  return { ulp, setUlp, bulan, setBulan, baris, kategori, namaKategori, matriks, loading, galat, muat };
}
