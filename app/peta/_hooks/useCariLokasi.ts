"use client";

import { useState } from "react";
import { supabaseBrowser } from "@/lib/supabase-browser";
import { bacaKoordinat, type Titik } from "@/lib/koordinat";

/**
 * Cari lokasi/koordinat: satu titik → penyulang, gardu, dan JTR terdekat
 * dalam 1 km (`cari_lokasi`, scripts/cari-lokasi.sql). Titik datang dari teks
 * yang ditempel atau dari GPS perangkat ("Titik saya").
 */

export const RADIUS_CARI_M = 1000;

interface Dekat extends Titik {
  ulp: string;
  kode: string;
  jarak: number;
}
export interface JtmDekat extends Dekat {
  tiang_id: string;
  penyulang: string;
  segmen: string | null;
}
export interface GarduDekat extends Dekat {
  nama: string | null;
  penyulang: string | null;
  daya: number | null;
}
export interface JtrDekat extends Dekat {
  tiang_id: string;
  gardu_kode: string;
  jurusan: string | null;
}
export interface HasilCari {
  jtm: JtmDekat[];
  gardu: GarduDekat[];
  jtr: JtrDekat[];
}

export function useCariLokasi() {
  const [titik, setTitik] = useState<Titik | null>(null);
  const [hasil, setHasil] = useState<HasilCari | null>(null);
  const [sibuk, setSibuk] = useState(false);
  const [galat, setGalat] = useState<string | null>(null);

  const muat = async (t: Titik) => {
    setTitik(t);
    setHasil(null);
    setGalat(null);
    setSibuk(true);
    const { data, error } = await supabaseBrowser.rpc("cari_lokasi", {
      p_lat: t.lat, p_lng: t.lng, p_radius_m: RADIUS_CARI_M,
    });
    setSibuk(false);
    if (error) setGalat(`Gagal mencari: ${error.message}`);
    else setHasil(data as HasilCari);
  };

  const cari = (teks: string) => {
    const b = bacaKoordinat(teks);
    if ("galat" in b) {
      setGalat(b.galat);
      return;
    }
    void muat(b.titik);
  };

  const titikSaya = () => {
    if (!navigator.geolocation) {
      setGalat("Peramban ini tidak bisa membaca lokasi.");
      return;
    }
    setSibuk(true);
    setGalat(null);
    navigator.geolocation.getCurrentPosition(
      (p) => void muat({ lat: p.coords.latitude, lng: p.coords.longitude }),
      (e) => {
        setSibuk(false);
        setGalat(e.code === e.PERMISSION_DENIED ? "Izin lokasi ditolak peramban." : "Lokasi perangkat tidak terbaca.");
      },
      { enableHighAccuracy: true, timeout: 15000 },
    );
  };

  const tutup = () => {
    setTitik(null);
    setHasil(null);
    setGalat(null);
  };

  return { titik, hasil, sibuk, galat, cari, titikSaya, tutup };
}

export type CariLokasi = ReturnType<typeof useCariLokasi>;
