/**
 * Baris tab LM Mingguan (23 Nov 2026): baris total + baris rinciannya. Hanya
 * semua status, termasuk yang belum diverifikasi (beda dengan tab harian). Satuan dan cara
 * hitung mengikuti Rekap Kinerja: KMS dijumlah km-nya, lainnya dicacah per
 * pekerjaan.
 *
 * Target (keputusan user 23 Nov): hanya baris total, dari SLA bulanan per ULP
 * yang sudah ada (Rekap Kinerja · Atur SLA), dibagi ke minggu menurut jumlah
 * hari: target minggu = Σ hari minggu itu × SLA bulannya ÷ hari sebulan.
 * Penebangan & perisai belum punya SLA → tanpa target.
 */

/** Satu pekerjaan dari realisasi_rentang yang sudah diperkaya. */
export interface ItemMingguan {
  tgl: string;
  kunci: string;
  km: number;
  /** Inspeksi JTM Tier 1 + drone. */
  drone: boolean;
  /** Pemeliharaan Jaringan: nama kategori & jenis (JTM / GARDU / JTR). */
  kategori: string | null;
  jenis: string | null;
}

export interface BarisMingguan {
  kode: string;
  uraian: string;
  satuan: string;
  desimal: boolean;
  /** null = baris total (penjumlahan rinciannya). */
  induk: string | null;
  /** Nilai satu pekerjaan untuk baris ini (0 = tidak ikut). Tidak ada = belum ada sumber. */
  nilai?: (x: ItemMingguan) => number;
  sumber: string;
  /** Kunci SLA (sla_kinerja) yang dijumlah menjadi target bulanan baris ini. */
  sla?: string[];
}

/**
 * Perisai binatang = kategori Pemeliharaan Jaringan bernama perisai/binatang.
 * Gardu bila jenis catatannya GARDU atau nama kategorinya menyebut gardu; sisanya
 * (JTM, juga JTR — input admin web hanya menyediakan JTM/JTR) = Perisai JTM.
 */
const PERISAI = /perisai|prisai|binatang|animal/i;
const perisaiGardu = (x: ItemMingguan) => x.jenis === "GARDU" || /gardu/i.test(x.kategori ?? "");
const perisai = (x: ItemMingguan, gardu: boolean) =>
  x.kunci === "harjtm" && PERISAI.test(x.kategori ?? "") && perisaiGardu(x) === gardu ? 1 : 0;

export const BARIS_MINGGUAN: BarisMingguan[] = [
  { kode: "jtm", uraian: "Inspeksi JTM", satuan: "KMS", desimal: true, induk: null, sumber: "Tier 1 + Tier 1 drone + Tier 2", sla: ["jtm", "jtm2"] },
  { kode: "jtm1", uraian: "Tier 1", satuan: "KMS", desimal: true, induk: "jtm", sumber: "Inspeksi JTM Tier 1 tanpa drone",
    nilai: (x) => (x.kunci === "jtm" && !x.drone ? x.km : 0) },
  { kode: "jtm1d", uraian: "Tier 1 drone", satuan: "KMS", desimal: true, induk: "jtm", sumber: "Inspeksi JTM Tier 1 + drone",
    nilai: (x) => (x.kunci === "jtm" && x.drone ? x.km : 0) },
  { kode: "jtm2", uraian: "Tier 2", satuan: "KMS", desimal: true, induk: "jtm", sumber: "Inspeksi JTM Tier 2",
    nilai: (x) => (x.kunci === "jtm2" ? x.km : 0) },

  { kode: "gardu", uraian: "Inspeksi Gardu", satuan: "gardu", desimal: false, induk: null, sumber: "Tier 1 + Tier 2", sla: ["igardu1", "igardu2"] },
  { kode: "gardu1", uraian: "Tier 1", satuan: "gardu", desimal: false, induk: "gardu", sumber: "Inspeksi Gardu Tier 1",
    nilai: (x) => (x.kunci === "igardu1" ? 1 : 0) },
  { kode: "gardu2", uraian: "Tier 2", satuan: "gardu", desimal: false, induk: "gardu", sumber: "Inspeksi Gardu Tier 2",
    nilai: (x) => (x.kunci === "igardu2" ? 1 : 0) },

  { kode: "rabas", uraian: "Perabasan pohon", satuan: "KMS", desimal: true, induk: null, sumber: "Perabasan", sla: ["perabasan"],
    nilai: (x) => (x.kunci === "perabasan" ? x.km : 0) },

  { kode: "tebang", uraian: "Penebangan pohon", satuan: "pohon", desimal: false, induk: null, sumber: "belum ada sumber di SMART" },

  { kode: "perisai", uraian: "Pemasangan perisai binatang", satuan: "pekerjaan", desimal: false, induk: null, sumber: "Perisai JTM + Perisai Gardu" },
  { kode: "perisai_jtm", uraian: "Perisai JTM", satuan: "pekerjaan", desimal: false, induk: "perisai",
    sumber: "Pemeliharaan Jaringan · kategori perisai, jenis JTM / JTR", nilai: (x) => perisai(x, false) },
  { kode: "perisai_gardu", uraian: "Perisai Gardu", satuan: "pekerjaan", desimal: false, induk: "perisai",
    sumber: "Pemeliharaan Jaringan · kategori perisai, jenis Gardu", nilai: (x) => perisai(x, true) },
];

/** Nilai per minggu tiap baris; baris total = jumlah rinciannya. */
export function susunMingguan(item: ItemMingguan[], mingguDari: (tgl: string) => number, jumlahMinggu: number) {
  const hasil = new Map<string, number[]>();
  for (const b of BARIS_MINGGUAN) {
    const isi = Array<number>(jumlahMinggu).fill(0);
    if (b.nilai) {
      for (const x of item) {
        const w = mingguDari(x.tgl);
        if (w >= 0) isi[w] += b.nilai(x);
      }
    }
    hasil.set(b.kode, isi);
  }
  for (const b of BARIS_MINGGUAN) {
    if (!b.induk) continue;
    const total = hasil.get(b.induk)!;
    hasil.get(b.kode)!.forEach((n, i) => { total[i] += n; });
  }
  return hasil;
}

export const angkaMingguan = (n: number, desimal: boolean) =>
  n === 0 ? "—" : n.toLocaleString("id-ID", { maximumFractionDigits: desimal ? 3 : 0 });

/** SLA bulanan per `kunci|YYYY-MM`; null = belum diatur. */
export type PetaSla = Map<string, number | null>;

/** Bulan-bulan (YYYY-MM) yang disentuh rentang tanggal. */
export function bulanDalam(dari: string, sampai: string) {
  const hasil: string[] = [];
  let [y, m] = dari.split("-").map(Number);
  const akhir = sampai.slice(0, 7);
  for (;;) {
    const b = `${y}-${String(m).padStart(2, "0")}`;
    hasil.push(b);
    if (b >= akhir) return hasil;
    if (++m > 12) { m = 1; y++; }
  }
}

/** Target satu baris untuk rentang tanggal (inklusif); null = tanpa SLA. */
export function targetRentang(b: BarisMingguan, sla: PetaSla, dari: string, sampai: string): number | null {
  if (!b.sla) return null;
  let n = 0;
  let ada = false;
  for (const bln of bulanDalam(dari, sampai)) {
    const [y, m] = bln.split("-").map(Number);
    const hari = new Date(Date.UTC(y, m, 0)).getUTCDate();
    const a = dari > `${bln}-01` ? Number(dari.slice(8, 10)) : 1;
    const z = sampai.slice(0, 7) === bln ? Number(sampai.slice(8, 10)) : hari;
    for (const k of b.sla) {
      const t = sla.get(`${k}|${bln}`);
      if (t === null || t === undefined) continue;
      ada = true;
      n += (t * (z - a + 1)) / hari;
    }
  }
  return ada ? n : null;
}

/** "86%" — null bila target kosong / 0. */
export const persenCapaian = (real: number, target: number | null) =>
  target ? `${Math.round((real / target) * 100)}%` : null;
