/**
 * Simbol gardu baru menurut contoh unit (contohAset/contohGardu.png): tiang
 * (lingkaran setengah hitam ◐) dengan segitiga trafo DI SAMPINGNYA — alasnya
 * menghadap tiang, ujung lancipnya menjauh. Portal =
 * dua tiang berdampingan. Seluruh simbol diputar `arah` derajat searah jarum
 * jam supaya sesuai lapangan; 0 = trafo di bawah tiang.
 *
 * Satu geometri untuk peta (SVG ikon) dan gambar survey PDF — keduanya pasti
 * menggambar arah yang sama.
 */

export type Xy = { x: number; y: number };

export interface BentukGardu {
  /** Pusat tiap tiang (1 cantol, 2 portal), relatif terhadap titik. */
  tiang: Xy[];
  /** Tiga sudut segitiga trafo, relatif terhadap titik. */
  segitiga: [Xy, Xy, Xy];
}

const putar = (p: Xy, derajat: number): Xy => {
  const a = (derajat * Math.PI) / 180;
  return { x: p.x * Math.cos(a) - p.y * Math.sin(a), y: p.x * Math.sin(a) + p.y * Math.cos(a) };
};

/** `r` = jari-jari lingkaran tiang. */
export function bentukGardu(jenis: "portal" | "cantol" | null, arah: number, r: number): BentukGardu {
  const tiang = jenis === "portal" ? [{ x: -1.15 * r, y: 0 }, { x: 1.15 * r, y: 0 }] : [{ x: 0, y: 0 }];
  // Alas menghadap tiang, ujung lancip menjauh (koreksi user 21 Okt).
  const segitiga: [Xy, Xy, Xy] = [
    { x: -1.7 * r, y: 1.6 * r },
    { x: 1.7 * r, y: 1.6 * r },
    { x: 0, y: 4.6 * r },
  ];
  return {
    tiang: tiang.map((p) => putar(p, arah)),
    segitiga: segitiga.map((p) => putar(p, arah)) as [Xy, Xy, Xy],
  };
}

/** Setengah kiri lingkaran (bagian hitam ◐) sebagai path SVG. */
export const setengahTiang = (x: number, y: number, r: number) => `M ${x} ${y - r} A ${r} ${r} 0 0 0 ${x} ${y + r} Z`;
