/**
 * Kertas gambar survey (A3 mendatar) — dipakai bersama gambar survey usulan
 * perbaikan JTR dan Survey Jaringan Baru. Hanya hitungan: proyeksi koordinat
 * ke kertas (Web Mercator, sama dengan ubin peta), penempatan label yang
 * menghindari titik/simbol/garis, skala grafis, dan ubin latar.
 *
 * Kolom kanan (data, material) dan blok judul di bawah (pengesah, keterangan,
 * judul, kop — format contohAset/Legenda.png) DI LUAR ruang gambar, jadi
 * tabel tidak mungkin menutupi jaringan.
 */

/** Ruang gambar di kertas A3 mendatar (pt); kolom kanan & blok judul di bawah di luar ini. */
export const GAMBAR_W = 878;
export const GAMBAR_H = 626;
const TEPI = 36;
/** Batas perbesaran (pt per meter) — jaringan kecil tidak digambar raksasa. */
const SKALA_MAKS = 4;

export type Koord = { lat: number; lng: number };
export type Titik = { x: number; y: number };
export type Kotak = { x1: number; y1: number; x2: number; y2: number };

/** Letak kertas di dunia ubin: titik (0,0) gambar = (x0, y0) zoom 0; `skala` pt per satuan. */
export interface Ruang {
  x0: number;
  y0: number;
  skala: number;
}

export interface Proyeksi {
  ke: (k: Koord) => Titik;
  /** pt per meter — untuk skala grafis. */
  skalaM: number;
  ruang: Ruang;
}

/** Koordinat → piksel ubin zoom 0 (Web Mercator). */
const dunia = (k: Koord): Titik => {
  const s = Math.sin((k.lat * Math.PI) / 180);
  return { x: ((k.lng + 180) / 360) * 256, y: (0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI)) * 256 };
};

/** Semua titik yang harus muat di kertas → proyeksi ke pt kertas. */
export function proyeksi(semua: Koord[]): Proyeksi {
  const lat0 = semua.reduce((t, k) => t + k.lat, 0) / (semua.length || 1);
  const meterPerDunia = (Math.cos((lat0 * Math.PI) / 180) * 40_075_016.686) / 256;
  const m = semua.map(dunia);
  const minX = Math.min(...m.map((p) => p.x));
  const maxX = Math.max(...m.map((p) => p.x));
  const minY = Math.min(...m.map((p) => p.y));
  const maxY = Math.max(...m.map((p) => p.y));
  const skala = Math.min(
    (GAMBAR_W - 2 * TEPI) / (maxX - minX || 1e-9),
    (GAMBAR_H - 2 * TEPI) / (maxY - minY || 1e-9),
    SKALA_MAKS * meterPerDunia,
  );
  const ox = (GAMBAR_W - (maxX - minX) * skala) / 2 - minX * skala;
  const oy = (GAMBAR_H - (maxY - minY) * skala) / 2 - minY * skala;
  return {
    ke: (k) => {
      const p = dunia(k);
      return { x: ox + p.x * skala, y: oy + p.y * skala };
    },
    skalaM: skala / meterPerDunia,
    ruang: { x0: -ox / skala, y0: -oy / skala, skala },
  };
}

/** Geser polyline ke samping (normal kiri), sudut disambung rata-rata normal. */
export function geser(t: Titik[], d: number): Titik[] {
  const normal = (p: Titik, q: Titik) => {
    const dx = q.x - p.x;
    const dy = q.y - p.y;
    const l = Math.hypot(dx, dy) || 1;
    return { x: -dy / l, y: dx / l };
  };
  return t.map((p, i) => {
    const n1 = i > 0 ? normal(t[i - 1], p) : null;
    const n2 = i < t.length - 1 ? normal(p, t[i + 1]) : null;
    const n = n1 && n2 ? { x: n1.x + n2.x, y: n1.y + n2.y } : (n1 ?? n2 ?? { x: 0, y: 0 });
    const l = Math.hypot(n.x, n.y) || 1;
    return { x: p.x + (n.x / l) * d, y: p.y + (n.y / l) * d };
  });
}

export const kotak = (p: Titik, r: number): Kotak => ({ x1: p.x - r, y1: p.y - r, x2: p.x + r, y2: p.y + r });
const tumpang = (a: Kotak, b: Kotak) => a.x1 < b.x2 && b.x1 < a.x2 && a.y1 < b.y2 && b.y1 < a.y2;
/** Lebar teks Helvetica kira-kira. */
const lebar = (teks: string, ukuran: number) => teks.length * ukuran * 0.52;

export interface CalonLabel<J extends string> extends Titik {
  teks: string;
  jenis: J;
  ukuran: number;
  /** Wajib tampil: dicari sampai jauh (dengan garis penunjuk), terakhir dipaksa. */
  wajib: boolean;
}

export interface Label<J extends string> extends Titik {
  teks: string;
  jenis: J;
  ukuran: number;
  /** Garis penunjuk dari titik ke label yang digeser jauh. */
  tarik?: { a: Titik; b: Titik };
}

const ARAH = [0, 1, 2, 3, 4, 5, 6, 7].map((i) => ({ x: Math.cos((i * Math.PI) / 4), y: Math.sin((i * Math.PI) / 4) }));
const JARAK_WAJIB = [5, 14, 26, 40, 58];

/** Kotak label di arah `a` sejauh `r` dari titik — sisi terdekatnya menghadap titik. */
function kotakDi(c: Titik, a: Titik, r: number, w: number, h: number): Kotak {
  const x = c.x + a.x * r - (a.x < -0.3 ? w : a.x > 0.3 ? 0 : w / 2);
  const y = c.y + a.y * r - (a.y < -0.3 ? h : a.y > 0.3 ? 0 : h / 2);
  return { x1: x, y1: y, x2: x + w, y2: y + h };
}

/** Ruas garis memotong kotak? (Liang–Barsky) */
function potong(k: Kotak, a: Titik, b: Titik): boolean {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  let t0 = 0;
  let t1 = 1;
  for (const [p, q] of [[-dx, a.x - k.x1], [dx, k.x2 - a.x], [-dy, a.y - k.y1], [dy, k.y2 - a.y]]) {
    if (p === 0) {
      if (q < 0) return false;
      continue;
    }
    const r = q / p;
    if (p < 0) t0 = Math.max(t0, r);
    else t1 = Math.min(t1, r);
    if (t0 > t1) return false;
  }
  return true;
}

/** Titik pada tepi kotak yang paling dekat ke p — ujung garis penunjuk. */
const tepiTerdekat = (k: Kotak, p: Titik): Titik => ({ x: Math.min(Math.max(p.x, k.x1), k.x2), y: Math.min(Math.max(p.y, k.y1), k.y2) });

/**
 * Label ditaruh rakus menurut urutan `calon` (yang penting di depan). Label
 * biasa: kanan → kiri → atas → bawah titiknya, yang bertumpuk dilewati. Label
 * wajib dicari melingkar makin jauh dan diberi garis penunjuk bila jauh dari
 * titiknya. Posisi yang tidak menimpa garis didahulukan.
 */
export function tempatkan<J extends string>(calon: CalonLabel<J>[], penghalang: Kotak[], ruas: [Titik, Titik][]): Label<J>[] {
  const terisi = [...penghalang];
  const hasil: Label<J>[] = [];
  const dalam = (k: Kotak) => k.x1 >= 2 && k.y1 >= 2 && k.x2 <= GAMBAR_W - 2 && k.y2 <= GAMBAR_H - 2;
  for (const c of calon) {
    const w = lebar(c.teks, c.ukuran);
    const h = c.ukuran;
    const pilihan = c.wajib
      ? JARAK_WAJIB.flatMap((r) => ARAH.map((a) => kotakDi(c, a, r, w, h)))
      : [ARAH[0], ARAH[4], ARAH[6], ARAH[2]].map((a) => kotakDi(c, a, 5, w, h));
    const muat = pilihan.filter(dalam);
    const bebas = muat.filter((k) => !terisi.some((t) => tumpang(k, t)));
    const k = bebas.find((k) => !ruas.some(([a, b]) => potong(k, a, b))) ?? bebas[0] ?? (c.wajib ? (muat[0] ?? pilihan[0]) : null);
    if (!k) continue;
    terisi.push(k);
    const ujung = tepiTerdekat(k, c);
    const jauh = Math.hypot(ujung.x - c.x, ujung.y - c.y) > 8;
    hasil.push({ x: k.x1, y: k.y1, teks: c.teks, jenis: c.jenis, ukuran: c.ukuran, ...(jauh ? { tarik: { a: { x: c.x, y: c.y }, b: ujung } } : {}) });
  }
  return hasil;
}

/** Panjang skala grafis yang bulat dan muat di kolom kanan. */
export function skalaGrafis(skala: number, maksPt = 150): { meter: number; pt: number } {
  const bulat = [5, 10, 20, 25, 50, 100, 200, 250, 500, 1000, 2000];
  const meter = [...bulat].reverse().find((x) => x * skala <= maksPt) ?? bulat[0];
  return { meter, pt: meter * skala };
}

/** Ubin OpenStreetMap — sama dengan latar "Peta jalan" di /peta. */
export const UBIN_OSM = (z: number, x: number, y: number) => `https://${"abc"[(x + y) % 3]}.tile.openstreetmap.org/${z}/${x}/${y}.png`;
const ZOOM_MAKS = 19;

export interface RencanaUbin {
  /** Ukuran gambar latar (piksel) — menutup seluruh ruang gambar. */
  lebar: number;
  tinggi: number;
  ubin: { url: string; dx: number; dy: number }[];
}

/**
 * Ubin peta yang menutup ruang gambar. Zoom dipilih supaya ±1,4–2,8 piksel per
 * pt (tajam dicetak A3) tanpa mengunduh ubin berlebihan.
 */
export function rencanaUbin(ruang: Ruang): RencanaUbin {
  const z = Math.max(0, Math.min(ZOOM_MAKS, Math.round(Math.log2(ruang.skala * 2))));
  const k = 2 ** z;
  const pxPerPt = k / ruang.skala;
  const lebar = Math.round(GAMBAR_W * pxPerPt);
  const tinggi = Math.round(GAMBAR_H * pxPerPt);
  const gx = ruang.x0 * k;
  const gy = ruang.y0 * k;
  const ubin: RencanaUbin["ubin"] = [];
  for (let ty = Math.floor(gy / 256); ty <= Math.floor((gy + tinggi) / 256); ty++) {
    if (ty < 0 || ty >= k) continue;
    for (let tx = Math.floor(gx / 256); tx <= Math.floor((gx + lebar) / 256); tx++) {
      ubin.push({ url: UBIN_OSM(z, ((tx % k) + k) % k, ty), dx: Math.round(tx * 256 - gx), dy: Math.round(ty * 256 - gy) });
    }
  }
  return { lebar, tinggi, ubin };
}
