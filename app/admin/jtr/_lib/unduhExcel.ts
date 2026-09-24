import ExcelJS from "exceljs";
import { CLR_HEADER, CLR_WHITE, downloadBuffer, mergeSet, styleCell, type GayaSel } from "@/lib/xlsxGaya";
import { statusTampil, type InspeksiMenunggu } from "../_hooks/useApprovalJtr";
import { rentangKerja } from "./tampilan";

/** Unduhan Excel Inspeksi JTR — gaya bersama, isinya = yang tampil (butir 10). */

const KOLOM: { judul: string; lebar: number }[] = [
  { judul: "No", lebar: 4 },
  { judul: "Gardu", lebar: 10 },
  { judul: "Nama gardu", lebar: 22 },
  { judul: "ULP", lebar: 13 },
  { judul: "Penyulang", lebar: 15 },
  { judul: "WO", lebar: 8 },
  { judul: "Tgl WO", lebar: 10 },
  { judul: "Tanggal inspeksi", lebar: 20 },
  { judul: "Petugas", lebar: 22 },
  { judul: "Tiang diperiksa", lebar: 9 },
  { judul: "Tiang aktif", lebar: 8 },
  { judul: "Tiang baru", lebar: 8 },
  { judul: "Panjang (km)", lebar: 10 },
  { judul: "Temuan", lebar: 8 },
  { judul: "Status", lebar: 18 },
  { judul: "Catatan", lebar: 32 },
];

export async function unduhExcelJtr(baris: InspeksiMenunggu[], namaBerkas: string) {
  const wb = new ExcelJS.Workbook();
  wb.creator = "SMART Mataram";
  const ws = wb.addWorksheet("Inspeksi JTR", { pageSetup: { orientation: "landscape", fitToPage: true, fitToWidth: 1 } });

  KOLOM.forEach((k, i) => {
    ws.getColumn(i + 1).width = k.lebar;
    mergeSet(ws, 1, i + 1, 1, i + 1, k.judul, { bold: true, size: 9, bgColor: CLR_HEADER });
  });
  ws.getRow(1).height = 28;

  baris.forEach((d, idx) => {
    const r = 2 + idx;
    const bg = idx % 2 === 0 ? CLR_WHITE : "F5F5F5";
    const set = (col: number, val: string | number, extra?: GayaSel) => {
      const c = ws.getCell(r, col);
      c.value = val;
      styleCell(c, { bgColor: bg, size: 9, ...extra });
    };
    set(1, idx + 1);
    set(2, d.gardu_kode);
    set(3, d.gardu_nama ?? "", { align: "left" });
    set(4, d.ulp);
    set(5, d.penyulang ?? "", { align: "left" });
    set(6, "-");
    set(7, "-");
    set(8, rentangKerja(d.tgl_mulai, d.tgl_selesai));
    set(9, [d.inspektor_nama, d.petugas_2].filter(Boolean).join(", "), { align: "left" });
    set(10, d.sudah_diperiksa);
    set(11, d.tiang_aktif);
    set(12, d.tiang_baru);
    set(13, Math.round(Number(d.panjang_km ?? 0) * 1000) / 1000);
    set(14, d.sementara ? "-" : d.jumlah_temuan);
    set(15, statusTampil(d.status));
    set(16, d.verified_note ?? d.catatan ?? "", { align: "left" });
  });

  const rTotal = baris.length + 2;
  mergeSet(ws, rTotal, 1, rTotal, 12, "Total", { bold: true, size: 9, bgColor: CLR_HEADER, align: "right" });
  const c = ws.getCell(rTotal, 13);
  c.value = Math.round(baris.reduce((a, d) => a + Number(d.panjang_km ?? 0), 0) * 1000) / 1000;
  styleCell(c, { bold: true, size: 9, bgColor: CLR_HEADER });

  ws.views = [{ state: "frozen", xSplit: 3, ySplit: 1 }];
  await downloadBuffer(wb, namaBerkas);
}
