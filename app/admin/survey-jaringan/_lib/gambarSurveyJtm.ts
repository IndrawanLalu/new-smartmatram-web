/**
 * Gambar survey Survey Jaringan Baru JTM: jaringan JTM yang ada di sekitarnya
 * (abu-abu, patokan), jaringan baru jingga putus-putus dengan nomor tiang &
 * panjang gawang, titik sambung, gardu & peralatan baru. Kertas, proyeksi &
 * penempatan label: lib/gambarSurvey/kertas.ts.
 */

import { kotak, proyeksi, tempatkan, type CalonLabel, type Kotak, type Label, type Ruang, type Titik } from "@/lib/gambarSurvey/kertas";
import { panjangGawang, posisiInduk, type TiangSambung, type TitikSurvey } from "@/lib/surveyJaringan";

/** Tiang JTM yang ada di sekitar survey. */
export interface TiangSekitar {
  id: string;
  kode: string | null;
  induk_id: string | null;
  lat: number;
  lng: number;
  penanda: string | null;
}

export type JenisLabelJtm = "sambung" | "gardu" | "alat" | "nomor" | "panjang" | "lain";

export interface GambarJtm {
  lama: { a: Titik; b: Titik }[];
  tiangLama: (Titik & { id: string; gardu: boolean })[];
  baru: { a: Titik; b: Titik }[];
  tiangBaru: (Titik & { id: string; bentuk: "tiang" | "gardu" | "alat" })[];
  sambung: Titik[];
  label: Label<JenisLabelJtm>[];
  skala: number;
  ruang: Ruang;
}

export function susunGambarJtm(
  titik: TitikSurvey[],
  sambung: Map<string, TiangSambung>,
  sekitar: TiangSekitar[],
  labelPenanda: (k: string) => string,
): GambarJtm {
  // Kertas dibingkai pada jaringan baru + titik sambung; tiang sekitar hanya
  // patokan dan tidak memperbesar bingkai.
  const { ke, skalaM, ruang } = proyeksi([...titik, ...sambung.values()]);
  const perId = new Map(titik.map((t) => [t.id, t]));
  const per = new Map(sekitar.map((t) => [t.id, t]));
  const lama = sekitar.flatMap((t) => {
    const i = t.induk_id ? per.get(t.induk_id) : undefined;
    return i ? [{ a: ke(i), b: ke(t) }] : [];
  });
  const tiangLama = sekitar.map((t) => ({ id: t.id, ...ke(t), gardu: t.penanda === "gardu" }));
  const panjang = panjangGawang(titik, sambung);

  const baru: GambarJtm["baru"] = [];
  const tiangBaru: GambarJtm["tiangBaru"] = [];
  const calon: CalonLabel<JenisLabelJtm>[] = [];
  const nomor: CalonLabel<JenisLabelJtm>[] = [];
  const meter: CalonLabel<JenisLabelJtm>[] = [];
  titik.forEach((t, n) => {
    const p = ke(t);
    const i = posisiInduk(t, perId, sambung);
    if (i) {
      const a = ke(i);
      baru.push({ a, b: p });
      meter.push({ x: (a.x + p.x) / 2, y: (a.y + p.y) / 2, teks: `${Math.round(panjang.get(t.id) ?? 0)} m`, jenis: "panjang", ukuran: 5, wajib: false });
    }
    const bentuk = t.penanda === "gardu" ? "gardu" : t.penanda ? "alat" : "tiang";
    tiangBaru.push({ id: t.id, ...p, bentuk });
    if (t.penanda === "gardu") {
      calon.push({ ...p, teks: `GARDU BARU${t.gardu_jenis ? ` ${t.gardu_jenis.toUpperCase()}` : ""}${t.gardu_kva ? ` ${t.gardu_kva} kVA` : ""}`, jenis: "gardu", ukuran: 7, wajib: true });
    } else if (t.penanda) {
      calon.push({ ...p, teks: labelPenanda(t.penanda).toUpperCase(), jenis: "alat", ukuran: 6.5, wajib: true });
    }
    nomor.push({ ...p, teks: `T${n + 1}`, jenis: "nomor", ukuran: 6, wajib: true });
  });
  const sambungPt = [...sambung.values()].map((s) => {
    const p = ke(s);
    calon.unshift({ ...p, teks: `SAMBUNG ${s.kode ?? ""}`.trim(), jenis: "sambung", ukuran: 7, wajib: true });
    return p;
  });
  const lain = sekitar
    .filter((t) => t.kode)
    .map((t): CalonLabel<JenisLabelJtm> => ({ ...ke(t), teks: t.kode!, jenis: "lain", ukuran: 4.5, wajib: false }));

  const penghalang: Kotak[] = [
    ...tiangLama.map((t) => kotak(t, 2.5)),
    ...tiangBaru.map((t) => kotak(t, t.bentuk === "gardu" ? 8 : 4)),
    ...sambungPt.map((p) => kotak(p, 7)),
  ];
  const ruas: [Titik, Titik][] = [...lama, ...baru].map((g): [Titik, Titik] => [g.a, g.b]);
  const label = tempatkan([...calon, ...nomor, ...meter, ...lain], penghalang, ruas);
  return { lama, tiangLama, baru, tiangBaru, sambung: sambungPt, label, skala: skalaM, ruang };
}
