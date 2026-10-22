/** Kotak foto di kolom kanan gambar survey PDF (pt): lebar & tinggi paling besar. */
export const FOTO_PDF_W = 125;
export const FOTO_PDF_H = 120;

/** Foto siap PDF: data URL (sudah bertanda) + perbandingan lebar/tinggi + keterangannya. */
export interface FotoPdf {
  src: string;
  rasio: number;
  ket: string;
  nomor: number;
}

/** Ukuran foto UTUH yang muat di kotak FOTO_PDF_W × FOTO_PDF_H. */
export const ukuranFotoPdf = (rasio: number) =>
  rasio >= FOTO_PDF_W / FOTO_PDF_H
    ? { width: FOTO_PDF_W, height: FOTO_PDF_W / rasio }
    : { width: FOTO_PDF_H * rasio, height: FOTO_PDF_H };
