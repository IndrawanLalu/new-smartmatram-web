/**
 * Pembagian minggu tab LM Mingguan (23 Nov 2026) — tiga sistem, dipilih lewat
 * sakelar karena belum ada aturan baku:
 *
 * - "tetap": tanggal tetap 1–7, 8–14, 15–21, 22–akhir bulan. Selalu 4 minggu,
 *   total sebulan = tab harian.
 * - "senin": Senin–Minggu dalam bulan; M1 = tgl 1 s.d. Minggu pertama, M4 =
 *   Senin ketiga s.d. akhir bulan (sama dengan Overload Monitor di Score Board).
 * - "iso": ISO 8601 — Senin–Minggu, satu minggu milik bulan tempat hari
 *   Kamisnya jatuh. 4 atau 5 minggu; ujung bulan bisa masuk bulan sebelah.
 *   Diberi nomor minggu tahun ("minggu ke-47").
 */

export type SistemMinggu = "tetap" | "senin" | "iso";

export const SISTEM_MINGGU: { kunci: SistemMinggu; label: string; ket: string }[] = [
  { kunci: "tetap", label: "Tanggal tetap", ket: "1–7, 8–14, 15–21, 22–akhir bulan" },
  { kunci: "senin", label: "Senin–Minggu", ket: "M1 = tgl 1 s.d. Minggu pertama, M4 = sisa bulan (seperti Score Board)" },
  { kunci: "iso", label: "ISO 8601", ket: "Senin–Minggu, minggu ikut bulan hari Kamisnya; bisa 5 minggu" },
];

export interface Minggu {
  label: string;
  /** Nomor minggu ISO dalam setahun (hanya sistem "iso"). */
  ke: number | null;
  /** YYYY-MM-DD, inklusif. */
  dari: string;
  sampai: string;
}

const HARI_MS = 86_400_000;
const iso = (d: Date) => d.toISOString().slice(0, 10);
const tgl = (y: number, m: number, d: number) => new Date(Date.UTC(y, m - 1, d));
const tambah = (d: Date, n: number) => new Date(d.getTime() + n * HARI_MS);

/** Nomor minggu ISO 8601 untuk tanggal Kamis minggu itu. */
function nomorIso(kamis: Date) {
  const awal = Date.UTC(kamis.getUTCFullYear(), 0, 1);
  return Math.floor((kamis.getTime() - awal) / HARI_MS / 7) + 1;
}

/** `bulan` = "YYYY-MM". */
export function bagiMinggu(bulan: string, sistem: SistemMinggu): Minggu[] {
  const [y, m] = bulan.split("-").map(Number);
  const akhir = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const potong = (batas: [number, number][]) =>
    batas.map(([a, b], i) => ({ label: `M${i + 1}`, ke: null, dari: iso(tgl(y, m, a)), sampai: iso(tgl(y, m, b)) }));

  if (sistem === "tetap") return potong([[1, 7], [8, 14], [15, 21], [22, akhir]]);

  if (sistem === "senin") {
    const minggu: number[] = [];
    for (let d = 1; d <= akhir && minggu.length < 3; d++) if (tgl(y, m, d).getUTCDay() === 0) minggu.push(d);
    return potong([[1, minggu[0]], [minggu[0] + 1, minggu[1]], [minggu[1] + 1, minggu[2]], [minggu[2] + 1, akhir]]);
  }

  // ISO: Kamis pertama di bulan ini → Senin minggunya; terus selama Kamisnya masih di bulan ini.
  let kamis = tgl(y, m, 1);
  while (kamis.getUTCDay() !== 4) kamis = tambah(kamis, 1);
  const hasil: Minggu[] = [];
  for (; kamis.getUTCMonth() === m - 1; kamis = tambah(kamis, 7)) {
    hasil.push({ label: `M${hasil.length + 1}`, ke: nomorIso(kamis), dari: iso(tambah(kamis, -3)), sampai: iso(tambah(kamis, 3)) });
  }
  return hasil;
}

/** Indeks minggu tempat tanggal itu jatuh, -1 bila di luar. */
export const mingguKe = (daftar: Minggu[], t: string) => daftar.findIndex((w) => t >= w.dari && t <= w.sampai);

const BLN = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];

/** "16–22 Nov" / "30 Nov–6 Des". */
export function teksRentang(w: Minggu) {
  const [, ma, da] = w.dari.split("-").map(Number);
  const [, mb, db] = w.sampai.split("-").map(Number);
  if (w.dari === w.sampai) return `${da} ${BLN[ma - 1]}`;
  return ma === mb ? `${da}–${db} ${BLN[mb - 1]}` : `${da} ${BLN[ma - 1]}–${db} ${BLN[mb - 1]}`;
}
