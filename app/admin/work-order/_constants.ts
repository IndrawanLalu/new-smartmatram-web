import type { WoColumnType, WoStage } from "./_types";

/** Tampilan badge per tahap alur persetujuan. */
export const STAGE_CONFIG: Record<WoStage, { label: string; cls: string; dot: string }> = {
  Belum:        { label: "Belum",        cls: "bg-gray-100 text-gray-500",   dot: "bg-gray-400" },
  Dikerjakan:   { label: "Dikerjakan",   cls: "bg-blue-50 text-blue-700",    dot: "bg-blue-500" },
  Diverifikasi: { label: "Diverifikasi", cls: "bg-cyan-50 text-cyan-700",    dot: "bg-cyan-500" },
  Disetujui:    { label: "Disetujui",    cls: "bg-green-50 text-green-700",  dot: "bg-green-500" },
};

export const MONTHS: { value: number; label: string }[] = [
  { value: 1, label: "Januari" },
  { value: 2, label: "Februari" },
  { value: 3, label: "Maret" },
  { value: 4, label: "April" },
  { value: 5, label: "Mei" },
  { value: 6, label: "Juni" },
  { value: 7, label: "Juli" },
  { value: 8, label: "Agustus" },
  { value: 9, label: "September" },
  { value: 10, label: "Oktober" },
  { value: 11, label: "November" },
  { value: 12, label: "Desember" },
];

export const monthLabel = (m: number) =>
  MONTHS.find((x) => x.value === m)?.label ?? String(m);

/** Tebak tipe kolom dari nama header. */
export function guessType(header: string): WoColumnType {
  const h = header.toLowerCase();
  if (/tgl|tanggal|date|waktu/.test(h)) return "date";
  if (/jml|jumlah|qty|target|beban|kva|persen|nilai|volume|panjang/.test(h)) return "number";
  return "text";
}

/** Cari kolom yang paling mungkin berisi nama regu/pelaksana. Return key "c{i}" atau null. */
export function guessReguCol(headers: string[]): string | null {
  const i = headers.findIndex((h) => /regu|pelaksana|eksekutor|tim|petugas/i.test(h));
  return i >= 0 ? `c${i}` : null;
}

/** Cari kolom untuk judul kartu di mobile (uraian pekerjaan). */
export function guessTitleCol(headers: string[]): string | null {
  const i = headers.findIndex((h) =>
    /uraian|pekerjaan|kegiatan|judul|deskripsi|nama/i.test(h),
  );
  return i >= 0 ? `c${i}` : null;
}

/** Cari kolom ukuran/volume (panjang kms) untuk realisasi berbasis volume. */
export function guessMeasureCol(headers: string[]): string | null {
  const i = headers.findIndex((h) => /panjang|kms|\bkm\b|volume|meter|jaringan/i.test(h));
  return i >= 0 ? `c${i}` : null;
}

/** Format angka gaya Indonesia (mis. 12.345 → "12,345"). */
export const formatNumberId = (n: number) =>
  n.toLocaleString("id-ID", { maximumFractionDigits: 3 });

/** Cari kolom verifikator (role pemverifikasi). */
export function guessVerifierCol(headers: string[]): string | null {
  const i = headers.findIndex((h) => /verif|koordinator|pengawas|pemeriksa|approv/i.test(h));
  return i >= 0 ? `c${i}` : null;
}

/** Cocokkan nilai bebas ke salah satu role eksekutor yang tersedia (uppercase contains). */
export function autoMatchRole(value: string, roleCodes: string[]): string {
  const v = value.toUpperCase().replace(/\s+/g, "");
  return roleCodes.find((r) => v.includes(r.toUpperCase())) ?? "";
}
