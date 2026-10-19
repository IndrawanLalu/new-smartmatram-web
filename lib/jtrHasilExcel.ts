import type ExcelJS from "exceljs";
import { susunHasilInspeksi, type BarisHasil, type KolomHasil, type SelHasil, type TemuanHasil } from "@/lib/hasilInspeksiExcel";

/**
 * Excel Hasil Inspeksi JTR — bentuk yang sama dengan JTM
 * (lib/hasilInspeksiExcel.ts). Data dari route `/api/export/jtr`.
 *
 * Aksesoris dulu satu sel per kabel ("Tidak Ada / Baik / Tidak Ada") dan tidak
 * terbaca mana suspension, large angle, dead end. Kini tiap kabel satu kelompok
 * kolom berjudul, dan yang tidak normal diwarnai.
 */

export interface KabelJtr {
  nomor: number;
  /** Jurusan yang dibawa kabel ini (huruf panel gardu). */
  jurusan?: string | null;
  jenis: string | null;
  ukuran: string | null;
  kondisi: string | null;
  aks_suspension: string | null;
  aks_large_angle: string | null;
  aks_dead_end: string | null;
  foto_temuan: Record<string, string | null> | null;
}

export interface TiangJtrExcel {
  penyulang: string;
  ulp: string;
  gardu: string;
  garduNama: string;
  jurusan: string;
  kode: string;
  tanggal: string | null;
  petugas: string | null;
  jenis: string | null;
  tinggi: number | null;
  kondisi: string | null;
  underbuildTm: boolean;
  jamperan: { jenis?: string | null; kondisi?: string | null }[];
  andongan: string | null;
  tarikanSr: number | null;
  ardeKondisi: string | null;
  ardeOhm: number | null;
  stayJenis: string | null;
  stayKondisi: string | null;
  rawanRow: string[];
  catatan: string | null;
  fotoTemuan: Record<string, string | null> | null;
  kabel: KabelJtr[];
  lat: number | null;
  lng: number | null;
}

/** `true` bila nilai ini di daftar pilihannya (`jtr_ref`) BUKAN normal. */
export type TemuanJtr = (kategori: string, nilai: string | null | undefined) => boolean;

const DEPAN: KolomHasil[] = [
  { judul: "No", lebar: 5 },
  { judul: "Tanggal", lebar: 11 },
  { judul: "ULP", lebar: 12 },
  { judul: "Penyulang", lebar: 15 },
  { judul: "Gardu", lebar: 9 },
  { judul: "Nama gardu", lebar: 24, kiri: true },
  { judul: "Jurusan", lebar: 8 },
  { judul: "Nama tiang", lebar: 16 },
  { judul: "Petugas", lebar: 18 },
];
const BELAKANG: KolomHasil[] = [
  { judul: "Jumlah temuan", lebar: 9 },
  { judul: "Temuan", lebar: 44, kiri: true },
  { judul: "Catatan perbaikan", lebar: 30, kiri: true },
  { judul: "Foto temuan", lebar: 12 },
  { judul: "Koordinat", lebar: 22 },
];

const ISIAN_KABEL: { judul: string; kategori: string | null; ambil: (k: KabelJtr) => string }[] = [
  { judul: "Jurusan", kategori: null, ambil: (k) => k.jurusan ?? "" },
  { judul: "Jenis & ukuran", kategori: null, ambil: (k) => [k.jenis, k.ukuran].filter(Boolean).join(" ") },
  { judul: "Kondisi", kategori: "kondisi_kabel", ambil: (k) => k.kondisi ?? "" },
  { judul: "Suspension", kategori: "kondisi_aksesoris", ambil: (k) => k.aks_suspension ?? "" },
  { judul: "Large angle", kategori: "kondisi_aksesoris", ambil: (k) => k.aks_large_angle ?? "" },
  { judul: "Dead end", kategori: "kondisi_aksesoris", ambil: (k) => k.aks_dead_end ?? "" },
];

const tglId = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString("id-ID") : "");

/** Foto di peta isian→foto (utama + tambahan "#2/#3"), tanpa slot kosong. */
const semuaFoto = (m: Record<string, string | null> | null) => Object.values(m ?? {}).filter((u): u is string => !!u);

export function susunHasilJtr(tiang: TiangJtrExcel[], adalahTemuan: TemuanJtr, judul: string): ExcelJS.Workbook {
  const nKabel = Math.max(1, ...tiang.flatMap((t) => t.kabel.map((k) => k.nomor)));
  const kolom: KolomHasil[] = [
    ...DEPAN,
    { judul: "Jenis", lebar: 9, kelompok: "Tiang" },
    { judul: "Tinggi (m)", lebar: 8, kelompok: "Tiang" },
    { judul: "Kondisi", lebar: 10, kelompok: "Tiang" },
    { judul: "Digantung tiang TM", lebar: 11, kelompok: "Tiang" },
    ...Array.from({ length: nKabel }, (_, i) =>
      ISIAN_KABEL.map((x) => ({ judul: x.judul, lebar: x.judul === "Jurusan" ? 8 : x.kategori ? 11 : 16, kelompok: `Kabel ${i + 1}` })),
    ).flat(),
    { judul: "Jenis", lebar: 10, kelompok: "Jamperan" },
    { judul: "Kondisi", lebar: 10, kelompok: "Jamperan" },
    { judul: "Andongan", lebar: 10, kelompok: "Andongan, arde, stay & ROW" },
    { judul: "Tarikan SR", lebar: 8, kelompok: "Andongan, arde, stay & ROW" },
    { judul: "Arde", lebar: 9, kelompok: "Andongan, arde, stay & ROW" },
    { judul: "Nilai arde (Ω)", lebar: 9, kelompok: "Andongan, arde, stay & ROW" },
    { judul: "Jenis stay", lebar: 11, kelompok: "Andongan, arde, stay & ROW" },
    { judul: "Stay", lebar: 10, kelompok: "Andongan, arde, stay & ROW" },
    { judul: "Rawan ROW", lebar: 16, kelompok: "Andongan, arde, stay & ROW" },
    ...BELAKANG,
  ];

  const baris: BarisHasil[] = tiang.map((t, n) => {
    const temuan: TemuanHasil[] = [];
    /** Satu sel isian; tercatat sebagai temuan bila pilihannya tidak normal. */
    const isian = (kelompok: string, judulIsian: string, kategori: string | null, nilai: string | number | null): SelHasil => {
      const teks = nilai ?? "";
      const t2 = !!kategori && typeof teks === "string" && adalahTemuan(kategori, teks);
      if (t2) temuan.push({ kelompok, isian: judulIsian, keadaan: String(teks), nama: t.kode });
      return { teks, temuan: t2 };
    };

    const kabel = Array.from({ length: nKabel }, (_, i) => {
      const k = t.kabel.find((x) => x.nomor === i + 1);
      return ISIAN_KABEL.map((x) => (k ? isian(`Kabel ${i + 1}`, x.judul, x.kategori, x.ambil(k)) : { teks: "" }));
    }).flat();

    const jam = t.jamperan[0];
    const row = t.rawanRow.filter(Boolean);
    for (const r of row) temuan.push({ kelompok: "Andongan, arde, stay & ROW", isian: "Rawan ROW", keadaan: r, nama: t.kode });

    const sel: SelHasil[] = [
      { teks: n + 1 }, { teks: tglId(t.tanggal) }, { teks: t.ulp }, { teks: t.penyulang || "—" }, { teks: t.gardu },
      { teks: t.garduNama }, { teks: t.jurusan }, { teks: t.kode }, { teks: t.petugas ?? "" },
      isian("Tiang", "Jenis", null, t.jenis),
      isian("Tiang", "Tinggi (m)", null, t.tinggi),
      isian("Tiang", "Kondisi", "kondisi_tiang", t.kondisi),
      { teks: t.underbuildTm ? "Ya" : "" },
      ...kabel,
      isian("Jamperan", "Jenis", null, jam?.jenis ?? "Tidak Ada"),
      jam ? isian("Jamperan", "Kondisi", "kondisi_jamperan", jam.kondisi ?? null) : { teks: "" },
      isian("Andongan, arde, stay & ROW", "Andongan", "kondisi_andongan", t.andongan),
      { teks: t.tarikanSr ?? "" },
      isian("Andongan, arde, stay & ROW", "Arde", "kondisi_arde", t.ardeKondisi),
      { teks: t.ardeOhm ?? "" },
      isian("Andongan, arde, stay & ROW", "Jenis stay", null, t.stayJenis),
      isian("Andongan, arde, stay & ROW", "Stay", "kondisi_stay", t.stayKondisi),
      { teks: row.join(", "), temuan: row.length > 0 },
    ];

    const foto = [...semuaFoto(t.fotoTemuan), ...t.kabel.flatMap((k) => semuaFoto(k.foto_temuan))];
    const ada = t.lat !== null && t.lng !== null;
    sel.push(
      { teks: temuan.length || "", temuan: temuan.length > 0 },
      { teks: temuan.map((x) => `${x.kelompok.startsWith("Andongan") ? x.isian : `${x.kelompok} ${x.isian.toLowerCase()}`}: ${x.keadaan}`).join("; ") },
      { teks: t.catatan ?? "" },
      { teks: foto.length ? (foto.length > 1 ? `buka (${foto.length})` : "buka") : "", tautan: foto[0] },
      { teks: ada ? `${t.lat!.toFixed(6)}, ${t.lng!.toFixed(6)}` : "", tautan: ada ? `https://maps.google.com/?q=${t.lat},${t.lng}` : undefined },
    );
    return { grup: [t.penyulang || "—", t.gardu], dinilai: true, temuan, sel };
  });

  return susunHasilInspeksi({ judul, kolom, baris, namaGrup: ["Penyulang", "Gardu"], bekuKiri: 8 });
}
