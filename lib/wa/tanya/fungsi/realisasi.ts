import { supabaseAdmin } from "@/lib/supabase-admin";
import { fetchAllRows } from "@/lib/supabasePaginate";
import { META } from "@/app/admin/kinerja-yantek/_lib/kinerjaMeta";
import { keBarisBulanan, nilaiUtama } from "@/app/admin/kinerja-yantek/_lib/realisasiBulanan";
import { angkaId } from "@/app/admin/kinerja-yantek/_lib/realisasiHarian";
import { buatGambarRealisasiHarian } from "@/lib/gambar/buatRealisasiHarian";
import { ULP_SEMUA, type Periode } from "../saringan";
import type { BalasanMedia } from "../../dataGardu";
import type { FungsiTanya } from "./jenis";

/**
 * Realisasi pekerjaan (11 jenis Rekap Kinerja). Sumbernya SAMA dengan layar:
 *  - periode satu bulan penuh / bulan berjalan → `rekap_kinerja` (WO, SLA,
 *    realisasi — angka halaman Rekap Kinerja);
 *  - periode lain (hari ini, minggu ini, tanggal) → `realisasi_bulanan`
 *    (angka gambar Realisasi Harian), dijumlah per tanggal.
 * "realisasi hari ini" tanpa ULP & jenis → gambar Realisasi Harian.
 */

/** Jenis pekerjaan yang disebut di kalimat — urutan penting (tier 2 dulu). */
const POLA_JENIS: [string, RegExp][] = [
  ["perabasan", /\b(perabasan|rabas|rabasan|row)\b/],
  ["harjtm", /\b(pemeliharaan jaringan|harjar|harjtm|har jaringan)\b/],
  ["hargardu", /\b(pemeliharaan gardu|hargardu|har gardu)\b/],
  ["penyeimbangan", /\b(penyeimbangan|pemerataan|balancing)\b/],
  ["optimasi", /\boptimasi\b/],
  ["jtm2", /\bjtm\b.*\b(tier 2|t2|malam)\b|\b(tier 2|t2)\b.*\bjtm\b/],
  ["jtm", /\bjtm\b/],
  ["jtr", /\bjtr\b/],
  ["igardu2", /\binspeksi gardu\b.*\b(tier 2|t2)\b/],
  ["igardu1", /\binspeksi gardu\b/],
  ["pengukuran", /\b(pengukuran|ukur beban)\b/],
];

interface BarisRekap {
  kunci: string;
  wo_terbit: number | string | null;
  sla: number | string | null;
  realisasi: number | string | null;
}

const n = (v: number | string | null | undefined) => (v === null || v === undefined ? null : Number(v));
const persen = (r: number | null, t: number | null) => (r === null || !t ? "" : ` (${Math.round((r / t) * 100)}%)`);
const meta = (kunci: string) => META.find((m) => m.kunci === kunci)!;
const sat = (kunci: string) => meta(kunci).satuan;
const angka = (v: number | null, kunci: string) => (v === null ? "–" : angkaId(v, meta(kunci).desimal));

/** Periode = satu bulan kalender (penuh, atau berjalan s.d. hari ini). */
function satuBulan(p: Periode, hariIni: string) {
  if (!p.dari.endsWith("-01") || p.dari.slice(0, 7) !== p.sampai.slice(0, 7)) return null;
  const [y, m] = p.dari.split("-").map(Number);
  const akhir = `${p.dari.slice(0, 8)}${String(new Date(y, m, 0).getDate()).padStart(2, "0")}`;
  return p.sampai === akhir || p.sampai === hariIni ? { tahun: y, bulan: m } : null;
}

async function perBulan(ulps: string[], tahun: number, bulan: number, jenis: string | null) {
  const hasil = await Promise.all(
    ulps.map(async (u) => {
      const { data, error } = await supabaseAdmin.rpc("rekap_kinerja", { p_ulp: u, p_tahun: tahun, p_bulan: bulan });
      if (error) throw new Error(`rekap_kinerja: ${error.message}`);
      return { ulp: u, baris: (data ?? []) as BarisRekap[] };
    }),
  );
  const L: string[] = [];
  const jenisDipakai = jenis ? [jenis] : META.map((m) => m.kunci);
  for (const k of jenisDipakai) {
    const per = hasil.map((h) => ({ ulp: h.ulp, b: h.baris.find((x) => x.kunci === k) }));
    const real = per.reduce((a, x) => a + (n(x.b?.realisasi) ?? 0), 0);
    const sla = per.some((x) => n(x.b?.sla) !== null) ? per.reduce((a, x) => a + (n(x.b?.sla) ?? 0), 0) : null;
    const wo = per.reduce((a, x) => a + (n(x.b?.wo_terbit) ?? 0), 0);
    L.push(`${jenis ? "" : "• "}*${meta(k).jenis}*: ${angka(real, k)} ${sat(k)}${sla !== null ? ` · SLA ${angka(sla, k)}${persen(real, sla)}` : ""}${wo ? ` · WO ${angka(wo, k)}` : ""}`);
    if (jenis && ulps.length > 1) {
      for (const x of per) {
        const r = n(x.b?.realisasi);
        const t = n(x.b?.sla);
        L.push(`• ${x.ulp}: ${angka(r, k)}${t !== null ? ` / SLA ${angka(t, k)}${persen(r, t)}` : ""}`);
      }
    }
  }
  L.push("", "_Sama dengan halaman Rekap Kinerja. Capaian = realisasi ÷ SLA._");
  return L.join("\n");
}

async function perTanggal(p: Periode, ulp: string | null, jenis: string | null) {
  const bulan: { tahun: number; bulan: number }[] = [];
  for (let d = new Date(`${p.dari.slice(0, 7)}-01T00:00:00Z`); d.toISOString().slice(0, 10) <= p.sampai && bulan.length < 12; d.setUTCMonth(d.getUTCMonth() + 1))
    bulan.push({ tahun: d.getUTCFullYear(), bulan: d.getUTCMonth() + 1 });
  const rows = (
    await Promise.all(
      bulan.map((b) => fetchAllRows<Record<string, unknown>>(() => supabaseAdmin.rpc("realisasi_bulanan", { p_ulp: "SEMUA", p_tahun: b.tahun, p_bulan: b.bulan }).order("ulp").order("kunci").order("tgl"))),
    )
  )
    .flat()
    .map(keBarisBulanan)
    .filter((b) => b.tgl >= p.dari && b.tgl <= p.sampai && (ulp ? b.ulp === ulp : (ULP_SEMUA as readonly string[]).includes(b.ulp)) && (!jenis || b.kunci === jenis));

  const L: string[] = [];
  for (const m of META.filter((x) => !jenis || x.kunci === jenis)) {
    const b = rows.filter((r) => r.kunci === m.kunci);
    const total = b.reduce((a, r) => a + nilaiUtama(r, m.desimal), 0);
    if (!jenis && total === 0) continue;
    L.push(`${jenis ? "" : "• "}*${m.jenis}*: ${angkaId(total, m.desimal)} ${m.satuan}`);
    if (jenis && !ulp) {
      for (const u of ULP_SEMUA) L.push(`• ${u}: ${angkaId(b.filter((r) => r.ulp === u).reduce((a, r) => a + nilaiUtama(r, m.desimal), 0), m.desimal)}`);
    }
  }
  if (!L.length) return "Belum ada realisasi pekerjaan pada periode ini.";
  if (!jenis) L.unshift("_Jenis yang ada realisasinya:_");
  return L.join("\n");
}

/** Gambar Realisasi Harian (keempat ULP) → bucket, karena gateway hanya menerima URL. */
async function gambarHarian(tgl: string): Promise<BalasanMedia> {
  const { gambar } = await buatGambarRealisasiHarian(tgl);
  const png = Buffer.from(await gambar.arrayBuffer());
  const folder = "gambar-laporan/wa-tanya/realisasi-harian";
  const bucket = supabaseAdmin.storage.from("inspections");
  const { data: lama } = await bucket.list(folder);
  if (lama?.length) await bucket.remove(lama.map((x) => `${folder}/${x.name}`));
  const jalur = `${folder}/${tgl}-${Date.now()}.png`;
  const { error } = await bucket.upload(jalur, png, { contentType: "image/png", upsert: true });
  if (error) throw new Error(error.message);
  return { mediaUrl: bucket.getPublicUrl(jalur).data.publicUrl, caption: `Realisasi Harian SMART Mataram · ${tgl.split("-").reverse().join("-")}` };
}

export const realisasi: FungsiTanya = {
  kode: "realisasi",
  nama: "Realisasi pekerjaan",
  saringan: ["ulp", "periode"],
  kata: [
    ["realisasi", 2], ["capaian", 2], ["pencapaian", 2], ["progres", 2], ["progress", 2], ["kinerja", 2], ["sla", 1],
    ["perabasan", 1], ["rabas", 1], ["jtm", 1], ["jtr", 1], ["inspeksi", 1], ["pemeliharaan", 1], ["optimasi", 1], ["penyeimbangan", 1],
  ],
  contoh: ["@smart realisasi hari ini", "@smart perabasan ampenan bulan ini", "@smart capaian inspeksi jtm september", "@smart realisasi jtr cakra minggu ini"],
  async jalankan({ saringan: s, rapi }) {
    const p = s.periode!;
    const jenis = POLA_JENIS.find(([, pola]) => pola.test(rapi))?.[0] ?? null;
    const hariIni = new Date(Date.now() + 8 * 3600_000).toISOString().slice(0, 10);
    const bulan = satuBulan(p, hariIni);
    if (bulan) return perBulan(s.ulp ? [s.ulp] : [...ULP_SEMUA], bulan.tahun, bulan.bulan, jenis);
    if (p.dari === p.sampai && !s.ulp && !jenis) {
      try {
        return await gambarHarian(p.dari);
      } catch (e) {
        console.error("[tanya-wa] gambar realisasi harian:", (e as Error).message);
      }
    }
    return perTanggal(p, s.ulp, jenis);
  },
};
