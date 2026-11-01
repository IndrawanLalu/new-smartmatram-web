import { supabaseAdmin } from "@/lib/supabase-admin";
import { fetchAllRows } from "@/lib/supabasePaginate";
import type { Jaringan, Titik } from "./jaringan";

/**
 * Patokan lapangan: petugas lebih cepat menemukan "LBSM BUNGKARNO" atau
 * "MM135 — JL. BUNG HATTA" daripada nomor tiang (arahan user 31 Okt 2026).
 */

export interface Patokan {
  jenis: "alat" | "gardu";
  nama: string;
  jarakM: number;
  lat: number;
  lng: number;
}

export interface Gardu { kode: string; nama: string | null; alamat: string | null; lat: number; lng: number }

const RADIUS_M = 500;
const ALAT = new Set(["recloser", "lbsm", "lbs", "fco", "sso"]);

export function jarakM(a: { lat: number | null; lng: number | null }, b: { lat: number | null; lng: number | null }): number {
  if (a.lat == null || a.lng == null || b.lat == null || b.lng == null) return Infinity;
  const r = Math.PI / 180, dl = (b.lat - a.lat) * r, dg = (b.lng - a.lng) * r;
  const s = Math.sin(dl / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(dg / 2) ** 2;
  return 2 * 6371000 * Math.asin(Math.sqrt(s));
}

export function namaTitikAlat(t: Titik): string {
  const jenis = t.penanda === "recloser" ? "REC." : (t.penanda ?? "").toUpperCase();
  return t.peralatan ? `${jenis} ${t.peralatan}`.trim() : `${jenis} (${t.kode})`;
}

/** Gardu di sekitar kumpulan titik (kotak batas + 500 m). */
export async function garduSekitar(titik: Titik[]): Promise<Gardu[]> {
  const ada = titik.filter((t) => t.lat != null && t.lng != null);
  if (!ada.length) return [];
  const pad = 0.005;
  const lat = ada.map((t) => t.lat!), lng = ada.map((t) => t.lng!);
  return fetchAllRows<Gardu>(() =>
    supabaseAdmin.from("gardu").select("kode,nama,alamat,lat,lng")
      .gte("lat", Math.min(...lat) - pad).lte("lat", Math.max(...lat) + pad)
      .gte("lng", Math.min(...lng) - pad).lte("lng", Math.max(...lng) + pad)
      .order("kode"));
}

/** Peralatan terdekat (di jaringan ini) dan gardu terdekat dari satu titik. */
export function patokanDekat(j: Jaringan, pusat: Titik, gardu: Gardu[]): Patokan[] {
  const hasil: Patokan[] = [];
  let alat: { t: Titik; d: number } | null = null;
  for (const t of j.titik.values()) {
    if (!t.penanda || !ALAT.has(t.penanda)) continue;
    const d = jarakM(pusat, t);
    if (d <= RADIUS_M && (!alat || d < alat.d)) alat = { t, d };
  }
  if (alat) hasil.push({ jenis: "alat", nama: namaTitikAlat(alat.t), jarakM: Math.round(alat.d), lat: alat.t.lat!, lng: alat.t.lng! });

  let g: { g: Gardu; d: number } | null = null;
  for (const x of gardu) {
    const d = jarakM(pusat, x);
    if (d <= RADIUS_M && (!g || d < g.d)) g = { g: x, d };
  }
  if (g) {
    const ket = (g.g.nama || g.g.alamat)?.replace(/\s+/g, " ").trim();
    hasil.push({ jenis: "gardu", nama: ket ? `${g.g.kode} — ${ket}` : g.g.kode, jarakM: Math.round(g.d), lat: g.g.lat, lng: g.g.lng });
  }
  return hasil;
}

/** Temuan JTM yang masih terbuka per tiang (kondisi terakhir tidak normal). */
export async function temuanTerbuka(ids: string[]): Promise<Map<string, { n: number; row: number }>> {
  const hasil = new Map<string, { n: number; row: number }>();
  for (let i = 0; i < ids.length; i += 150) {
    const { data, error } = await supabaseAdmin.from("tiang_kondisi_terakhir")
      .select("tiang_id,kelompok").eq("normal", false).in("tiang_id", ids.slice(i, i + 150));
    if (error) throw new Error(error.message);
    for (const x of data ?? []) {
      const h = hasil.get(x.tiang_id) ?? { n: 0, row: 0 };
      h.n++;
      if (x.kelompok === "ROW") h.row++;
      hasil.set(x.tiang_id, h);
    }
  }
  return hasil;
}
