/**
 * Gambar survey Survey Jaringan Baru: jaringan JTM yang ada di sekitarnya
 * (abu-abu, patokan), JTM baru jingga & JTR baru biru putus-putus dengan nomor
 * tiang, panjang gawang & jurusan JTR, titik sambung, gardu & peralatan baru. Kertas, proyeksi &
 * penempatan label: lib/gambarSurvey/kertas.ts.
 */

import { kotak, proyeksi, tempatkan, type CalonLabel, type Kotak, type Label, type Ruang, type Titik } from "@/lib/gambarSurvey/kertas";
import {
  bawaJtr, panjangGawang, posisiInduk, type JaringanTiang, type JenisGardu, type KabelSurvey, type TiangSambung, type TitikSurvey,
} from "@/lib/surveyJaringan";

/** Tiang JTM yang ada di sekitar survey. */
export interface TiangSekitar {
  id: string;
  kode: string | null;
  induk_id: string | null;
  lat: number;
  lng: number;
  penanda: string | null;
}

export type JenisLabelJtm = "sambung" | "gardu" | "alat" | "nomor" | "panjang" | "jurusan" | "lain";

export interface GambarJtm {
  lama: { a: Titik; b: Titik }[];
  tiangLama: (Titik & { id: string; gardu: boolean })[];
  baru: { a: Titik; b: Titik; kabel: KabelSurvey }[];
  tiangBaru: (Titik & { id: string; bentuk: "tiang" | "gardu" | "alat"; jaringan: JaringanTiang; jenis: JenisGardu | null; arah: number })[];
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
  const jurusan: CalonLabel<JenisLabelJtm>[] = [];
  titik.forEach((t, n) => {
    const p = ke(t);
    const i = posisiInduk(t, perId, sambung);
    if (i) {
      const a = ke(i);
      const tengah = { x: (a.x + p.x) / 2, y: (a.y + p.y) / 2 };
      baru.push({ a, b: p, kabel: t.kabel });
      meter.push({ ...tengah, teks: `${Math.round(panjang.get(t.id) ?? 0)} m`, jenis: "panjang", ukuran: 5, wajib: false });
      // Jurusan ditulis di kabel JTR pertama tiap jurusan (dari gardu / berganti jurusan).
      const induk = t.induk_titik_id ? perId.get(t.induk_titik_id) : undefined;
      const lanjut = induk && induk.penanda !== "gardu" && bawaJtr(induk.kabel) && induk.jurusan === t.jurusan;
      if (bawaJtr(t.kabel) && t.jurusan && !lanjut) jurusan.push({ ...tengah, teks: `JURUSAN ${t.jurusan}`, jenis: "jurusan", ukuran: 6, wajib: true });
    }
    const bentuk = t.penanda === "gardu" ? "gardu" : t.penanda ? "alat" : "tiang";
    tiangBaru.push({ id: t.id, ...p, bentuk, jaringan: t.jaringan, jenis: t.gardu_jenis, arah: t.gardu_arah });
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
    ...tiangLama.map((t) => kotak(t, 3.5)),
    // Gardu: tiang + trafo di sampingnya, ke arah mana pun → kotak lebih lebar.
    ...tiangBaru.map((t) => kotak(t, t.bentuk === "gardu" ? 24 : 4)),
    ...sambungPt.map((p) => kotak(p, 7)),
  ];
  const ruas: [Titik, Titik][] = [...lama, ...baru].map((g): [Titik, Titik] => [g.a, g.b]);
  const label = tempatkan([...calon, ...jurusan, ...nomor, ...meter, ...lain], penghalang, ruas);
  return { lama, tiangLama, baru, tiangBaru, sambung: sambungPt, label, skala: skalaM, ruang };
}
