import { CHART_SERIES, CHART_OTHER } from "./chartColors";

/**
 * Klasifikasi penyebab gangguan → 5 kelas + palet warna.
 * Cermin dari ml-engine/src/cause_labels.py (jaga keduanya tetap sinkron).
 * Dipakai oleh donut, heatmap, dan ringkasan penyebab di command-center.
 */

export const CAUSE_CLASSES = [
  "Cuaca (angin/hujan/petir)",
  "Pohon / ROW",
  "Aset / Peralatan",
  "Binatang / Hewan",
  "Manusia / Eksternal",
  "Lain-lain",
] as const;

export type CauseClass = (typeof CAUSE_CLASSES)[number];

/**
 * Warna kelas penyebab — diambil dari CHART_SERIES agar lolos uji palet di
 * permukaan terang. Susunan lama gagal dua hal: sky/emerald/amber
 * di luar ambang kontras, dan brown↔amber terlalu dekat (ΔE 11,4 — sulit
 * dibedakan bahkan dengan penglihatan warna normal).
 * "Lain-lain" sengaja abu: bukan identitas, jadi tidak diberi hue.
 */
export const CAUSE_COLORS: Record<CauseClass, string> = {
  "Cuaca (angin/hujan/petir)": CHART_SERIES[0], // biru
  "Pohon / ROW": CHART_SERIES[1],               // teal
  "Aset / Peralatan": CHART_SERIES[2],          // amber
  "Binatang / Hewan": CHART_SERIES[3],          // pink
  "Manusia / Eksternal": CHART_SERIES[4],       // violet
  "Lain-lain": CHART_OTHER,
};

// Diperiksa berurutan; kelas pertama yang cocok dipakai.
const RULES: [CauseClass, string[]][] = [
  ["Cuaca (angin/hujan/petir)", [
    "petir", "lightning", "angin", "hujan", "badai", "cuaca", "kilat",
    "guruh", "sambaran", "korsleting cuaca", "banjir", "thunder",
  ]],
  ["Pohon / ROW", [
    "pohon", "dahan", "ranting", "bambu", "kayu", "semak", "vegetasi",
    "tanaman", "tumbang", "rabas", "row",
  ]],
  ["Binatang / Hewan", [
    "binatang", "hewan", "monyet", "kera", "tokek", "cicak", "ular",
    "biawak", "kadal", "reptil", "tikus", "burung", "kelelawar", "kalong",
    "kucing", "musang", "tupai", "ayam", "sarang burung", "sarang", "ulat",
  ]],
  ["Aset / Peralatan", [
    "fco", "trafo", "transformer", "kabel", "kawat", "konduktor", "jumper",
    "isolator", "arrester", "kubikel", "las", "putus", "rusak", "bocor",
    "tiang roboh", "crossarm", "beban lebih", "overload", "meledak",
    "kebocoran minyak", "hubung singkat", "korsleting",
  ]],
  ["Manusia / Eksternal", [
    "kendaraan", "mobil", "truk", "excavator", "alat berat", "pembangunan",
    "galian", "layang", "pencurian", "vandalisme", "bakar", "terbakar",
  ]],
];

/**
 * Map penyebab mentah → salah satu CAUSE_CLASSES.
 * Untuk event yang sudah punya predicted_cause (Model B), pakai nilai itu langsung;
 * fungsi ini untuk mengklasifikasi penyebab known yang tercatat bebas.
 */
export function classifyCause(raw: string | null | undefined): CauseClass {
  const t = (raw ?? "").toLowerCase().trim();
  for (const [cls, needles] of RULES) {
    if (needles.some((n) => t.includes(n))) return cls;
  }
  return "Lain-lain";
}
