import "server-only";
import { createSupabaseServer } from "@/lib/supabase-server";

/**
 * Penyimpanan data yantek APKT — tabel `yantek_harian`, satu baris per
 * TANGGAL × POSKO.
 *
 * Menggantikan berkas `data/yantek/*.json` (24 Sep 2026): di Docker berkas itu
 * tidak bisa ditulis, dan kalaupun bisa, hilang setiap image dibangun ulang.
 * Lihat `scripts/yantek-harian.sql` dan `yantek-harian-posko.sql`.
 *
 * ── KENAPA PER POSKO ────────────────────────────────────────────────────────
 * Satu tarikan APKT = satu posko. Dengan kunci tanggal saja, menyimpan tarikan
 * Cakra MENIMPA Ampenan di tanggal yang sama (terjadi 24 Sep 2026). Pemanggil
 * tetap berpikir "per tanggal"; pemecahan per posko terjadi di sini.
 *
 * Galat DILEMPAR, tidak ditelan jadi daftar kosong — teknisaplikasi.md butir 6.
 */

type Supa = Awaited<ReturnType<typeof createSupabaseServer>>;

export interface RingkasTanggal {
  date: string;
  label: string;
  count: number;
  savedAt: number | null;
}

const epoch = (iso: string | null) => (iso ? new Date(iso).getTime() : null);

/** Baris APKT tanpa `id_posko` dikelompokkan ke 0, bukan dibuang. */
const poskoDari = (row: unknown) => Number((row as { id_posko?: unknown })?.id_posko) || 0;

/**
 * Daftar tanggal + jumlah baris (semua posko dijumlah) — tanpa menarik isinya.
 *
 * Dipaginasi per 1.000: PostgREST memotong jawaban di 1.000 baris TANPA
 * memberi tahu, dan dengan empat posko tabel ini melewati 1.000 baris dalam
 * ±8 bulan — tanggal terbaru akan hilang dari daftar tanpa tanda
 * (teknisaplikasi.md butir 13).
 */
export async function daftarTanggal(sb: Supa): Promise<RingkasTanggal[]> {
  const UKURAN = 1000;
  const peta = new Map<string, RingkasTanggal>();
  for (let mulai = 0; ; mulai += UKURAN) {
    const { data, error } = await sb
      .from("yantek_harian")
      .select("tanggal,id_posko,label,jumlah,disimpan_at")
      .order("tanggal")
      .order("id_posko")
      .range(mulai, mulai + UKURAN - 1);
    if (error) throw new Error(error.message);
    for (const r of data ?? []) {
      const t = r.tanggal as string;
      const lama = peta.get(t);
      const simpan = epoch(r.disimpan_at as string | null);
      peta.set(t, {
        date: t,
        label: lama?.label ?? ((r.label as string) || t),
        count: (lama?.count ?? 0) + Number(r.jumlah ?? 0),
        savedAt: Math.max(lama?.savedAt ?? 0, simpan ?? 0) || null,
      });
    }
    if ((data ?? []).length < UKURAN) break;
  }
  return [...peta.values()];
}

export async function ambilTanggal(sb: Supa, tanggal: string) {
  const [isi] = await ambilRentang(sb, tanggal, tanggal);
  const { data } = await sb
    .from("yantek_harian")
    .select("label,disimpan_at")
    .eq("tanggal", tanggal)
    .order("disimpan_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return {
    label: (data?.label as string) ?? tanggal,
    rows: isi?.rows ?? [],
    savedAt: epoch((data?.disimpan_at as string | null) ?? null),
  };
}

/**
 * Isi beberapa tanggal, SEMUA posko digabung per tanggal. `dari`/`sampai`
 * inklusif, format YYYY-MM-DD. Pemanggil WAJIB membatasi rentangnya —
 * teknisaplikasi.md butir 13.
 *
 * Ditarik per 20 baris: satu baris bisa ratusan KB, dan satu respons berisi
 * puluhan MB lebih mudah putus di jalan daripada beberapa respons kecil.
 */
export async function ambilRentang(
  sb: Supa,
  dari: string,
  sampai: string,
): Promise<{ tanggal: string; rows: unknown[] }[]> {
  const UKURAN = 20;
  const peta = new Map<string, unknown[]>();
  for (let mulai = 0; ; mulai += UKURAN) {
    const { data, error } = await sb
      .from("yantek_harian")
      .select("tanggal,rows")
      .gte("tanggal", dari)
      .lte("tanggal", sampai)
      .order("tanggal")
      .order("id_posko")
      .range(mulai, mulai + UKURAN - 1);
    if (error) throw new Error(error.message);
    for (const r of data ?? []) {
      const t = r.tanggal as string;
      peta.set(t, [...(peta.get(t) ?? []), ...((r.rows as unknown[]) ?? [])]);
    }
    if ((data ?? []).length < UKURAN) break;
  }
  return [...peta.entries()].map(([tanggal, rows]) => ({ tanggal, rows }));
}

/**
 * Simpan tarikan satu tanggal. Barisnya dipecah per posko, dan tiap posko
 * MENGGANTI isi posko itu saja — tarikan ulang Ampenan tidak menyentuh Cakra.
 */
export async function simpanTanggal(sb: Supa, tanggal: string, label: string, rows: unknown[], oleh: string) {
  const perPosko = new Map<number, unknown[]>();
  for (const r of rows) {
    const p = poskoDari(r);
    perPosko.set(p, [...(perPosko.get(p) ?? []), r]);
  }
  const sekarang = new Date().toISOString();
  const { error } = await sb.from("yantek_harian").upsert(
    [...perPosko.entries()].map(([id_posko, isi]) => ({
      tanggal,
      id_posko,
      label,
      rows: isi,
      disimpan_at: sekarang,
      disimpan_oleh: oleh,
    })),
    { onConflict: "tanggal,id_posko" },
  );
  if (error) throw new Error(error.message);
}

/** Hapus satu tanggal — hanya posko yang disebut; tanpa posko = semua posko. */
export async function hapusTanggal(sb: Supa, tanggal: string, idPosko?: number) {
  let q = sb.from("yantek_harian").delete().eq("tanggal", tanggal);
  if (idPosko) q = q.eq("id_posko", idPosko);
  const { error } = await q;
  if (error) throw new Error(error.message);
}
