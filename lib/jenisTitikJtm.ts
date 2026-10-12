/**
 * Jenis titik pangkal/ujung segmen JTM — DIAMBIL dari "Pangkal segmen" (GI,
 * PLTD, GH …; 12 Okt 2026) dan "Penanda tiang" di Pengaturan JTM (koreksi user
 * 6 Okt 2026), ditambah yang bukan peralatan. Aturannya sama dengan database
 * (`scripts/jtm-jenis-titik-penanda.sql`, `scripts/jtm-pangkal-segmen.sql`):
 *
 *   kode titik  = kode dibesarkan; 'recloser' tetap 'REC' (nama lama)
 *   label       = peralatan bertitik ("LBSM. SAMPOERNA"); pangkal & TIANG/
 *                 GARDU/AKHIR berspasi ("GI AMPENAN", "GH GOMONG")
 *   memotong    = semua, kecuali PENG/TIANG/GARDU/UJUNG/AKHIR
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

const BERSPASI = new Set(["TIANG", "GARDU", "UJUNG", "AKHIR"]);
const TIDAK_MEMOTONG = new Set(["PENG", "TIANG", "GARDU", "UJUNG", "AKHIR"]);
/** Sebelum `jtm-pangkal-segmen.sql` dijalankan (daftar pangkal kosong). */
const PANGKAL_BAWAAN: PenandaRef[] = [
  { kode: "gi", label: "GI", aktif: true },
  { kode: "pltd", label: "PLTD", aktif: true },
];

/** Kode titik semua pangkal — aktif atau tidak: segmen lama tetap ditulis
 *  berspasi walau pangkalnya sudah dinonaktifkan. */
export const kodePangkal = (pangkal: PenandaRef[]) =>
  new Set(["GI", "PLTD", ...pangkal.map((p) => p.kode.toUpperCase())]);
const PANGKAL_TETAP = kodePangkal([]);

export const kodeTitik = (penanda: string) =>
  penanda.trim().toLowerCase() === "recloser" ? "REC" : penanda.trim().toUpperCase();

export const labelTitik = (jenis: string, nama: string, pangkal: Set<string> = PANGKAL_TETAP) => {
  const n = nama.trim().toUpperCase();
  if ((jenis === "UJUNG" || jenis === "AKHIR") && !n) return jenis;
  return BERSPASI.has(jenis) || pangkal.has(jenis) ? `${jenis} ${n}`.trim() : `${jenis}. ${n}`;
};

/** Pilihan jenis titik: Pangkal segmen yang aktif (GI, PLTD, GH …), Penanda
 *  tiang yang aktif, Tiang percabangan, Akhir segmen — dan "Ujung belum
 *  ditutup" bila diminta (segmen manual). */
export function susunJenisTitik(
  penanda: PenandaRef[],
  pangkal: PenandaRef[],
  opsi: { denganUjung?: boolean } = {},
): JenisTitik[] {
  const daftar: JenisTitik[] = [
    ...(pangkal.length > 0 ? pangkal : PANGKAL_BAWAAN)
      .filter((p) => p.aktif)
      .map((p) => ({ kode: p.kode.toUpperCase(), label: p.label, memotong: true })),
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
