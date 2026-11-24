/**
 * Petak tetap untuk cache memori /peta (24 Nov 2026).
 *
 * Kotak pandang tidak pernah persis sama dua kali, jadi tidak bisa jadi kunci
 * cache. Yang disimpan adalah PETAK berukuran tetap: layar dipetakan ke petak,
 * yang sudah ada dipakai ulang, yang belum diminta SEKALIGUS dalam satu kotak
 * gabungan (bukan satu permintaan per petak — di sinyal buruk itu lebih lambat).
 *
 * Cache hanya hidup selama halaman terbuka. Data dari HP/orang lain menyusul
 * lewat umur petak (UMUR_PETAK_MS) atau tombol Muat ulang; suntingan dari peta
 * ini sendiri mengosongkan cache (muatUlang di usePetaIsi).
 */

/** ±2,2 km. Di zoom 13 satu layar ≈ 100-an petak — hanya kunci, bukan permintaan. */
export const PETAK = 0.02;

/** Petak lebih tua dari ini diminta ulang — perubahan dari HP/orang lain muncul. */
export const UMUR_PETAK_MS = 10 * 60 * 1000;

/** Batas baris tersimpan; yang paling lama dibuang lebih dulu. */
export const BATAS_SIMPAN = 150_000;

export interface Rentang {
  iMin: number;
  iMaks: number;
  jMin: number;
  jMaks: number;
}

export const indeks = (v: number) => Math.floor(v / PETAK);

/** Petak yang menutupi kotak pandang. */
export function rentangKotak(k: { latMin: number; latMaks: number; lngMin: number; lngMaks: number }): Rentang {
  return { iMin: indeks(k.latMin), iMaks: indeks(k.latMaks), jMin: indeks(k.lngMin), jMaks: indeks(k.lngMaks) };
}

export function* petakDi(r: Rentang): Generator<[number, number]> {
  for (let i = r.iMin; i <= r.iMaks; i++) for (let j = r.jMin; j <= r.jMaks; j++) yield [i, j];
}

/** Kotak gabungan dari petak-petak yang kurang. */
export function gabung(petak: [number, number][]): Rentang | null {
  if (petak.length === 0) return null;
  let iMin = Infinity, iMaks = -Infinity, jMin = Infinity, jMaks = -Infinity;
  for (const [i, j] of petak) {
    if (i < iMin) iMin = i;
    if (i > iMaks) iMaks = i;
    if (j < jMin) jMin = j;
    if (j > jMaks) jMaks = j;
  }
  return { iMin, iMaks, jMin, jMaks };
}

/** Batas kueri sebuah rentang: [min, maks) — titik di tepi atas milik petak berikutnya. */
export const batas = (r: Rentang) => ({
  latMin: r.iMin * PETAK,
  latLebih: (r.iMaks + 1) * PETAK,
  lngMin: r.jMin * PETAK,
  lngLebih: (r.jMaks + 1) * PETAK,
});

/** Petak sebuah titik, dijepit ke rentang kueri — pembulatan desimal di tepi
 *  petak tidak boleh menjatuhkan titik ke petak yang tidak ikut diminta. */
export function petakTitik(lat: number, lng: number, r: Rentang): [number, number] {
  const i = Math.min(r.iMaks, Math.max(r.iMin, indeks(lat)));
  const j = Math.min(r.jMaks, Math.max(r.jMin, indeks(lng)));
  return [i, j];
}

interface Entri<T> {
  isi: T[];
  at: number;
}

/** Map kunci → baris, dengan umur dan batas jumlah baris (yang terlama dibuang). */
export class Simpanan<T> {
  private m = new Map<string, Entri<T>>();
  private jumlah = 0;

  /** Masih segar? (ada & belum melewati umur) */
  segar(kunci: string, kini: number) {
    const e = this.m.get(kunci);
    return !!e && kini - e.at < UMUR_PETAK_MS;
  }

  ambil(kunci: string): T[] | undefined {
    return this.m.get(kunci)?.isi;
  }

  taruh(kunci: string, isi: T[], at: number) {
    const lama = this.m.get(kunci);
    if (lama) {
      this.jumlah -= lama.isi.length;
      this.m.delete(kunci);   // pindah ke ujung: urutan Map = urutan terbaru
    }
    this.m.set(kunci, { isi, at });
    this.jumlah += isi.length;
    for (const [k, e] of this.m) {
      if (this.jumlah <= BATAS_SIMPAN || k === kunci) break;
      this.m.delete(k);
      this.jumlah -= e.isi.length;
    }
  }

  kosongkan() {
    this.m.clear();
    this.jumlah = 0;
  }
}
