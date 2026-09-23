import type { CatatanOptimasi, StatusTabel } from "../_hooks/useOptimasiTrafo";

/** Dipakai tabel dan modal detail — satu sumber, supaya warnanya tidak melenceng. */
export const NADA_STATUS: Record<StatusTabel, string> = {
  "Belum dikerjakan": "bg-slate-100 text-slate-600 border-slate-200",
  "Menunggu verifikasi": "bg-amber-50 text-amber-700 border-amber-200",
  Diverifikasi: "bg-emerald-50 text-emerald-700 border-emerald-200",
  Dibatalkan: "bg-gray-100 text-gray-500 border-gray-200",
};

export const tanggal = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleDateString("id-ID", { day: "2-digit", month: "short", year: "numeric" }) : "—";

/** Ambang warna sama dengan tab Tindak Lanjut Anomali di Pengukuran Gardu. */
export const nadaPersen = (p: number | null) =>
  p === null ? "text-ink-muted" : p >= 80 ? "text-red-600 font-bold" : p >= 60 ? "text-amber-600 font-semibold" : "text-emerald-700 font-semibold";

export const persen = (p: number | null) => (p === null ? "—" : `${Math.round(p)}%`);

export const teksAsal = (c: CatatanOptimasi) =>
  c.asal === "GARDU" ? `gardu ${c.asalKode} (${c.asalUlp})` : "gudang";

export const teksTujuan = (c: CatatanOptimasi) =>
  c.tujuan === "GARDU" ? `gardu ${c.tujuanKode} (${c.tujuanUlp})` : c.tujuan.toLowerCase();
