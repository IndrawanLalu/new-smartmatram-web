import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchAllRows } from "@/lib/supabasePaginate";
import { JENIS_DARI_KATEGORI, kunciGardu, susunBaris, type BarisPro, type ItemPro, type KolomJenis } from "./proNtb";

/**
 * Data Copy to PRO NTB — dipakai layar (supabaseBrowser) DAN server (cek
 * PRO NTB malam & sesudah kirim, supabaseAdmin), supaya isinya sama persis:
 * `realisasi_rentang`, kolom per jenis (`pro_ntb_jenis`), label kategori
 * Pemeliharaan Jaringan, dan alamat gardu untuk LOKASI PEKERJAAN.
 *
 * Cek & Kirim ke spreadsheet memakai `ambilBarisBulan` (9 Nov 2026): baris WO
 * + realisasi sebulan dari `pro_ntb_baris` (scripts/pro-ntb-baris.sql).
 */

const POTONG = 200;

async function ambilAlamat(sb: SupabaseClient, item: ItemPro[]) {
  const kode = [...new Set(item.map((x) => x.objek.toUpperCase()))].filter((k) => k && k !== "—");
  const peta = new Map<string, string>();
  for (let i = 0; i < kode.length; i += POTONG) {
    const { data, error } = await sb.from("gardu").select("kode,ulp,alamat,nama").in("kode", kode.slice(i, i + POTONG));
    if (error) throw new Error(error.message);
    for (const g of data ?? []) {
      const a = (g.alamat || g.nama || "").trim();
      const k = kunciGardu(g.ulp ?? "", g.kode);
      if (a && !peta.has(k)) peta.set(k, a);
    }
  }
  return peta;
}

/** Label kategori Pemeliharaan Jaringan per id catatan (`sumber_id`). */
async function ambilKategori(sb: SupabaseClient, id: string[]) {
  const peta = new Map<string, string>();
  for (let i = 0; i < id.length; i += POTONG) {
    const { data, error } = await sb.from("pemeliharaan_jaringan_daftar").select("id,kategori_label").in("id", id.slice(i, i + POTONG));
    if (error) throw new Error(error.message);
    for (const r of data ?? []) if (r.kategori_label) peta.set(r.id, r.kategori_label);
  }
  return peta;
}

export interface DataPro {
  item: ItemPro[];
  alamat: Map<string, string>;
  jenis: Map<string, KolomJenis>;
}

/** Baris RPC → ItemPro + pelengkap (kategori, alamat, kolom per jenis). */
async function lengkapi(sb: SupabaseClient, rows: Record<string, unknown>[], berWo: boolean): Promise<DataPro> {
  const kolom = await sb.from("pro_ntb_jenis").select("kunci,jenis_pekerjaan,nama_tim");
  if (kolom.error) throw new Error(`Kolom per jenis gagal dibaca: ${kolom.error.message}`);
  // sumber_id Pemeliharaan Jaringan = catatannya; baris WO tugas manual tidak punya.
  const idKategori = rows.filter((r) => r.kunci === JENIS_DARI_KATEGORI && r.sumber === "pemeliharaan_jaringan" && r.sumber_id)
    .map((r) => String(r.sumber_id));
  const kategori = await ambilKategori(sb, idKategori);
  const angka = (v: unknown) => (v === null || v === undefined ? null : Number(v));
  const item: ItemPro[] = rows.map((r) => ({
    tgl: r.tgl as string,
    kunci: r.kunci as string,
    bagian: (r.bagian as string | null) ?? null,
    ulp: (r.ulp as string) ?? "",
    objek: (r.objek as string) || "—",
    rincian: (r.rincian as string | null) ?? null,
    petugas: (r.petugas as string | null) ?? null,
    waktu: r.waktu ? String(r.waktu).slice(0, 5) : null,
    km: angka(r.km),
    disetujui: !!r.disetujui,
    kategori: r.sumber_id ? kategori.get(String(r.sumber_id)) ?? null : null,
    sumber: (r.sumber as string | null) ?? null,
    sumberId: r.sumber_id ? String(r.sumber_id) : null,
    ...(berWo ? {
      wo: angka(r.wo),
      realisasi: angka(r.realisasi),
      kodeSumber: (r.kode_sumber as string | null) ?? null,
      jalur: (r.jalur as string | null) ?? null,
    } : {}),
  }));
  return {
    item,
    alamat: await ambilAlamat(sb, item),
    jenis: new Map((kolom.data as KolomJenis[]).map((k) => [k.kunci, k])),
  };
}

export async function ambilDataPro(sb: SupabaseClient, ulp: string, dari: string, sampai: string): Promise<DataPro> {
  // Diurutkan pada kunci unik: tanpa itu halaman 1.000-an berikutnya bisa
  // dobel / melompati baris (sebulan semua ULP > 1.000 baris, 27 Okt 2026).
  const rows = await fetchAllRows<Record<string, unknown>>(() =>
    sb.rpc("realisasi_rentang", { p_ulp: ulp, p_dari: dari, p_sampai: sampai }).order("tgl").order("sumber").order("sumber_id"),
  );
  return lengkapi(sb, rows, false);
}

/** Baris WO + realisasi sebulan satu ULP (`pro_ntb_baris`), bulan "YYYY-MM". */
export async function ambilBarisBulan(sb: SupabaseClient, ulp: string, bulan: string): Promise<DataPro> {
  const [y, m] = bulan.split("-").map(Number);
  const rows = await fetchAllRows<Record<string, unknown>>(() =>
    sb.rpc("pro_ntb_baris", { p_ulp: ulp, p_tahun: y, p_bulan: m }).order("kode_sumber"),
  );
  return lengkapi(sb, rows, true);
}

export const barisDariData = (d: DataPro): BarisPro[] => susunBaris(d.item, d.jenis, d.alamat);
