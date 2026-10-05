import ExcelJS from "exceljs";
import { CLR_HEADER, downloadBuffer, mergeSet, styleCell } from "@/lib/xlsxGaya";
import type { GarduInfo } from "@/lib/sld";

/** Daftar gardu padam hasil simulasi lepas di Peta SLD — isinya = yang tampil di panel. */
export async function unduhGarduPadam(judul: string, ringkasan: string, gardu: GarduInfo[], namaBerkas: string) {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Gardu padam");
  ws.columns = [{ width: 5 }, { width: 11 }, { width: 38 }, { width: 9 }, { width: 11 }, { width: 9 }, { width: 13 }];
  mergeSet(ws, 1, 1, 1, 7, judul, { bold: true, size: 12, align: "left" });
  mergeSet(ws, 2, 1, 2, 7, ringkasan, { size: 9, align: "left" });
  const kepala = ["No", "Gardu", "Nama", "kVA", "Beban kVA", "Beban %", "Tgl ukur"];
  kepala.forEach((k, i) => styleCell(Object.assign(ws.getCell(4, i + 1), { value: k }), { bold: true, bgColor: CLR_HEADER }));
  gardu.forEach((g, i) => {
    const baris = [i + 1, g.kode, g.nama ?? "", g.daya, g.bebanKva, g.persen === null ? null : Math.round(g.persen), g.tglUkur ?? ""];
    baris.forEach((v, j) =>
      styleCell(Object.assign(ws.getCell(5 + i, j + 1), { value: v }), { align: j === 2 ? "left" : "center" }),
    );
  });
  await downloadBuffer(wb, namaBerkas);
}
