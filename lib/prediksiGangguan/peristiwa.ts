import { supabaseAdmin } from "@/lib/supabase-admin";
import { fetchAllRows } from "@/lib/supabasePaginate";
import type { Arus } from "./arus";

/**
 * Satu gangguan dari dua sumber (arahan user 31 Okt 2026):
 * - WA (`gangguan_realtime`) datang lebih dulu — untuk penelusuran cepat;
 * - Sheet `gangguanPenyulang` (→ `ml_outage_events`, ditarik pipeline ML tiap
 *   malam) datang belakangan dan BENAR: kalau ada, angkanya yang dipakai.
 * Dicocokkan lewat penyulang (atau keypoint) + tanggal + jam padam ±20 menit.
 * Kunci: "S|<dedup_key sheet>" atau "W|<id gangguan_realtime>".
 */

export interface Peristiwa {
  kunci: string;
  sumber: "sheet" | "wa" | "sheet+wa";
  penyulang: string;
  ulp: string | null;
  tanggal: string;
  jam: string | null;
  keypoint: string | null;
  arus: Arus;
  bebanKw: number | null;
  trafoGi: string | null;
  relay: string | null;
  kode: string | null;
  penyebab: string | null;
}

interface BarisSheet {
  dedup_key: string; ulp: string | null; penyulang: string; tgl_gangguan: string; jam_padam: string | null;
  kode: string | null; penyebab: string | null;
  arus_r: number | null; arus_s: number | null; arus_t: number | null; arus_n: number | null;
  raw: { titik_gangguan?: string } | null;
}
interface BarisWa {
  id: number; ulp: string | null; penyulang: string | null; tanggal: string; waktu_padam: string | null;
  keypoint: string | null; trafo_gi: string | null; relay: string | null; beban_kw: number | null; penyebab: string | null;
  arus_r: number | null; arus_s: number | null; arus_t: number | null; arus_n: number | null;
}

const K_SHEET = "dedup_key,ulp,penyulang,tgl_gangguan,jam_padam,kode,penyebab,arus_r,arus_s,arus_t,arus_n,raw";
const K_WA = "id,ulp,penyulang,tanggal,waktu_padam,keypoint,trafo_gi,relay,beban_kw,penyebab,arus_r,arus_s,arus_t,arus_n";
/** Laporan dispatcher yang bukan gangguan tidak diprediksi. */
export const BUKAN_GANGGUAN = ["Pekerjaan Terencana", "Pekerjaan Padam Emergency"];
const SELISIH_MENIT = 20;

const angka = (v: unknown) => (v == null || v === "" ? null : Number(v));
const ringkas = (s: string | null | undefined) =>
  (s ?? "").toUpperCase().replace(/^(OL|IN|REC|LBSM)\.?\s+/, "").replace(/\bTIGA\b/g, "3").replace(/[^A-Z0-9]/g, "");
const menit = (jam: string | null) => (jam ? Number(jam.slice(0, 2)) * 60 + Number(jam.slice(3, 5)) : null);
const pakaiAlat = (s: string) => /^(REC|LBSM|LBS|OL)\.?\s/i.test(s);

export function cocokWaktu(a: string | null, b: string | null): boolean {
  const x = menit(a), y = menit(b);
  return x == null || y == null || Math.abs(x - y) <= SELISIH_MENIT;
}

function dariSheet(s: BarisSheet): Peristiwa {
  const titik = s.raw?.titik_gangguan?.trim() || null;
  return {
    kunci: `S|${s.dedup_key}`, sumber: "sheet", penyulang: s.penyulang, ulp: s.ulp, tanggal: s.tgl_gangguan,
    jam: s.jam_padam, keypoint: titik ?? (pakaiAlat(s.penyulang) ? s.penyulang : null),
    arus: { r: angka(s.arus_r), s: angka(s.arus_s), t: angka(s.arus_t), n: angka(s.arus_n) },
    bebanKw: null, trafoGi: null, relay: null, kode: s.kode, penyebab: s.penyebab,
  };
}

function dariWa(w: BarisWa): Peristiwa {
  return {
    kunci: `W|${w.id}`, sumber: "wa", penyulang: w.penyulang ?? w.keypoint ?? "-", ulp: w.ulp, tanggal: w.tanggal,
    jam: w.waktu_padam, keypoint: w.keypoint,
    arus: { r: angka(w.arus_r), s: angka(w.arus_s), t: angka(w.arus_t), n: angka(w.arus_n) },
    bebanKw: angka(w.beban_kw), trafoGi: w.trafo_gi, relay: w.relay, kode: null, penyebab: w.penyebab,
  };
}

const samaGangguan = (s: Peristiwa, w: Peristiwa) =>
  s.tanggal === w.tanggal && cocokWaktu(s.jam, w.jam) &&
  (ringkas(s.penyulang) === ringkas(w.penyulang) || (!!s.keypoint && ringkas(s.keypoint) === ringkas(w.keypoint)));

/** Sheet menimpa WA; WA menyumbang yang tidak ada di sheet (trafo, relay, beban). */
function gabung(s: Peristiwa, w: Peristiwa): Peristiwa {
  const adaArus = [s.arus.r, s.arus.s, s.arus.t, s.arus.n].some((v) => v != null);
  return {
    ...s,
    sumber: "sheet+wa",
    // Sheet kadang menulis recloser di kolom penyulang ("REC. TATO"): pakai penyulang WA.
    penyulang: pakaiAlat(s.penyulang) && w.penyulang ? w.penyulang : s.penyulang,
    keypoint: s.keypoint ?? w.keypoint,
    arus: adaArus ? s.arus : w.arus,
    bebanKw: w.bebanKw, trafoGi: w.trafoGi, relay: w.relay,
  };
}

function rakit(sheet: Peristiwa[], wa: Peristiwa[]): Peristiwa[] {
  const terpakai = new Set<string>();
  const hasil = sheet.map((s) => {
    const w = wa.find((x) => !terpakai.has(x.kunci) && samaGangguan(s, x));
    if (!w) return s;
    terpakai.add(w.kunci);
    return gabung(s, w);
  });
  return [...hasil, ...wa.filter((w) => !terpakai.has(w.kunci))]
    .sort((a, b) => (b.tanggal + (b.jam ?? "")).localeCompare(a.tanggal + (a.jam ?? "")));
}

export async function daftarPeristiwa(dari: string, sampai: string, ulp: string | null): Promise<Peristiwa[]> {
  const [sheet, wa] = await Promise.all([
    fetchAllRows<BarisSheet>(() => {
      // Hanya baris asal sheet: kejadian padam_apkt yang berdiri sendiri tidak punya arus,
      // penyulangnya berisi nama recloser, dan jamnya bergeser 1 jam — duplikat semu.
      let q = supabaseAdmin.from("ml_outage_events").select(K_SHEET).in("source", ["sheets", "merged"])
        .gte("tgl_gangguan", dari).lte("tgl_gangguan", sampai);
      if (ulp) q = q.eq("ulp", ulp);
      return q.order("dedup_key");
    }),
    fetchAllRows<BarisWa>(() => {
      let q = supabaseAdmin.from("gangguan_realtime").select(K_WA).gte("tanggal", dari).lte("tanggal", sampai)
        .not("jenis", "in", `(${BUKAN_GANGGUAN.map((j) => `"${j}"`).join(",")})`);
      if (ulp) q = q.eq("ulp", ulp);
      return q.order("id");
    }),
  ]);
  return rakit(sheet.map(dariSheet), wa.map(dariWa));
}

export async function ambilPeristiwa(kunci: string): Promise<Peristiwa | null> {
  const isi = kunci.slice(2);
  let tanggal: string | null = null;
  let wa: Peristiwa | null = null;
  if (kunci.startsWith("S|")) {
    const { data } = await supabaseAdmin.from("ml_outage_events").select("tgl_gangguan").eq("dedup_key", isi).maybeSingle();
    tanggal = data?.tgl_gangguan ?? null;
  } else if (kunci.startsWith("W|")) {
    const { data } = await supabaseAdmin.from("gangguan_realtime").select(K_WA).eq("id", Number(isi)).maybeSingle<BarisWa>();
    wa = data ? dariWa(data) : null;
    tanggal = wa?.tanggal ?? null;
  }
  if (!tanggal) return null;
  const semua = await daftarPeristiwa(tanggal, tanggal, null);
  // Laporan WA yang sudah tergabung dengan sheet tetap ditemukan lewat kunci WA-nya.
  return semua.find((p) => p.kunci === kunci)
    ?? (wa ? semua.find((p) => p.sumber === "sheet+wa" && samaGangguan(p, wa)) ?? null : null);
}

/** Peristiwa yang dicatat sebagai lokasi temuan: kunci yang sama, atau gangguan yang sama (WA → sheet). */
export function temuanUntuk<T extends { kunci: string; penyulang: string; tanggal: string; jam_padam: string | null }>(
  p: Peristiwa, temuan: T[],
): T | undefined {
  return temuan.find((t) => t.kunci === p.kunci)
    ?? temuan.find((t) => t.tanggal === p.tanggal && cocokWaktu(t.jam_padam, p.jam) && ringkas(t.penyulang) === ringkas(p.penyulang));
}
