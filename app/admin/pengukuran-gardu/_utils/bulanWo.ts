/**
 * Bulan WO untuk WO dari anomali pengukuran — disimpan sebagai tanggal 1
 * bulannya (`pengukuran_gardu.wo_bulan`, `scripts/wo-bulan-anomali.sql`).
 * Rekap Kinerja dan lampiran surat membaca bulan ini, bukan tanggal tombol
 * WO ditekan.
 */

const NAMA_BULAN = [
  "Januari", "Februari", "Maret", "April", "Mei", "Juni",
  "Juli", "Agustus", "September", "Oktober", "November", "Desember",
];

export interface PilihanBulanWo {
  /** "YYYY-MM-01" */
  nilai: string;
  label: string;
}

const dua = (n: number) => String(n).padStart(2, "0");

export const nilaiBulanWo = (tahun: number, bulan: number) => `${tahun}-${dua(bulan)}-01`;

/** "2026-10-01" → "Oktober 2026". */
export function labelBulanWo(nilai: string | null): string {
  if (!nilai) return "—";
  const [y, m] = nilai.split("-").map(Number);
  return `${NAMA_BULAN[m - 1]} ${y}`;
}

/** Bulan ini dan bulan depan, ditambah bulan WO yang sudah tersimpan bila di
 *  luar keduanya — supaya menyunting jenis WO lama tidak diam-diam memindah
 *  bulannya. */
export function pilihanBulanWo(tersimpan: string | null = null): PilihanBulanWo[] {
  const kini = new Date();
  const depan = kini.getMonth() === 11
    ? nilaiBulanWo(kini.getFullYear() + 1, 1)
    : nilaiBulanWo(kini.getFullYear(), kini.getMonth() + 2);
  const semua = [...new Set([tersimpan, bulanWoIni(), depan].filter((x): x is string => !!x))].sort();
  return semua.map((nilai) => ({ nilai, label: labelBulanWo(nilai) }));
}

export function bulanWoIni(): string {
  const kini = new Date();
  return nilaiBulanWo(kini.getFullYear(), kini.getMonth() + 1);
}
