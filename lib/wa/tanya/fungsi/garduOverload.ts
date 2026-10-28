import { supabaseAdmin } from "@/lib/supabase-admin";
import { fetchAllRows } from "@/lib/supabasePaginate";
import { OVERLOAD_PCT } from "@/lib/garduAmbang";
import type { FungsiTanya } from "./jenis";

interface Ukur {
  id: string;
  no_gardu: string;
  petugas_unit: string | null;
  penyulang: string | null;
  persen_beban: number | null;
  tanggal_pengukuran: string;
  jam_pengukuran: string | null;
}

const tgl = (iso: string) => {
  const [, m, d] = iso.split("-").map(Number);
  return `${d}/${m}`;
};
const pct = (p: number) => `${Math.round(p)}%`;

/**
 * Gardu overload: pengukuran TERAKHIR tiap gardu dalam periode ≥ OVERLOAD_PCT.
 * Gardu yang sempat overload lalu diukur ulang di bawah batas tidak dihitung.
 * Pengukuran yang dikembalikan admin dilewati (sama dengan kartu #DATA).
 */
export const garduOverload: FungsiTanya = {
  kode: "gardu_overload",
  nama: "Gardu overload",
  saringan: ["ulp", "periode", "penyulang"],
  kata: [["overload", 2], ["over load", 2], ["kelebihan beban", 2], ["beban lebih", 2], ["beban tinggi", 2], ["ol", 1], ["melebihi", 1]],
  contoh: ["@smart gardu overload ampenan bulan ini", "@smart overload cakra minggu ini", "@smart gardu overload september"],
  async jalankan({ saringan: s }) {
    const p = s.periode!;
    const baris = await fetchAllRows<Ukur>(() => {
      let q = supabaseAdmin
        .from("pengukuran_gardu")
        .select("id,no_gardu,petugas_unit,penyulang,persen_beban,tanggal_pengukuran,jam_pengukuran")
        .gte("tanggal_pengukuran", p.dari)
        .lte("tanggal_pengukuran", p.sampai)
        .is("dikembalikan_at", null);
      if (s.ulp) q = q.eq("petugas_unit", s.ulp);
      if (s.penyulang) q = q.ilike("penyulang", s.penyulang);
      return q.order("id");
    });

    const akhir = new Map<string, Ukur>();
    for (const r of baris) {
      const k = `${(r.petugas_unit ?? "").toUpperCase()}|${r.no_gardu.toUpperCase()}`;
      const ada = akhir.get(k);
      const waktu = `${r.tanggal_pengukuran} ${r.jam_pengukuran ?? ""}`;
      if (!ada || waktu > `${ada.tanggal_pengukuran} ${ada.jam_pengukuran ?? ""}`) akhir.set(k, r);
    }
    if (akhir.size === 0) return "Belum ada pengukuran gardu pada periode ini.";

    const ol = [...akhir.values()]
      .filter((r) => (r.persen_beban ?? 0) >= OVERLOAD_PCT)
      .sort((a, b) => (b.persen_beban ?? 0) - (a.persen_beban ?? 0));
    if (ol.length === 0) return `✅ Tidak ada gardu overload (≥${OVERLOAD_PCT}%) dari *${akhir.size}* gardu yang diukur.`;

    const L = [`🔴 *${ol.length}* gardu overload (≥${OVERLOAD_PCT}%) dari ${akhir.size} gardu yang diukur.`];
    if (!s.ulp) {
      const perUlp = new Map<string, number>();
      for (const r of ol) perUlp.set(r.petugas_unit ?? "–", (perUlp.get(r.petugas_unit ?? "–") ?? 0) + 1);
      L.push("", ...[...perUlp].sort((a, b) => b[1] - a[1]).map(([u, n]) => `• ${u}: *${n}*`), "", "_Tertinggi:_");
    } else L.push("");
    const batas = s.ulp ? 15 : 10;
    ol.slice(0, batas).forEach((r, i) =>
      L.push(`${i + 1}. *${r.no_gardu}* ${pct(r.persen_beban ?? 0)} · ${s.ulp ? "" : `${r.petugas_unit} · `}${r.penyulang ?? "–"} · ${tgl(r.tanggal_pengukuran)}`),
    );
    if (ol.length > batas) L.push(`_…dan ${ol.length - batas} lainnya_`);
    L.push("", "_Pengukuran terakhir tiap gardu dalam periode._");
    return L.join("\n");
  },
};
