/**
 * Membaca jenis gangguan dari arus rekaman R/S/T/N, lalu memisahkan arus
 * gangguan murni dari beban. Angka dispatcher SUDAH termasuk beban saat
 * gangguan (kata user 31 Okt 2026).
 */

export interface Arus { r: number | null; s: number | null; t: number | null; n: number | null }

export type JenisGangguan = "OC2" | "OC3" | "EF" | "TAK_JELAS";

export interface BacaanArus {
  jenis: JenisGangguan;
  /** Fasa yang membawa arus gangguan, mis. "S–T". */
  fasa: string;
  /** Rentang arus gangguan murni (A) — hanya untuk OC. */
  rentang: [number, number] | null;
  /** Perkiraan arus beban per fasa yang dikeluarkan (A). */
  beban: number;
  /** Kenapa jenisnya tidak bisa dipastikan. */
  alasan?: string;
}

const NAMA = ["R", "S", "T"] as const;
/** Arus gangguan tertinggal ±75° dari tegangannya, beban ±30°: selisih sudut
 *  beban terhadap arus gangguan berkisar 0–80°, jadi porsi beban yang
 *  menumpuk ke arus terukur antara cos 80° (0,17) dan cos 0° (1). */
const PORSI_MIN = 0.17;
/** Di bawah ini arus antar fasa tidak mungkin terjadi di jaringan 20 kV kita
 *  (ujung terjauh dari trafo 30 MVA pun masih ±1 kA) — itu arus beban. */
const OC_MIN = 600;

/** Arus beban dari daya (kW) di 20 kV, cos φ 0,9. */
const bebanDariKw = (kw: number) => kw / (Math.sqrt(3) * 20 * 0.9);

export function bacaArus(a: Arus, bebanKw: number | null): BacaanArus {
  const fasa = [a.r, a.s, a.t].map((v) => v ?? 0);
  const maks = Math.max(...fasa);
  const n = a.n ?? 0;
  if (maks <= 0) return { jenis: "TAK_JELAS", fasa: "-", rentang: null, beban: 0, alasan: "arus gangguan tidak tercatat" };

  // Gangguan tanah: arus netral sebanding dengan kenaikan fasa (NGR membatasi ±289 A).
  if (n >= 40 && n >= 0.4 * (maks - Math.min(...fasa))) {
    const i = fasa.indexOf(maks);
    return { jenis: "EF", fasa: NAMA[i], rentang: null, beban: 0 };
  }

  const besar = fasa.map((v, i) => ({ v, i })).filter((x) => x.v >= 0.5 * maks);
  const tunggal = NAMA[fasa.indexOf(maks)];
  if (besar.length < 2)
    return { jenis: "TAK_JELAS", fasa: tunggal, rentang: null, beban: 0, alasan: "hanya satu fasa naik tanpa arus netral" };
  if (maks < OC_MIN)
    return { jenis: "TAK_JELAS", fasa: tunggal, rentang: null, beban: 0, alasan: `arus ${Math.round(maks)} A terlalu kecil untuk gangguan antar fasa` };

  const sehat = fasa.filter((_, i) => !besar.some((b) => b.i === i));
  const beban = sehat.length ? Math.max(...sehat) : bebanKw ? bebanDariKw(bebanKw) : 0;

  // Rentang per fasa terganggu, lalu irisannya (atau gabungannya bila tak beririsan).
  const per = besar.map(({ v }) => [v - beban, v - PORSI_MIN * beban] as [number, number]);
  const lo = Math.max(...per.map((p) => p[0]));
  const hi = Math.min(...per.map((p) => p[1]));
  const rentang: [number, number] = lo <= hi
    ? [lo, hi]
    : [Math.min(...per.map((p) => p[0])), Math.max(...per.map((p) => p[1]))];

  return {
    jenis: besar.length === 3 ? "OC3" : "OC2",
    fasa: besar.map((b) => NAMA[b.i]).join("–"),
    rentang,
    beban: Math.round(beban),
  };
}

const V_FASA = 20000 / Math.sqrt(3);

/** Arus gangguan (A) di titik ber-Z1 kumulatif (r, x) dengan reaktansi sumber xs. */
export function arusDiTitik(jenis: "OC2" | "OC3", r: number, x: number, xs: number): number {
  const z = Math.hypot(r, xs + x);
  return jenis === "OC3" ? V_FASA / z : 20000 / (2 * z);
}

/** Xs yang membuat arus di titik (r, x) sama dengan `arus` (bagi dua). */
export function xsDariArus(jenis: "OC2" | "OC3", r: number, x: number, arus: number): number | null {
  let lo = 0, hi = 10;
  if (arusDiTitik(jenis, r, x, lo) < arus) return null; // titik terlalu jauh untuk arus sebesar itu
  for (let i = 0; i < 60; i++) {
    const m = (lo + hi) / 2;
    if (arusDiTitik(jenis, r, x, m) > arus) lo = m; else hi = m;
  }
  return lo;
}
