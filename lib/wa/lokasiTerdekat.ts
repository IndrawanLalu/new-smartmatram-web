import { supabaseAdmin } from "@/lib/supabase-admin";
import { bacaKoordinat, tulisKoordinat, type HasilBaca, type Titik } from "@/lib/koordinat";
import { buatGambarLokasi } from "@/lib/gambar/buatLokasiTerdekat";
import type { BalasanMedia } from "./dataGardu";

/**
 * WA japri: kirim lokasi (📎 → Lokasi) atau koordinat → gardu & JTR terdekat.
 * Hanya chat pribadi — di grup diam (keputusan user 30 Okt 2026).
 *
 * Titik → `cari_lokasi` (scripts/cari-lokasi.sql, sama dengan /peta & HP):
 * 3 gardu + 1 tiang JTR dalam 1 km. Ditambah beban pengukuran terakhir tiap
 * gardu (pola kartu #DATA) dan jarak gardu → titik menyusuri kabel JTR
 * (`jarak_jtr_ujung`, scripts/tegangan-ujung-jarak-jtr.sql).
 *
 * Balasan = gambar (lib/gambar/KartuLokasiTerdekat) + tautan Maps di caption;
 * gambar gagal → teks yang sama isinya.
 */

const RADIUS_M = 1000;
const FOLDER = "gambar-laporan/lokasi-terdekat";
const SIMPAN_MS = 24 * 3600 * 1000;

/** Teks yang isinya HANYA koordinat / tautan Maps / DMS (boleh diawali "lokasi"/"koordinat"/"titik").
 *  Pertanyaan biasa yang kebetulan berisi angka tetap ke Tanya Jawab. */
const HANYA_KOORDINAT = /^[-+\d\s.,;:()°'′"″NSEWUTBLnsewutbl]+$/;
const AWALAN = /^(lokasi|koordinat|titik)\s*:?\s*/i;

export function koordinatDariTeks(teks: string): HasilBaca | null {
  const s = teks.trim().replace(AWALAN, "");
  if (/https?:\/\/\S*(maps|goo\.gl)/i.test(s)) return bacaKoordinat(s);
  if (HANYA_KOORDINAT.test(s) && ((s.match(/\d+[.,]\d+/g) ?? []).length >= 2 || s.includes("°"))) return bacaKoordinat(s);
  return null;
}

export interface Beban { persen: number | null; kva: number | null; tanggal: string }
interface GarduDekat { kode: string; nama: string | null; penyulang: string | null; ulp: string; daya: number | null; lat: number; lng: number; jarak: number }
interface JtrDekat { kode: string; gardu_kode: string; jurusan: string | null; ulp: string; lat: number; lng: number; jarak: number }

export interface LokasiTerdekat {
  titik: Titik;
  gardu: (GarduDekat & { beban?: Beban })[];
  jtr: (JtrDekat & { lewatJtr: number | null; bebanGardu?: Beban; garduDiDaftar: boolean }) | null;
}

const meter = (m: number) => (m < 1000 ? `${Math.round(m)} m` : `${(m / 1000).toFixed(1).replace(".", ",")} km`);
const peta = (t: Titik) => `https://maps.google.com/?q=${t.lat.toFixed(6)},${t.lng.toFixed(6)}`;
const tgl = (s: string) => s.slice(0, 10).split("-").reverse().join("/");
const kunci = (ulp: string, kode: string) => `${ulp}|${kode}`.toUpperCase();
const angka = (v: unknown) => (v === null || v === undefined || v === "" ? null : Number(v));

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
    if (u) hasil.set(kunci(g.ulp, g.kode), { persen: angka(u.persen_beban), kva: angka(u.beban_kva), tanggal: u.tanggal_pengukuran });
  }
  return hasil;
}

export async function ambilLokasi(titik: Titik): Promise<LokasiTerdekat> {
  const { data, error } = await supabaseAdmin.rpc("cari_lokasi", { p_lat: titik.lat, p_lng: titik.lng, p_radius_m: RADIUS_M });
  if (error) throw new Error(error.message);
  const gardu = (data as { gardu?: GarduDekat[] })?.gardu ?? [];
  const jtr = ((data as { jtr?: JtrDekat[] })?.jtr ?? [])[0];

  const [beban, lewatJtr] = await Promise.all([
    bebanTerakhir([...gardu, ...(jtr ? [{ kode: jtr.gardu_kode, ulp: jtr.ulp }] : [])]),
    jtr
      ? supabaseAdmin.rpc("jarak_jtr_ujung", { p_ulp: jtr.ulp, p_gardu: jtr.gardu_kode, p_lat: titik.lat, p_lng: titik.lng })
          .then((r) => (r.error || r.data == null ? null : Number(r.data)))
      : Promise.resolve(null),
  ]);

  return {
    titik,
    gardu: gardu.map((g) => ({ ...g, beban: beban.get(kunci(g.ulp, g.kode)) })),
    jtr: jtr
      ? {
          ...jtr, lewatJtr,
          bebanGardu: beban.get(kunci(jtr.ulp, jtr.gardu_kode)),
          garduDiDaftar: gardu.some((g) => kunci(g.ulp, g.kode) === kunci(jtr.ulp, jtr.gardu_kode)),
        }
      : null,
  };
}

function tulisBeban(b: Beban | undefined): string {
  if (!b) return "beban belum diukur";
  const isi = [b.persen != null ? `${Math.round(b.persen)}%` : null, b.kva != null ? `${b.kva.toFixed(1).replace(".", ",")} kVA` : null]
    .filter(Boolean).join(" · ");
  return `beban ${isi || "–"} (${tgl(b.tanggal)})${(b.persen ?? 0) >= 80 ? " ⚠️" : ""}`;
}

/** Balasan teks lengkap — dipakai bila gambar gagal. */
function teksLokasi(d: LokasiTerdekat): string {
  const L = [`📍 Terdekat dari ${tulisKoordinat(d.titik)} (radius 1 km)`, "", "*GARDU*"];
  if (!d.gardu.length) L.push("Tidak ada gardu dalam 1 km.");
  d.gardu.forEach((g, i) => {
    L.push(`${i + 1}. *${g.kode}* · ${g.nama || "–"} — ${meter(g.jarak)}`);
    L.push(`   ${[g.penyulang && `Penyulang ${g.penyulang}`, g.daya && `${g.daya} kVA`, g.ulp].filter(Boolean).join(" · ")}`);
    L.push(`   ${tulisBeban(g.beban)}`);
    L.push(`   ${peta(g)}`);
  });

  const j = d.jtr;
  L.push("", "*JTR*");
  if (!j) L.push("Tidak ada tiang JTR dalam 1 km.");
  else {
    L.push(`Tiang *${j.kode}* · gardu ${j.gardu_kode}${j.jurusan ? ` jurusan ${j.jurusan}` : ""} — ${meter(j.jarak)} dari titik`);
    L.push(j.lewatJtr != null
      ? `   ± ${meter(j.lewatJtr)} dari gardu ${j.gardu_kode} menyusuri JTR`
      : `   jarak dari gardu lewat JTR belum bisa dihitung (rantai tiang belum lengkap)`);
    if (!j.garduDiDaftar) L.push(`   gardu ${j.gardu_kode}: ${tulisBeban(j.bebanGardu)}`);
    L.push(`   ${peta(j)}`);
  }
  return L.join("\n");
}

/** Caption gambar: tautan Maps (gambar tidak bisa diklik). */
function caption(d: LokasiTerdekat): string {
  const L = [`📍 Terdekat dari ${tulisKoordinat(d.titik)}`];
  d.gardu.forEach((g, i) => L.push(`${i + 1}. *${g.kode}* ${peta(g)}`));
  if (d.jtr) L.push(`JTR *${d.jtr.kode}* ${peta(d.jtr)}`);
  return L.join("\n");
}

/** Simpan PNG ke bucket (gateway hanya menerima mediaUrl); berkas > 1 hari dibuang. */
async function simpanGambar(png: Buffer): Promise<string> {
  const bucket = supabaseAdmin.storage.from("inspections");
  const { data: lama } = await bucket.list(FOLDER, { limit: 1000 });
  const basi = (lama ?? []).filter((x) => x.created_at && Date.now() - new Date(x.created_at).getTime() > SIMPAN_MS);
  if (basi.length) await bucket.remove(basi.map((x) => `${FOLDER}/${x.name}`));
  const jalur = `${FOLDER}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.png`;
  const { error } = await bucket.upload(jalur, png, { contentType: "image/png", upsert: true });
  if (error) throw new Error(`simpan gambar gagal: ${error.message}`);
  return bucket.getPublicUrl(jalur).data.publicUrl;
}

export async function jawabLokasi(titik: Titik): Promise<string | BalasanMedia> {
  const d = await ambilLokasi(titik);
  if (!d.gardu.length && !d.jtr) return `📍 ${tulisKoordinat(titik)}\nTidak ada gardu maupun tiang JTR dalam 1 km dari titik ini.`;
  try {
    return { mediaUrl: await simpanGambar(await buatGambarLokasi(d)), caption: caption(d) };
  } catch (e) {
    console.error("[wa-lokasi] gambar gagal:", (e as Error).message);
    return teksLokasi(d);
  }
}
