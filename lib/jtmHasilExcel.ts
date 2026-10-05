import type ExcelJS from "exceljs";
import { susunHasilInspeksi, type BarisHasil, type KolomHasil, type SelHasil, type TemuanHasil } from "@/lib/hasilInspeksiExcel";

/**
 * Excel Hasil Inspeksi JTM — keadaan TERAKHIR tiap tiang (keputusan user
 * 6 Okt 2026), tiang per penyulang berurutan. Bentuknya bersama JTR:
 * lib/hasilInspeksiExcel.ts. Data dari route `/api/export/jtm`.
 */

export interface ItemJtm {
  kode: string;
  nama: string;
  kelompok: string;
  satuan: string | null;
}

export interface KondisiJtm {
  item_kode: string;
  bagian: string;
  nilai: string | null;
  nilai_label: string | null;
  nilai_angka: number | null;
  catatan: string | null;
  normal: boolean;
  foto_url: string | null;
  tgl: string | null;
  inspeksi_id: string | null;
  /** Kategori pilihan regu (Urgent/Rawan/Biasa); null = aplikasi lama. */
  kategori?: string | null;
}

export interface TiangJtm {
  penyulang: string;
  ulp: string;
  kode: string;
  segmen: string;
  nomorLama: string | null;
  induk: string | null;
  penanda: string | null;
  garduKode: string | null;
  lat: number | null;
  lng: number | null;
  petugas: string | null;
  statusInspeksi: string | null;
  kondisi: KondisiJtm[];
}

const DEPAN: KolomHasil[] = [
  { judul: "No", lebar: 5 },
  { judul: "ULP", lebar: 12 },
  { judul: "Penyulang", lebar: 15 },
  { judul: "Nama tiang", lebar: 16 },
  { judul: "Segmen", lebar: 26, kiri: true },
  { judul: "Nomor lama", lebar: 11 },
  { judul: "Induk", lebar: 16 },
  { judul: "Penanda", lebar: 11 },
  { judul: "Kode gardu", lebar: 10 },
  { judul: "Dinilai", lebar: 11 },
  { judul: "Petugas", lebar: 18 },
  { judul: "Status inspeksi", lebar: 13 },
];
const BELAKANG: KolomHasil[] = [
  { judul: "Jumlah temuan", lebar: 9 },
  { judul: "Temuan", lebar: 48, kiri: true },
  { judul: "Catatan regu", lebar: 30, kiri: true },
  { judul: "Foto temuan", lebar: 12 },
  { judul: "Koordinat", lebar: 22 },
];

const tglId = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString("id-ID") : "");

const teksNilai = (k: KondisiJtm, satuan: string | null) =>
  k.nilai_angka !== null && k.nilai_angka !== undefined
    ? `${k.nilai_angka}${satuan ? ` ${satuan}` : ""}`
    : (k.nilai_label ?? k.nilai ?? "");

/** Per fasa "R: x · S: y · T: z", atau satu nilai bila semua sama. */
function selIsian(daftar: KondisiJtm[], satuan: string | null): SelHasil {
  if (daftar.length === 0) return { teks: "" };
  const temuan = daftar.some((k) => !k.normal);
  const nilai = daftar.map((k) => teksNilai(k, satuan));
  if (nilai.every((v) => v === nilai[0])) return { teks: nilai[0], temuan };
  const urut = [...daftar].sort((a, b) => a.bagian.localeCompare(b.bagian));
  return { teks: urut.map((k) => `${k.bagian}: ${teksNilai(k, satuan)}`).join(" · "), temuan };
}

export function susunHasilJtm(tiang: TiangJtm[], item: ItemJtm[], judul: string): ExcelJS.Workbook {
  const kolom: KolomHasil[] = [
    ...DEPAN,
    ...item.map((i) => ({ judul: i.nama, lebar: 14, kelompok: i.kelompok })),
    ...BELAKANG,
  ];

  const baris: BarisHasil[] = tiang.map((t, n) => {
    const dinilai = t.kondisi.length > 0;
    const temuan: TemuanHasil[] = [];
    const ringkas: string[] = [];
    const catatan = new Set<string>();
    const foto: string[] = [];

    const isian = item.map((it) => {
      const daftar = t.kondisi.filter((k) => k.item_kode === it.kode);
      for (const k of daftar) {
        if (k.catatan) catatan.add(`${it.nama}: ${k.catatan}`);
        if (k.normal) continue;
        const keadaan = `${teksNilai(k, it.satuan) || "—"}${k.kategori ? ` (${k.kategori})` : ""}`;
        const bagian = k.bagian !== "-" ? ` ${k.bagian}` : "";
        temuan.push({ kelompok: it.kelompok, isian: it.nama, keadaan, nama: `${t.kode}${bagian ? ` (${k.bagian})` : ""}` });
        ringkas.push(`${it.nama}${bagian}: ${keadaan}`);
        if (k.foto_url) foto.push(k.foto_url);
      }
      return selIsian(daftar, it.satuan);
    });

    const tgl = t.kondisi.reduce<string | null>((m, k) => (k.tgl && (!m || k.tgl > m) ? k.tgl : m), null);
    const ada = t.lat !== null && t.lng !== null;
    return {
      grup: [t.penyulang],
      dinilai,
      temuan,
      sel: [
        { teks: n + 1 }, { teks: t.ulp }, { teks: t.penyulang }, { teks: t.kode }, { teks: t.segmen },
        { teks: t.nomorLama ?? "" }, { teks: t.induk ?? "pangkal" }, { teks: t.penanda ?? "" },
        { teks: t.garduKode ?? "" }, { teks: tglId(tgl) }, { teks: t.petugas ?? "" },
        { teks: dinilai ? (t.statusInspeksi ?? "") : "belum dinilai" },
        ...isian,
        { teks: temuan.length || "", temuan: temuan.length > 0 },
        { teks: ringkas.join("; ") },
        { teks: [...catatan].join("; ") },
        { teks: foto.length ? (foto.length > 1 ? `buka (${foto.length})` : "buka") : "", tautan: foto[0] },
        { teks: ada ? `${t.lat!.toFixed(6)}, ${t.lng!.toFixed(6)}` : "", tautan: ada ? `https://maps.google.com/?q=${t.lat},${t.lng}` : undefined },
      ],
    };
  });

  return susunHasilInspeksi({ judul, kolom, baris, namaGrup: ["Penyulang"], bekuKiri: 4 });
}
