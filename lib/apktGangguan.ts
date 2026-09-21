/**
 * Pemetaan data gangguan APKT → tabel `apkt_gangguan`.
 *
 * Dua jalur masuk memakai modul ini — tempel JSON hasil query GraphQL dan
 * unggah file Excel "Detail Rekapitulasi Gangguan" — dan keduanya harus
 * mendarat di baris yang sama untuk laporan yang sama. Karena itu pemetaan
 * kolom dan penulisannya ke DB dipegang di satu tempat, bukan disalin di tiap
 * route.
 *
 * KUNCI BARIS: `no_laporan`, BUKAN field `id` milik APKT.
 * `id` itu nomor urut baris di dalam hasil query — selalu mulai dari 0 tiap
 * tarikan — jadi memakainya sebagai kunci membuat tarikan kedua menimpa baris
 * tarikan pertama satu per satu. Lihat `scripts/apkt-gangguan-key-no-laporan.sql`.
 */

import type { createSupabaseServer } from "@/lib/supabase-server";

type Db = Awaited<ReturnType<typeof createSupabaseServer>>;

/** Kolom teks yang namanya sama persis antara payload GraphQL dan DB. */
export const TEXT_FIELDS = [
  "no_laporan", "pembuat_laporan", "waktu_lapor", "waktu_response", "waktu_recovery",
  "status_akhir", "is_marking", "referensi_marking", "idpel_nometer", "nama_pelapor",
  "alamat_pelapor", "no_telp_pelapor", "keterangan_pelapor", "media", "nama_posko",
  "dispatch_oleh", "diselesaikan_oleh", "penyebab", "tindakan", "kode_gangguan",
  "jenis_gangguan", "ket_batal", "batal_by", "ket_marking",
] as const;

/**
 * Kolom yang benar-benar dipakai halaman Detail Gangguan.
 *
 * Sebulan data ≈ 2.000 baris; `select("*")` mengirim 1,84 MB sedangkan daftar
 * ini 1,0 MB — sisanya kolom yang tidak pernah muncul di layar (`synced_at`
 * sendirian 62 KB).
 *
 * ⚠ Kalau menambah kolom ke `COLS` di `app/admin/detail-gangguan/page.tsx`,
 * tambahkan juga di sini — kalau tidak, kolomnya akan selalu tampil "—".
 * Yang mengonsumsi daftar ini: tabel `COLS`, `classifyCt`
 * (keterangan_pelapor/tindakan/kode_gangguan), `bangunBanding` (tgl_lapor +
 * durasi), dan `KoreksiModal` (waktu_lapor/response/recovery).
 */
export const KOLOM_TAMPIL = [
  "no_laporan",
  // Diturunkan dari `nama_posko` saat impor. Ikut dikirim karena layar
  // menyaring per ULP — dan menyaring dari teks posko di sisi klien berarti
  // aturan "posko mana milik ULP mana" hidup di dua tempat sekaligus.
  "ulp",
  "tgl_lapor",
  "waktu_lapor",
  "waktu_response",
  "waktu_recovery",
  "durasi_response_time",
  "durasi_recovery_time",
  "status_akhir",
  "nama_posko",
  "nama_pelapor",
  "alamat_pelapor",
  "keterangan_pelapor",
  "penyebab",
  "tindakan",
  "kode_gangguan",
  "jenis_gangguan",
] as const;

export function parseNum(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/** "04/06/2026 9:12:46" → "2026-06-04". Nilai lain → null. */
export function parseTglLapor(s: unknown): string | null {
  if (typeof s !== "string" || !s) return null;
  const [d, m, y] = s.split(" ")[0].split("/");
  if (y?.length === 4 && m && d) return `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
  return null;
}

const UNIT = ["AMPENAN", "CAKRANEGARA", "GERUNG", "TANJUNG"];

/**
 * "POSKO ULP AMPENAN" → "AMPENAN".
 *
 * Posko yang tidak dikenali jatuh ke AMPENAN — sama seperti perilaku lama yang
 * menuliskannya tetap, karena perintah console-nya memang dikunci ke posko
 * Ampenan (441501).
 */
export function ulpDariPosko(posko: unknown): string {
  const s = String(posko ?? "").toUpperCase();
  return UNIT.find((u) => s.includes(u)) ?? "AMPENAN";
}

/** Satu baris payload GraphQL APKT → baris DB. */
export function toDbRow(r: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {
    apkt_id: r.id == null ? null : String(r.id),
    ulp: ulpDariPosko(r.nama_posko),
    tgl_lapor: parseTglLapor(r.waktu_lapor),
    durasi_dispatch_time: parseNum(r.durasi_dispatch_time),
    durasi_response_time: parseNum(r.durasi_response_time),
    durasi_recovery_time: parseNum(r.durasi_recovery_time),
    durasi_perjalanan_time: parseNum(r.durasi_perjalanan_time),
    jarak_closing: parseNum(r.jarak_closing),
    synced_at: new Date().toISOString(),
  };
  for (const f of TEXT_FIELDS) {
    const v = r[f];
    out[f] = v === null || v === undefined || v === "" ? null : String(v);
  }
  return out;
}

/**
 * Sisakan satu baris per nomor laporan — yang terakhir menang.
 *
 * Satu file/tarikan bisa memuat laporan yang sama dua kali, dan upsert menolak
 * payload yang mengubah baris yang sama dua kali dalam satu perintah
 * ("ON CONFLICT DO UPDATE command cannot affect row a second time").
 */
export function dedupNoLaporan(
  rows: Record<string, unknown>[],
): Record<string, unknown>[] {
  const m = new Map<string, Record<string, unknown>>();
  for (const r of rows) {
    const no = String(r.no_laporan ?? "").trim();
    if (no) m.set(no, r);
  }
  return [...m.values()];
}

/** Batas aman satu perintah upsert — payload APKT sebulan bisa ribuan baris. */
const BATCH = 500;

export interface HasilSimpan {
  saved: number;
  error: string | null;
}

/**
 * Tulis ke DB. Laporan yang sudah ada akan DIPERBARUI, termasuk durasinya —
 * itu memang yang diinginkan: APKT kerap merevisi waktu sebuah laporan setelah
 * tarikan pertama, dan angka terbaru dari APKT-lah yang berlaku.
 *
 * Tabel koreksi (`apkt_koreksi`) tidak tersentuh karena berdiri sendiri dengan
 * kunci `no_laporan` yang sama.
 */
export async function simpanGangguan(
  supabase: Db,
  dbRows: Record<string, unknown>[],
): Promise<HasilSimpan> {
  let saved = 0;
  for (let i = 0; i < dbRows.length; i += BATCH) {
    const { data, error } = await supabase
      .from("apkt_gangguan")
      .upsert(dbRows.slice(i, i + BATCH), { onConflict: "no_laporan" })
      .select("no_laporan");
    if (error) return { saved, error: error.message };
    saved += data?.length ?? 0;
  }
  return { saved, error: null };
}
