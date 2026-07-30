/**
 * Warna seri grafik — SATU sumber untuk seluruh aplikasi.
 *
 * Semua permukaan aplikasi TERANG (lihat memori desain), jadi warna seri harus
 * lolos ambang kontras di atas putih. Itu membatasi seberapa "muda" warna boleh:
 * nada pastel/neon hanya mencapai 1,6–2,7:1 di atas putih (ambang 3:1), sehingga
 * yang dipakai adalah nada 600 — tetap berwarna kuat, tapi terbaca.
 *
 * Jangan menambah/mengubah warna tanpa menjalankan validatornya:
 *   node scripts/validate_palette.js "<hex,hex,…>" --mode light
 */

/**
 * Palet seri kategorikal. Lolos semua uji di permukaan terang:
 * chroma ≥0,10 · lightness dalam band · pemisahan CVD deutan/protan ·
 * kontras ≥3:1 vs putih.
 *
 * Catatan: pasangan oranye↔pink berjarak dekat pada tritanopia (ΔE 4,9), jadi
 * setiap grafik yang memakai palet ini WAJIB punya legenda atau label langsung
 * — jangan pernah mengandalkan warna sebagai satu-satunya pembeda.
 */
export const CHART_SERIES = [
  "#2563EB", // biru
  "#0D9488", // teal
  "#EA580C", // oranye
  "#DB2777", // pink
  "#7C3AED", // violet
] as const;

/** Kategori "Lain-lain"/sisa sengaja abu — bukan identitas, jadi jangan diberi hue. */
export const CHART_OTHER = "#64748B";

/**
 * Warna status — DIKUNCI untuk arti, bukan untuk identitas seri.
 * Jangan dipakai sebagai "warna seri ke-6".
 */
export const STATUS_COLOR = {
  kritis: "#DC2626",
  waspada: "#D97706",
  aman: "#059669",
  kosong: "#94A3B8",
} as const;

/** Nilai literal permukaan terang — untuk prop yang butuh hex (recharts, SVG). */
export const SURFACE = {
  page: "#F2F3F5",
  card: "#FFFFFF",
  line: "#E4E8F0",
  ink: "#0F1A2E",
  inkSoft: "#44546F",
  inkMuted: "#8494AB",
} as const;

/** Gaya tooltip recharts — recharts butuh nilai literal, tidak bisa var CSS.
 *  Harus sejalan dengan token `--color-ink`/`--color-line` di globals.css. */
export const TOOLTIP_LIGHT = {
  background: "#FFFFFF",
  border: "1px solid #E4E8F0",
  borderRadius: 10,
  fontSize: 11,
  color: "#0F1A2E",
  boxShadow: "0 8px 24px -8px rgb(20 33 58 / 0.16)",
} as const;
