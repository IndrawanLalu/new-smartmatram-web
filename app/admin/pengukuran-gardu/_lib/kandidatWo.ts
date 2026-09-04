/**
 * Aturan penyusunan WO Pengukuran — gardu mana yang harus diukur bulan ini.
 *
 * Fungsi murni, tanpa Supabase dan tanpa React: aturannya bisa dibaca, diuji,
 * dan nanti dipakai ulang dari sisi lain (agen terjadwal, mobile) tanpa menarik
 * seluruh halaman ikut serta.
 *
 * Umur pengukuran selalu dihitung terhadap TANGGAL WO, bukan terhadap hari ini.
 * Itu yang membuat WO tanggal 1 berbunyi konsisten — daftar yang sama akan
 * tersusun sama persis entah tombolnya ditekan tanggal 1 atau tanggal 9.
 */

// ── Pengaturan ────────────────────────────────────────────────────────────────

export interface WoSettings {
  /** Batas "gardu berbeban tinggi", dalam persen. */
  ambang_beban_pct: number;
  /** Umur maksimum pengukuran untuk gardu berbeban ≥ ambang, dalam bulan. */
  bulan_beban_tinggi: number;
  /** Umur maksimum untuk gardu berbeban < ambang. Samakan dengan yang di atas
   *  kalau ingin satu ambang untuk semua gardu. */
  bulan_beban_rendah: number;
  /** Berapa gardu yang diterbitkan per bulan per ULP. */
  kuota_per_bulan: number;
  /** Gardu yang belum pernah diukur ikut jadi kandidat. */
  sertakan_belum_pernah: boolean;
  /** Gardu berstatus Nonaktif tidak di-WO-kan. */
  hanya_gardu_aktif: boolean;
}

export const DEFAULT_WO_SETTINGS: WoSettings = {
  ambang_beban_pct: 80,
  bulan_beban_tinggi: 3,
  bulan_beban_rendah: 5,
  kuota_per_bulan: 50,
  sertakan_belum_pernah: true,
  hanya_gardu_aktif: true,
};

// ── Masukan & keluaran ────────────────────────────────────────────────────────

/**
 * Bentuk minimal yang dibutuhkan, bukan `GarduMasterState` utuh.
 *
 * Pola yang sama dipakai `pengukuranBasi()`: pemanggil boleh menarik kolom
 * seperlunya dari view yang sama tanpa harus menyediakan 31 kolom lengkap.
 */
export interface BarisMasterUntukWo {
  kode: string;
  ulp: string;
  nama: string | null;
  alamat: string | null;
  penyulang: string | null;
  kva_master: number | null;
  status: string | null;
  belum_diukur: boolean;
  event_date: string | null;
  persen_beban: number | null;
}

export type AlasanWo = "belum_pernah" | "kedaluwarsa";

export interface KandidatWo {
  kode_gardu: string;
  ulp: string;
  nama: string | null;
  alamat: string | null;
  penyulang: string | null;
  kva_master: number | null;
  alasan: AlasanWo;
  /** NULL untuk gardu yang belum pernah diukur. */
  tgl_ukur_terakhir: string | null;
  umur_bulan: number | null;
  /** Beban terakhir — dipakai mengurutkan, tidak disimpan ke tabel. */
  persen_beban: number | null;
}

export interface RingkasKandidat {
  total: number;
  belumPernah: number;
  kedaluwarsa: number;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Tanggal 1 bulan tersebut, sebagai YYYY-MM-DD. Bulan 1–12. */
export const tanggalWo = (tahun: number, bulan: number): string =>
  `${tahun}-${String(bulan).padStart(2, "0")}-01`;

/**
 * Selisih bulan penuh antara dua tanggal YYYY-MM-DD.
 *
 * Dibulatkan ke bawah dan tidak pernah negatif: gardu yang diukur SETELAH
 * tanggal WO (mis. WO disusun ulang di pertengahan bulan) berumur 0, bukan −1
 * yang akan mengacaukan pengurutan.
 */
export function umurBulan(dari: string, sampai: string): number {
  const [ya, ma, da] = dari.split("-").map(Number);
  const [yb, mb, db] = sampai.split("-").map(Number);
  let bulan = (yb - ya) * 12 + (mb - ma);
  if (db < da) bulan -= 1;
  return Math.max(0, bulan);
}

/** Gardu tanpa status dianggap Aktif — master lama banyak yang kolomnya kosong,
 *  dan template impor pun menyatakan kosong = Aktif. */
const aktif = (status: string | null) => !status || status.toUpperCase() === "AKTIF";

// ── Seleksi ───────────────────────────────────────────────────────────────────

/**
 * Susun daftar kandidat WO untuk satu tanggal WO, sudah terurut dan terpotong
 * sesuai kuota.
 *
 * Urutannya tetap dan disengaja:
 *   1. Belum pernah diukur — satu-satunya kelompok yang kondisinya benar-benar
 *      tidak diketahui, jadi paling berisiko dibiarkan.
 *   2. Paling lama tidak diukur.
 *   3. Beban terakhir tertinggi.
 *   4. Kode gardu — bukan kriteria, hanya pemutus supaya hasilnya tidak
 *      berubah-ubah antar pemanggilan untuk data yang sama.
 */
export function susunKandidat(
  rows: BarisMasterUntukWo[],
  settings: WoSettings,
  tglWo: string,
): KandidatWo[] {
  const kandidat: KandidatWo[] = [];

  for (const r of rows) {
    if (settings.hanya_gardu_aktif && !aktif(r.status)) continue;

    const dasar = {
      kode_gardu: r.kode,
      ulp: r.ulp,
      nama: r.nama,
      alamat: r.alamat,
      penyulang: r.penyulang,
      kva_master: r.kva_master,
      persen_beban: r.persen_beban,
    };

    if (r.belum_diukur || !r.event_date) {
      if (!settings.sertakan_belum_pernah) continue;
      kandidat.push({ ...dasar, alasan: "belum_pernah", tgl_ukur_terakhir: null, umur_bulan: null });
      continue;
    }

    const umur = umurBulan(r.event_date, tglWo);
    // Dibandingkan pada persen yang TAMPIL, sama dengan kartu overload dan
    // `pengukuranBasi()` — supaya gardu di ambang tidak masuk WO tapi tampil
    // aman di tab sebelah, atau sebaliknya.
    const batas =
      Math.round(r.persen_beban ?? 0) >= settings.ambang_beban_pct
        ? settings.bulan_beban_tinggi
        : settings.bulan_beban_rendah;

    if (umur < batas) continue;
    kandidat.push({ ...dasar, alasan: "kedaluwarsa", tgl_ukur_terakhir: r.event_date, umur_bulan: umur });
  }

  kandidat.sort((a, b) => {
    if (a.alasan !== b.alasan) return a.alasan === "belum_pernah" ? -1 : 1;
    if ((b.umur_bulan ?? 0) !== (a.umur_bulan ?? 0)) return (b.umur_bulan ?? 0) - (a.umur_bulan ?? 0);
    if ((b.persen_beban ?? 0) !== (a.persen_beban ?? 0)) return (b.persen_beban ?? 0) - (a.persen_beban ?? 0);
    return a.kode_gardu.localeCompare(b.kode_gardu);
  });

  return kandidat.slice(0, settings.kuota_per_bulan);
}

/** Rincian per alasan — dipakai di dialog konfirmasi dan kartu ringkasan. */
export function ringkasKandidat(kandidat: KandidatWo[]): RingkasKandidat {
  let belumPernah = 0;
  for (const k of kandidat) if (k.alasan === "belum_pernah") belumPernah += 1;
  return { total: kandidat.length, belumPernah, kedaluwarsa: kandidat.length - belumPernah };
}

/**
 * Susun kandidat untuk beberapa ULP sekaligus — satu daftar per ULP.
 *
 * UP3 tanpa filter menerbitkan satu WO per ULP, dan kuota berlaku PER ULP.
 * Karena itu pemisahannya harus terjadi SEBELUM pemotongan kuota: menyeleksi
 * gabungan lalu memotong 50 teratas akan menghabiskan seluruh jatah untuk ULP
 * yang datanya paling tertinggal, dan tiga ULP lain tidak kebagian sama sekali.
 *
 * `settingsUntuk` dipanggil per ULP supaya tiap ULP memakai kriteria dan
 * kuotanya sendiri.
 */
export function susunKandidatPerUlp(
  rows: BarisMasterUntukWo[],
  settingsUntuk: (ulp: string) => WoSettings,
  tglWo: string,
): Map<string, KandidatWo[]> {
  const perUlp = new Map<string, BarisMasterUntukWo[]>();
  for (const r of rows) {
    const daftar = perUlp.get(r.ulp);
    if (daftar) daftar.push(r);
    else perUlp.set(r.ulp, [r]);
  }

  const hasil = new Map<string, KandidatWo[]>();
  for (const [ulp, barisUlp] of [...perUlp].sort((a, b) => a[0].localeCompare(b[0]))) {
    const kandidat = susunKandidat(barisUlp, settingsUntuk(ulp), tglWo);
    if (kandidat.length > 0) hasil.set(ulp, kandidat);
  }
  return hasil;
}

export const LABEL_ALASAN: Record<AlasanWo, string> = {
  belum_pernah: "Belum pernah diukur",
  kedaluwarsa: "Kedaluwarsa",
};
