"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Ambil satu halaman gambar laporan dari `/api/gambar/<jenis>` sebagai blob.
 * Blob yang sama dipakai untuk pratinjau DAN unduhan — gambarnya tidak dibuat
 * dua kali, dan yang diunduh pasti yang dilihat.
 */

export interface Hasil {
  url: string;
  nama: string;
  halaman: number;
  jumlahHalaman: number;
}

interface Permintaan {
  jenis: string;
  ulp: string;
  /** YYYY-MM */
  bulan: string;
}

export function useGambarLaporan() {
  const [hasil, setHasil] = useState<Hasil | null>(null);
  const [membuat, setMembuat] = useState(false);
  const [galat, setGalat] = useState<string | null>(null);
  const urlLama = useRef<string | null>(null);

  // URL blob dilepas saat diganti atau saat halaman ditutup.
  const pasang = (h: Hasil | null) => {
    if (urlLama.current) URL.revokeObjectURL(urlLama.current);
    urlLama.current = h?.url ?? null;
    setHasil(h);
  };
  useEffect(() => () => { if (urlLama.current) URL.revokeObjectURL(urlLama.current); }, []);

  async function buat({ jenis, ulp, bulan }: Permintaan, halaman = 1) {
    setMembuat(true);
    setGalat(null);
    try {
      const p = new URLSearchParams({ ulp, bulan, halaman: String(halaman), unduh: "1" });
      const res = await fetch(`/api/gambar/${jenis}?${p.toString()}`);
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? "Gagal membuat gambar");
      const nama = /filename="([^"]+)"/.exec(res.headers.get("Content-Disposition") ?? "")?.[1] ?? `${jenis}.png`;
      const jumlahHalaman = Number(res.headers.get("X-Jumlah-Halaman") ?? 1) || 1;
      pasang({ url: URL.createObjectURL(await res.blob()), nama, halaman, jumlahHalaman });
    } catch (e) {
      pasang(null);
      setGalat(e instanceof Error ? e.message : "Gagal membuat gambar");
    } finally {
      setMembuat(false);
    }
  }

  return { hasil, membuat, galat, buat, kosongkan: () => { pasang(null); setGalat(null); } };
}
