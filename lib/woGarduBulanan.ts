import { supabaseBrowser } from "@/lib/supabase-browser";
import { fetchAllRows } from "@/lib/supabasePaginate";
import type { GarduPilihan } from "@/app/admin/_components/SusunWoGardu";

/**
 * Susun WO manual untuk WO gardu BULANAN — Pemeliharaan Gardu & Pengukuran
 * (W3/W4 rencana-wo-gardu-dan-inspeksi-gardu.md, 27 Okt 2026).
 *
 * WO keduanya satu per ULP per bulan, jadi gardu pilihan admin MASUK ke WO
 * bulan itu (dibuat bila belum ada), bukan WO kedua. Penyimpanannya memakai
 * `tempel_wo` yang sudah dipakai Tempel WO di Rekap Kinerja: penjaga hak ULP,
 * gardu wajib ada di master, gardu yang sudah ada di WO bulan itu dilewati,
 * kuota = isi WO.
 */

export type JenisWoBulanan = "hargardu" | "pengukuran";

const TABEL_WO: Record<JenisWoBulanan, string> = { hargardu: "wo_hargardu", pengukuran: "wo_pengukuran" };

const kunci = (ulp: string, kode: string) => `${ulp.toUpperCase()}|${kode.toUpperCase()}`;

/** Master gardu ULP + tanggal pekerjaan terakhir (pemeliharaan / pengukuran). */
export async function muatGarduBulanan(jenis: JenisWoBulanan, ulp: string): Promise<GarduPilihan[]> {
  const [master, kerja] = await Promise.all([
    // Master 2.500+ gardu — wajib paginasi (PostgREST memotong di 1.000).
    fetchAllRows<{ kode: string; nama: string | null; penyulang: string | null; ulp: string }>(() =>
      supabaseBrowser.from("gardu_master_state").select("kode,nama,penyulang,ulp").eq("ulp", ulp).order("kode")),
    jenis === "hargardu"
      ? fetchAllRows<{ kode: string; tgl: string | null }>(() =>
          supabaseBrowser.from("pemeliharaan_gardu").select("kode:gardu_kode,tgl:tgl_selesai")
            .in("status", ["Selesai", "Diverifikasi"]).eq("ulp", ulp).order("id"))
      // Baris pembawa hasil penyeimbangan bukan pengukuran rutin (sama dengan view realisasi).
      : fetchAllRows<{ kode: string; tgl: string | null }>(() =>
          supabaseBrowser.from("pengukuran_gardu").select("kode:no_gardu,tgl:tanggal_pengukuran")
            .eq("petugas_unit", ulp).is("hasil_penyeimbangan_id", null).is("dikembalikan_at", null).order("id")),
  ]);
  const terakhir = new Map<string, string>();
  for (const k of kerja) {
    if (!k.tgl) continue;
    const t = k.tgl.slice(0, 10);
    const kk = kunci(ulp, k.kode);
    if ((terakhir.get(kk) ?? "") < t) terakhir.set(kk, t);
  }
  return master.map((g) => ({
    kode: g.kode,
    nama: g.nama,
    penyulang: g.penyulang ?? "—",
    ulp: g.ulp,
    terakhir: terakhir.get(kunci(g.ulp, g.kode)) ?? null,
  }));
}

/** `ULP|KODE` yang sudah ada di WO bulan itu — disembunyikan dari pilihan. */
export async function muatTerikatBulanan(jenis: JenisWoBulanan, ulp: string, bulan: string): Promise<Set<string>> {
  const [tahun, bln] = bulan.split("-").map(Number);
  const { data: wo, error } = await supabaseBrowser.from(TABEL_WO[jenis]).select("id")
    .eq("ulp", ulp).eq("tahun", tahun).eq("bulan", bln).maybeSingle();
  if (error) throw new Error(error.message);
  if (!wo) return new Set();
  const woId = (wo as { id: string }).id;
  // Nama kolom kode gardu berbeda di kedua tabel item.
  const item = await fetchAllRows<{ kode: string }>(() =>
    jenis === "hargardu"
      ? supabaseBrowser.from("wo_hargardu_item").select("kode:gardu_kode").eq("wo_id", woId).order("id")
      : supabaseBrowser.from("wo_pengukuran_item").select("kode:kode_gardu").eq("wo_id", woId).order("id"));
  return new Set(item.map((x) => kunci(ulp, x.kode)));
}

export interface HasilTempel {
  masuk: number;
  dilewati: { objek: string; sebab: string }[];
  ditolak: { objek: string; sebab: string }[];
}

/** Masukkan gardu pilihan ke WO bulan `bulan` (YYYY-MM) ULP itu. */
export async function masukkanKeWoBulanan(
  jenis: JenisWoBulanan, ulp: string, bulan: string, gardu: string[], oleh: string,
): Promise<HasilTempel> {
  const [tahun, bln] = bulan.split("-").map(Number);
  const { data, error } = await supabaseBrowser.rpc("tempel_wo", {
    p_ulp: ulp, p_tahun: tahun, p_bulan: bln, p_jenis: jenis,
    p_item: gardu.map((objek) => ({ objek, keterangan: "Dipilih di Susun WO" })), p_oleh: oleh,
  });
  if (error) throw new Error(error.message);
  return data as HasilTempel;
}
