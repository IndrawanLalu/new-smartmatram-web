import { ImageResponse } from "next/og";
import { muatAset } from "./aset";
import type { DataGardu } from "./dataGardu";
import { KartuDataGardu, LEBAR, tinggiDataGardu } from "./KartuDataGardu";
import { siapkanIkon } from "./ikon";

/** "21 Okt 2026 20.15" — waktu WITA sekarang. */
function kiniWita() {
  const w = new Date(Date.now() + 8 * 3600 * 1000);
  const bln = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"][w.getUTCMonth()];
  const dua = (n: number) => String(n).padStart(2, "0");
  return `${w.getUTCDate()} ${bln} ${w.getUTCFullYear()} ${dua(w.getUTCHours())}.${dua(w.getUTCMinutes())}`;
}

/** PNG kartu `#DATA <kode>` (lebar 1080, tinggi mengikuti isi). */
export async function buatGambarDataGardu(d: DataGardu) {
  const aset = await muatAset();
  const el = <KartuDataGardu d={d} gambar={aset.gambar} dibuat={kiniWita()} />;
  await siapkanIkon(el);
  const gambar = new ImageResponse(el, { width: LEBAR, height: tinggiDataGardu(d), fonts: aset.fonts });
  return Buffer.from(await gambar.arrayBuffer());
}
