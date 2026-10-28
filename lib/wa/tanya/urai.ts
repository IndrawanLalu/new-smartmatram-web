/**
 * Pengurai pertanyaan WA tanpa AI (rencana-tanya-jawab-wa.md §3):
 *   rapikan → kamus → saringan (ULP/periode/gardu/penyulang) → nilai tiap fungsi
 *   dari kata kunci → putuskan.
 * Murni: semua data (kata kunci, kamus, penyulang, tanggal) datang dari luar.
 */

import { miripKata, rapikan, terapkanKamus, type Kamus } from "./rapikan";
import { bacaSaringan, type Saringan } from "./saringan";

export interface KataKunci {
  fungsi_kode: string;
  kata: string;
  bobot: number;
}

export interface FungsiAktif {
  kode: string;
  ambang: number;
  /** Saringan yang wajib ada (dari kode) — fungsi yang syaratnya terpenuhi didahulukan. */
  wajib?: (keyof Saringan)[];
}

export interface Bahan {
  fungsi: FungsiAktif[];
  kata: KataKunci[];
  kamus: Kamus[];
  penyulang: string[];
}

export interface Skor {
  kode: string;
  skor: number;
  /** Kata kunci yang cocok, untuk tab Uji coba ("overlod≈overload"). */
  cocok: string[];
}

export type Keputusan =
  | { jenis: "jalankan"; kode: string }
  | { jenis: "seri"; kode: string[] }
  | { jenis: "tidak_paham" };

export interface HasilUrai {
  rapi: string;
  saringan: Saringan;
  /** Teks yang dinilai (sesudah kata saringan dibuang). */
  sisa: string;
  skor: Skor[];
  keputusan: Keputusan;
}

/** Nilai satu fungsi: kata persis = bobot penuh, salah ketik = setengah. */
function nilai(sisa: string, kata: KataKunci[]): Omit<Skor, "kode"> {
  const token = sisa.split(" ").filter(Boolean);
  const s = ` ${sisa} `;
  let skor = 0;
  const cocok: string[] = [];
  for (const k of kata) {
    if (k.kata.includes(" ")) {
      if (s.includes(` ${k.kata} `)) {
        skor += k.bobot;
        cocok.push(k.kata);
      }
      continue;
    }
    if (token.includes(k.kata)) {
      skor += k.bobot;
      cocok.push(k.kata);
      continue;
    }
    const mirip = token.find((t) => miripKata(t, k.kata));
    if (mirip) {
      skor += k.bobot / 2;
      cocok.push(`${mirip}≈${k.kata}`);
    }
  }
  return { skor, cocok };
}

/** Fungsi yang dipakai bila hanya kode gardu yang disebut ("@smart AM001"). */
export const FUNGSI_BILA_HANYA_GARDU = "kartu_gardu";

export function urai(teks: string, bahan: Bahan, hariIni: Date): HasilUrai {
  const rapi = terapkanKamus(rapikan(teks), bahan.kamus);
  const { saringan, sisa } = bacaSaringan(rapi, bahan.penyulang, hariIni);

  const skor = bahan.fungsi
    .map((f) => ({ kode: f.kode, ...nilai(sisa, bahan.kata.filter((k) => k.fungsi_kode === f.kode)) }))
    .filter((x) => x.skor > 0)
    .sort((a, b) => b.skor - a.skor);

  const ambang = new Map(bahan.fungsi.map((f) => [f.kode, f.ambang]));
  const wajib = new Map(bahan.fungsi.map((f) => [f.kode, f.wajib ?? []]));
  const terpenuhi = (kode: string) => (wajib.get(kode) ?? []).every((w) => saringan[w]);
  // "lokasi gardu pagutan": Kartu gardu (wajib kode gardu) kalah dari Cari gardu.
  let lolos = skor.filter((x) => x.skor >= (ambang.get(x.kode) ?? 1));
  if (lolos.some((x) => terpenuhi(x.kode))) lolos = lolos.filter((x) => terpenuhi(x.kode));
  let keputusan: Keputusan;
  if (lolos.length === 0) {
    // Kode gardu sudah cukup jelas: yang paling mendekati ("bebn AM003") dipakai
    // walau di bawah ambang; tanpa kata sama sekali → kartu gardu.
    const adaKartu = bahan.fungsi.some((f) => f.kode === FUNGSI_BILA_HANYA_GARDU);
    const dekat = skor.length === 1 || (skor.length > 1 && skor[0].skor > skor[1].skor) ? skor[0].kode : null;
    keputusan = !saringan.gardu
      ? { jenis: "tidak_paham" }
      : dekat
        ? { jenis: "jalankan", kode: dekat }
        : adaKartu
          ? { jenis: "jalankan", kode: FUNGSI_BILA_HANYA_GARDU }
          : { jenis: "tidak_paham" };
  } else {
    let puncak = lolos.filter((x) => x.skor === lolos[0].skor);
    // Seri: yang syarat wajibnya disebut lebih khusus ("lokasi CN119" → Kartu gardu).
    const khusus = puncak.filter((x) => (wajib.get(x.kode) ?? []).length > 0);
    if (puncak.length > 1 && khusus.length === 1) puncak = khusus;
    keputusan = puncak.length === 1 ? { jenis: "jalankan", kode: puncak[0].kode } : { jenis: "seri", kode: puncak.map((x) => x.kode) };
  }
  return { rapi, saringan, sisa, skor, keputusan };
}
