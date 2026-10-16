/**
 * Daftar jenis gambar laporan — satu sumber untuk endpoint
 * `/api/gambar/[jenis]` dan pilihan di halaman Gambar Laporan.
 * Jenis baru: tambahkan di sini + di `JENIS_BUAT` (`buat.ts`).
 */

export const JENIS_LAPORAN = [
  { kunci: "rekap-kinerja", label: "Rekap Kinerja Pelayanan Teknik", keterangan: "11 jenis pekerjaan: WO, SLA, realisasi, capaian." },
  { kunci: "rating-yantek", label: "Rekap Rating Yantek per Petugas", keterangan: "Rating bintang 1–5 per petugas, dari data APKT." },
] as const;

export type JenisLaporan = (typeof JENIS_LAPORAN)[number]["kunci"];

/** Galat yang salahnya ada di permintaan (bulan belum mulai, data belum ada) — dijawab 400, bukan 500. */
export class GagalLaporan extends Error {}
