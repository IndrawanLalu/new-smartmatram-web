/**
 * Aturan penyusunan WO Pemeliharaan Gardu — gardu mana yang harus dipelihara
 * bulan ini. Fungsi murni, sepola `pengukuran-gardu/_lib/kandidatWo.ts`.
 *
 * Jatuh tempo = 12 / frekuensi_per_tahun bulan sejak pemeliharaan terakhir
 * (Selesai atau Diverifikasi). Umur selalu dihitung terhadap TANGGAL WO, bukan
 * hari ini — daftar yang sama tersusun sama persis entah tombolnya ditekan
 * tanggal 1 atau tanggal 9.
 *
 * Urutan = UMUR SAJA (keputusan user 24 Sep 2026): belum pernah → paling lama.
 */

import { koordinat, tanggalWo, umurBulan } from "@/app/admin/pengukuran-gardu/_lib/kandidatWo";

export { tanggalWo };

export interface WoHarSettings {
  frekuensi_per_tahun: number;
  kuota_per_bulan: number;
  hanya_gardu_aktif: boolean;
}

export const DEFAULT_WO_HAR: WoHarSettings = {
  frekuensi_per_tahun: 1,
  kuota_per_bulan: 30,
  hanya_gardu_aktif: true,
};

export interface MasterGardu {
  kode: string;
  ulp: string;
  nama: string | null;
  alamat: string | null;
  penyulang: string | null;
  status: string | null;
  lat: number | string | null;
  lng: number | string | null;
}

export type AlasanWoHar = "belum_pernah" | "jatuh_tempo";

export interface KandidatHar {
  gardu_kode: string;
  ulp: string;
  nama: string | null;
  alamat: string | null;
  penyulang: string | null;
  lat: number | null;
  lng: number | null;
  alasan: AlasanWoHar;
  tgl_pelihara_terakhir: string | null;
  umur_bulan: number | null;
}

export const LABEL_ALASAN: Record<AlasanWoHar, string> = {
  belum_pernah: "Belum pernah dipelihara",
  jatuh_tempo: "Jatuh tempo",
};

/** Gardu tanpa status dianggap Aktif — sama dengan WO Pengukuran. */
export const garduAktif = (status: string | null) => !status || status.toUpperCase() === "AKTIF";

export const kunciGardu = (kode: string, ulp: string) => `${kode.toUpperCase()}|${ulp.toUpperCase()}`;

/** Interval pemeliharaan dalam bulan, dibulatkan ke bawah (min 1). */
export const intervalBulan = (frekuensi: number) => Math.max(1, Math.floor(12 / Math.max(1, frekuensi)));

/**
 * Berapa gardu per bulan supaya seluruh gardu aktif terpelihara sesuai
 * frekuensi — dasar angka saran di samping isian kuota.
 */
export const saranKuota = (jumlahGardu: number, frekuensi: number) => Math.ceil((jumlahGardu * frekuensi) / 12);

/**
 * @param terakhir  kunciGardu → tanggal (YYYY-MM-DD) pemeliharaan terakhir yang
 *                  Selesai/Diverifikasi.
 */
export function susunKandidat(
  master: MasterGardu[],
  terakhir: Map<string, string>,
  s: WoHarSettings,
  tglWo: string,
): KandidatHar[] {
  const batas = intervalBulan(s.frekuensi_per_tahun);
  const hasil: KandidatHar[] = [];

  for (const g of master) {
    if (s.hanya_gardu_aktif && !garduAktif(g.status)) continue;
    const dasar = {
      gardu_kode: g.kode,
      ulp: g.ulp,
      nama: g.nama,
      alamat: g.alamat,
      penyulang: g.penyulang,
      lat: koordinat(g.lat),
      lng: koordinat(g.lng),
    };
    const tgl = terakhir.get(kunciGardu(g.kode, g.ulp));
    if (!tgl) {
      hasil.push({ ...dasar, alasan: "belum_pernah", tgl_pelihara_terakhir: null, umur_bulan: null });
      continue;
    }
    const umur = umurBulan(tgl, tglWo);
    if (umur < batas) continue;
    hasil.push({ ...dasar, alasan: "jatuh_tempo", tgl_pelihara_terakhir: tgl, umur_bulan: umur });
  }

  // Belum pernah → paling lama → kode (pemutus supaya hasilnya stabil).
  hasil.sort((a, b) => {
    if (a.alasan !== b.alasan) return a.alasan === "belum_pernah" ? -1 : 1;
    if ((b.umur_bulan ?? 0) !== (a.umur_bulan ?? 0)) return (b.umur_bulan ?? 0) - (a.umur_bulan ?? 0);
    return a.gardu_kode.localeCompare(b.gardu_kode, "id", { numeric: true });
  });

  return hasil;
}
