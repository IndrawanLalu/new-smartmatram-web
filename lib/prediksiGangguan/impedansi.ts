/**
 * Impedansi urutan positif konduktor JTM (Ω/km), nilai tabel umum SPLN 64.
 * Hanya Z1 yang dipakai: prediksi jarak hanya untuk gangguan antar fasa (OC).
 * Gangguan tanah (EF) dibatasi NGR 40 Ω sehingga besar arusnya nyaris tidak
 * dipengaruhi jarak (uji Meninting 29-10-2026) — EF hanya diberi zona.
 */

export interface Z1 { r: number; x: number }

/** AAAC / AAACS / A3C / A3CS / ACSR — kawat telanjang atau setengah berisolasi. */
const UDARA: Record<number, Z1> = {
  35: { r: 0.9217, x: 0.379 },
  50: { r: 0.6452, x: 0.3678 },
  70: { r: 0.4608, x: 0.3572 },
  95: { r: 0.3396, x: 0.3449 },
  120: { r: 0.2688, x: 0.3376 },
  150: { r: 0.2162, x: 0.3305 },
  240: { r: 0.1344, x: 0.3158 },
};

/** MVTIC (kabel pilin) & kabel tanah NA2XSEYBY — reaktansinya jauh lebih kecil. */
const KABEL: Record<number, Z1> = {
  70: { r: 0.443, x: 0.115 },
  95: { r: 0.32, x: 0.11 },
  120: { r: 0.253, x: 0.107 },
  150: { r: 0.206, x: 0.104 },
  240: { r: 0.125, x: 0.097 },
};

const UKURAN = [35, 50, 70, 95, 120, 150, 240];

export const KONDUKTOR_BAWAAN = "AAAC 150";

function terdekat(n: number, tabel: Record<number, Z1>): Z1 {
  const ada = UKURAN.filter((u) => tabel[u]);
  const u = ada.reduce((a, b) => (Math.abs(b - n) < Math.abs(a - n) ? b : a));
  return tabel[u];
}

/**
 * Isian `jenis_konduktor` (aaac, aaacs, mvtic, aaac_150, …) + `ukuran_konduktor`
 * (mm²). Jenis "aaac_150" membawa ukurannya sendiri. Tidak dikenal → AAAC 150.
 */
export function impedansiKonduktor(jenis: string | null | undefined, ukuran: string | null | undefined): Z1 {
  const j = (jenis ?? "").toLowerCase();
  const n = Number(ukuran) || Number(j.match(/(\d{2,3})/)?.[1]) || 150;
  const kabel = j.startsWith("mvtic") || j.startsWith("na2x");
  return terdekat(n, kabel ? KABEL : UDARA);
}
