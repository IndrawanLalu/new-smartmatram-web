/**
 * Aturan tab Filter gardu — murni, tanpa React dan tanpa Supabase.
 *
 * Satu kondisi = satu kriteria (jenis cut out, daya kVA, beban terakhir, …).
 * Antar kondisi DAN, di dalam satu kondisi pilihan ATAU — sama dengan saringan
 * kondisi di tab Master gardu (`kondisiGardu.ts`), dan pencocokan item
 * pemeliharaannya memakai `cocokItem` yang sama, supaya kedua tab tidak pernah
 * memberi jawaban berbeda untuk pertanyaan yang sama.
 */

import { cocokItem, NILAI_BELUM, NILAI_TIDAK_NORMAL, type NilaiKondisi } from "./kondisiGardu";

/** Kriteria dari data master / pengukuran (bukan item pemeliharaan). */
export type KunciMaster = "kva" | "penyulang" | "merk" | "status";
export const LABEL_MASTER: Record<KunciMaster, string> = {
  kva: "Daya (kVA)",
  penyulang: "Penyulang",
  merk: "Merk trafo",
  status: "Status gardu",
};

export type Kondisi =
  /** Item pemeliharaan pilihan: kode opsi + nilai semu (tidak normal / belum diperiksa). */
  | { id: string; jenis: "har"; item: string; nilai: string[] }
  /** Item pemeliharaan angka (fuse link, rating HS, …): salah satu bagian di rentang. */
  | { id: string; jenis: "har-angka"; item: string; min: number | null; max: number | null }
  | { id: string; jenis: "master"; kunci: KunciMaster; nilai: string[] }
  /** % beban pengukuran terakhir. */
  | { id: string; jenis: "beban"; min: number | null; max: number | null }
  /** Tanggal ukur terakhir (YYYY-MM-DD), atau yang belum pernah diukur. */
  | { id: string; jenis: "ukur"; dari: string | null; sampai: string | null; belum: boolean };

/** Kolom gardu yang dibutuhkan tab ini. */
export interface GarduFilter {
  kode: string;
  ulp: string;
  nama: string | null;
  alamat: string | null;
  penyulang: string | null;
  kva_master: number | null;
  merk: string | null;
  status: string | null;
  kode_amg: string | null;
  lat: number | null;
  lng: number | null;
  event_date: string | null;
  persen_beban: number | null;
  belum_diukur: boolean;
}

/** Nilai item pemeliharaan per gardu: item → (kunciKondisi → jawaban per bagian). */
export type NilaiHar = Map<string, Map<string, NilaiKondisi[]>>;

/** Nilai kosong di data master tampil & disaring sebagai ini. */
export const KOSONG = "(kosong)";

export function nilaiMaster(g: GarduFilter, k: KunciMaster): string {
  const v = k === "kva" ? g.kva_master : k === "penyulang" ? g.penyulang : k === "merk" ? g.merk : g.status;
  return v === null || v === "" ? KOSONG : String(v);
}

/** Pilihan untuk satu kriteria master, dari data yang sedang dimuat. */
export function opsiMaster(gardu: GarduFilter[], k: KunciMaster): string[] {
  const s = [...new Set(gardu.map((g) => nilaiMaster(g, k)))];
  return k === "kva"
    ? s.sort((a, b) => (Number(a) || Infinity) - (Number(b) || Infinity))
    : s.sort((a, b) => a.localeCompare(b, "id"));
}

const diRentang = (v: number, min: number | null, max: number | null) =>
  (min === null || v >= min) && (max === null || v <= max);

/** Kondisi yang belum diisi apa pun tidak ikut menyaring. */
export function kondisiTerisi(k: Kondisi): boolean {
  switch (k.jenis) {
    case "har":
    case "master":
      return k.nilai.length > 0;
    case "har-angka":
    case "beban":
      return k.min !== null || k.max !== null;
    case "ukur":
      return k.belum || k.dari !== null || k.sampai !== null;
  }
}

/**
 * Apakah satu gardu memenuhi satu kondisi.
 * `har` undefined = data item itu belum sampai → tidak meloloskan apa pun
 * (alasannya sama dengan `lolosKondisi`: angka setengah jadi terbaca benar).
 */
export function cocok(g: GarduFilter, kunciHar: string, k: Kondisi, har: NilaiHar): boolean {
  switch (k.jenis) {
    case "har": {
      const peta = har.get(k.item);
      return !!peta && cocokItem(peta.get(kunciHar), k.nilai);
    }
    case "har-angka": {
      const peta = har.get(k.item);
      return !!peta && (peta.get(kunciHar) ?? []).some((d) => d.angka != null && diRentang(d.angka, k.min, k.max));
    }
    case "master":
      return k.nilai.includes(nilaiMaster(g, k.kunci));
    case "beban":
      return g.persen_beban !== null && diRentang(g.persen_beban, k.min, k.max);
    case "ukur": {
      if (g.belum_diukur || !g.event_date) return k.belum;
      if (k.dari === null && k.sampai === null) return false;
      const t = g.event_date.slice(0, 10);
      return (k.dari === null || t >= k.dari) && (k.sampai === null || t <= k.sampai);
    }
  }
}

/** Satu potong nilai yang ditampilkan; `cocok` = bagian yang membuat gardu lolos. */
export interface PotongNilai {
  teks: string;
  cocok: boolean;
}

const fmtTgl = (s: string) => s.slice(0, 10).split("-").reverse().join("-");
const fmtAngka = (n: number) => n.toLocaleString("id-ID", { maximumFractionDigits: 2 });

/** Nilai gardu untuk satu kondisi — isi kolom tabel & Excel. */
export function nilaiTampil(g: GarduFilter, kunciHar: string, k: Kondisi, har: NilaiHar): PotongNilai[] {
  switch (k.jenis) {
    case "har":
    case "har-angka": {
      const daftar = har.get(k.item)?.get(kunciHar) ?? [];
      if (!daftar.length) return [{ teks: "Belum diperiksa", cocok: k.jenis === "har" && k.nilai.includes(NILAI_BELUM) }];
      return daftar.map((d) => {
        const isi = k.jenis === "har" ? (d.label ?? d.nilai ?? "—") : d.angka != null ? fmtAngka(d.angka) : "—";
        const kena =
          k.jenis === "har"
            ? (d.nilai !== null && k.nilai.includes(d.nilai)) || (k.nilai.includes(NILAI_TIDAK_NORMAL) && !d.normal)
            : d.angka != null && diRentang(d.angka, k.min, k.max);
        return { teks: d.bagian && d.bagian !== "-" ? `${d.bagian} ${isi}` : isi, cocok: kena };
      });
    }
    case "master":
      return [{ teks: nilaiMaster(g, k.kunci), cocok: true }];
    case "beban":
      return [{ teks: g.persen_beban !== null ? `${fmtAngka(g.persen_beban)}%` : "Belum diukur", cocok: g.persen_beban !== null }];
    case "ukur":
      return [{ teks: g.event_date ? fmtTgl(g.event_date) : "Belum pernah diukur", cocok: true }];
  }
}

/** Judul kolom satu kondisi. */
export function judulKondisi(k: Kondisi, namaItem: (kode: string) => string): string {
  switch (k.jenis) {
    case "har":
    case "har-angka":
      return namaItem(k.item);
    case "master":
      return LABEL_MASTER[k.kunci];
    case "beban":
      return "Beban terakhir (%)";
    case "ukur":
      return "Tgl ukur terakhir";
  }
}

/** Uraian satu kondisi untuk lembar Kriteria di Excel. */
export function uraianKondisi(k: Kondisi, labelOpsi: (item: string, kode: string) => string): string {
  const rentang = (min: number | null, max: number | null, sat = "") =>
    min !== null && max !== null ? `${fmtAngka(min)}–${fmtAngka(max)}${sat}`
      : min !== null ? `≥ ${fmtAngka(min)}${sat}` : `≤ ${fmtAngka(max ?? 0)}${sat}`;
  switch (k.jenis) {
    case "har":
      return k.nilai
        .map((n) => (n === NILAI_BELUM ? "Belum diperiksa" : n === NILAI_TIDAK_NORMAL ? "Tidak normal" : labelOpsi(k.item, n)))
        .join(" atau ");
    case "master":
      return k.nilai.join(" atau ");
    case "har-angka":
      return rentang(k.min, k.max);
    case "beban":
      return rentang(k.min, k.max, "%");
    case "ukur": {
      const bagian: string[] = [];
      if (k.dari || k.sampai) bagian.push(`${k.dari ? fmtTgl(k.dari) : "…"} s.d. ${k.sampai ? fmtTgl(k.sampai) : "…"}`);
      if (k.belum) bagian.push("Belum pernah diukur");
      return bagian.join(" atau ");
    }
  }
}
