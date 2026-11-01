import { supabaseAdmin } from "@/lib/supabase-admin";

/**
 * Kekuatan sumber = reaktansi Xs di bus 20 kV. Milik TRAFO GI, bukan
 * penyulang: semua penyulang dari trafo yang sama memakai angka yang sama.
 *
 * - Perkiraan: jaringan 150 kV ±2000 MVA + trafo berimpedansi 12,5 % dari
 *   kapasitasnya (mis. 60 MVA → 1,03 Ω). Rentang ±20 %.
 * - Kalibrasi: dihitung balik dari lokasi temuan gangguan OC yang diisi di web
 *   (`lokasi_gangguan_temuan.xs_hitung`). Bung Karno 28-10-2026 memberi 1,1 Ω
 *   untuk GI Ampenan Trafo #3 — dekat sekali dengan perkiraannya.
 */

export interface Sumber {
  /** "GI AMPENAN #3", atau null kalau trafo penyulang belum diketahui. */
  trafo: string | null;
  xs: number;
  rentang: [number, number];
  asal: "kalibrasi" | "perkiraan";
  /** Jumlah lokasi temuan yang membentuk kalibrasi. */
  n: number;
}

const XS_JARINGAN = 20 ** 2 / 2000;
const Z_TRAFO = 0.125;

/** "GI Ampenan Trafo #3 - 150/20 kV-60 MVA" → "GI AMPENAN #3"; "Trafo #1 GI Tanjung" → "GI TANJUNG #1". */
export function kunciTrafo(teks: string | null | undefined): string | null {
  if (!teks) return null;
  const a = teks.match(/GI\s+([A-Za-z][A-Za-z .-]*?)\s+Trafo\s*#?\s*(\d+)/i);
  if (a) return `GI ${a[1].trim().toUpperCase()} #${a[2]}`;
  const b = teks.match(/Trafo\s*#?\s*(\d+)\s+GI\s+([A-Za-z][A-Za-z .-]*)/i);
  if (b) return `GI ${b[2].trim().toUpperCase()} #${b[1]}`;
  return null;
}

const mvaDari = (teks: string | null | undefined) => Number(teks?.match(/(\d+)\s*MVA/i)?.[1]) || null;

function perkiraan(teksTrafo: string | null | undefined): Sumber {
  const mva = mvaDari(teksTrafo);
  const xs = mva ? XS_JARINGAN + (Z_TRAFO * 20 ** 2) / mva : 1.4;
  return {
    trafo: kunciTrafo(teksTrafo),
    xs,
    rentang: mva ? [xs * 0.8, xs * 1.2] : [0.8, 2.2],
    asal: "perkiraan",
    n: 0,
  };
}

/**
 * Sumber untuk satu trafo. `kecuali` = id temuan yang sedang dinilai — rapor
 * akurasi tidak boleh memakai temuannya sendiri sebagai kalibrasi.
 */
export async function sumberTrafo(teksTrafo: string | null | undefined, kecuali?: number): Promise<Sumber> {
  const dasar = perkiraan(teksTrafo);
  if (!dasar.trafo) return dasar;
  let q = supabaseAdmin.from("lokasi_gangguan_temuan").select("id,xs_hitung").eq("trafo", dasar.trafo).not("xs_hitung", "is", null);
  if (kecuali != null) q = q.neq("id", kecuali);
  const { data, error } = await q;
  if (error || !data?.length) return dasar;
  const xs = data.map((d) => Number(d.xs_hitung)).sort((a, b) => a - b);
  const tengah = xs[Math.floor(xs.length / 2)];
  // Rentang = sebaran kalibrasi + 5 % (ketidakpastian koreksi beban satu kejadian).
  return { trafo: dasar.trafo, xs: tengah, rentang: [xs[0] * 0.95, xs[xs.length - 1] * 1.05], asal: "kalibrasi", n: xs.length };
}

/** Trafo GI sebuah penyulang dari laporan dispatcher terakhirnya (sheet tidak memuat trafo). */
export async function trafoPenyulang(penyulang: string): Promise<string | null> {
  const { data } = await supabaseAdmin.from("gangguan_realtime").select("trafo_gi")
    .eq("penyulang", penyulang).not("trafo_gi", "is", null)
    .order("tanggal", { ascending: false }).limit(1);
  return (data?.[0]?.trafo_gi as string | undefined) ?? null;
}
