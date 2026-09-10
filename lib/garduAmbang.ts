// lib/garduAmbang.ts
//
// Ambang beban gardu dan bentuk data per jurusan.
//
// Naik ke `lib/` saat master gardu dipisah jadi halamannya sendiri: keduanya
// dipakai halaman Pengukuran Gardu, Master Gardu, dan Dashboard sekaligus.
// Selama tinggal di dalam salah satu halaman, halaman lain harus menjangkau ke
// dalam folder privat halaman itu — dan yang pertama kali dipindah akan
// memutus yang lain tanpa ada yang menduga.
//
// `usePengukuranGardu` masih mengekspornya kembali supaya puluhan pemakainya
// tidak perlu ikut diubah.

export const OVERLOAD_PCT = 80;
export const UNDERLOAD_PCT = 20;
export const HIGH_CURRENT_A = 160;
export const HIGH_TEMP_C = 60;

/** Satu jurusan gardu sebagaimana tersimpan di `pengukuran_gardu.perjurusan`. */
export interface JurusanData {
  arus: { R: number; S: number; T: number; N: number };
  tegangan: { R: number; S: number; T: number };
}
