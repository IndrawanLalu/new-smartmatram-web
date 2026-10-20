"use client";

import { useCallback, useEffect, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase-browser";
import { fetchAllRows } from "@/lib/supabasePaginate";
import type { BarisMaterial, MaterialRef } from "../_lib/materialJtr";
import type { JurusanJtr } from "./useAnalisisJtr";
import type { JenisRencana, OpsiPecah } from "../_lib/rencanaJtr";

/**
 * Usulan Perbaikan JTR (P2–P4, scripts/jtr-usulan-perbaikan.sql). Semua
 * penulisan lewat fungsi SQL (cek hak ULP di sana); sesudahnya satu baris
 * dibaca ulang dari view dan ditambal — tidak memuat ulang semuanya.
 */

export type PekerjaanUsulan = Extract<JenisRencana, "pemerataan" | "tambah-jurusan" | "ganti-kabel" | "sisip" | "naik-daya">;
export const PEKERJAAN_USULAN: PekerjaanUsulan[] = ["pemerataan", "tambah-jurusan", "ganti-kabel", "sisip", "naik-daya"];

export type TahapUsulan = "Usulan" | "Di-WO-kan" | "Dikerjakan" | "Selesai" | "WO dibatalkan" | "Batal";
export const TAHAP_USULAN: TahapUsulan[] = ["Usulan", "Di-WO-kan", "Dikerjakan", "Selesai", "WO dibatalkan", "Batal"];

export const NADA_TAHAP: Record<TahapUsulan, string> = {
  Usulan: "bg-sky-50 text-sky-700 border-sky-200",
  "Di-WO-kan": "bg-navy-50 text-navy-600 border-navy-200",
  Dikerjakan: "bg-amber-50 text-amber-700 border-amber-200",
  Selesai: "bg-emerald-50 text-emerald-700 border-emerald-200",
  "WO dibatalkan": "bg-red-50 text-red-700 border-red-200",
  Batal: "bg-gray-100 text-gray-500 border-gray-200",
};

/** Ke mana usulan diteruskan saat dijadikan WO (keputusan user 20 Okt). */
export const TUJUAN_WO: Record<PekerjaanUsulan, string> = {
  "tambah-jurusan": "Tugas HARJAR (JTR), termasuk pemasangan jurusan di PHB-TR",
  "ganti-kabel": "Tugas HARJAR (JTR)",
  pemerataan: "WO Pemerataan Beban (regu Pemerataan)",
  "naik-daya": "WO Optimasi Trafo",
  sisip: "Tidak di-WO-kan — usulan perencanaan (unduh Excel)",
};

/** Pekerjaan yang WO-nya melekat ke pengukuran gardu — perlu Bulan WO. */
export const PERLU_BULAN: PekerjaanUsulan[] = ["pemerataan", "naik-daya"];

/** Angka analisis saat usulan disimpan — tidak ikut berubah oleh pengukuran baru. */
export interface DasarUsulan {
  a_r: number | null;
  a_s: number | null;
  a_t: number | null;
  arus_maks: number | null;
  kva: number | null;
  persen_beban: number | null;
  kabel: string | null;
  kha_a: number | null;
  terjauh_m: number | null;
  jumlah_sr: number | null;
  tanggal_pengukuran: string | null;
  alasan: string[];
  rinci: string[];
}

/** Dasar usulan dari baris analisis saat ini. */
export const susunDasar = (r: JurusanJtr, alasan: string[], rinci: string[]): DasarUsulan => ({
  a_r: r.a_r, a_s: r.a_s, a_t: r.a_t, arus_maks: r.arus_maks, kva: r.kva, persen_beban: r.persen_beban,
  kabel: r.kabel, kha_a: r.kha_a, terjauh_m: r.terjauh_m, jumlah_sr: r.jumlah_sr,
  tanggal_pengukuran: r.tanggal_pengukuran, alasan, rinci,
});

export interface UsulanJtr {
  id: string;
  ulp: string;
  gardu_kode: string;
  jurusan: string;
  penyulang: string | null;
  pekerjaan: PekerjaanUsulan;
  ringkas: string;
  dasar: DasarUsulan;
  opsi: OpsiPecah | null;
  titik_lat: number | null;
  titik_lng: number | null;
  material: BarisMaterial[];
  catatan: string | null;
  status: "Usulan" | "Di-WO-kan" | "Batal";
  tahap: TahapUsulan;
  regu: string | null;
  wo_bulan: string | null;
  inspeksi_id: string | null;
  pengukuran_id: string | null;
  dibuat_oleh: string | null;
  dibuat_at: string;
  wo_oleh: string | null;
  wo_at: string | null;
  batal_alasan: string | null;
  tgl_selesai: string | null;
}

export interface SimpanUsulan {
  gardu_kode: string;
  jurusan: string;
  penyulang: string | null;
  pekerjaan: PekerjaanUsulan;
  ringkas: string;
  dasar: DasarUsulan;
  opsi: OpsiPecah | null;
  /** Tiang lokasi kerja (titik pecah / sisip) — koordinatnya dibaca di sini. */
  titik_tiang_id: string | null;
  material: BarisMaterial[];
  catatan: string;
}

/** Ganti titik pecah usulan yang belum di-WO-kan. */
export type UbahPecah = Pick<SimpanUsulan, "ringkas" | "dasar" | "opsi" | "titik_tiang_id" | "material" | "catatan">;

export const PESAN_SQL_USULAN = "Usulan perbaikan belum ada di database — jalankan scripts/jtr-usulan-perbaikan.sql di Supabase.";
const PESAN_SQL_PECAH = "Ubah titik pecah belum ada di database — jalankan scripts/jtr-usulan-ubah-pecah.sql di Supabase.";

const keUsulan = (x: Record<string, unknown>) =>
  ({ ...x, titik_lat: x.titik_lat === null ? null : Number(x.titik_lat), titik_lng: x.titik_lng === null ? null : Number(x.titik_lng) }) as UsulanJtr;

const pesan = (e: unknown) => {
  const x = e as { message?: string; code?: string };
  if (/ubah_pecah_usulan_jtr/.test(x.message ?? "")) return PESAN_SQL_PECAH;
  return x.code === "PGRST205" || x.code === "PGRST202" || /jtr_usulan|jtr_material/.test(x.message ?? "") ? PESAN_SQL_USULAN : (x.message ?? "Gagal");
};

/** Koordinat tiang lokasi kerja (titik pecah / sisip). */
async function koordTiang(id: string | null) {
  if (!id) return { titik_lat: null, titik_lng: null };
  const { data } = await supabaseBrowser.from("tiang").select("lat,lng").eq("id", id).maybeSingle();
  return data?.lat != null && data?.lng != null
    ? { titik_lat: Number(data.lat), titik_lng: Number(data.lng) }
    : { titik_lat: null, titik_lng: null };
}

export function useUsulanJtr(ulp: string) {
  const [usulan, setUsulan] = useState<UsulanJtr[]>([]);
  const [materialRef, setMaterialRef] = useState<MaterialRef[]>([]);
  const [galat, setGalat] = useState<string | null>(null);

  const muat = useCallback(async () => {
    setGalat(null);
    try {
      const [rows, ref] = await Promise.all([
        fetchAllRows<Record<string, unknown>>(() => {
          const q = supabaseBrowser.from("jtr_usulan_daftar").select("*").order("dibuat_at", { ascending: false });
          return ulp === "ALL" ? q : q.eq("ulp", ulp);
        }),
        supabaseBrowser.from("jtr_material_ref").select("*").order("pekerjaan").order("urutan"),
      ]);
      if (ref.error) throw ref.error;
      setUsulan(rows.map(keUsulan));
      setMaterialRef((ref.data ?? []).map((x) => ({ ...x, faktor: Number(x.faktor) }) as MaterialRef));
    } catch (e) {
      setGalat(pesan(e));
      setUsulan([]);
    }
  }, [ulp]);

  useEffect(() => {
    void muat();
  }, [muat]);

  const tambal = async (id: string) => {
    const { data, error } = await supabaseBrowser.from("jtr_usulan_daftar").select("*").eq("id", id).single();
    if (error) throw error;
    const baru = keUsulan(data);
    setUsulan((u) => (u.some((x) => x.id === id) ? u.map((x) => (x.id === id ? baru : x)) : [baru, ...u]));
    return baru;
  };

  const rpc = async (fn: string, arg: Record<string, unknown>) => {
    const { data, error } = await supabaseBrowser.rpc(fn, arg);
    if (error) throw new Error(pesan(error));
    return data as unknown;
  };

  const simpan = async ({ titik_tiang_id, ...isi }: SimpanUsulan, oleh: string) => {
    const id = (await rpc("simpan_usulan_jtr", { p: { ...isi, ...(await koordTiang(titik_tiang_id)) }, p_nama: oleh })) as string;
    return tambal(id);
  };

  const ubahPecah = async (id: string, { titik_tiang_id, ...isi }: UbahPecah, oleh: string) => {
    await rpc("ubah_pecah_usulan_jtr", { p_id: id, p: { ...isi, ...(await koordTiang(titik_tiang_id)) }, p_nama: oleh });
    return tambal(id);
  };

  const ubah = async (id: string, material: BarisMaterial[], catatan: string, oleh: string) => {
    await rpc("ubah_usulan_jtr", { p_id: id, p_material: material, p_catatan: catatan, p_nama: oleh });
    return tambal(id);
  };

  const jadikanWo = async (id: string, material: BarisMaterial[], catatan: string, bulan: string | null, oleh: string) => {
    await rpc("jadikan_wo_usulan_jtr", { p_id: id, p_material: material, p_catatan: catatan, p_bulan: bulan, p_nama: oleh });
    return tambal(id);
  };

  const batalkan = async (id: string, alasan: string, oleh: string) => {
    await rpc("batalkan_usulan_jtr", { p_id: id, p_alasan: alasan, p_nama: oleh });
    return tambal(id);
  };

  return { usulan, materialRef, galat, muatUlang: muat, simpan, ubah, ubahPecah, jadikanWo, batalkan, setMaterialRef };
}

export type UsulanJtrState = ReturnType<typeof useUsulanJtr>;

/** Daftar material bawaan (Pengaturan). */
export async function bacaMaterialRef(): Promise<MaterialRef[]> {
  const { data, error } = await supabaseBrowser.from("jtr_material_ref").select("*").order("pekerjaan").order("urutan");
  if (error) throw new Error(pesan(error));
  return (data ?? []).map((x) => ({ ...x, faktor: Number(x.faktor) }) as MaterialRef);
}

export type MaterialRefIsian = Omit<MaterialRef, "id"> & { id?: number };

/** Simpan daftar material bawaan: yang dihapus dari daftar ikut dihapus. Hanya UP3 (RLS). */
export async function simpanMaterialRef(awal: MaterialRef[], baru: MaterialRefIsian[]) {
  const UP3 = "Material bawaan hanya bisa diubah akun UP3.";
  const tetap = new Set(baru.map((x) => x.id).filter(Boolean));
  const hapus = awal.filter((x) => !tetap.has(x.id)).map((x) => x.id);
  if (hapus.length) {
    const { data, error } = await supabaseBrowser.from("jtr_material_ref").delete().in("id", hapus).select("id");
    if (error) throw error;
    if (!data?.length) throw new Error(UP3);
  }
  const ada = baru.filter((x) => x.id);
  if (ada.length) {
    const { data, error } = await supabaseBrowser.from("jtr_material_ref").upsert(ada).select("id");
    if (error) throw error;
    if (!data?.length) throw new Error(UP3);
  }
  const tambah = baru.filter((x) => !x.id).map((x) => ({ pekerjaan: x.pekerjaan, nama: x.nama, satuan: x.satuan, dasar: x.dasar, faktor: x.faktor, urutan: x.urutan }));
  if (tambah.length) {
    const { error } = await supabaseBrowser.from("jtr_material_ref").insert(tambah);
    if (error) throw new Error(error.code === "42501" ? UP3 : error.message);
  }
}
