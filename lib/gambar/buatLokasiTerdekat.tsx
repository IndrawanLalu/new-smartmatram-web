import { ImageResponse } from "next/og";
import type { LokasiTerdekat } from "@/lib/wa/lokasiTerdekat";
import { muatAset } from "./aset";
import { kiniWita } from "./buatDataGardu";
import { siapkanIkon } from "./ikon";
import { KartuLokasiTerdekat, LEBAR, tinggiLokasi } from "./KartuLokasiTerdekat";

/** PNG balasan WA "kirim lokasi" (lebar 1080, tinggi mengikuti isi). */
export async function buatGambarLokasi(d: LokasiTerdekat) {
  const aset = await muatAset();
  const el = <KartuLokasiTerdekat d={d} gambar={aset.gambar} dibuat={kiniWita()} />;
  await siapkanIkon(el);
  const gambar = new ImageResponse(el, { width: LEBAR, height: tinggiLokasi(d), fonts: aset.fonts });
  return Buffer.from(await gambar.arrayBuffer());
}
