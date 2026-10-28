import { supabaseAdmin } from "@/lib/supabase-admin";
import { fetchAllRows } from "@/lib/supabasePaginate";
import type { FungsiTanya } from "./jenis";

/**
 * Temuan yang masih terbuka SAAT INI (tanpa periode):
 *  - jaringan (`inspeksi`, belum Selesai & tidak dibatalkan) per kategori,
 *  - pohon (`inspeksi_pohon`, belum Selesai) per tingkat risiko,
 *  - temuan Inspeksi JTM yang belum ditugaskan (`jtm_temuan`) — yang sudah
 *    ditugaskan menjadi baris `inspeksi`, jadi tidak terhitung dua kali.
 * Bobot "temuan" 3: "temuan inspeksi jtm" harus ke sini, bukan ke Realisasi (inspeksi + jtm = 2).
 * Ada kata "urgent"/"darurat" → daftar temuan Urgent/Emergency + pohon Sangat Tinggi.
 */

interface Jaringan {
  id: string;
  ulp: string | null;
  penyulang: string | null;
  lokasi: string | null;
  deskripsi: string | null;
  temuan: string | null;
  category: string | null;
  status: string;
  tgl_inspeksi: string | null;
}
interface Pohon {
  id: string;
  ulp: string | null;
  penyulang: string | null;
  lokasi: string | null;
  jenis_pohon: string | null;
  tingkat_risiko: string | null;
  status: string;
  tgl_inspeksi: string | null;
}
interface TemuanJtm {
  tiang_id: string;
  item_kode: string;
  ulp: string | null;
  jenis: string | null;
}

const TERBUKA = ["Temuan", "Perlu Tindakan", "Ditugaskan", "Dalam Proses", "Proses"];
const MENDESAK = ["Emergency", "Urgent"];
const RISIKO = ["Sangat Tinggi", "Tinggi", "Sedang", "Rendah"];
const BATAS = 10;

const tgl = (iso: string | null) => {
  if (!iso) return "–";
  const [, m, d] = iso.split("-").map(Number);
  return `${d}/${m}`;
};
const urutTgl = <T extends { tgl_inspeksi: string | null }>(a: T, b: T) => (b.tgl_inspeksi ?? "").localeCompare(a.tgl_inspeksi ?? "");

function hitung<T>(rows: T[], kunci: (r: T) => string, urutan?: string[]) {
  const m = new Map<string, number>();
  for (const r of rows) m.set(kunci(r), (m.get(kunci(r)) ?? 0) + 1);
  const pos = (k: string) => (urutan?.indexOf(k) ?? -1) + 1 || 99;
  return [...m].sort((a, b) => pos(a[0]) - pos(b[0]) || b[1] - a[1]);
}
const ringkas = (pasangan: [string, number][]) => pasangan.map(([k, n]) => `${k} ${n}`).join(" · ");

export const temuan: FungsiTanya = {
  kode: "temuan",
  nama: "Temuan terbuka",
  saringan: ["ulp", "penyulang"],
  kata: [["temuan", 3], ["urgent", 1], ["darurat", 1], ["emergency", 1], ["belum selesai", 1], ["terbuka", 1], ["belum ditugaskan", 1]],
  contoh: ["@smart temuan urgent ampenan", "@smart temuan belum selesai cakra", "@smart temuan penyulang meninting"],
  async jalankan({ saringan: s, rapi }) {
    const [jar, pohon, jtm] = await Promise.all([
      fetchAllRows<Jaringan>(() => {
        let q = supabaseAdmin.from("inspeksi").select("id,ulp,penyulang,lokasi,deskripsi,temuan,category,status,tgl_inspeksi").in("status", TERBUKA).is("dibatalkan_at", null);
        if (s.ulp) q = q.eq("ulp", s.ulp);
        if (s.penyulang) q = q.ilike("penyulang", s.penyulang);
        return q.order("id");
      }),
      fetchAllRows<Pohon>(() => {
        let q = supabaseAdmin.from("inspeksi_pohon").select("id,ulp,penyulang,lokasi,jenis_pohon,tingkat_risiko,status,tgl_inspeksi").in("status", TERBUKA);
        if (s.ulp) q = q.eq("ulp", s.ulp);
        if (s.penyulang) q = q.ilike("penyulang", s.penyulang);
        return q.order("id");
      }),
      fetchAllRows<TemuanJtm>(() => {
        let q = supabaseAdmin.from("jtm_temuan").select("tiang_id,item_kode,ulp,jenis").eq("status_tugas", "Belum ditugaskan");
        if (s.ulp) q = q.eq("ulp", s.ulp);
        if (s.penyulang) q = q.ilike("penyulang", s.penyulang);
        return q.order("tiang_id").order("item_kode");
      }),
    ]);

    if (/\b(urgent|darurat|emergency|mendesak|sangat tinggi)\b/.test(rapi)) {
      const j = jar.filter((r) => MENDESAK.includes(r.category ?? "")).sort(urutTgl);
      const ph = pohon.filter((r) => r.tingkat_risiko === "Sangat Tinggi").sort(urutTgl);
      if (!j.length && !ph.length) return "✅ Tidak ada temuan Urgent/Emergency maupun pohon risiko Sangat Tinggi yang terbuka.";
      const L = [`🚨 *${j.length}* temuan jaringan Urgent/Emergency · 🌳 *${ph.length}* pohon Sangat Tinggi`];
      if (j.length) {
        L.push("", "⚡ *Jaringan* (terbaru):");
        j.slice(0, BATAS).forEach((r) =>
          L.push(`• ${tgl(r.tgl_inspeksi)} · ${s.ulp ? "" : `${r.ulp} · `}${r.penyulang ?? "–"} · ${r.lokasi ?? "–"}\n   ${(r.deskripsi || r.temuan || "–").trim()} _(${r.status})_`),
        );
        if (j.length > BATAS) L.push(`_…dan ${j.length - BATAS} lainnya_`);
      }
      if (ph.length) {
        L.push("", "🌳 *Pohon* (terbaru):");
        ph.slice(0, BATAS).forEach((r) => L.push(`• ${tgl(r.tgl_inspeksi)} · ${s.ulp ? "" : `${r.ulp} · `}${r.penyulang ?? "–"} · ${r.jenis_pohon ?? "pohon"} · ${r.lokasi ?? "–"} _(${r.status})_`));
        if (ph.length > BATAS) L.push(`_…dan ${ph.length - BATAS} lainnya_`);
      }
      return L.join("\n");
    }

    const tiangJtm = new Set(jtm.map((r) => r.tiang_id)).size;
    const L = [
      `⚡ *Jaringan: ${jar.length}* terbuka`,
      jar.length ? `   ${ringkas(hitung(jar, (r) => r.category ?? "–", ["Emergency", "Urgent", "Scheduled", "Normal"]))}` : null,
      jar.length ? `   ${ringkas(hitung(jar, (r) => r.status, TERBUKA))}` : null,
      "",
      `🌳 *Pohon: ${pohon.length}* terbuka`,
      pohon.length ? `   ${ringkas(hitung(pohon, (r) => r.tingkat_risiko ?? "–", RISIKO))}` : null,
      "",
      `🔎 *Inspeksi JTM belum ditugaskan: ${jtm.length}* item di ${tiangJtm} tiang`,
      jtm.length ? `   ${ringkas(hitung(jtm, (r) => r.jenis ?? "–"))}` : null,
    ];
    if (!s.ulp) {
      const per = new Map<string, number[]>();
      const tambah = (u: string | null, i: number) => {
        const v = per.get(u ?? "–") ?? [0, 0, 0];
        v[i] += 1;
        per.set(u ?? "–", v);
      };
      jar.forEach((r) => tambah(r.ulp, 0));
      pohon.forEach((r) => tambah(r.ulp, 1));
      jtm.forEach((r) => tambah(r.ulp, 2));
      L.push("", "_Per ULP (jaringan / pohon / JTM):_", ...[...per].sort((a, b) => a[0].localeCompare(b[0])).map(([u, v]) => `• ${u}: ${v.join(" / ")}`));
    }
    L.push("", "Ketik *@smart temuan urgent* untuk daftar yang mendesak.");
    return L.filter((x) => x !== null).join("\n");
  },
};
