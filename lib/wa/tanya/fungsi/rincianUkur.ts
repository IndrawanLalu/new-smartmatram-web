import { supabaseAdmin } from "@/lib/supabase-admin";
import { fetchAllRows } from "@/lib/supabasePaginate";

/**
 * Rincian WO Pengukuran beban & tegangan ujung — angka yang SAMA dengan baris
 * kecil di Rekap Kinerja (`rekap_pengukuran_rincian`). Dipakai Tegangan ujung
 * ("belum diukur") dan Realisasi pengukuran.
 */

interface Rincian {
  diukur: number;
  tu_disetujui: number;
  tertahan_titik: number;
  tu_menunggu: number;
  tu_belum: number;
}

interface GarduBelum {
  kode_gardu: string;
  ulp: string;
  penyulang: string | null;
  tgl_realisasi: string | null;
  petugas_nama: string | null;
  pengukuran_id: string;
}

const tgl = (iso: string | null) => {
  if (!iso) return "–";
  const [, m, d] = iso.slice(0, 10).split("-").map(Number);
  return `${d}/${m}`;
};

async function satuUlp(ulp: string, tahun: number, bulan: number): Promise<Rincian | null> {
  const { data, error } = await supabaseAdmin.rpc("rekap_pengukuran_rincian", { p_ulp: ulp, p_tahun: tahun, p_bulan: bulan });
  if (error) throw new Error(`rekap_pengukuran_rincian: ${error.message}`);
  return ((data ?? []) as Rincian[])[0] ?? null;
}

const barisRincian = (r: Rincian) =>
  `✅ TU disetujui ${r.tu_disetujui} · ⏳ menunggu persetujuan ${r.tu_menunggu} · 📍 tertahan titik/kVA ${r.tertahan_titik} · ❌ *TU belum diukur ${r.tu_belum}*`;

/** Baris rincian per ULP (satu ULP = dua baris, banyak ULP = satu baris per ULP) + jumlahnya. */
export async function rincianUkur(ulps: string[], tahun: number, bulan: number) {
  const semua = (await Promise.all(ulps.map(async (u) => ({ u, r: await satuUlp(u, tahun, bulan) })))).filter(
    (x): x is { u: string; r: Rincian } => !!x.r?.diukur,
  );
  const diukur = semua.reduce((a, x) => a + x.r.diukur, 0);
  const belum = semua.reduce((a, x) => a + x.r.tu_belum, 0);
  const baris =
    ulps.length === 1
      ? semua.map(({ r }) => [`📏 Beban sudah diukur *${r.diukur}* gardu WO:`, `   ${barisRincian(r)}`]).flat()
      : semua.length
        ? [
            "📏 Gardu WO yang bebannya sudah diukur:",
            ...semua.map(({ u, r }) => `• *${u}*: ${r.diukur} gardu — ✅ ${r.tu_disetujui} · ⏳ ${r.tu_menunggu} · 📍 ${r.tertahan_titik} · ❌ *${r.tu_belum}*`),
            "_✅ TU disetujui · ⏳ menunggu persetujuan · 📍 tertahan titik/kVA · ❌ TU belum diukur_",
          ]
        : [];
  return { baris, diukur, belum };
}

/**
 * Gardu WO yang bebannya sudah diukur tapi tegangan ujungnya belum dikirim
 * (atau dikembalikan) — aturan `tu_belum` di rekap_pengukuran_rincian.
 * Urut dari pengukuran beban yang paling lama.
 */
export async function garduBelumTu(ulp: string | null, tahun: number, bulan: number): Promise<GarduBelum[]> {
  const rows = await fetchAllRows<GarduBelum>(() => {
    let q = supabaseAdmin
      .from("wo_pengukuran_realisasi")
      .select("kode_gardu,ulp,penyulang,tgl_realisasi,petugas_nama,pengukuran_id")
      .eq("tahun", tahun)
      .eq("menunggu_tegangan_ujung", true)
      .not("pengukuran_id", "is", null);
    if (bulan) q = q.eq("bulan", bulan);
    if (ulp) q = q.eq("ulp", ulp);
    return q.order("id");
  });
  if (!rows.length) return [];
  const terkirim = new Set<string>();
  for (let i = 0; i < rows.length; i += 200) {
    const { data, error } = await supabaseAdmin
      .from("pengukuran_tegangan_ujung")
      .select("pengukuran_id")
      .eq("status", "Terkirim")
      .in("pengukuran_id", rows.slice(i, i + 200).map((r) => r.pengukuran_id));
    if (error) throw new Error(error.message);
    for (const x of data ?? []) terkirim.add(x.pengukuran_id);
  }
  return rows.filter((r) => !terkirim.has(r.pengukuran_id)).sort((a, b) => (a.tgl_realisasi ?? "").localeCompare(b.tgl_realisasi ?? ""));
}

export function barisGarduBelum(g: GarduBelum, i: number, tampilUlp: boolean) {
  return `${i + 1}. *${g.kode_gardu}*${tampilUlp ? ` · ${g.ulp}` : ""} · ${g.penyulang ?? "–"} · beban diukur ${tgl(g.tgl_realisasi)} · ${g.petugas_nama ?? "–"}`;
}
