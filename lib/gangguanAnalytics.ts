/**
 * Analitik gangguan penyulang level-FEEDER (kolom PENYULANG), dipakai server-side
 * oleh Morning Brief untuk dipadukan dengan prediksi ML (daily_feeder_risk).
 *
 * Catatan grain: advanced-dashboard mengagregasi per PENYULANG_GANGGUAN (keypoint),
 * tetapi ML risk per FEEDER (PENYULANG). Util ini sengaja per-feeder agar join ke
 * daily_feeder_risk.penyulang via normalizeFeeder() konsisten.
 *
 * Tidak ada React di sini — murni fungsi, aman dipanggil dari route API.
 */
import { normalizeFeeder } from "./feeder";
import { classifyCause, type CauseClass } from "./causeClass";

const MONTH_ID: Record<string, number> = {
  januari: 1, februari: 2, maret: 3, april: 4, mei: 5, juni: 6,
  juli: 7, agustus: 8, september: 9, oktober: 10, november: 11, desember: 12,
};

/** TANGGAL Sheets campur: "20 Agustus 2023" | "2023-08-20" | "20/08/2023" → "YYYY-MM-DD". */
export function parseTanggalToISO(raw: string | undefined): string | null {
  const s = (raw ?? "").trim();
  if (!s) return null;

  // ISO langsung
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;

  // "DD Month YYYY"
  const idm = s.split(/\s+/);
  if (idm.length === 3) {
    const m = MONTH_ID[idm[1].toLowerCase()];
    if (m) return `${idm[2]}-${String(m).padStart(2, "0")}-${idm[0].padStart(2, "0")}`;
  }

  // "DD/MM/YYYY"
  const slash = s.split("/");
  if (slash.length === 3)
    return `${slash[2]}-${slash[1].padStart(2, "0")}-${slash[0].padStart(2, "0")}`;

  return null;
}

/** Durasi "H:MM:SS" / "MM:SS" → detik. */
function durToSecs(t: string | undefined): number {
  if (!t) return 0;
  const base = t.includes(".") ? t.split(".")[0] : t;
  const p = base.split(":").map((n) => parseInt(n) || 0);
  if (p.length === 3) return p[0] * 3600 + p[1] * 60 + p[2];
  if (p.length === 2) return p[0] * 60 + p[1];
  return p[0] ?? 0;
}

export interface GangguanEvent {
  date: string;        // YYYY-MM-DD
  feeder: string;      // normalizeFeeder(PENYULANG) — anchor join ke ML
  feederRaw: string;   // PENYULANG asli
  keypoint: string;    // PENYULANG_GANGGUAN (titik trip, untuk tampilan)
  jam: string;         // JAM PADAM
  ulp: string;
  durasiSecs: number;
  penyebabRaw: string;
}

/** Baca baris mentah Sheets gangguanPenyulang → event ternormalisasi, filter ke 1 ULP. */
export function parseGangguanRows(
  rows: Record<string, string>[] | unknown,
  opts: { ulp: string }
): GangguanEvent[] {
  if (!Array.isArray(rows)) return [];
  const want = opts.ulp.toUpperCase();
  const out: GangguanEvent[] = [];

  for (const row of rows as Record<string, string>[]) {
    if (!row || typeof row !== "object") continue;
    const ulp = (row.ULP ?? "").trim().toUpperCase();
    if (ulp !== want) continue;
    const date = parseTanggalToISO(row.TANGGAL);
    if (!date) continue;
    const feederRaw = (row.PENYULANG ?? "").trim();
    if (!feederRaw) continue;

    out.push({
      date,
      feeder: normalizeFeeder(feederRaw),
      feederRaw,
      keypoint: (row["PENYULANG GANGGUAN"] ?? row.PENYULANG_GANGGUAN ?? feederRaw).trim(),
      jam: (row["JAM PADAM"] ?? row.JAM_PADAM ?? "-").trim(),
      ulp,
      durasiSecs: durToSecs(row.DURASI),
      penyebabRaw: (row["PENYEBAB GANGGUAN"] ?? row.PENYEBAB_GANGGUAN ?? "").trim(),
    });
  }
  return out;
}

// ── Date helpers (operasi pada string YYYY-MM-DD, kebal timezone) ────────────────
function isoMinusDays(iso: string, days: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d) - days * 86400000).toISOString().slice(0, 10);
}
function prevMonthPrefix(iso: string): string {
  const [y, m] = iso.split("-").map(Number);
  const pm = m === 1 ? 12 : m - 1;
  const py = m === 1 ? y - 1 : y;
  return `${py}-${String(pm).padStart(2, "0")}`;
}

// ── Konteks per-feeder (untuk alasan penyulang merah & kuning) ────────────────────
export interface FeederContext {
  count14d: number;
  count30d: number;
  count90d: number;
  mtbfDays: number | null;       // 90 / count90, null bila data kurang
  dominantCause: CauseClass | null;
  lastDate: string | null;
}

/** Map normalizeFeeder(PENYULANG) → konteks riwayat relatif ke `nowISO`. */
export function buildFeederContext(
  events: GangguanEvent[],
  nowISO: string
): Map<string, FeederContext> {
  const d14 = isoMinusDays(nowISO, 14);
  const d30 = isoMinusDays(nowISO, 30);
  const d90 = isoMinusDays(nowISO, 90);

  const acc = new Map<string, { c14: number; c30: number; c90: number; last: string | null; causes: Record<string, number> }>();
  for (const e of events) {
    if (e.date > nowISO) continue; // abaikan tanggal di masa depan
    let a = acc.get(e.feeder);
    if (!a) { a = { c14: 0, c30: 0, c90: 0, last: null, causes: {} }; acc.set(e.feeder, a); }
    if (e.date >= d14) a.c14++;
    if (e.date >= d30) a.c30++;
    if (e.date >= d90) {
      a.c90++;
      const k = classifyCause(e.penyebabRaw);
      a.causes[k] = (a.causes[k] ?? 0) + 1;
    }
    if (!a.last || e.date > a.last) a.last = e.date;
  }

  const out = new Map<string, FeederContext>();
  for (const [feeder, a] of acc) {
    let dominantCause: CauseClass | null = null;
    let best = 0;
    for (const [k, n] of Object.entries(a.causes)) {
      if (n > best && k !== "Lain-lain") { best = n; dominantCause = k as CauseClass; }
    }
    out.set(feeder, {
      count14d: a.c14, count30d: a.c30, count90d: a.c90,
      mtbfDays: a.c90 >= 2 ? Math.round((90 / a.c90) * 10) / 10 : null,
      dominantCause, lastDate: a.last,
    });
  }
  return out;
}

// ── Sorotan Bulan Ini (recurrence/kronis + tren + Pareto) ─────────────────────────
export interface MonthHighlights {
  thisMonthTotal: number;
  lastMonthTotal: number;
  recurrence: { feeder: string; maxIn7: number }[];
  pareto: { feeder: string; count: number }[];
}

export function buildMonthHighlights(events: GangguanEvent[], nowISO: string): MonthHighlights {
  const thisPrefix = nowISO.slice(0, 7);
  const lastPrefix = prevMonthPrefix(nowISO);
  const recStart = isoMinusDays(nowISO, 45);

  let thisMonthTotal = 0;
  let lastMonthTotal = 0;
  const thisMonthByFeeder: Record<string, { raw: string; n: number }> = {};
  const recDates: Record<string, { raw: string; dates: Set<string> }> = {};

  for (const e of events) {
    if (e.date > nowISO) continue;
    if (e.date.startsWith(thisPrefix)) {
      thisMonthTotal++;
      const t = (thisMonthByFeeder[e.feeder] ??= { raw: e.feederRaw, n: 0 });
      t.n++;
    } else if (e.date.startsWith(lastPrefix)) {
      lastMonthTotal++;
    }
    if (e.date >= recStart) {
      const r = (recDates[e.feeder] ??= { raw: e.feederRaw, dates: new Set() });
      r.dates.add(e.date);
    }
  }

  // Recurrence: maxIn7 per feeder dalam 45 hari terakhir, ambil >= 3
  const recurrence = Object.values(recDates)
    .map(({ raw, dates }) => {
      const sorted = [...dates].sort();
      let maxIn7 = 0;
      for (const d0 of sorted) {
        const end = isoMinusDays(d0, -6); // d0 + 6 hari
        const n = sorted.filter((d) => d >= d0 && d <= end).length;
        if (n > maxIn7) maxIn7 = n;
      }
      return { feeder: raw, maxIn7 };
    })
    .filter((r) => r.maxIn7 >= 3)
    .sort((a, b) => b.maxIn7 - a.maxIn7)
    .slice(0, 3);

  const pareto = Object.values(thisMonthByFeeder)
    .map(({ raw, n }) => ({ feeder: raw, count: n }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 3);

  return { thisMonthTotal, lastMonthTotal, recurrence, pareto };
}
