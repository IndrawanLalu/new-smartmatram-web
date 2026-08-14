/**
 * MVOD — nilai kinerja durasi gangguan.
 *
 *     MVOD = maks(0, 2 − ((total durasi ÷ kali padam) ÷ SLA)) × 100
 *
 * Salinan setia rumus Excel yang dipakai unit:
 *
 *     =IF(F32="";"";IFS(F32=0;0;F32<>0;
 *        IF((2-((F33/F32)/F34))<0;0;(2-((F33/F32)/F34))*100)))
 *
 *     F32 = kali padam · F33 = total durasi · F34 = SLA
 *
 * Skalanya 0–200, MAKIN BESAR MAKIN BAIK:
 *
 *     200   rata-rata padam nol menit (sempurna)
 *     100   rata-rata padam tepat selama SLA — batas memenuhi target
 *       0   rata-rata padam DUA KALI SLA ATAU LEBIH BURUK
 *
 * Nol itu lantai, bukan dasar skala. Kinerja tiga kali SLA dan dua kali SLA
 * sama-sama bernilai 0, jadi angka MVOD sendirian tidak bisa membedakan
 * keduanya — karena itu kartu di layar selalu menampilkan rata-rata durasi
 * di sebelahnya, dan menandai secara terpisah kalau nilainya sedang tertahan
 * di lantai.
 *
 * ── Tiga aturan penyaringan, dan dasarnya pada data ─────────────────────────
 *
 * 1. HANYA KODE J. Ditentukan dari huruf pertama `no_laporan` — aturan yang
 *    sama persis dengan tab "Kode J Dobel" di halaman ini, bukan definisi
 *    kedua. Dari 136 baris Juni 2026: 122 berkode J, 14 berkode P. Ke-14 baris
 *    P itu semuanya ber-`equipment = "Pemeliharaan"`, jadi J = gangguan,
 *    P = pekerjaan terencana.
 *
 * 2. HANYA YANG LEBIH DARI 5 MENIT. Saringan ini membuang 78 dari 122 kejadian
 *    (64%), dan 25 di antaranya berpenyebab "AUTORECLOSE" — kedipan yang pulih
 *    sendiri dalam hitungan detik. Efeknya MENURUNKAN nilai MVOD dari 1,16 jadi
 *    −0,29 (Juni 2026), karena selama ini kejadian sedetik-dua detik menarik
 *    rata-rata durasi turun dan menutupi lamanya gangguan yang sungguhan.
 *    Angkanya jadi terlihat lebih buruk justru karena lebih jujur.
 *
 * 3. DURASINYA JAM, BUKAN MENIT. `padam_apkt.lama_padam_jam` bersatuan jam —
 *    diperiksa silang dengan `jam_padam` → `jam_nyala`: 05:07:50 → 05:08:50
 *    (satu menit) tersimpan sebagai 0,0167. Jadi harus dikali 60 dulu sebelum
 *    dibandingkan dengan SLA yang bersatuan menit. Salah di titik ini membuat
 *    MVOD meleset 60 kali lipat.
 */

import { menitAsli, menitKoreksi, type BarisKoreksi } from "./koreksi";

/** Ambang durasi minimum, dalam menit. Kejadian yang TEPAT 5 menit tidak ikut —
 *  aturannya "lebih dari 5 menit". */
export const MIN_DURASI_MENIT = 5;

/** Dipakai kalau tabel `mvod_settings` belum ada isinya. */
export const SLA_MENIT_BAWAAN = 60;

/** Kolom yang dibutuhkan perhitungan ini — sengaja minimal supaya bisa dipakai
 *  atas bentuk baris mana pun yang membawanya. Kolom koreksi ikut karena MVOD
 *  dihitung dua kali: atas waktu asli APKT dan atas waktu setelah koreksi. */
export interface BarisPadam extends BarisKoreksi {
  no_laporan: string;
  status_gangguan: string | null;
  ulp: string | null;
}

/** Sisi perhitungan: apa adanya dari APKT, atau setelah koreksi waktu nyala. */
export type Sisi = "asli" | "koreksi";

export interface HasilMvod {
  /** Jumlah kali padam yang masuk hitungan. */
  kali: number;
  /** Total durasi padam, dalam menit. */
  totalMenit: number;
  /** Rata-rata durasi per kejadian, dalam menit. */
  rataMenit: number;
  /** Nilai MVOD 0–200. `null` bila tidak ada kejadian sama sekali.
   *
   *  Rumus Excel-nya mengembalikan 0 saat kali padam = 0, tapi itu penjaga
   *  #DIV/0!, bukan pernyataan kinerja. Menampilkannya sebagai 0 berarti
   *  berkata "seburuk-buruknya" untuk keadaan yang justru berarti "tidak ada
   *  gangguan untuk diukur". Di layar, `null` tampil sebagai "—". */
  mvod: number | null;
  /** Nilai mentah sebelum dipangkas — negatif berarti sedang tertahan di 0.
   *  Dipakai untuk menandai keadaan itu, bukan untuk ditampilkan. */
  mentah: number;
}

export const KOSONG: HasilMvod = { kali: 0, totalMenit: 0, rataMenit: 0, mvod: null, mentah: 0 };

/** Huruf pertama `no_laporan`. Aturan yang sama dengan tab Kode J Dobel. */
export const isKodeJ = (r: BarisPadam) => r.no_laporan?.[0]?.toUpperCase() === "J";

/** Durasi padam dalam MENIT. Kolom sumbernya bersatuan jam. */
export const durasiMenit = (r: BarisPadam, sisi: Sisi = "asli") =>
  sisi === "koreksi" ? menitKoreksi(r) : menitAsli(r);

/**
 * Baris yang memenuhi kedua syarat MVOD: kode J dan lebih dari 5 menit.
 *
 * Penyaringan ini SENGAJA ikut sisinya. Kejadian yang tercatat 7 menit tapi
 * setelah dikoreksi jadi 3 menit memang keluar dari hitungan — ambang ">5 menit"
 * bagian dari definisi MVOD, bukan penyaring data mentah. Akibatnya jumlah kali
 * padam bisa berbeda antara kedua sisi, dan itu memang harus terlihat.
 */
export const layakMvod = (r: BarisPadam, sisi: Sisi = "asli") =>
  isKodeJ(r) && durasiMenit(r, sisi) > MIN_DURASI_MENIT;

/**
 * Hitung MVOD atas sekumpulan baris yang SUDAH disaring lewat `layakMvod`.
 *
 * Sengaja tidak menyaring di dalam sini: pemanggilnya sering perlu memecah
 * kumpulan yang sama menurut status atau ULP, dan menyaring berulang kali di
 * tiap pemecahan adalah cara mudah membuat salah satunya terlewat.
 */
export function hitungMvod(rows: BarisPadam[], slaMenit: number, sisi: Sisi = "asli"): HasilMvod {
  if (rows.length === 0 || slaMenit <= 0) return KOSONG;
  const totalMenit = rows.reduce((s, r) => s + durasiMenit(r, sisi), 0);
  const rataMenit = totalMenit / rows.length;
  const mentah = (2 - rataMenit / slaMenit) * 100;
  return {
    kali: rows.length,
    totalMenit,
    rataMenit,
    mentah,
    mvod: Math.max(0, mentah),
  };
}

/** "137,3 menit" → "2j 17m". Angka menit di atas satu jam sulit dibayangkan. */
export function fmtDurasi(menit: number): string {
  const t = Math.round(menit);
  if (t < 60) return `${t}m`;
  return `${Math.floor(t / 60)}j ${t % 60}m`;
}

export const fmtMvod = (v: number | null) =>
  v === null ? "—" : v.toFixed(1).replace(".", ",");
