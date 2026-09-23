import type ExcelJS from "exceljs";

/**
 * Gaya bersama unduhan Excel — satu tampilan untuk semua rekap.
 *
 * Dipindah dari `pengukuran-gardu/_utils/downloadXlsx.ts` saat Optimasi Trafo
 * butuh unduhan yang modelnya sama. Warna dan garis di satu tempat, supaya dua
 * berkas Excel dari aplikasi yang sama tidak terlihat seperti buatan dua orang.
 */

export const CLR_PINK   = "F8BBD9";
export const CLR_TEAL   = "B2DFDB";
export const CLR_GREEN  = "C8E6C9";
export const CLR_HEADER = "FFD966";
export const CLR_BORDER = "BDBDBD";
export const CLR_WHITE  = "FFFFFF";

export interface GayaSel {
  bold?: boolean;
  size?: number;
  bgColor?: string;
  fontColor?: string;
  align?: ExcelJS.Alignment["horizontal"];
  wrap?: boolean;
}

export function styleCell(c: ExcelJS.Cell, opts: GayaSel) {
  c.font = { bold: opts.bold ?? false, size: opts.size ?? 9, color: { argb: "FF" + (opts.fontColor ?? "000000") } };
  if (opts.bgColor) {
    c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF" + opts.bgColor } };
  }
  c.alignment = { horizontal: opts.align ?? "center", vertical: "middle", wrapText: opts.wrap ?? true };
  c.border = {
    top:    { style: "thin", color: { argb: "FF" + CLR_BORDER } },
    left:   { style: "thin", color: { argb: "FF" + CLR_BORDER } },
    bottom: { style: "thin", color: { argb: "FF" + CLR_BORDER } },
    right:  { style: "thin", color: { argb: "FF" + CLR_BORDER } },
  };
}

export function mergeSet(
  ws: ExcelJS.Worksheet,
  r1: number, c1: number, r2: number, c2: number,
  value: string,
  opts: GayaSel,
) {
  if (r1 !== r2 || c1 !== c2) ws.mergeCells(r1, c1, r2, c2);
  const cell = ws.getCell(r1, c1);
  cell.value = value;
  styleCell(cell, opts);
}

export async function downloadBuffer(wb: ExcelJS.Workbook, filename: string) {
  const buffer = await wb.xlsx.writeBuffer();
  const blob = new Blob([buffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const url = URL.createObjectURL(blob);
  const a   = document.createElement("a");
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}
