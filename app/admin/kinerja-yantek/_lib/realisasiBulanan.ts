/**
 * Realisasi sebulan per ULP — dasar perbandingan antar-ULP per jenis pekerjaan
 * (`realisasi_bulanan`, scripts/realisasi-rentang.sql).
 *
 * Rata-rata harian = total ÷ jumlah hari yang ADA realisasi jenis itu di ULP
 * itu (keputusan user 7 Okt 2026). Hari ketika ULP hanya mengerjakan jenis lain
 * tidak menurunkan rata-ratanya. Yang dihitung pekerjaan utama; di luar WO dan
 * tegangan ujung tampil terpisah, sama dengan tampilan per hari.
 */

import { angkaId, type MetaJenis } from "./realisasiHarian";

export interface BarisBulanan {
  ulp: string;
  kunci: string;
  tgl: string;
  cacah: number;
  km: number;
  cacahSetuju: number;
  kmSetuju: number;
  luar: number;
  ujung: number;
}

export interface SelBulanan {
  total: number;
  setuju: number;
  /** Hari yang ada pekerjaan utama jenis ini. */
  hari: number;
  rata: number;
  luar: number;
  ujung: number;
  /** Per tanggal, urut naik — untuk rincian. */
  harian: BarisBulanan[];
}

/** kunci → ulp → sel. Sel yang tidak ada = nihil. */
export type RekapBulanan = Record<string, Record<string, SelBulanan>>;

/** Satu baris `realisasi_bulanan` (snake_case, angka bisa string) → BarisBulanan. */
export const keBarisBulanan = (r: Record<string, unknown>): BarisBulanan => ({
  ulp: String(r.ulp ?? ""),
  kunci: String(r.kunci),
  tgl: String(r.tgl),
  cacah: Number(r.cacah ?? 0),
  km: Number(r.km ?? 0),
  cacahSetuju: Number(r.cacah_setuju ?? 0),
  kmSetuju: Number(r.km_setuju ?? 0),
  luar: Number(r.luar ?? 0),
  ujung: Number(r.ujung ?? 0),
});

export const nilaiUtama = (b: BarisBulanan, desimal: boolean) => (desimal ? b.km : b.cacah);
export const nilaiSetuju = (b: BarisBulanan, desimal: boolean) => (desimal ? b.kmSetuju : b.cacahSetuju);

export function rekapBulanan(baris: BarisBulanan[], meta: MetaJenis[]): RekapBulanan {
  const hasil: RekapBulanan = {};
  for (const m of meta) {
    const perUlp: Record<string, SelBulanan> = {};
    for (const b of baris.filter((x) => x.kunci === m.kunci)) {
      const s = (perUlp[b.ulp] ??= { total: 0, setuju: 0, hari: 0, rata: 0, luar: 0, ujung: 0, harian: [] });
      s.total += nilaiUtama(b, m.desimal);
      s.setuju += nilaiSetuju(b, m.desimal);
      if (b.cacah > 0) s.hari += 1;
      s.luar += b.luar;
      s.ujung += b.ujung;
      s.harian.push(b);
    }
    for (const s of Object.values(perUlp)) s.rata = s.hari ? s.total / s.hari : 0;
    hasil[m.kunci] = perUlp;
  }
  return hasil;
}

/**
 * ULP dengan rata-rata harian tertinggi. Satu-satunya ULP yang berealisasi pun
 * mendapat bintang (arahan user 7 Okt 2026); yang seri tidak. Tampilan satu
 * ULP (admin ULP) tanpa bintang — tidak ada yang dibandingkan.
 */
export function terbaik(perUlp: Record<string, SelBulanan> | undefined, ulps: string[]): string | null {
  const ada = ulps.filter((u) => (perUlp?.[u]?.hari ?? 0) > 0);
  if (ulps.length < 2 || ada.length === 0 || !perUlp) return null;
  const maks = Math.max(...ada.map((u) => perUlp[u].rata));
  const juara = ada.filter((u) => perUlp[u].rata === maks);
  return juara.length === 1 ? juara[0] : null;
}

/** Rata-rata: KMS dua desimal, cacah satu desimal. */
export const rataId = (n: number, desimal: boolean) =>
  n.toLocaleString("id-ID", { minimumFractionDigits: desimal ? 2 : 1, maximumFractionDigits: desimal ? 2 : 1 });

/** "CAKRANEGARA" → "Cakranegara". */
const namaUlp = (u: string) => u.charAt(0) + u.slice(1).toLowerCase();

/**
 * Teks WA perbandingan antar-ULP, format dari user (7 Okt 2026):
 *   *PERABASAN POHON (KMS)*
 *   - Ampenan : 20,03 | 6,77 per hari ⭐
 *   - Cakranegara : -
 * Jenis yang nihil di semua ULP digabung jadi satu baris di bawah.
 */
export function teksWaBulanan(
  periode: string,
  rekap: RekapBulanan,
  meta: MetaJenis[],
  ulps: string[],
  /** Baris miring di bawah judul, mis. "Data s.d. Rabu, 7 Oktober 2026 pukul 18.00 WITA". */
  keterangan?: string,
) {
  const baris: string[] = [`*REKAP KINERJA SMART UP3 MATARAM ${periode.toUpperCase()}*`];
  if (keterangan) baris.push(`_${keterangan}_`);
  baris.push("");
  const nihil: string[] = [];

  for (const m of meta) {
    const perUlp = rekap[m.kunci];
    if (!ulps.some((u) => (perUlp?.[u]?.hari ?? 0) > 0)) {
      nihil.push(m.jenis);
      continue;
    }
    const juara = terbaik(perUlp, ulps);
    baris.push(`*${m.jenis.toUpperCase()} (${m.satuan.toUpperCase()})*`);
    for (const u of ulps) {
      const s = perUlp?.[u];
      baris.push(
        s && s.hari > 0
          ? `- ${namaUlp(u)} : ${angkaId(s.total, m.desimal)} | ${rataId(s.rata, m.desimal)} per hari${juara === u ? " ⭐" : ""}`
          : `- ${namaUlp(u)} : -`,
      );
    }
    baris.push("");
  }

  if (nihil.length) baris.push(`_Nihil di semua ULP:_ ${nihil.join(", ")}`, "");
  baris.push(
    "_Per hari = total ÷ jumlah hari yang ada realisasinya. ⭐ rata-rata per hari tertinggi. Termasuk yang belum disetujui._",
    "_SMART MATARAM — PLN UP3 Mataram_",
  );
  return baris.join("\n");
}

/** Bulan & tahun berjalan dalam WITA. */
export function bulanIniWita() {
  const d = new Date(Date.now() + 8 * 3600 * 1000);
  return { tahun: d.getUTCFullYear(), bulan: d.getUTCMonth() + 1 };
}
