/**
 * Bingkai peta — kotak `[[latMin, lngMin], [latMaks, lngMaks]]` yang dituju
 * `Fokus` di PetaInner. Dulu ditulis ulang di tiap tempat yang melompatkan
 * peta (antrean, portal, gardu janggal, koreksi isian …).
 */

export type Bingkai = [[number, number], [number, number]];

/** Lompat ke satu tiang/gardu — cukup dekat untuk melihat tiang di sekitarnya. */
export const DEKAT = 0.0008;

/** Kotak di sekitar satu titik; `dLng` bawaan sama dengan `dLat`. */
export const bingkaiSekitar = (lat: number, lng: number, dLat: number, dLng = dLat): Bingkai => [
  [lat - dLat, lng - dLng],
  [lat + dLat, lng + dLng],
];

/** Kotak yang memuat semua titik, diberi tepi `pad`. null = tanpa titik. */
export function bingkaiTitik(titik: { lat: number; lng: number }[], pad = 0): Bingkai | null {
  if (titik.length === 0) return null;
  const lat = titik.map((x) => x.lat);
  const lng = titik.map((x) => x.lng);
  return [
    [Math.min(...lat) - pad, Math.min(...lng) - pad],
    [Math.max(...lat) + pad, Math.max(...lng) + pad],
  ];
}

/** Batas lapisan dari daftar (null = belum bertitik) → bingkai. */
export function bingkaiBatas(b: {
  latMin: number | null;
  latMaks: number | null;
  lngMin: number | null;
  lngMaks: number | null;
}): Bingkai | null {
  if (b.latMin === null || b.latMaks === null || b.lngMin === null || b.lngMaks === null) return null;
  return [
    [b.latMin, b.lngMin],
    [b.latMaks, b.lngMaks],
  ];
}
