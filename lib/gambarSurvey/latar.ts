import { rencanaUbin, type Ruang } from "./kertas";

/** Bahan gambar survey yang hanya bisa diambil di peramban: latar peta, logo, unduhan. */

const keDataUrl = (b: Blob) =>
  new Promise<string>((ok, gagal) => {
    const r = new FileReader();
    r.onload = () => ok(String(r.result));
    r.onerror = () => gagal(r.error);
    r.readAsDataURL(b);
  });

export async function ambilLogo() {
  const r = await fetch("/logo-pln.png");
  return r.ok ? keDataUrl(await r.blob()) : null;
}

const muatGambar = (url: string) =>
  new Promise<HTMLImageElement | null>((ok) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => ok(img);
    img.onerror = () => ok(null);
    img.src = url;
  });

/** Ubin peta jalan dijahit di kanvas → JPEG. Gagal semua (luring) = tanpa latar. */
export async function ambilLatar(ruang: Ruang): Promise<string | null> {
  const r = rencanaUbin(ruang);
  const kanvas = document.createElement("canvas");
  kanvas.width = r.lebar;
  kanvas.height = r.tinggi;
  const ctx = kanvas.getContext("2d");
  if (!ctx) return null;
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, r.lebar, r.tinggi);
  const gambar = await Promise.all(r.ubin.map((u) => muatGambar(u.url)));
  if (!gambar.some(Boolean)) return null;
  gambar.forEach((img, i) => img && ctx.drawImage(img, r.ubin[i].dx, r.ubin[i].dy));
  // Dipudarkan sedikit supaya garis jaringan lebih menonjol dari peta.
  ctx.fillStyle = "rgba(255,255,255,0.3)";
  ctx.fillRect(0, 0, r.lebar, r.tinggi);
  return kanvas.toDataURL("image/jpeg", 0.85);
}

export function unduhBerkas(blob: Blob, nama: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = nama;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
