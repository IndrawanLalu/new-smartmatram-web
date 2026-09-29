import { parseClipboardTable } from "@/lib/parseClipboardTable";
import { parseLocaleNumber } from "@/lib/parseLocaleNumber";
import { isoTgl } from "./woSurat";

/**
 * Tempelan WO manual dari Excel rencana kerja. Kolom dikenali dari JUDULNYA,
 * bukan dari posisinya — user masih mengevaluasi kolom-kolomnya (29 Sep 2026),
 * dan format tiap ULP tidak persis sama. Baris pertama tempelan wajib judul.
 */

export interface BarisTempel {
  objek: string;
  alamat: string | null;
  penyulang: string | null;
  km: number | null;
  kva: number | null;
  uraian: string | null;
  keterangan: string | null;
  pelaksana: string | null;
  tgl_rencana: string | null;
}

type Kolom = keyof BarisTempel;

/** Urutan penting: yang lebih khusus diperiksa lebih dulu. */
const POLA: [Kolom, RegExp][] = [
  ["uraian", /uraian|pekerjaan/i],
  ["kva", /kva|daya/i],
  ["km", /\bkms?\b|panjang/i],
  ["tgl_rencana", /tanggal|tgl|rencana/i],
  ["pelaksana", /pelaksana|regu|petugas/i],
  ["keterangan", /ket|tier/i],
  ["penyulang", /penyulang|feeder/i],
  ["objek", /gardu|segmen|segment|section|kode|objek/i],
  ["alamat", /alamat|nama|lokasi/i],
];

export interface HasilTempel {
  baris: BarisTempel[];
  /** Judul kolom yang dikenali — ditampilkan supaya user bisa memeriksa. */
  dikenali: Partial<Record<Kolom, string>>;
  galat: string | null;
}

/** "3/8/2026", "03-08-2026", "2026-08-03", nomor seri Excel, atau hanya "3". */
function bacaTanggal(s: string, tahun: number, bulan: number): string | null {
  const t = s.trim();
  if (!t) return null;
  let m = t.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return isoTgl(+m[1], +m[2], +m[3]);
  m = t.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})$/);
  if (m) return isoTgl(m[3].length === 2 ? 2000 + +m[3] : +m[3], +m[2], +m[1]);
  if (/^\d{1,2}$/.test(t) && +t >= 1 && +t <= 31) return isoTgl(tahun, bulan, +t);
  if (/^\d{5}$/.test(t)) {
    const d = new Date(Date.UTC(1899, 11, 30) + +t * 86400000);
    return isoTgl(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate());
  }
  return null;
}

export function bacaTempelan(raw: string, tahun: number, bulan: number): HasilTempel {
  const { headers, rows } = parseClipboardTable(raw);
  const indeks: Partial<Record<Kolom, number>> = {};
  const dikenali: Partial<Record<Kolom, string>> = {};
  headers.forEach((h, i) => {
    if (!h || /^no\.?$/i.test(h)) return;
    const hit = POLA.find(([k, re]) => indeks[k] === undefined && re.test(h));
    if (hit) {
      indeks[hit[0]] = i;
      dikenali[hit[0]] = h;
    }
  });

  if (indeks.objek === undefined) {
    return {
      baris: [],
      dikenali,
      galat: "Kolom objek tidak ditemukan. Baris pertama harus judul kolom, misalnya “Gardu” atau “Segment”.",
    };
  }

  const sel = (r: string[], k: Kolom) => (indeks[k] === undefined ? "" : (r[indeks[k]!] ?? "").trim());
  const baris = rows
    .map((r) => ({
      objek: sel(r, "objek"),
      alamat: sel(r, "alamat") || null,
      penyulang: sel(r, "penyulang") || null,
      km: indeks.km === undefined ? null : parseLocaleNumber(sel(r, "km")),
      kva: indeks.kva === undefined ? null : parseLocaleNumber(sel(r, "kva")),
      uraian: sel(r, "uraian") || null,
      keterangan: sel(r, "keterangan") || null,
      pelaksana: sel(r, "pelaksana") || null,
      tgl_rencana: bacaTanggal(sel(r, "tgl_rencana"), tahun, bulan),
    }))
    // Baris jumlah di bawah tabel ("119,555 Kms") tidak punya objek.
    .filter((b) => b.objek && !/^(total|jumlah)/i.test(b.objek));

  return { baris, dikenali, galat: baris.length === 0 ? "Tidak ada baris data di bawah judul kolom." : null };
}

/** Tier dari kolom keterangan: "Tier 2" / "2" → tier 2, selain itu tier bawaan. */
export const tierDari = (ket: string | null, bawaan: 1 | 2): 1 | 2 =>
  ket && /2/.test(ket) ? 2 : ket && /1/.test(ket) ? 1 : bawaan;
