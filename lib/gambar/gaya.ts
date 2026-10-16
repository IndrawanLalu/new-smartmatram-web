/**
 * Gambar laporan SMART Mataram (PNG 1920×1080, `next/og`).
 * Patokan desain: proyek smart-video, `Prompt/Promt.md` + `Template Contoh.jpeg`.
 * Warna hanya di sini — komponen tidak menulis hex sendiri.
 */

export const G_LEBAR = 1920;
export const G_TINGGI = 1080;

/** Nama keluarga huruf — harus sama dengan `name` di `aset.ts`. */
export const HURUF = "Barlow";
export const HURUF_JUDUL = "Barlow Condensed";
export const HURUF_TANGAN = "Kalam";

export const C = {
  navyTua: "#071F4E",
  navy: "#0B3A86",
  biru: "#1565C0",
  biruTerang: "#2E8BEA",
  biruMuda: "#E6F0FB",
  biruLangit: "#D5E7F8",
  kuning: "#FFD400",
  putih: "#FFFFFF",
  tinta: "#0D2350",
  tintaLembut: "#4A5C7D",
  pudar: "#9AA8BF",
  garis: "#E3EAF4",
  zebra: "#F5F8FD",
  hijau: "#2E9E44",
  hijauTua: "#1B7A32",
  hijauMuda: "#EAF7EC",
  merah: "#E53935",
  merahTua: "#C62828",
  merahMuda: "#FDECEC",
  oranye: "#F57C00",
  oranyeTua: "#B45309",
  oranyeMuda: "#FFF4E5",
  amber: "#F2A900",
  kuningBintang: "#E2B400",
} as const;

/** Warna kepala kolom ★1–★5. */
export const WARNA_BINTANG = [C.merah, C.oranye, C.amber, C.kuningBintang, C.hijau] as const;

export const BULAN = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"];

/** "2026-10-16" → "16 Oktober 2026" */
export const tglPanjang = (iso: string) => {
  const [y, m, d] = iso.split("-").map(Number);
  return `${d} ${BULAN[m - 1]} ${y}`;
};

/** Rentang ringkas: "1–16 Oktober 2026", "28 September – 3 Oktober 2026". */
export const rentang = (dari: string, sampai: string) => {
  if (dari === sampai) return tglPanjang(dari);
  const [y1, m1, d1] = dari.split("-").map(Number);
  const [y2, m2, d2] = sampai.split("-").map(Number);
  if (y1 === y2 && m1 === m2) return `${d1}–${d2} ${BULAN[m2 - 1]} ${y2}`;
  if (y1 === y2) return `${d1} ${BULAN[m1 - 1]} – ${d2} ${BULAN[m2 - 1]} ${y2}`;
  return `${tglPanjang(dari)} – ${tglPanjang(sampai)}`;
};
