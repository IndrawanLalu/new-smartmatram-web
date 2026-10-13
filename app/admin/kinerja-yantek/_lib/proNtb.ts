/**
 * Copy to PRO NTB — baris laporan harian UIW (spreadsheet PRO NTB) disusun
 * dari realisasi harian (`realisasi_rentang`), 13 Okt 2026.
 *
 * Format dari contoh user: TANGGAL "02 Januari 2024", angka berkoma "3,56",
 * ULP "ULP AMPENAN", lokasi gardu "4415_AM077_ALAMAT", segmen = nama segmen.
 * WORK ORDER = REALISASI (keputusan user). Tegangan ujung tidak ikut —
 * sama dengan Rekap Kinerja, ia bukan realisasi pengukuran.
 */

import { BULAN, META } from "./kinerjaMeta";
import type { ItemHarian } from "./realisasiHarian";

export const KOLOM_PRO_NTB = [
  "NO", "TANGGAL", "UIW NTB", "UP3", "ULP", "JENIS PEKERJAAN", "LOKASI PEKERJAAN", "NAMA TIM",
  "TIM PELAKSANA", "JENIS KONTRAK", "KELOMPOK PEKERJAAN", "SATUAN", "WORK ORDER", "REALISASI",
];

const UIW = "UIW NTB";
const UP3 = "UP3 MATARAM";
/** Awalan lokasi gardu di laporan UIW (kode UP3 Mataram). */
const KODE_UP3 = "4415";
/** Jenis yang objeknya gardu → lokasi "4415_KODE_ALAMAT". */
const OBJEK_GARDU = new Set(["hargardu", "penyeimbangan", "optimasi", "pengukuran", "jtr", "igardu1", "igardu2"]);
const URUTAN = new Map(META.map((m, i) => [m.kunci, i]));
const DESIMAL = new Map(META.map((m) => [m.kunci, m.desimal]));

/** Baris `realisasi_rentang` — realisasi harian ditambah tanggalnya. */
export interface ItemPro extends ItemHarian {
  tgl: string;
}

export interface KolomJenis {
  kunci: string;
  jenis_pekerjaan: string | null;
  tim_pelaksana: string | null;
  jenis_kontrak: string | null;
  kelompok: string | null;
  satuan: string | null;
}

export const ISIAN_JENIS = [
  { kolom: "jenis_pekerjaan", label: "Jenis pekerjaan" },
  { kolom: "tim_pelaksana", label: "Tim pelaksana" },
  { kolom: "jenis_kontrak", label: "Jenis kontrak" },
  { kolom: "kelompok", label: "Kelompok pekerjaan" },
  { kolom: "satuan", label: "Satuan" },
] as const;

export type KolomIsian = (typeof ISIAN_JENIS)[number]["kolom"];

export interface BarisPro {
  /** Kunci baris di layar (tidak ikut laporan). */
  id: string;
  item: ItemPro;
  tanggal: string;
  ulp: string;
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
      ulp: `ULP ${x.ulp}`,
      lokasi,
      jenis: jenis.get(x.kunci) ?? null,
      nilai: desimal ? (x.km === null ? null : Math.round(x.km * 100) / 100) : 1,
      desimal,
    };
  });
}

/** Satu baris laporan sebagai daftar sel (14 kolom). */
export function selPro(b: BarisPro, no: number, tim: string): string[] {
  const j = b.jenis;
  const n = angkaPro(b.nilai, b.desimal);
  return [
    String(no), b.tanggal, UIW, UP3, b.ulp, j?.jenis_pekerjaan ?? "", b.lokasi, tim,
    j?.tim_pelaksana ?? "", j?.jenis_kontrak ?? "", j?.kelompok ?? "", j?.satuan ?? "", n, n,
  ];
}

/** Teks bertab untuk ditempel ke spreadsheet (tanpa judul kolom). */
export function teksTempel(baris: BarisPro[], noAwal: number, timDari: (b: BarisPro) => string) {
  const bersih = (s: string) => s.replace(/[\t\r\n]+/g, " ").trim();
  return baris.map((b, i) => selPro(b, noAwal + i, timDari(b)).map(bersih).join("\t")).join("\n");
}
