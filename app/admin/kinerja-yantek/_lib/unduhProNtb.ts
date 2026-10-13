import ExcelJS from "exceljs";
import { CLR_HEADER, downloadBuffer, styleCell } from "@/lib/xlsxGaya";
import { KOLOM_PRO_NTB, selPro, type BarisPro } from "./proNtb";

/**
 * Unduhan Excel Copy to PRO NTB — 14 kolom laporan harian UIW. TANGGAL
 * ditulis sebagai TEKS "02 Januari 2024" supaya bentuknya tidak diubah Excel;
 * WORK ORDER & REALISASI sebagai angka. Dimuat lewat import() saat tombol
 * ditekan — exceljs berukuran ratusan KB.
 */

const LEBAR = [5, 18, 10, 14, 16, 30, 46, 14, 22, 16, 12, 9, 12, 12];
const KIRI = new Set([5, 6, 8]);

export async function unduhProNtb(baris: BarisPro[], noAwal: number, timDari: (b: BarisPro) => string, namaBerkas: string) {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("PRO NTB", { views: [{ state: "frozen", ySplit: 1 }] });
  LEBAR.forEach((w, i) => (ws.getColumn(i + 1).width = w));

  KOLOM_PRO_NTB.forEach((k, i) => styleCell(Object.assign(ws.getCell(1, i + 1), { value: k }), { bold: true, bgColor: CLR_HEADER }));

  baris.forEach((b, i) => {
    const r = i + 2;
    selPro(b, noAwal + i, timDari(b)).forEach((v, c) => {
      const cell = ws.getCell(r, c + 1);
      if (c === 0) cell.value = noAwal + i;
      else if (c >= 12) {
        cell.value = b.nilai;
        cell.numFmt = b.desimal ? "0.00" : "0";
      } else cell.value = v;
      styleCell(cell, { align: KIRI.has(c) ? "left" : "center" });
    });
  });

  await downloadBuffer(wb, namaBerkas);
}
