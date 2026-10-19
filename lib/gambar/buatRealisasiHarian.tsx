import { ImageResponse } from "next/og";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { fetchAllRows } from "@/lib/supabasePaginate";
import { keBarisBulanan } from "@/app/admin/kinerja-yantek/_lib/realisasiBulanan";
import { muatAset } from "./aset";
import { GagalLaporan } from "./laporan";
import { G_LEBAR, G_TINGGI } from "./gaya";
import { siapkanIkon } from "./ikon";
import { RealisasiHarian } from "./RealisasiHarian";

/**
 * PNG Realisasi Harian SMART Mataram — keempat ULP, satu tanggal, ditambah
 * total bulan berjalan s.d. tanggal itu. Satu sumber dengan teks WA Rekap
 * Kinerja: `realisasi_bulanan` (scripts/realisasi-rentang.sql), jadi angka
 * gambar dan teks yang dikirim bersamaan pasti sama.
 * Pemanggil yang menjaga hak akses (UP3 saja) — fungsi ini membaca dengan service role.
 */

/** Tanggal & jam sekarang di WITA. */
const kiniWita = () => {
  const w = new Date(Date.now() + 8 * 3600 * 1000);
  return {
    tgl: w.toISOString().slice(0, 10),
    jam: `${String(w.getUTCHours()).padStart(2, "0")}.${String(w.getUTCMinutes()).padStart(2, "0")}`,
  };
};

export async function buatGambarRealisasiHarian(tgl: string) {
  const kini = kiniWita();
  if (tgl > kini.tgl) throw new GagalLaporan(`Tanggal ${tgl} belum tiba.`);
  const [tahun, bulan] = tgl.split("-").map(Number);

  const [rows, aset] = await Promise.all([
    // Gagal baca dilempar — jangan terbitkan gambar berisi strip semua (teknisaplikasi butir 6).
    fetchAllRows<Record<string, unknown>>(() =>
      supabaseAdmin
        .rpc("realisasi_bulanan", { p_ulp: "SEMUA", p_tahun: tahun, p_bulan: bulan })
        .order("ulp")
        .order("kunci")
        .order("tgl"),
    ).catch((e: Error) => {
      throw new Error(`realisasi_bulanan gagal: ${e.message}`);
    }),
    muatAset(),
  ]);

  const baris = rows.map(keBarisBulanan).filter((b) => b.tgl <= tgl);
  const el = (
    <RealisasiHarian gambar={aset.gambar} tgl={tgl} jam={tgl === kini.tgl ? kini.jam : null} baris={baris} />
  );
  await siapkanIkon(el);
  return { gambar: new ImageResponse(el, { width: G_LEBAR, height: G_TINGGI, fonts: aset.fonts }), jumlahHalaman: 1 };
}
