import type { StatusRabas } from "../_hooks/useDaftarPerabasan";

export const NADA_STATUS: Record<StatusRabas, string> = {
  "Belum ditugaskan": "bg-red-50 text-red-700 border-red-200",
  Dijadwalkan: "bg-slate-100 text-slate-600 border-slate-200",
  "Dalam proses": "bg-sky-50 text-sky-700 border-sky-200",
  "Menunggu verifikasi": "bg-amber-50 text-amber-700 border-amber-200",
  Dikembalikan: "bg-orange-50 text-orange-700 border-orange-200",
  Diverifikasi: "bg-emerald-50 text-emerald-700 border-emerald-200",
  Dibatalkan: "bg-gray-100 text-gray-500 border-gray-200",
};

const BLN = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];

export const tanggal = (iso: string | null | undefined) => {
  if (!iso) return "—";
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  return `${d} ${BLN[m - 1]} ${y}`;
};

/**
 * Tanggal pekerjaan sebagai rentang (keputusan user 24 Sep 2026):
 *   satu hari        → "12 Sep 2026"
 *   bulan yang sama  → "12–14 Sep 2026"
 *   lintas bulan     → "30 Agu – 2 Sep 2026"
 *   belum selesai    → "12 Sep 2026 – …"
 */
export function rentangKerja(mulai: string | null, selesai: string | null): string {
  if (!mulai && !selesai) return "—";
  if (!mulai) return tanggal(selesai);
  if (!selesai) return `${tanggal(mulai)} – …`;
  if (mulai === selesai) return tanggal(mulai);
  const [y1, m1, d1] = mulai.split("-").map(Number);
  const [y2, m2, d2] = selesai.split("-").map(Number);
  if (y1 === y2 && m1 === m2) return `${d1}–${d2} ${BLN[m2 - 1]} ${y2}`;
  if (y1 === y2) return `${d1} ${BLN[m1 - 1]} – ${d2} ${BLN[m2 - 1]} ${y2}`;
  return `${tanggal(mulai)} – ${tanggal(selesai)}`;
}

export const km = (v: number | null) => (v === null ? "—" : `${v.toFixed(2)} km`);
