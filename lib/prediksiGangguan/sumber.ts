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
 * - Outlet Gardu Hubung (7 Nov 2026): di antara trafo GI dan outlet ada kabel
 *   masuk GH yang belum dititik, jadi kalibrasinya dipisah per "trafo · GH"
 *   (mis. "GI AMPENAN #1 · GH SENGGIGI"); perkiraannya dilebarkan ke atas.
 */

export interface Sumber {
  /** "GI AMPENAN #3" / "GI AMPENAN #1 · GH SENGGIGI", atau null kalau trafo belum diketahui. */
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

/** Kunci kalibrasi: trafo GI, ditambah GH bila penyulangnya outlet Gardu Hubung. */
export function kunciSumber(teksTrafo: string | null | undefined, gh?: string | null): string | null {
  const t = kunciTrafo(teksTrafo);
  return t && gh ? `${t} · ${gh}` : t;
}

/**
 * Kabel masuk GH yang belum dititik: batas atas perkiraan reaktansinya (Ω).
 * Kasar — OC OL. Kerandangan 1 Nov 2026 (±2.400 A di ≤3,6 km hilir GH
 * Senggigi) menyiratkan ±2,5 Ω kabel MVTIC Tiga Gili. Kalibrasi dari lokasi
 * temuan menggantikannya.
 */
const XS_KABEL_GH = 4;

const mvaDari = (teks: string | null | undefined) => Number(teks?.match(/(\d+)\s*MVA/i)?.[1]) || null;

function perkiraan(teksTrafo: string | null | undefined, gh?: string | null): Sumber {
  const mva = mvaDari(teksTrafo);
  const xs = mva ? XS_JARINGAN + (Z_TRAFO * 20 ** 2) / mva : 1.4;
  const tambah = gh ? XS_KABEL_GH : 0;
  return {
    trafo: kunciSumber(teksTrafo, gh),
    xs: xs + tambah / 2,
    rentang: mva ? [xs * 0.8, xs * 1.2 + tambah] : [0.8, 2.2 + tambah],
    asal: "perkiraan",
    n: 0,
  };
}

/**
 * Sumber untuk satu trafo. `kecuali` = id temuan yang sedang dinilai — rapor
 * akurasi tidak boleh memakai temuannya sendiri sebagai kalibrasi.
 */
export async function sumberTrafo(teksTrafo: string | null | undefined, kecuali?: number, gh?: string | null): Promise<Sumber> {
  const dasar = perkiraan(teksTrafo, gh);
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

/**
 * Trafo GI sebuah penyulang dari laporan dispatcher terakhirnya (sheet tidak
 * memuat trafo). Outlet GH ditulis di keypoint ("OL. KERANDANGAN - MVTIC TIGA GILI").
 */
export async function trafoPenyulang(penyulang: string): Promise<string | null> {
  const n = penyulang.replace(/"/g, "");
  const { data } = await supabaseAdmin.from("gangguan_realtime").select("trafo_gi")
    .or(`penyulang.eq."${n}",keypoint.eq."${n}"`).not("trafo_gi", "is", null)
    .order("tanggal", { ascending: false }).limit(1);
  return (data?.[0]?.trafo_gi as string | undefined) ?? null;
}
