/**
 * Membaca koordinat yang DITEMPEL orang — dari Google Maps, WhatsApp, GPS
 * kamera, atau diketik. Bentuk yang diterima:
 *
 *   -8.5833, 116.1167          -8.5833 116.1167          -8,5833 116,1167
 *   https://maps.google.com/?q=-8.58,116.11   …/@-8.58,116.11,17z
 *   8°35'00"S 116°07'00"E      8°35'00" LS 116°07'00" BT
 *
 * Urutan terbalik (bujur dulu) ditukar, dan lintang tanpa tanda minus dibalik
 * — di Lombok lintang PASTI negatif, jadi "8.58 116.11" hanya punya satu arti.
 * Titik di luar wilayah UP3 Mataram ditolak: hampir selalu salah salin.
 *
 * Salinan yang sama ada di HP (`new-smart/src/utils/koordinat.ts`) — dua sisi
 * harus membaca teks yang sama menjadi titik yang sama.
 */

export interface Titik {
  lat: number;
  lng: number;
}

/** Kotak kasar Pulau Lombok + Gili — cakupan UP3 Mataram. */
const WILAYAH = { latMin: -9.2, latMaks: -8.0, lngMin: 115.7, lngMaks: 116.8 };

const diWilayah = (t: Titik) =>
  t.lat >= WILAYAH.latMin && t.lat <= WILAYAH.latMaks && t.lng >= WILAYAH.lngMin && t.lng <= WILAYAH.lngMaks;

/** Derajat-menit-detik. Huruf arah: N/S/E/W atau LU/LS/BT/BB (U/S/T/B). */
const DMS = /(\d{1,3})\s*°\s*(\d{1,2})?\s*['′]?\s*(\d{1,2}(?:[.,]\d+)?)?\s*["″]?\s*(LU|LS|BT|BB|[NSEWUTB])/gi;

function bacaDms(teks: string): number[] | null {
  const hasil = [...teks.matchAll(DMS)].map((m) => {
    const nilai = Number(m[1]) + Number(m[2] ?? 0) / 60 + Number((m[3] ?? "0").replace(",", ".")) / 3600;
    const arah = m[4].toUpperCase();
    return ["S", "LS", "W", "B", "BB"].includes(arah) ? -nilai : nilai;
  });
  return hasil.length >= 2 ? hasil.slice(0, 2) : null;
}

/** Tautan Google Maps: `@lat,lng` atau `q=` / `query=` / `ll=` / `destination=`. */
function bacaTautan(teks: string): number[] | null {
  const m =
    teks.match(/@(-?\d+\.\d+),\s*(-?\d+\.\d+)/) ??
    teks.match(/[?&](?:q|query|ll|destination)=(-?\d+\.\d+)(?:,|%2C)\s*(-?\d+\.\d+)/i);
  return m ? [Number(m[1]), Number(m[2])] : null;
}

/** Dua bilangan desimal. Koma desimal ("-8,58 116,11") hanya dibaca begitu
 *  bila tidak ada titik sama sekali — "-8.58,116.11" komanya pemisah. */
function bacaDesimal(teks: string): number[] | null {
  const t = teks.includes(".") ? teks : teks.replace(/(\d),(\d)/g, "$1.$2");
  const angka = t.match(/-?\d+(?:\.\d+)?/g)?.map(Number) ?? [];
  return angka.length >= 2 ? angka.slice(0, 2) : null;
}

export type HasilBaca = { titik: Titik } | { galat: string };

export function bacaKoordinat(teks: string): HasilBaca {
  const s = teks.trim();
  if (!s) return { galat: "Tempel atau ketik koordinat dulu." };
  if (/goo\.gl|maps\.app/i.test(s)) {
    return { galat: "Tautan pendek Maps tidak memuat koordinat. Buka tautannya, lalu salin angka koordinatnya." };
  }

  const dua = bacaDms(s) ?? bacaTautan(s) ?? bacaDesimal(s);
  if (!dua) return { galat: "Koordinat tidak terbaca. Contoh: -8.5833, 116.1167" };

  let [a, b] = dua;
  if (Math.abs(a) > 90) [a, b] = [b, a];
  const titik = { lat: a > 0 ? -a : a, lng: b };
  if (!diWilayah(titik)) return { galat: `Titik ${titik.lat}, ${titik.lng} di luar wilayah UP3 Mataram.` };
  return { titik };
}

/** "-8.59350, 116.16650" — lima angka desimal ±1 m. */
export const tulisKoordinat = (t: Titik) => `${t.lat.toFixed(5)}, ${t.lng.toFixed(5)}`;
