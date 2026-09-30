"use client";

import { useEffect, useMemo, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase-browser";
import { fetchAllRows } from "@/lib/supabasePaginate";

/**
 * Lapisan tegangan ujung — titik ukur di ujung JTR dari `tegangan_ujung_daftar`,
 * satu bulan tanggal ukur. Dibaca hanya saat lapisannya menyala; jumlahnya
 * ratusan per bulan, jadi disaring di sisi layar tanpa kueri ulang.
 */

/** Batas warna (V, fasa-netral). < 198 = di bawah standar (220 V −10%). */
export const BATAS_MERAH = 198;
export const BATAS_KUNING = 207;

export type NadaUjung = "merah" | "kuning" | "hijau";
export const nadaUjung = (v: number): NadaUjung => (v < BATAS_MERAH ? "merah" : v < BATAS_KUNING ? "kuning" : "hijau");
export const WARNA_NADA: Record<NadaUjung, string> = { merah: "#EF4444", kuning: "#F59E0B", hijau: "#22C55E" };

export type StatusUjungPeta = "Menunggu verifikasi" | "Disetujui" | "Dikembalikan";
export const STATUS_UJUNG_PETA: StatusUjungPeta[] = ["Menunggu verifikasi", "Disetujui", "Dikembalikan"];

export interface TitikUjungPeta {
  id: string;
  gardu_kode: string;
  ulp: string;
  jurusan: string;
  v_rn: number;
  v_sn: number;
  v_tn: number;
  v_min: number;
  lat: number;
  lng: number;
  foto_url: string;
  tgl_ukur: string;
  petugas_nama: string | null;
  status_tampil: string;
  jarak_rekomendasi_m: number | null;
  tiang_rekomendasi_kode: string | null;
  gardu_lat: number | null;
  gardu_lng: number | null;
}

export interface SaringUjung {
  nada: Set<NadaUjung>;
  status: Set<StatusUjungPeta>;
  /** Hanya yang diukur lebih jauh dari ini dari ujung terjauh (meter); null = semua. */
  jauhDariUjung: number | null;
}

const KOLOM =
  "id,gardu_kode,ulp,jurusan,v_rn,v_sn,v_tn,v_min,lat,lng,foto_url,tgl_ukur,petugas_nama,status_tampil,jarak_rekomendasi_m,tiang_rekomendasi_kode,gardu_lat,gardu_lng";

const dua = (n: number) => String(n).padStart(2, "0");

export function useUjungPeta(aktif: boolean, ulp: string, tahun: number, bulan: number, saring: SaringUjung) {
  const [semua, setSemua] = useState<TitikUjungPeta[]>([]);
  const [galat, setGalat] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);
  // "Sibuk" diturunkan: permintaan untuk kunci ini belum selesai.
  const kunci = `${ulp}|${tahun}|${bulan}|${nonce}`;
  const [kunciSelesai, setKunciSelesai] = useState<string | null>(null);
  const sibuk = aktif && kunciSelesai !== kunci;

  useEffect(() => {
    if (!aktif) return;
    let hidup = true;
    const awal = `${tahun}-${dua(bulan)}-01`;
    const akhir = bulan === 12 ? `${tahun + 1}-01-01` : `${tahun}-${dua(bulan + 1)}-01`;
    const kerja = async () => {
      try {
        const data = await fetchAllRows<Record<string, unknown>>(() => {
          let q = supabaseBrowser
            .from("tegangan_ujung_daftar")
            .select(KOLOM)
            .gte("tgl_ukur", awal).lt("tgl_ukur", akhir)
            .neq("status", "Dibatalkan");
          if (ulp) q = q.eq("ulp", ulp);
          return q.order("id");
        });
        if (!hidup) return;
        setSemua(
          data.map((r) => ({
            ...(r as unknown as TitikUjungPeta),
            v_rn: Number(r.v_rn), v_sn: Number(r.v_sn), v_tn: Number(r.v_tn), v_min: Number(r.v_min),
            lat: Number(r.lat), lng: Number(r.lng),
            jarak_rekomendasi_m: r.jarak_rekomendasi_m === null ? null : Number(r.jarak_rekomendasi_m),
            gardu_lat: r.gardu_lat === null ? null : Number(r.gardu_lat),
            gardu_lng: r.gardu_lng === null ? null : Number(r.gardu_lng),
          })),
        );
        setGalat(null);
      } catch (e) {
        if (hidup) setGalat(e instanceof Error ? e.message : String(e));
      } finally {
        if (hidup) setKunciSelesai(kunci);
      }
    };
    void kerja();
    return () => { hidup = false; };
  }, [aktif, ulp, tahun, bulan, nonce, kunci]);

  const titik = useMemo(
    () =>
      aktif
        ? semua.filter(
            (t) =>
              saring.nada.has(nadaUjung(t.v_min)) &&
              saring.status.has(t.status_tampil as StatusUjungPeta) &&
              (saring.jauhDariUjung === null ||
                (t.jarak_rekomendasi_m !== null && t.jarak_rekomendasi_m > saring.jauhDariUjung)),
          )
        : [],
    [aktif, semua, saring],
  );

  /** Setelah disetujui dari popup, statusnya ditambal di tempat. */
  const tandaiDisetujui = (id: string) =>
    setSemua((s) => s.map((t) => (t.id === id ? { ...t, status_tampil: "Disetujui" } : t)));

  return { titik, total: aktif ? semua.length : 0, sibuk, galat, muatUlang: () => setNonce((n) => n + 1), tandaiDisetujui };
}
