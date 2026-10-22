import { rencanaUbin, type JenisUbin, type Ruang } from "./kertas";

/** Bahan gambar survey yang hanya bisa diambil di peramban: latar peta, logo, unduhan. */

const keDataUrl = (b: Blob) =>
  new Promise<string>((ok, gagal) => {
    const r = new FileReader();
    r.onload = () => ok(String(r.result));
    r.onerror = () => gagal(r.error);
    r.readAsDataURL(b);
  });

/** Logo di blok judul gambar survey: kop PLN (kiri) & SMART sebagai pembuat gambar (kanan bawah). */
export interface LogoLembar {
  pln: string | null;
  smart: string | null;
}

const ambilGambarPublik = async (jalur: string) => {
  const r = await fetch(jalur);
  return r.ok ? keDataUrl(await r.blob()) : null;
};


const muatGambar = (url: string) =>
  new Promise<HTMLImageElement | null>((ok) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => ok(img);
    img.onerror = () => ok(null);
    img.src = url;
  });

/** Ubin peta jalan / citra satelit dijahit di kanvas → JPEG. Gagal semua (luring) = tanpa latar. */
export async function ambilLatar(ruang: Ruang, jenis: JenisUbin = "jalan"): Promise<string | null> {
  const r = rencanaUbin(ruang, jenis);
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
  // Dipudarkan sedikit supaya garis jaringan lebih menonjol dari peta. Citra
  // hanya sedikit — kalau terlalu pudar, bangunan & jalan tidak terbaca lagi.
  ctx.fillStyle = `rgba(255,255,255,${jenis === "citra" ? 0.12 : 0.3})`;
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

/**
 * Foto diperkecil di peramban (sisi terpanjang `maks` px, JPEG). Foto HP
 * 12 MP terlalu berat untuk disimpan apa adanya dan untuk ditanam di PDF.
 */
export async function perkecilFoto(sumber: Blob | string, maks: number): Promise<Blob> {
  const url = typeof sumber === "string" ? sumber : URL.createObjectURL(sumber);
  try {
    const img = await new Promise<HTMLImageElement>((ok, gagal) => {
      const i = new Image();
      i.crossOrigin = "anonymous";
      i.onload = () => ok(i);
      i.onerror = () => gagal(new Error("Foto tidak bisa dibaca."));
      i.src = url;
    });
    const k = Math.min(1, maks / Math.max(img.naturalWidth, img.naturalHeight));
    const kanvas = document.createElement("canvas");
    kanvas.width = Math.round(img.naturalWidth * k);
    kanvas.height = Math.round(img.naturalHeight * k);
    kanvas.getContext("2d")!.drawImage(img, 0, 0, kanvas.width, kanvas.height);
    return await new Promise<Blob>((ok, gagal) => kanvas.toBlob((b) => (b ? ok(b) : gagal(new Error("Foto gagal diperkecil."))), "image/jpeg", 0.82));
  } finally {
    if (typeof sumber !== "string") URL.revokeObjectURL(url);
  }
}

export async function ambilLogo(): Promise<LogoLembar> {
  // Logo "S" SMART (sama dengan ikon aplikasi & Gambar Laporan), 192 px.
  const [pln, smart] = await Promise.all([ambilGambarPublik("/logo-pln.png"), ambilGambarPublik("/gambar-laporan/logo-smart.png")]);
  return { pln, smart };
}
