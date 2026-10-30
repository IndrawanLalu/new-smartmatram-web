import { supabaseAdmin } from "@/lib/supabase-admin";
import { bacaKoordinat, tulisKoordinat, type HasilBaca, type Titik } from "@/lib/koordinat";

/**
 * WA japri: kirim lokasi (📎 → Lokasi) atau koordinat → gardu & JTR terdekat.
 * Hanya chat pribadi — di grup diam (keputusan user 30 Okt 2026).
 *
 * Titik → `cari_lokasi` (scripts/cari-lokasi.sql, sama dengan /peta & HP):
 * 3 gardu + 1 tiang JTR dalam 1 km. Ditambah beban pengukuran terakhir tiap
 * gardu (pola kartu #DATA) dan jarak gardu → titik menyusuri kabel JTR
 * (`jarak_jtr_ujung`, scripts/tegangan-ujung-jarak-jtr.sql).
 */

const RADIUS_M = 1000;

/** Teks yang isinya HANYA koordinat / tautan Maps (boleh diawali "lokasi"/"koordinat"/"titik").
 *  Pertanyaan biasa yang kebetulan berisi angka tetap ke Tanya Jawab. */
const HANYA_KOORDINAT = /^[-+\d\s.,;:()°'′"″NSEWUTBLnsewutbl]+$/;
const AWALAN = /^(lokasi|koordinat|titik)\s*:?\s*/i;

export function koordinatDariTeks(teks: string): HasilBaca | null {
  const s = teks.trim().replace(AWALAN, "");
  if (/https?:\/\/\S*(maps|goo\.gl)/i.test(s)) return bacaKoordinat(s);
  if (HANYA_KOORDINAT.test(s) && ((s.match(/\d+[.,]\d+/g) ?? []).length >= 2 || s.includes("°"))) return bacaKoordinat(s);
  return null;
}

interface GarduDekat { kode: string; nama: string | null; penyulang: string | null; ulp: string; daya: number | null; lat: number; lng: number; jarak: number }
interface JtrDekat { kode: string; gardu_kode: string; jurusan: string | null; ulp: string; lat: number; lng: number; jarak: number }
interface Beban { persen: number | null; kva: number | null; tanggal: string }

const meter = (m: number) => (m < 1000 ? `${Math.round(m)} m` : `${(m / 1000).toFixed(1).replace(".", ",")} km`);
const peta = (t: Titik) => `https://maps.google.com/?q=${t.lat.toFixed(6)},${t.lng.toFixed(6)}`;
const tgl = (s: string) => s.slice(0, 10).split("-").reverse().join("/");

/** Pengukuran terakhir (yang tidak dikembalikan) per gardu; kode tidak unik lintas ULP → utamakan unit yang sama. */
async function bebanTerakhir(gardu: { kode: string; ulp: string }[]): Promise<Map<string, Beban>> {
  const hasil = new Map<string, Beban>();
  if (!gardu.length) return hasil;
  const { data, error } = await supabaseAdmin.from("pengukuran_gardu")
    .select("no_gardu,petugas_unit,tanggal_pengukuran,persen_beban,beban_kva")
    .or(gardu.map((g) => `no_gardu.ilike.${g.kode.replace(/[,()%_]/g, "")}`).join(","))
    .is("dikembalikan_at", null)
    .order("tanggal_pengukuran", { ascending: false }).order("jam_pengukuran", { ascending: false, nullsFirst: false })
    .limit(200);
  if (error) throw new Error(error.message);
  for (const g of gardu) {
    const milik = (data ?? []).filter((r) => (r.no_gardu ?? "").toUpperCase() === g.kode.toUpperCase());
    const u = milik.find((r) => (r.petugas_unit ?? "").toUpperCase() === g.ulp.toUpperCase()) ?? milik[0];
    if (u) hasil.set(`${g.ulp}|${g.kode}`.toUpperCase(), { persen: u.persen_beban, kva: u.beban_kva, tanggal: u.tanggal_pengukuran });
  }
  return hasil;
}

function tulisBeban(b: Beban | undefined): string {
  if (!b) return "beban belum diukur";
  const angka = [b.persen != null ? `${Math.round(Number(b.persen))}%` : null, b.kva != null ? `${Number(b.kva).toFixed(1).replace(".", ",")} kVA` : null]
    .filter(Boolean).join(" · ");
  return `beban ${angka || "–"} (${tgl(b.tanggal)})${Number(b.persen) >= 80 ? " ⚠️" : ""}`;
}

export async function jawabLokasi(titik: Titik): Promise<string> {
  const { data, error } = await supabaseAdmin.rpc("cari_lokasi", { p_lat: titik.lat, p_lng: titik.lng, p_radius_m: RADIUS_M });
  if (error) throw new Error(error.message);
  const gardu = ((data as { gardu?: GarduDekat[] })?.gardu ?? []);
  const jtr = ((data as { jtr?: JtrDekat[] })?.jtr ?? [])[0];

  const [beban, lewatJtr] = await Promise.all([
    bebanTerakhir([...gardu, ...(jtr ? [{ kode: jtr.gardu_kode, ulp: jtr.ulp }] : [])]),
    jtr
      ? supabaseAdmin.rpc("jarak_jtr_ujung", { p_ulp: jtr.ulp, p_gardu: jtr.gardu_kode, p_lat: titik.lat, p_lng: titik.lng })
          .then((r) => (r.error || r.data == null ? null : Number(r.data)))
      : Promise.resolve(null),
  ]);
  const bebanDari = (kode: string, ulp: string) => beban.get(`${ulp}|${kode}`.toUpperCase());

  const L = [`📍 Terdekat dari ${tulisKoordinat(titik)} (radius 1 km)`, "", "*GARDU*"];
  if (!gardu.length) L.push("Tidak ada gardu dalam 1 km.");
  gardu.forEach((g, i) => {
    L.push(`${i + 1}. *${g.kode}* · ${g.nama || "–"} — ${meter(g.jarak)}`);
    L.push(`   ${[g.penyulang && `Penyulang ${g.penyulang}`, g.daya && `${g.daya} kVA`, g.ulp].filter(Boolean).join(" · ")}`);
    L.push(`   ${tulisBeban(bebanDari(g.kode, g.ulp))}`);
    L.push(`   ${peta(g)}`);
  });

  L.push("", "*JTR*");
  if (!jtr) L.push("Tidak ada tiang JTR dalam 1 km.");
  else {
    L.push(`Tiang *${jtr.kode}* · gardu ${jtr.gardu_kode}${jtr.jurusan ? ` jurusan ${jtr.jurusan}` : ""} — ${meter(jtr.jarak)} dari titik`);
    L.push(lewatJtr != null
      ? `   ± ${meter(lewatJtr)} dari gardu ${jtr.gardu_kode} menyusuri JTR`
      : `   jarak dari gardu lewat JTR belum bisa dihitung (rantai tiang belum lengkap)`);
    if (!gardu.some((g) => g.kode.toUpperCase() === jtr.gardu_kode && g.ulp.toUpperCase() === jtr.ulp.toUpperCase())) {
      L.push(`   gardu ${jtr.gardu_kode}: ${tulisBeban(bebanDari(jtr.gardu_kode, jtr.ulp))}`);
    }
    L.push(`   ${peta(jtr)}`);
  }
  return L.join("\n");
}
