import { supabaseBrowser } from "@/lib/supabase-browser";

/**
 * Jurusan per kabel JTR (`scripts/jtr-jurusan-kabel.sql` F2,
 * `jtr-jurusan-kabel-web.sql` F4). Kabel ke-2 dst. di satu tiang yang
 * jurusannya belum pernah dicatat (data sebelum 8 Okt 2026) dianggap jurusan
 * tiangnya, tapi BELUM DIPASTIKAN — bisa jalur kedua jurusan yang sama, bisa
 * jurusan lain yang lewat. Tidak ditebak; admin atau regu yang memastikan.
 */

export interface KabelBelumPasti {
  gardu: string;
  ulp: string;
  tiangId: string;
  tiangKode: string;
  nomor: number;
  jurusanDianggap: string | null;
  /** Jurusan yang lewat tiang itu, jurusan utama lebih dulu. */
  pilihan: string[];
}

/** Skrip belum dijalankan = daftar kosong, bukan galat yang menghalangi layar. */
const belumTerpasang = (pesan: string) =>
  /does not exist|Could not find|schema cache|pilihan_jurusan/i.test(pesan);

/** Daftar kabel yang jurusannya belum dipastikan — satu gardu, atau satu/semua ULP. */
export async function muatKabelBelumPasti(p: { gardu?: string; ulp?: string | null }): Promise<KabelBelumPasti[]> {
  let q = supabaseBrowser
    .from("jtr_kabel_perlu_dipastikan")
    .select("gardu_kode,ulp,tiang_id,tiang_kode,nomor_kabel,jurusan_dianggap,pilihan_jurusan")
    .order("gardu_kode")
    .order("tiang_kode")
    .order("nomor_kabel")
    .limit(1000);
  if (p.gardu) q = q.eq("gardu_kode", p.gardu.toUpperCase());
  if (p.ulp) q = q.eq("ulp", p.ulp.toUpperCase());
  const { data, error } = await q;
  if (error) {
    if (belumTerpasang(error.message)) return [];
    throw new Error(error.message);
  }
  return (data ?? []).map((r) => ({
    gardu: r.gardu_kode as string,
    ulp: r.ulp as string,
    tiangId: r.tiang_id as string,
    tiangKode: r.tiang_kode as string,
    nomor: Number(r.nomor_kabel),
    jurusanDianggap: (r.jurusan_dianggap as string) ?? null,
    pilihan: (r.pilihan_jurusan as string[] | null) ?? [],
  }));
}

/** Tetapkan jurusan satu kabel. Mengembalikan pesan galat, atau null bila berhasil. */
export async function aturJurusanKabel(p: {
  tiangId: string;
  gardu: string;
  nomor: number;
  jurusan: string;
  oleh: string;
}): Promise<string | null> {
  const { error } = await supabaseBrowser.rpc("atur_jurusan_kabel_jtr", {
    p_tiang_id: p.tiangId,
    p_gardu: p.gardu,
    p_nomor: p.nomor,
    p_jurusan: p.jurusan,
    p_oleh: p.oleh,
  });
  return error ? error.message : null;
}
