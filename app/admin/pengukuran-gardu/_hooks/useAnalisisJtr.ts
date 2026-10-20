"use client";

import { useCallback, useEffect, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase-browser";
import { fetchAllRows } from "@/lib/supabasePaginate";
import type { GawangJtr } from "../_lib/rencanaJtr";

/**
 * Analisis JTR (F1, 20 Okt 2026) — satu baris per gardu + jurusan dari view
 * `analisis_jtr_jurusan` (scripts/analisis-jtr.sql): arus terukur, lintasan
 * terjauh, kabel ber-KHA terkecil, slot jurusan PHB TR, status merah/kuning.
 *
 * Dibaca sekali per ULP; angka di view sudah memakai pengaturan, jadi sesudah
 * pengaturan disimpan cukup `muatUlang`.
 */

export type StatusJurusan = "merah" | "kuning" | "baik";

export interface JurusanJtr {
  gardu_kode: string;
  jurusan: string;
  ulp: string | null;
  penyulang: string | null;
  gardu_nama: string | null;
  kva: number | null;
  persen_beban: number | null;
  tanggal_pengukuran: string | null;
  a_r: number | null;
  a_s: number | null;
  a_t: number | null;
  a_n: number | null;
  arus_maks: number | null;
  jtr_ada: boolean;
  terjauh_m: number | null;
  sirkuit_m: number | null;
  jumlah_tiang: number | null;
  jumlah_sr: number | null;
  kabel: string | null;
  kha_a: number | null;
  beban_kha_pct: number | null;
  jurusan_tersedia: number | null;
  jurusan_terpakai: number | null;
  tgl_pemeliharaan: string | null;
  arus_lebih: boolean;
  kha_lebih: boolean;
  panjang_lebih: boolean;
  status: StatusJurusan;
}

export interface PengaturanJtr {
  batas_arus_jurusan_a: number;
  batas_panjang_m: number;
  batas_kha_pct: number;
  /** Rencana: kabel baru tambah jurusan maksimum; lebih dari ini → sisip. */
  batas_kabel_baru_m: number;
  /** Rencana: beban trafo di atas ini → tidak tambah jurusan, sisip/naik daya. */
  batas_trafo_pct: number;
}

const KOLOM_PENGATURAN = "batas_arus_jurusan_a,batas_panjang_m,batas_kha_pct,batas_kabel_baru_m,batas_trafo_pct";

export interface KhaKabel {
  jenis: string;
  ukuran: string;
  kha_a: number | null;
  jumlah_kabel: number;
}

const ANGKA: (keyof JurusanJtr)[] = [
  "kva", "persen_beban", "a_r", "a_s", "a_t", "a_n", "arus_maks", "terjauh_m", "sirkuit_m",
  "kha_a", "beban_kha_pct", "jurusan_tersedia", "jurusan_terpakai",
];

/** PostgREST mengirim NUMERIC sebagai teks — dijadikan angka sekali di sini. */
export function keJurusan(r: Record<string, unknown>): JurusanJtr {
  const x = { ...r } as Record<string, unknown>;
  for (const k of ANGKA) x[k] = x[k] === null || x[k] === undefined ? null : Number(x[k]);
  return x as unknown as JurusanJtr;
}

/** Pengaturan + KHA terisi — bahan `buatRencana`, juga dipakai peta. */
export async function bacaBahanRencana(): Promise<{ pengaturan: PengaturanJtr; kha: Map<string, number> }> {
  const [atur, kh] = await Promise.all([
    supabaseBrowser.from("jtr_analisis_pengaturan").select(KOLOM_PENGATURAN).eq("id", 1).single(),
    supabaseBrowser.from("jtr_kha_ref").select("jenis,ukuran,kha_a").not("kha_a", "is", null),
  ]);
  if (atur.error) throw atur.error;
  if (kh.error) throw kh.error;
  return {
    pengaturan: Object.fromEntries(
      KOLOM_PENGATURAN.split(",").map((k) => [k, Number((atur.data as Record<string, unknown>)[k])]),
    ) as unknown as PengaturanJtr,
    kha: new Map((kh.data ?? []).map((k) => [`${k.jenis}|${k.ukuran}`, Number(k.kha_a)])),
  };
}

export const keGawang = (x: Record<string, unknown>): GawangJtr => ({
  ...(x as unknown as GawangJtr),
  panjang_m: Number(x.panjang_m),
  tarikan_sr: Number(x.tarikan_sr),
});

const PESAN_SQL = "Analisis JTR belum lengkap di database — jalankan scripts/analisis-jtr.sql lalu analisis-jtr-rencana.sql di Supabase.";

export function useAnalisisJtr(ulp: string) {
  const [baris, setBaris] = useState<JurusanJtr[]>([]);
  const [pengaturan, setPengaturan] = useState<PengaturanJtr | null>(null);
  /** Gawang per "GARDU|JURUSAN" — bahan rencana perbaikan. */
  const [gawang, setGawang] = useState<Map<string, GawangJtr[]>>(new Map());
  /** KHA per "JENIS|UKURAN". */
  const [kha, setKha] = useState<Map<string, number>>(new Map());
  const [memuat, setMemuat] = useState(true);
  const [galat, setGalat] = useState<string | null>(null);

  const muat = useCallback(async () => {
    setMemuat(true);
    setGalat(null);
    try {
      const [rows, bahan, gw] = await Promise.all([
        fetchAllRows<Record<string, unknown>>(() => {
          const q = supabaseBrowser.from("analisis_jtr_jurusan").select("*").order("gardu_kode").order("jurusan");
          return ulp === "ALL" ? q : q.eq("ulp", ulp);
        }),
        bacaBahanRencana(),
        fetchAllRows<Record<string, unknown>>(() =>
          supabaseBrowser.from("analisis_jtr_gawang").select("*").order("gardu_kode").order("jurusan").order("tiang_id"),
        ),
      ]);
      setBaris(rows.map(keJurusan));
      setPengaturan(bahan.pengaturan);
      const g = new Map<string, GawangJtr[]>();
      for (const x of gw) {
        const kunci = `${x.gardu_kode}|${x.jurusan}`;
        const daftar = g.get(kunci) ?? [];
        daftar.push(keGawang(x));
        g.set(kunci, daftar);
      }
      setGawang(g);
      setKha(bahan.kha);
    } catch (e) {
      const pesan = (e as { message?: string; code?: string });
      setGalat(pesan.code === "PGRST205" || /analisis_jtr|jtr_analisis|batas_kabel_baru|batas_trafo/.test(pesan.message ?? "") ? PESAN_SQL : (pesan.message ?? "Gagal memuat"));
      setBaris([]);
    } finally {
      setMemuat(false);
    }
  }, [ulp]);

  useEffect(() => {
    void muat();
  }, [muat]);

  return { baris, pengaturan, gawang, kha, memuat, galat, muatUlang: muat };
}

/** Daftar kabel terpasang + KHA-nya, untuk Pengaturan. */
export async function bacaKha(): Promise<KhaKabel[]> {
  const { data, error } = await supabaseBrowser
    .from("jtr_kha_daftar")
    .select("jenis,ukuran,kha_a,jumlah_kabel")
    .order("jumlah_kabel", { ascending: false });
  if (error) throw error;
  return (data ?? []).map((r) => ({
    jenis: String(r.jenis),
    ukuran: String(r.ukuran),
    kha_a: r.kha_a === null ? null : Number(r.kha_a),
    jumlah_kabel: Number(r.jumlah_kabel),
  }));
}

export async function simpanPengaturan(p: PengaturanJtr, kha: KhaKabel[], oleh: string) {
  const sekarang = new Date().toISOString();
  const a = await supabaseBrowser
    .from("jtr_analisis_pengaturan")
    .update({ ...p, diubah_oleh: oleh, updated_at: sekarang })
    .eq("id", 1)
    .select("id");
  if (a.error) throw a.error;
  // RLS menolak tanpa galat — yang terlihat cuma nol baris berubah.
  if (!a.data?.length) throw new Error("Pengaturan hanya bisa diubah akun UP3.");
  const b = await supabaseBrowser
    .from("jtr_kha_ref")
    .upsert(kha.map((k) => ({ jenis: k.jenis, ukuran: k.ukuran, kha_a: k.kha_a, diubah_oleh: oleh, updated_at: sekarang })));
  if (b.error) throw b.error;
}
