"use client";

import { useEffect, useRef, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase-browser";
import type { Jaringan } from "./usePetaDaftar";

/**
 * Cari nomor tiang dari kotak "Cari lokasi/koordinat" (24 Nov 2026). Tiang
 * tidak ada di browser (puluhan ribu), jadi ditanyakan ke server — hemat:
 *
 *   • debounce: baru bertanya JEDA_MS sesudah berhenti mengetik, minimal
 *     MIN_HURUF huruf; tiap ketukan membatalkan hitung mundur sebelumnya;
 *   • permintaan yang sudah berangkat DIBATALKAN (AbortController) begitu
 *     teksnya berubah — tidak menunggu jawaban yang pasti dibuang;
 *   • jawaban disimpan per teks: menghapus lalu mengetik ulang tidak bertanya lagi;
 *   • selama mengetik, hasil sebelumnya tetap tampil (tidak berkedip kosong).
 *
 * Sumbernya `peta_tiang`: tiang yang memang digambar di peta.
 */

const MIN_HURUF = 3;
const BATAS = 20;
const JEDA_MS = 400;
/** Jawaban tersimpan per teks — sebanyak ini cukup untuk satu sesi mencari. */
const SIMPAN_MAKS = 50;

export interface TiangCari {
  id: string;
  kode: string;
  ulp: string;
  lat: number;
  lng: number;
  jaringan: Jaringan;
  /** Penyulang (JTM) atau kode gardu (JTR). */
  kelompok: string;
}

/** `%` dan `_` di teks pengguna jangan jadi wildcard ilike. */
const lepas = (s: string) => s.replace(/[\\%_]/g, (c) => `\\${c}`);

export function useCariTiang(teks: string, ulp: string, aktif: boolean) {
  const q = teks.trim().toUpperCase();
  const boleh = aktif && q.length >= MIN_HURUF;
  const kunci = `${ulp}|${q}`;
  const simpanan = useRef(new Map<string, TiangCari[]>());
  const [hasil, setHasil] = useState<{ kunci: string; baris: TiangCari[] } | null>(null);
  const [galat, setGalat] = useState<{ kunci: string; pesan: string } | null>(null);

  useEffect(() => {
    if (!boleh) return;
    const tersimpan = simpanan.current.get(kunci);
    if (tersimpan) {
      // Tetap lewat setTimeout(0): setState langsung di badan efek memicu
      // render berantai (aturan react-hooks).
      const t = setTimeout(() => setHasil({ kunci, baris: tersimpan }), 0);
      return () => clearTimeout(t);
    }
    const batal = new AbortController();
    const jeda = setTimeout(() => {
      let kueri = supabaseBrowser
        .from("peta_tiang")
        .select("id,kode,ulp,lat,lng,jaringan,induk_kelompok")
        .ilike("kode", `%${lepas(q)}%`);
      if (ulp) kueri = kueri.eq("ulp", ulp);
      void kueri.order("kode").limit(BATAS).abortSignal(batal.signal).then(({ data, error }) => {
        if (batal.signal.aborted) return;
        if (error) { setGalat({ kunci, pesan: error.message }); return; }
        const baris = (data ?? []).map((x): TiangCari => ({
          id: x.id as string,
          kode: x.kode as string,
          ulp: (x.ulp as string) ?? "",
          lat: Number(x.lat), lng: Number(x.lng),
          jaringan: x.jaringan as Jaringan,
          kelompok: (x.induk_kelompok as string) ?? "",
        }));
        // Yang persis sama dulu, lalu yang berawalan teks itu, baru sisanya.
        const nilai = (k: string) => (k.toUpperCase() === q ? 0 : k.toUpperCase().startsWith(q) ? 1 : 2);
        baris.sort((a, b) => nilai(a.kode) - nilai(b.kode) || a.kode.localeCompare(b.kode, "id"));
        const m = simpanan.current;
        m.set(kunci, baris);
        if (m.size > SIMPAN_MAKS) m.delete(m.keys().next().value as string);
        setHasil({ kunci, baris });
      });
    }, JEDA_MS);
    return () => { clearTimeout(jeda); batal.abort(); };
  }, [boleh, kunci, q, ulp]);

  const segar = boleh && hasil?.kunci === kunci;
  const gagal = boleh && galat?.kunci === kunci ? galat.pesan : null;
  return {
    /** Belum cukup huruf / teksnya koordinat → tidak ada bagian Tiang sama sekali. */
    tampil: boleh,
    /** Hasil teks sebelumnya tetap ditampilkan selama teks baru belum dijawab. */
    baris: boleh && hasil ? hasil.baris : [],
    /** Hasil yang tampil bukan untuk teks yang sekarang (sedang menunggu jawaban). */
    sibuk: boleh && !segar && !gagal,
    galat: gagal,
    penuh: segar && hasil.baris.length === BATAS,
  };
}
