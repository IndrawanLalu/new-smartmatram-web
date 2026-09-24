import ExcelJS from "exceljs";
import { CLR_HEADER, CLR_WHITE, downloadBuffer, mergeSet, styleCell, type GayaSel } from "@/lib/xlsxGaya";
import { statusTampil, type PemeliharaanMenunggu } from "../_hooks/useHargarduApproval";
import { rentangKerja, tgl } from "../_components/TabelHargardu";

/** Unduhan Excel Pemeliharaan Gardu — gaya bersama, isinya = yang tampil (butir 10). */

const KOLOM: { judul: string; lebar: number }[] = [
  { judul: "No", lebar: 4 },
  { judul: "Gardu", lebar: 10 },
  { judul: "Nama gardu", lebar: 22 },
  { judul: "ULP", lebar: 13 },
  { judul: "Penyulang", lebar: 15 },
  { judul: "WO", lebar: 10 },
  { judul: "Tgl WO", lebar: 12 },
  { judul: "Tgl pekerjaan", lebar: 20 },
  { judul: "Regu", lebar: 26 },
  { judul: "Tidak normal", lebar: 9 },
  { judul: "Koreksi master\nmenunggu", lebar: 11 },
  { judul: "Foto", lebar: 9 },
  { judul: "Status", lebar: 18 },
  { judul: "Catatan", lebar: 32 },
];

export async function unduhExcelHargardu(baris: PemeliharaanMenunggu[], namaBerkas: string) {
  const wb = new ExcelJS.Workbook();
  wb.creator = "SMART Mataram";
  const ws = wb.addWorksheet("Pemeliharaan Gardu", { pageSetup: { orientation: "landscape", fitToPage: true, fitToWidth: 1 } });

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
    const jadwal = d.sumber === "jadwal";
    set(1, idx + 1);
    set(2, d.gardu_kode);
    set(3, d.gardu_nama ?? "", { align: "left" });
    set(4, d.ulp);
    set(5, d.penyulang ?? "", { align: "left" });
    set(6, jadwal ? "Jadwal" : "-");
    set(7, jadwal ? tgl(d.tgl_rencana) : "-");
    set(8, rentangKerja(d.tgl_padam, d.tgl_selesai));
    set(9, [...(d.regu_1 ?? []), ...(d.regu_2 ?? [])].join(", ") || (d.petugas_nama ?? ""), { align: "left" });
    set(10, d.item_tidak_normal);
    set(11, d.usulan_menunggu);
    set(12, `${d.jumlah_foto}/${d.foto_wajib}`);
    set(13, statusTampil(d.status));
    set(14, d.verified_note ?? d.catatan_perbaikan ?? "", { align: "left" });
  });

  ws.views = [{ state: "frozen", xSplit: 3, ySplit: 1 }];
  await downloadBuffer(wb, namaBerkas);
}
