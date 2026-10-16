import { readFile } from "node:fs/promises";
import path from "node:path";
import { HURUF, HURUF_JUDUL, HURUF_TANGAN } from "./gaya";

/**
 * Huruf & gambar bingkai, dibaca dari `public/gambar-laporan/` (ikut tersalin ke
 * image Docker bersama `public/`). Dibaca sekali per proses lalu disimpan.
 *
 * Gambar sudah dipotong lebih dulu (foto teknisi memudar, kotak logo PLN, segi
 * enam logo SMART) karena `next/og` tidak mengenal mask/clip-path/filter.
 * Asalnya dari `smart-video/public/aset/`.
 */

const DIR = path.join(process.cwd(), "public", "gambar-laporan");

const HURUF_BERKAS = [
  [HURUF, 500, "Barlow-Medium.ttf"],
  [HURUF, 600, "Barlow-SemiBold.ttf"],
  [HURUF, 700, "Barlow-Bold.ttf"],
  [HURUF, 800, "Barlow-ExtraBold.ttf"],
  [HURUF_JUDUL, 700, "BarlowCondensed-Bold.ttf"],
  [HURUF_JUDUL, 800, "BarlowCondensed-ExtraBold.ttf"],
  [HURUF_TANGAN, 700, "Kalam-Bold.ttf"],
] as const;

export interface GambarBingkai {
  foto: string;
  logoPln: string;
  logoSmart: string;
}

const png = async (nama: string) => `data:image/png;base64,${(await readFile(path.join(DIR, nama))).toString("base64")}`;

async function baca() {
  const [fonts, foto, logoPln, logoSmart] = await Promise.all([
    Promise.all(
      HURUF_BERKAS.map(async ([name, weight, berkas]) => ({
        name,
        weight,
        style: "normal" as const,
        data: await readFile(path.join(DIR, berkas)),
      })),
    ),
    png("foto-header.png"),
    png("logo-pln.png"),
    png("logo-smart.png"),
  ]);
  return { fonts, gambar: { foto, logoPln, logoSmart } satisfies GambarBingkai };
}

let simpanan: ReturnType<typeof baca> | null = null;

export function muatAset() {
  // Gagal baca jangan disimpan — permintaan berikutnya mencoba lagi.
  simpanan ??= baca().catch((e) => {
    simpanan = null;
    throw e;
  });
  return simpanan;
}
