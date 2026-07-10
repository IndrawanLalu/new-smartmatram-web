/**
 * Parser pesan "INFO REALTIME PENORMALAN GANGGUAN 20 KV" dari Dispatcher UP2D NTB.
 * Format: satu baris per field, "Label : Value". Toleran baris kosong / field hilang.
 * Fungsi murni — tidak menyentuh DB/network, mudah dites.
 */

export interface PenormalanData {
  tanggal: string | null; // ISO yyyy-mm-dd
  section_padam: string | null;
  up3: string | null;
  ulp: string | null;
  trafo_gi: string | null;
  waktu_padam: string | null; // HH:MM:SS
  waktu_nyala: string | null;
  durasi_menit: number | null;
  relay: string | null;
  beban_kw: number | null;
  arus_r: number | null;
  arus_s: number | null;
  arus_t: number | null;
  arus_n: number | null;
  total_trip_tahun: number | null;
  ens_kwh: number | null;
  penyebab: string | null;
  eksekusi: string | null;
  cuaca: string | null;
  sumber: string | null;
  raw_text: string;
}

export interface ParseResult {
  ok: boolean;
  data: PenormalanData | null;
  errors: string[];
}

/** Tanda pengenal pesan — dipakai webhook untuk auto-deteksi (tanpa prefix "#"). */
const SIGNATURE = /INFO\s+REALTIME\s+PENORMALAN\s+GANGGUAN/i;
export function isPenormalanReport(text: string): boolean {
  return SIGNATURE.test(text);
}

const BULAN: Record<string, number> = {
  januari: 1, februari: 2, maret: 3, april: 4, mei: 5, juni: 6,
  juli: 7, agustus: 8, september: 9, oktober: 10, november: 11, desember: 12,
};

function parseTanggal(v: string | null): string | null {
  if (!v) return null;
  const m = v.match(/(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})/);
  if (!m) return null;
  const bln = BULAN[m[2].toLowerCase()];
  if (!bln) return null;
  return `${m[3]}-${String(bln).padStart(2, "0")}-${m[1].padStart(2, "0")}`;
}

function parseNum(v: string | null): number | null {
  if (!v) return null;
  const m = v.match(/-?\d+(?:[.,]\d+)?/);
  return m ? parseFloat(m[0].replace(",", ".")) : null;
}

function parseArus(v: string | null, fase: string): number | null {
  if (!v) return null;
  const m = v.match(new RegExp(`${fase}\\s*=\\s*(\\d+(?:[.,]\\d+)?)`, "i"));
  return m ? parseFloat(m[1].replace(",", ".")) : null;
}

function parseJam(v: string | null): string | null {
  if (!v) return null;
  const m = v.match(/(\d{1,2}):(\d{2})(?::(\d{2}))?/);
  if (!m) return null;
  return `${m[1].padStart(2, "0")}:${m[2]}:${m[3] ?? "00"}`;
}

function toSeconds(hms: string): number {
  const [h, m, s] = hms.split(":").map(Number);
  return h * 3600 + m * 60 + s;
}

function durasiMenit(padam: string | null, nyala: string | null): number | null {
  if (!padam || !nyala) return null;
  let diff = toSeconds(nyala) - toSeconds(padam);
  if (diff < 0) diff += 86400; // lewat tengah malam
  return Math.round((diff / 60) * 10) / 10;
}

function extractUnit(section: string | null, tag: string): string | null {
  if (!section) return null;
  const m = section.match(new RegExp(`${tag}\\s+([A-Za-z]+)`, "i"));
  return m ? m[1].toUpperCase() : null;
}

export function parsePenormalan(text: string): ParseResult {
  const pairs: [string, string][] = [];
  let sumber: string | null = null;

  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    if (/dispatcher/i.test(line) && !line.includes(":")) sumber = line;
    const idx = line.indexOf(":");
    if (idx === -1) continue;
    pairs.push([line.slice(0, idx).trim().toLowerCase(), line.slice(idx + 1).trim()]);
  }

  const pick = (...keys: string[]): string | null => {
    for (const key of keys) {
      const hit = pairs.find(([label]) => label.includes(key));
      if (hit) return hit[1] || null;
    }
    return null;
  };

  const section = pick("section padam", "section");
  const waktuPadam = parseJam(pick("waktu padam"));
  const waktuNyala = parseJam(pick("waktu nyala"));
  const arus = pick("arus");

  const data: PenormalanData = {
    tanggal: parseTanggal(pick("tanggal")),
    section_padam: section,
    up3: extractUnit(section, "UP3"),
    ulp: extractUnit(section, "ULP"),
    trafo_gi: pick("trafo/gi", "trafo", "gi"),
    waktu_padam: waktuPadam,
    waktu_nyala: waktuNyala,
    durasi_menit: durasiMenit(waktuPadam, waktuNyala),
    relay: pick("relay"),
    beban_kw: parseNum(pick("beban terdampak", "beban")),
    arus_r: parseArus(arus, "R"),
    arus_s: parseArus(arus, "S"),
    arus_t: parseArus(arus, "T"),
    arus_n: parseArus(arus, "N"),
    total_trip_tahun: parseNum(pick("total trip")),
    ens_kwh: parseNum(pick("estimasi ens", "ens")),
    penyebab: pick("penyebab padam", "penyebab"),
    eksekusi: pick("eksekusi"),
    cuaca: pick("cuaca"),
    sumber,
    raw_text: text,
  };

  // Field inti wajib ada agar baris bermakna
  const errors: string[] = [];
  if (!data.tanggal) errors.push("Tanggal tidak terbaca");
  if (!data.section_padam) errors.push("Section Padam tidak terbaca");
  if (!data.waktu_padam) errors.push("Waktu Padam tidak terbaca");

  return { ok: errors.length === 0, data, errors };
}
