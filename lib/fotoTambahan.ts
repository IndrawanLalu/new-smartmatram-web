import { supabaseBrowser } from "@/lib/supabase-browser";

/**
 * Foto temuan lebih dari satu (paling banyak 3, `scripts/foto-temuan-banyak.sql`).
 *
 * JTM & Pemeliharaan Jaringan punya kolom sendiri (`foto_lain`,
 * `foto_sebelum_lain`, `foto_sesudah_lain`). JTR tidak: foto tambahannya ada
 * di peta `foto_temuan` yang sama, di kunci "<isian>#2" / "#3" — diisi HP tanpa
 * perubahan server. View temuan JTR hanya membawa foto UTAMA, jadi tambahannya
 * dicari dari peta tiang & kabel lewat URL foto utamanya.
 */

type PetaFoto = Record<string, string | null> | null;

const tambahanDariPeta = (hasil: Map<string, string[]>, peta: PetaFoto) => {
  for (const [k, utama] of Object.entries(peta ?? {})) {
    if (!utama || k.includes("#")) continue;
    const lain = [peta?.[`${k}#2`], peta?.[`${k}#3`]].filter((u): u is string => !!u);
    if (lain.length) hasil.set(utama, lain);
  }
};

/** URL foto utama → foto tambahannya, untuk tiang-tiang JTR ini. */
export async function muatFotoTambahanJtr(tiangIds: string[]): Promise<Map<string, string[]>> {
  const hasil = new Map<string, string[]>();
  const ids = [...new Set(tiangIds)].filter(Boolean);
  for (let i = 0; i < ids.length; i += 150) {
    const k = ids.slice(i, i + 150);
    const [t, kb] = await Promise.all([
      supabaseBrowser.from("tiang").select("foto_temuan").in("id", k),
      supabaseBrowser.from("tiang_konduktor").select("foto_temuan").in("tiang_id", k),
    ]);
    for (const r of [...(t.data ?? []), ...(kb.data ?? [])]) tambahanDariPeta(hasil, r.foto_temuan as PetaFoto);
  }
  return hasil;
}
