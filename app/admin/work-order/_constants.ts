import type { WoColumnType, WoStage } from "./_types";

/**
 * Tampilan badge per tahap. Netral → navy → teal → hijau:
 * navy = sedang berjalan (warna primary), teal = aksen pemeriksaan,
 * hijau = status akhir (satu-satunya pemakaian hijau yang sah di modul ini).
 */
export const STAGE_CONFIG: Record<WoStage, { label: string; cls: string; dot: string }> = {
  Belum:        { label: "Belum",        cls: "bg-slate-100 text-ink-soft",       dot: "bg-ink-muted" },
  Dikerjakan:   { label: "Dikerjakan",   cls: "bg-navy-50 text-navy-600",         dot: "bg-navy-400" },
  Diverifikasi: { label: "Diverifikasi", cls: "bg-accent-tint text-accent-deep",  dot: "bg-accent" },
  Disetujui:    { label: "Disetujui",    cls: "bg-green-50 text-green-700",       dot: "bg-green-600" },
};

/** Urutan tahap dari awal ke akhir — dipakai chip filter, funnel, dan kolom Kanban. */
export const STAGE_ORDER: WoStage[] = ["Belum", "Dikerjakan", "Diverifikasi", "Disetujui"];

/**
 * Ramp ordinal satu-hue (terang → gelap) untuk tahap berurutan.
 * Lolos validate_palette.js --ordinal: lightness monoton, jarak antar-langkah
 * ≥0.06, ujung terang 2,32:1 vs surface, sebaran hue 1°.
 */
export const STAGE_RAMP = ["#8FA8DC", "#5878C4", "#2A4A9C", "#14264F"];

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

/** Format angka gaya Indonesia — titik ribuan, koma desimal (12345.6 → "12.345,6"). */
export const formatNumberId = (n: number) =>
  n.toLocaleString("id-ID", { maximumFractionDigits: 3 });

/** "2026-07-29T04:05:00Z" → "29/07/2026 12:05" */
export const fmtDateTime = (iso: string | null) => {
  if (!iso) return "-";
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}`;
};

/** "2026-07-29" → "29/07/2026" */
export const fmtDate = (iso: string | null) => {
  if (!iso) return "-";
  const [y, m, d] = iso.slice(0, 10).split("-");
  return `${d}/${m}/${y}`;
};

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
