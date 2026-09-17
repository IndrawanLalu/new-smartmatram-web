"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { supabaseBrowser } from "@/lib/supabase-browser";
import { fetchAllRows } from "@/lib/supabasePaginate";
import type { Jaringan } from "./usePetaDaftar";

/**
 * Isi peta: rute, tiang, dan gardu — dan ini tempat seluruh urusan berat
 * diselesaikan.
 *
 * ATURANNYA SATU: jangan kirim yang tidak bisa dilihat. Pada zoom se-pulau, dua
 * puluh ribu tiang jatuh di beberapa piksel yang sama; mata tidak bisa
 * membedakannya, jadi mengirimnya hanya membakar memori tanpa menambah satu pun
 * keterangan di layar.
 *
 * Tiga lapis penahan, dan yang PERTAMA paling menentukan:
 *
 *   1. Zoom menentukan APA yang dikirim. Di bawah 13 cuma garis rute — 82 baris
 *      untuk seluruh UP3. Di atas 15 tiang satu per satu, dan rute kasarnya
 *      berhenti: yang satu menggantikan yang lain, tidak menumpuk.
 *   2. Kotak pandang menentukan BERAPA BANYAK. Yang di luar layar tidak diminta.
 *   3. Kueri ditunda sampai peta berhenti bergerak, supaya satu geseran tidak
 *      menembakkan sepuluh permintaan yang sembilan di antaranya sudah basi.
 */

export const ZOOM_TIANG = 15;
export const ZOOM_GARDU = 13;

export interface Kotak {
  latMin: number;
  latMaks: number;
  lngMin: number;
  lngMaks: number;
  zoom: number;
}

export interface RuteBaris {
  penyulang: string;
  ulp: string;
  bentang: [number, number, number, number][];
}

export interface TiangPeta {
  id: string;
  kode: string;
  lat: number;
  lng: number;
  penanda: string | null;
  percabangan: boolean;
  jaringan: Jaringan;
  kelompok: string;
  indukLat: number | null;
  indukLng: number | null;
}

export interface GarduPeta {
  kode: string;
  nama: string;
  ulp: string;
  lat: number;
  lng: number;
  jumlahTiang: number;
}

/** Batas keras. Peta yang macet lebih buruk daripada peta yang berkata
 *  "perbesar dulu" — yang pertama membuat orang menutup halaman. */
const BATAS_TIANG = 4000;

export function usePetaIsi(
  kotak: Kotak | null,
  pilihan: { jaringan: Jaringan; kode: string }[],
  tampilGardu: boolean,
) {
  const [rute, setRute] = useState<RuteBaris[]>([]);
  const [tiang, setTiang] = useState<TiangPeta[]>([]);
  const [gardu, setGardu] = useState<GarduPeta[]>([]);
  const [sibuk, setSibuk] = useState(false);
  const [terpotong, setTerpotong] = useState(false);

  // Nomor urut permintaan: jawaban yang datang terlambat untuk kotak pandang
  // yang sudah berlalu HARUS dibuang. Tanpa ini, menggeser cepat membuat peta
  // menampilkan isi tempat yang barusan ditinggalkan.
  const urutRef = useRef(0);

  const kunciPilihan = pilihan.map((p) => `${p.jaringan}:${p.kode}`).sort().join("|");
  const kunciKotak = kotak
    ? `${kotak.zoom}|${kotak.latMin.toFixed(4)}|${kotak.latMaks.toFixed(4)}|${kotak.lngMin.toFixed(4)}|${kotak.lngMaks.toFixed(4)}`
    : "";

  const ambil = useCallback(async () => {
    if (!kotak) return;
    const urut = ++urutRef.current;
    const jtm = pilihan.filter((p) => p.jaringan === "jtm").map((p) => p.kode);
    const jtr = pilihan.filter((p) => p.jaringan === "jtr").map((p) => p.kode);

    if (jtm.length === 0 && jtr.length === 0 && !tampilGardu) {
      setRute([]); setTiang([]); setGardu([]); setTerpotong(false);
      return;
    }

    setSibuk(true);
    try {
      // ── Rute penyulang: HANYA selama tiangnya belum digambar ────────────
      // Rute ini garis KASAR — `segarkan_rute_penyulang` membuang tujuh dari
      // delapan tiang. Gunanya menahan tempat di zoom jauh, waktu tiang satu
      // per satu belum dikirim. Begitu tiang aslinya muncul, rute harus
      // minggir: dua garis untuk satu jaringan terbaca sebagai dua jaringan
      // yang tidak sinkron, padahal yang kasar memang tidak dimaksudkan akurat.
      let r: RuteBaris[] = [];
      if (jtm.length > 0 && kotak.zoom < ZOOM_TIANG) {
        const { data } = await supabaseBrowser
          .from("penyulang_rute")
          .select("penyulang,ulp,bentang")
          .in("penyulang", jtm);
        r = (data ?? []).map((x) => ({
          penyulang: x.penyulang as string,
          ulp: x.ulp as string,
          bentang: (x.bentang ?? []) as [number, number, number, number][],
        }));
      }

      // ── Gardu: mulai zoom menengah ─────────────────────────────────────
      let g: GarduPeta[] = [];
      if (tampilGardu && kotak.zoom >= ZOOM_GARDU) {
        const data = await fetchAllRows<Record<string, unknown>>(() =>
          supabaseBrowser
            .from("peta_gardu")
            .select("kode,nama,ulp,lat,lng,jumlah_tiang")
            .gte("lat", kotak.latMin).lte("lat", kotak.latMaks)
            .gte("lng", kotak.lngMin).lte("lng", kotak.lngMaks),
        );
        g = data.map((x) => ({
          kode: x.kode as string,
          nama: (x.nama as string) ?? (x.kode as string),
          ulp: (x.ulp as string) ?? "",
          lat: Number(x.lat), lng: Number(x.lng),
          jumlahTiang: Number(x.jumlah_tiang ?? 0),
        }));
      }

      // ── Tiang: hanya pada zoom dekat, hanya yang di layar ───────────────
      let t: TiangPeta[] = [];
      let potong = false;
      const kelompok = [...jtm, ...jtr];
      if (kelompok.length > 0 && kotak.zoom >= ZOOM_TIANG) {
        const data = await fetchAllRows<Record<string, unknown>>(() =>
          supabaseBrowser
            .from("peta_tiang")
            .select("id,kode,lat,lng,penanda,percabangan,jaringan,induk_kelompok,induk_lat,induk_lng")
            .in("induk_kelompok", kelompok)
            .gte("lat", kotak.latMin).lte("lat", kotak.latMaks)
            .gte("lng", kotak.lngMin).lte("lng", kotak.lngMaks),
        );
        potong = data.length > BATAS_TIANG;
        t = data.slice(0, BATAS_TIANG).map((x) => ({
          id: x.id as string,
          kode: x.kode as string,
          lat: Number(x.lat), lng: Number(x.lng),
          penanda: (x.penanda as string) ?? null,
          percabangan: !!x.percabangan,
          jaringan: x.jaringan as Jaringan,
          kelompok: (x.induk_kelompok as string) ?? "",
          indukLat: x.induk_lat !== null ? Number(x.induk_lat) : null,
          indukLng: x.induk_lng !== null ? Number(x.induk_lng) : null,
        }));
      }

      if (urut !== urutRef.current) return;   // kotak pandang sudah berpindah
      setRute(r); setGardu(g); setTiang(t); setTerpotong(potong);
    } catch {
      // Peta yang gagal memuat sebagian lebih baik diam daripada melempar
      // pemberitahuan tiap kali digeser di sinyal yang buruk.
      if (urut === urutRef.current) { setTiang([]); setTerpotong(false); }
    } finally {
      if (urut === urutRef.current) setSibuk(false);
    }
    // `kotak` dan `pilihan` sengaja tidak jadi dependensi: keduanya objek baru
    // tiap render. Yang dipakai kuncinya, di bawah.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kunciKotak, kunciPilihan, tampilGardu]);

  useEffect(() => {
    // Ditunda: menggeser peta memicu puluhan kejadian, dan sembilan puluh
    // persennya sudah basi sebelum jawabannya datang.
    const jeda = setTimeout(() => void ambil(), 250);
    return () => clearTimeout(jeda);
  }, [ambil]);

  return { rute, tiang, gardu, sibuk, terpotong };
}
