/**
 * Perkiraan material usulan perbaikan JTR (P3, 20 Okt 2026). Daftar & rumus
 * dari `jtr_material_ref` (diatur UP3); jumlah = ⌈faktor × dasar⌉. Hasilnya
 * hanya isian awal — user memeriksa dan mengubahnya sebelum WO terbit.
 */

import type { JurusanJtr } from "../_hooks/useAnalisisJtr";
import { pindahSr, type OpsiPecah, type Rencana } from "./rencanaJtr";

export type PekerjaanMaterial = "tambah-jurusan" | "pindah-sr" | "ganti-kabel" | "pemerataan";

export const LABEL_MATERIAL: Record<PekerjaanMaterial, string> = {
  "tambah-jurusan": "Tambah jurusan — potong & sambung cabang",
  "pindah-sr": "Tambah jurusan — pindah SR ke kabel baru",
  "ganti-kabel": "Ganti kabel",
  pemerataan: "Pemerataan beban",
};
export type DasarMaterial = "tetap" | "kabel_m" | "tiang" | "sr";

export const LABEL_DASAR: Record<DasarMaterial, string> = {
  tetap: "jumlah tetap",
  kabel_m: "× panjang kabel (m)",
  tiang: "× tiang dilalui",
  sr: "× SR dipindah fasa",
};

export interface MaterialRef {
  id: number;
  pekerjaan: PekerjaanMaterial;
  nama: string;
  satuan: string;
  dasar: DasarMaterial;
  faktor: number;
  urutan: number;
}

export interface BarisMaterial {
  nama: string;
  satuan: string;
  jumlah: number;
}

export interface Besaran {
  kabel_m: number;
  tiang: number;
  sr: number;
}

/**
 * Perkiraan tarikan SR yang dipindah fasa supaya ketiga fasa rata: kelebihan
 * arus di atas rata-rata dibagi arus per SR (Σ arus fasa / jumlah SR).
 */
export function srPindahFasa(r: JurusanJtr): number {
  const f = [r.a_r ?? 0, r.a_s ?? 0, r.a_t ?? 0];
  const total = f.reduce((t, x) => t + x, 0);
  const sr = Number(r.jumlah_sr ?? 0);
  if (!total || !sr) return 0;
  const rata = total / 3;
  const lebih = f.reduce((t, x) => t + Math.max(0, x - rata), 0);
  return Math.ceil(lebih / (total / sr));
}

export function besaranUsulan(r: JurusanJtr, rencana: Rencana | null, opsi: OpsiPecah | null): Besaran {
  return {
    kabel_m: opsi?.kabelBaru ?? rencana?.besaran?.kabel_m ?? 0,
    tiang: opsi?.tiangLintas ?? rencana?.besaran?.tiang ?? 0,
    sr: opsi && pindahSr(opsi) ? opsi.srPindah : rencana?.jenis === "pemerataan" || opsi?.pemerataan ? srPindahFasa(r) : 0,
  };
}

/**
 * Isian material awal satu usulan: daftar bawaan pekerjaannya (pindah SR
 * punya daftar sendiri), ditambah pemerataan bila titik pecah memerlukannya.
 */
export function materialAwal(ref: MaterialRef[], r: JurusanJtr, rencana: Rencana | null, opsi: OpsiPecah | null): BarisMaterial[] {
  const b = besaranUsulan(r, rencana, opsi);
  const pekerjaan = opsi ? (pindahSr(opsi) ? "pindah-sr" : "tambah-jurusan") : (rencana?.jenis ?? "");
  return [
    ...perkiraanMaterial(ref, pekerjaan, b, r.kabel),
    ...(opsi?.pemerataan ? perkiraanMaterial(ref, "pemerataan", b, r.kabel) : []),
  ];
}

export function perkiraanMaterial(
  ref: MaterialRef[],
  pekerjaan: string,
  b: Besaran,
  kabel: string | null,
): BarisMaterial[] {
  return ref
    .filter((x) => x.pekerjaan === pekerjaan)
    .sort((x, y) => x.urutan - y.urutan)
    .map((x) => ({
      nama: x.nama.replace("{kabel}", kabel ?? "").trim(),
      satuan: x.satuan,
      jumlah: Math.ceil(x.faktor * (x.dasar === "tetap" ? 1 : b[x.dasar])),
    }));
}
