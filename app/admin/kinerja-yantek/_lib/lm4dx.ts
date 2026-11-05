/**
 * Copy to LM 4DX (27 Okt 2026) — blok bulanan spreadsheet Lead Measure 4DX:
 * baris = uraian pekerjaan (`lm4dx_baris`, scripts/lm4dx-baris.sql), kolom =
 * tanggal 1–31. Angkanya dari `realisasi_rentang`, hanya yang sudah disetujui
 * (5 Nov 2026, halaman Realisasi Harian LM).
 *
 * Sumber tiap baris: kunci Rekap Kinerja ('jtm', 'perabasan' …) atau
 * 'harjtm:<kode kategori>'; lebih dari satu dijumlahkan. KMS dijumlah km-nya,
 * yang lain dicacah per pekerjaan. Sel bernilai 0 tersalin kosong, seperti
 * isian spreadsheet.
 *
 * `SUMBER_DRONE` (28 Okt 2026): baris "Inspeksi dengan Drone (Penyulang)" —
 * jumlah PENYULANG berbeda per hari yang diinspeksi Tier 1 + drone.
 *
 * `SUMBER_JTM2_TITIK` (5 Nov 2026, Penurunan Susut): baris "Inspeksi penyulang
 * Tier 2 (titik)" — jumlah TIANG yang dinilai di inspeksi JTM Tier 2.
 *
 * `laporan` (5 Nov 2026): baris LM 4DX dan Penurunan Susut satu tabel
 * (scripts/realisasi-harian-lm.sql).
 *
 * 'tindakan:<kode>' (5 Nov 2026, scripts/pekerjaan-tindakan.sql): "Pekerjaan
 * yang dikerjakan" Pemeliharaan Gardu / Pemerataan — dijumlah JUMLAH-nya.
 *
 * `kelompok` (5 Nov 2026): judul JTM / Gardu / JTR / SR di tabel. Hanya tampilan —
 * urutan baris dan salinan tidak berubah, judul tidak ikut tersalin.
 */

import { META } from "./kinerjaMeta";

export const HARI = 31;
const AWALAN_KATEGORI = "harjtm:";
const AWALAN_TINDAKAN = "tindakan:";
/** Sumber khusus: penyulang berbeda per hari dari inspeksi JTM Tier 1 + drone. */
export const SUMBER_DRONE = "jtm_drone_penyulang";
/** Sumber khusus: jumlah tiang yang dinilai di inspeksi JTM Tier 2. */
export const SUMBER_JTM2_TITIK = "jtm2_titik";

export type Laporan = "4dx" | "susut";

export const KELOMPOK = ["JTM", "GARDU", "JTR", "SR"] as const;
export type Kelompok = (typeof KELOMPOK)[number];
export const NAMA_KELOMPOK: Record<Kelompok, string> = { JTM: "JTM", GARDU: "Gardu", JTR: "JTR", SR: "SR" };
export const NAMA_LAPORAN: Record<Laporan, string> = { "4dx": "LM 4DX", susut: "Penurunan Susut" };

export interface BarisLm {
  id: string;
  urutan: number;
  uraian: string;
  sumber: string[];
  kelompok: Kelompok | null;
}

/** Satu pekerjaan dari `realisasi_rentang` yang dihitung. */
export interface ItemLm {
  tgl: string;
  kunci: string;
  km: number | null;
  /** Pemeliharaan Jaringan: kode kategori catatannya. */
  kategori: string | null;
  /** Inspeksi JTM: Tier 1 + drone, dan penyulangnya. */
  drone: boolean;
  penyulang: string | null;
  /** Inspeksi JTM: jumlah tiang yang dinilai (hanya dibaca bila ada baris SUMBER_JTM2_TITIK). */
  titik: number;
  /** Pemeliharaan Gardu / Pemerataan: tindakan yang dicentang regu. */
  tindakan: Record<string, { jumlah: number; foto: string }>;
  /** Untuk daftar rincian (apa adanya dari realisasi_rentang). */
  ulp: string;
  objek: string | null;
  rincian: string | null;
  petugas: string | null;
  sumberTabel: string;
  sumberId: string | null;
  disetujui: boolean;
}

export interface Tindakan {
  kode: string;
  modul: "hargardu" | "penyeimbangan";
  nama: string;
  satuan: string;
  urutan: number;
  aktif: boolean;
}

export interface Kategori {
  kode: string;
  label: string;
}

const DESIMAL = new Map(META.map((m) => [m.kunci, m.desimal]));

export const kunciKategori = (kode: string) => `${AWALAN_KATEGORI}${kode}`;
export const kunciTindakan = (kode: string) => `${AWALAN_TINDAKAN}${kode}`;
export const NAMA_MODUL_TINDAKAN: Record<Tindakan["modul"], string> = {
  hargardu: "Pemeliharaan Gardu",
  penyeimbangan: "Pemerataan Beban",
};

/** Nama sumber untuk layar. `tindakan`: kode → "Modul · nama". */
export function namaSumber(s: string, kategori: Map<string, string>, tindakan?: Map<string, string>) {
  if (s.startsWith(AWALAN_TINDAKAN)) {
    const kode = s.slice(AWALAN_TINDAKAN.length);
    return tindakan?.get(kode) ?? `Pekerjaan ${kode}`;
  }
  if (s === SUMBER_DRONE) return "Inspeksi JTM Tier 1 + drone (jumlah penyulang)";
  if (s === SUMBER_JTM2_TITIK) return "Inspeksi JTM Tier 2 (jumlah tiang)";
  if (s.startsWith(AWALAN_KATEGORI)) {
    const kode = s.slice(AWALAN_KATEGORI.length);
    return `Pemeliharaan Jaringan · ${kategori.get(kode) ?? kode}`;
  }
  return META.find((m) => m.kunci === s)?.jenis ?? s;
}

/** Baris KMS bila salah satu sumbernya KMS. */
export const barisDesimal = (b: BarisLm) => b.sumber.some((s) => DESIMAL.get(s) === true);

/**
 * Sumbangan satu pekerjaan ke satu baris (drone dihitung terpisah: penyulang
 * berbeda per hari, bukan per pekerjaan). 0 = tidak ikut.
 */
export function sumbangan(sumber: Set<string>, x: ItemLm): number {
  let n = 0;
  if (sumber.has(SUMBER_JTM2_TITIK) && x.kunci === "jtm2") n += x.titik;
  if (sumber.has(x.kunci) || (x.kategori !== null && sumber.has(kunciKategori(x.kategori)))) {
    n += DESIMAL.get(x.kunci) ? x.km ?? 0 : 1;
  }
  for (const [kode, t] of Object.entries(x.tindakan)) if (sumber.has(kunciTindakan(kode))) n += t.jumlah;
  return n;
}

const hariKe = (x: ItemLm) => Number(x.tgl.slice(8, 10)) - 1;
const ikutDrone = (sumber: Set<string>, x: ItemLm) =>
  sumber.has(SUMBER_DRONE) && x.kunci === "jtm" && x.drone && !!x.penyulang;

/** Nilai per tanggal (indeks 0 = tgl 1) untuk tiap baris. */
export function susunMatriks(baris: BarisLm[], item: ItemLm[]): Map<string, number[]> {
  const hasil = new Map<string, number[]>();
  for (const b of baris) {
    const isi = Array<number>(HARI).fill(0);
    const sumber = new Set(b.sumber);
    const drone = Array.from({ length: HARI }, () => new Set<string>());
    for (const x of item) {
      if (ikutDrone(sumber, x)) drone[hariKe(x)].add(x.penyulang!);
      isi[hariKe(x)] += sumbangan(sumber, x);
    }
    drone.forEach((p, h) => { isi[h] += p.size; });
    hasil.set(b.id, isi);
  }
  return hasil;
}

/** Pekerjaan yang menyumbang ke satu baris (sebulan, atau satu tanggal). */
export function rincianBaris(b: BarisLm, item: ItemLm[], hari: number | null) {
  const sumber = new Set(b.sumber);
  return item
    .filter((x) => hari === null || hariKe(x) === hari - 1)
    .map((x) => ({ x, nilai: sumbangan(sumber, x), drone: ikutDrone(sumber, x) }))
    .filter((r) => r.nilai > 0 || r.drone);
}

/** "2,951" — paling banyak 3 desimal seperti isian spreadsheet; 0 → kosong. */
export const angkaLm = (n: number, desimal: boolean) =>
  n === 0 ? "" : n.toLocaleString("id-ID", { maximumFractionDigits: desimal ? 3 : 0, useGrouping: false });

/**
 * Teks bertab untuk ditempel. `hari` null = sebulan penuh (31 kolom, tempel di
 * sel tanggal 1 baris pertama); angka = satu kolom tanggal itu saja.
 */
export function teksTempelLm(baris: BarisLm[], matriks: Map<string, number[]>, hari: number | null) {
  return baris.map((b) => {
    const isi = matriks.get(b.id) ?? [];
    const d = barisDesimal(b);
    return hari === null
      ? isi.map((n) => angkaLm(n, d)).join("\t")
      : angkaLm(isi[hari - 1] ?? 0, d);
  }).join("\n");
}
