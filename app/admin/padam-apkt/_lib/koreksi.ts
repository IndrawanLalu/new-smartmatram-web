/**
 * Koreksi waktu nyala, dan angka-angka yang ikut berubah karenanya.
 *
 * Waktu nyala di APKT kadang keliru karena penutupan laporan terlambat. Yang
 * disimpan di database HANYA waktu nyala koreksinya; durasi, Jam × Pelanggan,
 * dan ENS versi koreksi diturunkan di sini. Ketiga hubungan di bawah diperiksa
 * atas 154 baris nyata dan berlaku persis tanpa kecuali:
 *
 *   lama_padam_jam        = (nyala − padam) dalam jam
 *   jam_x_pelanggan_padam = lama_padam_jam × jml_pelanggan_padam
 *   ens                   = beban kejadian (kW) × lama_padam_jam
 *
 * Beban kW-nya sendiri tidak tersimpan — nilainya berbeda tiap kejadian (0,67
 * sampai 19.599 kW). Jadi ENS koreksi dihitung dengan menahan kW itu tetap dan
 * hanya menukar durasinya, yang secara aljabar sama dengan menskalakan ENS asli
 * menurut rasio durasi.
 */

/** Kolom yang dibutuhkan perhitungan ini — sengaja minimal supaya bisa dipakai
 *  atas bentuk baris mana pun yang membawanya. */
export interface BarisKoreksi {
  tgl_padam: string | null;
  jam_padam: string | null;
  tgl_nyala: string | null;
  jam_nyala: string | null;
  tgl_nyala_koreksi: string | null;
  jam_nyala_koreksi: string | null;
  lama_padam_jam: number | null;
  jml_pelanggan_padam: number | null;
  jam_x_pelanggan_padam: number | null;
  ens: number | null;
}

/** Angka satu kejadian — dipakai untuk sisi asli maupun sisi koreksi. */
export interface NilaiPadam {
  /** Lama padam dalam JAM (satuan kolom aslinya). */
  lamaJam: number;
  jamXPelanggan: number;
  ens: number;
}

/** "05:07" atau "05:07:50" → "05:07:50". Kolom `time` Postgres memulangkan
 *  bentuk panjang, sedangkan `<input type="time">` memberi bentuk pendek. */
export function normJam(jam: string | null): string | null {
  const t = jam?.trim();
  if (!t) return null;
  const m = t.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
  if (!m) return null;
  return `${m[1].padStart(2, "0")}:${m[2]}:${m[3] ?? "00"}`;
}

/** Selisih dua titik waktu dalam JAM. `null` bila salah satunya tidak lengkap. */
export function selisihJam(
  tglA: string | null, jamA: string | null,
  tglB: string | null, jamB: string | null,
): number | null {
  const a = normJam(jamA);
  const b = normJam(jamB);
  if (!tglA || !a || !tglB || !b) return null;
  const ms = new Date(`${tglB}T${b}`).getTime() - new Date(`${tglA}T${a}`).getTime();
  return Number.isFinite(ms) ? ms / 3_600_000 : null;
}

export const adaKoreksi = (r: BarisKoreksi) =>
  Boolean(r.tgl_nyala_koreksi && r.jam_nyala_koreksi);

/** Angka apa adanya dari APKT. Memakai kolom tersimpan, bukan menghitung ulang —
 *  itulah angka yang dilaporkan, dan sudah terbukti konsisten dengan waktunya. */
export function nilaiAsli(r: BarisKoreksi): NilaiPadam {
  return {
    lamaJam: r.lama_padam_jam ?? 0,
    jamXPelanggan: r.jam_x_pelanggan_padam ?? 0,
    ens: r.ens ?? 0,
  };
}

/**
 * Turunkan ketiga angka untuk sebuah durasi baru.
 *
 * Dipakai bersama oleh pratinjau di modal (sebelum disimpan) dan perhitungan
 * rekap/MVOD (sesudah disimpan) — satu rumus, jadi angka di layar saat mengetik
 * tidak mungkin berbeda dengan angka yang muncul di rekap setelahnya.
 *
 * Kalau durasi ASLI-nya nol, beban kW-nya tidak bisa dipulihkan dari ENS dan
 * hasilnya nol. Itu jujur: kita memang tidak punya dasar untuk menebaknya.
 */
export function turunkan(r: BarisKoreksi, lamaJam: number): NilaiPadam {
  const lamaAsli = r.lama_padam_jam ?? 0;
  const kw = lamaAsli > 0 ? (r.ens ?? 0) / lamaAsli : 0;
  return {
    lamaJam,
    jamXPelanggan: lamaJam * (r.jml_pelanggan_padam ?? 0),
    ens: kw * lamaJam,
  };
}

/**
 * Angka yang BERLAKU sekarang: hasil koreksi bila ada, apa adanya bila belum.
 *
 * Baris yang belum dikoreksi tetap ikut dengan nilai aslinya. Sisi "koreksi"
 * dibaca sebagai keseluruhan angka yang berlaku — kalau baris yang belum
 * disentuh dibuang, totalnya akan terlihat jauh lebih kecil daripada kenyataan.
 */
export function nilaiKoreksi(r: BarisKoreksi): NilaiPadam {
  if (!adaKoreksi(r)) return nilaiAsli(r);
  const lama = selisihJam(r.tgl_padam, r.jam_padam, r.tgl_nyala_koreksi, r.jam_nyala_koreksi);
  // Koreksi yang mendahului waktu padam tidak masuk akal; UI menolaknya saat
  // menyimpan, tapi baris lama bisa saja sudah telanjur ada.
  if (lama === null || lama < 0) return nilaiAsli(r);
  return turunkan(r, lama);
}

/** Lama padam dalam MENIT untuk sisi yang diminta. MVOD memakai menit. */
export const menitAsli = (r: BarisKoreksi) => nilaiAsli(r).lamaJam * 60;
export const menitKoreksi = (r: BarisKoreksi) => nilaiKoreksi(r).lamaJam * 60;
