import type { FungsiTanya } from "./jenis";
import { garduOverload } from "./garduOverload";
import { bebanGardu, kartuGardu } from "./gardu";
import { cariGardu } from "./cariGardu";
import { teganganUjung } from "./teganganUjung";
import { gangguan } from "./gangguan";
import { temuan } from "./temuan";
import { realisasi } from "./realisasi";

/** Bantuan: contoh pertanyaan tiap fungsi aktif (dari tabel, diatur di web). */
const bantuan: FungsiTanya = {
  kode: "bantuan",
  nama: "Bantuan",
  saringan: [],
  kata: [["bantuan", 2], ["help", 2], ["menu", 2], ["bisa apa", 2], ["contoh", 2], ["panduan", 2], ["halo", 1], ["hai", 1]],
  contoh: ["@smart bantuan"],
  async jalankan({ contoh }) {
    const L = ["📟 *Tanya SMART*", "Tanya pakai kalimat biasa, diawali *@smart* (di grup). Contoh:", ""];
    for (const f of contoh) {
      if (!f.teks.length) continue;
      L.push(`*${f.nama}*`, ...f.teks.map((t) => `» ${t}`), "");
    }
    L.push("Bisa ditambah ULP (ampenan, cakra, gerung, tanjung) dan waktu (hari ini, kemarin, minggu ini, bulan lalu, september…).");
    L.push("Perintah lama (#DATA, #beban, …) tetap bisa dipakai.");
    return L.join("\n");
  },
};

/** Semua fungsi jawaban. Fungsi baru: satu berkas di folder ini + daftarkan di sini. */
export const FUNGSI: FungsiTanya[] = [
  garduOverload, kartuGardu, bebanGardu, cariGardu, teganganUjung, gangguan, temuan, realisasi, bantuan,
];

export const fungsiMenurutKode = new Map(FUNGSI.map((f) => [f.kode, f]));
