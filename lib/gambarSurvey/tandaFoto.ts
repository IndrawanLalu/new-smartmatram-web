/**
 * Simbol yang ditempel di foto survey (22 Okt 2026) — gambar TAMPAK SAMPING
 * sederhana supaya vendor tahu letak pemasangannya: gardu cantol (satu tiang,
 * trafo tergantung, box PHB-TR di bawahnya), gardu portal (dua tiang, trafo di
 * atas palang, box PHB-TR), Tiang JTM, Tiang JTR, dan teks. Titik tanda = KAKI
 * tiang di tanah; gambar berdiri ke atas, besarnya diatur `skala`.
 *
 * Disimpan sebagai DATA (x/y 0–1) — foto aslinya utuh. Satu penggambar kanvas
 * untuk penyunting di layar dan foto di PDF, jadi keduanya pasti sama.
 */

import type { FotoSurvey, JenisTanda, TandaFoto } from "@/lib/surveyJaringan";

export const LABEL_TANDA: Record<JenisTanda, string> = {
  gardu: "Gardu baru",
  tiang_jtm: "Tiang JTM",
  tiang_jtr: "Tiang JTR",
  teks: "Teks",
};
/** Tulisan bawaan di samping simbol (bisa diganti / dikosongkan). */
export const labelBawaan = (t: TandaFoto) =>
  t.jenis === "gardu" ? `Gardu ${t.gardu === "portal" ? "portal" : "cantol"} baru` : t.jenis === "teks" ? "" : LABEL_TANDA[t.jenis];
const JINGGA = "#F97316";
const BIRU = "#2563EB";
const BATANG = "#E5E7EB";
const TRAFO = "#6B7280";
const BOX = "#CBD5E1";
const GELAP = "rgba(17,24,39,.9)";

type Kotak = { x1: number; y1: number; x2: number; y2: number };

/** Tinggi tiang JTM di foto (px) pada skala 1 — sebanding dengan foto. */
const tinggi = (t: TandaFoto, w: number, h: number) => Math.max(40, Math.min(w, h) * 0.32) * (t.skala ?? 1);
const tinggiTiang = (t: TandaFoto, w: number, h: number) => tinggi(t, w, h) * (t.jenis === "tiang_jtr" ? 0.75 : 1);

/** Jarak dua tiang portal dari tengah, relatif tinggi tiang. */
const PORTAL = 0.17;

/** Kotak yang ditempati gambar satu tanda (px) — untuk memilih & menyorot. */
export function kotakTanda(t: TandaFoto, w: number, h: number): Kotak {
  const x = t.x * w;
  const y = t.y * h;
  const H = tinggiTiang(t, w, h);
  if (t.jenis === "teks") {
    const s = Math.max(10, Math.min(w, h) * 0.035);
    return { x1: x - s, y1: y - s, x2: x + s * ((t.teks ?? "Teks").length * 0.7 + 1), y2: y + s };
  }
  const lebar = t.jenis === "gardu" ? (t.gardu === "portal" ? H * (PORTAL + 0.12) : H * 0.22) : H * 0.14;
  return { x1: x - lebar, y1: y - H, x2: x + lebar, y2: y + H * 0.03 };
}

function kotakIsi(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, isi: string, tepi: string, lw: number) {
  ctx.fillStyle = isi;
  ctx.fillRect(x, y, w, h);
  ctx.lineWidth = lw;
  ctx.strokeStyle = tepi;
  ctx.strokeRect(x, y, w, h);
}

function garis(ctx: CanvasRenderingContext2D, x1: number, y1: number, x2: number, y2: number, warna: string, lw: number) {
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.strokeStyle = warna;
  ctx.lineWidth = lw;
  ctx.stroke();
}

/** Satu batang tiang dari kaki (x, y) setinggi H, tepi warna rencana, + travers di puncak. */
function batang(ctx: CanvasRenderingContext2D, x: number, y: number, H: number, tepi: string, lebarTravers: number) {
  const b = Math.max(3, H * 0.035);
  kotakIsi(ctx, x - b / 2, y - H, b, H, BATANG, tepi, Math.max(1.5, b * 0.35));
  garis(ctx, x - lebarTravers, y - H * 0.94, x + lebarTravers, y - H * 0.94, tepi, Math.max(2, b * 0.55));
}

/** Trafo: badan bersirip + tiga bushing di atasnya. */
function trafo(ctx: CanvasRenderingContext2D, cx: number, atas: number, lebar: number, tinggiT: number, lw: number) {
  kotakIsi(ctx, cx - lebar / 2, atas, lebar, tinggiT, TRAFO, JINGGA, lw);
  for (let i = 1; i < 4; i++) garis(ctx, cx - lebar / 2 + (lebar * i) / 4, atas + tinggiT * 0.15, cx - lebar / 2 + (lebar * i) / 4, atas + tinggiT * 0.85, "#9CA3AF", lw * 0.6);
  for (const d of [-0.3, 0, 0.3]) garis(ctx, cx + lebar * d, atas, cx + lebar * d, atas - tinggiT * 0.25, "#fff", lw * 0.9);
}

/** Box PHB-TR (LV board) di tiang, dengan kabel dari trafo. */
function box(ctx: CanvasRenderingContext2D, cx: number, atas: number, H: number, lw: number) {
  const bw = H * 0.12;
  const bh = H * 0.15;
  kotakIsi(ctx, cx - bw / 2, atas, bw, bh, BOX, JINGGA, lw);
  ctx.fillStyle = GELAP;
  ctx.font = `bold ${Math.max(7, Math.round(bw * 0.28))}px sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("PHB", cx, atas + bh / 2);
  ctx.textAlign = "start";
}

function gardu(ctx: CanvasRenderingContext2D, t: TandaFoto, x: number, y: number, H: number) {
  const lw = Math.max(1.5, H * 0.012);
  if (t.gardu === "portal") {
    const d = H * PORTAL;
    batang(ctx, x - d, y, H, JINGGA, H * 0.08);
    batang(ctx, x + d, y, H, JINGGA, H * 0.08);
    // Palang penyangga trafo di antara kedua tiang.
    const palang = y - H * 0.5;
    garis(ctx, x - d - H * 0.03, palang, x + d + H * 0.03, palang, JINGGA, lw * 2.2);
    trafo(ctx, x, palang - H * 0.17, H * 0.2, H * 0.17, lw);
    // Box PHB-TR di TENGAH, menempel di palang bawah yang menyambung kedua
    // tiang (koreksi user 22 Okt); kabel turun lurus dari trafo.
    const bawah = y - H * 0.27;
    garis(ctx, x - d, bawah, x + d, bawah, JINGGA, lw * 1.6);
    garis(ctx, x, palang, x, y - H * 0.34, "#111827", lw);
    box(ctx, x, y - H * 0.34, H, lw);
    return;
  }
  batang(ctx, x, y, H, JINGGA, H * 0.12);
  // Trafo tergantung di sisi kanan tiang.
  const bw = H * 0.17;
  const cx = x + H * 0.035 / 2 + bw / 2 + H * 0.01;
  garis(ctx, x, y - H * 0.7, cx - bw / 2, y - H * 0.7, JINGGA, lw * 1.6);
  trafo(ctx, cx, y - H * 0.7, bw, H * 0.16, lw);
  garis(ctx, cx, y - H * 0.54, x, y - H * 0.34, "#111827", lw);
  box(ctx, x, y - H * 0.34, H, lw);
}

function tulis(ctx: CanvasRenderingContext2D, teks: string, x: number, y: number, s: number, kotak: boolean) {
  ctx.font = `bold ${Math.round(s)}px sans-serif`;
  ctx.textBaseline = "middle";
  if (kotak) {
    const w = ctx.measureText(teks).width;
    ctx.fillStyle = "rgba(17,24,39,.75)";
    ctx.fillRect(x - s * 0.35, y - s * 0.75, w + s * 0.7, s * 1.5);
    ctx.fillStyle = "#fff";
    ctx.fillText(teks, x, y);
    return;
  }
  ctx.lineWidth = s * 0.28;
  ctx.strokeStyle = GELAP;
  ctx.lineJoin = "round";
  ctx.strokeText(teks, x, y);
  ctx.fillStyle = "#fff";
  ctx.fillText(teks, x, y);
}

/** Gambar semua tanda di atas foto yang sudah tergambar selebar w × h. */
export function gambarTanda(ctx: CanvasRenderingContext2D, tanda: TandaFoto[], w: number, h: number, pilih: number | null = null) {
  const huruf = Math.max(10, Math.min(w, h) * 0.035);
  tanda.forEach((t, i) => {
    const x = t.x * w;
    const y = t.y * h;
    const H = tinggiTiang(t, w, h);
    if (t.jenis === "gardu") gardu(ctx, t, x, y, H);
    else if (t.jenis === "tiang_jtm") batang(ctx, x, y, H, JINGGA, H * 0.12);
    else if (t.jenis === "tiang_jtr") {
      batang(ctx, x, y, H, BIRU, H * 0.05);
      // Rak JTR.
      garis(ctx, x, y - H * 0.85, x + H * 0.07, y - H * 0.85, BIRU, Math.max(2, H * 0.02));
    }
    const k = kotakTanda(t, w, h);
    if (pilih === i) {
      ctx.setLineDash([6, 4]);
      ctx.lineWidth = 2;
      ctx.strokeStyle = "#A78BFA";
      ctx.strokeRect(k.x1 - 4, k.y1 - 4, k.x2 - k.x1 + 8, k.y2 - k.y1 + 8);
      ctx.setLineDash([]);
    }
    const teks = t.jenis === "teks" ? (t.teks || "Teks") : (t.teks ?? labelBawaan(t));
    if (!teks) return;
    if (t.jenis === "teks") tulis(ctx, teks, x, y, huruf, true);
    else tulis(ctx, teks, k.x2 + huruf * 0.4, k.y1 + huruf, huruf, false);
  });
}

/** Tanda di bawah titik (x, y piksel) — yang terakhir digambar didahulukan. -1 = tidak ada. */
export function kenaTanda(tanda: TandaFoto[], x: number, y: number, w: number, h: number): number {
  for (let i = tanda.length - 1; i >= 0; i--) {
    const k = kotakTanda(tanda[i], w, h);
    if (x >= k.x1 - 6 && x <= k.x2 + 6 && y >= k.y1 - 6 && y <= k.y2 + 6) return i;
  }
  return -1;
}

export const muatFoto = (url: string) =>
  new Promise<HTMLImageElement>((ok, gagal) => {
    const i = new Image();
    i.crossOrigin = "anonymous";
    i.onload = () => ok(i);
    i.onerror = () => gagal(new Error("Foto tidak bisa dibaca."));
    i.src = url;
  });

/**
 * Foto + tandanya untuk PDF, dipotong pas ke `rasio` (lebar/tinggi) seperti
 * object-fit cover. Tanda digambar di FOTO UTUH dulu (ukurannya sama dengan di
 * penyunting), baru dipotong. Gagal = null.
 */
export async function fotoBertanda(f: FotoSurvey, rasio: number, maks: number): Promise<string | null> {
  try {
    const img = await muatFoto(f.url);
    const iw = img.naturalWidth;
    const ih = img.naturalHeight;
    const utuh = document.createElement("canvas");
    utuh.width = iw;
    utuh.height = ih;
    const cu = utuh.getContext("2d");
    if (!cu) return null;
    cu.drawImage(img, 0, 0);
    gambarTanda(cu, f.tanda, iw, ih);

    const pw = iw / ih > rasio ? ih * rasio : iw;
    const ph = iw / ih > rasio ? ih : iw / rasio;
    const k = Math.min(1, maks / Math.max(pw, ph));
    const kanvas = document.createElement("canvas");
    kanvas.width = Math.round(pw * k);
    kanvas.height = Math.round(ph * k);
    const ctx = kanvas.getContext("2d");
    if (!ctx) return null;
    ctx.drawImage(utuh, (iw - pw) / 2, (ih - ph) / 2, pw, ph, 0, 0, kanvas.width, kanvas.height);
    return kanvas.toDataURL("image/jpeg", 0.85);
  } catch {
    return null;
  }
}
