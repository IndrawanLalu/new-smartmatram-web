/** Kotak foto di kolom kanan gambar survey PDF (pt) — dipakai juga untuk memotong foto bertanda. */
export const FOTO_PDF_W = 125;
export const FOTO_PDF_H = 88;
export const RASIO_FOTO_PDF = FOTO_PDF_W / FOTO_PDF_H;

/** Foto siap PDF: data URL (sudah bertanda) + keterangannya. */
export interface FotoPdf {
  src: string;
  ket: string;
  nomor: number;
}
