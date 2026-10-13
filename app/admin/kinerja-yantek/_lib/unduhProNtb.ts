import ExcelJS from "exceljs";
import { CLR_HEADER, downloadBuffer, styleCell } from "@/lib/xlsxGaya";
import { KOLOM_FORMULA, KOLOM_PRO_NTB, selPro, type BarisPro } from "./proNtb";

/**
 * Unduhan Excel Copy to PRO NTB — bentuknya sama dengan Salin: mulai kolom
 * TANGGAL, kolom yang diisi formula spreadsheet UIW dibiarkan kosong (judulnya
 * abu-abu), jadi blok A2:M… boleh disalin utuh ke sel TANGGAL. TANGGAL ditulis
 * sebagai TEKS "02 Januari 2024" supaya bentuknya tidak diubah Excel; WORK
 * ORDER & REALISASI sebagai angka. Dimuat lewat import() saat tombol ditekan —
 * exceljs berukuran ratusan KB.
 */

const LEBAR = [18, 10, 14, 16, 30, 46, 14, 22, 16, 12, 9, 12, 12];
const KIRI = new Set([4, 5, 6]);
const CLR_FORMULA = "D9D9D9";
/** WORK ORDER — bersatuan GARDU diisi rumus spreadsheet, dibiarkan kosong. */
const C_WO = 11;


export async function unduhProNtb(baris: BarisPro[], timDari: (b: BarisPro) => string, namaBerkas: string) {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("PRO NTB", { views: [{ state: "frozen", ySplit: 1 }] });
  LEBAR.forEach((w, i) => (ws.getColumn(i + 1).width = w));

  KOLOM_PRO_NTB.forEach((k, i) =>
    styleCell(Object.assign(ws.getCell(1, i + 1), { value: k }), {
      bold: true,
      bgColor: KOLOM_FORMULA.has(i) ? CLR_FORMULA : CLR_HEADER,
    }),
  );

  baris.forEach((b, i) => {
    const r = i + 2;
    selPro(b, timDari(b)).forEach((v, c) => {
      const cell = ws.getCell(r, c + 1);
      if (KOLOM_FORMULA.has(c) || (c === C_WO && !b.desimal)) return;
      if (c >= 11) {
        cell.value = b.nilai;
        cell.numFmt = b.desimal ? "0.00" : "0";
      } else cell.value = v;
      styleCell(cell, { align: KIRI.has(c) ? "left" : "center" });
    });
  });

  await downloadBuffer(wb, namaBerkas);
}
