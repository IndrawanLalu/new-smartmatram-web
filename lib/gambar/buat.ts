import type { ImageResponse } from "next/og";
import { buatGambarRatingYantek } from "./buatRatingYantek";
import { buatGambarRealisasiHarian } from "./buatRealisasiHarian";
import { buatGambarRekapKinerja } from "./buatRekapKinerja";
import type { JenisLaporan, Permintaan } from "./laporan";

/**
 * Pembuat PNG per jenis laporan. Pemanggil yang menjaga hak akses ULP —
 * pembuatnya membaca dengan service role. Dipisah dari route supaya pengirim
 * otomatis (WA) bisa memakainya tanpa lewat HTTP.
 */

type Pembuat = (p: Permintaan) => Promise<{ gambar: ImageResponse; jumlahHalaman: number }>;

export const JENIS_BUAT: Record<JenisLaporan, Pembuat> = {
  "rekap-kinerja": (p) => buatGambarRekapKinerja(p.ulp, p.tahun, p.bulan),
  "rating-yantek": (p) => buatGambarRatingYantek(p.ulp, p.tahun, p.bulan, p.halaman),
  "realisasi-harian": (p) => buatGambarRealisasiHarian(p.tgl),
};
