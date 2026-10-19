/**
 * Daftar jenis gambar laporan — satu sumber untuk endpoint
 * `/api/gambar/[jenis]` dan pilihan di halaman Gambar Laporan.
 * Jenis baru: tambahkan di sini + di `JENIS_BUAT` (`buat.ts`).
 *
 * `per`: "bulan" = satu ULP satu bulan; "tanggal" = semua ULP satu tanggal
 * (hanya UP3 — isinya keempat ULP).
 */

export const JENIS_LAPORAN = [
  { kunci: "rekap-kinerja", label: "Rekap Kinerja Pelayanan Teknik", keterangan: "11 jenis pekerjaan: WO, SLA, realisasi, capaian.", per: "bulan" },
  { kunci: "rating-yantek", label: "Rekap Rating Yantek per Petugas", keterangan: "Rating bintang 1–5 per petugas, dari data APKT.", per: "bulan" },
  { kunci: "realisasi-harian", label: "Realisasi Harian SMART Mataram", keterangan: "11 jenis pekerjaan × 4 ULP: hari itu dan total bulan berjalan.", per: "tanggal" },
] as const;

export type JenisLaporan = (typeof JENIS_LAPORAN)[number]["kunci"];

/** Satu permintaan gambar. Jenis "per tanggal" memakai `tgl` (ulp = "SEMUA"); jenis "per bulan" mengosongkannya. */
export interface Permintaan {
  ulp: string;
  tahun: number;
  bulan: number;
  /** YYYY-MM-DD */
  tgl: string;
  halaman: number;
}

/** Galat yang salahnya ada di permintaan (bulan belum mulai, data belum ada) — dijawab 400, bukan 500. */
export class GagalLaporan extends Error {}
