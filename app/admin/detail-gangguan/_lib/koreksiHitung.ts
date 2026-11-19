// Hitungan koreksi waktu kode G — dipakai modal Koreksi (satu laporan) dan
// koreksi massal dengan durasi default (banyak laporan), supaya keduanya
// tidak mungkin menghasilkan waktu yang berbeda untuk isian yang sama.

import { STEPS } from "../_components/koreksiSettings";

export interface GangguanWaktu {
  no_laporan?: string;
  ulp?: string | null;
  waktu_lapor?: string;
  durasi_response_time?: number | null;
  durasi_recovery_time?: number | null;
}

// "04/06/2026 9:12:46" → Date
export function parseDt(s: string | undefined): Date | null {
  if (!s) return null;
  const [datePart, timePart = "0:0:0"] = s.trim().split(" ");
  const [d, m, y] = datePart.split("/").map(Number);
  const [hh = 0, mm = 0, ss = 0] = timePart.split(":").map(Number);
  if (!y || !m || !d) return null;
  return new Date(y, m - 1, d, hh, mm, ss);
}

export function fmtDt(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

const LABEL_LANGKAH = ["Penugasan", "Perjalanan", "Pengerjaan", "Nyala Sementara", "Nyala", "Selesai"];

/** Timestamp terkoreksi kumulatif dari waktu lapor. */
export function hitungLangkah(lapor: Date, durs: number[]): { label: string; date: Date }[] {
  let cur = lapor;
  return durs.map((m, i) => {
    cur = new Date(cur.getTime() + (Number(m) || 0) * 60000);
    return { label: LABEL_LANGKAH[i], date: cur };
  });
}

/** "Tidak perlu koreksi" (istilah user 19 Nov 2026): laporan tanpa waktu response
 *  ATAU recovery dari APKT — Dibatalkan, Selesai (PEMADAMAN MELUAS / GANGGUAN
 *  SISTEM / PEMADAMAN TERENCANA). Tidak ada waktu yang bisa dikoreksi, jadi
 *  tidak dihitung sebagai pekerjaan koreksi yang tersisa. */
export function perluKoreksi(row: GangguanWaktu): boolean {
  return Number(row.durasi_response_time) > 0 && Number(row.durasi_recovery_time) > 0;
}

/** RPT/RCT sebelum (durasi APKT dalam DETIK → menit) dan sesudah koreksi. */
export function bandingRptRct(row: GangguanWaktu, durs: number[]) {
  const n = (i: number) => Number(durs[i]) || 0;
  const rptAfter = n(0) + n(1) + n(2);
  return {
    rptBefore: (Number(row.durasi_response_time) || 0) / 60,
    rctBefore: (Number(row.durasi_recovery_time) || 0) / 60,
    rptAfter,
    rctAfter: rptAfter + n(3) + n(4),
  };
}

/** Baris `apkt_koreksi` siap disimpan; null bila waktu lapor tidak terbaca. */
export function bangunKoreksi(row: GangguanWaktu, durs: number[], korektor: string) {
  const lapor = parseDt(row.waktu_lapor);
  if (!lapor || !row.no_laporan) return null;
  const s = hitungLangkah(lapor, durs).map((x) => fmtDt(x.date));
  const b = bandingRptRct(row, durs);
  return {
    no_laporan: row.no_laporan,
    ulp: row.ulp || "AMPENAN",
    waktu_lapor: row.waktu_lapor ?? null,
    tgl_penugasan: s[0],
    tgl_perjalanan: s[1],
    tgl_pengerjaan: s[2],
    tgl_nyala_sementara: s[3],
    tgl_nyala: s[4],
    tgl_selesai: s[5],
    ...Object.fromEntries(STEPS.map((st, i) => [st.key, durs[i]])),
    rpt_asli: b.rptBefore,
    rct_asli: b.rctBefore,
    rpt_koreksi: b.rptAfter,
    rct_koreksi: b.rctAfter,
    korektor: korektor.trim() || null,
  };
}

/** Keputusan user 19 Nov 2026: koreksi TIDAK boleh dilakukan bila RPT atau RCT
 *  sebelum lebih kecil daripada sesudah koreksi. Berlaku di modal, koreksi
 *  massal, dan antrean APKT. Mengembalikan alasan, atau null bila boleh. */
export function alasanTolak(
  b: { rptBefore: number; rctBefore: number; rptAfter: number; rctAfter: number },
  minRpt = 0,
): string | null {
  const r = (n: number) => Math.round(n);
  // Batas dari Pengaturan Default (keputusan user 19 Nov): hanya RPT asli DI ATAS
  // batas yang dikoreksi. RCT tidak berbatas — cukup tidak lebih lama sesudah koreksi.
  if (minRpt > 0 && b.rptBefore <= minRpt) {
    return `RPT asli ${r(b.rptBefore)} menit, tidak di atas batas ${r(minRpt)} menit`;
  }
  const s: string[] = [];
  if (b.rptBefore < b.rptAfter) s.push(`RPT ${r(b.rptBefore)} → ${r(b.rptAfter)} menit`);
  if (b.rctBefore < b.rctAfter) s.push(`RCT ${r(b.rctBefore)} → ${r(b.rctAfter)} menit`);
  return s.length ? `Waktu asli sudah lebih cepat (${s.join(", ")})` : null;
}

/** Alasan tolak untuk koreksi yang SUDAH tersimpan (kolom rpt/rct_asli & _koreksi, menit). */
export function alasanTolakTersimpan(
  k: { rpt_asli?: number | null; rct_asli?: number | null; rpt_koreksi?: number | null; rct_koreksi?: number | null },
  minRpt = 0,
) {
  return alasanTolak({
    rptBefore: Number(k.rpt_asli) || 0,
    rctBefore: Number(k.rct_asli) || 0,
    rptAfter: Number(k.rpt_koreksi) || 0,
    rctAfter: Number(k.rct_koreksi) || 0,
  }, minRpt);
}

export type StatusKoreksi = "sudah" | "antrian" | "tidak" | "belum";

export interface AturanKoreksi {
  durs: number[];
  minRpt: number;
}

/**
 * Status koreksi satu laporan Non CT — SATU-SATUNYA sumber untuk tabel, Rekap,
 * dan Dashboard, supaya ketiganya tidak mungkin menghitung berbeda.
 *   sudah   = tersimpan di APKT ("Sudah dikoreksi")
 *   antrian = dikoreksi di Smart, belum di APKT ("Masuk antrian")
 *   tidak   = "Tidak perlu koreksi" (keputusan user 19 Nov): tanpa waktu
 *             response/recovery, waktu aslinya sudah lebih cepat dari koreksi,
 *             atau RPT asli tidak di atas batas. Termasuk koreksi tersimpan yang
 *             tidak lolos lagi (mis. batas RPT dinaikkan belakangan).
 *   belum   = perlu dikoreksi, belum dikerjakan
 * Bergantung pada durasi default & batas RPT di Pengaturan (per browser).
 */
export function statusKoreksi(
  row: GangguanWaktu,
  kor: { apkt_masuk_at?: string | null; rpt_asli?: number | null; rct_asli?: number | null; rpt_koreksi?: number | null; rct_koreksi?: number | null } | undefined,
  aturan: AturanKoreksi,
): { status: StatusKoreksi; alasan: string | null } {
  if (kor?.apkt_masuk_at) return { status: "sudah", alasan: null };
  if (!perluKoreksi(row)) return { status: "tidak", alasan: "Tidak ada waktu response/recovery di APKT" };
  if (kor) {
    const a = alasanTolakTersimpan(kor, aturan.minRpt);
    return a ? { status: "tidak", alasan: a } : { status: "antrian", alasan: null };
  }
  const a = alasanTolak(bandingRptRct(row, aturan.durs), aturan.minRpt);
  return a ? { status: "tidak", alasan: a } : { status: "belum", alasan: null };
}
