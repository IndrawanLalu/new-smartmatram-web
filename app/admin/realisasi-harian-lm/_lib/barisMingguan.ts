/**
 * Hitungan tab LM Mingguan. Barisnya diatur dari layar sejak 25 Nov 2026
 * (`lm4dx_baris` laporan 'mingguan', per ULP — scripts/lm-pdkb-mingguan.sql);
 * sumber dan cara hitungnya SAMA dengan tab harian (`sumbangan` di lm4dx.ts),
 * bedanya SEMUA status ikut, termasuk yang belum diverifikasi.
 *
 * Baris total (induk null yang punya rincian) = sumbernya sendiri + semua
 * rinciannya.
 *
 * Target (keputusan user 23 Nov): SLA bulanan per ULP yang sudah ada (Rekap
 * Kinerja · Atur SLA), dibagi ke minggu menurut jumlah hari:
 * target minggu = Σ hari minggu itu × SLA bulannya ÷ hari sebulan. Kunci SLA-nya
 * dipilih per baris (`sla`).
 */

import { META } from "@/app/admin/kinerja-yantek/_lib/kinerjaMeta";
import {
  SUMBER_DRONE, SUMBER_JTM_BIASA, SUMBER_JTM_DRONE_KM, SUMBER_JTM2_TITIK, sumbangan,
  type BarisLm, type ItemLm,
} from "@/app/admin/kinerja-yantek/_lib/lm4dx";

const KUNCI_META = new Set(META.map((m) => m.kunci));
const KUNCI_TINDAKAN = ["hargardu", "penyeimbangan"];

/**
 * Kunci realisasi_rentang yang dibutuhkan baris-baris ini (rentang minggu bisa
 * melewati bulan — pengukuran gardu ribuan baris, jadi tidak dibaca bila tidak
 * dipakai). PDKB dibaca terpisah.
 */
export function kunciRentang(baris: BarisLm[]) {
  const k = new Set<string>();
  for (const s of baris.flatMap((b) => b.sumber)) {
    if (s.startsWith("harjtm:")) k.add("harjtm");
    else if (s.startsWith("tindakan:")) KUNCI_TINDAKAN.forEach((x) => k.add(x));
    else if (s === SUMBER_DRONE || s === SUMBER_JTM_BIASA || s === SUMBER_JTM_DRONE_KM) k.add("jtm");
    else if (s === SUMBER_JTM2_TITIK) k.add("jtm2");
    else if (KUNCI_META.has(s)) k.add(s);
  }
  return [...k];
}

export const punyaRincian = (b: BarisLm, baris: BarisLm[]) => baris.some((x) => x.induk === b.id);

/** Nilai per minggu tiap baris (per id); baris total = dirinya + rinciannya. */
export function susunMingguan(
  baris: BarisLm[], item: ItemLm[], mingguDari: (tgl: string) => number, jumlahMinggu: number,
) {
  const hasil = new Map<string, number[]>();
  for (const b of baris) {
    const isi = Array<number>(jumlahMinggu).fill(0);
    const sumber = new Set(b.sumber);
    // Drone: penyulang berbeda PER HARI (sama dengan tab harian), dijumlah per minggu.
    const drone = new Map<string, Set<string>>();
    for (const x of item) {
      const w = mingguDari(x.tgl);
      if (w < 0) continue;
      isi[w] += sumbangan(sumber, x);
      if (sumber.has(SUMBER_DRONE) && x.kunci === "jtm" && x.drone && x.penyulang) {
        const hari = drone.get(x.tgl) ?? new Set<string>();
        hari.add(x.penyulang);
        drone.set(x.tgl, hari);
      }
    }
    for (const [tgl, p] of drone) isi[mingguDari(tgl)] += p.size;
    hasil.set(b.id, isi);
  }
  for (const b of baris) {
    const total = b.induk ? hasil.get(b.induk) : undefined;
    if (total) hasil.get(b.id)!.forEach((n, i) => { total[i] += n; });
  }
  return hasil;
}

/** Baris yang tidak punya sumber dan tidak punya rincian = belum ada di SMART. */
export const barisKosong = (b: BarisLm, baris: BarisLm[]) => b.sumber.length === 0 && !punyaRincian(b, baris);

export const angkaMingguan = (n: number, desimal: boolean) =>
  n === 0 ? "—" : n.toLocaleString("id-ID", { maximumFractionDigits: desimal ? 3 : 0 });

/** SLA bulanan per `kunci|YYYY-MM`; null = belum diatur. */
export type PetaSla = Map<string, number | null>;

/** Bulan-bulan (YYYY-MM) yang disentuh rentang tanggal. */
export function bulanDalam(dari: string, sampai: string) {
  const hasil: string[] = [];
  let [y, m] = dari.split("-").map(Number);
  const akhir = sampai.slice(0, 7);
  for (;;) {
    const b = `${y}-${String(m).padStart(2, "0")}`;
    hasil.push(b);
    if (b >= akhir) return hasil;
    if (++m > 12) { m = 1; y++; }
  }
}

/** Target satu baris untuk rentang tanggal (inklusif); null = tanpa SLA. */
export function targetRentang(b: BarisLm, sla: PetaSla, dari: string, sampai: string): number | null {
  if (!b.sla?.length) return null;
  let n = 0;
  let ada = false;
  for (const bln of bulanDalam(dari, sampai)) {
    const [y, m] = bln.split("-").map(Number);
    const hari = new Date(Date.UTC(y, m, 0)).getUTCDate();
    const a = dari > `${bln}-01` ? Number(dari.slice(8, 10)) : 1;
    const z = sampai.slice(0, 7) === bln ? Number(sampai.slice(8, 10)) : hari;
    for (const k of b.sla) {
      const t = sla.get(`${k}|${bln}`);
      if (t === null || t === undefined) continue;
      ada = true;
      n += (t * (z - a + 1)) / hari;
    }
  }
  return ada ? n : null;
}

/** "86%" — null bila target kosong / 0. */
export const persenCapaian = (real: number, target: number | null) =>
  target ? `${Math.round((real / target) * 100)}%` : null;
