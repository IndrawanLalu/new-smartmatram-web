"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { supabaseBrowser } from "@/lib/supabase-browser";
import { fetchAllRows } from "@/lib/supabasePaginate";
import type { Jaringan } from "./usePetaDaftar";
import { Simpanan, batas, gabung, petakDi, petakTitik, rentangKotak } from "../_lib/petak";

/**
 * Isi peta: rute, tiang, dan gardu — dan ini tempat seluruh urusan berat
 * diselesaikan.
 *
 * ATURANNYA SATU: jangan kirim yang tidak bisa dilihat. Pada zoom se-pulau, dua
 * puluh ribu tiang jatuh di beberapa piksel yang sama; mata tidak bisa
 * membedakannya, jadi mengirimnya hanya membakar memori tanpa menambah satu pun
 * keterangan di layar.
 *
 * Empat lapis penahan, dan yang PERTAMA paling menentukan:
 *
 *   1. Zoom menentukan APA yang dikirim. Di bawah 13 cuma garis rute — satu
 *      baris per penyulang. Mulai 13 tiang satu per satu, dan rute kasarnya
 *      berhenti: yang satu menggantikan yang lain, tidak menumpuk.
 *   2. Kotak pandang menentukan BERAPA BANYAK. Yang di luar layar tidak diminta.
 *   3. Kueri ditunda sampai peta berhenti bergerak, supaya satu geseran tidak
 *      menembakkan sepuluh permintaan yang sembilan di antaranya sudah basi.
 *   4. Cache memori per PETAK (24 Nov 2026, _lib/petak.ts): area yang sudah
 *      dimuat tidak diunduh lagi selama halaman terbuka (umur 10 menit).
 */

/** Tiang muncul mulai zoom 13, bukan 15. Di 15 orang harus memperbesar tiga
 *  tingkat dari zoom bukaan sebelum satu nama pun bisa dibaca, dan sebelum itu
 *  yang terlihat hanya garis — mudah disimpulkan bahwa tiangnya memang tidak
 *  punya nama. Saringan kotak pandang dan BATAS_TIANG yang menahan bebannya,
 *  bukan gerbang ini; gerbang ini hanya mencegah permintaan yang jelas-jelas
 *  sia-sia di zoom se-pulau. */
export const ZOOM_TIANG = 13;

/** Gerbang gardu sengaja RENDAH — peta terbuka di zoom 12, dan gerbang di 13
 *  berarti halaman terbuka kosong meski saklarnya menyala; orang menyimpulkan
 *  saklarnya rusak, bukan zoomnya kurang. Menahan 2.092 gardu juga bukan
 *  penghematan yang berarti: digambar ke kanvas jumlah segitu ringan, dan
 *  `/admin/peta-gardu` sudah lama menggambar 815+ penanda sebagai elemen DOM
 *  tanpa keluhan. Yang benar-benar perlu ditahan itu tiang — puluhan ribu, dan
 *  gerbangnya ada di ZOOM_TIANG. */
export const ZOOM_GARDU = 11;

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
  /** Tiang ini bukan milik penyulang/gardu yang sedang dinyalakan — kabelnya
   *  menumpang di batang orang lain. */
  menumpang: boolean;
  /** JTR: jumlah kabel gardu ini di tiang ini — ≥2 = underbuild JTR. */
  jumlahKabel: number | null;
  /** JTR: ada kabel yang belum jelas datang dari tiang mana. */
  kabelPutus: boolean;
  /** JTR yang berdiri di tiang JTM (dicatat "ada JTM di atasnya", atau batang
   *  pinjamannya tiang JTM). */
  diJtm: boolean;
  /** JTR: gardu lain di batang ini ("AM071", "?" = dinyatakan regu, kode belum diketahui). */
  garduBersama: string | null;
  /** JTR: nomor kabel gardu ini di tiang ini — "1", "1,2", "3". */
  nomorKabel: string | null;
  /** JTM: tiang kedua gardu portal — id tiang gardunya. */
  pasanganPortalDari: string | null;
  /** JTM: kode gardu yang berdiri di tiang ini (AM013). */
  garduDiTiang: string | null;
  /** JTM: nama peralatan di tiang bertanda (SAMPOERNA) — label di samping ikonnya. */
  namaPeralatan: string | null;
  /** JTM: tiang pertama penyulang ini — tidak ada induk di penyulang ini (`jtm-lepas-tumpang.sql`). */
  pangkal: boolean;
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

/** Sebanyak ini kode gardu per permintaan. Lebih dari itu URL `in(...)` jadi
 *  terlalu panjang dan ditolak di tengah jalan tanpa pesan yang jelas. */
const POTONG_KODE = 150;

const kueriGardu = () =>
  supabaseBrowser.from("peta_gardu").select("kode,nama,ulp,lat,lng,jumlah_tiang");

const keGardu = (x: Record<string, unknown>): GarduPeta => ({
  kode: x.kode as string,
  nama: (x.nama as string) ?? (x.kode as string),
  ulp: (x.ulp as string) ?? "",
  lat: Number(x.lat), lng: Number(x.lng),
  jumlahTiang: Number(x.jumlah_tiang ?? 0),
});

/** Kolom `peta_tiang` yang digambar — dipakai juga tampilan satu segmen. */
export const KOLOM_TIANG =
  "id,kode,lat,lng,penanda,percabangan,jaringan,induk_kelompok,induk_lat,induk_lng,menumpang,jumlah_kabel,kabel_putus,di_jtm,gardu_bersama,nomor_kabel,pasangan_portal_dari,gardu_di_tiang,nama_peralatan,pangkal";

export const keTiang = (x: Record<string, unknown>): TiangPeta => ({
  id: x.id as string,
  kode: x.kode as string,
  lat: Number(x.lat), lng: Number(x.lng),
  penanda: (x.penanda as string) ?? null,
  percabangan: !!x.percabangan,
  jaringan: x.jaringan as Jaringan,
  kelompok: (x.induk_kelompok as string) ?? "",
  indukLat: x.induk_lat !== null ? Number(x.induk_lat) : null,
  indukLng: x.induk_lng !== null ? Number(x.induk_lng) : null,
  menumpang: !!x.menumpang,
  jumlahKabel: x.jumlah_kabel === null || x.jumlah_kabel === undefined ? null : Number(x.jumlah_kabel),
  kabelPutus: !!x.kabel_putus,
  diJtm: !!x.di_jtm,
  garduBersama: (x.gardu_bersama as string) ?? null,
  nomorKabel: (x.nomor_kabel as string) ?? null,
  pasanganPortalDari: (x.pasangan_portal_dari as string) ?? null,
  garduDiTiang: (x.gardu_di_tiang as string) ?? null,
  namaPeralatan: (x.nama_peralatan as string) ?? null,
  pangkal: !!x.pangkal,
});

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
  /** Ada bagian layar yang gagal dimuat (sinyal) — yang tampil mungkin belum lengkap. */
  const [galat, setGalat] = useState(false);

  // Nomor urut permintaan: jawaban yang datang terlambat untuk kotak pandang
  // yang sudah berlalu HARUS dibuang. Tanpa ini, menggeser cepat membuat peta
  // menampilkan isi tempat yang barusan ditinggalkan.
  const urutRef = useRef(0);

  // ── Cache memori (lihat _lib/petak.ts) ─────────────────────────────────
  // Generasi naik tiap cache dikosongkan: jawaban permintaan yang berangkat
  // SEBELUM suntingan tidak boleh menulis data lama kembali ke cache.
  const generasiRef = useRef(0);
  const simpanTiang = useRef(new Simpanan<TiangPeta>());      // `${kelompok}|${i}|${j}`
  const simpanGarduPetak = useRef(new Simpanan<GarduPeta>()); // `${i}|${j}`
  const simpanGarduKode = useRef(new Simpanan<GarduPeta>());  // kode
  const simpanRute = useRef(new Simpanan<RuteBaris>());       // penyulang

  const kunciPilihan = pilihan.map((p) => `${p.jaringan}:${p.kode}`).sort().join("|");
  const kunciKotak = kotak
    ? `${kotak.zoom}|${kotak.latMin.toFixed(4)}|${kotak.latMaks.toFixed(4)}|${kotak.lngMin.toFixed(4)}|${kotak.lngMaks.toFixed(4)}`
    : "";

  const ambil = useCallback(async () => {
    if (!kotak) return;
    const urut = ++urutRef.current;
    const gen = generasiRef.current;
    const kini = Date.now();
    const jtm = pilihan.filter((p) => p.jaringan === "jtm").map((p) => p.kode);
    const jtr = pilihan.filter((p) => p.jaringan === "jtr").map((p) => p.kode);
    // Gardu yang lapisan JTR-nya dinyalakan ikut tampil — jaringan JTR tanpa
    // gardunya adalah garis yang berpangkal di udara.
    const gPilih = [...new Set([
      ...pilihan.filter((p) => p.jaringan === "gardu").map((p) => p.kode),
      ...jtr,
    ])];

    if (jtm.length === 0 && jtr.length === 0 && gPilih.length === 0 && !tampilGardu) {
      setRute([]); setTiang([]); setGardu([]); setTerpotong(false); setGalat(false);
      return;
    }

    const layar = rentangKotak(kotak);
    const kelompok = [...jtm, ...jtr];
    const pakaiRute = jtm.length > 0 && kotak.zoom < ZOOM_TIANG;
    const pakaiTiang = kelompok.length > 0 && kotak.zoom >= ZOOM_TIANG;
    // Ada gardu yang SENGAJA dinyalakan → persis yang itu, tanpa gerbang zoom
    // (centang yang tak berbuah terasa rusak). Tidak ada → saklar "tampilkan
    // semua" dengan gerbang zoom + layar: 2.092 gardu sekaligus terlalu berat.
    const pakaiGarduLayar = gPilih.length === 0 && tampilGardu && kotak.zoom >= ZOOM_GARDU;

    // ── Yang belum ada di cache ────────────────────────────────────────
    const ruteKurang = pakaiRute ? jtm.filter((k) => !simpanRute.current.segar(k, kini)) : [];
    const garduKurang = gPilih.filter((k) => !simpanGarduKode.current.segar(k, kini));
    const petakGarduKurang: [number, number][] = [];
    if (pakaiGarduLayar) {
      for (const [i, j] of petakDi(layar)) {
        if (!simpanGarduPetak.current.segar(`${i}|${j}`, kini)) petakGarduKurang.push([i, j]);
      }
    }
    const tiangKurang = new Set<string>();
    const petakTiangKurang: [number, number][] = [];
    if (pakaiTiang) {
      for (const [i, j] of petakDi(layar)) {
        let kurang = false;
        for (const k of kelompok) {
          if (!simpanTiang.current.segar(`${k}|${i}|${j}`, kini)) { tiangKurang.add(k); kurang = true; }
        }
        if (kurang) petakTiangKurang.push([i, j]);
      }
    }

    let gagal = false;
    if (ruteKurang.length || garduKurang.length || petakGarduKurang.length || tiangKurang.size) {
      setSibuk(true);
      // Bersamaan — dulu berurutan, satu menunggu yang lain.
      const hasil = await Promise.allSettled([
        // Rute penyulang: HANYA selama tiangnya belum digambar. Garis KASAR
        // (`segarkan_rute_penyulang` membuang tujuh dari delapan tiang);
        // begitu tiang aslinya muncul, rute minggir.
        (async () => {
          if (ruteKurang.length === 0) return;
          const { data, error } = await supabaseBrowser
            .from("penyulang_rute")
            .select("penyulang,ulp,bentang")
            .in("penyulang", ruteKurang);
          if (error) throw new Error(error.message);
          if (gen !== generasiRef.current) return;
          const per = new Map<string, RuteBaris[]>(ruteKurang.map((k) => [k, []]));
          for (const x of data ?? []) {
            per.get(x.penyulang as string)?.push({
              penyulang: x.penyulang as string,
              ulp: x.ulp as string,
              bentang: (x.bentang ?? []) as [number, number, number, number][],
            });
          }
          for (const [k, v] of per) simpanRute.current.taruh(k, v, kini);
        })(),

        // Gardu terpilih. Dipecah: `in` masuk ke URL, ratusan kode sekaligus
        // menabrak batas panjang URL — gagalnya senyap.
        (async () => {
          if (garduKurang.length === 0) return;
          const kumpul: Record<string, unknown>[] = [];
          for (let i = 0; i < garduKurang.length; i += POTONG_KODE) {
            kumpul.push(...(await fetchAllRows<Record<string, unknown>>(() =>
              kueriGardu().in("kode", garduKurang.slice(i, i + POTONG_KODE)).order("kode").order("ulp"))));
          }
          if (gen !== generasiRef.current) return;
          const per = new Map<string, GarduPeta[]>(garduKurang.map((k) => [k, []]));
          for (const x of kumpul) per.get(x.kode as string)?.push(keGardu(x));
          for (const [k, v] of per) simpanGarduKode.current.taruh(k, v, kini);
        })(),

        // Semua gardu di layar: satu kotak gabungan petak yang kurang.
        (async () => {
          const r = gabung(petakGarduKurang);
          if (!r) return;
          const b = batas(r);
          const data = await fetchAllRows<Record<string, unknown>>(() =>
            kueriGardu()
              .gte("lat", b.latMin).lt("lat", b.latLebih)
              .gte("lng", b.lngMin).lt("lng", b.lngLebih)
              .order("kode").order("ulp"));
          if (gen !== generasiRef.current) return;
          const per = new Map<string, GarduPeta[]>();
          for (const [i, j] of petakDi(r)) per.set(`${i}|${j}`, []);
          const lihat = new Set<string>();
          for (const x of data) {
            const g = keGardu(x);
            const id = `${g.kode}|${g.ulp}`;
            if (lihat.has(id)) continue;
            lihat.add(id);
            const [i, j] = petakTitik(g.lat, g.lng, r);
            per.get(`${i}|${j}`)?.push(g);
          }
          for (const [k, v] of per) simpanGarduPetak.current.taruh(k, v, kini);
        })(),

        // Tiang: kotak gabungan petak yang kurang, kelompok yang kurang saja.
        // Diurutkan — paginasi per 1000 tanpa urutan bisa dobel/terlewat.
        (async () => {
          const r = gabung(petakTiangKurang);
          if (!r || tiangKurang.size === 0) return;
          const b = batas(r);
          const minta = [...tiangKurang];
          const data = await fetchAllRows<Record<string, unknown>>(() =>
            supabaseBrowser
              .from("peta_tiang")
              .select(KOLOM_TIANG)
              .in("induk_kelompok", minta)
              .gte("lat", b.latMin).lt("lat", b.latLebih)
              .gte("lng", b.lngMin).lt("lng", b.lngLebih)
              .order("id").order("jaringan").order("induk_kelompok"));
          if (gen !== generasiRef.current) return;
          const per = new Map<string, TiangPeta[]>();
          for (const k of minta) for (const [i, j] of petakDi(r)) per.set(`${k}|${i}|${j}`, []);
          const lihat = new Set<string>();
          for (const x of data) {
            const t = keTiang(x);
            const id = `${t.jaringan}|${t.kelompok}|${t.id}`;
            if (lihat.has(id)) continue;
            lihat.add(id);
            const [i, j] = petakTitik(t.lat, t.lng, r);
            per.get(`${t.kelompok}|${i}|${j}`)?.push(t);
          }
          for (const [k, v] of per) simpanTiang.current.taruh(k, v, kini);
        })(),
      ]);
      gagal = hasil.some((h) => h.status === "rejected");
    }

    if (urut !== urutRef.current) return;   // kotak pandang sudah berpindah

    // ── Susun dari cache ───────────────────────────────────────────────
    // Petak yang gagal dimuat kosong; sisanya tetap tampil (dulu satu galat
    // mengosongkan semua tiang di layar).
    const r = pakaiRute ? jtm.flatMap((k) => simpanRute.current.ambil(k) ?? []) : [];

    let g: GarduPeta[] = [];
    if (gPilih.length > 0) {
      g = gPilih.flatMap((k) => simpanGarduKode.current.ambil(k) ?? []);
    } else if (pakaiGarduLayar) {
      for (const [i, j] of petakDi(layar)) {
        for (const x of simpanGarduPetak.current.ambil(`${i}|${j}`) ?? []) {
          if (diLayar(x, kotak)) g.push(x);
        }
      }
    }

    const t: TiangPeta[] = [];
    let potong = false;
    if (pakaiTiang) {
      const lihat = new Set<string>();
      kumpul: for (const k of kelompok) {
        for (const [i, j] of petakDi(layar)) {
          for (const x of simpanTiang.current.ambil(`${k}|${i}|${j}`) ?? []) {
            if (!diLayar(x, kotak)) continue;
            const id = `${x.jaringan}|${x.kelompok}|${x.id}`;
            if (lihat.has(id)) continue;
            lihat.add(id);
            if (t.length >= BATAS_TIANG) { potong = true; break kumpul; }
            t.push(x);
          }
        }
      }
    }

    setRute(r); setGardu(g); setTiang(t); setTerpotong(potong); setGalat(gagal);
    setSibuk(false);
    // `kotak` dan `pilihan` sengaja tidak jadi dependensi: keduanya objek baru
    // tiap render. Yang dipakai kuncinya, di bawah.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kunciKotak, kunciPilihan, tampilGardu]);

  /** Sesudah suntingan / tombol Muat ulang: buang cache, muat ulang layar —
   *  titik yang digeser langsung terlihat, data HP/orang lain ikut masuk. */
  const muatUlang = useCallback(async () => {
    generasiRef.current++;
    simpanTiang.current.kosongkan();
    simpanGarduPetak.current.kosongkan();
    simpanGarduKode.current.kosongkan();
    simpanRute.current.kosongkan();
    await ambil();
  }, [ambil]);

  useEffect(() => {
    // Ditunda: menggeser peta memicu puluhan kejadian, dan sembilan puluh
    // persennya sudah basi sebelum jawabannya datang.
    const jeda = setTimeout(() => void ambil(), 250);
    return () => clearTimeout(jeda);
  }, [ambil]);

  return { rute, tiang, gardu, sibuk, terpotong, galat, muatUlang };
}

const diLayar = (x: { lat: number; lng: number }, k: Kotak) =>
  x.lat >= k.latMin && x.lat <= k.latMaks && x.lng >= k.lngMin && x.lng <= k.lngMaks;
