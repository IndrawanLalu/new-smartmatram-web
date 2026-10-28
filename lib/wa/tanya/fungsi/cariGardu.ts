import { supabaseAdmin } from "@/lib/supabase-admin";
import { cmdData } from "../../dataGardu";
import type { FungsiTanya } from "./jenis";

/**
 * Cari gardu menurut alamat / nama di master (`gardu_master_state`). Sisa
 * kalimat sesudah kata kunci & ULP dibuang = kata yang dicari; SEMUA kata harus
 * ada di alamat atau nama ("yos sudarso" → kedua kata). Satu yang cocok →
 * langsung kartunya. Nama tempat yang kebetulan nama penyulang ("pagutan")
 * tetap dicari sebagai ALAMAT — yang ditanya letaknya, bukan penyulangnya.
 */

/** Kata yang tidak membedakan alamat — dibuang sebelum dicari. */
const KATA_UMUM = new Set([
  "gardu", "trafo", "di", "ke", "yg", "yang", "ada", "mana", "dimana", "apa", "saja", "aja", "nya", "no", "nomor", "kode",
  "jalan", "jln", "jl", "gg", "gang", "dekat", "depan", "sekitar", "daerah", "wilayah", "ulp", "penyulang",
]);
const BATAS = 10;

export const cariGardu: FungsiTanya = {
  kode: "cari_gardu",
  nama: "Cari gardu",
  saringan: ["ulp"],
  kata: [["cari", 2], ["alamat", 2], ["gardu di", 1], ["dimana", 2], ["di mana", 2], ["lokasi", 1], ["jalan", 1], ["jl", 1], ["dekat", 1]],
  contoh: ["@smart cari gardu jl yos sudarso", "@smart gardu di pagutan ampenan", "@smart alamat gardu kekalik"],
  async jalankan({ saringan: s, bebas }) {
    const tempat = s.penyulang ? s.penyulang.toLowerCase().replace(/^ol\.?\s*/, "") : "";
    const kata = `${bebas} ${tempat}`
      .split(" ")
      .filter((k) => !KATA_UMUM.has(k) && (k.length >= 3 || /\d/.test(k)))
      .map((k) => k.replace(/[^a-z0-9]/g, ""))
      .filter(Boolean);
    if (!kata.length) return "Sebut alamat atau nama tempatnya, mis. *@smart cari gardu jl yos sudarso*.";

    let q = supabaseAdmin.from("gardu_master_state").select("kode,ulp,nama,alamat,penyulang,kva_master", { count: "exact" });
    for (const k of kata) q = q.or(`alamat.ilike.%${k}%,nama.ilike.%${k}%`);
    if (s.ulp) q = q.ilike("ulp", s.ulp);
    const { data, count, error } = await q.order("ulp").order("kode").limit(BATAS);
    if (error) throw new Error(error.message);

    const dicari = kata.join(" ");
    if (!data?.length) return `❌ Tidak ada gardu dengan alamat/nama "${dicari}"${s.ulp ? ` di ULP ${s.ulp}` : ""}.\nCoba kata yang lebih pendek, mis. nama jalannya saja.`;
    if (data.length === 1) return cmdData(`${data[0].kode} ${data[0].ulp}`);

    const L = [`📍 *${count}* gardu cocok dengan "${dicari}":`, ""];
    data.forEach((g, i) =>
      L.push(`${i + 1}. *${g.kode}*${s.ulp ? "" : ` · ${g.ulp}`} · ${g.alamat || g.nama || "–"}${g.penyulang ? ` · ${g.penyulang}` : ""}${g.kva_master ? ` · ${g.kva_master} kVA` : ""}`),
    );
    if ((count ?? 0) > BATAS) L.push(`_…dan ${(count ?? 0) - BATAS} lainnya — perjelas alamatnya._`);
    L.push("", `Ketik *@smart ${data[0].kode}* untuk kartu gardunya.`);
    return L.join("\n");
  },
};
