"use client";

import { useState } from "react";
import { STATUS_UJUNG_PETA, useUjungPeta, type NadaUjung, type SaringUjung } from "./useUjungPeta";
import { useKesehatanPeta, type SaringKesehatan, type StatusKesehatan } from "./useKesehatanPeta";
import { usePohonPeta, type SaringPohon, type TemuanPohon } from "./usePohonPeta";

/**
 * Lapisan di atas jaringan yang punya saklar + saringannya sendiri: tegangan
 * ujung, kesehatan gardu, pohon. Tiap hook menyimpan keadaan saklarnya dan
 * membaca datanya hanya selama menyala.
 */

/** Bulan berjalan menurut WITA (UTC+8). */
const bulanIni = () => {
  const w = new Date(Date.now() + 8 * 3600 * 1000);
  return { tahun: w.getUTCFullYear(), bulan: w.getUTCMonth() + 1 };
};

const SARING_UJUNG_AWAL: SaringUjung = {
  nada: new Set<NadaUjung>(["merah", "kuning", "hijau"]),
  status: new Set(STATUS_UJUNG_PETA),
  jauhDariUjung: null,
};

const SARING_POHON_AWAL: SaringPohon = {
  sumber: new Set(["inspeksi", "perabasan", "pengecekan"] as const),
  vegetasi: new Set(["menyentuh", "berpotensi"] as const),
  tugas: new Set(["belum", "sudah"] as const),
  sembunyikanTertangani: false,
};

const SARING_KESEHATAN_AWAL: SaringKesehatan = {
  status: new Set<StatusKesehatan>(["merah", "kuning", "hijau"]),
  hanyaSisip: false,
  hanyaJurusan160: false,
};

export function useLapisanUjung(ulp: string) {
  const [aktif, setAktif] = useState(false);
  const [bulan, setBulan] = useState(bulanIni);
  const [saring, setSaring] = useState<SaringUjung>(SARING_UJUNG_AWAL);
  /** JTR gardu titik-titiknya ikut digambar (lapisan JTR yang sama). */
  const [tampilJtr, setTampilJtr] = useState(false);
  const data = useUjungPeta(aktif, ulp, bulan.tahun, bulan.bulan, saring);
  return { ...data, aktif, setAktif, bulan, setBulan, saring, setSaring, tampilJtr, setTampilJtr };
}

export function useLapisanKesehatan(ulp: string) {
  const [aktif, setAktif] = useState(false);
  const [saring, setSaring] = useState<SaringKesehatan>(SARING_KESEHATAN_AWAL);
  const data = useKesehatanPeta(aktif, ulp, saring);
  return { ...data, aktif, setAktif, saring, setSaring };
}

/** Pohon menyala lewat kunci `pohon:<PENYULANG>` di `nyala` (panel kiri). */
export function useLapisanPohon(ulp: string, nyala: Set<string>) {
  const [bulan, setBulan] = useState(bulanIni);
  const [saring, setSaring] = useState<SaringPohon>(SARING_POHON_AWAL);
  const data = usePohonPeta(ulp, bulan.tahun, bulan.bulan, saring, nyala);
  // Menugaskan dari peta: satu pohon (popup) atau semua yang tampil & belum.
  const [tugas, setTugas] = useState<TemuanPohon[] | null>(null);
  const bisaDitugaskan = data.temuan.filter((t) => t.kunciTugas);
  return { ...data, bulan, setBulan, saring, setSaring, tugas, setTugas, bisaDitugaskan };
}
