/**
 * Versi kecil foto Supabase Storage untuk gambar mini.
 *
 * Foto lapangan 3072x4096 — 12,6 megapiksel. Kompresi menekan ukuran BERKAS;
 * yang membuat browser berat adalah jumlah PIKSEL yang harus dibongkar. Empat
 * belas foto berarti 176 megapiksel dan sekitar 700 MB bitmap di memori, hanya
 * untuk digambar setinggi 80 piksel. Tampilan ukuran penuh tetap memakai
 * berkas aslinya.
 *
 * Diperkecil oleh SERVER WEB KITA (pengecil gambar bawaan Next.js, `sharp`,
 * hasilnya di-cache), bukan oleh Supabase. Dulu lewat `render/image` Supabase,
 * yang jatahnya cuma 100 foto sumber per bulan di paket Pro — habis 5 Okt 2026
 * dan gambar mini berhenti tampil (spend cap aktif).
 *
 * Lebar & mutu harus terdaftar di `next.config.ts` (`images.imageSizes`,
 * `images.qualities`), dan host-nya di `images.remotePatterns`.
 */

/** Sama dengan `images.imageSizes` di next.config.ts. */
const LEBAR = [32, 48, 64, 96, 120, 128, 160, 240, 256, 384];
const MUTU = 65;

export const fotoKecil = (url: string, lebar: number) => {
  if (!url.includes("/storage/v1/object/public/")) return url; // mis. foto lama Firebase
  const w = LEBAR.find((x) => x >= lebar) ?? LEBAR[LEBAR.length - 1];
  return `/_next/image?url=${encodeURIComponent(url)}&w=${w}&q=${MUTU}`;
};
