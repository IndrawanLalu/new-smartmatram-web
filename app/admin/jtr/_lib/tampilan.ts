import type { StatusJtr } from "../_hooks/useApprovalJtr";

export const NADA_STATUS: Record<StatusJtr, string> = {
  Dijadwalkan: "bg-slate-100 text-slate-600 border-slate-200",
  "Sedang diinspeksi": "bg-sky-50 text-sky-700 border-sky-200",
  "Menunggu persetujuan": "bg-amber-50 text-amber-700 border-amber-200",
  Dikembalikan: "bg-orange-50 text-orange-700 border-orange-200",
  Disetujui: "bg-emerald-50 text-emerald-700 border-emerald-200",
  Dibatalkan: "bg-gray-100 text-gray-500 border-gray-200",
};

const BLN = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];

export const tgl = (iso: string | null | undefined) => {
  if (!iso) return "—";
  const t = new Date(iso);
  return `${t.getDate()} ${BLN[t.getMonth()]} ${t.getFullYear()}`;
};

/** Mulai → selesai sebagai rentang, sama dengan modul Kinerja lain. */
export function rentangKerja(mulai: string | null, selesai: string | null) {
  if (!mulai && !selesai) return "—";
  if (!mulai) return tgl(selesai);
  if (!selesai) return `${tgl(mulai)} – …`;
  const a = new Date(mulai);
  const b = new Date(selesai);
  if (a.toDateString() === b.toDateString()) return tgl(selesai);
  if (a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth()) {
    return `${a.getDate()}–${b.getDate()} ${BLN[b.getMonth()]} ${b.getFullYear()}`;
  }
  return `${tgl(mulai)} – ${tgl(selesai)}`;
}

export const km = (v: number | null | undefined, digit = 2) =>
  `${Number(v ?? 0).toFixed(digit).replace(".", ",")} km`;
