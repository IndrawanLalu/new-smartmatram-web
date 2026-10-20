/**
 * Gambar survey usulan perbaikan JTR (20 Okt 2026): JTR satu gardu digambar
 * dari koordinat tiang (bentuknya sama dengan di peta, tanpa peta dasar),
 * jalur kabel baru putus-putus. Di sini hanya hitungannya (proyeksi ke
 * kertas, garis, penempatan kode tiang); PDF-nya di GambarSurveyPdf.tsx.
 *
 * Tabel material TIDAK di atas gambar — punya kolom sendiri di kanan kertas,
 * jadi tidak mungkin menutupi JTR.
 */

import type { GawangJtr } from "./rencanaJtr";

/** Ruang gambar di kertas A3 mendatar (pt), kolom kanan di luar ini. */
export const GAMBAR_W = 878;
export const GAMBAR_H = 800;
const TEPI = 36;
/** Batas perbesaran (pt per meter) — jaringan kecil tidak digambar raksasa. */
const SKALA_MAKS = 4;

export type Koord = { lat: number; lng: number };
export type Titik = { x: number; y: number };

export type JenisGaris = "lain" | "utama" | "pindah";
export interface GarisGambar {
  a: Titik;
  b: Titik;
  jenis: JenisGaris;
}

export type JenisTiang = "lain" | "utama" | "pindah";
export interface TiangGambar extends Titik {
  id: string;
  jenis: JenisTiang;
}

export type JenisLabel = "kabel" | "pecah" | "gardu" | "jurusan" | "sisip" | "ujung-merah" | "ujung-kuning" | "ujung-hijau" | "tiang" | "tiang-lain";

/** Nada tegangan ujung — batasnya sama dengan lapisan Tegangan ujung di peta. */
export type NadaUjung = "merah" | "kuning" | "hijau";

/** Titik ukur tegangan ujung terakhir satu jurusan (fasa-netral, V). */
export interface UjungGambar {
  jurusan: string;
  v_rn: number;
  v_sn: number;
  v_tn: number;
  nada: NadaUjung;
  tgl: string;
}
export interface LabelGambar extends Titik {
  teks: string;
  jenis: JenisLabel;
  ukuran: number;
  /** Garis penunjuk dari titik ke label yang digeser jauh. */
  tarik?: { a: Titik; b: Titik };
}

export interface Gambar {
  garis: GarisGambar[];
  tiang: TiangGambar[];
  gardu: Titik | null;
  /** Jalur kabel baru, sudah digeser ke samping kabel lama. */
  kabelBaru: Titik[];
  pecah: Titik | null;
  sisip: Titik | null;
  ujung: (Titik & UjungGambar)[];
  label: LabelGambar[];
  /** pt per meter — untuk skala grafis. */
  skala: number;
  /** Letak kertas di dunia ubin: titik (0,0) gambar = (x0, y0) zoom 0; `skala` pt per satuan. */
  ruang: { x0: number; y0: number; skala: number };
  /** Tiang usulan yang sudah tidak ada di data JTR sekarang. */
  hilang: boolean;
}

export interface BahanGambar {
  gawang: GawangJtr[];
  koord: Map<string, Koord>;
  gardu: Koord | null;
  garduKode: string;
  jurusan: string;
  /** Usulan tambah jurusan: titik pecah + tiang yang pindah + panjang kabel baru. */
  pecah: { titikId: string; pindah: string[]; kabelBaru: number } | null;
  sisip: Koord | null;
  ujung: (Koord & UjungGambar)[];
}

const GESER_KABEL = 3.5;

/** Geser polyline ke samping (normal kiri), sudut disambung rata-rata normal. */
function geser(t: Titik[], d: number): Titik[] {
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

type Kotak = { x1: number; y1: number; x2: number; y2: number };
const tumpang = (a: Kotak, b: Kotak) => a.x1 < b.x2 && b.x1 < a.x2 && a.y1 < b.y2 && b.y1 < a.y2;
/** Lebar teks Helvetica kira-kira. */
const lebar = (teks: string, ukuran: number) => teks.length * ukuran * 0.52;

interface CalonLabel extends Titik {
  teks: string;
  jenis: JenisLabel;
  ukuran: number;
  /** Wajib tampil: dicari sampai jauh (dengan garis penunjuk), terakhir dipaksa. */
  wajib: boolean;
}

const ARAH = [0, 1, 2, 3, 4, 5, 6, 7].map((i) => ({ x: Math.cos((i * Math.PI) / 4), y: Math.sin((i * Math.PI) / 4) }));
const JARAK_WAJIB = [5, 14, 26, 40, 58];

/** Kotak label di arah `a` sejauh `r` dari titik — sisi terdekatnya menghadap titik. */
function kotakDi(c: CalonLabel, a: Titik, r: number, w: number, h: number): Kotak {
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
 * Label ditaruh rakus menurut kepentingan. Kode tiang: kanan → kiri → atas →
 * bawah titiknya, yang bertumpuk dilewati. Label wajib dicari melingkar makin
 * jauh dan diberi garis penunjuk bila jauh dari titiknya. Posisi yang tidak
 * menimpa garis kabel didahulukan.
 */
function tempatkan(calon: CalonLabel[], penghalang: Kotak[], ruas: [Titik, Titik][]): LabelGambar[] {
  const terisi = [...penghalang];
  const hasil: LabelGambar[] = [];
  const dalam = (k: Kotak) => k.x1 >= 2 && k.y1 >= 2 && k.x2 <= GAMBAR_W - 2 && k.y2 <= GAMBAR_H - 2;
  for (const c of calon) {
    const w = lebar(c.teks, c.ukuran);
    const h = c.ukuran;
    const pilihan = c.wajib
      ? JARAK_WAJIB.flatMap((r) => ARAH.map((a) => kotakDi(c, a, r, w, h)))
      : [ARAH[0], ARAH[4], ARAH[6], ARAH[2]].map((a) => kotakDi(c, a, 5, w, h));
    const muat = pilihan.filter(dalam);
    // Utamakan yang tidak menimpa garis; kalau tidak ada, cukup tidak menimpa label/simbol.
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

/** Kode tiang tanpa awalan "<gardu>-" — awalannya disebut sekali di keterangan. */
const pendek = (kode: string, gardu: string) => (kode.toUpperCase().startsWith(`${gardu}-`) ? kode.slice(gardu.length + 1) : kode);

/** Koordinat → piksel ubin zoom 0 (Web Mercator). */
const dunia = (k: Koord): Titik => {
  const s = Math.sin((k.lat * Math.PI) / 180);
  return { x: ((k.lng + 180) / 360) * 256, y: (0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI)) * 256 };
};

export function susunGambar(b: BahanGambar): Gambar {
  // Web Mercator — sama dengan ubin peta, supaya tiang tepat di atas latar.
  // Satuan "dunia" = piksel ubin pada zoom 0 (256 × 256 untuk seluruh bumi).
  const semua = [...b.koord.values(), ...(b.gardu ? [b.gardu] : []), ...(b.sisip ? [b.sisip] : []), ...b.ujung];
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
  const ke = (k: Koord): Titik => {
    const p = dunia(k);
    return { x: ox + p.x * skala, y: oy + p.y * skala };
  };

  const gardu = b.gardu ? ke(b.gardu) : null;
  const pindah = new Set(b.pecah?.pindah ?? []);
  const perJurusan = new Map<string, Map<string, GawangJtr>>();
  for (const g of b.gawang) {
    const j = perJurusan.get(g.jurusan) ?? new Map<string, GawangJtr>();
    j.set(g.tiang_id, g);
    perJurusan.set(g.jurusan, j);
  }

  // Jurusan lain dulu, jurusan usulan terakhir — tergambar di atas.
  const urutJurusan = [...perJurusan.keys()].sort((x, y) => Number(x === b.jurusan) - Number(y === b.jurusan) || x.localeCompare(y));
  const garis: GarisGambar[] = [];
  const tiang = new Map<string, TiangGambar>();
  const calon: CalonLabel[] = [];
  const akarLabel: CalonLabel[] = [];
  for (const j of urutJurusan) {
    const peta = perJurusan.get(j)!;
    const utama = j === b.jurusan;
    const punyaAnak = new Map<string, number>();
    for (const g of peta.values()) if (g.hulu_id && peta.has(g.hulu_id)) punyaAnak.set(g.hulu_id, (punyaAnak.get(g.hulu_id) ?? 0) + 1);
    for (const g of peta.values()) {
      const k = b.koord.get(g.tiang_id);
      if (!k) continue;
      const p = ke(k);
      const hulu = g.hulu_id && g.hulu_id !== g.tiang_id ? peta.get(g.hulu_id) : undefined;
      const kh = hulu ? b.koord.get(hulu.tiang_id) : undefined;
      const asal = hulu ? (kh ? ke(kh) : null) : gardu;
      const jenis: JenisGaris = !utama ? "lain" : pindah.has(g.tiang_id) ? "pindah" : "utama";
      if (asal) garis.push({ a: asal, b: p, jenis });
      if (!tiang.has(g.tiang_id) || utama) tiang.set(g.tiang_id, { id: g.tiang_id, ...p, jenis });
      if (!hulu) akarLabel.push({ ...p, teks: `Jur. ${j}`, jenis: "jurusan", ukuran: 6.5, wajib: utama });
      if (!g.kode) continue;
      const penting = utama && (g.percabangan || (punyaAnak.get(g.tiang_id) ?? 0) !== 1);
      calon.push({ ...p, teks: pendek(g.kode, b.garduKode), jenis: utama ? "tiang" : "tiang-lain", ukuran: utama ? 5 : 4.5, wajib: penting });
    }
  }

  // Jalur kabel baru: gardu → menyusuri jurusan usulan → titik pecah.
  const utama = perJurusan.get(b.jurusan) ?? new Map<string, GawangJtr>();
  let kabelBaru: Titik[] = [];
  let pecah: Titik | null = null;
  if (b.pecah) {
    const rantai: Titik[] = [];
    const dilihat = new Set<string>();
    let g = utama.get(b.pecah.titikId);
    while (g && !dilihat.has(g.tiang_id)) {
      dilihat.add(g.tiang_id);
      const k = b.koord.get(g.tiang_id);
      if (k) rantai.push(ke(k));
      g = g.hulu_id ? utama.get(g.hulu_id) : undefined;
    }
    if (gardu) rantai.push(gardu);
    if (rantai.length > 1) kabelBaru = geser(rantai.reverse(), GESER_KABEL);
    const kp = b.koord.get(b.pecah.titikId);
    if (kp) pecah = ke(kp);
  }
  const sisip = b.sisip ? ke(b.sisip) : null;
  const ujung = b.ujung.map((x) => ({ ...x, ...ke(x) }));

  const wajib: CalonLabel[] = [];
  if (kabelBaru.length > 1) {
    const i = Math.floor((kabelBaru.length - 1) / 2);
    const tengah = { x: (kabelBaru[i].x + kabelBaru[i + 1].x) / 2, y: (kabelBaru[i].y + kabelBaru[i + 1].y) / 2 };
    wajib.push({ ...tengah, teks: `Kabel baru ±${Math.round(b.pecah!.kabelBaru).toLocaleString("id-ID")} m`, jenis: "kabel", ukuran: 7, wajib: true });
  }
  if (gardu) wajib.push({ ...gardu, teks: b.garduKode, jenis: "gardu", ukuran: 8, wajib: true });
  if (pecah) wajib.push({ ...pecah, teks: "TITIK PECAH", jenis: "pecah", ukuran: 7, wajib: true });
  if (sisip) wajib.push({ ...sisip, teks: "USULAN GARDU SISIP", jenis: "sisip", ukuran: 7, wajib: true });
  for (const x of ujung) {
    const v = `${Math.round(x.v_rn)}/${Math.round(x.v_sn)}/${Math.round(x.v_tn)} V`;
    wajib.push({ x: x.x, y: x.y, teks: `Teg. ujung ${x.jurusan}: ${v}`, jenis: `ujung-${x.nada}`, ukuran: 6.5, wajib: true });
  }
  // Kode tiang: yang wajib dulu, lalu jurusan usulan, lalu jurusan lain.
  const urutCalon = [...calon].sort((x, y) => Number(y.wajib) - Number(x.wajib) || Number(x.jenis === "tiang-lain") - Number(y.jenis === "tiang-lain"));
  const kotak = (p: Titik, r: number): Kotak => ({ x1: p.x - r, y1: p.y - r, x2: p.x + r, y2: p.y + r });
  const penghalang = [
    ...[...tiang.values()].map((t) => kotak(t, 3.3)),
    ...(gardu ? [kotak(gardu, 8)] : []),
    ...(pecah ? [kotak(pecah, 7)] : []),
    ...(sisip ? [kotak(sisip, 7)] : []),
    ...ujung.map((x) => kotak(x, 5)),
  ];
  const ruas: [Titik, Titik][] = [...garis.map((x): [Titik, Titik] => [x.a, x.b]), ...kabelBaru.slice(1).map((p, i): [Titik, Titik] => [kabelBaru[i], p])];
  const label = tempatkan([...wajib, ...akarLabel.sort((x, y) => Number(y.wajib) - Number(x.wajib)), ...urutCalon], penghalang, ruas);

  const ada = (id: string) => utama.has(id) && b.koord.has(id);
  const hilang = !!b.pecah && (!ada(b.pecah.titikId) || b.pecah.pindah.some((id) => !ada(id)));

  return {
    garis, tiang: [...tiang.values()], gardu, kabelBaru, pecah, sisip, ujung, label, hilang,
    skala: skala / meterPerDunia,
    ruang: { x0: -ox / skala, y0: -oy / skala, skala },
  };
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
export function rencanaUbin(ruang: Gambar["ruang"]): RencanaUbin {
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
