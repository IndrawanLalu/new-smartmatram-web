import ExcelJS from "exceljs";
import { CLR_HEADER, CLR_WHITE, downloadBuffer, mergeSet, styleCell, type GayaSel } from "@/lib/xlsxGaya";
import type { BarisPemeliharaan } from "../_hooks/usePemeliharaanJaringan";

/**
 * Unduhan Excel Pemeliharaan Jaringan — gaya bersama `lib/xlsxGaya.ts`
 * (teknisaplikasi.md butir 10). Isinya PERSIS baris yang tampil di tabel.
 * Foto ditulis sebagai tautan: dua foto per baris × ratusan baris terlalu
 * berat untuk disematkan.
 */

const KOLOM: { judul: string; lebar: number }[] = [
  { judul: "No", lebar: 4 },
  { judul: "Tanggal", lebar: 11 },
  { judul: "ULP", lebar: 13 },
  { judul: "Penyulang", lebar: 14 },
  { judul: "Jenis", lebar: 7 },
  { judul: "Kategori", lebar: 18 },
  { judul: "Pekerjaan", lebar: 36 },
  { judul: "Alamat", lebar: 26 },
  { judul: "WO", lebar: 24 },
  { judul: "Tgl WO", lebar: 11 },
  { judul: "Titik", lebar: 22 },
  { judul: "Foto Sebelum", lebar: 16 },
  { judul: "Foto Sesudah", lebar: 16 },
  { judul: "Petugas", lebar: 18 },
  { judul: "Status", lebar: 17 },
  { judul: "Diverifikasi /\ndibatalkan oleh", lebar: 18 },
  { judul: "Catatan", lebar: 30 },
];

export async function unduhExcelPemeliharaan(baris: BarisPemeliharaan[], namaBerkas: string) {
  const wb = new ExcelJS.Workbook();
  wb.creator = "SMART Mataram";
  const ws = wb.addWorksheet("Pemeliharaan Jaringan", {
    pageSetup: { orientation: "landscape", fitToPage: true, fitToWidth: 1 },
  });

  KOLOM.forEach((k, i) => {
    ws.getColumn(i + 1).width = k.lebar;
    mergeSet(ws, 1, i + 1, 1, i + 1, k.judul, { bold: true, size: 9, bgColor: CLR_HEADER });
  });
  ws.getRow(1).height = 28;

  baris.forEach((b, idx) => {
    const r = 2 + idx;
    const bg = idx % 2 === 0 ? CLR_WHITE : "F5F5F5";
    const set = (col: number, val: string | number, extra?: GayaSel) => {
      const c = ws.getCell(r, col);
      c.value = val;
      styleCell(c, { bgColor: bg, size: 9, ...extra });
    };
    const tautan = (col: number, url: string) => {
      const c = ws.getCell(r, col);
      styleCell(c, { bgColor: bg, size: 9, fontColor: "0563C1" });
      if (url) c.value = { text: "buka foto", hyperlink: url };
    };
    const titik = b.lat !== null && b.lng !== null ? `${b.lat.toFixed(5)}, ${b.lng.toFixed(5)}` : "";

    set(1, idx + 1);
    set(2, b.tgl);
    set(3, b.ulp);
    set(4, b.penyulang, { align: "left" });
    set(5, b.jenis);
    set(6, b.kategoriLabel ?? b.kategori, { align: "left" });
    set(7, b.pekerjaan, { align: "left" });
    set(8, b.alamat ?? "", { align: "left" });
    set(9, b.woLabel ?? "-", { align: "left" });
    set(10, b.woTgl ? b.woTgl.slice(0, 10) : "-");
    set(11, titik);
    tautan(12, b.fotoSebelum);
    tautan(13, b.fotoSesudah);
    set(14, b.petugasNama ?? "", { align: "left" });
    set(15, b.status);
    set(16, b.verifiedBy ?? "", { align: "left" });
    set(17, b.catatan ?? "", { align: "left" });
  });

  ws.views = [{ state: "frozen", xSplit: 4, ySplit: 1 }];
  await downloadBuffer(wb, namaBerkas);
}
