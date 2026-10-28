import type { BalasanMedia } from "../../dataGardu";
import type { Saringan } from "../saringan";

export type NamaSaringan = "ulp" | "periode" | "gardu" | "penyulang";
export type Balasan = string | BalasanMedia;

export interface KonteksFungsi {
  saringan: Saringan;
  /** Pertanyaan sesudah dirapikan + kamus (untuk membaca jenis pekerjaan dll.). */
  rapi: string;
  /** Sisa kalimat sesudah saringan DAN kata kunci fungsi ini dibuang — mis. alamat yang dicari. */
  bebas: string;
  /** Contoh pertanyaan per fungsi aktif (dari tabel) — dipakai Bantuan. */
  contoh: { nama: string; teks: string[] }[];
}

/**
 * Satu fungsi jawaban. Kata kunci & contoh di sini hanya BENIH: dimasukkan ke
 * tabel saat fungsi pertama kali terlihat, sesudah itu diatur dari web.
 */
export interface FungsiTanya {
  kode: string;
  nama: string;
  saringan: NamaSaringan[];
  wajib?: NamaSaringan[];
  kata: [string, number][];
  contoh: string[];
  jalankan: (k: KonteksFungsi) => Promise<Balasan>;
}
