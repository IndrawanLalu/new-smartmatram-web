import { parsePenormalan } from "./parsePenormalan";
import { prediksiLokasi } from "@/lib/prediksiGangguan/hitung";
import { teksPrediksi } from "@/lib/prediksiGangguan/pesan";
import { BUKAN_GANGGUAN } from "@/lib/prediksiGangguan/peristiwa";

/**
 * Laporan dispatcher yang diteruskan ke japri bot → teks prediksi lokasi.
 * null = bukan laporan gangguan / tidak ada arus. Gagal menghitung tidak
 * membatalkan simpan laporan: yang dikirim cukup kabar singkat.
 */
export async function prediksiDariLaporan(text: string): Promise<string | null> {
  const { ok, data } = parsePenormalan(text);
  if (!ok || !data || BUKAN_GANGGUAN.includes(data.jenis) || !data.penyulang) return null;
  const arus = { r: data.arus_r, s: data.arus_s, t: data.arus_t, n: data.arus_n };
  if (![arus.r, arus.s, arus.t, arus.n].some((v) => v != null && v > 0)) return null;
  try {
    const h = await prediksiLokasi({
      penyulang: data.penyulang, keypoint: data.keypoint, arus, bebanKw: data.beban_kw, trafoGi: data.trafo_gi,
    });
    return teksPrediksi(h);
  } catch (e) {
    console.error("[prediksi-lokasi] gagal:", (e as Error).message);
    return "⚠️ Prediksi lokasi gangguan gagal dihitung (data jaringan tidak terbaca). Laporan tetap tersimpan.";
  }
}
