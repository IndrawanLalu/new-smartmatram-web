/**
 * Bahan Rekonduktor JTR dari database (peta & gambar survey memakai yang sama):
 * kabel JTR satu gardu per tiang, data tiang (titik, stay, SR), aksesoris
 * kabel hasil inspeksi, material bawaan, dan pilihan kabel pengganti.
 */

import { supabaseBrowser } from "@/lib/supabase-browser";
import { fetchAllRows } from "@/lib/supabasePaginate";
import type { AksesorisKabel, DataTiangJtr, GawangKabel, MaterialRekonRef } from "@/lib/rekonduktorJtr";

export interface GarduJtr {
  kode: string;
  nama: string | null;
  ulp: string;
  lat: number;
  lng: number;
}

export interface JaringanGardu {
  gardu: GarduJtr | null;
  gawang: GawangKabel[];
  data: Map<string, DataTiangJtr>;
  aks: Map<string, AksesorisKabel>;
}

const POTONG = 150;

async function perPotong<T>(ids: string[], ambil: (p: string[]) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>) {
  const hasil: T[] = [];
  for (let i = 0; i < ids.length; i += POTONG) {
    const { data, error } = await ambil(ids.slice(i, i + POTONG));
    if (error) throw new Error(error.message);
    hasil.push(...(data ?? []));
  }
  return hasil;
}

export async function bacaJaringanGardu(kode: string): Promise<JaringanGardu> {
  const g = kode.toUpperCase();
  const [baris, gd] = await Promise.all([
    fetchAllRows<Record<string, unknown>>(() =>
      supabaseBrowser
        .from("tiang_gawang_kabel")
        .select("tiang_id,kode,jurusan,konduktor_id,nomor_kabel,jenis,ukuran,hulu_id,panjang_m")
        .ilike("gardu_kode", g)
        .order("konduktor_id"),
    ),
    supabaseBrowser.from("gardu").select("kode,nama,ulp,lat,lng").ilike("kode", g),
  ]);
  if (gd.error) throw new Error(gd.error.message);
  const gawang: GawangKabel[] = baris.map((x) => ({
    ...(x as unknown as GawangKabel),
    nomor_kabel: x.nomor_kabel == null ? null : Number(x.nomor_kabel),
    panjang_m: Number(x.panjang_m ?? 0),
  }));
  const tiangId = [...new Set(gawang.map((x) => x.tiang_id))];
  const [tiang, kabel] = await Promise.all([
    perPotong<Record<string, unknown>>(tiangId, (p) => supabaseBrowser.from("tiang").select("id,lat,lng,stay_jenis,tarikan_sr,ulp").in("id", p)),
    perPotong<Record<string, unknown>>(gawang.map((x) => x.konduktor_id), (p) =>
      supabaseBrowser.from("tiang_konduktor").select("id,aks_suspension,aks_large_angle,aks_dead_end").in("id", p),
    ),
  ]);
  const data = new Map(
    tiang
      .filter((t) => t.lat != null && t.lng != null)
      .map((t) => [t.id as string, { lat: Number(t.lat), lng: Number(t.lng), stay_jenis: (t.stay_jenis as string | null) ?? null, tarikan_sr: Number(t.tarikan_sr ?? 0) }]),
  );
  const aks = new Map(kabel.map((k) => [k.id as string, k as unknown as AksesorisKabel]));
  // Kode gardu bisa sama di dua ULP: pilih yang ULP-nya sama dengan tiangnya.
  const ulp = String(tiang[0]?.ulp ?? "").toUpperCase();
  const pilih = (gd.data ?? []).find((x) => String(x.ulp).toUpperCase() === ulp) ?? gd.data?.[0];
  const gardu = pilih && pilih.lat != null && pilih.lng != null
    ? { kode: String(pilih.kode), nama: (pilih.nama as string | null) ?? null, ulp: String(pilih.ulp), lat: Number(pilih.lat), lng: Number(pilih.lng) }
    : null;
  return { gardu, gawang, data, aks };
}

export async function bacaMaterialRekonduktor(): Promise<MaterialRekonRef[]> {
  const { data, error } = await supabaseBrowser.from("jtr_material_ref").select("nama,satuan,dasar,faktor,urutan").eq("pekerjaan", "rekonduktor").order("urutan");
  if (error) throw new Error(error.message);
  return (data ?? []).map((x) => ({ ...x, faktor: Number(x.faktor) }) as MaterialRekonRef);
}

export async function bacaOpsiKabelJtr(): Promise<{ jenis: string[]; ukuran: string[] }> {
  const { data } = await supabaseBrowser
    .from("jtr_ref")
    .select("kategori,label,urutan")
    .in("kategori", ["jenis_kabel", "ukuran_kabel"])
    .eq("aktif", true)
    .order("urutan");
  const per = (k: string) => (data ?? []).filter((x) => x.kategori === k).map((x) => x.label as string);
  return { jenis: per("jenis_kabel"), ukuran: per("ukuran_kabel") };
}
