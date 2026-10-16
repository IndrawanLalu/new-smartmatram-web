import { ImageResponse } from "next/og";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { muatAset } from "./aset";
import { GagalLaporan } from "./laporan";
import { G_LEBAR, G_TINGGI } from "./gaya";
import { siapkanIkon } from "./ikon";
import { RekapKinerja, type BarisGambar } from "./RekapKinerja";

/**
 * PNG Rekap Kinerja satu ULP, satu bulan. Dipisah dari route supaya bisa
 * dipakai pengirim otomatis (WA/Telegram) nanti tanpa lewat HTTP.
 * Pemanggil yang menjaga hak akses ULP — fungsi ini membaca dengan service role.
 */

interface BarisRpc {
  kunci: string;
  wo_terbit: number | string | null;
  sla?: number | string | null;
  realisasi: number | string | null;
  belum_disetujui: number | string | null;
}

const angka = (v: number | string | null | undefined) => (v === null || v === undefined ? null : Number(v));

/** Tanggal hari ini di WITA, YYYY-MM-DD. */
const hariIniWita = () => new Date(Date.now() + 8 * 3600 * 1000).toISOString().slice(0, 10);

export async function buatGambarRekapKinerja(ulp: string, tahun: number, bulan: number) {
  const hariIni = hariIniWita();
  const periode = `${tahun}-${String(bulan).padStart(2, "0")}`;
  if (periode > hariIni.slice(0, 7)) throw new GagalLaporan(`Bulan ${periode} belum dimulai.`);
  // Bulan berjalan: data s.d. hari ini. Bulan lalu: s.d. hari terakhirnya.
  const akhirBulan = `${periode}-${String(new Date(tahun, bulan, 0).getDate()).padStart(2, "0")}`;
  const dataSampai = periode === hariIni.slice(0, 7) ? hariIni : akhirBulan;

  const [{ data, error }, aset] = await Promise.all([
    supabaseAdmin.rpc("rekap_kinerja", { p_ulp: ulp, p_tahun: tahun, p_bulan: bulan }),
    muatAset(),
  ]);
  // Gagal baca ≠ nol: jangan terbitkan gambar berisi strip semua (teknisaplikasi butir 6).
  if (error) throw new Error(`rekap_kinerja gagal: ${error.message}`);

  const baris: BarisGambar[] = ((data ?? []) as BarisRpc[]).map((r) => ({
    kunci: r.kunci,
    woTerbit: angka(r.wo_terbit),
    sla: angka(r.sla),
    realisasi: angka(r.realisasi),
    belumDisetujui: angka(r.belum_disetujui),
    gagal: false,
  }));

  const el = <RekapKinerja gambar={aset.gambar} ulp={ulp} tahun={tahun} bulan={bulan} dataSampai={dataSampai} baris={baris} />;
  await siapkanIkon(el);
  return { gambar: new ImageResponse(el, { width: G_LEBAR, height: G_TINGGI, fonts: aset.fonts }), jumlahHalaman: 1 };
}
