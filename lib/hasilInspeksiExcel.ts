import ExcelJS from "exceljs";
import { CLR_HEADER, CLR_TEAL, CLR_WHITE, mergeSet, styleCell, type GayaSel } from "@/lib/xlsxGaya";

/**
 * Satu bentuk Excel "Hasil Inspeksi" untuk JTM dan JTR (teknisaplikasi butir 10):
 *
 *   Sheet 1 "Hasil Inspeksi"  satu baris satu tiang. Kolom identitas berkepala
 *                              kuning; isian inspeksi dikelompokkan di bawah judul
 *                              kelompok (teal); sel temuan kuning tebal; baris
 *                              berselang; kepala & kolom identitas dibekukan.
 *   Sheet 2 "Rekap Temuan"     ringkasan per grup (penyulang, atau penyulang +
 *                              gardu), lalu grup × isian × keadaan: jumlah tiang
 *                              dan nama tiangnya.
 *
 * Pemanggil (lib/jtmHasilExcel.ts, lib/jtrHasilExcel.ts) hanya menerjemahkan
 * datanya ke bentuk di bawah. Murni — tanpa I/O.
 */

export interface KolomHasil {
  judul: string;
  lebar: number;
  /** Kosong = kolom identitas/ringkasan (kepala kuning dua baris). */
  kelompok?: string;
  kiri?: boolean;
}

export interface SelHasil {
  teks: string | number;
  temuan?: boolean;
  tautan?: string;
}

export interface TemuanHasil {
  kelompok: string;
  isian: string;
  keadaan: string;
  /** Nama tiang (boleh berbagian, mis. "PRM-004 (R)"). */
  nama: string;
}

export interface BarisHasil {
  /** Nilai grup rekap, urut sama dengan `namaGrup`. */
  grup: string[];
  sel: SelHasil[];
  dinilai: boolean;
  temuan: TemuanHasil[];
}

export interface IsiHasil {
  judul: string;
  kolom: KolomHasil[];
  baris: BarisHasil[];
  namaGrup: string[];
  /** Kolom yang ikut dibekukan dari kiri (sampai nama tiang). */
  bekuKiri: number;
}

const KUNING = "FFE8A3";
const SELANG = "F5F5F5";
const REDUP = "8494AB";

export function susunHasilInspeksi(isi: IsiHasil): ExcelJS.Workbook {
  const wb = new ExcelJS.Workbook();
  lembarHasil(wb, isi);
  lembarRekap(wb, isi);
  return wb;
}

function lembarHasil(wb: ExcelJS.Workbook, { judul, kolom, baris, bekuKiri }: IsiHasil) {
  const ws = wb.addWorksheet("Hasil Inspeksi", {
    views: [{ state: "frozen", xSplit: bekuKiri, ySplit: 4 }],
    pageSetup: { orientation: "landscape", fitToPage: true, fitToWidth: 1, fitToHeight: 0 },
  });
  ws.columns = kolom.map((k) => ({ width: k.lebar }));
  mergeSet(ws, 1, 1, 1, Math.min(kolom.length, 12), judul, { bold: true, size: 12, align: "left" });
  ws.getRow(1).height = 22;

  // Kepala: kolom tanpa kelompok = kuning dua baris; kelompok = judul teal di
  // baris 3 menaungi nama isiannya di baris 4.
  let c = 0;
  while (c < kolom.length) {
    const kel = kolom[c].kelompok;
    if (!kel) {
      mergeSet(ws, 3, c + 1, 4, c + 1, kolom[c].judul, { bold: true, bgColor: CLR_HEADER });
      c++;
      continue;
    }
    let akhir = c;
    while (akhir + 1 < kolom.length && kolom[akhir + 1].kelompok === kel) akhir++;
    mergeSet(ws, 3, c + 1, 3, akhir + 1, kel, { bold: true, bgColor: CLR_TEAL });
    for (let x = c; x <= akhir; x++) {
      styleCell(Object.assign(ws.getCell(4, x + 1), { value: kolom[x].judul }), { bold: true, bgColor: CLR_TEAL });
    }
    c = akhir + 1;
  }
  ws.getRow(4).height = 36;

  baris.forEach((b, n) => {
    const r = 5 + n;
    const latar = n % 2 === 0 ? CLR_WHITE : SELANG;
    b.sel.forEach((s, i) => {
      const sel = ws.getCell(r, i + 1);
      const gaya: GayaSel = {
        align: kolom[i]?.kiri ? "left" : "center",
        bgColor: s.temuan ? KUNING : latar,
        bold: !!s.temuan,
        fontColor: s.tautan ? "1D3573" : b.dinilai ? undefined : REDUP,
      };
      sel.value = s.tautan && s.teks !== "" ? { text: String(s.teks), hyperlink: s.tautan } : s.teks;
      styleCell(sel, gaya);
    });
  });

  ws.autoFilter = { from: { row: 4, column: 1 }, to: { row: 4 + baris.length, column: kolom.length } };
}

function lembarRekap(wb: ExcelJS.Workbook, { judul, baris, namaGrup, kolom }: IsiHasil) {
  const ws = wb.addWorksheet("Rekap Temuan", {
    pageSetup: { orientation: "landscape", fitToPage: true, fitToWidth: 1, fitToHeight: 0 },
  });
  const g = namaGrup.length;
  ws.columns = [...namaGrup.map(() => ({ width: 16 })), { width: 18 }, { width: 24 }, { width: 22 }, { width: 10 }, { width: 70 }];
  mergeSet(ws, 1, 1, 1, g + 5, `REKAP TEMUAN — ${judul}`, { bold: true, size: 12, align: "left" });

  const kepala = (r: number, isi: string[]) =>
    isi.forEach((h, i) => styleCell(Object.assign(ws.getCell(r, i + 1), { value: h }), { bold: true, bgColor: CLR_HEADER }));
  const tulis = (r: number, isi: (string | number)[], gaya: (i: number) => GayaSel) =>
    isi.forEach((v, i) => styleCell(Object.assign(ws.getCell(r, i + 1), { value: v }), gaya(i)));

  const kunciGrup = (b: BarisHasil) => b.grup.join("\u0001");
  const grup = [...new Map(baris.map((b) => [kunciGrup(b), b.grup])).entries()];

  // Ringkasan per grup.
  let r = 3;
  kepala(r, [...namaGrup, "Tiang", "Sudah dinilai", "Tiang bertemuan", "Jumlah temuan"]);
  const tot = [0, 0, 0, 0];
  grup.forEach(([k, nilaiGrup], n) => {
    const bs = baris.filter((b) => kunciGrup(b) === k);
    const angka = [bs.length, bs.filter((b) => b.dinilai).length, bs.filter((b) => b.temuan.length).length,
      bs.reduce((s, b) => s + b.temuan.length, 0)];
    angka.forEach((v, i) => (tot[i] += v));
    const latar = n % 2 === 0 ? CLR_WHITE : SELANG;
    tulis(++r, [...nilaiGrup, ...angka], (i) => ({ align: i < g ? "left" : "center", bgColor: latar }));
  });
  tulis(++r, [...namaGrup.map((_, i) => (i === 0 ? "JUMLAH" : "")), ...tot], () => ({ bold: true, bgColor: CLR_TEAL }));

  // Rincian grup × isian × keadaan.
  r += 2;
  kepala(r, [...namaGrup, "Kelompok", "Isian", "Keadaan", "Jumlah tiang", "Tiang"]);
  let n = 0;
  for (const [k, nilaiGrup] of grup) {
    const kumpul = new Map<string, TemuanHasil & { tiang: string[] }>();
    for (const b of baris.filter((x) => kunciGrup(x) === k)) {
      for (const t of b.temuan) {
        const kunci = `${t.kelompok}|${t.isian}|${t.keadaan}`;
        const ada = kumpul.get(kunci) ?? { ...t, tiang: [] };
        if (!ada.tiang.includes(t.nama)) ada.tiang.push(t.nama);
        kumpul.set(kunci, ada);
      }
    }
    if (kumpul.size === 0) {
      r++;
      mergeSet(ws, r, 1, r, g + 5, `${nilaiGrup.join(" · ")} — tidak ada temuan`, { align: "left", fontColor: REDUP });
      continue;
    }
    // Urutan kolom isiannya di sheet 1, lalu yang paling banyak tiangnya.
    const posisi = (t: TemuanHasil) => {
      const i = kolom.findIndex((x) => x.kelompok === t.kelompok && x.judul === t.isian);
      return i < 0 ? kolom.length : i;
    };
    for (const t of [...kumpul.values()].sort((a, b) => posisi(a) - posisi(b) || b.tiang.length - a.tiang.length)) {
      const latar = n++ % 2 === 0 ? CLR_WHITE : SELANG;
      tulis(++r, [...nilaiGrup, t.kelompok, t.isian, t.keadaan, t.tiang.length, t.tiang.join(", ")], (i) => ({
        align: i === g + 3 ? "center" : "left",
        bgColor: i === g + 2 ? KUNING : latar,
      }));
    }
  }
}
