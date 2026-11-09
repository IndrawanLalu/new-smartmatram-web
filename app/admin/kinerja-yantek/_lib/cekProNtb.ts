import type { BarisSheetPro, TabProNtb } from "@/lib/proNtbSheet";
import type { BarisPro } from "./proNtb";

/**
 * Cek ke spreadsheet PRO NTB (8 Nov 2026, tahap 1): baris Copy to PRO NTB
 * dibandingkan dengan isian tab WO, per tanggal dan per tab.
 *
 * Pasangan dicari dari LOKASI: kode gardu ("4415_AM099_…" → AM099) untuk
 * pekerjaan bergardu, teks lokasi yang dirapikan untuk segmen. Yang tidak
 * berpasangan tampil sebagai "hanya di SMART" / "hanya di spreadsheet" —
 * lokasi yang ditulis beda dari nama segmen SMART juga jatuh ke sini.
 */

export const TAB_DARI_KUNCI: Record<string, TabProNtb> = {
  perabasan: "WO RABAS",
  harjtm: "WO HARJAR",
  jtm: "WO INS JTM",
  jtm2: "WO INS JTM",
  igardu1: "WO INS GARDU",
  igardu2: "WO INS GARDU",
  hargardu: "WO HARGARDU",
  jtr: "WO INS JTR",
  penyeimbangan: "WO IMBANG BEBAN",
  optimasi: "WO MUTASI TRAFO",
  pengukuran: "WO UKUR GARDU",
};

export type StatusCek = "cocok" | "beda" | "smart" | "sheet";

export interface BarisCek {
  id: string;
  tgl: string;
  tab: TabProNtb;
  status: StatusCek;
  smart: BarisPro | null;
  sheet: BarisSheetPro | null;
  /** Yang beda pada pasangan: "realisasi", "jenis". */
  beda: string[];
}

export interface RingkasTab {
  tab: TabProNtb;
  smartN: number;
  smartJumlah: number;
  sheetN: number;
  sheetJumlah: number;
  cocok: number;
  beda: number;
  hanyaSmart: number;
  hanyaSheet: number;
}

const rapi = (s: string) => s.toUpperCase().replace(/^SEGMENT\s+/, "").replace(/[^A-Z0-9]+/g, " ").trim();
/** "4415_AM099_JL. …" → "AM099"; selain itu teks lokasi yang dirapikan. */
const kunciLokasi = (s: string) => {
  const g = s.trim().match(/^\d{4}_([A-Z0-9]+)_/i);
  return g ? `G:${g[1].toUpperCase()}` : `T:${rapi(s)}`;
};

/** Tab yang kolom WO-nya rumus (1 per baris) — WO tidak dibandingkan. */
const TAB_WO_RUMUS = new Set<TabProNtb>(["WO INS GARDU", "WO HARGARDU", "WO IMBANG BEBAN", "WO MUTASI TRAFO", "WO UKUR GARDU"]);
const bedaAngka = (a: number | null | undefined, b: number | null | undefined) =>
  (a ?? null) === null ? (b ?? null) !== null : (b ?? null) === null || Math.abs((a as number) - (b as number)) > 0.005;

export function bandingkan(smart: BarisPro[], sheet: BarisSheetPro[]): { baris: BarisCek[]; ringkas: RingkasTab[] } {
  const baris: BarisCek[] = [];

  // 1. Lewat kode SMART di KETERANGAN — pasti, dan tetap berpasangan walau
  //    baris WO berpindah tanggal (tanggal 1 → tanggal realisasi).
  const perKode = new Map(sheet.filter((x) => x.kode).map((x) => [x.kode, x]));
  const terpasang = new Set<BarisSheetPro>();
  const sisaSmart: BarisPro[] = [];
  for (const b of smart) {
    const tab = TAB_DARI_KUNCI[b.item.kunci];
    const y = tab ? perKode.get(kodeBaris(b)) : undefined;
    if (!tab) continue;
    if (!y || y.tab !== tab || terpasang.has(y)) { sisaSmart.push(b); continue; }
    terpasang.add(y);
    const beda: string[] = [];
    if (bedaAngka(b.nilai, y.realisasi)) beda.push("realisasi");
    // WO 0 = sel kosong (skrip ≤ v4 tidak menulis 0) — jumlahnya sama.
    if (b.wo !== undefined && !TAB_WO_RUMUS.has(tab) && bedaAngka(b.wo || null, y.wo || null)) beda.push("wo");
    if (b.item.tgl !== y.tgl) beda.push("tanggal");
    const js = b.jenis?.jenis_pekerjaan;
    if (js && y.jenis && rapi(js) !== rapi(y.jenis)) beda.push("jenis");
    baris.push({ id: `${b.id}|k`, tgl: b.item.tgl, tab, status: beda.length ? "beda" : "cocok", smart: b, sheet: y, beda });
  }

  // 2. Sisanya (isian manual ULP tanpa kode) lewat tanggal + lokasi.
  const kelompok = new Map<string, { s: BarisPro[]; x: BarisSheetPro[] }>();
  const ambil = (k: string) => kelompok.get(k) ?? kelompok.set(k, { s: [], x: [] }).get(k)!;
  for (const b of sisaSmart) ambil(`${b.item.tgl}|${TAB_DARI_KUNCI[b.item.kunci]}`).s.push(b);
  // Baris berkode SMART yang tak berpasangan = kiriman lama yang tidak ada
  // lagi di SMART → "hanya di spreadsheet", tidak dipasangkan lewat lokasi.
  for (const x of sheet) {
    if (terpasang.has(x)) continue;
    if (x.kode) baris.push({ id: `${x.tab}|${x.baris}`, tgl: x.tgl, tab: x.tab, status: "sheet", smart: null, sheet: x, beda: [] });
    else ambil(`${x.tgl}|${x.tab}`).x.push(x);
  }

  for (const [k, { s, x }] of kelompok) {
    const [tgl, tab] = k.split("|") as [string, TabProNtb];
    const sisa = [...x];
    for (const b of s) {
      const kl = kunciLokasi(b.lokasi);
      const i = sisa.findIndex((y) => kunciLokasi(y.lokasi) === kl);
      if (i < 0) { baris.push({ id: `${b.id}|s`, tgl, tab, status: "smart", smart: b, sheet: null, beda: [] }); continue; }
      const y = sisa.splice(i, 1)[0];
      const beda: string[] = [];
      if (b.nilai !== null && y.realisasi !== null && Math.abs(b.nilai - y.realisasi) > 0.005) beda.push("realisasi");
      const js = b.jenis?.jenis_pekerjaan;
      if (js && y.jenis && rapi(js) !== rapi(y.jenis)) beda.push("jenis");
      baris.push({ id: `${b.id}|p`, tgl, tab, status: beda.length ? "beda" : "cocok", smart: b, sheet: y, beda });
    }
    for (const y of sisa) baris.push({ id: `${y.tab}|${y.baris}`, tgl, tab, status: "sheet", smart: null, sheet: y, beda: [] });
  }
  baris.sort((a, b) => a.tgl.localeCompare(b.tgl) || a.tab.localeCompare(b.tab) || URUT[a.status] - URUT[b.status]);

  const per = new Map<TabProNtb, RingkasTab>();
  const r = (tab: TabProNtb) => per.get(tab) ?? per.set(tab, {
    tab, smartN: 0, smartJumlah: 0, sheetN: 0, sheetJumlah: 0, cocok: 0, beda: 0, hanyaSmart: 0, hanyaSheet: 0,
  }).get(tab)!;
  for (const c of baris) {
    const t = r(c.tab);
    if (c.smart) { t.smartN++; t.smartJumlah += c.smart.nilai ?? 0; }
    if (c.sheet) { t.sheetN++; t.sheetJumlah += c.sheet.realisasi ?? 0; }
    if (c.status === "cocok") t.cocok++;
    else if (c.status === "beda") t.beda++;
    else if (c.status === "smart") t.hanyaSmart++;
    else t.hanyaSheet++;
  }
  return { baris, ringkas: [...per.values()].sort((a, b) => a.tab.localeCompare(b.tab)) };
}

const URUT: Record<StatusCek, number> = { beda: 0, smart: 1, sheet: 2, cocok: 3 };

// ── Tahap 2: kiriman ke Apps Script (scripts/apps-script-pro-ntb.gs) ─────────

/** FNV-1a 32 bit → 8 heksa. */
function hash8(s: string) {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return (h >>> 0).toString(16).padStart(8, "0");
}

/** Penanda baris SMART di KETERANGAN spreadsheet — tetap sama untuk catatan yang sama. */
export function kodeBaris(b: BarisPro) {
  const x = b.item;
  // kodeSumber (pro_ntb_baris) untuk baris di luar WO = rumus lama di bawah → kode sama.
  return `SMART-${hash8(x.kodeSumber ?? (x.sumber && x.sumberId ? `${x.sumber}|${x.sumberId}|${x.bagian ?? ""}|${x.tgl}` : b.id))}`;
}

export interface BarisKirim {
  kode: string;
  tab: TabProNtb;
  /** Baris yang sudah ditempel manual (pasangan Cek) — ditandai, bukan ditambah. */
  baris: number | null;
  /** Huruf kolom → nilai. Kolom berumus ditolak skrip spreadsheet. */
  kolom: Record<string, string | number>;
}

/**
 * Baris SMART yang dikirim: yang sudah ada di spreadsheet (cocok/beda) memakai
 * baris itu, yang belum ada ditambah. Baris "hanya di spreadsheet" tidak disentuh.
 * Kolom: B TANGGAL · F JENIS · G LOKASI · H NAMA TIM · M WO (KMS) · N REALISASI.
 */
export function muatanKirim(baris: BarisCek[], timDari: (b: BarisPro) => string): BarisKirim[] {
  const terpakai = new Set<string>();
  return baris.filter((c) => c.smart).map((c) => {
    const b = c.smart!;
    // Alamat master kadang berisi pindah baris — satu sel satu baris.
    const kolom: Record<string, string | number> = { B: b.item.tgl, G: b.lokasi.replace(/\s+/g, " ").trim() };
    if (b.jenis?.jenis_pekerjaan) kolom.F = b.jenis.jenis_pekerjaan;
    const tim = timDari(b).trim();
    if (tim) kolom.H = tim;
    if (b.wo !== undefined) {
      // PRO NTB ber-WO: keduanya SELALU dikirim; "" = dikosongkan (mis.
      // dikembalikan → realisasi hilang). Kolom WO berumus dilewati skrip.
      kolom.M = b.wo ?? "";
      kolom.N = b.nilai ?? "";
    } else if (b.nilai !== null) {
      kolom.N = b.nilai;
      if (b.desimal) kolom.M = b.nilai;
    }
    // Kode kembar (catatan yang sama dua kali) diberi akhiran supaya tidak saling timpa.
    let kode = kodeBaris(b);
    for (let n = 2; terpakai.has(kode); n++) kode = `SMART-${hash8(`${kode}#${n}`)}`;
    terpakai.add(kode);
    return { kode, tab: c.tab, baris: c.sheet?.baris ?? null, kolom };
  });
}

// ── Status PRO NTB per jenis pekerjaan (kolom PRO NTB di Rekap Kinerja) ──────

/** Baris spreadsheet tanpa pasangan SMART → jenis Rekap Kinerja, dari tab + JENIS-nya. */
export function kunciDariSheet(x: BarisSheetPro): string | null {
  const tier2 = /TIER\s*-?\s*2/i.test(x.jenis);
  switch (x.tab) {
    case "WO INS JTM": return tier2 ? "jtm2" : "jtm";
    case "WO INS GARDU": return tier2 ? "igardu2" : "igardu1";
    default: return Object.entries(TAB_DARI_KUNCI).find(([, t]) => t === x.tab)?.[0] ?? null;
  }
}

export interface RingkasKunci {
  kunci: string;
  smart_n: number;
  smart_jumlah: number;
  sheet_n: number;
  sheet_jumlah: number;
  /** Jumlah WO. Tab bersatuan gardu: tiap baris = 1 (rumus spreadsheet).
   *  null = hasil cek sebelum pro-ntb-cek-wo.sql. */
  smart_wo: number | null;
  sheet_wo: number | null;
  cocok: number;
  beda: number;
  hanya_smart: number;
  hanya_sheet: number;
}

export function ringkasPerKunci(baris: BarisCek[]): RingkasKunci[] {
  const per = new Map<string, RingkasKunci>();
  const r = (k: string) => per.get(k) ?? per.set(k, {
    kunci: k, smart_n: 0, smart_jumlah: 0, sheet_n: 0, sheet_jumlah: 0, smart_wo: 0, sheet_wo: 0,
    cocok: 0, beda: 0, hanya_smart: 0, hanya_sheet: 0,
  }).get(k)!;
  for (const c of baris) {
    const k = c.smart?.item.kunci ?? (c.sheet ? kunciDariSheet(c.sheet) : null);
    if (!k) continue;
    const t = r(k);
    const rumus = TAB_WO_RUMUS.has(c.tab);
    if (c.smart) {
      t.smart_n++; t.smart_jumlah += c.smart.nilai ?? 0;
      // Yang SEHARUSNYA ada di kolom WO spreadsheet: tab gardu = 1 per baris.
      t.smart_wo = (t.smart_wo ?? 0) + (rumus ? 1 : c.smart.wo ?? 0);
    }
    if (c.sheet) { t.sheet_n++; t.sheet_jumlah += c.sheet.realisasi ?? 0; t.sheet_wo = (t.sheet_wo ?? 0) + (c.sheet.wo ?? 0); }
    if (c.status === "cocok") t.cocok++;
    else if (c.status === "beda") t.beda++;
    else if (c.status === "smart") t.hanya_smart++;
    else t.hanya_sheet++;
  }
  for (const t of per.values()) {
    t.smart_jumlah = Math.round(t.smart_jumlah * 100) / 100;
    t.sheet_jumlah = Math.round(t.sheet_jumlah * 100) / 100;
    t.smart_wo = Math.round((t.smart_wo ?? 0) * 100) / 100;
    t.sheet_wo = Math.round((t.sheet_wo ?? 0) * 100) / 100;
  }
  return [...per.values()];
}
