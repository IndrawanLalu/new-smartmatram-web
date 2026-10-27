/**
 * Copy to LM 4DX (27 Okt 2026) — blok bulanan spreadsheet Lead Measure 4DX:
 * baris = uraian pekerjaan (`lm4dx_baris`, scripts/lm4dx-baris.sql), kolom =
 * tanggal 1–31. Angkanya dari `realisasi_rentang` (semua yang dikirim regu,
 * termasuk belum disetujui — sama dengan Copy to PRO NTB).
 *
 * Sumber tiap baris: kunci Rekap Kinerja ('jtm', 'perabasan' …) atau
 * 'harjtm:<kode kategori>'; lebih dari satu dijumlahkan. KMS dijumlah km-nya,
 * yang lain dicacah per pekerjaan. Sel bernilai 0 tersalin kosong, seperti
 * isian spreadsheet.
 */

import { META } from "./kinerjaMeta";

export const HARI = 31;
const AWALAN_KATEGORI = "harjtm:";

export interface BarisLm {
  id: string;
  urutan: number;
  uraian: string;
  sumber: string[];
}

/** Satu pekerjaan dari `realisasi_rentang` yang dihitung. */
export interface ItemLm {
  tgl: string;
  kunci: string;
  km: number | null;
  /** Pemeliharaan Jaringan: kode kategori catatannya. */
  kategori: string | null;
}

export interface Kategori {
  kode: string;
  label: string;
}

const DESIMAL = new Map(META.map((m) => [m.kunci, m.desimal]));

export const kunciKategori = (kode: string) => `${AWALAN_KATEGORI}${kode}`;

/** Nama sumber untuk layar. */
export function namaSumber(s: string, kategori: Map<string, string>) {
  if (s.startsWith(AWALAN_KATEGORI)) {
    const kode = s.slice(AWALAN_KATEGORI.length);
    return `Pemeliharaan Jaringan · ${kategori.get(kode) ?? kode}`;
  }
  return META.find((m) => m.kunci === s)?.jenis ?? s;
}

/** Baris KMS bila salah satu sumbernya KMS. */
export const barisDesimal = (b: BarisLm) => b.sumber.some((s) => DESIMAL.get(s) === true);

/** Nilai per tanggal (indeks 0 = tgl 1) untuk tiap baris. */
export function susunMatriks(baris: BarisLm[], item: ItemLm[]): Map<string, number[]> {
  const hasil = new Map<string, number[]>();
  for (const b of baris) {
    const isi = Array<number>(HARI).fill(0);
    const sumber = new Set(b.sumber);
    for (const x of item) {
      const kena = sumber.has(x.kunci) || (x.kategori !== null && sumber.has(kunciKategori(x.kategori)));
      if (!kena) continue;
      const h = Number(x.tgl.slice(8, 10)) - 1;
      isi[h] += DESIMAL.get(x.kunci) ? x.km ?? 0 : 1;
    }
    hasil.set(b.id, isi);
  }
  return hasil;
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
