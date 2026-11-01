import { supabaseAdmin } from "@/lib/supabase-admin";
import { fetchAllRows } from "@/lib/supabasePaginate";
import { prediksiLokasi } from "./hitung";
import { daftarPeristiwa, temuanUntuk, type Peristiwa } from "./peristiwa";
import { kunciTrafo, trafoPenyulang } from "./sumber";

/**
 * Lokasi temuan gangguan yang sebenarnya, diisi UP3/admin di web — termasuk
 * gangguan lama, bertahap. Tiap temuan dinilai: masuk calon/zona atau tidak,
 * peringkatnya, dan (untuk OC) Xs hitung-balik yang menjadi kalibrasi trafo GI.
 * Penilaian memakai kalibrasi TANPA temuan itu sendiri, supaya rapornya jujur.
 */

export interface BarisTemuan {
  id: number;
  kunci: string;
  penyulang: string;
  ulp: string | null;
  tanggal: string;
  jam_padam: string | null;
  tiang_id: string | null;
  tiang_kode: string | null;
  catatan: string | null;
  trafo: string | null;
  jenis: string | null;
  xs_hitung: number | null;
  peringkat: number | null;
  jumlah_calon: number | null;
  /** Urutan saran yang memuat lokasi temuan (kelompok cabang OC / seksi EF) dan jumlah sarannya. */
  seksi_ke: number | null;
  jumlah_seksi: number | null;
  selisih_km: number | null;
  masuk_zona: boolean | null;
  dinilai_at: string | null;
  diisi_oleh: string | null;
  diisi_at: string;
}

export const KOLOM_TEMUAN =
  "id,kunci,penyulang,ulp,tanggal,jam_padam,tiang_id,tiang_kode,catatan,trafo,jenis,xs_hitung,peringkat,jumlah_calon,seksi_ke,jumlah_seksi,selisih_km,masuk_zona,dinilai_at,diisi_oleh,diisi_at";

export function daftarTemuan(dari: string, sampai: string, ulp: string | null): Promise<BarisTemuan[]> {
  return fetchAllRows<BarisTemuan>(() => {
    let q = supabaseAdmin.from("lokasi_gangguan_temuan").select(KOLOM_TEMUAN).gte("tanggal", dari).lte("tanggal", sampai);
    if (ulp) q = q.eq("ulp", ulp);
    return q.order("id");
  });
}

async function peristiwaTemuan(t: BarisTemuan): Promise<Peristiwa | null> {
  const semua = await daftarPeristiwa(t.tanggal, t.tanggal, null);
  return semua.find((p) => p.kunci === t.kunci) ?? semua.find((p) => temuanUntuk(p, [t])) ?? null;
}

/** Nilai ulang satu temuan terhadap data gangguan terkini (sheet bisa mengoreksi arus). */
export async function nilaiTemuan(t: BarisTemuan): Promise<BarisTemuan> {
  const p = await peristiwaTemuan(t);
  if (!p || !t.tiang_id) return t;
  const trafoGi = p.trafoGi ?? (await trafoPenyulang(p.penyulang));
  const h = await prediksiLokasi({
    penyulang: p.penyulang, keypoint: p.keypoint, arus: p.arus, bebanKw: p.bebanKw, trafoGi,
    kecualiTemuan: t.id, tiangTemuan: t.tiang_id,
  });
  const ubah = {
    kunci: p.kunci,
    trafo: kunciTrafo(trafoGi),
    jenis: h.bacaan.jenis,
    xs_hitung: h.uji?.xsHitung ?? null,
    peringkat: h.uji?.peringkat ?? null,
    jumlah_calon: h.calon.length || null,
    seksi_ke: h.uji?.saranKe ?? null,
    jumlah_seksi: (h.kelompok.length || h.seksi.length) || null,
    selisih_km: h.uji?.selisihKm ?? null,
    masuk_zona: h.uji?.masukZona ?? null,
    dinilai_at: new Date().toISOString(),
  };
  const { data, error } = await supabaseAdmin.from("lokasi_gangguan_temuan").update(ubah).eq("id", t.id).select(KOLOM_TEMUAN).single();
  if (error) throw new Error(error.message);
  return data as BarisTemuan;
}

/** Simpan (atau ganti) lokasi temuan satu gangguan, lalu nilai. */
export async function simpanTemuan(
  p: Peristiwa, tiang: { id: string; kode: string }, catatan: string | null, oleh: string,
): Promise<BarisTemuan> {
  const ada = temuanUntuk(p, await daftarTemuan(p.tanggal, p.tanggal, null));
  const isi = {
    kunci: p.kunci, penyulang: p.penyulang, ulp: p.ulp, tanggal: p.tanggal, jam_padam: p.jam,
    tiang_id: tiang.id, tiang_kode: tiang.kode, catatan: catatan?.trim() || null,
    diisi_oleh: oleh, diubah_at: new Date().toISOString(),
  };
  const { data, error } = ada
    ? await supabaseAdmin.from("lokasi_gangguan_temuan").update(isi).eq("id", ada.id).select(KOLOM_TEMUAN).single()
    : await supabaseAdmin.from("lokasi_gangguan_temuan").insert(isi).select(KOLOM_TEMUAN).single();
  if (error) throw new Error(error.message);
  const hasil = await nilaiTemuan(data as BarisTemuan);
  await nilaiSeTrafo(hasil.trafo, hasil.id);
  return hasil;
}

export async function hapusTemuan(p: Peristiwa): Promise<boolean> {
  const ada = temuanUntuk(p, await daftarTemuan(p.tanggal, p.tanggal, null));
  if (!ada) return false;
  const { error } = await supabaseAdmin.from("lokasi_gangguan_temuan").delete().eq("id", ada.id);
  if (error) throw new Error(error.message);
  await nilaiSeTrafo(ada.trafo, ada.id);
  return true;
}

/**
 * Temuan lain di trafo yang sama ikut dinilai ulang: kalibrasinya berubah oleh
 * temuan yang baru diisi/dihapus. Trafo lain tidak terpengaruh, jadi cukup ini —
 * "Nilai ulang semua" hanya perlu sesudah data jaringan JTM berubah.
 */
async function nilaiSeTrafo(trafo: string | null, kecuali: number): Promise<void> {
  if (!trafo) return;
  const { data, error } = await supabaseAdmin.from("lokasi_gangguan_temuan").select(KOLOM_TEMUAN).eq("trafo", trafo).neq("id", kecuali);
  if (error) throw new Error(error.message);
  for (const t of (data ?? []) as BarisTemuan[]) await nilaiTemuan(t);
}

/** Nilai ulang semua temuan (kalibrasi berubah tiap ada temuan baru). */
export async function nilaiSemuaTemuan(ulp: string | null): Promise<number> {
  const semua = await daftarTemuan("2000-01-01", "2999-12-31", ulp);
  for (const t of semua) await nilaiTemuan(t);
  return semua.length;
}
