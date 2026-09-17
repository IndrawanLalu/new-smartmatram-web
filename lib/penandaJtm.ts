/**
 * Ikon penanda tiang JTM — gardu, LBS, recloser, FCO, dan seterusnya.
 *
 * ADA DI `lib/` KARENA DUA PETA MEMAKAINYA: tab Peta di `/admin/jtm` dan
 * halaman `/admin/peta`. Sempat masing-masing punya gambarannya sendiri, dan
 * yang kedua menggambar semua tiang bertanda sebagai bulat kuning — gardu dan
 * FCO jadi tak terbedakan, padahal bentuknya sudah diatur orang di tab
 * Pengaturan. Satu benda yang tampil beda di dua layar membuat orang berhenti
 * memercayai keduanya.
 *
 * Digambar sebagai HTML, bukan berkas gambar: menambah penanda baru di halaman
 * Pengaturan langsung punya ikon, tanpa seorang pun mengunggah apa pun.
 *
 * BENTUK berbeda, bukan cuma warna berbeda. Peta ini sering dilihat di layar
 * kecil dan sambil terburu-buru, dan bentuk masih terbaca saat warna sudah
 * tidak — termasuk oleh mata yang tidak membedakan merah dan hijau.
 */

export type Bentuk = "kotak" | "segitiga" | "belah" | "bulat";

/** Dipakai kalau baris penanda belum punya warna. */
export const WARNA_PENANDA_BAWAAN = "#1D3573";

const BAYANG = "filter:drop-shadow(0 1px 2px rgba(0,0,0,.45))";

/**
 * Potongan HTML satu penanda. Pemanggilnya yang membungkusnya jadi `L.divIcon`,
 * karena tiap peta menambatkannya berbeda.
 *
 * @param sisi panjang sisi dalam piksel — ikon selalu bujur sangkar `sisi × sisi`.
 */
export function htmlPenandaJtm(
  bentuk: Bentuk | null,
  warna: string | null,
  sisi = 16,
): string {
  const w = warna ?? WARNA_PENANDA_BAWAAN;

  // Segitiga dibuat dari border, bukan kotak yang dipotong: tidak ada bidang
  // persegi tak terlihat yang ikut menangkap kursor di sekelilingnya.
  if (bentuk === "segitiga") {
    return `<div style="width:0;height:0;border-left:${sisi / 2}px solid transparent;border-right:${sisi / 2}px solid transparent;border-bottom:${sisi}px solid ${w};${BAYANG}"></div>`;
  }

  const rupa =
    bentuk === "bulat"
      ? "border-radius:50%"
      : bentuk === "belah"
        ? "transform:rotate(45deg)"
        : "border-radius:2px";

  return `<div style="width:${sisi}px;height:${sisi}px;background:${w};border:2px solid #fff;${BAYANG};${rupa}"></div>`;
}
