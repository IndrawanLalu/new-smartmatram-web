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

export const CAUSE_COLORS: Record<CauseClass, string> = {
  "Cuaca (angin/hujan/petir)": "#0ea5e9", // sky
  "Pohon / ROW": "#10b981", // emerald
  "Aset / Peralatan": "#f59e0b", // amber
  "Binatang / Hewan": "#b45309", // brown
  "Manusia / Eksternal": "#d946ef", // fuchsia
  "Lain-lain": "#64748b", // slate
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
