/**
 * Rencana Pemeliharaan Gardu (`scripts/rencana-hargardu.sql`) — fungsi murni:
 * jendela 12 bulan templat dan pratinjau unggahan. Baca/tulis Excel ada di
 * `rencanaExcel.ts` (dimuat hanya saat dipakai).
 *
 * Rencana adalah sumber SEMENTARA selama riwayat pemeliharaan belum ada
 * (keputusan user 28 Sep 2026). Satu gardu boleh direncanakan lebih dari
 * sekali; beda dengan frekuensi/kuota hanya PERINGATAN — SLA bisa berubah.
 */

import { garduAktif, type WoHarSettings } from "./kandidatWo";

export interface BulanRencana {
  tahun: number;
  bulan: number;
}

export interface GarduRencana {
  kode: string;
  nama: string | null;
  alamat: string | null;
  penyulang: string | null;
  kva_master: number | null;
  status: string | null;
}

export interface BarisRencana {
  kode: string;
  tahun: number;
  bulan: number;
  catatan: string | null;
}

/** Hasil membaca berkas — belum dicocokkan ke master. */
export interface IsiBerkas {
  ulp: string;
  dari: BulanRencana;
  baris: BarisRencana[];
  /** Kode yang muncul di lebih dari satu baris berkas. */
  kembar: string[];
}

const BULAN_PENDEK = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];

export const labelBulan = (b: BulanRencana) => `${BULAN_PENDEK[b.bulan - 1]} ${b.tahun}`;
export const kunciBulan = (b: BulanRencana) => `${b.tahun}-${String(b.bulan).padStart(2, "0")}`;
export const kunciKeBulan = (k: string): BulanRencana => ({ tahun: Number(k.slice(0, 4)), bulan: Number(k.slice(5, 7)) });

const berikut = (b: BulanRencana): BulanRencana => (b.bulan === 12 ? { tahun: b.tahun + 1, bulan: 1 } : { tahun: b.tahun, bulan: b.bulan + 1 });

/** Bulan berjalan menurut WITA (UTC+8). */
export const bulanKini = (): BulanRencana => {
  const w = new Date(Date.now() + 8 * 3600 * 1000);
  return { tahun: w.getUTCFullYear(), bulan: w.getUTCMonth() + 1 };
};

/** 12 bulan berturut mulai `dari`. */
export function duaBelasBulan(dari: BulanRencana): BulanRencana[] {
  const hasil = [dari];
  while (hasil.length < 12) hasil.push(berikut(hasil[hasil.length - 1]));
  return hasil;
}

/**
 * Jendela templat: 12 bulan mulai bulan pertama (≥ bulan berjalan) yang WO-nya
 * belum terbit. Permulaan langsung mencakup satu siklus penuh, bukan Jan–Des.
 */
export function jendelaRencana(terbit: Set<string>, kini: BulanRencana): BulanRencana[] {
  let awal = kini;
  while (terbit.has(kunciBulan(awal))) awal = berikut(awal);
  return duaBelasBulan(awal);
}

export interface BulanPratinjau {
  bulan: BulanRencana;
  jumlah: number;
  terkunci: boolean;
  lewatKuota: boolean;
}

export interface Pratinjau {
  /** Menghalangi simpan. */
  galat: string[];
  /** Tidak menghalangi — SLA bisa berubah. */
  peringatan: string[];
  perBulan: BulanPratinjau[];
  jumlahGardu: number;
  jumlahTanda: number;
}

/**
 * Cocokkan isi berkas ke master & WO yang sudah terbit. Server menjaga ulang
 * semua yang menghalangi; ini supaya kesalahan terlihat sebelum Simpan.
 */
export function susunPratinjau(
  isi: IsiBerkas,
  ulp: string,
  master: GarduRencana[],
  s: WoHarSettings,
  terbit: Set<string>,
  kini: BulanRencana,
): Pratinjau {
  const galat: string[] = [];
  const peringatan: string[] = [];

  if (isi.ulp !== ulp) galat.push(`Berkas ini templat ULP ${isi.ulp}, bukan ${ulp}.`);
  if (kunciBulan(isi.dari) < kunciBulan(kini)) {
    galat.push(`Templat ini mulai ${labelBulan(isi.dari)} — sudah lewat. Unduh templat terbaru, salin tandanya, lalu unggah.`);
  }

  const kodeMaster = new Set(master.map((g) => g.kode.toUpperCase()));
  const asing = [...new Set(isi.baris.map((b) => b.kode).filter((k) => !kodeMaster.has(k)))].sort();
  if (asing.length) {
    galat.push(
      `${asing.length} kode tidak ada di Master Gardu ${ulp}: ${asing.slice(0, 20).join(", ")}${asing.length > 20 ? ", …" : ""} — daftarkan di Master Gardu dulu.`,
    );
  }
  if (isi.kembar.length) {
    peringatan.push(`${isi.kembar.length} gardu muncul lebih dari sekali di berkas (tandanya digabung): ${isi.kembar.slice(0, 10).join(", ")}.`);
  }

  const perGardu = new Map<string, number>();
  const perBulanN = new Map<string, number>();
  for (const b of isi.baris) {
    perGardu.set(b.kode, (perGardu.get(b.kode) ?? 0) + 1);
    const k = kunciBulan(b);
    perBulanN.set(k, (perBulanN.get(k) ?? 0) + 1);
  }

  const perBulan = duaBelasBulan(isi.dari).map((bulan) => {
    const jumlah = perBulanN.get(kunciBulan(bulan)) ?? 0;
    return { bulan, jumlah, terkunci: terbit.has(kunciBulan(bulan)), lewatKuota: jumlah > s.kuota_per_bulan };
  });

  const terkunci = perBulan.filter((p) => p.terkunci);
  if (terkunci.length) {
    peringatan.push(`WO ${terkunci.map((p) => labelBulan(p.bulan)).join(", ")} sudah terbit — tanda di bulan itu dilewati.`);
  }
  const lewat = perBulan.filter((p) => p.lewatKuota && !p.terkunci);
  if (lewat.length) {
    peringatan.push(`${lewat.length} bulan melebihi kuota ${s.kuota_per_bulan} gardu/bulan di pengaturan ULP.`);
  }

  const aktif = master.filter((g) => !s.hanya_gardu_aktif || garduAktif(g.status));
  const tanpa = aktif.filter((g) => !perGardu.has(g.kode.toUpperCase())).length;
  if (tanpa) peringatan.push(`${tanpa} dari ${aktif.length} gardu aktif tidak direncanakan dalam 12 bulan ini.`);

  const beda = [...perGardu.values()].filter((n) => n !== s.frekuensi_per_tahun).length;
  if (beda) {
    peringatan.push(`${beda} gardu direncanakan tidak ${s.frekuensi_per_tahun}× setahun (frekuensi di pengaturan ULP).`);
  }

  return { galat, peringatan, perBulan, jumlahGardu: perGardu.size, jumlahTanda: isi.baris.length };
}
