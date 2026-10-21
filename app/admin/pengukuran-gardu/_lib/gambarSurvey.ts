/**
 * Gambar survey usulan perbaikan JTR (20 Okt 2026): JTR satu gardu digambar
 * dari koordinat tiang (bentuknya sama dengan di peta, tanpa peta dasar),
 * jalur kabel baru putus-putus. Di sini hanya hitungan JTR-nya; kertas,
 * proyeksi & penempatan label di lib/gambarSurvey/kertas.ts, PDF-nya di
 * GambarSurveyPdf.tsx.
 */

import type { CaraPecah, GawangJtr } from "./rencanaJtr";
import { geser, kotak, proyeksi, tempatkan, type CalonLabel, type Koord, type Kotak, type Label, type Ruang, type Titik } from "@/lib/gambarSurvey/kertas";

export type { Koord, Titik } from "@/lib/gambarSurvey/kertas";

export type JenisGaris = "lain" | "utama" | "pindah";
export interface GarisGambar {
  a: Titik;
  b: Titik;
  jenis: JenisGaris;
}

/** "sr" = tiang yang SR-nya dipindah ke kabel baru (cara pindah SR). */
export type JenisTiang = "lain" | "utama" | "pindah" | "sr";
export interface TiangGambar extends Titik {
  id: string;
  jenis: JenisTiang;
}

export type JenisLabel =
  | "kabel" | "pecah" | "gardu" | "jurusan" | "sisip" | "ujung-merah" | "ujung-kuning" | "ujung-hijau" | "sr" | "tiang" | "tiang-lain";

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
export type LabelGambar = Label<JenisLabel>;

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
  ruang: Ruang;
  /** Tiang usulan yang sudah tidak ada di data JTR sekarang. */
  hilang: boolean;
  /** Usulan cara pindah SR (kabel lama tidak dipotong). */
  caraSr: boolean;
}

export interface BahanGambar {
  gawang: GawangJtr[];
  koord: Map<string, Koord>;
  gardu: Koord | null;
  garduKode: string;
  jurusan: string;
  /** Usulan tambah jurusan: titik pecah + tiang yang pindah / yang SR-nya dipindah + panjang kabel baru. */
  pecah: { titikId: string; pindah: string[]; kabelBaru: number; cara: CaraPecah } | null;
  sisip: Koord | null;
  ujung: (Koord & UjungGambar)[];
}

const GESER_KABEL = 3.5;

/** Kode tiang tanpa awalan "<gardu>-" — awalannya disebut sekali di keterangan. */
const pendek = (kode: string, gardu: string) => (kode.toUpperCase().startsWith(`${gardu}-`) ? kode.slice(gardu.length + 1) : kode);

export function susunGambar(b: BahanGambar): Gambar {
  const semua = [...b.koord.values(), ...(b.gardu ? [b.gardu] : []), ...(b.sisip ? [b.sisip] : []), ...b.ujung];
  const { ke, skalaM, ruang } = proyeksi(semua);

  const gardu = b.gardu ? ke(b.gardu) : null;
  const pindah = new Set(b.pecah?.pindah ?? []);
  const caraSr = b.pecah?.cara === "pindah-sr";
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
  const calon: CalonLabel<JenisLabel>[] = [];
  const akarLabel: CalonLabel<JenisLabel>[] = [];
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
      // Pindah SR: kabel lama tetap di jurusannya, hanya tiangnya yang ditandai.
      const pindahIni = utama && pindah.has(g.tiang_id);
      const jenis: JenisGaris = !utama ? "lain" : pindahIni && !caraSr ? "pindah" : "utama";
      if (asal) garis.push({ a: asal, b: p, jenis });
      if (!tiang.has(g.tiang_id) || utama) tiang.set(g.tiang_id, { id: g.tiang_id, ...p, jenis: pindahIni && caraSr ? "sr" : jenis });
      if (!hulu) akarLabel.push({ ...p, teks: `Jur. ${j}`, jenis: "jurusan", ukuran: 6.5, wajib: utama });
      if (!g.kode) continue;
      const kode = pendek(g.kode, b.garduKode);
      if (pindahIni && caraSr) {
        calon.push({ ...p, teks: `${kode} · ${g.tarikan_sr} SR ke kabel baru`, jenis: "sr", ukuran: 5.5, wajib: true });
        continue;
      }
      const penting = utama && (g.percabangan || (punyaAnak.get(g.tiang_id) ?? 0) !== 1);
      // Jumlah SR ditulis di jurusan usulan saja — jurusan lain hanya patokan.
      const teks = utama && g.tarikan_sr > 0 ? `${kode} · ${g.tarikan_sr} SR` : kode;
      calon.push({ ...p, teks, jenis: utama ? "tiang" : "tiang-lain", ukuran: utama ? 5 : 4.5, wajib: penting });
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

  const wajib: CalonLabel<JenisLabel>[] = [];
  if (kabelBaru.length > 1) {
    const i = Math.floor((kabelBaru.length - 1) / 2);
    const tengah = { x: (kabelBaru[i].x + kabelBaru[i + 1].x) / 2, y: (kabelBaru[i].y + kabelBaru[i + 1].y) / 2 };
    wajib.push({ ...tengah, teks: `Kabel baru ±${Math.round(b.pecah!.kabelBaru).toLocaleString("id-ID")} m`, jenis: "kabel", ukuran: 7, wajib: true });
  }
  if (gardu) wajib.push({ ...gardu, teks: b.garduKode, jenis: "gardu", ukuran: 8, wajib: true });
  if (pecah) wajib.push({ ...pecah, teks: caraSr ? "UJUNG KABEL BARU" : "TITIK PECAH", jenis: "pecah", ukuran: 7, wajib: true });
  if (sisip) wajib.push({ ...sisip, teks: "USULAN GARDU SISIP", jenis: "sisip", ukuran: 7, wajib: true });
  for (const x of ujung) {
    const v = `${Math.round(x.v_rn)}/${Math.round(x.v_sn)}/${Math.round(x.v_tn)} V`;
    wajib.push({ x: x.x, y: x.y, teks: `Teg. ujung ${x.jurusan}: ${v}`, jenis: `ujung-${x.nada}`, ukuran: 6.5, wajib: true });
  }
  // Kode tiang: yang wajib dulu, lalu jurusan usulan, lalu jurusan lain.
  const urutCalon = [...calon].sort((x, y) => Number(y.wajib) - Number(x.wajib) || Number(x.jenis === "tiang-lain") - Number(y.jenis === "tiang-lain"));
  const penghalang: Kotak[] = [
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
    garis, tiang: [...tiang.values()], gardu, kabelBaru, pecah, sisip, ujung, label, hilang, caraSr,
    skala: skalaM,
    ruang,
  };
}
