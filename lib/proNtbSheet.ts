import { API_KEY } from "@/lib/sheets";

/**
 * Baca tab WO spreadsheet PRO NTB (8 Nov 2026, tahap 1 — BACA SAJA).
 *
 * Tiap pekerjaan punya tab sendiri (29 kolom, susunannya sama). Yang dibaca
 * hanya B..N: TANGGAL, JENIS, LOKASI, NAMA TIM, WO, REALISASI. Banyak baris
 * bolong di tengah, jadi tanggal tiap baris dibaca dulu (kolom B saja), lalu
 * hanya potongan baris yang tanggalnya masuk rentang yang diambil utuh.
 */

export const TAB_PRO_NTB = [
  "WO RABAS", "WO HARJAR", "WO INS JTM", "WO INS GARDU", "WO HARGARDU",
  "WO INS JTR", "WO IMBANG BEBAN", "WO MUTASI TRAFO", "WO UKUR GARDU",
] as const;
export type TabProNtb = (typeof TAB_PRO_NTB)[number];

export interface BarisSheetPro {
  tab: TabProNtb;
  /** Nomor baris di spreadsheet (1 = judul). */
  baris: number;
  tgl: string;
  jenis: string;
  lokasi: string;
  tim: string;
  wo: number | null;
  realisasi: number | null;
  /** KETERANGAN (AB): "SMART-xxxxxxxx" untuk baris kiriman SMART, selain itu "". */
  kode: string;
}

const BULAN = ["januari", "februari", "maret", "april", "mei", "juni", "juli", "agustus", "september", "oktober", "november", "desember"];

/** Serial tanggal Google Sheets (45293 = 2024-01-02) atau teks "02 Januari 2024" → ISO. */
function keIso(v: unknown): string | null {
  if (typeof v === "number" && v > 30000) {
    return new Date(Date.UTC(1899, 11, 30) + Math.round(v) * 86400000).toISOString().slice(0, 10);
  }
  if (typeof v === "string") {
    const m = v.trim().toLowerCase().match(/^(\d{1,2})\s+([a-z]+)\s+(\d{4})$/);
    const b = m ? BULAN.indexOf(m[2]) : -1;
    if (m && b >= 0) return `${m[3]}-${String(b + 1).padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  }
  return null;
}

const angka = (v: unknown): number | null => {
  if (typeof v === "number") return v;
  if (typeof v === "string" && v.trim()) {
    const n = Number(v.replace(/\./g, "").replace(",", "."));
    return Number.isFinite(n) ? n : null;
  }
  return null;
};
const teks = (v: unknown) => (v == null ? "" : String(v).trim());

async function batchGet(id: string, ranges: string[]): Promise<unknown[][][]> {
  const q = ranges.map((r) => `ranges=${encodeURIComponent(r)}`).join("&");
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${id}/values:batchGet?${q}` +
    `&valueRenderOption=UNFORMATTED_VALUE&dateTimeRenderOption=SERIAL_NUMBER&key=${API_KEY}`;
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) {
    const j = await res.json().catch(() => null);
    throw new Error(`Spreadsheet tidak terbaca (${res.status}): ${j?.error?.message ?? res.statusText}. ` +
      "Pastikan dibagikan \"siapa saja yang memiliki link dapat melihat\".");
  }
  const j = (await res.json()) as { valueRanges?: { values?: unknown[][] }[] };
  return (j.valueRanges ?? []).map((v) => v.values ?? []);
}

/** Baris tab WO yang TANGGAL-nya di [dari, sampai]. */
export async function bacaSheetPro(id: string, dari: string, sampai: string): Promise<BarisSheetPro[]> {
  const kolomB = await batchGet(id, TAB_PRO_NTB.map((t) => `'${t}'!B2:B`));
  const potong: { tab: TabProNtb; a: number; b: number }[] = [];
  kolomB.forEach((isi, i) => {
    let a = -1, b = -1;
    isi.forEach((r, j) => {
      const t = keIso(r[0]);
      if (t && t >= dari && t <= sampai) { if (a < 0) a = j; b = j; }
    });
    if (a >= 0) potong.push({ tab: TAB_PRO_NTB[i], a: a + 2, b: b + 2 });
  });
  if (!potong.length) return [];

  const isi = await batchGet(id, potong.map((p) => `'${p.tab}'!B${p.a}:AB${p.b}`));
  const hasil: BarisSheetPro[] = [];
  potong.forEach((p, i) => {
    isi[i].forEach((r, j) => {
      const tgl = keIso(r[0]);
      if (!tgl || tgl < dari || tgl > sampai) return;
      // B=0 TANGGAL · F=4 JENIS · G=5 LOKASI · H=6 NAMA TIM · M=11 WO · N=12 REALISASI
      hasil.push({
        tab: p.tab, baris: p.a + j, tgl,
        jenis: teks(r[4]), lokasi: teks(r[5]), tim: teks(r[6]),
        wo: angka(r[11]), realisasi: angka(r[12]),
        kode: /^SMART-[0-9a-f]{8}$/.test(teks(r[26])) ? teks(r[26]) : "",
      });
    });
  });
  return hasil;
}

/** Link atau id spreadsheet → id. */
export function idSpreadsheet(link: string): string | null {
  const m = link.trim().match(/\/spreadsheets\/d\/([A-Za-z0-9_-]{20,})/) ?? link.trim().match(/^([A-Za-z0-9_-]{30,})$/);
  return m?.[1] ?? null;
}
