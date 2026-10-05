/**
 * Pengaturan & label WO Pengukuran.
 *
 * Aturan penyusunannya (gardu mana yang sudah masuk waktu ukur, urutan, kuota)
 * sejak 5 Okt 2026 tinggal di DATABASE — `_hitung_wo_pengukuran` di
 * `scripts/rencana-pengukuran.sql` — karena WO kini bisa terbit sendiri
 * tanggal 1 tanpa layar web. Satu aturan, satu tempat; diuji sama persis
 * dengan aturan web lama pada data asli keempat ULP.
 *
 * Umur pengukuran selalu dihitung terhadap TANGGAL WO, bukan terhadap hari ini.
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
  /** Berapa gardu yang diterbitkan per bulan per ULP (aturan sistem). */
  kuota_per_bulan: number;
  /** Gardu yang belum pernah diukur ikut jadi kandidat. */
  sertakan_belum_pernah: boolean;
  /** Gardu berstatus Nonaktif tidak di-WO-kan. */
  hanya_gardu_aktif: boolean;
  /** WO terbit sendiri tanggal 1 pukul 00.10 WITA (5 Okt 2026). */
  terbit_otomatis: boolean;
}

export const DEFAULT_WO_SETTINGS: WoSettings = {
  ambang_beban_pct: 80,
  bulan_beban_tinggi: 3,
  bulan_beban_rendah: 5,
  kuota_per_bulan: 50,
  sertakan_belum_pernah: true,
  hanya_gardu_aktif: true,
  terbit_otomatis: false,
};

// ── Alasan gardu masuk WO ─────────────────────────────────────────────────────

export type AlasanWo = "belum_pernah" | "kedaluwarsa" | "tempelan" | "rencana" | "sisa";

/** "Kedaluwarsa" diganti "Sudah masuk waktu ukur" (keputusan user 5 Okt 2026). */
export const LABEL_ALASAN: Record<AlasanWo, string> = {
  belum_pernah: "Belum pernah diukur",
  kedaluwarsa: "Sudah masuk waktu ukur",
  tempelan: "Tempel WO",
  rencana: "Sesuai rencana ULP",
  sisa: "Sisa bulan lalu",
};

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Tanggal 1 bulan tersebut, sebagai YYYY-MM-DD. Bulan 1–12. */
export const tanggalWo = (tahun: number, bulan: number): string =>
  `${tahun}-${String(bulan).padStart(2, "0")}-01`;

/**
 * Jendela satu bulan WO: `awal` inklusif, `akhir` eksklusif.
 *
 * Batas yang sama dipakai view realisasi di database. Dibuat satu tempat supaya
 * penyaringan di sisi aplikasi tidak bisa bergeser sehari dari yang di SQL —
 * kalau bergeser, "sudah di-WO" dan "di luar WO" akan menghitung baris yang
 * sama dua kali atau melewatkannya sama sekali.
 */
export function batasBulanWo(tahun: number, bulan: number): { awal: string; akhir: string } {
  return {
    awal: tanggalWo(tahun, bulan),
    akhir: bulan === 12 ? tanggalWo(tahun + 1, 1) : tanggalWo(tahun, bulan + 1),
  };
}

/**
 * Selisih bulan penuh antara dua tanggal YYYY-MM-DD — dipakai WO Pemeliharaan
 * (versi SQL-nya ada di penyusun WO Pengukuran).
 *
 * Dibulatkan ke bawah dan tidak pernah negatif: gardu yang dikerjakan SETELAH
 * tanggal WO berumur 0, bukan −1 yang akan mengacaukan pengurutan.
 */
export function umurBulan(dari: string, sampai: string): number {
  const [ya, ma, da] = dari.split("-").map(Number);
  const [yb, mb, db] = sampai.split("-").map(Number);
  let bulan = (yb - ya) * 12 + (mb - ma);
  if (db < da) bulan -= 1;
  return Math.max(0, bulan);
}

/**
 * Satu koordinat jadi angka, atau NULL kalau tidak ada yang bisa dipakai.
 *
 * `Number("")` bernilai 0 — dan 0 adalah koordinat yang SAH secara tipe tapi
 * menunjuk ke tengah Samudra Atlantik. Tanpa penjaga ini, gardu yang koordinat
 * masternya kosong akan tampil punya titik di mobile, lengkap dengan hitungan
 * jarak ribuan kilometer.
 */
export function koordinat(v: number | string | null | undefined): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "number" ? v : Number(String(v).replace(",", "."));
  if (!Number.isFinite(n) || n === 0) return null;
  return n;
}
