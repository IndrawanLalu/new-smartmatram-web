/**
 * Saringan yang dibaca dari pertanyaan: ULP, periode, kode gardu, penyulang.
 * Bawaan di kode (bukan tabel) — bentuknya tetap; ejaan lain cukup lewat
 * kamus. Kata yang terpakai saringan dibuang sebelum fungsi dinilai, supaya
 * "gardu overload AMPENAN" tidak ikut menilai kata kunci.
 */

import { miripKata } from "./rapikan";

export const ULP_SEMUA = ["AMPENAN", "CAKRANEGARA", "GERUNG", "TANJUNG"] as const;

export interface Periode {
  dari: string; // YYYY-MM-DD
  sampai: string; // YYYY-MM-DD, inklusif
  label: string;
}

export interface Saringan {
  /** null = semua ULP. */
  ulp: string | null;
  /** true bila ULP disebut di pertanyaan (bukan bawaan grup). */
  ulpDisebut: boolean;
  periode: Periode | null;
  gardu: string | null;
  penyulang: string | null;
}

export interface HasilSaringan {
  saringan: Saringan;
  /** Teks yang tersisa sesudah kata saringan dibuang. */
  sisa: string;
}

const BULAN = ["januari", "februari", "maret", "april", "mei", "juni", "juli", "agustus", "september", "oktober", "november", "desember"];
const BULAN_PENDEK: Record<string, number> = {
  jan: 0, feb: 1, peb: 1, mar: 2, apr: 3, mei: 4, jun: 5, jul: 6, agu: 7, agt: 7, agus: 7, ags: 7,
  sep: 8, sept: 8, okt: 9, oct: 9, nov: 10, nop: 10, des: 11, dec: 11,
};
const NAMA_BULAN_LABEL = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];

const iso = (d: Date) => d.toISOString().slice(0, 10);
const utc = (y: number, m: number, d: number) => new Date(Date.UTC(y, m, d));
const geserDari = (d: Date, hari: number) => utc(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + hari);
const tglLabel = (d: Date) => `${d.getUTCDate()} ${NAMA_BULAN_LABEL[d.getUTCMonth()]} ${d.getUTCFullYear()}`;

/** Hari ini menurut WITA (UTC+8), sebagai tanggal UTC tengah malam. */
export function hariIniWita(sekarang = new Date()): Date {
  const w = new Date(sekarang.getTime() + 8 * 3600_000);
  return utc(w.getUTCFullYear(), w.getUTCMonth(), w.getUTCDate());
}

function bulanKe(nama: string): number | null {
  const i = BULAN.indexOf(nama);
  if (i >= 0) return i;
  if (nama in BULAN_PENDEK) return BULAN_PENDEK[nama];
  const mirip = BULAN.findIndex((b) => miripKata(nama, b));
  return mirip >= 0 ? mirip : null;
}

function satuBulan(y: number, m: number): Periode {
  const akhir = utc(y, m + 1, 0);
  return { dari: iso(utc(y, m, 1)), sampai: iso(akhir), label: `${NAMA_BULAN_LABEL[m]} ${y}` };
}

function satuHari(d: Date, label?: string): Periode {
  return { dari: iso(d), sampai: iso(d), label: label ?? tglLabel(d) };
}

/** Periode dari teks; mengembalikan periode + teks tanpa frasa periodenya. */
export function bacaPeriode(teks: string, hariIni: Date): { periode: Periode | null; sisa: string } {
  const y = hariIni.getUTCFullYear();
  const m = hariIni.getUTCMonth();
  const geser = (hari: number) => geserDari(hariIni, hari);
  const senin = geser(-((hariIni.getUTCDay() + 6) % 7));
  const s = ` ${teks} `;
  const buang = (frasa: string) => s.replace(` ${frasa} `, " ").replace(/\s+/g, " ").trim();

  const pola: [RegExp, (x: RegExpMatchArray) => Periode | null][] = [
    // 28/10 · 28/10/2026
    [/ (\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))? /, (x) => {
      const th = x[3] ? (x[3].length === 2 ? 2000 + Number(x[3]) : Number(x[3])) : y;
      const d = utc(th, Number(x[2]) - 1, Number(x[1]));
      return d.getUTCDate() === Number(x[1]) ? satuHari(d) : null;
    }],
    // 28 okt · 28 oktober 2026
    [/ (\d{1,2}) ([a-z]{3,9})(?: (\d{4}))? /, (x) => {
      const bl = bulanKe(x[2]);
      if (bl === null) return null;
      const d = utc(x[3] ? Number(x[3]) : y, bl, Number(x[1]));
      return d.getUTCDate() === Number(x[1]) ? satuHari(d) : null;
    }],
    [/ (\d{1,3}) hari terakhir /, (x) => {
      const n = Math.min(366, Math.max(1, Number(x[1])));
      return { dari: iso(geser(1 - n)), sampai: iso(hariIni), label: `${n} hari terakhir` };
    }],
    [/ hari ini /, () => satuHari(hariIni, `hari ini (${tglLabel(hariIni)})`)],
    [/ kemarin /, () => satuHari(geser(-1), `kemarin (${tglLabel(geser(-1))})`)],
    [/ minggu ini /, () => ({ dari: iso(senin), sampai: iso(hariIni), label: "minggu ini" })],
    [/ minggu lalu /, () => ({ dari: iso(geserDari(senin, -7)), sampai: iso(geserDari(senin, -1)), label: "minggu lalu" })],
    [/ bulan ini /, () => ({ ...satuBulan(y, m), sampai: iso(hariIni) })],
    [/ bulan lalu /, () => satuBulan(m === 0 ? y - 1 : y, (m + 11) % 12)],
    [/ tahun ini /, () => ({ dari: `${y}-01-01`, sampai: iso(hariIni), label: `tahun ${y}` })],
    [/ tahun lalu /, () => ({ dari: `${y - 1}-01-01`, sampai: `${y - 1}-12-31`, label: `tahun ${y - 1}` })],
  ];

  for (const [re, buat] of pola) {
    const x = s.match(re);
    if (!x) continue;
    const p = buat(x);
    if (p) return { periode: p, sisa: buang(x[0].trim()) };
  }
  // Nama bulan (+ tahun): dicari per kata, karena kata biasa ("ampenan") tidak boleh dianggap bulan.
  const kata = teks.split(" ");
  for (let i = 0; i < kata.length; i++) {
    const k = kata[i];
    if (k.length < 3) continue;
    const persis = BULAN.indexOf(k) >= 0 || k in BULAN_PENDEK;
    // Salah ketik nama bulan hanya bila didahului "bulan" — "bulan oktber".
    const bl = persis ? bulanKe(k) : kata[i - 1] === "bulan" ? bulanKe(k) : null;
    if (bl === null) continue;
    // Bulan yang belum tiba tahun ini = tahun lalu.
    const th = /^\d{4}$/.test(kata[i + 1] ?? "") ? Number(kata[i + 1]) : bl > m ? y - 1 : y;
    const p = satuBulan(th, bl);
    const awal = kata[i - 1] === "bulan" ? i - 1 : i;
    const akhir = /^\d{4}$/.test(kata[i + 1] ?? "") ? i + 2 : i + 1;
    return { periode: p, sisa: [...kata.slice(0, awal), ...kata.slice(akhir)].join(" ") };
  }
  return { periode: null, sisa: teks };
}

const POLA_GARDU = /^[a-z]{2,3}\d{2,4}[a-z]?$/;
const AWALAN_PENYULANG = new Set(["penyulang"]);

/** Nama penyulang dalam bentuk rapi, tanpa awalan "ol" (OL. KERANDANGAN → kerandangan). */
export function rapiPenyulang(nama: string): string[] {
  const r = nama.toLowerCase().replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
  const tanpaOl = r.replace(/^ol /, "");
  return tanpaOl === r ? [r] : [r, tanpaOl];
}

/**
 * Semua saringan. `daftarPenyulang` = nama baku (huruf besar, dari master).
 * ULP menang atas penyulang bernama sama satu kata, kecuali didahului
 * "penyulang" ("penyulang tanjung").
 */
export function bacaSaringan(teks: string, daftarPenyulang: string[], hariIni: Date): HasilSaringan {
  const { periode, sisa: s1 } = bacaPeriode(teks, hariIni);
  let kata = s1.split(" ").filter(Boolean);

  // Penyulang: frasa terpanjang dulu.
  let penyulang: string | null = null;
  const calon = daftarPenyulang
    .flatMap((p) => rapiPenyulang(p).map((r) => ({ baku: p, r, n: r.split(" ").length })))
    .sort((a, b) => b.r.length - a.r.length);
  const gabung = () => ` ${kata.join(" ")} `;
  for (const c of calon) {
    const g = gabung();
    const i = g.indexOf(` ${c.r} `);
    if (i < 0) continue;
    const sebelum = g.slice(0, i).trim().split(" ").pop() ?? "";
    const namaUlp = c.n === 1 && ULP_SEMUA.some((u) => u.toLowerCase() === c.r);
    if (namaUlp && !AWALAN_PENYULANG.has(sebelum)) continue;
    penyulang = c.baku;
    kata = (g.slice(0, i) + " " + g.slice(i + c.r.length + 2)).split(" ").filter(Boolean);
    break;
  }

  let ulp: string | null = null;
  let ulpDisebut = false;
  let gardu: string | null = null;
  const sisa: string[] = [];
  for (const k of kata) {
    const u = ULP_SEMUA.find((x) => miripKata(k, x.toLowerCase()));
    if (u && !ulpDisebut) {
      ulp = u;
      ulpDisebut = true;
      continue;
    }
    if (!ulpDisebut && (k === "semua" || k === "up3")) {
      ulpDisebut = true; // "semua ULP" — sengaja tanpa saringan
      continue;
    }
    if (!gardu && POLA_GARDU.test(k)) {
      gardu = k.toUpperCase();
      continue;
    }
    if (AWALAN_PENYULANG.has(k) && penyulang) continue;
    sisa.push(k);
  }
  return { saringan: { ulp, ulpDisebut, periode, gardu, penyulang }, sisa: sisa.join(" ") };
}
