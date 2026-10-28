/**
 * Perapian teks pertanyaan WA: huruf kecil, tanda baca jadi spasi, sinonim
 * dari kamus diganti ke bentuk bakunya. Murni (tanpa database) — dipakai
 * webhook, kotak Uji coba di web, dan uji unit.
 */

export interface Kamus {
  dari: string;
  jadi: string;
}

/** Huruf kecil, buang tanda baca (kecuali "/" untuk tanggal 28/10), rapatkan spasi. */
export function rapikan(teks: string): string {
  return teks
    .toLowerCase()
    .replace(/[^a-z0-9/\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Ganti frasa kamus (utuh per kata), yang terpanjang dulu. */
export function terapkanKamus(rapi: string, kamus: Kamus[]): string {
  const urut = [...kamus].filter((k) => k.dari).sort((a, b) => b.dari.length - a.dari.length);
  let hasil = ` ${rapi} `;
  for (const k of urut) {
    const dari = rapikan(k.dari);
    if (!dari) continue;
    hasil = hasil.replace(new RegExp(`(?<= )${dari.replace(/[/]/g, "\\/")}(?= )`, "g"), rapikan(k.jadi));
  }
  return hasil.replace(/\s+/g, " ").trim();
}

/** Jarak edit (Damerau: tukar dua huruf bersebelahan = satu langkah). */
export function jarakEdit(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  const d: number[][] = Array.from({ length: m + 1 }, (_, i) => [i, ...Array<number>(n).fill(0)]);
  for (let j = 1; j <= n; j++) d[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const beda = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + beda);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
    }
  }
  return d[m][n];
}

/**
 * Salah ketik yang masih dianggap kata yang sama: kata <4 huruf harus persis,
 * 4–6 huruf boleh beda 1, ≥7 huruf boleh beda 2.
 */
export function miripKata(ketik: string, kunci: string): boolean {
  if (ketik === kunci) return true;
  const n = kunci.length;
  if (n < 4 || Math.abs(ketik.length - n) > 2) return false;
  return jarakEdit(ketik, kunci) <= (n >= 7 ? 2 : 1);
}
