// Urutan penting: kategori lebih spesifik didahulukan
const PENYEBAB_CATEGORIES: { label: string; keywords: string[] }[] = [
  { label: "Layangan", keywords: ["layang"] },
  {
    label: "Binatang",
    keywords: [
      "burung", "musang", "tikus", "biawak", "ular", "kucing", "monyet",
      "cicak", "anjing", "kelelawar", "tupai", "babi", "lebah", "semut",
      "serangga", "binatang", "hewan", "tokek", "kadal",
    ],
  },
  {
    label: "Pohon / Vegetasi",
    keywords: ["pohon", "ranting", "dahan", "bambu", "rabas", "vegetasi", "tumbuhan", "tanaman", "daun", "pisang"],
  },
  {
    label: "Petir / Cuaca",
    keywords: ["petir", "sambaran", "kilat", "angin", "hujan", "badai", "banjir", "cuaca", "topan"],
  },
  {
    label: "Kabel / Konduktor",
    keywords: ["kabel", "konduktor", "kawat", "putus", "jamper", "jumper", "sleding", "sliding", "MVTIC"],
  },
  { label: "Trafo",          keywords: ["trafo", "transformator", "minyak trafo", "bushing"] },
  { label: "FCO / Fuse",    keywords: ["fco", "fuse", "sekring", "pengaman lebur"] },
  { label: "Tiang",         keywords: ["tiang", "roboh", "miring", "patah tiang"] },
  { label: "Overload / Beban", keywords: ["overload", "beban lebih", "overcurrent", "oc murni"] },
  { label: "Hubung Singkat", keywords: ["hubung singkat", "short circuit", "hs"] },
  {
    label: "Human Error",
    keywords: ["galian", "proyek", "kecelakaan", "tabrak", "manusia", "vandalisme"],
  },
  {
    label: "Peralatan",
    keywords: ["arrester", "isolator", "disconnector", "pm", "pemutus", "kwh", "meteran"],
  },
  { label: "Komponen", keywords: ["traves", "travers"] },
];

export function categorizePenyebab(raw: string): string {
  if (!raw) return "Belum Diketahui";
  const lower = raw.toLowerCase();
  for (const cat of PENYEBAB_CATEGORIES) {
    if (cat.keywords.some((kw) => lower.includes(kw.toLowerCase()))) return cat.label;
  }
  return "Belum Diketahui";
}
