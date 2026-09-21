/**
 * Tipe & perhitungan bersama modul Detail Gangguan APKT.
 *
 * Dipisah dari `page.tsx` saat tab Dashboard masuk: klasifikasi CT dan
 * perbandingan waktu asli ↔ koreksi sekarang dipakai tabel, rekap, dan grafik
 * sekaligus. Tiga salinan rumus yang "seharusnya sama" adalah tiga peluang
 * untuk menghasilkan angka yang berbeda untuk hal yang sama.
 *
 * Satuan — sumber tersering kekeliruan di modul ini:
 *   `durasi_*_time` dari APKT  → DETIK
 *   `rpt_*` / `rct_*` koreksi  → MENIT
 * Semua fungsi di bawah bekerja dalam MENIT.
 */

// ── Tipe ──────────────────────────────────────────────────────────────────────

export interface GangguanRow {
  id?: number | string;
  apkt_id?: string;
  no_laporan?: string;
  pembuat_laporan?: string;
  /** Kolom DB hasil parse waktu_lapor, "YYYY-MM-DD". */
  tgl_lapor?: string | null;
  /** Diturunkan dari `nama_posko` saat impor, bukan dikirim APKT. */
  ulp?: string | null;
  waktu_lapor?: string;
  durasi_response_time?: number | null;
  durasi_recovery_time?: number | null;
  status_akhir?: string;
  nama_posko?: string;
  nama_pelapor?: string;
  alamat_pelapor?: string;
  penyebab?: string | null;
  tindakan?: string | null;
  kode_gangguan?: string | null;
  jenis_gangguan?: string | null;
  [key: string]: unknown;
}

export interface KoreksiRow {
  no_laporan: string;
  korektor?: string | null;
  rpt_asli?: number | null;
  rct_asli?: number | null;
  rpt_koreksi?: number | null;
  rct_koreksi?: number | null;
  tgl_koreksi?: string | null;
  d_lapor_penugasan?: number | null;
  d_penugasan_perjalanan?: number | null;
  d_perjalanan_pengerjaan?: number | null;
  d_pengerjaan_nyalasmt?: number | null;
  d_nyalasmt_nyala?: number | null;
  d_nyala_selesai?: number | null;
  [key: string]: unknown;
}

export interface KategoriCt {
  isCT: boolean;
  reason: string | null;
}

export interface GangguanTerklasifikasi {
  row: GangguanRow;
  ct: KategoriCt;
}

export type FilterMode = "non" | "ct" | "all";

/** Urutan & label toggle kategori — dipakai tab Data dan tab Dashboard, jadi
 *  keduanya tidak mungkin menyebut hal yang sama dengan nama berbeda. */
export const KATEGORI_LABEL: { key: FilterMode; label: string }[] = [
  { key: "non", label: "Non CT" },
  { key: "ct", label: "CT" },
  { key: "all", label: "Semua" },
];

/** RPT = response time (lapor → pengerjaan) · RCT = recovery time (lapor → nyala). */
export type Metrik = "rpt" | "rct";

// ── Klasifikasi Non CT ────────────────────────────────────────────────────────
// "CT" = periksa meter/CT → DIBUANG. "Non CT" = perlu dikoreksi waktunya.

const CT_KODE = ["99112", "99113", "13500", "99111", "11522", "99110"];
const CT_TINDAKAN = ["tamper", "temper", "ct"];

export function classifyCt(row: GangguanRow): KategoriCt {
  const ket = String(row.keterangan_pelapor ?? "").toLowerCase();
  if (ket.includes("periksa") || ket.includes("priksa"))
    return { isCT: true, reason: "Pengaduan periksa meter" };
  const tind = String(row.tindakan ?? "").toLowerCase();
  const hitT = CT_TINDAKAN.find((t) => tind.includes(t));
  if (hitT) return { isCT: true, reason: `Tindakan "${hitT}"` };
  const kode = String(row.kode_gangguan ?? "").trim();
  if (CT_KODE.includes(kode)) return { isCT: true, reason: `Kode ${kode}` };
  return { isCT: false, reason: null };
}

export function saringMode(
  items: GangguanTerklasifikasi[],
  mode: FilterMode,
): GangguanRow[] {
  return items
    .filter(({ ct }) => (mode === "all" ? true : mode === "ct" ? ct.isCT : !ct.isCT))
    .map((i) => i.row);
}

// ── Format ────────────────────────────────────────────────────────────────────

/** Durasi APKT dalam DETIK → "2j 9m" / "9m 18d". (7758 dtk = 2:09:18) */
export function fmtDurSec(sec: number): string {
  if (!Number.isFinite(sec)) return "—";
  const t = Math.max(0, Math.round(sec));
  const h = Math.floor(t / 3600);
  const m = Math.floor((t % 3600) / 60);
  const s = t % 60;
  const parts: string[] = [];
  if (h) parts.push(`${h}j`);
  if (m) parts.push(`${m}m`);
  if (s && !h) parts.push(`${s}d`); // detik hanya bila < 1 jam
  return parts.length ? parts.join(" ") : "0d";
}

/** Menit → "48 mnt" / "1 j 12 m". */
export function fmtMenit(menit: number | null): string {
  if (menit === null || !Number.isFinite(menit)) return "—";
  const t = Math.max(0, Math.round(menit));
  const j = Math.floor(t / 60);
  const m = t % 60;
  if (j === 0) return `${m} mnt`;
  if (m === 0) return `${j} jam`;
  return `${j} j ${m} m`;
}

const BULAN_ID = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];

// ── Perbandingan asli ↔ koreksi ───────────────────────────────────────────────

/** Satu laporan dengan waktunya sebelum dan sesudah koreksi, dalam MENIT. */
export interface Banding {
  tgl: string; // "YYYY-MM-DD"; string kosong bila tanggalnya tidak terbaca
  rptAsli: number | null;
  rptKoreksi: number | null;
  rctAsli: number | null;
  rctKoreksi: number | null;
  dikoreksi: boolean;
}

const NILAI_KEY = ["rptAsli", "rptKoreksi", "rctAsli", "rctKoreksi"] as const;
type NilaiKey = (typeof NILAI_KEY)[number];

export const asliDari = (b: Banding, m: Metrik) => (m === "rpt" ? b.rptAsli : b.rctAsli);
export const koreksiDari = (b: Banding, m: Metrik) => (m === "rpt" ? b.rptKoreksi : b.rctKoreksi);

/** Detik APKT → menit. Nol dianggap "tidak ada data", bukan "seketika". */
function detikKeMenit(v: unknown): number | null {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n / 60 : null;
}

function menitKoreksi(v: unknown): number | null {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/** "04/06/2026 9:12:46" → "2026-06-04". Kolom `tgl_lapor` dipakai lebih dulu. */
function tglDari(r: GangguanRow): string {
  const t = r.tgl_lapor;
  if (typeof t === "string" && t.length >= 10) return t.slice(0, 10);
  const w = r.waktu_lapor;
  if (typeof w === "string") {
    const [d, m, y] = w.split(" ")[0].split("/");
    if (y?.length === 4 && m && d) return `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
  }
  return "";
}

/**
 * Pasangkan tiap laporan dengan koreksinya.
 *
 * Laporan yang BELUM dikoreksi tetap punya nilai "sesudah" — yaitu waktu
 * aslinya. Kolom sesudah dibaca sebagai *angka yang berlaku sekarang*, bukan
 * hanya angka hasil koreksi; kalau baris yang belum digarap dibuang, rata-rata
 * sesudah akan terlihat jauh lebih baik daripada kenyataan yang dilaporkan.
 */
export function bangunBanding(
  rows: GangguanRow[],
  koreksiMap: Map<string, KoreksiRow>,
): Banding[] {
  return rows.map((r) => {
    const kor = koreksiMap.get(String(r.no_laporan ?? ""));
    const rptAsli = detikKeMenit(r.durasi_response_time);
    const rctAsli = detikKeMenit(r.durasi_recovery_time);
    return {
      tgl: tglDari(r),
      rptAsli,
      rctAsli,
      rptKoreksi: (kor ? menitKoreksi(kor.rpt_koreksi) : null) ?? rptAsli,
      rctKoreksi: (kor ? menitKoreksi(kor.rct_koreksi) : null) ?? rctAsli,
      dikoreksi: Boolean(kor),
    };
  });
}

export interface Ringkas {
  /** Laporan yang punya durasi asli — penyebut semua angka di bawah. */
  n: number;
  dikoreksi: number;
  asli: number;
  koreksi: number;
  /** Selisih menit; positif = turun setelah koreksi. */
  delta: number;
  /** Perubahan terhadap asli; negatif = turun. */
  pct: number;
}

/**
 * Rata-rata sebelum & sesudah koreksi.
 *
 * Hanya laporan yang punya durasi ASLI yang dihitung, supaya penyebut kedua
 * sisinya sama persis — membandingkan rata-rata dari dua kumpulan baris yang
 * berbeda isinya bukan perbandingan.
 */
export function ringkas(list: Banding[], m: Metrik): Ringkas {
  let n = 0;
  let dikoreksi = 0;
  let jmlAsli = 0;
  let jmlKoreksi = 0;
  for (const b of list) {
    const a = asliDari(b, m);
    if (a === null) continue;
    n++;
    if (b.dikoreksi) dikoreksi++;
    jmlAsli += a;
    jmlKoreksi += koreksiDari(b, m) ?? a;
  }
  const asli = n ? jmlAsli / n : 0;
  const koreksi = n ? jmlKoreksi / n : 0;
  return {
    n,
    dikoreksi,
    asli,
    koreksi,
    delta: asli - koreksi,
    pct: asli > 0 ? ((koreksi - asli) / asli) * 100 : 0,
  };
}

// ── Ember waktu ───────────────────────────────────────────────────────────────

export type Kerapatan = "hari" | "minggu" | "bulan";

export interface EmberBanding {
  /** Label pendek untuk sumbu grafik. */
  label: string;
  /** Label lengkap untuk tabel rekap. */
  penuh: string;
  n: number;
  dikoreksi: number;
  rptAsli: number | null;
  rptKoreksi: number | null;
  rctAsli: number | null;
  rctKoreksi: number | null;
}

const HARI_MS = 86_400_000;

const tglSah = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s);

function keDate(s: string): Date {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y || 1970, (m || 1) - 1, d || 1);
}

function ymd(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/**
 * Kelompokkan laporan menurut rentang tanggal yang sedang dilihat.
 *
 * Tanpa `paksa`, kerapatannya ikut panjang rentang: sebulan → per hari,
 * sekuartal → blok 7 hari, setahun → per bulan. Batas itu ADA supaya rentang
 * setahun tidak jadi 365 batang selebar rambut — tapi ia hanya bawaan, bukan
 * keputusan akhir: `paksa` membiarkan pengguna tetap meminta harian kalau memang
 * itu yang ingin dilihat.
 *
 * Ember tanpa laporan tetap digambar dengan nilai `null` (bukan 0): nol berarti
 * "waktunya nol menit", padahal yang benar adalah "tidak ada gangguan".
 */
export function bangunEmber(
  list: Banding[],
  from: string,
  to: string,
  paksa: Kerapatan | null = null,
): { ember: EmberBanding[]; kerapatan: Kerapatan } {
  // Kotak tanggal boleh dikosongkan pengguna. Tanpa penjaga ini, rentang
  // "kosong s/d hari ini" dibaca sebagai 1970→sekarang dan menghasilkan ratusan
  // ember bulan yang tidak ada isinya.
  let dari = from;
  let sampai = to;
  if (!tglSah(dari) || !tglSah(sampai)) {
    const ada = list.map((b) => b.tgl).filter(tglSah).sort();
    if (!tglSah(dari)) dari = ada[0] ?? "";
    if (!tglSah(sampai)) sampai = ada[ada.length - 1] ?? "";
    if (!tglSah(dari) || !tglSah(sampai)) return { ember: [], kerapatan: paksa ?? "hari" };
  }

  const awal = keDate(dari);
  const akhir = keDate(sampai);
  const jumlahHari = Math.max(1, Math.round((akhir.getTime() - awal.getTime()) / HARI_MS) + 1);
  const kerapatan: Kerapatan =
    paksa ?? (jumlahHari <= 45 ? "hari" : jumlahHari <= 190 ? "minggu" : "bulan");

  const slot: { label: string; penuh: string }[] = [];
  const indeks = new Map<string, number>();

  if (kerapatan === "bulan") {
    const cur = new Date(awal.getFullYear(), awal.getMonth(), 1);
    while (cur <= akhir) {
      indeks.set(`${cur.getFullYear()}-${String(cur.getMonth() + 1).padStart(2, "0")}`, slot.length);
      slot.push({
        label: BULAN_ID[cur.getMonth()],
        penuh: `${BULAN_ID[cur.getMonth()]} ${cur.getFullYear()}`,
      });
      cur.setMonth(cur.getMonth() + 1);
    }
  } else {
    const lebar = kerapatan === "hari" ? 1 : 7;
    for (let i = 0; ; i += lebar) {
      const mulai = new Date(awal.getTime() + i * HARI_MS);
      if (mulai > akhir) break;
      const selesai = new Date(Math.min(mulai.getTime() + (lebar - 1) * HARI_MS, akhir.getTime()));
      const idx = slot.length;
      for (let j = 0; j < lebar; j++) {
        const d = new Date(mulai.getTime() + j * HARI_MS);
        if (d > akhir) break;
        indeks.set(ymd(d), idx);
      }
      slot.push(
        lebar === 1
          ? {
              label: String(mulai.getDate()),
              penuh: `${mulai.getDate()} ${BULAN_ID[mulai.getMonth()]}`,
            }
          : {
              label: `${mulai.getDate()}–${selesai.getDate()}`,
              penuh: `${mulai.getDate()} ${BULAN_ID[mulai.getMonth()]} – ${selesai.getDate()} ${BULAN_ID[selesai.getMonth()]}`,
            },
      );
    }
  }

  const isi = slot.map(() => ({
    n: 0,
    dikoreksi: 0,
    jml: { rptAsli: 0, rptKoreksi: 0, rctAsli: 0, rctKoreksi: 0 } as Record<NilaiKey, number>,
    cacah: { rptAsli: 0, rptKoreksi: 0, rctAsli: 0, rctKoreksi: 0 } as Record<NilaiKey, number>,
  }));

  for (const b of list) {
    if (!b.tgl) continue;
    const idx = indeks.get(kerapatan === "bulan" ? b.tgl.slice(0, 7) : b.tgl);
    if (idx === undefined) continue;
    const s = isi[idx];
    s.n++;
    if (b.dikoreksi) s.dikoreksi++;
    for (const k of NILAI_KEY) {
      const v = b[k];
      if (v !== null) {
        s.jml[k] += v;
        s.cacah[k]++;
      }
    }
  }

  const rata = (k: NilaiKey, s: (typeof isi)[number]) =>
    s.cacah[k] > 0 ? s.jml[k] / s.cacah[k] : null;

  return {
    kerapatan,
    ember: slot.map((sl, i) => ({
      ...sl,
      n: isi[i].n,
      dikoreksi: isi[i].dikoreksi,
      rptAsli: rata("rptAsli", isi[i]),
      rptKoreksi: rata("rptKoreksi", isi[i]),
      rctAsli: rata("rctAsli", isi[i]),
      rctKoreksi: rata("rctKoreksi", isi[i]),
    })),
  };
}

export interface Cakupan {
  /** Tanggal berbeda yang benar-benar punya laporan. */
  hariBerisi: number;
  /** Panjang rentang yang diminta, dalam hari. */
  hariTotal: number;
  terakhir: string | null;
}

/**
 * Seberapa penuh rentang ini terisi data.
 *
 * Data APKT ditarik manual per rentang tanggal, jadi hari yang belum pernah
 * ditarik terlihat persis sama dengan hari tanpa gangguan: batang kosong.
 * Angka cakupan memisahkan keduanya — tanpa ini, lubang impor terbaca sebagai
 * prestasi.
 */
export function cakupan(list: Banding[], from: string, to: string): Cakupan {
  const hari = new Set<string>();
  for (const b of list) if (tglSah(b.tgl)) hari.add(b.tgl);
  const urut = [...hari].sort();
  const hariTotal =
    tglSah(from) && tglSah(to)
      ? Math.max(0, Math.round((keDate(to).getTime() - keDate(from).getTime()) / HARI_MS) + 1)
      : urut.length;
  return { hariBerisi: urut.length, hariTotal, terakhir: urut[urut.length - 1] ?? null };
}

// ── Sebaran durasi ────────────────────────────────────────────────────────────

/** Batas atas tiap kelompok, dalam menit. Di atas nilai terakhir masuk ">". */
const BATAS: Record<Metrik, number[]> = {
  rpt: [15, 30, 45, 60, 120],
  rct: [30, 60, 120, 180, 360],
};

export interface EmberSebaran {
  label: string;
  asli: number;
  koreksi: number;
}

/**
 * Berapa banyak laporan jatuh di tiap rentang durasi, sebelum dan sesudah.
 *
 * Rata-rata hanya memberi satu angka; sebaran memperlihatkan ke mana ekor
 * panjangnya pindah — itu bagian yang menentukan apakah koreksi menyentuh
 * laporan yang bermasalah atau hanya menggeser yang sudah baik.
 */
export function bangunSebaran(list: Banding[], m: Metrik): EmberSebaran[] {
  const batas = BATAS[m];
  const out: EmberSebaran[] = [
    { label: `≤ ${batas[0]}`, asli: 0, koreksi: 0 },
    ...batas.slice(1).map((b, i) => ({ label: `${batas[i] + 1}–${b}`, asli: 0, koreksi: 0 })),
    { label: `> ${batas[batas.length - 1]}`, asli: 0, koreksi: 0 },
  ];
  const kelompok = (v: number) => {
    const i = batas.findIndex((b) => v <= b);
    return i === -1 ? batas.length : i;
  };
  for (const b of list) {
    const a = asliDari(b, m);
    if (a !== null) out[kelompok(a)].asli++;
    const k = koreksiDari(b, m);
    if (k !== null) out[kelompok(k)].koreksi++;
  }
  return out;
}
