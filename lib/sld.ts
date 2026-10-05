import { jarakMeter } from "@/lib/geo";

/**
 * Peta SLD — diagram garis tunggal yang DIRINGKAS dari pohon tiang JTM.
 *
 * Tidak ada SLD yang disimpan terpisah: ribuan tiang dipadatkan jadi simpul
 * yang berarti bagi operasi (pangkal, keypoint, gardu, percabangan, ujung),
 * dan tiap simpul membawa jalur + panjang bentang dari simpul di hulunya.
 * Regu menitik, admin mengoreksi — SLD ikut berubah, karena memang satu data.
 *
 * Fungsi di sini murni (tanpa React, tanpa Supabase) supaya bisa diuji.
 */

export interface TiangSld {
  id: string;
  kode: string;
  lat: number;
  lng: number;
  penanda: string | null;
  /** Induk DI PENYULANG INI (`peta_tiang`: induk per penyulang bila diatur). */
  indukId: string | null;
  pasanganPortalDari: string | null;
  garduDiTiang: string | null;
}

export interface GarduInfo {
  kode: string;
  nama: string | null;
  daya: number | null;
  bebanKva: number | null;
  persen: number | null;
  tglUkur: string | null;
}

export type JenisSimpul = "pangkal" | "keypoint" | "gardu" | "cabang" | "ujung";

export interface Simpul {
  id: string;
  kode: string;
  lat: number;
  lng: number;
  jenis: JenisSimpul;
  penanda: string | null;
  /** Kode gardu di tiang ini (gardu portal: di tiang pertamanya). */
  gardu: string | null;
  /** Simpul di hulu (null = pangkal). */
  indukId: string | null;
  /** Panjang jaringan dari simpul hulu sampai simpul ini, km. */
  km: number;
  /** Jalur tiang-ke-tiang dari simpul hulu sampai simpul ini. */
  jalur: [number, number][];
  anak: string[];
}

export interface GrafSld {
  penyulang: string;
  simpul: Map<string, Simpul>;
  /** Pangkal. Lebih dari satu = jaringan yang belum tersambung (data bolong). */
  akar: string[];
  km: number;
  jumlahTiang: number;
  /** Kode gardu yang tercatat di lebih dari satu tiang (bukan pasangan portal). */
  garduGanda: string[];
}

/** Penanda yang dianggap keypoint: semua penanda kecuali gardu. */
export const bukanKeypoint = (p: string | null) => !p || p === "gardu";

/** Bentang ke tiang kedua gardu portal tidak dihitung KMS — gardunya satu. */
const bentangKm = (a: TiangSld, b: TiangSld) =>
  b.pasanganPortalDari === a.id ? 0 : jarakMeter(a.lat, a.lng, b.lat, b.lng) / 1000;

export function susunSld(penyulang: string, tiang: TiangSld[]): GrafSld {
  const perId = new Map(tiang.map((t) => [t.id, t]));
  const anakTiang = new Map<string, TiangSld[]>();
  const akarTiang: TiangSld[] = [];
  for (const t of tiang) {
    if (t.indukId && perId.has(t.indukId) && t.indukId !== t.id) {
      const d = anakTiang.get(t.indukId) ?? [];
      d.push(t);
      anakTiang.set(t.indukId, d);
    } else akarTiang.push(t);
  }

  const dipertahankan = (t: TiangSld, akar: boolean) => {
    if (akar) return true;
    if (!bukanKeypoint(t.penanda)) return true;
    if (t.penanda === "gardu" && !t.pasanganPortalDari) return true;
    // Tiang kedua portal hanya batang; jalur menerus lewatinya.
    const n = (anakTiang.get(t.id) ?? []).filter((c) => c.pasanganPortalDari !== t.id).length;
    if (n >= 2) return true;
    return n === 0 && !t.pasanganPortalDari && (anakTiang.get(t.id) ?? []).length === 0;
  };

  const simpul = new Map<string, Simpul>();
  const akar: string[] = [];
  let km = 0;
  const dikunjungi = new Set<string>();

  // DFS berulang (bukan rekursi): penyulang panjang bisa ribuan tiang.
  for (const a of akarTiang) {
    const tumpuk: { t: TiangSld; hulu: string | null; jalur: [number, number][]; km: number }[] = [
      { t: a, hulu: null, jalur: [[a.lat, a.lng]], km: 0 },
    ];
    while (tumpuk.length) {
      const { t, hulu, jalur, km: kmJalan } = tumpuk.pop()!;
      if (dikunjungi.has(t.id)) continue;   // jaga-jaga data melingkar
      dikunjungi.add(t.id);
      const anak = anakTiang.get(t.id) ?? [];
      const simpan = dipertahankan(t, hulu === null && t === a);
      let huluBaru = hulu;
      let jalurBaru = jalur;
      let kmBaru = kmJalan;
      if (simpan) {
        const jenis: JenisSimpul =
          hulu === null ? "pangkal"
            : !bukanKeypoint(t.penanda) ? "keypoint"
              : t.penanda === "gardu" ? "gardu"
                : anak.length === 0 ? "ujung" : "cabang";
        simpul.set(t.id, {
          id: t.id, kode: t.kode, lat: t.lat, lng: t.lng, jenis, penanda: t.penanda,
          gardu: t.penanda === "gardu" ? t.garduDiTiang : null,
          indukId: hulu, km: kmJalan, jalur, anak: [],
        });
        if (hulu) simpul.get(hulu)!.anak.push(t.id);
        else akar.push(t.id);
        huluBaru = t.id;
        jalurBaru = [[t.lat, t.lng]];
        kmBaru = 0;
      }
      for (const c of anak) {
        const b = bentangKm(t, c);
        km += b;
        tumpuk.push({ t: c, hulu: huluBaru, jalur: [...jalurBaru, [c.lat, c.lng]], km: kmBaru + b });
      }
    }
  }
  const hitung = new Map<string, number>();
  for (const s of simpul.values()) if (s.gardu) hitung.set(s.gardu, (hitung.get(s.gardu) ?? 0) + 1);
  const garduGanda = [...hitung].filter(([, n]) => n > 1).map(([k]) => k);
  return { penyulang, simpul, akar, km, jumlahTiang: tiang.length, garduGanda };
}

export interface HasilLepas {
  /** Simpul padam (untuk diwarnai di peta). */
  padam: Set<string>;
  km: number;
  /** Kode gardu padam, unik (satu gardu di dua tiang tetap satu). */
  gardu: string[];
  /** Simpul gardu yang belum diberi kode gardu. */
  garduTanpaKode: number;
  keypoint: Simpul[];
  /** Zona langsung: dari titik yang dilepas sampai keypoint berikutnya. */
  zona: { km: number; gardu: number };
}

/**
 * Melepas simpul `id`: semua di hilirnya padam. Simpul `id` sendiri tidak
 * padam (dia saklarnya). Melepas PANGKAL = seluruh penyulang, termasuk bagian
 * yang belum tersambung ke pangkal utama (pangkal lebih dari satu = data
 * bolong, tapi jaringannya tetap milik penyulang ini).
 */
export function lepas(g: GrafSld, id: string): HasilLepas {
  const mulai = g.simpul.get(id);
  const padam = new Set<string>();
  const kodeGardu = new Set<string>();
  const hasil: HasilLepas = { padam, km: 0, gardu: [], garduTanpaKode: 0, keypoint: [], zona: { km: 0, gardu: 0 } };
  if (!mulai) return hasil;
  const awal = mulai.jenis === "pangkal" ? g.akar : [id];

  const catat = (s: Simpul, diZona: boolean) => {
    padam.add(s.id);
    hasil.km += s.km;
    if (diZona) hasil.zona.km += s.km;
    if (s.jenis === "gardu") {
      const baru = s.gardu ? !kodeGardu.has(s.gardu) : true;
      if (s.gardu) kodeGardu.add(s.gardu);
      else hasil.garduTanpaKode++;
      if (diZona && baru) hasil.zona.gardu++;
    }
    if (s.jenis === "keypoint" && s.id !== id) hasil.keypoint.push(s);
  };

  const tumpuk: { a: string; zona: boolean }[] = [];
  for (const a of awal) {
    const s = g.simpul.get(a)!;
    if (s.jenis === "pangkal") catat(s, a === id);
    for (const c of s.anak) tumpuk.push({ a: c, zona: a === id });
  }
  while (tumpuk.length) {
    const { a, zona } = tumpuk.pop()!;
    const s = g.simpul.get(a);
    if (!s || padam.has(s.id)) continue;
    catat(s, zona);
    const lanjutZona = zona && s.jenis !== "keypoint";
    for (const c of s.anak) tumpuk.push({ a: c, zona: lanjutZona });
  }
  hasil.gardu = [...kodeGardu];
  return hasil;
}

/** Jumlah beban & kVA sekumpulan gardu dari pengukuran terakhirnya. */
export function hitungBeban(kode: string[], info: Map<string, GarduInfo>) {
  let kva = 0, beban = 0, diukur = 0, overload = 0;
  for (const k of kode) {
    const g = info.get(k.toUpperCase());
    if (!g) continue;
    kva += g.daya ?? 0;
    if (g.bebanKva !== null) {
      beban += g.bebanKva;
      diukur++;
      if ((g.persen ?? 0) >= 80) overload++;
    }
  }
  return { kva, beban, diukur, overload };
}
