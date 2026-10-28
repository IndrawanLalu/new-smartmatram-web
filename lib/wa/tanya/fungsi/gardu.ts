import { supabaseAdmin } from "@/lib/supabase-admin";
import { OVERLOAD_PCT } from "@/lib/garduAmbang";
import { cmdData } from "../../dataGardu";
import type { FungsiTanya } from "./jenis";

/** Kartu gambar gardu — sama dengan perintah #DATA. */
export const kartuGardu: FungsiTanya = {
  kode: "kartu_gardu",
  nama: "Kartu gardu",
  saringan: ["gardu", "ulp"],
  wajib: ["gardu"],
  kata: [["data", 1], ["kartu", 1], ["info", 1], ["informasi", 1], ["detail", 1], ["lokasi", 1]],
  contoh: ["@smart data gardu AM001", "@smart AM001"],
  jalankan: ({ saringan: s }) => cmdData(`${s.gardu}${s.ulpDisebut && s.ulp ? ` ${s.ulp}` : ""}`),
};

const angka = (v: number | null) => (v === null ? "–" : Math.round(v));
const tgl = (iso: string) => iso.split("-").reverse().join("-");

/** Pengukuran beban terakhir satu gardu (pengukuran malam). */
export const bebanGardu: FungsiTanya = {
  kode: "beban_gardu",
  nama: "Beban gardu",
  saringan: ["gardu", "ulp"],
  wajib: ["gardu"],
  kata: [["beban", 1], ["pengukuran", 1], ["ukur", 1], ["arus", 1], ["persen", 1]],
  contoh: ["@smart beban gardu GS153", "@smart pengukuran terakhir CN119"],
  async jalankan({ saringan: s }) {
    let q = supabaseAdmin
      .from("pengukuran_gardu")
      .select("no_gardu,petugas_unit,penyulang,tanggal_pengukuran,jam_pengukuran,persen_beban,beban_kva,kva_trafo,suhu_trafo,total_arus_r,total_arus_s,total_arus_t,total_arus_n,petugas_nama")
      .ilike("no_gardu", s.gardu!)
      .is("dikembalikan_at", null);
    if (s.ulpDisebut && s.ulp) q = q.eq("petugas_unit", s.ulp);
    const { data, error } = await q
      .order("tanggal_pengukuran", { ascending: false })
      .order("jam_pengukuran", { ascending: false, nullsFirst: false })
      .limit(10);
    if (error) throw new Error(error.message);
    if (!data?.length) return `❌ Belum ada pengukuran untuk gardu *${s.gardu}*.`;

    const p = data[0];
    const persen = p.persen_beban ?? 0;
    const emo = persen >= OVERLOAD_PCT ? "🔴" : persen >= 60 ? "🟡" : "🟢";
    const ulpLain = [...new Set(data.map((x) => x.petugas_unit))].filter((u) => u && u !== p.petugas_unit);
    return [
      `⚡ *${p.no_gardu}* · ${p.petugas_unit ?? "–"} · ${p.penyulang ?? "–"}`,
      `📅 ${tgl(p.tanggal_pengukuran)}${p.jam_pengukuran ? ` ${String(p.jam_pengukuran).slice(0, 5)}` : ""}`,
      `${emo} Beban *${Math.round(persen)}%* (${angka(p.beban_kva)} / ${angka(p.kva_trafo)} kVA)`,
      `⚙️ Arus R/S/T/N: ${[p.total_arus_r, p.total_arus_s, p.total_arus_t, p.total_arus_n].map(angka).join("/")} A`,
      p.suhu_trafo ? `🌡️ Suhu ${p.suhu_trafo}°C` : null,
      p.petugas_nama ? `👤 ${p.petugas_nama}` : null,
      ulpLain.length ? `\n_Kode ini juga ada di ULP ${ulpLain.join(", ")} — sebut ULP-nya bila bukan yang ini._` : null,
    ].filter((x) => x !== null).join("\n");
  },
};
