/**
 * Gambar survey Rekonduktor JTR: JTR gardu yang ada (abu-abu, patokan), ruas
 * yang kabelnya diganti merah putus-putus, kode tiang & panjang gawang di
 * ruas, nama ruas, gardu. Kertas, proyeksi & label: lib/gambarSurvey/kertas.ts.
 */

import { kotak, proyeksi, tempatkan, type CalonLabel, type Kotak, type Label, type Ruang, type Titik } from "@/lib/gambarSurvey/kertas";
import type { JaringanGardu } from "@/lib/bacaJtrGardu";
import type { RuasRekonduktor } from "@/lib/rekonduktorJtr";

export type JenisLabelRekon = "gardu" | "ruas" | "kode" | "panjang" | "lain";

export interface GambarRekon {
  lama: { a: Titik; b: Titik }[];
  tiangLama: (Titik & { id: string })[];
  ruas: Titik[][];
  tiangRuas: (Titik & { id: string })[];
  gardu: Titik | null;
  label: Label<JenisLabelRekon>[];
  skala: number;
  ruang: Ruang;
}

export function susunGambarRekon(ruas: RuasRekonduktor[], j: JaringanGardu, garduKode: string | null): GambarRekon {
  const g = j.gardu;
  const bingkai = [...ruas.flatMap((r) => r.tiang), ...(g && ruas.some((r) => r.dari_gardu) ? [g] : [])];
  const { ke, skalaM, ruang } = proyeksi(bingkai);
  const pos = (id: string | null) => (id ? j.data.get(id) : g ?? undefined);

  const lama: GambarRekon["lama"] = [];
  const terlihat = new Set<string>();
  for (const b of j.gawang) {
    const t = j.data.get(b.tiang_id);
    const h = pos(b.hulu_id);
    const k = `${b.tiang_id}|${b.hulu_id}`;
    if (!t || !h || terlihat.has(k)) continue;
    terlihat.add(k);
    lama.push({ a: ke(h), b: ke(t) });
  }
  const tiangLama = [...j.data.entries()].map(([id, t]) => ({ id, ...ke(t) }));
  const garduPt = g ? ke(g) : null;

  const calon: CalonLabel<JenisLabelRekon>[] = [];
  const kode: CalonLabel<JenisLabelRekon>[] = [];
  const meter: CalonLabel<JenisLabelRekon>[] = [];
  const garisRuas: Titik[][] = [];
  const tiangRuas: GambarRekon["tiangRuas"] = [];
  ruas.forEach((r, i) => {
    const pt = r.tiang.map((t) => ({ ...t, p: ke(t) }));
    const garis = [...(r.dari_gardu && garduPt ? [garduPt] : []), ...pt.map((t) => t.p)];
    garisRuas.push(garis);
    pt.forEach((t, n) => {
      tiangRuas.push({ id: `${r.id}|${t.tiang_id}`, ...t.p });
      if (t.kode) kode.push({ ...t.p, teks: t.kode, jenis: "kode", ukuran: 5.5, wajib: true });
      const sebelum = n > 0 ? pt[n - 1].p : r.dari_gardu ? garduPt : null;
      if (sebelum && t.panjang_m) {
        meter.push({ x: (sebelum.x + t.p.x) / 2, y: (sebelum.y + t.p.y) / 2, teks: `${Math.round(t.panjang_m)} m`, jenis: "panjang", ukuran: 5, wajib: false });
      }
    });
    const tengah = garis[Math.floor(garis.length / 2)];
    if (tengah) calon.push({ ...tengah, teks: `RUAS ${i + 1}${r.jurusan ? ` · JURUSAN ${r.jurusan}` : ""}`, jenis: "ruas", ukuran: 7, wajib: true });
  });
  if (garduPt) calon.unshift({ ...garduPt, teks: `GARDU ${garduKode ?? ""}`.trim(), jenis: "gardu", ukuran: 7, wajib: true });

  const penghalang: Kotak[] = [
    ...tiangLama.map((t) => kotak(t, 3.5)),
    ...tiangRuas.map((t) => kotak(t, 4.5)),
    ...(garduPt ? [kotak(garduPt, 7)] : []),
  ];
  const segmen: [Titik, Titik][] = [
    ...lama.map((x): [Titik, Titik] => [x.a, x.b]),
    ...garisRuas.flatMap((gs) => gs.slice(1).map((p, i): [Titik, Titik] => [gs[i], p])),
  ];
  const label = tempatkan([...calon, ...kode, ...meter], penghalang, segmen);
  return { lama, tiangLama, ruas: garisRuas, tiangRuas, gardu: garduPt, label, skala: skalaM, ruang };
}
