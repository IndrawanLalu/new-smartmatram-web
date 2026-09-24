import ExcelJS from "exceljs";
import { CLR_HEADER, CLR_WHITE, downloadBuffer, mergeSet, styleCell, type GayaSel } from "@/lib/xlsxGaya";
import type { BarisRabas } from "../_hooks/useDaftarPerabasan";
import { rentangKerja } from "./tampilan";

/**
 * Unduhan Excel Perabasan — gaya bersama `lib/xlsxGaya.ts` (teknisaplikasi.md
 * butir 10). Isinya PERSIS baris yang tampil, urut per penyulang. Baris total
 * km di akhir, karena itulah angka yang dibawa ke rapat.
 */

const KOLOM: { judul: string; lebar: number }[] = [
  { judul: "No", lebar: 4 },
  { judul: "ULP", lebar: 13 },
  { judul: "Penyulang", lebar: 16 },
  { judul: "Segmen", lebar: 30 },
  { judul: "Panjang (km)", lebar: 10 },
  { judul: "Asal panjang", lebar: 11 },
  { judul: "WO", lebar: 26 },
  { judul: "Tgl WO", lebar: 11 },
  { judul: "Regu", lebar: 12 },
  { judul: "Tgl pekerjaan", lebar: 20 },
  { judul: "Petugas", lebar: 18 },
  { judul: "Status", lebar: 18 },
  { judul: "Catatan", lebar: 32 },
];

export async function unduhExcelPerabasan(baris: BarisRabas[], namaBerkas: string) {
  const wb = new ExcelJS.Workbook();
  wb.creator = "SMART Mataram";
  const ws = wb.addWorksheet("Perabasan", { pageSetup: { orientation: "landscape", fitToPage: true, fitToWidth: 1 } });

  KOLOM.forEach((k, i) => {
    ws.getColumn(i + 1).width = k.lebar;
    mergeSet(ws, 1, i + 1, 1, i + 1, k.judul, { bold: true, size: 9, bgColor: CLR_HEADER });
  });
  ws.getRow(1).height = 24;

  baris.forEach((b, idx) => {
    const r = 2 + idx;
    const bg = idx % 2 === 0 ? CLR_WHITE : "F5F5F5";
    const set = (col: number, val: string | number, extra?: GayaSel) => {
      const c = ws.getCell(r, col);
      c.value = val;
      styleCell(c, { bgColor: bg, size: 9, ...extra });
    };
    set(1, idx + 1);
    set(2, b.ulp);
    set(3, b.penyulang, { align: "left" });
    set(4, b.segmenNama, { align: "left" });
    set(5, b.panjangKm ?? "");
    set(6, b.panjangDari ?? "");
    set(7, b.woNama ?? "-", { align: "left" });
    set(8, b.woTgl ?? "-");
    set(9, b.regu ?? "belum dibagi");
    set(10, rentangKerja(b.tglMulai, b.tglSelesai));
    set(11, b.petugasNama ?? "", { align: "left" });
    set(12, b.status);
    set(13, b.verifiedNote ?? b.catatan ?? "", { align: "left" });
  });

  const rTotal = baris.length + 2;
  mergeSet(ws, rTotal, 1, rTotal, 4, "Total", { bold: true, size: 9, bgColor: CLR_HEADER, align: "right" });
  const cTotal = ws.getCell(rTotal, 5);
  cTotal.value = Math.round(baris.reduce((a, b) => a + (b.panjangKm ?? 0), 0) * 100) / 100;
  styleCell(cTotal, { bold: true, size: 9, bgColor: CLR_HEADER });

  ws.views = [{ state: "frozen", xSplit: 4, ySplit: 1 }];
  await downloadBuffer(wb, namaBerkas);
}
