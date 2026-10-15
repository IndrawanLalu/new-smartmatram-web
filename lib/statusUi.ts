/**
 * Status → nada warna, SATU sumber untuk semua halaman (rencana-ui-baru.md §3).
 *
 * Lima nada, satu arti per nada — modul tidak memilih warna statusnya sendiri:
 *   selesai  hijau  pekerjaan tuntas & diterima
 *   proses   biru   dijadwalkan / sedang dikerjakan
 *   tunggu   amber  menunggu orang lain (verifikasi, persetujuan)
 *   masalah  merah  perlu tindakan: dikembalikan, belum ditugaskan, lewat SLA
 *   netral   abu    dibatalkan / tidak berlaku
 */

export type NadaStatus = "selesai" | "proses" | "tunggu" | "masalah" | "netral";

export const NADA_UI: Record<NadaStatus, { pil: string; titik: string; teks: string }> = {
  selesai: { pil: "bg-emerald-50 text-emerald-700 border-emerald-200", titik: "bg-emerald-500", teks: "text-emerald-700" },
  proses: { pil: "bg-sky-50 text-sky-700 border-sky-200", titik: "bg-sky-500", teks: "text-sky-700" },
  tunggu: { pil: "bg-amber-50 text-amber-700 border-amber-200", titik: "bg-amber-500", teks: "text-amber-700" },
  masalah: { pil: "bg-red-50 text-red-700 border-red-200", titik: "bg-red-500", teks: "text-red-700" },
  netral: { pil: "bg-slate-100 text-slate-600 border-slate-200", titik: "bg-slate-400", teks: "text-slate-600" },
};

/** Label status yang dipakai di aplikasi → nadanya. Label baru DITAMBAHKAN di
 *  sini, bukan diberi warna di modulnya. */
const PETA: Record<string, NadaStatus> = {
  Selesai: "selesai",
  Diverifikasi: "selesai",
  Disetujui: "selesai",
  Dijadwalkan: "proses",
  "Dalam proses": "proses",
  "Dalam Proses": "proses",
  Ditugaskan: "proses",
  "Menunggu verifikasi": "tunggu",
  "Belum disetujui": "tunggu",
  "Menunggu persetujuan": "tunggu",
  Dikembalikan: "masalah",
  Ditolak: "masalah",
  "Belum ditugaskan": "masalah",
  "Lewat SLA": "masalah",
  Tertunda: "masalah",
  Dibatalkan: "netral",
};

export const nadaStatus = (label: string): NadaStatus => PETA[label] ?? "netral";
