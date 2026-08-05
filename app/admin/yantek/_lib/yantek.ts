/**
 * Tipe, konstanta, dan helper bersama modul Analisis Yantek.
 *
 * Semula semuanya menumpuk di dalam `page.tsx` (1.193 baris) bersama empat
 * komponen tab. Dipisah supaya tiap tab bisa berdiri sendiri dan tab SLA yang
 * baru tidak menambah panjang berkas yang sudah sulit dibaca.
 */

// ── Tipe ──────────────────────────────────────────────────────────────────────

export interface YantekRow {
  personil_yantek?: string;
  pembuat_laporan?: string;
  rating?: number | null;
  no_laporan?: string;
  nama_posko?: string;
  nama_regu?: string;
  waktu_lapor?: string;
  waktu_perjalanan?: string | null;
  waktu_nyala_sementara?: string | null;
  waktu_selesai?: string | null;
  durasi_menit_response?: number | null;
  durasi_menit_recovery?: number | null;
  durasi_menit_perjalanan?: number | null;
  status_akhir?: string;
  fasilitas?: string | null;
  penyebab?: string | null;
  tindakan?: string;
  jml_pelanggan_padam?: number;
  waktu_nyala?: string | null;
  shift?: string;
  [key: string]: unknown;
}

export interface DateSummary {
  date: string;
  label: string;
  count: number;
  savedAt: number | null;
}

export interface PetugasStat {
  petugas: string;
  totalWO: number;
  adaRating: number;
  r: [number, number, number, number, number, number];
  avgRating: number | null;
}

export type SortDir = "asc" | "desc";
export type Tab = "rekap" | "sla" | "warning" | "detail" | "database";

// ── Konstanta ─────────────────────────────────────────────────────────────────

/** Latar & tinta lencana bintang, indeks = jumlah bintang (0–5). */
export const STAR_BG: string[] = [
  "#fef2f2", "#fff7ed", "#fffbeb", "#fefce8", "#f7fee7", "#f0fdf4",
];
export const STAR_TEXT: string[] = [
  "text-red-600", "text-orange-500", "text-amber-600",
  "text-yellow-600", "text-lime-700", "text-emerald-700",
];

export const DETAIL_COLS: (keyof YantekRow)[] = [
  "no_laporan", "personil_yantek", "nama_regu", "waktu_lapor",
  "waktu_nyala", "durasi_menit_response", "durasi_menit_recovery",
  "rating", "status_akhir", "fasilitas", "penyebab", "tindakan",
  "nama_posko", "jml_pelanggan_padam",
];

export const MONTHS_ID = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];

export const DAY_NAME = ["Min", "Sen", "Sel", "Rab", "Kam", "Jum", "Sab"];

/**
 * Prefix pada `personil_yantek` ("44150_NAMA") menandai ULP, sedangkan APKT
 * memakai `id_posko` yang berbeda. Keduanya disimpan bersama supaya perintah
 * console dan filter ULP memakai satu tabel yang sama.
 */
export const POSKO_MAP: { kode: string; idPosko: number; label: string; ulp: string }[] = [
  { kode: "44150", idPosko: 441501, label: "AMPENAN",     ulp: "AMPENAN" },
  { kode: "44110", idPosko: 441101, label: "CAKRA",       ulp: "CAKRANEGARA" },
  { kode: "44130", idPosko: 441301, label: "TANJUNG",     ulp: "TANJUNG" },
  { kode: "44170", idPosko: 441701, label: "GERUNG",      ulp: "GERUNG" },
];

// ── Helper ────────────────────────────────────────────────────────────────────

/** "44150_BUDI" → "BUDI" */
export function extractNama(raw: string): string {
  const idx = raw.indexOf("_");
  return idx >= 0 ? raw.slice(idx + 1).trim() : raw.trim();
}

/** "44150_BUDI" → "44150" */
export function extractPrefix(raw: string): string {
  const idx = raw.indexOf("_");
  return idx >= 0 ? raw.slice(0, idx).trim() : "";
}

/** "29/05/2026 10:00:00" → "2026-05-29" */
export function toDateStr(waktu: string): string {
  const parts = waktu.split(" ")[0].split("/");
  if (parts.length === 3) return `${parts[2]}-${parts[1]}-${parts[0]}`;
  return waktu;
}

export function fmtDateLabel(dateStr: string): string {
  const [y, m, d] = dateStr.split("-");
  return `${parseInt(d)} ${MONTHS_ID[parseInt(m) - 1]} ${y}`;
}

/** "29/05/2026 10:00:00" → Date */
export function parseWaktu(s: string): Date {
  const [date, time] = s.split(" ");
  const [d, m, y] = date.split("/");
  return new Date(`${y}-${m}-${d}T${time}`);
}

/** Selisih menit antara nyala sementara dan waktu lapor. Null bila salah satu
 *  kosong atau hasilnya negatif (data tidak masuk akal). */
export function calcDurasiNyalaSmt(row: YantekRow): string | null {
  const nyala = row.waktu_nyala_sementara;
  const lapor = row.waktu_lapor;
  if (!nyala || !lapor) return null;
  try {
    const diffMins = Math.round((parseWaktu(nyala).getTime() - parseWaktu(lapor).getTime()) / 60000);
    return diffMins >= 0 ? String(diffMins) : null;
  } catch { return null; }
}

export function parseInput(raw: string): { rows: YantekRow[]; error: string | null } {
  if (!raw.trim()) return { rows: [], error: null };
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed))
      return { rows: [], error: "Data harus berupa array JSON ([ { ... }, ... ])" };
    return { rows: parsed as YantekRow[], error: null };
  } catch (e) {
    return { rows: [], error: (e as Error).message };
  }
}

export function buildStats(rows: YantekRow[]): PetugasStat[] {
  const map = new Map<string, PetugasStat>();
  for (const row of rows) {
    const nama = extractNama(row.personil_yantek ?? "—");
    if (!map.has(nama)) {
      map.set(nama, { petugas: nama, totalWO: 0, adaRating: 0, r: [0, 0, 0, 0, 0, 0], avgRating: null });
    }
    const s = map.get(nama)!;
    s.totalWO++;
    const rv = row.rating;
    if (rv !== null && rv !== undefined) {
      s.adaRating++;
      s.r[Math.min(Math.max(Math.round(Number(rv)), 0), 5)]++;
    }
  }
  for (const s of map.values()) {
    if (s.adaRating > 0)
      s.avgRating = s.r.reduce((acc, cnt, star) => acc + cnt * star, 0) / s.adaRating;
  }
  return [...map.values()].sort((a, b) => b.totalWO - a.totalWO);
}

/** Median — dipakai berdampingan dengan rata-rata karena durasi yantek
 *  berekor panjang (response bisa 219 menit sementara median-nya 32), sehingga
 *  rata-rata sendirian memberi kesan yang salah. */
export function median(values: number[]): number {
  if (!values.length) return 0;
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

export function rata(values: number[]): number {
  return values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0;
}

/** Angka durasi yang sah saja — baris tanpa durasi tidak boleh dihitung nol,
 *  karena itu akan menarik turun semua rata-rata. */
export function durasiSah(rows: YantekRow[], key: "durasi_menit_response" | "durasi_menit_recovery"): number[] {
  return rows
    .map((r) => r[key])
    .filter((v): v is number => typeof v === "number" && Number.isFinite(v) && v >= 0);
}

/**
 * Median durasi per tanggal dalam sebulan.
 *
 * Dipakai grafik di layar DAN grafik di PDF. Sengaja satu fungsi: dua salinan
 * perhitungan yang "seharusnya sama" adalah cara paling mudah menghasilkan dua
 * angka berbeda untuk hal yang sama.
 *
 * Hari tanpa WO tidak masuk map (bukan bernilai 0) — nol berarti "ditangani
 * seketika", padahal yang benar adalah "tidak ada data".
 */
export function medianPerHari(
  rows: YantekRow[],
  key: "durasi_menit_response" | "durasi_menit_recovery",
  jumlahHari: number,
): Map<number, number> {
  const bucket = new Map<number, number[]>();
  for (const r of rows) {
    if (!r.waktu_lapor) continue;
    const hari = Number(toDateStr(r.waktu_lapor).slice(8, 10));
    const v = r[key];
    if (!Number.isFinite(hari) || hari < 1 || hari > jumlahHari) continue;
    if (typeof v !== "number" || !Number.isFinite(v) || v < 0) continue;
    if (!bucket.has(hari)) bucket.set(hari, []);
    bucket.get(hari)!.push(v);
  }
  const out = new Map<number, number>();
  for (const [hari, arr] of bucket) out.set(hari, median(arr));
  return out;
}

/** Jumlah WO per tanggal (1..jumlahHari). Hari tanpa WO tidak masuk map. */
export function jumlahPerHari(rows: YantekRow[], jumlahHari: number): Map<number, number> {
  const out = new Map<number, number>();
  for (const r of rows) {
    if (!r.waktu_lapor) continue;
    const hari = Number(toDateStr(r.waktu_lapor).slice(8, 10));
    if (!Number.isFinite(hari) || hari < 1 || hari > jumlahHari) continue;
    out.set(hari, (out.get(hari) ?? 0) + 1);
  }
  return out;
}

/**
 * Banyaknya TANGGAL BERBEDA yang punya data pada kumpulan baris ini.
 *
 * Dipakai sebagai penyebut "rata-rata gangguan per hari". Sengaja memakai
 * rentang tanggal yang benar-benar ada datanya, bukan jumlah hari kalender:
 * bulan yang baru terisi 10 hari tidak boleh dibagi 31, itu akan menekan
 * angkanya sepertiga dari yang sebenarnya.
 */
export function jumlahHariBerdata(rows: YantekRow[]): number {
  const set = new Set<string>();
  for (const r of rows) if (r.waktu_lapor) set.add(toDateStr(r.waktu_lapor));
  return set.size;
}

/** Jumlah hari dalam bulan "YYYY-MM". */
export function hariDalamBulan(bulanKey: string): number {
  const [y, m] = bulanKey.split("-").map(Number);
  return new Date(y, m, 0).getDate();
}

export interface DurasiPetugas {
  medRpt: number;
  medRct: number;
  lewatRpt: number;
  lewatRct: number;
  /** Tanggal berbeda saat petugas ini punya gangguan. */
  hariAktif: number;
  /** Gangguan per hari AKTIF, bukan per hari kalender.
   *  Petugas bergilir shift — membaginya dengan seluruh rentang periode akan
   *  membuat yang jarang bertugas terlihat ringan padahal saat bertugas justru
   *  paling padat. */
  rataPerHari: number;
  rows: YantekRow[];
}

/**
 * Median durasi & jumlah pelanggaran per petugas, dihitung sekali jalan.
 *
 * Dipakai bersama oleh tabel di layar, modal detail, dan PDF — supaya ketiganya
 * tidak mungkin menampilkan angka yang berbeda untuk orang yang sama.
 */
export function buildDurasiPerPetugas(
  rows: YantekRow[],
  sla: { response: number; recovery: number },
): Map<string, DurasiPetugas> {
  const bucket = new Map<string, YantekRow[]>();
  for (const r of rows) {
    const nama = extractNama(r.personil_yantek ?? "—");
    if (!bucket.has(nama)) bucket.set(nama, []);
    bucket.get(nama)!.push(r);
  }

  const out = new Map<string, DurasiPetugas>();
  for (const [nama, milik] of bucket) {
    const hariAktif = jumlahHariBerdata(milik);
    out.set(nama, {
      hariAktif,
      rataPerHari: hariAktif > 0 ? milik.length / hariAktif : 0,
      medRpt: median(durasiSah(milik, "durasi_menit_response")),
      medRct: median(durasiSah(milik, "durasi_menit_recovery")),
      lewatRpt: milik.filter((r) => typeof r.durasi_menit_response === "number" && r.durasi_menit_response > sla.response).length,
      lewatRct: milik.filter((r) => typeof r.durasi_menit_recovery === "number" && r.durasi_menit_recovery > sla.recovery).length,
      rows: milik,
    });
  }
  return out;
}
