import "server-only";
import { createSupabaseServer } from "@/lib/supabase-server";

/**
 * Penyimpanan data yantek APKT — tabel `yantek_harian` (satu baris per tanggal).
 *
 * Menggantikan berkas `data/yantek/*.json` (24 Sep 2026): di Docker berkas itu
 * tidak bisa ditulis, dan kalaupun bisa, hilang setiap image dibangun ulang.
 * Lihat `scripts/yantek-harian.sql`.
 *
 * Galat DILEMPAR, tidak ditelan jadi daftar kosong — teknisaplikasi.md butir 6:
 * "belum ada data" dan "server tidak menjawab" tidak boleh terlihat sama.
 */

type Supa = Awaited<ReturnType<typeof createSupabaseServer>>;

export interface RingkasTanggal {
  date: string;
  label: string;
  count: number;
  savedAt: number | null;
}

const epoch = (iso: string | null) => (iso ? new Date(iso).getTime() : null);

/** Daftar tanggal + jumlah baris — tanpa menarik isinya. */
/**
 * Dipaginasi per 1.000: PostgREST memotong jawaban di 1.000 baris TANPA
 * memberi tahu. Satu baris = satu hari, jadi tanpa ini tanggal-tanggal
 * terbaru mulai hilang dari daftar setelah ±2,7 tahun — ada di database,
 * tidak tampil di layar (teknisaplikasi.md butir 13).
 */
export async function daftarTanggal(sb: Supa): Promise<RingkasTanggal[]> {
  const UKURAN = 1000;
  const data: Record<string, unknown>[] = [];
  for (let mulai = 0; ; mulai += UKURAN) {
    const { data: hal, error } = await sb
      .from("yantek_harian")
      .select("tanggal,label,jumlah,disimpan_at")
      .order("tanggal")
      .range(mulai, mulai + UKURAN - 1);
    if (error) throw new Error(error.message);
    data.push(...(hal ?? []));
    if ((hal ?? []).length < UKURAN) break;
  }
  return data.map((r) => ({
    date: r.tanggal as string,
    label: (r.label as string) ?? (r.tanggal as string),
    count: Number(r.jumlah ?? 0),
    savedAt: epoch(r.disimpan_at as string | null),
  }));
}

export async function ambilTanggal(sb: Supa, tanggal: string) {
  const { data, error } = await sb
    .from("yantek_harian")
    .select("label,rows,disimpan_at")
    .eq("tanggal", tanggal)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return {
    label: (data?.label as string) ?? tanggal,
    rows: (data?.rows as unknown[]) ?? [],
    savedAt: epoch((data?.disimpan_at as string | null) ?? null),
  };
}

/**
 * Isi beberapa tanggal, digabung. `dari`/`sampai` inklusif, format YYYY-MM-DD.
 * Pemanggil WAJIB membatasi rentangnya — lihat teknisaplikasi.md butir 13.
 *
 * Ditarik per 20 tanggal: satu tanggal bisa ratusan KB, dan satu respons
 * berisi seluruh isi tabel (20+ MB) lebih mudah putus di jalan daripada
 * beberapa respons kecil.
 */
export async function ambilRentang(
  sb: Supa,
  dari: string,
  sampai: string,
): Promise<{ tanggal: string; rows: unknown[] }[]> {
  const UKURAN = 20;
  const hasil: { tanggal: string; rows: unknown[] }[] = [];
  for (let mulai = 0; ; mulai += UKURAN) {
    const { data, error } = await sb
      .from("yantek_harian")
      .select("tanggal,rows")
      .gte("tanggal", dari)
      .lte("tanggal", sampai)
      .order("tanggal")
      .range(mulai, mulai + UKURAN - 1);
    if (error) throw new Error(error.message);
    for (const r of data ?? []) hasil.push({ tanggal: r.tanggal as string, rows: (r.rows as unknown[]) ?? [] });
    if ((data ?? []).length < UKURAN) return hasil;
  }
}

export async function simpanTanggal(sb: Supa, tanggal: string, label: string, rows: unknown[], oleh: string) {
  const { error } = await sb.from("yantek_harian").upsert({
    tanggal,
    label,
    rows,
    disimpan_at: new Date().toISOString(),
    disimpan_oleh: oleh,
  });
  if (error) throw new Error(error.message);
}

export async function hapusTanggal(sb: Supa, tanggal: string) {
  const { error } = await sb.from("yantek_harian").delete().eq("tanggal", tanggal);
  if (error) throw new Error(error.message);
}
