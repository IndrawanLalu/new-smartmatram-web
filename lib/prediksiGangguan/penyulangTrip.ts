import { supabaseAdmin } from "@/lib/supabase-admin";
import { alatMilik, cariAlat, muatJaringan, namaPenyulangJtm, pangkalGh } from "./jaringan";

/**
 * Jaringan penyulang mana yang dihitung untuk satu gangguan (7 Nov 2026,
 * scripts/prediksi-penyulang-trip.sql).
 *
 * Penyulang yang masuk Gardu Hubung (MVTIC TIGA GILI → GH SENGGIGI) tidak
 * punya tiang: jaringannya tercatat di outletnya (OL. KERANDANGAN, OL.
 * SHERATON), dan yang trip biasanya PMT outlet di GH. Laporan dispatcher
 * menulisnya "OL. KERANDANGAN - MVTIC TIGA GILI" → keypoint = outlet.
 *
 * Urutan: koreksi web → nama disamakan → nama langsung → outlet GH.
 */

export type AsalPenyulang = "koreksi" | "alias" | "langsung" | "outlet" | "tidak";

export interface PenyulangTrip {
  /** Nama penyulang di data JTM; null = jaringannya belum diketahui. */
  penyulang: string | null;
  /** Alat yang trip di jaringan itu; null = dari pangkal penyulang. */
  keypoint: string | null;
  /** GH pangkal penyulang itu (OL keluaran GH), mis. "GH SENGGIGI". */
  gh: string | null;
  asal: AsalPenyulang;
  catatan: string | null;
}

const SIMPAN_MS = 10 * 60 * 1000;
let alias: { t: number; peta: Map<string, string> } | null = null;
const outletTembolok = new Map<string, { t: number; daftar: string[] }>();

const besar = (s: string) => s.toUpperCase().replace(/\s+/g, " ").trim();

/** Tembolok dibuang sesudah koreksi/alias diubah dari web. */
export function lupakanTembolokTrip() {
  alias = null;
  outletTembolok.clear();
}

async function petaAlias(): Promise<Map<string, string>> {
  if (!alias || Date.now() - alias.t > SIMPAN_MS) {
    const { data, error } = await supabaseAdmin.from("prediksi_alias_penyulang").select("nama,penyulang");
    // Tabel belum dibuat (SQL belum dijalankan) = tanpa alias.
    alias = { t: Date.now(), peta: new Map(error ? [] : (data ?? []).map((r) => [besar(r.nama), r.penyulang as string])) };
  }
  return alias.peta;
}

/** Nama laporan → nama penyulang di data JTM (alias dulu, lalu pencocokan nama). */
async function keJtm(nama: string): Promise<{ penyulang: string | null; alias: boolean }> {
  const a = (await petaAlias()).get(besar(nama));
  if (a) return { penyulang: a, alias: true };
  return { penyulang: await namaPenyulangJtm(nama), alias: false };
}

/** Punya tiang? MVTIC 3 GILI punya segmen impor tanpa satu tiang pun. */
const bertiang = async (p: string | null) => !!p && !!(await muatJaringan(p));

export async function koreksiTrip(kunci: string): Promise<{ penyulang: string; keypoint: string | null } | null> {
  const { data, error } = await supabaseAdmin.from("prediksi_koreksi_trip").select("penyulang,keypoint").eq("kunci", kunci).maybeSingle();
  if (error || !data) return null;
  return { penyulang: data.penyulang as string, keypoint: (data.keypoint as string | null) ?? null };
}

/**
 * Outlet yang pernah dilaporkan untuk penyulang masuk GH — terisi sendiri dari
 * laporan WA (keypoint) dan sheet (titik gangguan) yang menyebut OL-nya.
 */
export async function outletPenyulang(nama: string): Promise<string[]> {
  const ada = outletTembolok.get(besar(nama));
  if (ada && Date.now() - ada.t < SIMPAN_MS) return ada.daftar;
  const [wa, sheet] = await Promise.all([
    supabaseAdmin.from("gangguan_realtime").select("keypoint").ilike("penyulang", nama).not("keypoint", "is", null).limit(1000),
    supabaseAdmin.from("ml_outage_events").select("raw").ilike("penyulang", nama).limit(1000),
  ]);
  const sebut = new Set<string>();
  for (const r of wa.data ?? []) if (r.keypoint) sebut.add(besar(r.keypoint));
  for (const r of sheet.data ?? []) {
    const t = (r.raw as { titik_gangguan?: string } | null)?.titik_gangguan;
    if (t) sebut.add(besar(t));
  }
  const daftar = new Set<string>();
  for (const s of sebut) {
    const j = await keJtm(s);
    if (j.penyulang && besar(j.penyulang) !== besar(nama) && (await bertiang(j.penyulang))) daftar.add(j.penyulang);
  }
  const hasil = [...daftar].sort();
  outletTembolok.set(besar(nama), { t: Date.now(), daftar: hasil });
  return hasil;
}

export async function tentukanPenyulang(penyulang: string, keypoint: string | null, kunci?: string): Promise<PenyulangTrip> {
  if (kunci) {
    const k = await koreksiTrip(kunci);
    if (k) return { penyulang: k.penyulang, keypoint: k.keypoint, gh: await pangkalGh(k.penyulang), asal: "koreksi", catatan: null };
  }

  const langsung = await keJtm(penyulang);
  if (langsung.penyulang && (await bertiang(langsung.penyulang))) {
    return {
      penyulang: langsung.penyulang, keypoint, gh: await pangkalGh(langsung.penyulang),
      asal: langsung.alias ? "alias" : "langsung", catatan: null,
    };
  }

  // Tanpa jaringan sendiri: mungkin penyulang masuk GH.
  const ol = keypoint ? await keJtm(keypoint) : { penyulang: null, alias: false };
  if (keypoint) {
    if (ol.penyulang && (await bertiang(ol.penyulang))) {
      const gh = await pangkalGh(ol.penyulang);
      return {
        penyulang: ol.penyulang, keypoint: null, gh, asal: "outlet",
        catatan: `${penyulang} masuk ke ${gh ?? "Gardu Hubung"}; yang trip outlet ${ol.penyulang} — dihitung di jaringan outlet itu.`,
      };
    }
  }
  const outlet = await outletPenyulang(penyulang);
  if (keypoint) {
    // Alat MILIK outlet itu didahulukan: tiang bersama bisa memikul alat outlet sebelah.
    let pilih: string | null = null;
    for (const o of outlet) {
      const j = await muatJaringan(o);
      const t = j ? cariAlat(j, keypoint) : null;
      if (!j || !t) continue;
      if (alatMilik(j, t)) { pilih = o; break; }
      pilih ??= o;
    }
    if (pilih) {
      const gh = await pangkalGh(pilih);
      return {
        penyulang: pilih, keypoint, gh, asal: "outlet",
        catatan: `${keypoint} ada di jaringan ${pilih}${gh ? ` (keluaran ${gh})` : ""} — ${penyulang} masuk ke GH-nya.`,
      };
    }
  }
  if (outlet.length) {
    return {
      penyulang: null, keypoint, gh: null, asal: "tidak",
      catatan: keypoint
        ? `${keypoint} belum ditemukan di outlet ${penyulang} (${outlet.join(", ")}). Koreksi penyulang yang trip di web.`
        : `PMT ${penyulang} di GI trip — penyulang ini masuk Gardu Hubung (outlet: ${outlet.join(", ")}). Cek kabel ${penyulang} dan GH-nya dulu, lalu outletnya.`,
    };
  }
  // Ada di data JTM tapi belum bertiang (outlet OL. UDAYANA, MVTIC 3 GILI):
  // biar pesan "belum punya tiang" yang tampil.
  if (ol.penyulang) return { penyulang: ol.penyulang, keypoint: null, gh: null, asal: "outlet", catatan: null };
  return { penyulang: langsung.penyulang, keypoint, gh: null, asal: langsung.penyulang ? "langsung" : "tidak", catatan: null };
}
