/**
 * Warna garis SLD per penyulang. Ditetapkan menurut urutan daftar penyulang
 * (bukan urutan dicentang), jadi satu penyulang selalu berwarna sama — di peta
 * dan di kartu ringkasnya.
 */

const PALET = ["#2563EB", "#9333EA", "#0891B2", "#CA8A04", "#DB2777", "#059669", "#EA580C", "#4F46E5"];
const ABU = "#64748B";

export function warnaPenyulang(daftar: string[]): Map<string, string> {
  return new Map(daftar.map((p, i) => [p.toUpperCase(), PALET[i % PALET.length]]));
}

export const warnaDari = (warna: Map<string, string>, penyulang: string) => warna.get(penyulang.toUpperCase()) ?? ABU;
