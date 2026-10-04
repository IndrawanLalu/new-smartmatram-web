import { supabaseBrowser } from "@/lib/supabase-browser";

/**
 * Asal kabel JTR (`scripts/jtr-asal-kabel.sql`). Di jalur dua kabel yang
 * berdampingan (AM136), kabel di sebuah tiang bisa datang dari tiang lain atau
 * langsung dari gardu — bukan dari induk tiangnya. Server mengusulkan asalnya
 * (tiang terdekat sejurusan yang membawa kabel bernomor sama, atau gardu bila
 * lebih dekat); admin yang menerapkan. Dipakai peta & tabel persetujuan.
 */

export interface UsulanAsalKabel {
  tiangId: string;
  tiangKode: string;
  jurusan: string | null;
  nomor: number;
  usulTiangId: string | null;
  usulKode: string | null;
  usulDariGardu: boolean;
  jarakM: number | null;
}

/** Usulan untuk tiap kabel gardu ini yang asalnya belum jelas. */
export async function muatUsulanAsalKabel(gardu: string, ulp: string): Promise<UsulanAsalKabel[]> {
  const { data, error } = await supabaseBrowser.rpc("usul_asal_kabel_jtr", { p_gardu: gardu, p_ulp: ulp });
  if (error) {
    // Skrip belum dijalankan: tanpa usulan, bukan galat yang menghalangi layar.
    if (error.message.includes("Could not find the function")) return [];
    throw new Error(error.message);
  }
  return ((data ?? []) as Record<string, unknown>[]).map((r) => ({
    tiangId: r.tiang_id as string,
    tiangKode: r.tiang_kode as string,
    jurusan: (r.jurusan as string) ?? null,
    nomor: Number(r.nomor_kabel),
    usulTiangId: (r.usul_tiang_id as string) ?? null,
    usulKode: (r.usul_kode as string) ?? null,
    usulDariGardu: !!r.usul_dari_gardu,
    jarakM: r.jarak_m === null || r.jarak_m === undefined ? null : Number(r.jarak_m),
  }));
}

/** "B5 (50 m)" / "langsung dari gardu (38 m)" / null bila tak ada usulan. */
export const sebutUsulan = (u: Pick<UsulanAsalKabel, "usulDariGardu" | "usulKode" | "jarakM">) => {
  const m = u.jarakM === null ? "" : ` (${u.jarakM} m)`;
  if (u.usulDariGardu) return `langsung dari gardu${m}`;
  return u.usulKode ? `${u.usulKode}${m}` : null;
};

/** Terapkan asal satu kabel. Mengembalikan pesan galat, atau null bila berhasil. */
export async function terapkanAsalKabel(p: {
  tiangId: string;
  gardu: string;
  nomor: number;
  huluId: string | null;
  dariGardu: boolean;
  oleh: string;
}): Promise<string | null> {
  const { error } = await supabaseBrowser.rpc("atur_asal_kabel_jtr", {
    p_tiang_id: p.tiangId,
    p_gardu: p.gardu,
    p_nomor: p.nomor,
    p_hulu_id: p.dariGardu ? null : p.huluId,
    p_dari_gardu: p.dariGardu,
    p_oleh: p.oleh,
  });
  return error ? error.message : null;
}

/** Terapkan semua usulan berurutan; berhenti di galat pertama. */
export async function terapkanSemuaUsulan(
  gardu: string,
  daftar: UsulanAsalKabel[],
  oleh: string,
): Promise<{ berhasil: number; galat: string | null }> {
  let berhasil = 0;
  for (const u of daftar) {
    if (!u.usulDariGardu && !u.usulTiangId) continue;
    const galat = await terapkanAsalKabel({
      tiangId: u.tiangId, gardu, nomor: u.nomor, huluId: u.usulTiangId, dariGardu: u.usulDariGardu, oleh,
    });
    if (galat) return { berhasil, galat: `${u.tiangKode} kabel ke-${u.nomor}: ${galat}` };
    berhasil++;
  }
  return { berhasil, galat: null };
}
