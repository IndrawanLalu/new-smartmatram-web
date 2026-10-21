/**
 * Copy to PRO NTB — baris laporan harian UIW (spreadsheet PRO NTB) disusun
 * dari realisasi harian (`realisasi_rentang`), 13 Okt 2026.
 *
 * Format dari contoh user: TANGGAL "02 Januari 2024", angka berkoma "3,56",
 * ULP "ULP AMPENAN", lokasi gardu "4415_AM077_ALAMAT", segmen = nama segmen.
 * WORK ORDER = REALISASI (keputusan user). Tegangan ujung tidak ikut —
 * sama dengan Rekap Kinerja, ia bukan realisasi pengukuran.
 *
 * Revisi 13 Okt: spreadsheet UIW mengisi NO, UIW NTB, UP3, ULP, TIM
 * PELAKSANA, JENIS KONTRAK, KELOMPOK dan SATUAN dengan ARRAYFORMULA. Salinan
 * dimulai dari kolom TANGGAL (kolom B) dan kolom berformula dibiarkan KOSONG —
 * sel kosong tidak menghalangi ARRAYFORMULA meluber, nilai apa pun akan
 * membuatnya #REF!. WORK ORDER bersatuan GARDU juga diisi rumus (1 per
 * gardu) → kosong; WORK ORDER KMS tetap disalin = REALISASI.
 */

import { BULAN, META } from "./kinerjaMeta";
import type { ItemHarian } from "./realisasiHarian";

/** Kolom yang disalin: TANGGAL (kolom B) sampai REALISASI (kolom N). */
export const KOLOM_PRO_NTB = [
  "TANGGAL", "UIW NTB", "UP3", "ULP", "JENIS PEKERJAAN", "LOKASI PEKERJAAN", "NAMA TIM",
  "TIM PELAKSANA", "JENIS KONTRAK", "KELOMPOK PEKERJAAN", "SATUAN", "WORK ORDER", "REALISASI",
];

/** Indeks (dalam KOLOM_PRO_NTB) kolom yang diisi formula spreadsheet. */
export const KOLOM_FORMULA = new Set([1, 2, 3, 7, 8, 9, 10]);
/** Awalan lokasi gardu di laporan UIW (kode UP3 Mataram). */
const KODE_UP3 = "4415";
/** Jenis yang objeknya gardu → lokasi "4415_KODE_ALAMAT". */
const OBJEK_GARDU = new Set(["hargardu", "penyeimbangan", "optimasi", "pengukuran", "jtr", "igardu1", "igardu2"]);
const URUTAN = new Map(META.map((m, i) => [m.kunci, i]));
const DESIMAL = new Map(META.map((m) => [m.kunci, m.desimal]));

/** Baris `realisasi_rentang` — realisasi harian ditambah tanggalnya. */
export interface ItemPro extends ItemHarian {
  tgl: string;
  /** Pemeliharaan Jaringan: label kategori catatannya (lihat `JENIS_DARI_KATEGORI`). */
  kategori?: string | null;
}

/**
 * Jenis yang JENIS PEKERJAAN-nya = kategori tiap catatan, bukan teks tetap
 * dari `pro_ntb_jenis` (permintaan user 21 Okt: "khusus di pemeliharaan
 * jaringan, jenis pemeliharaan itu = kategori").
 */
export const JENIS_DARI_KATEGORI = "harjtm";

export interface KolomJenis {
  kunci: string;
  jenis_pekerjaan: string | null;
}

export interface BarisPro {
  /** Kunci baris di layar (tidak ikut laporan). */
  id: string;
  item: ItemPro;
  tanggal: string;
  lokasi: string;
  /** null = jenis ini belum diatur. */
  jenis: KolomJenis | null;
  /** null = nilainya tidak tercatat (perabasan di luar WO tanpa KMS). */
  nilai: number | null;
  desimal: boolean;
}

const dua = (n: number) => String(n).padStart(2, "0");

/** "2024-01-02" → "02 Januari 2024". */
export function tanggalPro(tgl: string) {
  const [y, m, d] = tgl.split("-").map(Number);
  return `${dua(d)} ${BULAN[m - 1]} ${y}`;
}

/** KMS → "3,56" (selalu 2 desimal, seperti contoh UIW); gardu → "1". */
export const angkaPro = (n: number | null, desimal: boolean) =>
  n === null ? "" : n.toLocaleString("id-ID", {
    minimumFractionDigits: desimal ? 2 : 0, maximumFractionDigits: desimal ? 2 : 0, useGrouping: false,
  });

/** Kunci gardu di master: ULP|KODE. */
export const kunciGardu = (ulp: string, kode: string) => `${ulp.toUpperCase()}|${kode.toUpperCase()}`;

export function susunBaris(
  item: ItemPro[],
  jenis: Map<string, KolomJenis>,
  alamat: Map<string, string>,
): BarisPro[] {
  const urut = item
    .filter((x) => x.bagian !== "ujung")
    .map((x, i) => ({ x, i }))
    .sort((a, b) =>
      a.x.tgl.localeCompare(b.x.tgl) ||
      a.x.ulp.localeCompare(b.x.ulp) ||
      (URUTAN.get(a.x.kunci) ?? 99) - (URUTAN.get(b.x.kunci) ?? 99) ||
      a.i - b.i,
    );
  return urut.map(({ x, i }) => {
    const desimal = DESIMAL.get(x.kunci) ?? false;
    const lokasi = OBJEK_GARDU.has(x.kunci)
      ? [KODE_UP3, x.objek, alamat.get(kunciGardu(x.ulp, x.objek)) ?? (x.kunci.startsWith("igardu") ? x.rincian : null)]
          .filter(Boolean).join("_")
      : x.objek.replaceAll(" · ", " - ");
    return {
      id: `${x.tgl}|${x.ulp}|${x.kunci}|${x.bagian}|${x.objek}|${i}`,
      item: x,
      tanggal: tanggalPro(x.tgl),
      lokasi,
      jenis: x.kunci === JENIS_DARI_KATEGORI
        ? { kunci: x.kunci, jenis_pekerjaan: x.kategori ?? null }
        : jenis.get(x.kunci) ?? null,
      nilai: desimal ? (x.km === null ? null : Math.round(x.km * 100) / 100) : 1,
      desimal,
    };
  });
}

/** Satu baris laporan sebagai daftar sel (13 kolom, kolom formula kosong). */
export function selPro(b: BarisPro, tim: string): string[] {
  const n = angkaPro(b.nilai, b.desimal);
  return [b.tanggal, "", "", "", b.jenis?.jenis_pekerjaan ?? "", b.lokasi, tim, "", "", "", "", b.desimal ? n : "", n];

}

/** Teks bertab untuk ditempel di sel TANGGAL spreadsheet (tanpa judul kolom). */
export function teksTempel(baris: BarisPro[], timDari: (b: BarisPro) => string) {
  const bersih = (s: string) => s.replace(/[\t\r\n]+/g, " ").trim();
  return baris.map((b) => selPro(b, timDari(b)).map(bersih).join("\t")).join("\n");
}

