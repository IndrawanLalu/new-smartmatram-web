import type { ImageResponse } from "next/og";
import { buatGambarRatingYantek } from "./buatRatingYantek";
import { buatGambarRekapKinerja } from "./buatRekapKinerja";
import type { JenisLaporan } from "./laporan";

/**
 * Pembuat PNG per jenis laporan. Pemanggil yang menjaga hak akses ULP —
 * pembuatnya membaca dengan service role. Dipisah dari route supaya pengirim
 * otomatis (WA/Telegram) nanti bisa memakainya tanpa lewat HTTP.
 */

type Pembuat = (ulp: string, tahun: number, bulan: number, halaman: number) => Promise<{ gambar: ImageResponse; jumlahHalaman: number }>;

export const JENIS_BUAT: Record<JenisLaporan, Pembuat> = {
  "rekap-kinerja": (ulp, tahun, bulan) => buatGambarRekapKinerja(ulp, tahun, bulan),
  "rating-yantek": buatGambarRatingYantek,
};
