/**
 * Versi kecil foto Supabase Storage untuk gambar mini (render/image).
 *
 * Foto lapangan 3072x4096 — 12,6 megapiksel. Kompresi menekan ukuran BERKAS;
 * yang membuat browser berat adalah jumlah PIKSEL yang harus dibongkar. Empat
 * belas foto berarti 176 megapiksel dan sekitar 700 MB bitmap di memori, hanya
 * untuk digambar setinggi 80 piksel. Tampilan ukuran penuh tetap memakai
 * berkas aslinya.
 */
export const fotoKecil = (url: string, lebar: number) =>
  url.includes("/object/public/")
    ? `${url.replace("/object/public/", "/render/image/public/")}?width=${lebar}&quality=65`
    : url;
