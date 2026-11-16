import { supabaseBrowser } from "@/lib/supabase-browser";
import { fetchAllRows } from "@/lib/supabasePaginate";

/**
 * Gardu khusus (scripts/gardu-khusus.sql, 13 Nov 2026) — gardu yang tidak
 * dikerjakan PLN, dikeluarkan dari Inspeksi Gardu, Inspeksi JTR, dan
 * Pemeliharaan Gardu. Kode alasan sama dengan CHECK di database.
 */
export type AlasanGk = "bangunan" | "tanpa_jtr" | "pelanggan";

export const ALASAN_GK: { kode: AlasanGk; label: string }[] = [
  { kode: "bangunan", label: "Di dalam bangunan" },
  { kode: "tanpa_jtr", label: "Tanpa JTR — langsung ke kWh meter pelanggan" },
  { kode: "pelanggan", label: "Dipelihara pelanggan" },
];

export const labelAlasanGk = (k: string) => ALASAN_GK.find((a) => a.kode === k)?.label ?? k;

export const kunciGk = (kode: string, ulp: string) => `${kode.trim().toUpperCase()}|${ulp.trim().toUpperCase()}`;

/**
 * Kunci "KODE|ULP" semua gardu khusus (null = semua ULP). Dipakai penyusun WO
 * untuk tidak menawarkan gardu khusus. Gagal dibaca = kosong: layarnya tetap
 * jalan, dan database tetap melewati gardu khusus saat WO disimpan.
 */
export async function muatKunciGk(ulp: string[] | null): Promise<Set<string>> {
  try {
    const rows = await fetchAllRows<{ kode: string; ulp: string }>(() => {
      const q = supabaseBrowser.from("gardu_khusus").select("kode,ulp");
      return (ulp ? q.in("ulp", ulp.map((u) => u.toUpperCase())) : q).order("ulp").order("kode");
    });
    return new Set(rows.map((r) => kunciGk(r.kode, r.ulp)));
  } catch {
    return new Set();
  }
}
