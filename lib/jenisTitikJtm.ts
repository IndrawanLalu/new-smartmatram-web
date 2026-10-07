/**
 * Jenis titik pangkal/ujung segmen JTM — DIAMBIL dari "Penanda tiang" di
 * Pengaturan JTM (koreksi user 6 Okt 2026), ditambah yang bukan peralatan.
 * Aturannya sama dengan database (`scripts/jtm-jenis-titik-penanda.sql`):
 *
 *   kode titik  = kode penanda dibesarkan; 'recloser' tetap 'REC' (nama lama)
 *   label       = peralatan bertitik ("LBSM. SAMPOERNA"), GI/PLTD/TIANG/GARDU/
 *                 AKHIR berspasi ("GI AMPENAN")
 *   memotong    = semua peralatan, kecuali PENG/TIANG/GARDU/UJUNG/AKHIR
 *
 * 'UJUNG' = segmen yang masih dirintis (belum ditutup), bukan sebuah tempat.
 * 'AKHIR' = segmen ditutup di tiang ujung jaringan.
 */

export interface JenisTitik {
  kode: string;
  label: string;
  memotong: boolean;
}

interface PenandaRef {
  kode: string;
  label: string;
  aktif: boolean;
}

const BERSPASI = new Set(["GI", "PLTD", "TIANG", "GARDU", "UJUNG", "AKHIR"]);
const TIDAK_MEMOTONG = new Set(["PENG", "TIANG", "GARDU", "UJUNG", "AKHIR"]);

export const kodeTitik = (penanda: string) =>
  penanda.trim().toLowerCase() === "recloser" ? "REC" : penanda.trim().toUpperCase();

export const labelTitik = (jenis: string, nama: string) => {
  const n = nama.trim().toUpperCase();
  if ((jenis === "UJUNG" || jenis === "AKHIR") && !n) return jenis;
  return BERSPASI.has(jenis) ? `${jenis} ${n}`.trim() : `${jenis}. ${n}`;
};

/** Pilihan jenis titik: GI, PLTD, Penanda tiang yang aktif, Tiang percabangan,
 *  Akhir segmen — dan "Ujung belum ditutup" bila diminta (segmen manual). */
export function susunJenisTitik(penanda: PenandaRef[], opsi: { denganUjung?: boolean } = {}): JenisTitik[] {
  const daftar: JenisTitik[] = [
    { kode: "GI", label: "GI", memotong: true },
    { kode: "PLTD", label: "PLTD", memotong: true },
    ...penanda
      .filter((p) => p.aktif)
      .map((p) => ({ kode: kodeTitik(p.kode), label: p.label, memotong: !TIDAK_MEMOTONG.has(kodeTitik(p.kode)) })),
    { kode: "TIANG", label: "Tiang percabangan", memotong: false },
    { kode: "AKHIR", label: "Akhir segmen", memotong: false },
    ...(opsi.denganUjung ? [{ kode: "UJUNG", label: "Ujung belum ditutup", memotong: false }] : []),
  ];
  return [...new Map(daftar.map((j) => [j.kode, j])).values()];
}

/** Penanda tiang untuk sebuah jenis titik (REC → recloser), null bila bukan penanda. */
export const penandaDariTitik = (jenis: string, penanda: PenandaRef[]) =>
  penanda.find((p) => kodeTitik(p.kode) === jenis)?.kode ?? null;
