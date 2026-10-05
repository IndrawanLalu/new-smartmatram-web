import { supabaseBrowser } from "@/lib/supabase-browser";

/**
 * Nama tiang JTM: pratinjau & terapkan (`scripts/jtm-penamaan-baru.sql`).
 * Satu mesin untuk tiga pintu — Generate ulang penyulang, Ganti nama dengan
 * hilir ikut, Jadikan jalur utama. Pratinjau TIDAK menulis apa pun.
 */

export interface BarisNama {
  tiangId: string;
  lama: string;
  baru: string;
  indukId: string | null;
  cabang: boolean;
  catatan: string | null;
}

export interface PermintaanNama {
  penyulang: string;
  ulp: string;
  /** Kosong = seluruh penyulang dari pangkal. */
  mulai?: string | null;
  /** Nama baru tiang `mulai` (hilir ikut). */
  namaMulai?: string | null;
  /** Anak yang dijadikan jalur utama; saudaranya jadi cabang. */
  utamaPaksa?: string | null;
}

const arg = (p: PermintaanNama) => ({
  p_penyulang: p.penyulang,
  p_ulp: p.ulp,
  p_mulai: p.mulai ?? null,
  p_nama_mulai: p.namaMulai?.trim().toUpperCase() || null,
  p_utama_paksa: p.utamaPaksa ?? null,
});

const pesan = (m: string) =>
  m.includes("Could not find the function")
    ? "Fitur penamaan baru belum terpasang — jalankan scripts/jtm-penamaan-baru.sql di Supabase."
    : m;

export async function pratinjauNama(p: PermintaanNama): Promise<BarisNama[]> {
  const { data, error } = await supabaseBrowser.rpc("susun_nama_jtm", arg(p));
  if (error) throw new Error(pesan(error.message));
  return ((data ?? []) as Record<string, unknown>[]).map((r) => ({
    tiangId: r.tiang_id as string,
    lama: (r.lama as string) ?? "",
    baru: (r.baru as string) ?? "",
    indukId: (r.induk_id as string) ?? null,
    cabang: !!r.cabang,
    catatan: (r.catatan as string) ?? null,
  }));
}

/** `jumlah` = banyak baris pratinjau: server menolak bila jaringan berubah sejak itu. */
export async function terapkanNama(
  p: PermintaanNama,
  jumlah: number,
  oleh: string,
): Promise<{ total: number; berubah: number }> {
  const { data, error } = await supabaseBrowser.rpc("terapkan_nama_jtm", { ...arg(p), p_jumlah: jumlah, p_oleh: oleh });
  if (error) throw new Error(pesan(error.message));
  return data as { total: number; berubah: number };
}
