import { supabaseAdmin } from "@/lib/supabase-admin";
import { fetchAllRows } from "@/lib/supabasePaginate";
import type { FungsiTanya } from "./jenis";

/**
 * Tegangan ujung (`tegangan_ujung_daftar`). Dengan kode gardu: ukuran terakhir
 * tiap jurusannya. Tanpa kode: ukuran TERAKHIR tiap gardu+jurusan dalam
 * periode, yang di bawah standar didaftar. Dikembalikan/dibatalkan dilewati;
 * yang belum disetujui tetap dihitung tapi ditandai.
 */

interface Ujung {
  id: string;
  gardu_kode: string;
  ulp: string | null;
  jurusan: string | null;
  penyulang: string | null;
  v_rn: number | null;
  v_sn: number | null;
  v_tn: number | null;
  v_min: number | null;
  di_bawah_standar: boolean | null;
  tgl_ukur: string;
  jam_ukur: string | null;
  status_tampil: string | null;
}

const KOLOM = "id,gardu_kode,ulp,jurusan,penyulang,v_rn,v_sn,v_tn,v_min,di_bawah_standar,tgl_ukur,jam_ukur,status_tampil";
const LEWATI = '("Dikembalikan","Dibatalkan")';
const BATAS = 15;

const tgl = (iso: string) => {
  const [, m, d] = iso.split("-").map(Number);
  return `${d}/${m}`;
};
const volt = (u: Ujung) => [u.v_rn, u.v_sn, u.v_tn].map((v) => v ?? "–").join("/");
const belum = (u: Ujung) => (u.status_tampil === "Disetujui" ? "" : " ⏳");

/** Ukuran terakhir per kunci. */
function terakhir(rows: Ujung[], kunci: (u: Ujung) => string) {
  const m = new Map<string, Ujung>();
  for (const r of rows) {
    const ada = m.get(kunci(r));
    if (!ada || `${r.tgl_ukur} ${r.jam_ukur ?? ""}` > `${ada.tgl_ukur} ${ada.jam_ukur ?? ""}`) m.set(kunci(r), r);
  }
  return [...m.values()];
}

export const teganganUjung: FungsiTanya = {
  kode: "tegangan_ujung",
  nama: "Tegangan ujung",
  saringan: ["gardu", "ulp", "periode", "penyulang"],
  kata: [["tegangan ujung", 2], ["tegangan", 1], ["ujung", 1], ["tu", 1], ["drop", 1], ["voltase", 1], ["under voltage", 2], ["di bawah standar", 1]],
  contoh: ["@smart tegangan ujung drop ampenan bulan ini", "@smart tegangan ujung AM001"],
  async jalankan({ saringan: s }) {
    if (s.gardu) {
      let q = supabaseAdmin.from("tegangan_ujung_daftar").select(KOLOM).ilike("gardu_kode", s.gardu).not("status_tampil", "in", LEWATI);
      if (s.ulpDisebut && s.ulp) q = q.eq("ulp", s.ulp);
      const { data, error } = await q.order("tgl_ukur", { ascending: false }).limit(40);
      if (error) throw new Error(error.message);
      if (!data?.length) return `❌ Belum ada tegangan ujung untuk gardu *${s.gardu}*.`;
      const ulp = data[0].ulp;
      const jur = terakhir((data as Ujung[]).filter((u) => u.ulp === ulp), (u) => u.jurusan ?? "").sort((a, b) => (a.jurusan ?? "").localeCompare(b.jurusan ?? ""));
      return [
        `🔌 *${data[0].gardu_kode}* · ${ulp ?? "–"} · ${data[0].penyulang ?? "–"}`,
        "",
        ...jur.map((u) => `${u.di_bawah_standar ? "🔴" : "🟢"} Jurusan ${u.jurusan ?? "–"}: ${volt(u)} V · ${tgl(u.tgl_ukur)}${belum(u)}`),
        jur.some((u) => u.status_tampil !== "Disetujui") ? "\n_⏳ = belum disetujui._" : null,
      ].filter((x) => x !== null).join("\n");
    }

    const p = s.periode!;
    const rows = await fetchAllRows<Ujung>(() => {
      let q = supabaseAdmin.from("tegangan_ujung_daftar").select(KOLOM).gte("tgl_ukur", p.dari).lte("tgl_ukur", p.sampai).not("status_tampil", "in", LEWATI);
      if (s.ulp) q = q.eq("ulp", s.ulp);
      if (s.penyulang) q = q.ilike("penyulang", s.penyulang);
      return q.order("id");
    });
    if (!rows.length) return "Belum ada pengukuran tegangan ujung pada periode ini.";

    const akhir = terakhir(rows, (u) => `${u.ulp}|${u.gardu_kode.toUpperCase()}|${u.jurusan}`);
    const gardu = new Set(akhir.map((u) => `${u.ulp}|${u.gardu_kode.toUpperCase()}`)).size;
    const drop = akhir.filter((u) => u.di_bawah_standar).sort((a, b) => (a.v_min ?? 999) - (b.v_min ?? 999));
    if (!drop.length) return `✅ Tidak ada tegangan ujung di bawah standar dari *${akhir.length}* jurusan (${gardu} gardu) yang diukur.`;

    const L = [`🔴 *${drop.length}* jurusan di bawah standar dari ${akhir.length} jurusan (${gardu} gardu) yang diukur.`, ""];
    drop.slice(0, BATAS).forEach((u, i) =>
      L.push(`${i + 1}. *${u.gardu_kode}* jur ${u.jurusan ?? "–"} · ${volt(u)} V${s.ulp ? "" : ` · ${u.ulp}`} · ${u.penyulang ?? "–"} · ${tgl(u.tgl_ukur)}${belum(u)}`),
    );
    if (drop.length > BATAS) L.push(`_…dan ${drop.length - BATAS} lainnya_`);
    L.push("", "_Ukuran terakhir tiap jurusan dalam periode. ⏳ = belum disetujui._");
    return L.join("\n");
  },
};
